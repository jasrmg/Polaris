/**
 * Checks the pipeline runs before it changes the world.
 * Each function cites the Learn page the rule comes from.
 */

import type { EngineError } from "../core/result";
import { containsCidr, overlapsCidr, parseCidr, subnetTooSmall, type Cidr } from "./cidr";
import { LIMITS, MANUAL_PROVIDERS, REGIONS } from "./constants";
import { canonicalId, parseId } from "./ids";
import { LEARN } from "./learn";
import type { HttpMethod, Resource, SubscriptionState, World } from "./types";

export function cloneWorld(world: World): World {
  return structuredClone(world);
}

export function findSubscription(world: World, idOrGuid: string) {
  const key = idOrGuid.startsWith("/subscriptions/")
    ? canonicalId(idOrGuid)
    : canonicalId(`/subscriptions/${idOrGuid}`);
  return world.subscriptions[key] ?? null;
}

export function findResourceGroup(world: World, subGuid: string, name: string) {
  return world.resourceGroups[canonicalId(`/subscriptions/${subGuid}/resourceGroups/${name}`)] ?? null;
}

export function namespaceOf(armType: string): string {
  return armType.split("/")[0] ?? armType;
}

const GLOBAL_LOCATION = new Set([
  "microsoft.network/dnszones",
  "microsoft.network/privatednszones",
]);

export function requiresGlobalLocation(armType: string): boolean {
  return GLOBAL_LOCATION.has(armType.toLowerCase());
}

export function validateLocation(armType: string, location: string): EngineError | null {
  if (requiresGlobalLocation(armType)) {
    if (location.toLowerCase() !== "global") {
      return {
        code: "InvalidLocation",
        message: "Azure DNS zones are nonregional. The location is global. (sandbox wording)",
        step: "validate",
        learnUrl: LEARN.nonregional,
        target: location,
      };
    }
    return null;
  }
  if (!REGIONS.includes(location.toLowerCase() as (typeof REGIONS)[number])) {
    return {
      code: "InvalidLocation",
      message: `This sandbox has two regions: southeastasia and eastasia. "${location}" is not one of them. (sandbox wording)`,
      step: "validate",
      learnUrl: LEARN.regions,
      target: location,
    };
  }
  return null;
}

export function validateTags(tags: Record<string, string> | undefined): EngineError | null {
  if (!tags) return null;
  const keys = Object.keys(tags);
  if (keys.length > LIMITS.tags) {
    return {
      code: "TooManyTags",
      message: `A resource can have ${LIMITS.tags} tags. (sandbox wording)`,
      step: "validate",
      learnUrl: LEARN.limits,
    };
  }
  for (const key of keys) {
    if (key.length > LIMITS.tagKey || tags[key].length > LIMITS.tagValue) {
      return {
        code: "TagTooLong",
        message: `A tag key can be ${LIMITS.tagKey} characters and a value ${LIMITS.tagValue}. (sandbox wording)`,
        step: "validate",
        learnUrl: LEARN.limits,
        target: key,
      };
    }
  }
  return null;
}

export function subscriptionAllows(state: SubscriptionState, method: HttpMethod): EngineError | null {
  if (state === "Deleted") {
    return {
      code: "SubscriptionDeleted",
      message: "A deleted subscription allows no operations. (sandbox wording)",
      step: "subscription state",
      learnUrl: LEARN.subscriptionStates,
    };
  }
  if ((state === "Warned" || state === "Disabled") && method !== "GET" && method !== "DELETE") {
    return {
      code: "SubscriptionNotActive",
      message:
        state === "Warned"
          ? "A warned subscription allows GET and DELETE, not create or update. (sandbox wording)"
          : "A disabled subscription allows GET and DELETE. PUT, PATCH and POST are blocked. (sandbox wording)",
      step: "subscription state",
      learnUrl: LEARN.subscriptionStates,
    };
  }
  return null;
}

export function ancestorScopes(world: World, id: string): string[] {
  const scopes: string[] = [id];
  const parsed = parseId(id);
  if (parsed?.armType && parsed.subscriptionId && parsed.resourceGroup && parsed.name) {
    const parts = id.split("/").filter(Boolean);
    const providersAt = parts.findIndex((p) => p.toLowerCase() === "providers");
    const rest = parts.slice(providersAt + 2);
    while (rest.length > 2) {
      rest.splice(rest.length - 2, 2);
      const parent = `/${parts.slice(0, providersAt + 2).join("/")}/${rest.join("/")}`;
      scopes.push(parent);
    }
    scopes.push(`/subscriptions/${parsed.subscriptionId}/resourceGroups/${parsed.resourceGroup}`);
    scopes.push(`/subscriptions/${parsed.subscriptionId}`);
  } else if (parsed?.resourceGroup && parsed.subscriptionId) {
    scopes.push(`/subscriptions/${parsed.subscriptionId}`);
  } else if (parsed?.subscriptionId && !parsed.resourceGroup) {
    // subscription itself is already in the list
  }
  const subGuid = parsed?.subscriptionId;
  if (subGuid) {
    const sub = findSubscription(world, subGuid);
    let parent: string | null = sub?.parentId ?? null;
    const seen = new Set<string>();
    while (parent) {
      if (seen.has(canonicalId(parent))) break;
      seen.add(canonicalId(parent));
      scopes.push(parent);
      parent = world.managementGroups[canonicalId(parent)]?.parentId ?? null;
    }
  }
  return scopes;
}

export function lockConflict(world: World, id: string, method: HttpMethod): EngineError | null {
  if (method === "GET") return null;
  const scopes = new Set(ancestorScopes(world, id).map(canonicalId));
  let readOnly = false;
  let canNotDelete = false;
  for (const lock of Object.values(world.locks)) {
    if (!scopes.has(canonicalId(lock.scope))) continue;
    if (lock.level === "ReadOnly") readOnly = true;
    if (lock.level === "CanNotDelete") canNotDelete = true;
  }
  if (readOnly) {
    return {
      code: "ScopeLocked",
      message: "A ReadOnly lock blocks delete and update. The most restrictive lock in the chain wins. (sandbox wording)",
      step: "locks",
      learnUrl: LEARN.locks,
      target: id,
    };
  }
  if (canNotDelete && method === "DELETE") {
    return {
      code: "ScopeLocked",
      message: "A CanNotDelete lock blocks delete. Locks inherit from parent scopes. (sandbox wording)",
      step: "locks",
      learnUrl: LEARN.locks,
      target: id,
    };
  }
  return null;
}

export function providerGate(
  world: World,
  subGuid: string,
  armType: string,
): { error: EngineError } | { world: World } {
  const namespace = namespaceOf(armType);
  const key = namespace.toLowerCase();
  const subKey = canonicalId(`/subscriptions/${subGuid}`);
  const table = world.providerRegistrations[subKey] ?? {};
  const state = table[key] ?? "NotRegistered";
  if (state === "Registered" || state === "Registering") return { world };
  if (MANUAL_PROVIDERS.has(key)) {
    return {
      error: {
        code: "MissingSubscriptionRegistration",
        message: `The subscription is not registered to use namespace ${namespace}.`,
        step: "resource provider registered?",
        learnUrl: LEARN.providerErrors,
        target: namespace,
      },
    };
  }
  const next = cloneWorld(world);
  next.providerRegistrations[subKey] = { ...table, [key]: "Registered" };
  return { world: next };
}

export function stringsOf(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return [];
}

export function referencedIds(resource: Resource): string[] {
  const props = resource.properties;
  const ids = [
    ...stringsOf(props.subnetId),
    ...stringsOf(props.networkSecurityGroupId),
    ...stringsOf(props.routeTableId),
    ...stringsOf(props.publicIpAddressId),
    ...stringsOf(props.applicationSecurityGroupIds),
    ...stringsOf(props.nicIds),
    ...stringsOf(props.remoteVirtualNetworkId),
  ];
  if (resource.managedBy) ids.push(resource.managedBy);
  const configs = props.ipConfigurations;
  if (Array.isArray(configs)) {
    for (const config of configs) {
      if (config && typeof config === "object") {
        const record = config as Record<string, unknown>;
        ids.push(...stringsOf(record.subnetId), ...stringsOf(record.publicIpAddressId));
      }
    }
  }
  return ids;
}

export function sameName(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export function addressPrefixes(resource: Resource): Cidr[] {
  const space = resource.properties.addressSpace;
  const raw =
    space && typeof space === "object"
      ? stringsOf((space as { addressPrefixes?: unknown }).addressPrefixes)
      : stringsOf(resource.properties.addressPrefix);
  const parsed: Cidr[] = [];
  for (const value of raw) {
    const cidr = parseCidr(value);
    if (!("error" in cidr)) parsed.push(cidr);
  }
  return parsed;
}

export function cidrError(message: string, target?: string): EngineError {
  return { code: "InvalidAddressPrefix", message, step: "validate", learnUrl: LEARN.subnet, target };
}

export function validateSubnetPrefix(parent: Resource, prefix: string, siblings: Resource[]): EngineError | null {
  const cidr = parseCidr(prefix);
  if ("error" in cidr) return cidrError(cidr.error, prefix);
  if (subnetTooSmall(cidr)) {
    return cidrError("Azure reserves five addresses in a subnet, so a prefix more specific than /29 does not fit. (sandbox wording)", prefix);
  }
  const parents = addressPrefixes(parent);
  if (parents.length === 0) {
    return cidrError("The virtual network has no address space for this subnet. (sandbox wording)", parent.id);
  }
  if (!parents.some((outer) => containsCidr(outer, cidr))) {
    return cidrError("A subnet's address prefix must fit inside its virtual network. (sandbox wording)", prefix);
  }
  for (const sibling of siblings) {
    const other = sibling.properties.addressPrefix;
    if (typeof other !== "string") continue;
    const parsed = parseCidr(other);
    if (!("error" in parsed) && overlapsCidr(cidr, parsed)) {
      return cidrError(`Subnet prefixes overlap: ${prefix} and ${other}. (sandbox wording)`, prefix);
    }
  }
  return null;
}

export function validateVnetPrefixes(prefixes: string[]): EngineError | null {
  if (prefixes.length === 0) {
    return cidrError("A virtual network needs an address space. (sandbox wording)");
  }
  const parsed: Cidr[] = [];
  for (const prefix of prefixes) {
    const cidr = parseCidr(prefix);
    if ("error" in cidr) return cidrError(cidr.error, prefix);
    if (subnetTooSmall(cidr)) {
      return cidrError("An address prefix more specific than /29 cannot hold a subnet. Azure reserves five addresses. (sandbox wording)", prefix);
    }
    for (const existing of parsed) {
      if (overlapsCidr(existing, cidr)) {
        return cidrError(`Address prefixes overlap: ${prefix}. (sandbox wording)`, prefix);
      }
    }
    parsed.push(cidr);
  }
  return null;
}
