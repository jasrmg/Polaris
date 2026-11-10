/**
 * Private addresses for network interfaces.
 * Learn reserves the first four addresses and the last address in a subnet.
 * Dynamic allocation is not guaranteed to be the next address, so the sandbox
 * assigns the lowest free address and the UI says so.
 * https://learn.microsoft.com/en-us/azure/virtual-network/ip-services/private-ip-addresses
 */

import { parseCidr } from "./cidr";
import { canonicalId } from "./ids";
import type { Resource, World } from "./types";

export function assignedPrivateIp(world: World, nic: Resource): string | null {
  return privateIpsInSubnet(world, subnetOf(world, nic)).get(canonicalId(nic.id)) ?? null;
}

export function nextPrivateIp(world: World, subnet: Resource): string | null {
  const prefix = subnet.properties.addressPrefix;
  if (typeof prefix !== "string") return null;
  const taken = new Set(privateIpsInSubnet(world, subnet).values());
  return nextFree(prefix, taken);
}

function privateIpsInSubnet(world: World, subnet: Resource | null): Map<string, string> {
  const assigned = new Map<string, string>();
  if (!subnet) return assigned;
  const prefix = subnet.properties.addressPrefix;
  if (typeof prefix !== "string") return assigned;
  const nics = Object.values(world.resources)
    .filter((resource) => {
      const home = subnetOf(world, resource);
      return resource.type.toLowerCase() === "microsoft.network/networkinterfaces" && home && canonicalId(home.id) === canonicalId(subnet.id);
    })
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
  const taken = new Set<string>();
  for (const nic of nics) {
    const stored = storedIp(nic);
    if (!stored) continue;
    assigned.set(canonicalId(nic.id), stored);
    taken.add(stored);
  }
  for (const endpoint of Object.values(world.resources)) {
    if (endpoint.type.toLowerCase() !== "microsoft.network/privateendpoints") continue;
    const home = typeof endpoint.properties.subnetId === "string" ? endpoint.properties.subnetId : "";
    if (canonicalId(home) !== canonicalId(subnet.id)) continue;
    const ip = endpoint.properties.privateIPAddress;
    if (typeof ip === "string" && ip) taken.add(ip);
  }
  for (const nic of nics) {
    if (assigned.has(canonicalId(nic.id))) continue;
    const address = nextFree(prefix, taken);
    if (!address) break;
    assigned.set(canonicalId(nic.id), address);
    taken.add(address);
  }
  return assigned;
}

function nextFree(prefix: string, taken: Set<string>): string | null {
  const parsed = parseCidr(prefix);
  if ("error" in parsed || parsed.size < 8) return null;
  for (let offset = 4; offset <= parsed.size - 2; offset += 1) {
    const address = formatIp((parsed.network + offset) >>> 0);
    if (!taken.has(address)) return address;
  }
  return null;
}

function storedIp(nic: Resource): string | null {
  return typeof nic.properties.privateIPAddress === "string" && nic.properties.privateIPAddress ? nic.properties.privateIPAddress : null;
}

function subnetOf(world: World, nic: Resource): Resource | null {
  const direct = typeof nic.properties.subnetId === "string" ? nic.properties.subnetId : null;
  const nested = ipConfigSubnet(nic);
  const id = direct ?? nested;
  return id ? world.resources[canonicalId(id)] ?? null : null;
}

function ipConfigSubnet(nic: Resource): string | null {
  const configs = nic.properties.ipConfigurations;
  if (!Array.isArray(configs)) return null;
  for (const config of configs) {
    if (!config || typeof config !== "object") continue;
    const props = (config as { properties?: unknown }).properties;
    if (!props || typeof props !== "object") continue;
    const subnet = (props as { subnet?: { id?: unknown } }).subnet;
    if (subnet && typeof subnet.id === "string") return subnet.id;
  }
  return null;
}

function formatIp(value: number): string {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join(".");
}

export function withPrivateIp(properties: Record<string, unknown>, address: string): Record<string, unknown> {
  const configs = Array.isArray(properties.ipConfigurations) ? properties.ipConfigurations : [];
  const next = configs.map((item, index) => {
    if (index !== 0 || !item || typeof item !== "object") return item;
    const record = item as { properties?: unknown };
    const props = record.properties && typeof record.properties === "object" ? record.properties as Record<string, unknown> : {};
    return {
      ...record,
      properties: {
        ...props,
        privateIPAddress: address,
        privateIPAllocationMethod: typeof props.privateIPAllocationMethod === "string" ? props.privateIPAllocationMethod : "Dynamic",
      },
    };
  });
  return {
    ...properties,
    privateIPAddress: address,
    ...(next.length > 0 ? { ipConfigurations: next } : {}),
  };
}
