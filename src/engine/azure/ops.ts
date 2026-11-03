/**
 * Create, update, delete, and virtual machine power operations.
 * Authorization uses the RBAC evaluator. Policy evaluates deny and audit on create and update.
 */

import { failure, success, type EngineError, type Result, type TraceLine } from "../core/result";
import { LIMITS } from "./constants";
import { canonicalId, managementGroupId, parseId, resourceGroupId, resourceId, subscriptionId } from "./ids";
import { LEARN } from "./learn";
import { knownArmType, validateName, type NameContext } from "./names";
import {
  cloneWorld,
  findResourceGroup,
  findSubscription,
  lockConflict,
  providerGate,
  referencedIds,
  sameName,
  subscriptionAllows,
  validateLocation,
  validateSubnetPrefix,
  validateTags,
  validateVnetPrefixes,
} from "./rules";
import {
  applyAssignment,
  applyCustomRole,
  applyDeleteAssignment,
  applyDeleteCustomRole,
  findActor,
  removeOwnedIdentities,
  type AssignmentInput,
  type CustomRoleInput,
} from "./rbac/directory";
import { authorizationMessage, evaluateAccess } from "./rbac/evaluate";
import { preparePolicyAssignment, type PolicyAssignmentInput } from "./policy/assign";
import {
  evaluatePolicy,
  forgetPolicyStates,
  rebuildCompliance,
  replaceResourcePolicyStates,
  type PolicySubject,
} from "./policy/evaluate";
import type { PolicyState } from "./types";
import type { HttpMethod, ManagementGroup, PowerState, Resource, ResourceGroup, SubscriptionState, World } from "./types";

const CHILD_PARENT: Record<string, string> = {
  "microsoft.network/virtualnetworks/subnets": "microsoft.network/virtualnetworks",
  "microsoft.network/virtualnetworks/virtualnetworkpeerings": "microsoft.network/virtualnetworks",
  "microsoft.storage/storageaccounts/blobservices/containers": "microsoft.storage/storageaccounts",
  "microsoft.storage/storageaccounts/fileservices/shares": "microsoft.storage/storageaccounts",
};

const GLOBAL_TYPES = new Set(["microsoft.storage/storageaccounts", "microsoft.web/sites"]);

export interface EngineOptions {
  /** Zero in tests. A future UI can pass a short delay. Not an Azure number. */
  delayMs?: number;
}

function traceOk(trace: TraceLine[], step: string, detail?: string): TraceLine[] {
  return [...trace, { step, ok: true, detail }];
}

function controlAction(method: HttpMethod, armType: string): string {
  const verb = method === "GET" ? "read" : method === "DELETE" ? "delete" : method === "POST" ? "action" : "write";
  if (armType.toLowerCase() === "microsoft.resources/resourcegroups") {
    return `Microsoft.Resources/subscriptions/resourceGroups/${verb}`;
  }
  return `${armType}/${verb}`;
}

function gate(
  world: World,
  method: HttpMethod,
  scopeId: string,
  armType: string | null,
  run: (world: World) => { world: World } | { error: EngineError },
  options?: { ignoreSubscriptionState?: boolean; action?: string; policy?: PolicySubject },
): Result<World> {
  let trace: TraceLine[] = [{ step: "parse", ok: true }];
  const actor = findActor(world, world.session.actingPrincipalId);
  if (!actor) {
    return failure(trace, {
      code: "AuthenticationFailed",
      message: "The acting identity is not in this directory. (sandbox wording)",
      step: "authenticate",
    });
  }
  trace = traceOk(trace, "authenticate", actor.displayName);
  const action = options?.action ?? (armType ? controlAction(method, armType) : null);
  if (!action) {
    return failure(trace, {
      code: "InvalidAction",
      message: "This operation has no Azure action string. (sandbox wording)",
      step: "authorize",
    });
  }
  const decision = evaluateAccess(world, {
    principalId: actor.id,
    action,
    scope: scopeId,
    plane: "control",
  });
  if (decision.decision !== "allowed") {
    return failure(trace, {
      code: decision.decision === "conditional" ? "ConditionNotEvaluated" : "AuthorizationFailed",
      message:
        decision.decision === "conditional"
          ? `A role assignment for '${actor.displayName}' matches '${action}', but it has a condition and this sandbox does not evaluate conditions.`
          : authorizationMessage(actor.displayName, actor.id, action, scopeId),
      step: "authorize",
      learnUrl: decision.decision === "conditional" ? LEARN.roleDefinitions : LEARN.authorizationFailed,
    });
  }
  trace = traceOk(trace, "authorize", action);

  const parsed = parseId(scopeId);
  if (parsed?.subscriptionId && !options?.ignoreSubscriptionState) {
    const sub = findSubscription(world, parsed.subscriptionId);
    if (!sub) {
      return failure(trace, {
        code: "SubscriptionNotFound",
        message: `Subscription ${parsed.subscriptionId} was not found. (sandbox wording)`,
        step: "subscription state",
        learnUrl: LEARN.subscriptionGet,
      });
    }
    const blocked = subscriptionAllows(sub.state, method);
    if (blocked) return failure(trace, blocked);
  }
  trace = traceOk(trace, "subscription state");

  let current = world;
  if (armType && (method === "PUT" || method === "PATCH" || method === "POST")) {
    const subGuid = parsed?.subscriptionId;
    if (subGuid) {
      const gated = providerGate(current, subGuid, armType);
      if ("error" in gated) return failure(trace, gated.error);
      current = gated.world;
    }
  }
  trace = traceOk(trace, "resource provider registered?");

  const locked = lockConflict(current, scopeId, method);
  if (locked) return failure(trace, locked);
  trace = traceOk(trace, "locks");

  let policyStates: PolicyState[] | null = null;
  let policyResourceId: string | null = null;
  if (options?.policy && (method === "PUT" || method === "PATCH")) {
    const policy = evaluatePolicy(current, options.policy);
    if (policy.error) return failure(trace, policy.error);
    trace = traceOk(trace, "policy", policy.detail);
    policyStates = policy.states;
    policyResourceId = options.policy.id;
  } else {
    trace = traceOk(
      trace,
      "policy",
      method === "PUT" || method === "PATCH"
        ? "This request is not a resource or resource group write."
        : "Policy evaluates create and update requests.",
    );
  }

  const applied = run(current);
  if ("error" in applied) return failure(trace, applied.error);
  trace = traceOk(trace, "validate");
  trace = traceOk(trace, "apply");
  trace = traceOk(trace, "lifecycle");
  const written = policyResourceId ? replaceResourcePolicyStates(applied.world, policyResourceId, policyStates ?? []) : applied.world;
  return success(trace, written);
}

function mgDepth(world: World, id: string): number {
  let depth = 0;
  let current: ManagementGroup | undefined = world.managementGroups[canonicalId(id)];
  const seen = new Set<string>();
  while (current?.parentId) {
    if (seen.has(canonicalId(current.id))) return depth;
    seen.add(canonicalId(current.id));
    depth += 1;
    current = world.managementGroups[canonicalId(current.parentId)];
  }
  return depth;
}

export function createManagementGroup(
  world: World,
  input: { name: string; displayName: string; parentId?: string },
): Result<World> {
  const id = managementGroupId(input.name);
  const parentScope = input.parentId ?? managementGroupId(world.tenant.id);
  return gate(world, "PUT", parentScope, null, (current) => {
    const nameError = validateName("Microsoft.Management/managementGroups", input.name);
    if (nameError) return { error: nameError };
    const taken = Object.values(current.managementGroups).some((group) => sameName(group.name, input.name));
    if (taken) {
      return {
        error: {
          code: "ManagementGroupAlreadyExists",
          message: `A management group named ${input.name} already exists in this directory. (sandbox wording)`,
          step: "validate",
          learnUrl: LEARN.managementGroups,
        },
      };
    }
    if (Object.keys(current.managementGroups).length >= LIMITS.managementGroupsPerDirectory) {
      return {
        error: {
          code: "ManagementGroupLimit",
          message: "A directory can hold 10,000 management groups. (sandbox wording)",
          step: "validate",
          learnUrl: LEARN.limits,
        },
      };
    }
    const parentId = input.parentId ?? managementGroupId(current.tenant.id);
    const parent = current.managementGroups[canonicalId(parentId)];
    if (!parent) {
      return {
        error: {
          code: "ParentNotFound",
          message: "The parent management group was not found. (sandbox wording)",
          step: "validate",
          learnUrl: LEARN.managementGroups,
          target: parentId,
        },
      };
    }
    if (mgDepth(current, parent.id) + 1 > LIMITS.managementGroupDepth) {
      return {
        error: {
          code: "ManagementGroupDepth",
          message: "A management group tree has at most six levels below the root. (sandbox wording)",
          step: "validate",
          learnUrl: LEARN.managementGroups,
        },
      };
    }
    const next = cloneWorld(current);
    next.managementGroups[canonicalId(id)] = {
      id,
      name: input.name,
      displayName: input.displayName,
      parentId: parent.id,
      tenantId: current.tenant.id,
    };
    return { world: next };
  }, { action: "Microsoft.Management/managementGroups/write" });
}

export function deleteManagementGroup(world: World, id: string): Result<World> {
  return gate(world, "DELETE", id, null, (current) => {
    const group = current.managementGroups[canonicalId(id)];
    if (!group) {
      return { error: missing("Management group", id, LEARN.managementGroups) };
    }
    if (!group.parentId) {
      return {
        error: {
          code: "RootManagementGroup",
          message: "The Tenant root group cannot be moved or deleted. (sandbox wording)",
          step: "validate",
          learnUrl: LEARN.managementGroups,
          target: id,
        },
      };
    }
    const child = Object.values(current.managementGroups).find((item) => item.parentId && canonicalId(item.parentId) === canonicalId(group.id));
    const sub = Object.values(current.subscriptions).find((item) => canonicalId(item.parentId) === canonicalId(group.id));
    if (child || sub) {
      return {
        error: {
          code: "ManagementGroupNotEmpty",
          message: "Move the child management groups and subscriptions before deleting this group. (sandbox wording)",
          step: "validate",
          learnUrl: LEARN.managementGroups,
        },
      };
    }
    const next = cloneWorld(current);
    delete next.managementGroups[canonicalId(group.id)];
    return { world: next };
  }, { action: "Microsoft.Management/managementGroups/delete" });
}

export function createSubscription(
  world: World,
  input: { displayName: string; subscriptionId: string; parentId?: string },
): Result<World> {
  const id = subscriptionId(input.subscriptionId);
  return gate(world, "PUT", managementGroupId(world.tenant.id), null, (current) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.subscriptionId)) {
      return {
        error: {
          code: "InvalidSubscriptionId",
          message: "A subscription ID must be a GUID. (sandbox wording)",
          step: "validate",
          learnUrl: LEARN.subscriptionGet,
        },
      };
    }
    if (current.subscriptions[canonicalId(id)]) {
      return {
        error: {
          code: "SubscriptionAlreadyExists",
          message: "That subscription ID is already in this sandbox. (sandbox wording)",
          step: "validate",
          learnUrl: LEARN.subscriptionGet,
        },
      };
    }
    const parentId = input.parentId ?? managementGroupId(current.tenant.id);
    if (!current.managementGroups[canonicalId(parentId)]) {
      return {
        error: {
          code: "ParentNotFound",
          message: "The parent management group was not found. (sandbox wording)",
          step: "validate",
          learnUrl: LEARN.managementGroups,
        },
      };
    }
    const next = cloneWorld(current);
    next.subscriptions[canonicalId(id)] = {
      id,
      subscriptionId: input.subscriptionId,
      displayName: input.displayName,
      state: "Enabled",
      tenantId: current.tenant.id,
      parentId,
    };
    next.providerRegistrations[canonicalId(id)] = {};
    return { world: next };
  }, { action: "Microsoft.Management/managementGroups/subscriptions/write" });
}

export function setSubscriptionState(world: World, subGuid: string, state: SubscriptionState): Result<World> {
  const id = subscriptionId(subGuid);
  const action = state === "Disabled" || state === "Deleted" ? "Microsoft.Subscription/cancel/action" : "Microsoft.Subscription/enable/action";
  return gate(world, "POST", id, null, (current) => {
    const sub = findSubscription(current, subGuid);
    if (!sub) return { error: missing("Subscription", id, LEARN.subscriptionGet) };
    const next = cloneWorld(current);
    next.subscriptions[canonicalId(sub.id)] = { ...sub, state };
    if (state === "Disabled") {
      for (const resource of Object.values(next.resources)) {
        if (resource.subscriptionId === sub.subscriptionId && resource.type.toLowerCase() === "microsoft.compute/virtualmachines") {
          resource.properties = { ...resource.properties, powerState: "Deallocated" };
        }
      }
    }
    return { world: next };
  }, { ignoreSubscriptionState: true, action });
}

export function createResourceGroup(
  world: World,
  input: { name: string; location: string; subscriptionId?: string; tags?: Record<string, string> },
): Result<World> {
  const subGuid = input.subscriptionId ?? world.session.subscriptionId;
  const id = resourceGroupId(subGuid, input.name);
  return gate(world, "PUT", id, "Microsoft.Resources/resourceGroups", (current) => {
    const nameError = validateName("Microsoft.Resources/resourceGroups", input.name);
    if (nameError) return { error: nameError };
    const locationError = validateLocation("Microsoft.Resources/resourceGroups", input.location);
    if (locationError) return { error: locationError };
    const tagsError = validateTags(input.tags, "Microsoft.Resources/resourceGroups");
    if (tagsError) return { error: tagsError };
    const sub = findSubscription(current, subGuid);
    if (!sub) return { error: missing("Subscription", subGuid, LEARN.subscriptionGet) };
    const groups = Object.values(current.resourceGroups).filter((group) => group.subscriptionId === sub.subscriptionId);
    if (groups.some((group) => sameName(group.name, input.name))) {
      return {
        error: {
          code: "ResourceGroupAlreadyExists",
          message: `A resource group named ${input.name} already exists in this subscription. Names are case-insensitive. (sandbox wording)`,
          step: "validate",
          learnUrl: LEARN.names,
        },
      };
    }
    if (groups.length >= LIMITS.resourceGroupsPerSubscription) {
      return {
        error: {
          code: "ResourceGroupLimit",
          message: "A subscription can hold 980 resource groups. (sandbox wording)",
          step: "validate",
          learnUrl: LEARN.limits,
        },
      };
    }
    const next = cloneWorld(current);
    const group: ResourceGroup = {
      id,
      name: input.name,
      type: "Microsoft.Resources/resourceGroups",
      location: input.location.toLowerCase(),
      subscriptionId: sub.subscriptionId,
      tags: input.tags ?? {},
      provisioningState: "Succeeded",
    };
    next.resourceGroups[canonicalId(id)] = group;
    return { world: next };
  }, {
    policy: {
      id,
      name: input.name,
      type: "Microsoft.Resources/subscriptions/resourceGroups",
      location: input.location.toLowerCase(),
      tags: input.tags ?? {},
      kind: "resourceGroup",
    },
  });
}

export function updateResourceGroup(
  world: World,
  id: string,
  input: { location?: string; tags?: Record<string, string> },
): Result<World> {
  const existingGroup = world.resourceGroups[canonicalId(id)];
  return gate(world, "PATCH", id, null, (current) => {
    const group = current.resourceGroups[canonicalId(id)];
    if (!group) return { error: missing("Resource group", id, LEARN.rgGet) };
    if (input.location && input.location.toLowerCase() !== group.location.toLowerCase()) {
      return {
        error: {
          code: "LocationImmutable",
          message: "A resource group location cannot be changed after the group is created. (sandbox wording)",
          step: "validate",
          learnUrl: LEARN.rgGet,
          target: input.location,
        },
      };
    }
    const tagsError = validateTags(input.tags, group.type);
    if (tagsError) return { error: tagsError };
    const next = cloneWorld(current);
    next.resourceGroups[canonicalId(group.id)] = { ...group, tags: input.tags ?? group.tags };
    return { world: next };
  }, {
    action: "Microsoft.Resources/subscriptions/resourceGroups/write",
    policy: existingGroup
      ? {
          id: existingGroup.id,
          name: existingGroup.name,
          type: "Microsoft.Resources/subscriptions/resourceGroups",
          location: existingGroup.location,
          tags: input.tags ?? existingGroup.tags,
          kind: "resourceGroup",
        }
      : undefined,
  });
}

export interface CreateResourceInput {
  armType: string;
  name: string;
  resourceGroup: string;
  subscriptionId?: string;
  location?: string;
  tags?: Record<string, string>;
  properties?: Record<string, unknown>;
  parentName?: string;
  osType?: "Windows" | "Linux";
  kind?: string;
  sku?: { name: string };
  managedBy?: string;
}

export function createResource(world: World, input: CreateResourceInput, options: EngineOptions = {}): Result<World> {
  const subGuid = input.subscriptionId ?? world.session.subscriptionId;
  const typeKey = input.armType.toLowerCase();
  const names = input.parentName ? [input.parentName, input.name] : [input.name];
  let id = "";
  let resolved = false;
  try {
    id = resourceId(subGuid, input.resourceGroup, input.armType, names);
    resolved = true;
  } catch {
    id = resourceGroupId(subGuid, input.resourceGroup);
  }
  return gate(world, "PUT", id, input.armType, (current) => {
    if (!knownArmType(input.armType) || typeKey === "microsoft.resources/resourcegroups" || typeKey === "microsoft.management/managementgroups") {
      return {
        error: {
          code: "InvalidResourceType",
          message: `The sandbox cannot create ${input.armType} with createResource. (sandbox wording)`,
          step: "validate",
          learnUrl: LEARN.names,
        },
      };
    }
    const ctx: NameContext = { osType: input.osType };
    const nameError = validateName(input.armType, input.name, ctx);
    if (nameError) return { error: nameError };
    const group = findResourceGroup(current, subGuid, input.resourceGroup);
    if (!group) return { error: missing("Resource group", input.resourceGroup, LEARN.rgGet) };
    const location = (input.location ?? (requiresGlobal(typeKey) ? "global" : current.session.defaults.location ?? "southeastasia"));
    const locationError = validateLocation(input.armType, location);
    if (locationError) return { error: locationError };
    const tagsError = validateTags(input.tags, input.armType);
    if (tagsError) return { error: tagsError };

    const parentType = CHILD_PARENT[typeKey];
    let parent: Resource | null = null;
    if (parentType) {
      if (!input.parentName) {
        return {
          error: {
            code: "ParentRequired",
            message: `${input.armType} is created under a parent resource. (sandbox wording)`,
            step: "validate",
            learnUrl: LEARN.armOverview,
          },
        };
      }
      parent = Object.values(current.resources).find(
        (resource) =>
          resource.type.toLowerCase() === parentType &&
          sameName(resource.name, input.parentName ?? "") &&
          resource.subscriptionId === subGuid &&
          sameName(resource.resourceGroup, group.name),
      ) ?? null;
      if (!parent) {
        return {
          error: {
            code: "ParentResourceNotFound",
            message: `Parent ${input.parentName} was not found in ${group.name}. (sandbox wording)`,
            step: "validate",
            learnUrl: LEARN.armOverview,
            target: input.parentName,
          },
        };
      }
    }

    const properties = { ...(input.properties ?? {}) };
    if (typeKey === "microsoft.network/virtualnetworks") {
      const prefixes = addressList(properties);
      const cidrError = validateVnetPrefixes(prefixes);
      if (cidrError) return { error: cidrError };
    }
    if (typeKey === "microsoft.network/virtualnetworks/subnets") {
      const prefix = properties.addressPrefix;
      if (typeof prefix !== "string" || !parent) {
        return { error: cidrErrorMessage("A subnet needs an addressPrefix. (sandbox wording)") };
      }
      const siblings = Object.values(current.resources).filter(
        (resource) => resource.type.toLowerCase() === typeKey && resource.id.toLowerCase().startsWith(`${parent.id.toLowerCase()}/`),
      );
      const cidrError = validateSubnetPrefix(parent, prefix, siblings);
      if (cidrError) return { error: cidrError };
    }

    const unique = uniquenessError(current, typeKey, input.name, group, parent);
    if (unique) return { error: unique };

    const ofType = Object.values(current.resources).filter(
      (resource) => resource.subscriptionId === subGuid && sameName(resource.resourceGroup, group.name) && resource.type.toLowerCase() === typeKey,
    );
    if (ofType.length >= LIMITS.instancesPerTypePerGroup) {
      return {
        error: {
          code: "ResourceTypeLimit",
          message: "A resource group can hold 800 instances of one resource type. (sandbox wording)",
          step: "validate",
          learnUrl: LEARN.limits,
        },
      };
    }

    const resourceIdValue = parent
      ? resourceId(subGuid, group.name, input.armType, [parent.name, input.name])
      : resourceId(subGuid, group.name, input.armType, [input.name]);
    const next = cloneWorld(current);
    const resource: Resource = {
      id: resourceIdValue,
      name: input.name,
      type: input.armType,
      location: location.toLowerCase(),
      tags: input.tags ?? {},
      resourceGroup: group.name,
      subscriptionId: subGuid,
      properties: finishProvisioning(properties, typeKey, options.delayMs ?? 0, next.clock),
    };
    if (input.kind) resource.kind = input.kind;
    if (input.sku) resource.sku = input.sku;
    if (input.managedBy) resource.managedBy = input.managedBy;
    if (typeKey === "microsoft.network/virtualnetworks/virtualnetworkpeerings") {
      resource.properties.peeringState = resource.properties.peeringState ?? "Connected";
    }
    next.resources[canonicalId(resource.id)] = resource;
    const label = properties.dnsSettings && typeof properties.dnsSettings === "object"
      ? (properties.dnsSettings as { domainNameLabel?: unknown }).domainNameLabel
      : undefined;
    if (typeKey === "microsoft.network/publicipaddresses" && typeof label === "string") {
      const clash = Object.values(current.resources).find((other) => {
        if (other.type.toLowerCase() !== typeKey || other.location.toLowerCase() !== location.toLowerCase()) return false;
        const otherLabel = other.properties.dnsSettings;
        return otherLabel && typeof otherLabel === "object" && (otherLabel as { domainNameLabel?: unknown }).domainNameLabel === label;
      });
      if (clash) {
        return {
          error: {
            code: "DnsLabelAlreadyTaken",
            message: `The public IP DNS label ${label} is not available in ${location} in this sandbox. (sandbox wording)`,
            step: "validate",
            learnUrl: LEARN.publicIp,
          },
        };
      }
    }
    return { world: next };
  }, {
    policy: resolved
      ? {
          id,
          name: input.name,
          type: input.armType,
          location: (
            input.location ?? (requiresGlobal(typeKey) ? "global" : world.session.defaults.location ?? "southeastasia")
          ).toLowerCase(),
          tags: input.tags ?? {},
          kind: "resource",
        }
      : undefined,
  });
}

export function updateResource(
  world: World,
  id: string,
  input: { tags?: Record<string, string>; properties?: Record<string, unknown>; location?: string },
): Result<World> {
  const armType = parseId(id)?.armType;
  const existingResource = world.resources[canonicalId(id)];
  return gate(world, "PATCH", id, armType ?? null, (current) => {
    const existing = current.resources[canonicalId(id)];
    if (!existing) return { error: missing("Resource", id, LEARN.armOverview) };
    if (input.location && input.location.toLowerCase() !== existing.location.toLowerCase()) {
      return {
        error: {
          code: "LocationImmutable",
          message: "Moving a resource to another region is not simulated. (sandbox wording)",
          step: "validate",
          learnUrl: LEARN.regions,
        },
      };
    }
    const tagsError = validateTags(input.tags ?? existing.tags, existing.type);
    if (tagsError) return { error: tagsError };
    const properties = { ...existing.properties, ...(input.properties ?? {}) };
    const typeKey = existing.type.toLowerCase();
    if (typeKey === "microsoft.network/virtualnetworks" && input.properties?.addressSpace) {
      const cidrError = validateVnetPrefixes(addressList(properties));
      if (cidrError) return { error: cidrError };
    }
    const next = cloneWorld(current);
    next.resources[canonicalId(existing.id)] = {
      ...existing,
      tags: input.tags ?? existing.tags,
      properties: { ...properties, provisioningState: "Succeeded" },
    };
    return { world: next };
  }, {
    policy: existingResource
      ? {
          id: existingResource.id,
          name: existingResource.name,
          type: existingResource.type,
          location: existingResource.location,
          tags: input.tags ?? existingResource.tags,
          kind: "resource",
        }
      : undefined,
  });
}

export function deleteResource(world: World, id: string): Result<World> {
  return gate(world, "DELETE", id, null, (current) => {
    const existing = current.resources[canonicalId(id)];
    if (!existing) return { error: missing("Resource", id, LEARN.armOverview) };
    const blocked = deleteBlocked(current, existing);
    if (blocked) return { error: blocked };
    const next = cloneWorld(current);
    if (existing.type.toLowerCase() === "microsoft.network/virtualnetworks/virtualnetworkpeerings") {
      disconnectPeer(next, existing);
    }
    const prefix = `${canonicalId(existing.id)}/`;
    for (const key of Object.keys(next.resources)) {
      if (key === canonicalId(existing.id) || key.startsWith(prefix)) delete next.resources[key];
    }
    return { world: forgetPolicyStates(removeOwnedIdentities(next, existing.id), [existing.id]) };
  }, { action: parseId(id)?.armType ? `${parseId(id)?.armType}/delete` : undefined });
}

export function deleteResourceGroup(world: World, id: string): Result<World> {
  return gate(world, "DELETE", id, null, (current) => {
    const group = current.resourceGroups[canonicalId(id)];
    if (!group) return { error: missing("Resource group", id, LEARN.rgGet) };
    const inside = Object.values(current.resources).filter(
      (resource) => resource.subscriptionId === group.subscriptionId && sameName(resource.resourceGroup, group.name),
    );
    const insideIds = new Set(inside.map((resource) => canonicalId(resource.id)));
    for (const resource of Object.values(current.resources)) {
      if (insideIds.has(canonicalId(resource.id))) continue;
      const hit = referencedIds(resource).find((ref) => insideIds.has(canonicalId(ref)));
      if (hit) {
        return {
          error: {
            code: "ResourceGroupDeletionBlocked",
            message:
              "You can't delete a resource group while a resource outside it is connected to a resource inside. For example, you can't delete a virtual network with subnets that a virtual machine uses.",
            step: "validate",
            learnUrl: LEARN.deleteGroup,
            target: hit,
          },
        };
      }
    }
    const next = cloneWorld(current);
    for (const key of insideIds) delete next.resources[key];
    delete next.resourceGroups[canonicalId(group.id)];
    return { world: forgetPolicyStates(next, [group.id, ...inside.map((resource) => resource.id)]) };
  }, { action: "Microsoft.Resources/subscriptions/resourceGroups/delete" });
}

export function setPower(world: World, id: string, action: "start" | "stop" | "deallocate"): Result<World> {
  const verb = action === "start" ? "start" : action === "deallocate" ? "deallocate" : "powerOff";
  return gate(world, "POST", id, "Microsoft.Compute/virtualMachines", (current) => {
    const existing = current.resources[canonicalId(id)];
    if (!existing || existing.type.toLowerCase() !== "microsoft.compute/virtualmachines") {
      return { error: missing("Virtual machine", id, LEARN.vmStates) };
    }
    const power = (existing.properties.powerState as PowerState | undefined) ?? "Deallocated";
    const nextPower = nextPowerState(power, action);
    if (!nextPower) {
      return {
        error: {
          code: "InvalidPowerTransition",
          message: `Cannot ${action} a virtual machine that is ${power}. (sandbox wording)`,
          step: "validate",
          learnUrl: LEARN.vmCli,
        },
      };
    }
    const next = cloneWorld(current);
    next.resources[canonicalId(existing.id)] = {
      ...existing,
      properties: { ...existing.properties, powerState: nextPower },
    };
    return { world: next };
  }, { action: `Microsoft.Compute/virtualMachines/${verb}/action` });
}

export function registerProvider(world: World, namespace: string, subscriptionIdValue?: string): Result<World> {
  const subGuid = subscriptionIdValue ?? world.session.subscriptionId;
  const id = subscriptionId(subGuid);
  return gate(world, "POST", id, null, (current) => {
    const sub = findSubscription(current, subGuid);
    if (!sub) return { error: missing("Subscription", subGuid, LEARN.subscriptionGet) };
    const next = cloneWorld(current);
    const key = canonicalId(sub.id);
    next.providerRegistrations[key] = { ...(next.providerRegistrations[key] ?? {}), [namespace.toLowerCase()]: "Registered" };
    return { world: next };
  }, { action: `${namespace}/register/action` });
}

export function unregisterProvider(world: World, namespace: string, subscriptionIdValue?: string): Result<World> {
  const subGuid = subscriptionIdValue ?? world.session.subscriptionId;
  const id = subscriptionId(subGuid);
  return gate(world, "DELETE", id, null, (current) => {
    const inUse = Object.values(current.resources).some(
      (resource) => resource.subscriptionId === subGuid && resource.type.toLowerCase().startsWith(`${namespace.toLowerCase()}/`),
    );
    if (inUse) {
      return {
        error: {
          code: "ProviderInUse",
          message: `Cannot unregister ${namespace} while the subscription still has its resources. (sandbox wording)`,
          step: "validate",
          learnUrl: LEARN.providers,
        },
      };
    }
    const next = cloneWorld(current);
    const key = canonicalId(id);
    const table = { ...(next.providerRegistrations[key] ?? {}) };
    delete table[namespace.toLowerCase()];
    next.providerRegistrations[key] = table;
    return { world: next };
  }, { action: `${namespace}/unregister/action` });
}

export function putLock(
  world: World,
  input: { name: string; scope: string; level: "CanNotDelete" | "ReadOnly" },
): Result<World> {
  const id = `${input.scope}/providers/Microsoft.Authorization/locks/${input.name}`;
  return gate(world, "PUT", input.scope, null, (current) => {
    const nameError = validateLockName(input.name);
    if (nameError) return { error: nameError };
    const onScope = Object.values(current.locks).filter((lock) => canonicalId(lock.scope) === canonicalId(input.scope));
    if (onScope.length >= LIMITS.locksPerScope) {
      return {
        error: {
          code: "LockLimit",
          message: "A scope can have 20 management locks. (sandbox wording)",
          step: "validate",
          learnUrl: LEARN.limits,
        },
      };
    }
    const next = cloneWorld(current);
    next.locks[canonicalId(id)] = { id, name: input.name, level: input.level, scope: input.scope };
    return { world: next };
  }, { action: "Microsoft.Authorization/locks/write" });
}

export function assignPolicy(world: World, input: PolicyAssignmentInput): Result<World> {
  return gate(world, "PUT", input.scope, null, (current) => {
    const prepared = preparePolicyAssignment(current, input);
    if ("error" in prepared) return prepared;
    const next = cloneWorld(current);
    next.policyAssignments[canonicalId(prepared.assignment.id)] = prepared.assignment;
    return { world: rebuildCompliance(next) };
  }, { action: "Microsoft.Authorization/policyAssignments/write" });
}

export function deletePolicyAssignment(world: World, idOrName: string, scope: string): Result<World> {
  return gate(world, "DELETE", scope, null, (current) => {
    const key = canonicalId(idOrName);
    const found = Object.values(current.policyAssignments).find(
      (assignment) => canonicalId(assignment.id) === key || (assignment.name.toLowerCase() === idOrName.toLowerCase() && canonicalId(assignment.scope) === canonicalId(scope)),
    );
    if (!found) {
      return {
        error: {
          code: "PolicyAssignmentNotFound",
          message: `Policy assignment ${idOrName} was not found. (sandbox wording)`,
          step: "validate",
          learnUrl: LEARN.policyAssignment,
          target: idOrName,
        },
      };
    }
    const next = cloneWorld(current);
    delete next.policyAssignments[canonicalId(found.id)];
    return { world: rebuildCompliance(next) };
  }, { action: "Microsoft.Authorization/policyAssignments/delete" });
}

export function assignRole(world: World, input: AssignmentInput): Result<World> {
  return gate(world, "PUT", input.scope, null, (current) => applyAssignment(current, input), {
    action: "Microsoft.Authorization/roleAssignments/write",
  });
}

export function deleteRoleAssignment(world: World, idOrName: string, scope: string): Result<World> {
  return gate(world, "DELETE", scope, null, (current) => applyDeleteAssignment(current, idOrName), {
    action: "Microsoft.Authorization/roleAssignments/delete",
  });
}

export function createCustomRole(world: World, input: CustomRoleInput): Result<World> {
  const primary = input.assignableScopes[0] ?? "/";
  return gate(world, "PUT", primary, null, (current) => {
    for (const scope of input.assignableScopes) {
      const locked = lockConflict(current, scope, "PUT");
      if (locked) return { error: locked };
      const actor = findActor(current, current.session.actingPrincipalId);
      if (!actor) {
        return { error: { code: "AuthenticationFailed", message: "The acting identity is not in this directory. (sandbox wording)", step: "authenticate" } };
      }
      const decision = evaluateAccess(current, {
        principalId: actor.id,
        action: "Microsoft.Authorization/roleDefinitions/write",
        scope,
        plane: "control",
      });
      if (decision.decision !== "allowed") {
        return {
          error: {
            code: "AuthorizationFailed",
            message: authorizationMessage(actor.displayName, actor.id, "Microsoft.Authorization/roleDefinitions/write", scope),
            step: "authorize",
            learnUrl: LEARN.authorizationFailed,
          },
        };
      }
    }
    return applyCustomRole(current, input);
  }, { action: "Microsoft.Authorization/roleDefinitions/write" });
}

export function deleteCustomRole(world: World, idOrName: string, scope: string): Result<World> {
  return gate(world, "DELETE", scope, null, (current) => applyDeleteCustomRole(current, idOrName), {
    action: "Microsoft.Authorization/roleDefinitions/delete",
  });
}

export function getResource(world: World, id: string): Result<Resource> {
  const armType = parseId(id)?.armType ?? null;
  const checked = gate(world, "GET", id, armType, (current) => {
    if (!current.resources[canonicalId(id)]) return { error: missing("Resource", id, LEARN.armOverview) };
    return { world: current };
  });
  if (!checked.ok || !checked.value) return { ok: false, error: checked.error, trace: checked.trace };
  const resource = checked.value.resources[canonicalId(id)];
  return success(checked.trace, resource);
}

export function advance(world: World, ms: number): World {
  const next = cloneWorld(world);
  next.clock += ms;
  for (const resource of Object.values(next.resources)) {
    const pending = resource.properties._pending;
    const readyAt = resource.properties._readyAt;
    const delay = resource.properties._delayMs;
    if (!Array.isArray(pending) || typeof readyAt !== "number" || typeof delay !== "number") continue;
    let due = readyAt;
    const queue = [...pending];
    while (queue.length > 0 && next.clock >= due) {
      const step = String(queue.shift());
      if (step.startsWith("power:")) resource.properties.powerState = step.slice("power:".length);
      else resource.properties.provisioningState = step;
      due += delay;
    }
    resource.properties._pending = queue;
    resource.properties._readyAt = due;
    if (queue.length === 0) {
      delete resource.properties._pending;
      delete resource.properties._readyAt;
      delete resource.properties._delayMs;
    }
  }
  return next;
}

export function powerLabel(state: PowerState): string {
  if (state === "Stopped") return "Stopped (Allocated)";
  if (state === "Deallocated") return "Stopped (Deallocated)";
  return state;
}

export function powerIsBilled(state: PowerState): boolean {
  return state === "Starting" || state === "Running" || state === "Stopping" || state === "Stopped";
}

function requiresGlobal(typeKey: string): boolean {
  return typeKey === "microsoft.network/dnszones" || typeKey === "microsoft.network/privatednszones";
}

function addressList(properties: Record<string, unknown>): string[] {
  const space = properties.addressSpace;
  if (!space || typeof space !== "object") return [];
  const prefixes = (space as { addressPrefixes?: unknown }).addressPrefixes;
  return Array.isArray(prefixes) ? prefixes.filter((item): item is string => typeof item === "string") : [];
}

function cidrErrorMessage(message: string): EngineError {
  return { code: "InvalidAddressPrefix", message, step: "validate", learnUrl: LEARN.subnet };
}

function missing(kind: string, id: string, learnUrl: string): EngineError {
  return {
    code: "ResourceNotFound",
    message: `The ${kind} '${id}' was not found. (sandbox wording)`,
    step: "validate",
    learnUrl,
    target: id,
  };
}

function uniquenessError(world: World, typeKey: string, name: string, group: ResourceGroup, parent: Resource | null): EngineError | null {
  const matches = Object.values(world.resources).filter((resource) => resource.type.toLowerCase() === typeKey && sameName(resource.name, name));
  const clash = matches.find((resource) => {
    if (GLOBAL_TYPES.has(typeKey)) return true;
    if (parent) return resource.id.toLowerCase().startsWith(`${parent.id.toLowerCase()}/`);
    return resource.subscriptionId === group.subscriptionId && sameName(resource.resourceGroup, group.name);
  });
  if (!clash) return null;
  if (typeKey === "microsoft.storage/storageaccounts") {
    return {
      code: "StorageAccountAlreadyTaken",
      message: `The storage account named ${name} is already taken. The name is not available in this sandbox.`,
      step: "validate",
      learnUrl: LEARN.storageCreate,
      target: name,
    };
  }
  return {
    code: "ResourceAlreadyExists",
    message: GLOBAL_TYPES.has(typeKey)
      ? `${name} is not available in this sandbox. (sandbox wording)`
      : `A resource named ${name} already exists in this scope. Names are case-insensitive. (sandbox wording)`,
    step: "validate",
    learnUrl: LEARN.names,
    target: name,
  };
}

function finishProvisioning(properties: Record<string, unknown>, typeKey: string, delayMs: number, clock: number): Record<string, unknown> {
  const next = { ...properties };
  if (delayMs <= 0) {
    next.provisioningState = "Succeeded";
    if (typeKey === "microsoft.compute/virtualmachines") next.powerState = "Running";
    return next;
  }
  const queue = typeKey === "microsoft.storage/storageaccounts"
    ? ["ResolvingDNS", "Succeeded"]
    : ["Succeeded"];
  if (typeKey === "microsoft.compute/virtualmachines") queue.push("power:Running");
  next.provisioningState = "Creating";
  if (typeKey === "microsoft.compute/virtualmachines") next.powerState = "Creating";
  next._pending = queue;
  next._readyAt = clock + delayMs;
  next._delayMs = delayMs;
  return next;
}

function nextPowerState(current: PowerState, action: "start" | "stop" | "deallocate"): PowerState | null {
  if (action === "stop" && (current === "Running" || current === "Starting")) return "Stopped";
  if (action === "deallocate" && (current === "Running" || current === "Stopped" || current === "Starting" || current === "Stopping")) return "Deallocated";
  if (action === "start" && (current === "Stopped" || current === "Deallocated")) return "Running";
  return null;
}

function validateLockName(name: string): EngineError | null {
  if (name.length < 1 || name.length > 90 || name.endsWith(".") || !/^[\p{L}\p{N}._()-]+$/u.test(name)) {
    return {
      code: "InvalidResourceName",
      message: "A lock name is 1-90 characters and cannot end with a period. (sandbox wording)",
      step: "validate",
      learnUrl: LEARN.names,
      target: name,
    };
  }
  return null;
}

function deleteBlocked(world: World, resource: Resource): EngineError | null {
  const typeKey = resource.type.toLowerCase();
  const id = canonicalId(resource.id);
  const refs = Object.values(world.resources).filter((other) => canonicalId(other.id) !== id && !canonicalId(other.id).startsWith(`${id}/`));
  const mentions = (field: (other: Resource) => boolean) => refs.some(field);

  if (typeKey === "microsoft.network/virtualnetworks/subnets" && mentions((other) => referencedIds(other).some((ref) => canonicalId(ref) === id))) {
    return quote("You can delete a subnet only if there are no resources in the subnet.", LEARN.subnet);
  }
  if (typeKey === "microsoft.network/virtualnetworks") {
    const subnetIds = new Set(
      Object.values(world.resources)
        .filter((other) => canonicalId(other.id).startsWith(`${id}/subnets/`))
        .map((other) => canonicalId(other.id)),
    );
    subnetIds.add(id);
    if (mentions((other) => referencedIds(other).some((ref) => subnetIds.has(canonicalId(ref))))) {
      return quote("You can delete a virtual network only if there are no resources connected to it.", LEARN.vnet);
    }
  }
  if (typeKey === "microsoft.network/networkinterfaces" && mentions((other) => referencedIds(other).some((ref) => canonicalId(ref) === id))) {
    return quote("You can delete a NIC only when the NIC isn't attached to a VM.", LEARN.nic);
  }
  if (typeKey === "microsoft.network/networksecuritygroups" && mentions((other) => referencedIds(other).includes(resource.id) || referencedIds(other).some((ref) => canonicalId(ref) === id))) {
    return quote("If an NSG is associated with any subnets or network interfaces, you can't delete it.", LEARN.nsg);
  }
  if (typeKey === "microsoft.network/applicationsecuritygroups" && mentions((other) => referencedIds(other).some((ref) => canonicalId(ref) === id))) {
    return quote("You can't delete an application security group if it contains any network interfaces.", LEARN.nsg);
  }
  if (typeKey === "microsoft.network/routetables" && mentions((other) => referencedIds(other).some((ref) => canonicalId(ref) === id))) {
    return quote("You can't delete a route table associated to any subnets.", LEARN.routeTable);
  }
  if (typeKey === "microsoft.network/publicipaddresses" && mentions((other) => referencedIds(other).some((ref) => canonicalId(ref) === id))) {
    return quote(
      "Deletion of public IPs requires that the public IP object isn't associated to any IP configuration or virtual machine network interface.",
      LEARN.publicIp,
    );
  }
  if (typeKey === "microsoft.recoveryservices/vaults") {
    const props = resource.properties;
    const registered = props.registeredStorageAccountIds;
    const blocked =
      Number(props.protectedItemCount) > 0 ||
      Number(props.softDeletedItemCount) > 0 ||
      (Array.isArray(registered) && registered.length > 0);
    if (blocked) {
      return quote(
        "Cannot delete a vault that contains protected data sources, backup data, backup data in soft-deleted state, or registered storage accounts.",
        LEARN.vaultDelete,
      );
    }
  }
  return null;
}

function quote(message: string, learnUrl: string): EngineError {
  return { code: "DeleteBlocked", message, step: "validate", learnUrl };
}

function disconnectPeer(world: World, deleted: Resource): void {
  const remote = deleted.properties.remoteVirtualNetworkId;
  if (typeof remote !== "string") return;
  const localVnet = deleted.id.split("/").slice(0, -2).join("/");
  for (const other of Object.values(world.resources)) {
    if (other.type.toLowerCase() !== "microsoft.network/virtualnetworks/virtualnetworkpeerings") continue;
    const otherVnet = other.id.split("/").slice(0, -2).join("/");
    if (canonicalId(otherVnet) === canonicalId(remote) && typeof other.properties.remoteVirtualNetworkId === "string" && canonicalId(other.properties.remoteVirtualNetworkId) === canonicalId(localVnet)) {
      other.properties.peeringState = "Disconnected";
    }
  }
}
