/**
 * One reachability question: a new inbound TCP connection from the internet
 * to a virtual machine's public IP, on one port.
 * Subnet network security group first, then the network interface.
 * Routes, peering, DNS, and appliances are not part of this check.
 * Sources: docs/research/networking-rules.md sections 1.1–1.4 and decision N1.
 */

import { failure, success, type Result, type TraceLine } from "../core/result";
import { canonicalId } from "./ids";
import { LEARN } from "./learn";
import type { Resource, World } from "./types";

export interface InboundCheck {
  allowed: boolean;
  summary: string;
  learnUrl: string;
}

interface Rule {
  name: string;
  priority: number;
  source: string;
  sourcePorts: string;
  destination: string;
  destinationPorts: string;
  protocol: string;
  access: "Allow" | "Deny";
}

const DEFAULT_INBOUND: Rule[] = [
  {
    name: "defaultSecurityRules/AllowVNetInBound",
    priority: 65000,
    source: "VirtualNetwork",
    sourcePorts: "0-65535",
    destination: "VirtualNetwork",
    destinationPorts: "0-65535",
    protocol: "Any",
    access: "Allow",
  },
  {
    name: "defaultSecurityRules/AllowAzureLoadBalancerInBound",
    priority: 65001,
    source: "AzureLoadBalancer",
    sourcePorts: "0-65535",
    destination: "0.0.0.0/0",
    destinationPorts: "0-65535",
    protocol: "Any",
    access: "Allow",
  },
  {
    name: "defaultSecurityRules/DenyAllInBound",
    priority: 65500,
    source: "0.0.0.0/0",
    sourcePorts: "0-65535",
    destination: "0.0.0.0/0",
    destinationPorts: "0-65535",
    protocol: "Any",
    access: "Deny",
  },
];

export function checkInboundInternet(world: World, vmId: string, port: number): Result<InboundCheck> {
  const trace: TraceLine[] = [{ step: "parse", ok: true, detail: "Inbound TCP from the internet." }];
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return failure(trace, {
      code: "InvalidPort",
      message: "Record one destination port, from 1 to 65535. (sandbox wording)",
      step: "validate",
      learnUrl: LEARN.nsgOverview,
    });
  }
  const vm = world.resources[canonicalId(vmId)];
  if (!vm || vm.type.toLowerCase() !== "microsoft.compute/virtualmachines") {
    return failure(trace, {
      code: "ResourceNotFound",
      message: `The virtual machine '${vmId}' was not found. (sandbox wording)`,
      step: "validate",
      learnUrl: LEARN.armOverview,
    });
  }
  const nicId = firstId(vm.properties.nicIds) ?? profileNicId(vm);
  const nic = nicId ? world.resources[canonicalId(nicId)] : undefined;
  if (!nic) {
    return answered(trace, false, `${vm.name} has no network interface, so there is no path for this check. (sandbox wording)`, LEARN.nic);
  }
  const pipId = firstId(nic.properties.publicIpAddressId) ?? ipConfigId(nic, "publicIpAddressId", "publicIPAddress");
  const pip = pipId ? world.resources[canonicalId(pipId)] : undefined;
  if (!pip) {
    return answered(trace, false, `${nic.name} has no public IP address, so there is no inbound path from the internet. (sandbox wording)`, LEARN.publicIp);
  }
  const subnetId = firstId(nic.properties.subnetId) ?? ipConfigId(nic, "subnetId", "subnet");
  const subnet = subnetId ? world.resources[canonicalId(subnetId)] : undefined;
  if (!subnet) {
    return answered(trace, false, `${nic.name} is not in a subnet. (sandbox wording)`, LEARN.subnet);
  }

  trace.push({
    step: "validate",
    ok: true,
    detail: `${vm.name} uses ${nic.name} and ${pip.name}. Destination port ${port}.`,
  });

  const subnetNsgId = firstId(subnet.properties.networkSecurityGroupId) ?? nestedId(subnet.properties, "networkSecurityGroup");
  const subnetNsg = subnetNsgId ? world.resources[canonicalId(subnetNsgId)] : undefined;
  const nicNsgId = firstId(nic.properties.networkSecurityGroupId) ?? nestedId(nic.properties, "networkSecurityGroup");
  const nicNsg = nicNsgId ? world.resources[canonicalId(nicNsgId)] : undefined;

  if (!subnetNsg && !nicNsg) {
    trace.push({ step: "apply", ok: true, detail: `No network security group on ${subnet.name}. No NSG at this layer.` });
    trace.push({ step: "apply", ok: true, detail: `No network security group on ${nic.name}. No NSG at this layer.` });
    return answered(
      trace,
      false,
      "Inbound from the internet to a Standard public IP is denied.",
      LEARN.nsgHowItWorks,
    );
  }

  if (!subnetNsg) {
    trace.push({ step: "apply", ok: true, detail: `No network security group on ${subnet.name}. No NSG at this layer.` });
  } else {
    const matched = firstMatch(subnetNsg, port);
    const line = ruleLine(matched);
    trace.push({ step: "apply", ok: true, detail: `${subnet.name} uses ${subnetNsg.name}. ${line}` });
    if (matched.access === "Deny") {
      trace.push({ step: "apply", ok: true, detail: "The subnet network security group denied the traffic. The network interface does not see it." });
      return answered(trace, false, verdict(matched), LEARN.nsgOverview);
    }
  }

  if (!nicNsg) {
    if (!subnetNsg) {
      return answered(trace, false, "Inbound from the internet to a Standard public IP is denied.", LEARN.nsgHowItWorks);
    }
    trace.push({ step: "apply", ok: true, detail: `No network security group on ${nic.name}. It gets whatever the subnet network security group allows.` });
    return answered(trace, true, verdict(firstMatch(subnetNsg, port)), LEARN.nsgHowItWorks);
  }

  const matched = firstMatch(nicNsg, port);
  trace.push({ step: "apply", ok: true, detail: `${nic.name} uses ${nicNsg.name}. ${ruleLine(matched)}` });
  return answered(trace, matched.access === "Allow", verdict(matched), LEARN.nsgOverview);
}

function answered(trace: TraceLine[], allowed: boolean, summary: string, learnUrl: string): Result<InboundCheck> {
  trace.push({ step: "lifecycle", ok: true, detail: summary });
  return success(trace, { allowed, summary, learnUrl });
}

function firstMatch(nsg: Resource, port: number): Rule {
  const custom = customRules(nsg);
  const rules = [...custom, ...DEFAULT_INBOUND].sort((a, b) => a.priority - b.priority);
  return rules.find((rule) => ruleMatches(rule, port)) ?? DEFAULT_INBOUND[2];
}

function customRules(nsg: Resource): Rule[] {
  const raw = nsg.properties.securityRules;
  if (!Array.isArray(raw)) return [];
  const rules: Rule[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as { name?: unknown; properties?: unknown };
    const props = record.properties;
    if (!props || typeof props !== "object") continue;
    const fields = props as Record<string, unknown>;
    if (typeof fields.priority !== "number") continue;
    if (typeof fields.direction !== "string" || fields.direction.toLowerCase() !== "inbound") continue;
    const access = typeof fields.access === "string" ? fields.access.toLowerCase() : "";
    if (access !== "allow" && access !== "deny") continue;
    rules.push({
      name: `securityRules/${typeof record.name === "string" ? record.name : "rule"}`,
      priority: fields.priority,
      source: stringField(fields.sourceAddressPrefix, "*"),
      sourcePorts: stringField(fields.sourcePortRange, "*"),
      destination: stringField(fields.destinationAddressPrefix, "*"),
      destinationPorts: stringField(fields.destinationPortRange, "*"),
      protocol: stringField(fields.protocol, "Any"),
      access: access === "allow" ? "Allow" : "Deny",
    });
  }
  return rules;
}

function ruleMatches(rule: Rule, port: number): boolean {
  const protocol = rule.protocol.toLowerCase();
  if (protocol !== "tcp" && protocol !== "any") return false;
  if (!sourceIsInternet(rule.source)) return false;
  if (!destinationIsPrivate(rule.destination)) return false;
  if (!portSpecMatches(rule.sourcePorts, null)) return false;
  return portSpecMatches(rule.destinationPorts, port);
}

function sourceIsInternet(source: string): boolean {
  const value = source.trim().toLowerCase();
  return value === "*" || value === "any" || value === "internet" || value === "0.0.0.0/0";
}

function destinationIsPrivate(destination: string): boolean {
  const value = destination.trim().toLowerCase();
  return value === "*" || value === "any" || value === "0.0.0.0/0" || value === "virtualnetwork";
}

function portSpecMatches(spec: string, port: number | null): boolean {
  return spec.split(",").some((part) => {
    const piece = part.trim();
    if (piece === "*" || piece.toLowerCase() === "any") return true;
    const range = /^(\d+)-(\d+)$/.exec(piece);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (port === null) return start === 0 && end === 65535;
      return port >= start && port <= end;
    }
    if (port === null) return false;
    return piece === String(port);
  });
}

function ruleLine(rule: Rule): string {
  return `${rule.access} ${rule.name}, priority ${rule.priority}.`;
}

function verdict(rule: Rule): string {
  return `${rule.access === "Allow" ? "Allowed" : "Denied"}. ${rule.name}, priority ${rule.priority}.`;
}

function stringField(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function firstId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return null;
}

function profileNicId(vm: Resource): string | null {
  const profile = vm.properties.networkProfile;
  if (!profile || typeof profile !== "object") return null;
  const nics = (profile as { networkInterfaces?: unknown }).networkInterfaces;
  if (!Array.isArray(nics) || !nics[0] || typeof nics[0] !== "object") return null;
  const id = (nics[0] as { id?: unknown }).id;
  return typeof id === "string" ? id : null;
}

function nestedId(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object") return null;
  const nested = (value as Record<string, unknown>)[key];
  if (nested && typeof nested === "object" && typeof (nested as { id?: unknown }).id === "string") {
    return (nested as { id: string }).id;
  }
  return null;
}

function ipConfigId(nic: Resource, flatKey: string, nestedKey: string): string | null {
  const configs = nic.properties.ipConfigurations;
  if (!Array.isArray(configs)) return null;
  for (const config of configs) {
    if (!config || typeof config !== "object") continue;
    const record = config as Record<string, unknown>;
    if (typeof record[flatKey] === "string") return record[flatKey];
    const fromProperties = nestedId(record.properties, nestedKey);
    if (fromProperties) return fromProperties;
  }
  return null;
}
