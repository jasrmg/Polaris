/**
 * ARM-style IDs. Segment keywords and names compare case-insensitively.
 * Learn: scope-overview, resource-name-rules.
 */

import { LEARN } from "./learn";

export function canonicalId(id: string): string {
  return id.trim().toLowerCase();
}

export function subscriptionId(guid: string): string {
  return `/subscriptions/${guid}`;
}

export function managementGroupId(name: string): string {
  return `/providers/Microsoft.Management/managementGroups/${name}`;
}

export function resourceGroupId(subGuid: string, name: string): string {
  return `/subscriptions/${subGuid}/resourceGroups/${name}`;
}

const FIXED_CHILD: Record<string, string> = {
  blobservices: "default",
  fileservices: "default",
};

/**
 * Build a resource ID. `names` lines up with the type segments after the namespace.
 * blobServices and fileServices use the fixed name "default".
 */
export function resourceId(subGuid: string, resourceGroup: string, armType: string, names: string[]): string {
  const [namespace, ...segments] = armType.split("/");
  if (!namespace || segments.length === 0) {
    throw new Error(`Cannot build an ID for ${armType}`);
  }
  const queue = [...names];
  const pairs = segments.map((segment) => {
    const fixed = FIXED_CHILD[segment.toLowerCase()];
    const name = fixed ?? queue.shift();
    if (!name) throw new Error(`Cannot build an ID for ${armType}`);
    return `${segment}/${name}`;
  });
  if (queue.length > 0) throw new Error(`Cannot build an ID for ${armType}`);
  return `/subscriptions/${subGuid}/resourceGroups/${resourceGroup}/providers/${namespace}/${pairs.join("/")}`;
}

export interface ParsedId {
  subscriptionId?: string;
  resourceGroup?: string;
  armType?: string;
  name?: string;
  managementGroup?: string;
}

/** Parse the keywords resourceGroups and providers without caring about case. */
export function parseId(id: string): ParsedId | null {
  const parts = id.split("/").filter(Boolean);
  const lower = parts.map((p) => p.toLowerCase());
  const subAt = lower.indexOf("subscriptions");
  const rgAt = lower.indexOf("resourcegroups");
  const providersAt = lower.indexOf("providers");
  const mgTypeAt = lower.indexOf("managementgroups");

  if (mgTypeAt >= 0 && providersAt >= 0 && lower[providersAt + 1] === "microsoft.management") {
    const name = parts[mgTypeAt + 1];
    if (!name) return null;
    return { managementGroup: name, armType: "Microsoft.Management/managementGroups", name };
  }

  if (subAt < 0 || !parts[subAt + 1]) return null;
  const sub = parts[subAt + 1];
  if (rgAt < 0) {
    if (providersAt < 0) return { subscriptionId: sub };
    return null;
  }
  const rg = parts[rgAt + 1];
  if (!rg) return null;
  if (providersAt < 0) return { subscriptionId: sub, resourceGroup: rg };
  const namespace = parts[providersAt + 1];
  if (!namespace) return null;
  const rest = parts.slice(providersAt + 2);
  if (rest.length < 2 || rest.length % 2 !== 0) return null;
  const typeSegments: string[] = [];
  let name = "";
  for (let i = 0; i < rest.length; i += 2) {
    typeSegments.push(rest[i]);
    name = rest[i + 1];
  }
  return {
    subscriptionId: sub,
    resourceGroup: rg,
    armType: `${namespace}/${typeSegments.join("/")}`,
    name,
  };
}

export const ID_LEARN = LEARN.scope;
