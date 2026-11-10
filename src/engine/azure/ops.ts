/**
 * Create, update, delete, and virtual machine power operations.
 * Authorization uses the RBAC evaluator. Policy evaluates deny and audit on create and update.
 */

import { failure, success, type EngineError, type Result, type TraceLine } from "../core/result";
import { assignedPrivateIp, nextPrivateIp, withPrivateIp } from "./addresses";
import { formatCidr, overlapsCidr, parseCidr } from "./cidr";
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
  stringsOf,
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
  subjectFromResource,
  type PolicySubject,
} from "./policy/evaluate";
import type { PolicyState } from "./types";
import type { HttpMethod, ManagementGroup, PowerState, Resource, ResourceGroup, SubscriptionState, World } from "./types";

const CHILD_PARENT: Record<string, string> = {
  "microsoft.network/virtualnetworks/subnets": "microsoft.network/virtualnetworks",
  "microsoft.network/virtualnetworks/virtualnetworkpeerings": "microsoft.network/virtualnetworks",
  "microsoft.network/privatednszones/virtualnetworklinks": "microsoft.network/privatednszones",
  "microsoft.network/privatednszones/a": "microsoft.network/privatednszones",
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
      const vmIds: string[] = [];
      for (const resource of Object.values(next.resources)) {
        if (resource.subscriptionId === sub.subscriptionId && resource.type.toLowerCase() === "microsoft.compute/virtualmachines") {
          resource.properties = { ...resource.properties, powerState: "Deallocated" };
          vmIds.push(resource.id);
        }
      }
      for (const vmId of vmIds) writeAutoRecord(next, vmId);
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
          next: "Type a different name.",
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

    if (typeKey === "microsoft.network/networkinterfaces" && typeof properties.privateIPAddress !== "string") {
      const subnetId = typeof properties.subnetId === "string" ? properties.subnetId : null;
      const subnet = subnetId ? current.resources[canonicalId(subnetId)] : undefined;
      if (subnet) {
        const address = nextPrivateIp(current, subnet);
        if (!address) {
          return {
            error: {
              code: "SubnetFull",
              message: `${subnet.name} has no address left. Azure reserves the first four addresses and the last address in a subnet.`,
              step: "validate",
              learnUrl: LEARN.privateIp,
              next: "Use a larger subnet, or delete a network interface in this subnet.",
            },
          };
        }
        Object.assign(properties, withPrivateIp(properties, address));
      }
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
    if (typeKey === "microsoft.compute/virtualmachines") writeAutoRecord(next, resource.id);
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
            next: "Type a different label, or leave the label empty.",
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
    policy: existingResource ? subjectFromResource({ ...existingResource, tags: input.tags ?? existingResource.tags }) : undefined,
  });
}

export function attachNetworkInterface(world: World, vmId: string, nicId: string): Result<World> {
  const existing = world.resources[canonicalId(vmId)];
  const attached = gate(world, "PATCH", vmId, "Microsoft.Compute/virtualMachines", (current) => {
    const vm = current.resources[canonicalId(vmId)];
    const nic = current.resources[canonicalId(nicId)];
    if (!vm || !isType(vm, "microsoft.compute/virtualmachines")) return { error: missing("virtual machine", vmId, LEARN.armOverview) };
    if (!nic || !isType(nic, "microsoft.network/networkinterfaces")) return { error: missing("network interface", nicId, LEARN.nic) };
    if (differentPlace(vm, nic)) {
      return {
        error: {
          code: "NicRegionMismatch",
          message: "A network interface is recorded in the same subscription and region as the virtual machine. (sandbox wording)",
          next: "Create the network interface in the same region as the virtual machine.",
          step: "validate",
          learnUrl: LEARN.nic,
        },
      };
    }
    const taken = Object.values(current.resources).find(
      (other) =>
        isType(other, "microsoft.compute/virtualmachines") &&
        canonicalId(other.id) !== canonicalId(vm.id) &&
        linkedIds(other, "nicIds").includes(canonicalId(nic.id)),
    );
    if (taken) {
      return {
        error: {
          code: "NicInUse",
          message: `Network interface ${nic.name} is already attached to ${taken.name}. (sandbox wording)`,
          next: "Pick a network interface that is not already attached, or create a new one.",
          step: "validate",
          learnUrl: LEARN.nic,
        },
      };
    }
    const next = cloneWorld(current);
    const target = next.resources[canonicalId(vm.id)];
    target.properties = {
      ...target.properties,
      nicIds: [nic.id],
      networkProfile: { networkInterfaces: [{ id: nic.id }] },
      provisioningState: "Succeeded",
    };
    return { world: next };
  }, { policy: existing ? subjectFromResource(existing) : undefined });
  if (!attached.ok || !attached.value) return attached;
  const next = cloneWorld(attached.value);
  writeAutoRecord(next, vmId);
  return { ...attached, value: next };
}

export function attachPublicIp(world: World, nicId: string, publicIpId: string): Result<World> {
  const existing = world.resources[canonicalId(nicId)];
  return gate(world, "PATCH", nicId, "Microsoft.Network/networkInterfaces", (current) => {
    const nic = current.resources[canonicalId(nicId)];
    const pip = current.resources[canonicalId(publicIpId)];
    if (!nic || !isType(nic, "microsoft.network/networkinterfaces")) return { error: missing("network interface", nicId, LEARN.nic) };
    if (!pip || !isType(pip, "microsoft.network/publicipaddresses")) return { error: missing("public IP address", publicIpId, LEARN.publicIp) };
    if (differentPlace(nic, pip)) {
      return {
        error: {
          code: "PublicIpRegionMismatch",
          message: "A public IP address must be in the same region as the resource you attach it to. (sandbox wording)",
          next: "Create the public IP in the same region as the network interface.",
          step: "validate",
          learnUrl: LEARN.publicIp,
        },
      };
    }
    const taken = Object.values(current.resources).find(
      (other) => canonicalId(other.id) !== canonicalId(nic.id) && referencedIds(other).some((ref) => canonicalId(ref) === canonicalId(pip.id)),
    );
    if (taken) {
      return {
        error: {
          code: "PublicIpInUse",
          message: `Public IP address ${pip.name} is already associated with ${taken.name}. (sandbox wording)`,
          next: "Pick a public IP that is not already attached, or create a new one.",
          step: "validate",
          learnUrl: LEARN.publicIp,
        },
      };
    }
    const next = cloneWorld(current);
    const target = next.resources[canonicalId(nic.id)];
    target.properties = withPublicIp(target.properties, pip.id);
    return { world: next };
  }, { policy: existing ? subjectFromResource(existing) : undefined });
}

export function addInboundRule(
  world: World,
  subnetId: string,
  nsgId: string,
  input: { port: number; access: "Allow" | "Deny"; priority: number },
): Result<World> {
  const existing = world.resources[canonicalId(subnetId)];
  return gate(world, "PATCH", subnetId, "Microsoft.Network/virtualNetworks/subnets", (current) => {
    const subnet = current.resources[canonicalId(subnetId)];
    const nsg = current.resources[canonicalId(nsgId)];
    if (!subnet || !isType(subnet, "microsoft.network/virtualnetworks/subnets")) return { error: missing("subnet", subnetId, LEARN.subnet) };
    if (!nsg || !isType(nsg, "microsoft.network/networksecuritygroups")) return { error: missing("network security group", nsgId, LEARN.nsg) };
    const actor = findActor(current, current.session.actingPrincipalId);
    const nsgWrite = "Microsoft.Network/networkSecurityGroups/write";
    if (actor) {
      const decision = evaluateAccess(current, {
        principalId: actor.id,
        action: nsgWrite,
        scope: nsg.id,
        plane: "control",
      });
      if (decision.decision !== "allowed") {
        return {
          error: {
            code: "AuthorizationFailed",
            message: authorizationMessage(actor.displayName, actor.id, nsgWrite, nsg.id),
            step: "authorize",
            learnUrl: LEARN.authorizationFailed,
          },
        };
      }
    }
    const vnet = parentVirtualNetwork(current, subnet);
    const regionOf = vnet?.location ?? subnet.location;
    if (nsg.subscriptionId !== subnet.subscriptionId || nsg.location.toLowerCase() !== regionOf.toLowerCase()) {
      return {
        error: {
          code: "NsgRegionMismatch",
          message: "An NSG must be in the same subscription and region as the virtual network of any subnet you associate it with. (sandbox wording)",
          step: "validate",
          learnUrl: LEARN.nsg,
          next: "Create the network security group in the same region as the virtual network, then select it.",
        },
      };
    }
    const currentNsg = typeof subnet.properties.networkSecurityGroupId === "string" ? canonicalId(subnet.properties.networkSecurityGroupId) : "";
    if (currentNsg && currentNsg !== canonicalId(nsg.id)) {
      return {
        error: {
          code: "NsgAlreadyAssociated",
          message: `Subnet ${subnet.name} is already associated with another network security group. (sandbox wording)`,
          step: "validate",
          learnUrl: LEARN.nsg,
          next: "Keep the group already on this subnet, or reset the subscription. This page cannot replace it.",
        },
      };
    }
    const invalid = ruleInputError(input);
    if (invalid) return { error: invalid };
    const name = `${input.access}-${input.port}-Inbound-${input.priority}`;
    const existingRules = Array.isArray(nsg.properties.securityRules) ? nsg.properties.securityRules : [];
    const clash = duplicateRuleError(existingRules, "Inbound", input.priority, name, nsg.name);
    if (clash) return { error: clash };
    const nsgPolicy = evaluatePolicy(current, subjectFromResource(nsg));
    if (nsgPolicy.error) return { error: nsgPolicy.error };
    const rule = tcpSecurityRule(input, "Inbound");
    const next = cloneWorld(current);
    const nextSubnet = next.resources[canonicalId(subnet.id)];
    const nextNsg = next.resources[canonicalId(nsg.id)];
    nextSubnet.properties = {
      ...nextSubnet.properties,
      networkSecurityGroupId: nsg.id,
      networkSecurityGroup: { id: nsg.id },
      provisioningState: "Succeeded",
    };
    nextNsg.properties = {
      ...nextNsg.properties,
      securityRules: [...existingRules, rule],
      provisioningState: "Succeeded",
    };
    return { world: replaceResourcePolicyStates(next, nsg.id, nsgPolicy.states) };
  }, { policy: existing ? subjectFromResource(existing) : undefined });
}

export function addSecurityRule(
  world: World,
  nsgId: string,
  input: { direction: "Inbound" | "Outbound"; port: number; access: "Allow" | "Deny"; priority: number; scope?: "internet" | "vnet" },
): Result<World> {
  const existing = world.resources[canonicalId(nsgId)];
  return gate(world, "PATCH", nsgId, "Microsoft.Network/networkSecurityGroups", (current) => {
    const nsg = current.resources[canonicalId(nsgId)];
    if (!nsg || !isType(nsg, "microsoft.network/networksecuritygroups")) return { error: missing("network security group", nsgId, LEARN.nsg) };
    const invalid = ruleInputError(input);
    if (invalid) return { error: invalid };
    const existingRules = Array.isArray(nsg.properties.securityRules) ? nsg.properties.securityRules : [];
    const rule = tcpSecurityRule(input, input.direction, input.scope === "vnet" ? "vnet" : "internet");
    const clash = duplicateRuleError(existingRules, input.direction, input.priority, rule.name, nsg.name);
    if (clash) return { error: clash };
    const next = cloneWorld(current);
    const nextNsg = next.resources[canonicalId(nsg.id)];
    nextNsg.properties = {
      ...nextNsg.properties,
      securityRules: [...existingRules, rule],
      provisioningState: "Succeeded",
    };
    return { world: next };
  }, { policy: existing ? subjectFromResource(existing) : undefined });
}

export function addInternetRoute(
  world: World,
  subnetId: string,
  input: { tableName: string; routeName: string; nextHop: "None" | "Internet" | "VirtualAppliance"; addressPrefix?: string; nextHopIpAddress?: string },
): Result<World> {
  const subnet = world.resources[canonicalId(subnetId)];
  if (!subnet || !isType(subnet, "microsoft.network/virtualnetworks/subnets")) {
    return failure([{ step: "parse", ok: true }], missing("subnet", subnetId, LEARN.subnet));
  }
  const routeName = input.routeName.trim();
  if (routeName.length < 1 || routeName.length > 80) {
    return failure([{ step: "parse", ok: true }], {
      code: "InvalidRouteName",
      message: "Enter a route name of 1 to 80 characters. (sandbox wording)",
      next: "Enter a name such as to-internet.",
      step: "validate",
      learnUrl: LEARN.routeTable,
    });
  }
  const nextHop = input.nextHop === "Internet" ? "Internet" : input.nextHop === "VirtualAppliance" ? "VirtualAppliance" : input.nextHop === "None" ? "None" : null;
  if (!nextHop) {
    return failure([{ step: "parse", ok: true }], {
      code: "InvalidNextHop",
      message: "Choose a next hop of None, Internet, or Virtual appliance. (sandbox wording)",
      next: "Choose None to drop traffic, Internet to send it to the internet, or Virtual appliance to send it to a private address.",
      step: "validate",
      learnUrl: LEARN.udr,
    });
  }
  let nextHopIpAddress = "";
  if (nextHop === "VirtualAppliance") {
    const parsedHop = parseCidr(`${(input.nextHopIpAddress ?? "").trim()}/32`);
    if ("error" in parsedHop || parsedHop.prefix !== 32) {
      return failure([{ step: "parse", ok: true }], {
        code: "InvalidNextHopAddress",
        message: "Enter the private IP address of the virtual appliance. (sandbox wording)",
        next: "Enter an address such as 10.0.2.4.",
        step: "validate",
        learnUrl: LEARN.udr,
      });
    }
    nextHopIpAddress = (input.nextHopIpAddress ?? "").trim();
  }
  const rawPrefix = (input.addressPrefix ?? "0.0.0.0/0").trim();
  const parsedPrefix = parseCidr(rawPrefix);
  if ("error" in parsedPrefix) {
    return failure([{ step: "parse", ok: true }], {
      code: "InvalidPrefix",
      message: "Enter an IPv4 prefix. (sandbox wording)",
      next: "Enter a prefix such as 10.0.1.0/24 or 0.0.0.0/0.",
      step: "validate",
      learnUrl: LEARN.routeTable,
    });
  }
  const addressPrefix = formatCidr(parsedPrefix);
  if (addressPrefix !== rawPrefix) {
    return failure([{ step: "parse", ok: true }], {
      code: "InvalidPrefix",
      message: "Enter the network address of the prefix. (sandbox wording)",
      next: `Use ${addressPrefix}.`,
      step: "validate",
      learnUrl: LEARN.routeTable,
    });
  }
  const vnet = parentVirtualNetwork(world, subnet);
  const location = vnet?.location ?? subnet.location;
  const tableName = input.tableName.trim();
  const existingTable = Object.values(world.resources).find(
    (resource) =>
      isType(resource, "microsoft.network/routetables") &&
      sameName(resource.name, tableName) &&
      sameName(resource.resourceGroup, subnet.resourceGroup) &&
      resource.subscriptionId === subnet.subscriptionId,
  );
  const prepared = existingTable
    ? { ok: true as const, value: world }
    : createResource(world, {
        armType: "Microsoft.Network/routeTables",
        name: tableName,
        resourceGroup: subnet.resourceGroup,
        subscriptionId: subnet.subscriptionId,
        location,
        properties: { disableBgpRoutePropagation: false, routes: [] },
      });
  if (!prepared.ok || !prepared.value) return prepared.ok ? failure([{ step: "parse", ok: true }], missing("route table", tableName, LEARN.routeTable)) : prepared;
  const ready = prepared.value;
  const table = existingTable ?? Object.values(ready.resources).find(
    (resource) =>
      isType(resource, "microsoft.network/routetables") &&
      sameName(resource.name, tableName) &&
      sameName(resource.resourceGroup, subnet.resourceGroup),
  );
  if (!table) return failure([{ step: "parse", ok: true }], missing("route table", tableName, LEARN.routeTable));
  return gate(ready, "PATCH", subnet.id, "Microsoft.Network/virtualNetworks/subnets", (current) => {
    const currentSubnet = current.resources[canonicalId(subnet.id)];
    const currentTable = current.resources[canonicalId(table.id)];
    if (!currentSubnet || !currentTable) return { error: missing("route table", table.id, LEARN.routeTable) };
    const actor = findActor(current, current.session.actingPrincipalId);
    if (actor) {
      for (const action of ["Microsoft.Network/routeTables/write", "Microsoft.Network/routeTables/join/action", "Microsoft.Network/routeTables/routes/write"]) {
        const decision = evaluateAccess(current, { principalId: actor.id, action, scope: currentTable.id, plane: "control" });
        if (decision.decision !== "allowed") {
          return {
            error: {
              code: "AuthorizationFailed",
              message: authorizationMessage(actor.displayName, actor.id, action, currentTable.id),
              step: "authorize",
              learnUrl: LEARN.authorizationFailed,
            },
          };
        }
      }
    }
    const regionOf = parentVirtualNetwork(current, currentSubnet)?.location ?? currentSubnet.location;
    if (currentTable.subscriptionId !== currentSubnet.subscriptionId || currentTable.location.toLowerCase() !== regionOf.toLowerCase()) {
      return {
        error: {
          code: "RouteTableRegionMismatch",
          message: "You can only associate a route table to subnets in virtual networks that exist in the same Azure location and subscription as the route table.",
          next: "Use a route table in the same region as the virtual network.",
          step: "validate",
          learnUrl: LEARN.routeTable,
        },
      };
    }
    const currentTableId = typeof currentSubnet.properties.routeTableId === "string" ? canonicalId(currentSubnet.properties.routeTableId) : "";
    if (currentTableId && currentTableId !== canonicalId(currentTable.id)) {
      return {
        error: {
          code: "RouteTableAlreadyAssociated",
          message: "Each subnet can have zero or one route table associated to it.",
          next: "Keep the route table already on this subnet, or reset the subscription. This page cannot replace it.",
          step: "validate",
          learnUrl: LEARN.udr,
        },
      };
    }
    const existingRoutes = Array.isArray(currentTable.properties.routes) ? currentTable.properties.routes : [];
    const named = existingRoutes.some((route) => route && typeof route === "object" && sameName(String((route as { name?: unknown }).name ?? ""), routeName));
    if (named) {
      return {
        error: {
          code: "DuplicateRouteName",
          message: "Enter a unique Route name for the route within the route table.",
          next: "Enter a different route name.",
          step: "validate",
          learnUrl: LEARN.routeTable,
        },
      };
    }
    const duplicatePrefix = existingRoutes.some((route) => {
      if (!route || typeof route !== "object") return false;
      const props = (route as { properties?: unknown }).properties;
      if (!props || typeof props !== "object") return false;
      const current = (props as { addressPrefix?: unknown }).addressPrefix;
      if (typeof current !== "string") return false;
      const parsed = parseCidr(current);
      return !("error" in parsed) && formatCidr(parsed) === addressPrefix;
    });
    if (duplicatePrefix) {
      return {
        error: {
          code: "DuplicateRoutePrefix",
          message: "The prefix can't be duplicated in more than one route within the route table, though the prefix can be within another prefix.",
          next: `This route table already has ${addressPrefix}. A longer or shorter prefix can be added.`,
          step: "validate",
          learnUrl: LEARN.routeTable,
        },
      };
    }
    const tablePolicy = evaluatePolicy(current, subjectFromResource(currentTable));
    if (tablePolicy.error) return { error: tablePolicy.error };
    const next = cloneWorld(current);
    const nextSubnet = next.resources[canonicalId(currentSubnet.id)];
    const nextTable = next.resources[canonicalId(currentTable.id)];
    nextSubnet.properties = {
      ...nextSubnet.properties,
      routeTableId: currentTable.id,
      routeTable: { id: currentTable.id },
      provisioningState: "Succeeded",
    };
    nextTable.properties = {
      ...nextTable.properties,
      routes: [...existingRoutes, {
        name: routeName,
        properties: {
          addressPrefix,
          nextHopType: nextHop,
          ...(nextHop === "VirtualAppliance" ? { nextHopIpAddress } : {}),
        },
      }],
      provisioningState: "Succeeded",
    };
    return { world: replaceResourcePolicyStates(next, currentTable.id, tablePolicy.states) };
  }, { policy: subjectFromResource(subnet) });
}

export function setForwardedTraffic(world: World, localVnetId: string, remoteVnetId: string, enabled: boolean): Result<World> {
  const local = world.resources[canonicalId(localVnetId)];
  const remote = world.resources[canonicalId(remoteVnetId)];
  if (!local || !isType(local, "microsoft.network/virtualnetworks")) {
    return failure([{ step: "parse", ok: true }], missing("virtual network", localVnetId, LEARN.vnet));
  }
  if (!remote || !isType(remote, "microsoft.network/virtualnetworks")) {
    return failure([{ step: "parse", ok: true }], missing("virtual network", remoteVnetId, LEARN.vnet));
  }
  const localLink = peeringBetween(world, local, remote);
  const remoteLink = peeringBetween(world, remote, local);
  if (!localLink || !remoteLink) {
    return failure([{ step: "parse", ok: true }], {
      code: "PeeringNotConnected",
      message: "The peering isn't successfully established until the peering status for both virtual network peerings is Connected.",
      next: "Peer the two virtual networks. This page creates both links.",
      step: "validate",
      learnUrl: LEARN.peering,
    });
  }
  return gate(world, "PATCH", localLink.id, "Microsoft.Network/virtualNetworks/virtualNetworkPeerings", (current) => {
    const next = cloneWorld(current);
    for (const id of [localLink.id, remoteLink.id]) {
      const target = next.resources[canonicalId(id)];
      if (!target) return { error: missing("peering", id, LEARN.peering) };
      target.properties = { ...target.properties, allowForwardedTraffic: enabled, provisioningState: "Succeeded" };
    }
    return { world: next };
  }, { policy: subjectFromResource(localLink) });
}

export function setPeeringOptions(
  world: World,
  localVnetId: string,
  remoteVnetId: string,
  options: { forwarded: boolean; allowGatewayTransit: boolean; useRemoteGateways: boolean },
): Result<World> {
  const local = world.resources[canonicalId(localVnetId)];
  const remote = world.resources[canonicalId(remoteVnetId)];
  if (!local || !isType(local, "microsoft.network/virtualnetworks")) {
    return failure([{ step: "parse", ok: true }], missing("virtual network", localVnetId, LEARN.vnet));
  }
  if (!remote || !isType(remote, "microsoft.network/virtualnetworks")) {
    return failure([{ step: "parse", ok: true }], missing("virtual network", remoteVnetId, LEARN.vnet));
  }
  const localLink = peeringBetween(world, local, remote);
  const remoteLink = peeringBetween(world, remote, local);
  if (!localLink || !remoteLink) {
    return failure([{ step: "parse", ok: true }], {
      code: "PeeringNotConnected",
      message: "The peering isn't successfully established until the peering status for both virtual network peerings is Connected.",
      next: "Peer the two virtual networks. This page creates both links.",
      step: "validate",
      learnUrl: LEARN.peering,
    });
  }
  if (options.useRemoteGateways) {
    if (remoteLink.properties.allowGatewayTransit !== true) {
      return failure([{ step: "parse", ok: true }], {
        code: "RemoteGatewayTransitDisabled",
        message: "Use remote gateway needs Allow gateway transit on the other virtual network's link. (sandbox wording)",
        next: "Open the other virtual network, set Allow gateway transit to Enabled, then set Use remote gateway here.",
        step: "validate",
        learnUrl: LEARN.peering,
      });
    }
    const prefix = `${canonicalId(local.id)}/virtualnetworkpeerings/`;
    const already = Object.values(world.resources).find((resource) =>
      isType(resource, "microsoft.network/virtualnetworks/virtualnetworkpeerings") &&
      canonicalId(resource.id).startsWith(prefix) &&
      canonicalId(resource.id) !== canonicalId(localLink.id) &&
      resource.properties.useRemoteGateways === true,
    );
    if (already) {
      return failure([{ step: "parse", ok: true }], {
        code: "RemoteGatewayAlreadyUsed",
        message: "Use remote gateway can be set on only one peering of a virtual network. (sandbox wording)",
        next: "Turn Use remote gateway off on the other peering first.",
        step: "validate",
        learnUrl: LEARN.peering,
      });
    }
  }
  return gate(world, "PATCH", localLink.id, "Microsoft.Network/virtualNetworks/virtualNetworkPeerings", (current) => {
    const next = cloneWorld(current);
    for (const id of [localLink.id, remoteLink.id]) {
      const target = next.resources[canonicalId(id)];
      if (!target) return { error: missing("peering", id, LEARN.peering) };
      target.properties = { ...target.properties, allowForwardedTraffic: options.forwarded, provisioningState: "Succeeded" };
    }
    const localTarget = next.resources[canonicalId(localLink.id)];
    localTarget.properties = {
      ...localTarget.properties,
      allowGatewayTransit: options.allowGatewayTransit,
      useRemoteGateways: options.useRemoteGateways,
      provisioningState: "Succeeded",
    };
    return { world: next };
  }, { policy: subjectFromResource(localLink) });
}

export function setServiceEndpoint(world: World, subnetId: string, service: "Microsoft.Storage" | "None"): Result<World> {
  const existing = world.resources[canonicalId(subnetId)];
  return gate(world, "PATCH", subnetId, "Microsoft.Network/virtualNetworks/subnets", (current) => {
    const subnet = current.resources[canonicalId(subnetId)];
    if (!subnet || !isType(subnet, "microsoft.network/virtualnetworks/subnets")) return { error: missing("subnet", subnetId, LEARN.subnet) };
    const next = cloneWorld(current);
    const target = next.resources[canonicalId(subnet.id)];
    target.properties = {
      ...target.properties,
      serviceEndpoints: service === "None" ? [] : [{ service: "Microsoft.Storage" }],
      provisioningState: "Succeeded",
    };
    return { world: next };
  }, { policy: existing ? subjectFromResource(existing) : undefined });
}

export function setStorageFirewall(
  world: World,
  accountId: string,
  input: { defaultAction: "Allow" | "Deny"; subnetId?: string },
): Result<World> {
  const existing = world.resources[canonicalId(accountId)];
  return gate(world, "PATCH", accountId, "Microsoft.Storage/storageAccounts", (current) => {
    const account = current.resources[canonicalId(accountId)];
    if (!account || !isType(account, "microsoft.storage/storageaccounts")) return { error: missing("storage account", accountId, LEARN.storageFirewall) };
    const subnet = input.subnetId ? current.resources[canonicalId(input.subnetId)] : undefined;
    if (input.subnetId && (!subnet || !isType(subnet, "microsoft.network/virtualnetworks/subnets"))) {
      return { error: missing("subnet", input.subnetId, LEARN.subnet) };
    }
    const previous = account.properties.networkAcls;
    const previousRules = previous && typeof previous === "object" && Array.isArray((previous as { virtualNetworkRules?: unknown }).virtualNetworkRules)
      ? (previous as { virtualNetworkRules: unknown[] }).virtualNetworkRules
      : [];
    const next = cloneWorld(current);
    const target = next.resources[canonicalId(account.id)];
    target.properties = {
      ...target.properties,
      networkAcls: {
        defaultAction: input.defaultAction,
        virtualNetworkRules: subnet ? [{ id: subnet.id, action: "Allow" }] : input.subnetId === undefined ? previousRules : [],
      },
      provisioningState: "Succeeded",
    };
    return { world: next };
  }, { policy: existing ? subjectFromResource(existing) : undefined });
}

export function setIpForwarding(world: World, nicId: string, enabled: boolean): Result<World> {
  const existing = world.resources[canonicalId(nicId)];
  return gate(world, "PATCH", nicId, "Microsoft.Network/networkInterfaces", (current) => {
    const nic = current.resources[canonicalId(nicId)];
    if (!nic || !isType(nic, "microsoft.network/networkinterfaces")) return { error: missing("network interface", nicId, LEARN.nic) };
    const next = cloneWorld(current);
    const target = next.resources[canonicalId(nic.id)];
    target.properties = { ...target.properties, enableIPForwarding: enabled, provisioningState: "Succeeded" };
    return { world: next };
  }, { policy: existing ? subjectFromResource(existing) : undefined });
}

export function addPrivateDnsRecord(
  world: World,
  vnetId: string,
  input: { zoneName: string; recordName: string; ipv4Address: string },
): Result<World> {
  const vnet = world.resources[canonicalId(vnetId)];
  if (!vnet || !isType(vnet, "microsoft.network/virtualnetworks")) {
    return failure([{ step: "parse", ok: true }], missing("virtual network", vnetId, LEARN.vnet));
  }
  const ip = input.ipv4Address.trim();
  const parsed = parseCidr(`${ip}/32`);
  if ("error" in parsed || parsed.prefix !== 32) {
    return failure([{ step: "parse", ok: true }], {
      code: "InvalidAddress",
      message: "Enter an address such as 10.0.1.4. (sandbox wording)",
      next: "The A record stores one IPv4 address.",
      step: "validate",
      learnUrl: LEARN.privateDns,
    });
  }
  const zoneName = input.zoneName.trim();
  let current = world;
  let zone = privateZone(current, vnet, zoneName);
  if (!zone) {
    const created = createResource(current, {
      armType: "Microsoft.Network/privateDnsZones",
      name: zoneName,
      resourceGroup: vnet.resourceGroup,
      subscriptionId: vnet.subscriptionId,
      location: "global",
    });
    if (!created.ok || !created.value) return created.ok ? failure([{ step: "parse", ok: true }], missing("private DNS zone", zoneName, LEARN.privateDns)) : created;
    current = created.value;
    zone = privateZone(current, vnet, zoneName);
    if (!zone) return failure([{ step: "parse", ok: true }], missing("private DNS zone", zoneName, LEARN.privateDns));
  }
  if (!privateZoneLink(current, zone, vnet)) {
    const linked = createResource(current, {
      armType: "Microsoft.Network/privateDnsZones/virtualNetworkLinks",
      name: `link-${vnet.name}`,
      resourceGroup: vnet.resourceGroup,
      subscriptionId: vnet.subscriptionId,
      location: "global",
      parentName: zone.name,
      properties: {
        registrationEnabled: false,
        virtualNetwork: { id: vnet.id },
      },
    });
    if (!linked.ok || !linked.value) return linked.ok ? failure([{ step: "parse", ok: true }], missing("virtual network link", vnet.name, LEARN.privateDns)) : linked;
    current = linked.value;
  }
  return createResource(current, {
    armType: "Microsoft.Network/privateDnsZones/A",
    name: input.recordName.trim(),
    resourceGroup: vnet.resourceGroup,
    subscriptionId: vnet.subscriptionId,
    location: "global",
    parentName: zone.name,
    properties: { ttl: 3600, aRecords: [{ ipv4Address: ip }] },
  });
}

function privateZone(world: World, vnet: Resource, zoneName: string): Resource | undefined {
  return Object.values(world.resources).find((resource) =>
    isType(resource, "microsoft.network/privatednszones") &&
    sameName(resource.name, zoneName) &&
    resource.subscriptionId === vnet.subscriptionId &&
    sameName(resource.resourceGroup, vnet.resourceGroup),
  );
}

function privateZoneLink(world: World, zone: Resource, vnet: Resource): Resource | undefined {
  const prefix = `${canonicalId(zone.id)}/virtualnetworklinks/`;
  return Object.values(world.resources).find((resource) =>
    isType(resource, "microsoft.network/privatednszones/virtualnetworklinks") &&
    canonicalId(resource.id).startsWith(prefix) &&
    canonicalId(linkedVnetId(resource) ?? "") === canonicalId(vnet.id),
  );
}

function linkedVnetId(resource: Resource): string | null {
  const network = resource.properties.virtualNetwork;
  if (!network || typeof network !== "object") return null;
  const id = (network as { id?: unknown }).id;
  return typeof id === "string" ? id : null;
}

export function setPrivateDnsRegistration(
  world: World,
  vnetId: string,
  input: { zoneName: string; enabled: boolean },
): Result<World> {
  const vnet = world.resources[canonicalId(vnetId)];
  if (!vnet || !isType(vnet, "microsoft.network/virtualnetworks")) {
    return failure([{ step: "parse", ok: true }], missing("virtual network", vnetId, LEARN.vnet));
  }
  const zoneName = input.zoneName.trim();
  const nameError = validateName("Microsoft.Network/privateDnsZones", zoneName);
  if (nameError) return failure([{ step: "parse", ok: true }], nameError);
  const registered = registrationLink(world, vnet);
  if (input.enabled && registered && !sameName(registered.zone.name, zoneName)) {
    return failure([{ step: "parse", ok: true }], {
      code: "RegistrationZoneExists",
      message: "A virtual network can link to only one zone with auto-registration. (sandbox wording)",
      next: "Turn auto-registration off on the other zone first.",
      step: "validate",
      learnUrl: LEARN.privateDnsRegistration,
    });
  }
  const existingZone = privateZone(world, vnet, zoneName);
  if (!input.enabled) {
    if (!existingZone) return success([{ step: "validate", ok: true }], world);
    const link = privateZoneLink(world, existingZone, vnet);
    if (!link || link.properties.registrationEnabled !== true) return success([{ step: "validate", ok: true }], world);
  }
  if (input.enabled && existingZone) {
    const conflict = registrationConflict(world, existingZone, vnet);
    if (conflict) return failure([{ step: "parse", ok: true }], conflict);
  }
  let current = world;
  let trace: TraceLine[] = [{ step: "validate", ok: true }];
  let zone = existingZone;
  if (!zone) {
    const created = createResource(current, {
      armType: "Microsoft.Network/privateDnsZones",
      name: zoneName,
      resourceGroup: vnet.resourceGroup,
      subscriptionId: vnet.subscriptionId,
      location: "global",
    });
    if (!created.ok || !created.value) return created.ok ? failure([{ step: "parse", ok: true }], missing("private DNS zone", zoneName, LEARN.privateDns)) : created;
    current = created.value;
    trace = created.trace;
    zone = privateZone(current, vnet, zoneName);
    if (!zone) return failure([{ step: "parse", ok: true }], missing("private DNS zone", zoneName, LEARN.privateDns));
  }
  const link = privateZoneLink(current, zone, vnet);
  if (!link) {
    const linked = createResource(current, {
      armType: "Microsoft.Network/privateDnsZones/virtualNetworkLinks",
      name: `link-${vnet.name}`,
      resourceGroup: vnet.resourceGroup,
      subscriptionId: vnet.subscriptionId,
      location: "global",
      parentName: zone.name,
      properties: { registrationEnabled: input.enabled, virtualNetwork: { id: vnet.id } },
    });
    if (!linked.ok || !linked.value) return linked.ok ? failure([{ step: "parse", ok: true }], missing("virtual network link", vnet.name, LEARN.privateDns)) : linked;
    current = linked.value;
    trace = linked.trace;
    zone = privateZone(current, vnet, zoneName) ?? zone;
  } else if (link.properties.registrationEnabled !== input.enabled) {
    current = cloneWorld(current);
    const target = current.resources[canonicalId(link.id)];
    target.properties = { ...target.properties, registrationEnabled: input.enabled, provisioningState: "Succeeded" };
    zone = privateZone(current, vnet, zoneName) ?? zone;
  }
  if (current === world) current = cloneWorld(current);
  if (input.enabled) writeAutoRecordsForVnet(current, vnet);
  else clearAutoRecords(current, zone, vnet);
  return success(trace, current);
}

function registrationConflict(world: World, zone: Resource, vnet: Resource): EngineError | null {
  for (const vm of vmsInVnet(world, vnet)) {
    if (vm.properties.powerState !== "Running") continue;
    const nameError = validateName("Microsoft.Network/privateDnsZones/A", vm.name);
    if (nameError) return nameError;
    const record = aRecord(world, zone, vm.name);
    if (record && record.properties.autoRegistered !== true) {
      return {
        code: "RecordNameTaken",
        message: `An A record named ${vm.name} already exists in ${zone.name}. (sandbox wording)`,
        next: "Delete that record before auto-registration can use the virtual machine name.",
        step: "validate",
        learnUrl: LEARN.privateDnsRegistration,
      };
    }
  }
  return null;
}

function registrationLink(world: World, vnet: Resource): { zone: Resource; link: Resource } | undefined {
  for (const zone of Object.values(world.resources)) {
    if (!isType(zone, "microsoft.network/privatednszones")) continue;
    const link = privateZoneLink(world, zone, vnet);
    if (link?.properties.registrationEnabled === true) return { zone, link };
  }
  return undefined;
}

function writeAutoRecordsForVnet(world: World, vnet: Resource): void {
  for (const vm of vmsInVnet(world, vnet)) writeAutoRecord(world, vm.id);
}

function writeAutoRecord(world: World, vmId: string): void {
  const vm = world.resources[canonicalId(vmId)];
  if (!vm || !isType(vm, "microsoft.compute/virtualmachines")) return;
  const nic = primaryNic(world, vm);
  const vnet = nic ? vnetOfNic(world, nic) : undefined;
  if (!nic || !vnet) {
    removeAutoRecordsForVm(world, vm.id);
    return;
  }
  const home = registrationLink(world, vnet);
  if (!home || vm.properties.powerState !== "Running") {
    if (home) removeAutoRecord(world, home.zone, vm.id);
    else removeAutoRecordsForVm(world, vm.id);
    return;
  }
  const address = assignedPrivateIp(world, nic);
  if (!address || validateName("Microsoft.Network/privateDnsZones/A", vm.name)) {
    removeAutoRecord(world, home.zone, vm.id);
    return;
  }
  const existing = aRecord(world, home.zone, vm.name);
  if (existing && (existing.properties.autoRegistered !== true || canonicalId(String(existing.properties.virtualMachineId ?? "")) !== canonicalId(vm.id))) return;
  const id = resourceId(home.zone.subscriptionId, home.zone.resourceGroup, "Microsoft.Network/privateDnsZones/A", [home.zone.name, vm.name]);
  world.resources[canonicalId(id)] = {
    id,
    name: vm.name,
    type: "Microsoft.Network/privateDnsZones/A",
    location: "global",
    tags: {},
    resourceGroup: home.zone.resourceGroup,
    subscriptionId: home.zone.subscriptionId,
    properties: {
      ttl: 3600,
      aRecords: [{ ipv4Address: address }],
      autoRegistered: true,
      virtualMachineId: vm.id,
      provisioningState: "Succeeded",
    },
  };
}

function clearAutoRecords(world: World, zone: Resource, vnet: Resource): void {
  const ids = new Set(vmsInVnet(world, vnet).map((vm) => canonicalId(vm.id)));
  for (const key of Object.keys(world.resources)) {
    const record = world.resources[key];
    if (!record || !isAutoRecord(record, zone)) continue;
    const vmId = record.properties.virtualMachineId;
    if (typeof vmId === "string" && ids.has(canonicalId(vmId))) delete world.resources[key];
  }
}

function removeAutoRecord(world: World, zone: Resource, vmId: string): void {
  for (const key of Object.keys(world.resources)) {
    const record = world.resources[key];
    if (!record || !isAutoRecord(record, zone)) continue;
    const owner = record.properties.virtualMachineId;
    if (typeof owner === "string" && canonicalId(owner) === canonicalId(vmId)) delete world.resources[key];
  }
}

function removeAutoRecordsForVm(world: World, vmId: string): void {
  for (const key of Object.keys(world.resources)) {
    const record = world.resources[key];
    if (!record || record.properties.autoRegistered !== true) continue;
    const owner = record.properties.virtualMachineId;
    if (typeof owner === "string" && canonicalId(owner) === canonicalId(vmId)) delete world.resources[key];
  }
}

function removePrivateDnsForVnet(world: World, vnet: Resource): void {
  const zoneIds = new Set<string>();
  for (const key of Object.keys(world.resources)) {
    const link = world.resources[key];
    if (!link || !isType(link, "microsoft.network/privatednszones/virtualnetworklinks")) continue;
    if (canonicalId(linkedVnetId(link) ?? "") !== canonicalId(vnet.id)) continue;
    const zone = zoneOwning(world, link);
    if (zone && link.properties.registrationEnabled === true) zoneIds.add(canonicalId(zone.id));
    delete world.resources[key];
  }
  for (const zoneId of zoneIds) {
    const zone = world.resources[zoneId];
    if (zone) clearAutoRecords(world, zone, vnet);
  }
}

function zoneOwning(world: World, link: Resource): Resource | undefined {
  return Object.values(world.resources).find((resource) =>
    isType(resource, "microsoft.network/privatednszones") && canonicalId(link.id).startsWith(`${canonicalId(resource.id)}/`),
  );
}

function isAutoRecord(record: Resource, zone: Resource): boolean {
  return record.properties.autoRegistered === true &&
    record.type.toLowerCase() === "microsoft.network/privatednszones/a" &&
    canonicalId(record.id).startsWith(`${canonicalId(zone.id)}/a/`);
}

function aRecord(world: World, zone: Resource, name: string): Resource | undefined {
  const prefix = `${canonicalId(zone.id)}/a/`;
  return Object.values(world.resources).find((resource) =>
    resource.type.toLowerCase() === "microsoft.network/privatednszones/a" &&
    canonicalId(resource.id).startsWith(prefix) &&
    sameName(resource.name, name),
  );
}

function vmsInVnet(world: World, vnet: Resource): Resource[] {
  return Object.values(world.resources).filter((resource) => {
    if (!isType(resource, "microsoft.compute/virtualmachines")) return false;
    const nic = primaryNic(world, resource);
    const home = nic ? vnetOfNic(world, nic) : undefined;
    return home !== undefined && canonicalId(home.id) === canonicalId(vnet.id);
  });
}

function primaryNic(world: World, vm: Resource): Resource | undefined {
  const id = linkedIds(vm, "nicIds")[0];
  return id ? world.resources[id] : undefined;
}

function vnetOfNic(world: World, nic: Resource): Resource | undefined {
  const direct = typeof nic.properties.subnetId === "string" ? nic.properties.subnetId : null;
  const configs = nic.properties.ipConfigurations;
  let nested: string | null = null;
  if (Array.isArray(configs)) {
    for (const config of configs) {
      if (!config || typeof config !== "object") continue;
      const props = (config as { properties?: unknown }).properties;
      if (!props || typeof props !== "object") continue;
      const subnet = (props as { subnet?: { id?: unknown } }).subnet;
      if (subnet && typeof subnet.id === "string") nested = subnet.id;
    }
  }
  const subnetId = direct ?? nested;
  const subnet = subnetId ? world.resources[canonicalId(subnetId)] : undefined;
  if (!subnet) return undefined;
  const marker = "/subnets/";
  const id = canonicalId(subnet.id);
  const at = id.indexOf(marker);
  if (at < 0) return undefined;
  return world.resources[id.slice(0, at)];
}

export function peerVirtualNetworks(world: World, localVnetId: string, remoteVnetId: string): Result<World> {
  const local = world.resources[canonicalId(localVnetId)];
  const remote = world.resources[canonicalId(remoteVnetId)];
  if (!local || !isType(local, "microsoft.network/virtualnetworks")) {
    return failure([{ step: "parse", ok: true }], missing("virtual network", localVnetId, LEARN.vnet));
  }
  if (!remote || !isType(remote, "microsoft.network/virtualnetworks")) {
    return failure([{ step: "parse", ok: true }], missing("virtual network", remoteVnetId, LEARN.vnet));
  }
  if (canonicalId(local.id) === canonicalId(remote.id)) {
    return failure([{ step: "parse", ok: true }], {
      code: "PeeringSameNetwork",
      message: "Choose another virtual network. (sandbox wording)",
      next: "Peering joins two virtual networks.",
      step: "validate",
      learnUrl: LEARN.peering,
    });
  }
  if (addressSpacesOverlap(addressList(local.properties), addressList(remote.properties))) {
    return failure([{ step: "parse", ok: true }], {
      code: "AddressSpaceOverlap",
      message: "You can't enable virtual network peering if address spaces overlap.",
      next: "Use address spaces that do not overlap, such as 10.0.0.0/16 and 10.2.0.0/16.",
      step: "validate",
      learnUrl: LEARN.peering,
    });
  }
  if (hasPeering(world, local, remote) || hasPeering(world, remote, local)) {
    return failure([{ step: "parse", ok: true }], {
      code: "PeeringExists",
      message: "These virtual networks already have a peering. (sandbox wording)",
      next: "Keep the existing peering, or delete it and create both links again.",
      step: "validate",
      learnUrl: LEARN.peering,
    });
  }
  const link = (
    current: World,
    from: Resource,
    to: Resource,
  ) => createResource(current, {
    armType: "Microsoft.Network/virtualNetworks/virtualNetworkPeerings",
    name: `${from.name}-to-${to.name}`,
    resourceGroup: from.resourceGroup,
    subscriptionId: from.subscriptionId,
    location: from.location,
    parentName: from.name,
    properties: {
      remoteVirtualNetworkId: to.id,
      allowVirtualNetworkAccess: true,
      allowForwardedTraffic: false,
      peeringState: "Connected",
    },
  });
  const first = link(world, local, remote);
  if (!first.ok || !first.value) return first.ok ? failure([{ step: "parse", ok: true }], missing("virtual network", local.id, LEARN.vnet)) : first;
  return link(first.value, remote, local);
}

function addressSpacesOverlap(left: string[], right: string[]): boolean {
  for (const a of left) {
    const parsedA = parseCidr(a);
    if ("error" in parsedA) continue;
    for (const b of right) {
      const parsedB = parseCidr(b);
      if (!("error" in parsedB) && overlapsCidr(parsedA, parsedB)) return true;
    }
  }
  return false;
}

function peeringBetween(world: World, from: Resource, to: Resource): Resource | undefined {
  const prefix = `${canonicalId(from.id)}/virtualnetworkpeerings/`;
  return Object.values(world.resources).find((resource) =>
    isType(resource, "microsoft.network/virtualnetworks/virtualnetworkpeerings") &&
    canonicalId(resource.id).startsWith(prefix) &&
    typeof resource.properties.remoteVirtualNetworkId === "string" &&
    canonicalId(resource.properties.remoteVirtualNetworkId) === canonicalId(to.id),
  );
}

function hasPeering(world: World, from: Resource, to: Resource): boolean {
  return peeringBetween(world, from, to) !== undefined;
}

export function associateNicSecurityGroup(world: World, nicId: string, nsgId: string): Result<World> {
  const existing = world.resources[canonicalId(nicId)];
  return gate(world, "PATCH", nicId, "Microsoft.Network/networkInterfaces", (current) => {
    const nic = current.resources[canonicalId(nicId)];
    const nsg = current.resources[canonicalId(nsgId)];
    if (!nic || !isType(nic, "microsoft.network/networkinterfaces")) return { error: missing("network interface", nicId, LEARN.nic) };
    if (!nsg || !isType(nsg, "microsoft.network/networksecuritygroups")) return { error: missing("network security group", nsgId, LEARN.nsg) };
    const subnetId = nicSubnetId(nic);
    const subnet = subnetId ? current.resources[canonicalId(subnetId)] : undefined;
    if (!subnet) {
      return {
        error: {
          code: "SubnetRequired",
          message: `${nic.name} is not in a subnet. (sandbox wording)`,
          step: "validate",
          learnUrl: LEARN.nic,
          next: "Create the network interface on a subnet first.",
        },
      };
    }
    const vnet = parentVirtualNetwork(current, subnet);
    const regionOf = vnet?.location ?? subnet.location;
    if (nsg.subscriptionId !== nic.subscriptionId || nsg.location.toLowerCase() !== regionOf.toLowerCase()) {
      return {
        error: {
          code: "NsgRegionMismatch",
          message: "The NSG must be in the same subscription and region as the virtual network. (sandbox wording)",
          step: "validate",
          learnUrl: LEARN.nsg,
          next: "Create the network security group in the same region as the virtual network, then select it.",
        },
      };
    }
    const currentNsg = typeof nic.properties.networkSecurityGroupId === "string" ? canonicalId(nic.properties.networkSecurityGroupId) : "";
    if (currentNsg && currentNsg !== canonicalId(nsg.id)) {
      return {
        error: {
          code: "NsgAlreadyAssociated",
          message: `Network interface ${nic.name} is already associated with another network security group. (sandbox wording)`,
          step: "validate",
          learnUrl: LEARN.nsg,
          next: "Keep the group already on this network interface, or reset the subscription. This page cannot replace it.",
        },
      };
    }
    const next = cloneWorld(current);
    const target = next.resources[canonicalId(nic.id)];
    target.properties = {
      ...target.properties,
      networkSecurityGroupId: nsg.id,
      networkSecurityGroup: { id: nsg.id },
      provisioningState: "Succeeded",
    };
    return { world: next };
  }, { policy: existing ? subjectFromResource(existing) : undefined });
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
    if (isType(existing, "microsoft.compute/virtualmachines")) removeAutoRecordsForVm(next, existing.id);
    if (isType(existing, "microsoft.network/virtualnetworks")) removePrivateDnsForVnet(next, existing);
    if (isType(existing, "microsoft.network/privatednszones/virtualnetworklinks") && existing.properties.registrationEnabled === true) {
      const zone = zoneOwning(next, existing);
      const linkedId = linkedVnetId(existing);
      const linked = linkedId ? next.resources[canonicalId(linkedId)] : undefined;
      if (zone && linked) clearAutoRecords(next, zone, linked);
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
            next: "Delete the resource in the other group that points here, then try again.",
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
  const changed = gate(world, "POST", id, "Microsoft.Compute/virtualMachines", (current) => {
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
          next: "Start works from Stopped or Deallocated. Stop works from Running. Deallocate works from Running or Stopped.",
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
  if (!changed.ok || !changed.value) return changed;
  const next = cloneWorld(changed.value);
  writeAutoRecord(next, id);
  return { ...changed, value: next };
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
  return typeKey === "microsoft.network/dnszones"
    || typeKey === "microsoft.network/privatednszones"
    || typeKey === "microsoft.network/privatednszones/virtualnetworklinks"
    || typeKey === "microsoft.network/privatednszones/a";
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

function isType(resource: Resource, typeKey: string): boolean {
  return resource.type.toLowerCase() === typeKey;
}

function differentPlace(left: Resource, right: Resource): boolean {
  return left.subscriptionId !== right.subscriptionId || left.location.toLowerCase() !== right.location.toLowerCase();
}

function linkedIds(resource: Resource, flatKey: string): string[] {
  const ids = stringsOf(resource.properties[flatKey]).map((id) => canonicalId(id));
  const profile = resource.properties.networkProfile;
  if (profile && typeof profile === "object") {
    const nics = (profile as { networkInterfaces?: unknown }).networkInterfaces;
    if (Array.isArray(nics)) {
      for (const nic of nics) {
        if (nic && typeof nic === "object" && typeof (nic as { id?: unknown }).id === "string") {
          ids.push(canonicalId((nic as { id: string }).id));
        }
      }
    }
  }
  return ids;
}

function withPublicIp(properties: Record<string, unknown>, publicIpId: string): Record<string, unknown> {
  const configs = Array.isArray(properties.ipConfigurations) ? properties.ipConfigurations : [];
  const nextConfigs = configs.length === 0
    ? [{ name: "ipconfig1", publicIpAddressId: publicIpId, properties: { publicIPAddress: { id: publicIpId } } }]
    : configs.map((config, index) => {
        if (index !== 0 || !config || typeof config !== "object") return config;
        const record = config as Record<string, unknown>;
        const nested = record.properties && typeof record.properties === "object" ? { ...(record.properties as Record<string, unknown>) } : {};
        return {
          ...record,
          publicIpAddressId: publicIpId,
          properties: { ...nested, publicIPAddress: { id: publicIpId } },
        };
      });
  return { ...properties, publicIpAddressId: publicIpId, ipConfigurations: nextConfigs, provisioningState: "Succeeded" };
}

function nicSubnetId(nic: Resource): string | null {
  if (typeof nic.properties.subnetId === "string") return nic.properties.subnetId;
  const configs = nic.properties.ipConfigurations;
  if (!Array.isArray(configs)) return null;
  for (const config of configs) {
    if (!config || typeof config !== "object") continue;
    const record = config as Record<string, unknown>;
    if (typeof record.subnetId === "string") return record.subnetId;
    const props = record.properties;
    if (props && typeof props === "object") {
      const subnet = (props as { subnet?: { id?: unknown } }).subnet;
      if (subnet && typeof subnet.id === "string") return subnet.id;
    }
  }
  return null;
}

function parentVirtualNetwork(world: World, subnet: Resource): Resource | null {
  const marker = "/subnets/";
  const at = subnet.id.toLowerCase().lastIndexOf(marker);
  if (at < 0) return null;
  return world.resources[canonicalId(subnet.id.slice(0, at))] ?? null;
}

function ruleInputError(input: { port: number; access: string; priority: number }): EngineError | null {
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
    return {
      code: "InvalidPort",
      message: "Record one destination port, from 1 to 65535. (sandbox wording)",
      step: "validate",
      learnUrl: LEARN.nsgOverview,
      next: "Enter a whole number from 1 to 65535.",
    };
  }
  if (!Number.isInteger(input.priority) || input.priority < 100 || input.priority > 4096) {
    return {
      code: "InvalidPriority",
      message: "Priority is a number between 100 and 4096. (sandbox wording)",
      step: "validate",
      learnUrl: LEARN.nsgOverview,
      next: "Enter a whole number from 100 to 4096.",
    };
  }
  if (input.access !== "Allow" && input.access !== "Deny") {
    return {
      code: "InvalidAccess",
      message: "A rule allows or denies. (sandbox wording)",
      step: "validate",
      learnUrl: LEARN.nsgOverview,
    };
  }
  return null;
}

function duplicateRuleError(existingRules: unknown[], direction: string, priority: number, name: string, nsgName: string): EngineError | null {
  const duplicate = existingRules.some((rule) => {
    const fields = ruleFields(rule);
    return fields?.direction.toLowerCase() === direction.toLowerCase() && fields.priority === priority;
  });
  if (duplicate) {
    return {
      code: "DuplicateRulePriority",
      message: "You can't create two rules with the same priority and direction.",
      step: "validate",
      learnUrl: LEARN.nsgOverview,
      next: "Use a different priority. The same number is allowed once in each direction. This page cannot change or remove a rule.",
    };
  }
  if (existingRules.some((rule) => ruleName(rule).toLowerCase() === name.toLowerCase())) {
    return {
      code: "DuplicateRuleName",
      message: `A rule named ${name} already exists in ${nsgName}. (sandbox wording)`,
      step: "validate",
      learnUrl: LEARN.nsgOverview,
      next: "Change the port, action, or priority. The name is built from those.",
    };
  }
  return null;
}

function tcpSecurityRule(
  input: { port: number; access: "Allow" | "Deny"; priority: number },
  direction: "Inbound" | "Outbound",
  scope: "internet" | "vnet" = "internet",
) {
  const outbound = direction === "Outbound";
  const vnet = scope === "vnet";
  return {
    name: vnet
      ? `${input.access}-${input.port}-${direction}-VirtualNetwork-${input.priority}`
      : `${input.access}-${input.port}-${direction}-${input.priority}`,
    properties: {
      priority: input.priority,
      direction,
      access: input.access,
      protocol: "Tcp",
      sourceAddressPrefix: vnet ? "VirtualNetwork" : outbound ? "*" : "Internet",
      sourcePortRange: "*",
      destinationAddressPrefix: vnet ? "VirtualNetwork" : outbound ? "Internet" : "*",
      destinationPortRange: String(input.port),
    },
  };
}

function ruleName(rule: unknown): string {
  if (rule && typeof rule === "object" && typeof (rule as { name?: unknown }).name === "string") return (rule as { name: string }).name;
  return "";
}

function ruleFields(rule: unknown): { priority: number; direction: string } | null {
  if (!rule || typeof rule !== "object") return null;
  const props = (rule as { properties?: unknown }).properties;
  if (!props || typeof props !== "object") return null;
  const priority = (props as { priority?: unknown }).priority;
  const direction = (props as { direction?: unknown }).direction;
  if (typeof priority !== "number" || typeof direction !== "string") return null;
  return { priority, direction };
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
      next: "Type a different name. This check only looks inside the sandbox.",
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
    next: "Type a different name.",
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
    return quote("You can delete a subnet only if there are no resources in the subnet.", LEARN.subnet, "Delete the network interface in this subnet first. If a virtual machine uses that interface, delete the virtual machine first.");
  }
  if (typeKey === "microsoft.network/virtualnetworks") {
    const subnetIds = new Set(
      Object.values(world.resources)
        .filter((other) => canonicalId(other.id).startsWith(`${id}/subnets/`))
        .map((other) => canonicalId(other.id)),
    );
    subnetIds.add(id);
    if (mentions((other) => referencedIds(other).some((ref) => subnetIds.has(canonicalId(ref))))) {
      return quote("You can delete a virtual network only if there are no resources connected to it.", LEARN.vnet, "Delete the network interfaces on its subnets first. Delete a virtual machine that uses one of those interfaces before the interface.");
    }
  }
  if (typeKey === "microsoft.network/networkinterfaces" && mentions((other) => referencedIds(other).some((ref) => canonicalId(ref) === id))) {
    return quote("You can delete a NIC only when the NIC isn't attached to a VM.", LEARN.nic, "Delete the virtual machine that uses this network interface first.");
  }
  if (typeKey === "microsoft.network/networksecuritygroups" && mentions((other) => referencedIds(other).includes(resource.id) || referencedIds(other).some((ref) => canonicalId(ref) === id))) {
    return quote("If an NSG is associated with any subnets or network interfaces, you can't delete it.", LEARN.nsg, "This page cannot remove an association. Reset the subscription if you need to delete this group.");
  }
  if (typeKey === "microsoft.network/applicationsecuritygroups" && mentions((other) => referencedIds(other).some((ref) => canonicalId(ref) === id))) {
    return quote("You can't delete an application security group if it contains any network interfaces.", LEARN.nsg);
  }
  if (typeKey === "microsoft.network/routetables" && mentions((other) => referencedIds(other).some((ref) => canonicalId(ref) === id))) {
    return quote("You can't delete a route table associated to any subnets.", LEARN.routeTable, "This page cannot remove an association. Reset the subscription if you need to delete this table.");
  }
  if (typeKey === "microsoft.network/publicipaddresses" && mentions((other) => referencedIds(other).some((ref) => canonicalId(ref) === id))) {
    return quote(
      "Deletion of public IPs requires that the public IP object isn't associated to any IP configuration or virtual machine network interface.",
      LEARN.publicIp,
      "This page cannot detach an address. Reset the subscription if you need to delete it.",
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

function quote(message: string, learnUrl: string, next?: string): EngineError {
  return { code: "DeleteBlocked", message, step: "validate", learnUrl, next };
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
