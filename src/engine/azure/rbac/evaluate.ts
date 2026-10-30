/**
 * Azure RBAC evaluation. Deny first, then union of assignments, with
 * notActions subtracted inside one permission entry. Conditions are not
 * evaluated. See docs/RBAC.md section 5.
 */

import { canonicalId } from "../ids";
import { ancestorScopes } from "../rules";
import type { DenyAssignment, RoleDefinition, RolePermission, World } from "../types";
import { findBuiltInRole } from "./dataset";
import { firstMatch } from "./match";

export type AccessPlane = "control" | "data";

export interface AccessRequest {
  principalId: string;
  action: string;
  plane: AccessPlane;
  scope: string;
}

export type AccessReason =
  | { kind: "granted-by"; assignmentId: string; roleId: string; matchedPattern: string; inheritedFrom: string | null }
  | { kind: "excluded-by-notaction"; roleId: string; pattern: string }
  | { kind: "denied-by-deny-assignment"; denyId: string }
  | { kind: "no-assignment" }
  | { kind: "condition-not-evaluated"; assignmentId: string; roleId: string }
  | { kind: "permissions-not-published"; roleId: string };

export interface AccessDecision {
  decision: "allowed" | "denied" | "conditional";
  plane: AccessPlane;
  action: string;
  scope: string;
  principal: string;
  reasons: AccessReason[];
  hints: string[];
}

export function findRole(world: World, idOrName: string): RoleDefinition | undefined {
  const guid = idOrName.split("/").pop()?.toLowerCase() ?? idOrName.toLowerCase();
  const custom = Object.values(world.roleDefinitions).find(
    (role) => role.name.toLowerCase() === guid || role.id.toLowerCase() === idOrName.toLowerCase() || role.roleName.toLowerCase() === idOrName.toLowerCase(),
  );
  return custom ?? findBuiltInRole(idOrName);
}

/** The principal plus every group that contains them, transitively. */
export function principalClosure(world: World, principalId: string): Set<string> {
  const set = new Set<string>([principalId.toLowerCase()]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const group of Object.values(world.directory.groups)) {
      if (set.has(group.id.toLowerCase())) continue;
      if (group.members.some((member) => set.has(member.toLowerCase()))) {
        set.add(group.id.toLowerCase());
        grew = true;
      }
    }
  }
  return set;
}

function planeLists(permission: RolePermission, plane: AccessPlane): { allow: string[]; deny: string[] } {
  if (plane === "data") return { allow: permission.dataActions, deny: permission.notDataActions };
  return { allow: permission.actions, deny: permission.notActions };
}

function denyLists(deny: DenyAssignment, plane: AccessPlane): { allow: string[]; deny: string[] } {
  if (plane === "data") return { allow: deny.dataActions, deny: deny.notDataActions };
  return { allow: deny.actions, deny: deny.notActions };
}

function principalHits(ids: string[], closure: Set<string>): boolean {
  return ids.some((id) => closure.has(id.toLowerCase()));
}

export function evaluateAccess(world: World, request: AccessRequest): AccessDecision {
  const closure = principalClosure(world, request.principalId);
  const ancestors = ancestorScopes(world, request.scope).map(canonicalId);
  const ancestorSet = new Set(ancestors);
  const reasons: AccessReason[] = [];
  const hints: string[] = [];

  for (const deny of Object.values(world.denyAssignments)) {
    const denyScope = canonicalId(deny.scope);
    if (!ancestorSet.has(denyScope)) continue;
    if (deny.doNotApplyToChildScopes && canonicalId(request.scope) !== denyScope) continue;
    const excluded = principalHits(deny.excludePrincipals, closure);
    const included = deny.appliesToAllPrincipals || principalHits(deny.principals, closure);
    if (!included || excluded) continue;
    const lists = denyLists(deny, request.plane);
    if (firstMatch(request.action, lists.allow) && !firstMatch(request.action, lists.deny)) {
      return {
        decision: "denied",
        plane: request.plane,
        action: request.action,
        scope: request.scope,
        principal: request.principalId,
        reasons: [{ kind: "denied-by-deny-assignment", denyId: deny.id }],
        hints,
      };
    }
  }

  let conditional = false;
  for (const assignment of Object.values(world.roleAssignments)) {
    if (!closure.has(assignment.principalId.toLowerCase())) continue;
    if (!ancestorSet.has(canonicalId(assignment.scope))) continue;
    const role = findRole(world, assignment.roleDefinitionId);
    if (!role) continue;
    if (!role.permissionsPublished) {
      reasons.push({ kind: "permissions-not-published", roleId: role.id });
      hints.push(`${role.roleName} is listed on Learn, but Learn does not publish its actions, so this sandbox does not treat it as a grant.`);
      continue;
    }
    const inheritedFrom = canonicalId(assignment.scope) === canonicalId(request.scope) ? null : assignment.scope;
    for (const permission of role.permissions) {
      const lists = planeLists(permission, request.plane);
      const matched = firstMatch(request.action, lists.allow);
      if (!matched) continue;
      const excluded = firstMatch(request.action, lists.deny);
      if (excluded) {
        reasons.push({ kind: "excluded-by-notaction", roleId: role.id, pattern: excluded });
        if (excluded.toLowerCase() === "microsoft.authorization/*/write") {
          hints.push(`${role.roleName} excludes ${excluded}, so it cannot assign roles.`);
        }
        continue;
      }
      if (permission.condition || assignment.condition) {
        conditional = true;
        reasons.push({ kind: "condition-not-evaluated", assignmentId: assignment.id, roleId: role.id });
        continue;
      }
      reasons.push({ kind: "granted-by", assignmentId: assignment.id, roleId: role.id, matchedPattern: matched, inheritedFrom });
    }
  }

  if (reasons.some((reason) => reason.kind === "granted-by")) {
    return { decision: "allowed", plane: request.plane, action: request.action, scope: request.scope, principal: request.principalId, reasons, hints };
  }
  if (conditional) {
    return { decision: "conditional", plane: request.plane, action: request.action, scope: request.scope, principal: request.principalId, reasons, hints };
  }
  reasons.push({ kind: "no-assignment" });
  return { decision: "denied", plane: request.plane, action: request.action, scope: request.scope, principal: request.principalId, reasons, hints };
}

export function authorizationMessage(displayName: string, objectId: string, action: string, scope: string): string {
  const base = `The client '${displayName}' with object id '${objectId}' does not have authorization to perform action '${action}' over scope '${scope}' or the scope is invalid.`;
  if (action.toLowerCase().includes("microsoft.authorization/roleassignments/")) {
    return `${base} If access was recently granted, please refresh your credentials.`;
  }
  return base;
}
