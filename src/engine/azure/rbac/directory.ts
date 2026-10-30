/**
 * Directory objects, role assignments, custom roles and elevate access.
 * Azure operations are applied after the pipeline authorizes them.
 * Directory writes require Global Administrator. See docs/RBAC.md sections 3 and 7.
 */

import { failure, success, type EngineError, type Result } from "../../core/result";
import { canonicalId, parseId } from "../ids";
import { LEARN } from "../learn";
import { ancestorScopes } from "../rules";
import type {
  DirectoryServicePrincipal,
  DirectoryUser,
  RoleAssignment,
  RoleDefinition,
  RolePermission,
  World,
} from "../types";
import { findBuiltInRole } from "./dataset";
import { evaluateAccess, findRole } from "./evaluate";
import { wildcardCount } from "./match";

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function findActor(world: World, principalId: string): { id: string; displayName: string } | null {
  const key = principalId.toLowerCase();
  const user = Object.values(world.directory.users).find((item) => item.id.toLowerCase() === key);
  if (user) return user;
  const servicePrincipal = Object.values(world.directory.servicePrincipals).find((item) => item.id.toLowerCase() === key);
  if (servicePrincipal) return servicePrincipal;
  return null;
}

function clone(world: World): World {
  return structuredClone(world);
}

function isGlobalAdmin(world: World, principalId: string): boolean {
  const user = Object.values(world.directory.users).find((item) => item.id.toLowerCase() === principalId.toLowerCase());
  return user?.directoryRoles.includes("Global Administrator") ?? false;
}

function entraDenied(): EngineError {
  return {
    code: "AuthorizationFailed",
    message: "This directory action needs the Microsoft Entra Global Administrator role. An Azure role does not grant it. (sandbox wording)",
    step: "authorize",
    learnUrl: LEARN.entraRoles,
  };
}

function requireGuid(value: string, label: string): EngineError | null {
  if (GUID.test(value)) return null;
  return {
    code: "InvalidName",
    message: `${label} must be a GUID.`,
    step: "validate",
    learnUrl: LEARN.roleAssignments,
  };
}

function scopeCovers(world: World, scope: string, assignable: string): boolean {
  if (assignable === "/") return true;
  const ancestors = new Set(ancestorScopes(world, scope).map(canonicalId));
  return ancestors.has(canonicalId(assignable));
}

function principalTypeOf(world: World, principalId: string): RoleAssignment["principalType"] | null {
  const key = principalId.toLowerCase();
  if (Object.values(world.directory.users).some((item) => item.id.toLowerCase() === key)) return "User";
  if (Object.values(world.directory.groups).some((item) => item.id.toLowerCase() === key)) return "Group";
  if (Object.values(world.directory.servicePrincipals).some((item) => item.id.toLowerCase() === key)) return "ServicePrincipal";
  return null;
}

export interface AssignmentInput {
  name: string;
  principalId: string;
  roleDefinitionId: string;
  scope: string;
  description?: string;
  condition?: string;
}

export function applyAssignment(world: World, input: AssignmentInput): { world: World } | { error: EngineError } {
  const guidError = requireGuid(input.name, "A role assignment name");
  if (guidError) return { error: guidError };
  const principalType = principalTypeOf(world, input.principalId);
  if (!principalType) {
    return {
      error: {
        code: "PrincipalNotFound",
        message: `Principal ${input.principalId} is not in this directory. (sandbox wording)`,
        step: "validate",
        learnUrl: LEARN.roleAssignments,
      },
    };
  }
  const role = findRole(world, input.roleDefinitionId);
  if (!role) {
    return {
      error: {
        code: "RoleDefinitionNotFound",
        message: `Role definition ${input.roleDefinitionId} was not found. (sandbox wording)`,
        step: "validate",
        learnUrl: LEARN.roleDefinitions,
      },
    };
  }
  if (!role.assignableInSandbox) {
    return {
      error: {
        code: "RoleNotAssignable",
        message: `${role.roleName} is not assignable in this sandbox. Its scope is not a management group, subscription, resource group or resource.`,
        step: "validate",
        learnUrl: LEARN.builtInRoles,
      },
    };
  }
  if (!role.assignableScopes.some((scope) => scopeCovers(world, input.scope, scope))) {
    return {
      error: {
        code: "RoleNotAssignable",
        message: `${role.roleName} can only be assigned inside its assignable scopes.`,
        step: "validate",
        learnUrl: LEARN.roleDefinitions,
      },
    };
  }
  const hasDataActions = role.permissions.some((entry) => entry.dataActions.length > 0);
  if (role.roleType === "CustomRole" && hasDataActions && parseId(input.scope)?.managementGroup) {
    return {
      error: {
        code: "InvalidRoleAssignment",
        message: "A custom role with DataActions cannot be assigned at management group scope.",
        step: "validate",
        learnUrl: LEARN.customRoles,
      },
    };
  }
  if ((input.description?.length ?? 0) > 2048) {
    return {
      error: {
        code: "InvalidRoleAssignment",
        message: "A role assignment description can be at most 2,048 characters.",
        step: "validate",
        learnUrl: LEARN.limits,
      },
    };
  }
  const parsed = parseId(input.scope);
  if (parsed?.subscriptionId) {
    const count = Object.values(world.roleAssignments).filter((assignment) => parseId(assignment.scope)?.subscriptionId?.toLowerCase() === parsed.subscriptionId?.toLowerCase()).length;
    if (count >= 5000) {
      return {
        error: {
          code: "RoleAssignmentLimitExceeded",
          message: "A subscription can have 5,000 role assignments. Management group assignments are not counted in that limit.",
          step: "validate",
          learnUrl: LEARN.limits,
        },
      };
    }
  }
  if (parsed?.managementGroup) {
    const count = Object.values(world.roleAssignments).filter((assignment) => canonicalId(assignment.scope) === canonicalId(input.scope)).length;
    if (count >= 500) {
      return {
        error: {
          code: "RoleAssignmentLimitExceeded",
          message: "A management group can have 500 role assignments.",
          step: "validate",
          learnUrl: LEARN.limits,
        },
      };
    }
  }
  const id = `${input.scope.replace(/\/$/, "")}/providers/Microsoft.Authorization/roleAssignments/${input.name}`;
  const next = clone(world);
  const assignment: RoleAssignment = {
    id,
    name: input.name,
    principalId: input.principalId,
    principalType,
    roleDefinitionId: role.id,
    scope: input.scope,
    createdOn: world.clock,
    ...(input.description ? { description: input.description } : {}),
    ...(input.condition ? { condition: input.condition } : {}),
  };
  next.roleAssignments[canonicalId(id)] = assignment;
  return { world: next };
}

export function applyDeleteAssignment(world: World, idOrName: string): { world: World } | { error: EngineError } {
  const existing = Object.values(world.roleAssignments).find(
    (assignment) => assignment.name.toLowerCase() === idOrName.toLowerCase() || canonicalId(assignment.id) === canonicalId(idOrName),
  );
  if (!existing) {
    return {
      error: {
        code: "RoleAssignmentNotFound",
        message: `Role assignment ${idOrName} was not found. (sandbox wording)`,
        step: "validate",
        learnUrl: LEARN.roleAssignments,
      },
    };
  }
  const next = clone(world);
  delete next.roleAssignments[canonicalId(existing.id)];
  return { world: next };
}

export interface CustomRoleInput {
  name: string;
  roleName: string;
  description: string;
  assignableScopes: string[];
  permissions: RolePermission[];
}

export function applyCustomRole(world: World, input: CustomRoleInput): { world: World } | { error: EngineError } {
  const guidError = requireGuid(input.name, "A custom role id");
  if (guidError) return { error: guidError };
  if (findRole(world, input.name) || findBuiltInRole(input.roleName)) {
    return {
      error: {
        code: "RoleDefinitionExists",
        message: "A role id does not change, and a custom role name must be unique in the tenant.",
        step: "validate",
        learnUrl: LEARN.customRoles,
      },
    };
  }
  if (Object.values(world.roleDefinitions).some((role) => role.roleName.toLowerCase() === input.roleName.toLowerCase())) {
    return {
      error: {
        code: "RoleDefinitionExists",
        message: "A custom role name must be unique in the tenant.",
        step: "validate",
        learnUrl: LEARN.customRoles,
      },
    };
  }
  if (input.roleName.length === 0 || input.roleName.length > 512) {
    return {
      error: {
        code: "InvalidRoleDefinition",
        message: "A custom role name can be at most 512 characters.",
        step: "validate",
        learnUrl: LEARN.customRoles,
      },
    };
  }
  if (input.description.length > 2048) {
    return {
      error: {
        code: "InvalidRoleDefinition",
        message: "A custom role description can be at most 2,048 characters.",
        step: "validate",
        learnUrl: LEARN.customRoles,
      },
    };
  }
  if (input.assignableScopes.length === 0 || input.assignableScopes.length > 2000) {
    return {
      error: {
        code: "InvalidRoleDefinition",
        message: "AssignableScopes needs at least one scope and at most 2,000.",
        step: "validate",
        learnUrl: LEARN.customRoles,
      },
    };
  }
  if (input.assignableScopes.some((scope) => scope === "/" || scope.includes("*"))) {
    return {
      error: {
        code: "InvalidRoleDefinition",
        message: "AssignableScopes cannot be / and cannot contain a wildcard.",
        step: "validate",
        learnUrl: LEARN.customRoles,
      },
    };
  }
  const managementGroups = input.assignableScopes.filter((scope) => parseId(scope)?.managementGroup);
  if (managementGroups.length > 1) {
    return {
      error: {
        code: "InvalidRoleDefinition",
        message: "A custom role can include at most one management group in AssignableScopes.",
        step: "validate",
        learnUrl: LEARN.customRoles,
      },
    };
  }
  const actions = input.permissions.flatMap((entry) => entry.actions);
  if (actions.length === 0) {
    return {
      error: {
        code: "InvalidRoleDefinition",
        message: "A custom role needs at least one action.",
        step: "validate",
        learnUrl: LEARN.customRoles,
      },
    };
  }
  const patterns = input.permissions.flatMap((entry) => [...entry.actions, ...entry.notActions, ...entry.dataActions, ...entry.notDataActions]);
  if (patterns.some((pattern) => wildcardCount(pattern) > 1)) {
    return {
      error: {
        code: "InvalidRoleDefinition",
        message: "You can have only one wildcard in an action string.",
        step: "validate",
        learnUrl: LEARN.customRoles,
      },
    };
  }
  if (Object.keys(world.roleDefinitions).length >= 5000) {
    return {
      error: {
        code: "RoleDefinitionLimitExceeded",
        message: "A tenant can have 5,000 custom roles.",
        step: "validate",
        learnUrl: LEARN.limits,
      },
    };
  }
  const id = `/providers/Microsoft.Authorization/roleDefinitions/${input.name}`;
  const role: RoleDefinition = {
    id,
    name: input.name,
    roleName: input.roleName,
    description: input.description,
    roleType: "CustomRole",
    assignableScopes: input.assignableScopes,
    permissions: input.permissions.map((entry) => ({
      actions: entry.actions,
      notActions: entry.notActions ?? [],
      dataActions: entry.dataActions ?? [],
      notDataActions: entry.notDataActions ?? [],
      ...(entry.condition != null ? { condition: entry.condition } : {}),
      ...(entry.conditionVersion != null ? { conditionVersion: entry.conditionVersion } : {}),
    })),
    source: "custom",
    permissionsPublished: true,
    assignableInSandbox: true,
  };
  const next = clone(world);
  next.roleDefinitions[canonicalId(id)] = role;
  return { world: next };
}

export function applyDeleteCustomRole(world: World, idOrName: string): { world: World } | { error: EngineError } {
  const role = Object.values(world.roleDefinitions).find(
    (item) => item.name.toLowerCase() === idOrName.toLowerCase() || item.roleName.toLowerCase() === idOrName.toLowerCase() || canonicalId(item.id) === canonicalId(idOrName),
  );
  if (!role || role.roleType !== "CustomRole") {
    return {
      error: {
        code: "RoleDefinitionNotFound",
        message: `Custom role ${idOrName} was not found. (sandbox wording)`,
        step: "validate",
        learnUrl: LEARN.customRoles,
      },
    };
  }
  const used = Object.values(world.roleAssignments).some((assignment) => canonicalId(assignment.roleDefinitionId) === canonicalId(role.id));
  if (used) {
    return {
      error: {
        code: "RoleDefinitionHasAssignments",
        message: "Remove any role assignments that use the custom role first.",
        step: "validate",
        learnUrl: LEARN.customRoles,
      },
    };
  }
  const next = clone(world);
  delete next.roleDefinitions[canonicalId(role.id)];
  return { world: next };
}

const USER_ACCESS_ADMINISTRATOR = "18d7d88d-d35e-4fb5-a5c3-7773c20a72d9";

export function elevateAccess(world: World, assignmentName: string): Result<World> {
  const trace = [{ step: "parse", ok: true as const }];
  const actor = findActor(world, world.session.actingPrincipalId);
  if (!actor) {
    return failure(trace, {
      code: "AuthenticationFailed",
      message: "The acting identity is not in this directory. (sandbox wording)",
      step: "authenticate",
    });
  }
  if (!isGlobalAdmin(world, actor.id)) {
    return failure(trace, entraDenied());
  }
  const guidError = requireGuid(assignmentName, "A role assignment name");
  if (guidError) return failure([...trace, { step: "authenticate", ok: true }], guidError);
  const role = findBuiltInRole(USER_ACCESS_ADMINISTRATOR);
  if (!role) {
    return failure(trace, {
      code: "RoleDefinitionNotFound",
      message: "User Access Administrator is not in the built-in role dataset.",
      step: "validate",
      learnUrl: LEARN.elevate,
    });
  }
  const already = Object.values(world.roleAssignments).find(
    (assignment) =>
      assignment.principalId.toLowerCase() === actor.id.toLowerCase() &&
      canonicalId(assignment.roleDefinitionId) === canonicalId(role.id) &&
      assignment.scope === "/",
  );
  if (already) return success([...trace, { step: "authenticate", ok: true }, { step: "apply", ok: true }], world);
  const applied = applyAssignment(world, {
    name: assignmentName,
    principalId: actor.id,
    roleDefinitionId: role.id,
    scope: "/",
    description: "Access management for Azure resources",
  });
  if ("error" in applied) return failure([...trace, { step: "authenticate", ok: true }], applied.error);
  return success(
    [...trace, { step: "authenticate", ok: true }, { step: "authorize", ok: true, detail: "Global Administrator" }, { step: "apply", ok: true }],
    applied.world,
  );
}

export function clearElevatedAccess(world: World): Result<World> {
  const actor = findActor(world, world.session.actingPrincipalId);
  const trace = [{ step: "parse", ok: true as const }];
  if (!actor) {
    return failure(trace, {
      code: "AuthenticationFailed",
      message: "The acting identity is not in this directory. (sandbox wording)",
      step: "authenticate",
    });
  }
  const role = findBuiltInRole(USER_ACCESS_ADMINISTRATOR);
  const next = clone(world);
  for (const [key, assignment] of Object.entries(next.roleAssignments)) {
    if (assignment.principalId.toLowerCase() !== actor.id.toLowerCase()) continue;
    if (assignment.scope !== "/") continue;
    if (role && canonicalId(assignment.roleDefinitionId) !== canonicalId(role.id)) continue;
    if (assignment.description !== "Access management for Azure resources") continue;
    delete next.roleAssignments[key];
  }
  return success([...trace, { step: "apply", ok: true }], next);
}

export function setActingPrincipal(world: World, principalId: string): Result<World> {
  const actor = findActor(world, principalId);
  if (!actor) {
    return failure([{ step: "parse", ok: true }], {
      code: "PrincipalNotFound",
      message: `Principal ${principalId} is not a user or service principal in this directory. (sandbox wording)`,
      step: "authenticate",
      learnUrl: LEARN.entraRoles,
    });
  }
  const next = clone(world);
  next.session = { ...next.session, actingPrincipalId: actor.id };
  return success([{ step: "apply", ok: true, detail: actor.displayName }], next);
}

function requireAdmin(world: World): EngineError | null {
  const actor = findActor(world, world.session.actingPrincipalId);
  if (!actor) {
    return {
      code: "AuthenticationFailed",
      message: "The acting identity is not in this directory. (sandbox wording)",
      step: "authenticate",
    };
  }
  if (!isGlobalAdmin(world, actor.id)) return entraDenied();
  return null;
}

export function createUser(world: World, input: { id: string; displayName: string; userPrincipalName: string }): Result<World> {
  const denied = requireAdmin(world);
  if (denied) return failure([{ step: "parse", ok: true }], denied);
  const guidError = requireGuid(input.id, "A user id");
  if (guidError) return failure([{ step: "parse", ok: true }], guidError);
  const suffix = `@${world.tenant.initialDomain}`.toLowerCase();
  if (!input.userPrincipalName.toLowerCase().endsWith(suffix)) {
    return failure([{ step: "parse", ok: true }], {
      code: "InvalidUser",
      message: `The user principal name must end with @${world.tenant.initialDomain}.`,
      step: "validate",
      learnUrl: LEARN.tenant,
    });
  }
  if (principalTypeOf(world, input.id)) {
    return failure([{ step: "parse", ok: true }], {
      code: "PrincipalExists",
      message: "That object id is already in the directory. (sandbox wording)",
      step: "validate",
    });
  }
  const next = clone(world);
  const user: DirectoryUser = {
    id: input.id,
    displayName: input.displayName,
    userPrincipalName: input.userPrincipalName,
    directoryRoles: [],
  };
  next.directory.users[input.id] = user;
  return success([{ step: "apply", ok: true }], next);
}

export function createGroup(world: World, input: { id: string; displayName: string }): Result<World> {
  const denied = requireAdmin(world);
  if (denied) return failure([{ step: "parse", ok: true }], denied);
  const guidError = requireGuid(input.id, "A group id");
  if (guidError) return failure([{ step: "parse", ok: true }], guidError);
  const next = clone(world);
  next.directory.groups[input.id] = { id: input.id, displayName: input.displayName, members: [] };
  return success([{ step: "apply", ok: true }], next);
}

function groupReaches(world: World, groupId: string, targetId: string, seen = new Set<string>()): boolean {
  if (seen.has(groupId.toLowerCase())) return false;
  seen.add(groupId.toLowerCase());
  const group = Object.values(world.directory.groups).find((item) => item.id.toLowerCase() === groupId.toLowerCase());
  if (!group) return false;
  for (const member of group.members) {
    if (member.toLowerCase() === targetId.toLowerCase()) return true;
    if (groupReaches(world, member, targetId, seen)) return true;
  }
  return false;
}

export function addGroupMember(world: World, groupId: string, memberId: string): Result<World> {
  const denied = requireAdmin(world);
  if (denied) return failure([{ step: "parse", ok: true }], denied);
  const group = Object.values(world.directory.groups).find((item) => item.id.toLowerCase() === groupId.toLowerCase());
  if (!group) {
    return failure([{ step: "parse", ok: true }], {
      code: "PrincipalNotFound",
      message: `Group ${groupId} was not found. (sandbox wording)`,
      step: "validate",
    });
  }
  if (!principalTypeOf(world, memberId)) {
    return failure([{ step: "parse", ok: true }], {
      code: "PrincipalNotFound",
      message: `Principal ${memberId} is not in this directory. (sandbox wording)`,
      step: "validate",
    });
  }
  if (memberId.toLowerCase() === group.id.toLowerCase() || groupReaches(world, memberId, group.id)) {
    return failure([{ step: "parse", ok: true }], {
      code: "GroupCycle",
      message: "A group cannot contain itself, directly or through another group. (sandbox wording)",
      step: "validate",
      learnUrl: LEARN.rbacOverview,
    });
  }
  const next = clone(world);
  const stored = next.directory.groups[group.id] ?? Object.values(next.directory.groups).find((item) => item.id.toLowerCase() === group.id.toLowerCase());
  if (!stored) return failure([{ step: "parse", ok: true }], { code: "PrincipalNotFound", message: "Group was not found.", step: "validate" });
  if (!stored.members.some((member) => member.toLowerCase() === memberId.toLowerCase())) stored.members.push(memberId);
  return success([{ step: "apply", ok: true }], next);
}

export function createServicePrincipal(world: World, input: { id: string; appId: string; displayName: string }): Result<World> {
  const denied = requireAdmin(world);
  if (denied) return failure([{ step: "parse", ok: true }], denied);
  const guidError = requireGuid(input.id, "A service principal id");
  if (guidError) return failure([{ step: "parse", ok: true }], guidError);
  const next = clone(world);
  const servicePrincipal: DirectoryServicePrincipal = {
    id: input.id,
    appId: input.appId,
    displayName: input.displayName,
    directoryRoles: [],
  };
  next.directory.servicePrincipals[input.id] = servicePrincipal;
  return success([{ step: "apply", ok: true }], next);
}

export function createManagedIdentity(
  world: World,
  input: { id: string; appId: string; displayName: string; kind: "system" | "user"; ownerId?: string },
): Result<World> {
  const created = createServicePrincipal(world, input);
  if (!created.ok || !created.value) return created;
  const next = created.value;
  next.directory.servicePrincipals[input.id] = {
    ...next.directory.servicePrincipals[input.id],
    managedIdentity: { kind: input.kind, ...(input.ownerId ? { ownerId: input.ownerId } : {}) },
  };
  return success(created.trace, next);
}

export function removeOwnedIdentities(world: World, ownerId: string): World {
  const next = clone(world);
  for (const [key, servicePrincipal] of Object.entries(next.directory.servicePrincipals)) {
    if (servicePrincipal.managedIdentity?.ownerId && canonicalId(servicePrincipal.managedIdentity.ownerId) === canonicalId(ownerId)) {
      delete next.directory.servicePrincipals[key];
    }
  }
  return next;
}

export function canPerform(world: World, action: string, scope: string, plane: "control" | "data" = "control") {
  return evaluateAccess(world, { principalId: world.session.actingPrincipalId, action, scope, plane });
}
