/**
 * Three reachability questions, each for one TCP port.
 * Inbound: from the internet to a virtual machine's public IP. Subnet network
 * security group first, then the network interface.
 * Outbound: from the virtual machine to the internet. Network interface first,
 * then the subnet. An inbound rule is not consulted.
 * Same virtual network: to one IPv4 address inside the virtual network. The way
 * out is checked first, then the destination subnet, then the network interface
 * that has that address.
 * Outbound to the internet uses a 0.0.0.0/0 user route after the security groups allow
 * the traffic. Next hop None drops it. Next hop Internet leaves the security
 * result. The same-network check uses the longest matching route after the
 * security groups allow the traffic. The virtual network system route is longer
 * than 0.0.0.0/0, so that route does not decide an address inside the network.
 * A longer user route can. An address in a directly peered virtual network is
 * included when both links are Connected. Peering is not transitive. A virtual
 * appliance route sends traffic to that network interface. The check then uses
 * that interface's outbound security group and one route on its subnet, and
 * stops. If that subnet has no winning user route, the virtual network system
 * route can deliver the address. Traffic forwarded across a peering needs both
 * links to allow it. A second appliance is not followed. A private DNS zone
 * linked to this virtual network is checked before Azure-provided DNS. A record
 * there answers the name. No record in that zone ends the check. Azure-provided
 * DNS still resolves a running virtual machine's name when no linked zone matches.
 * Auto-registration writes an A record for a running virtual machine and removes
 * it when that virtual machine is stopped or deleted. Custom DNS is not part of
 * these checks. An address does not consult power state.
 * Sources: docs/research/networking-rules.md sections 1.1–1.4, 1.8, 2.6, and 2.7.
 */

import { failure, success, type EngineError, type Result, type TraceLine } from "../core/result";
import { assignedPrivateIp } from "./addresses";
import { containsCidr, parseCidr } from "./cidr";
import { canonicalId } from "./ids";
import { LEARN } from "./learn";
import type { Resource, World } from "./types";

export interface InboundCheck {
  allowed: boolean;
  summary: string;
  learnUrl: string;
}

type Flow = "inbound" | "outbound";
type Scope = "internet" | "vnet";

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

interface Path {
  trace: TraceLine[];
  vm: Resource;
  nic: Resource;
  subnet: Resource;
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

const DEFAULT_OUTBOUND: Rule[] = [
  {
    name: "defaultSecurityRules/AllowVnetOutBound",
    priority: 65000,
    source: "VirtualNetwork",
    sourcePorts: "0-65535",
    destination: "VirtualNetwork",
    destinationPorts: "0-65535",
    protocol: "Any",
    access: "Allow",
  },
  {
    name: "defaultSecurityRules/AllowInternetOutBound",
    priority: 65001,
    source: "0.0.0.0/0",
    sourcePorts: "0-65535",
    destination: "Internet",
    destinationPorts: "0-65535",
    protocol: "Any",
    access: "Allow",
  },
  {
    name: "defaultSecurityRules/DenyAllOutBound",
    priority: 65500,
    source: "0.0.0.0/0",
    sourcePorts: "0-65535",
    destination: "0.0.0.0/0",
    destinationPorts: "0-65535",
    protocol: "Any",
    access: "Deny",
  },
];

const NOT_FILTERED = "Allowed. No network security group on the network interface or the subnet, so this outbound flow is not filtered.";
const VNET_NOT_FILTERED = "Allowed. No network security group on the way out or at the destination, so this virtual network flow is not filtered.";

export function checkInboundInternet(world: World, vmId: string, port: number): Result<InboundCheck> {
  const opened = openPath(world, vmId, port, "Inbound TCP from the internet.");
  if (isResult(opened)) return opened;
  const { trace, vm, nic, subnet } = opened;
  const pipId = firstId(nic.properties.publicIpAddressId) ?? ipConfigId(nic, "publicIpAddressId", "publicIPAddress");
  const pip = pipId ? world.resources[canonicalId(pipId)] : undefined;
  if (!pip) {
    return answered(trace, false, `${nic.name} has no public IP address, so there is no inbound path from the internet. (sandbox wording)`, LEARN.publicIp);
  }
  trace.push({
    step: "validate",
    ok: true,
    detail: `${vm.name} uses ${nic.name} and ${pip.name}. Destination port ${port}.`,
  });

  const subnetNsg = attachedNsg(world, subnet);
  const nicNsg = attachedNsg(world, nic);
  if (!subnetNsg && !nicNsg) {
    trace.push({ step: "apply", ok: true, detail: `No network security group on ${subnet.name}. No NSG at this layer.` });
    trace.push({ step: "apply", ok: true, detail: `No network security group on ${nic.name}. No NSG at this layer.` });
    return answered(trace, false, "Inbound from the internet to a Standard public IP is denied.", LEARN.nsgHowItWorks);
  }
  if (!subnetNsg) {
    trace.push({ step: "apply", ok: true, detail: `No network security group on ${subnet.name}. No NSG at this layer.` });
  } else {
    const matched = firstMatch(subnetNsg, port, "inbound");
    trace.push({ step: "apply", ok: true, detail: `${subnet.name} uses ${subnetNsg.name}. ${ruleLine(matched)}` });
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
    return answered(trace, true, verdict(firstMatch(subnetNsg, port, "inbound")), LEARN.nsgHowItWorks);
  }
  const matched = firstMatch(nicNsg, port, "inbound");
  trace.push({ step: "apply", ok: true, detail: `${nic.name} uses ${nicNsg.name}. ${ruleLine(matched)}` });
  return answered(trace, matched.access === "Allow", verdict(matched), LEARN.nsgOverview);
}

export function checkOutboundInternet(world: World, vmId: string, port: number): Result<InboundCheck> {
  const opened = openPath(world, vmId, port, "Outbound TCP to the internet.");
  if (isResult(opened)) return opened;
  const { trace, vm, nic, subnet } = opened;
  trace.push({
    step: "validate",
    ok: true,
    detail: `${vm.name} uses ${nic.name}. Destination port ${port}.`,
  });

  const nicNsg = attachedNsg(world, nic);
  const subnetNsg = attachedNsg(world, subnet);
  if (!nicNsg && !subnetNsg) {
    trace.push({ step: "apply", ok: true, detail: `No network security group on ${nic.name}. No NSG at this layer.` });
    trace.push({ step: "apply", ok: true, detail: `No network security group on ${subnet.name}. No NSG at this layer.` });
    return finishOutbound(world, trace, subnet, NOT_FILTERED, LEARN.nsgHowItWorks, port);
  }
  if (!nicNsg) {
    trace.push({ step: "apply", ok: true, detail: `No network security group on ${nic.name}. No NSG at this layer.` });
  } else {
    const matched = firstMatch(nicNsg, port, "outbound");
    trace.push({ step: "apply", ok: true, detail: `${nic.name} uses ${nicNsg.name}. ${ruleLine(matched)}` });
    if (matched.access === "Deny") {
      trace.push({ step: "apply", ok: true, detail: "The network interface denied the traffic. The subnet does not see it." });
      return answered(trace, false, verdict(matched), LEARN.nsgOverview);
    }
  }
  if (!subnetNsg) {
    trace.push({ step: "apply", ok: true, detail: `No network security group on ${subnet.name}. No NSG at this layer.` });
    const matched = nicNsg ? firstMatch(nicNsg, port, "outbound") : undefined;
    return finishOutbound(world, trace, subnet, matched ? verdict(matched) : NOT_FILTERED, LEARN.nsgHowItWorks, port);
  }
  const matched = firstMatch(subnetNsg, port, "outbound");
  trace.push({ step: "apply", ok: true, detail: `${subnet.name} uses ${subnetNsg.name}. ${ruleLine(matched)}` });
  if (matched.access === "Deny") return answered(trace, false, verdict(matched), LEARN.nsgOverview);
  return finishOutbound(world, trace, subnet, verdict(matched), LEARN.nsgOverview, port);
}

function finishOutbound(world: World, trace: TraceLine[], subnet: Resource, summary: string, learnUrl: string, port: number): Result<InboundCheck> {
  const route = userInternetRoute(world, subnet);
  if (!route) return answered(trace, true, summary, learnUrl);
  if (route.nextHop === "VirtualAppliance") return deliverAppliance(world, trace, subnet, route, { port, scope: "internet" });
  trace.push({
    step: "apply",
    ok: true,
    detail: `${subnet.name} uses ${route.tableName}. routes/${route.name}, 0.0.0.0/0, next hop ${route.nextHop}.`,
  });
  if (route.nextHop === "None") {
    trace.push({
      step: "apply",
      ok: true,
      detail: "Traffic routed to the None next hop type is dropped rather than routed outside the subnet.",
    });
    return answered(trace, false, `Dropped. routes/${route.name}, 0.0.0.0/0, next hop None.`, LEARN.udr);
  }
  return answered(trace, true, summary, learnUrl);
}

function winningUserRoute(
  world: World,
  subnet: Resource,
  vnet: Resource,
  address: string,
  systemPrefixes: string[] = [],
): ChosenRoute | null {
  let bestLength = -1;
  let winner: ChosenRoute | null = null;
  const consider = (length: number, route: typeof winner) => {
    if (length > bestLength || (length === bestLength && route && !winner)) {
      bestLength = length;
      winner = route;
    }
  };
  for (const prefix of [...prefixesOf(vnet), ...systemPrefixes]) {
    if (!prefixContains(prefix, address)) continue;
    const parsed = parseCidr(prefix);
    if (!("error" in parsed)) consider(parsed.prefix, null);
  }
  for (const route of userRoutes(world, subnet)) {
    if (!prefixContains(route.prefix, address)) continue;
    const parsed = parseCidr(route.prefix);
    if (!("error" in parsed)) consider(parsed.prefix, route);
  }
  return winner;
}

interface ChosenRoute {
  name: string;
  prefix: string;
  nextHop: "None" | "Internet" | "VirtualAppliance";
  nextHopIp?: string;
  tableName: string;
}

function userRoutes(world: World, subnet: Resource): ChosenRoute[] {
  const tableId = subnet.properties.routeTableId;
  if (typeof tableId !== "string") return [];
  const table = world.resources[canonicalId(tableId)];
  if (!table || !Array.isArray(table.properties.routes)) return [];
  const routes: ChosenRoute[] = [];
  for (const route of table.properties.routes) {
    if (!route || typeof route !== "object") continue;
    const name = (route as { name?: unknown }).name;
    const props = (route as { properties?: unknown }).properties;
    if (typeof name !== "string" || !props || typeof props !== "object") continue;
    const prefix = (props as { addressPrefix?: unknown }).addressPrefix;
    const nextHop = (props as { nextHopType?: unknown }).nextHopType;
    const nextHopIp = (props as { nextHopIpAddress?: unknown }).nextHopIpAddress;
    if (typeof prefix !== "string") continue;
    if (nextHop === "None" || nextHop === "Internet") routes.push({ name, prefix, nextHop, tableName: table.name });
    if (nextHop === "VirtualAppliance" && typeof nextHopIp === "string") {
      routes.push({ name, prefix, nextHop, nextHopIp, tableName: table.name });
    }
  }
  return routes;
}

function userInternetRoute(world: World, subnet: Resource): ChosenRoute | null {
  return userRoutes(world, subnet).find((route) => route.prefix === "0.0.0.0/0") ?? null;
}

interface ApplianceHop {
  port: number;
  scope: Scope;
  address?: string;
}

function deliverAppliance(world: World, trace: TraceLine[], sourceSubnet: Resource, route: ChosenRoute, hop: ApplianceHop): Result<InboundCheck> {
  const ip = route.nextHopIp ?? "";
  const label = `routes/${route.name}, ${route.prefix}, next hop VirtualAppliance ${ip}`;
  trace.push({
    step: "apply",
    ok: true,
    detail: `${sourceSubnet.name} uses ${route.tableName}. ${label}.`,
  });
  const found = applianceTarget(world, sourceSubnet, ip);
  if (!found) {
    trace.push({ step: "apply", ok: true, detail: `No network interface in this virtual network or a peered one has ${ip}.` });
    return answered(trace, false, `No network interface in this virtual network or a peered one has ${ip}. (sandbox wording)`, LEARN.udr);
  }
  if (canonicalId(found.subnet.id) === canonicalId(sourceSubnet.id)) {
    trace.push({
      step: "apply",
      ok: true,
      detail: "Deploy the appliance in a different subnet from the traffic sources. Same subnet plus a route table pointing at itself can cause routing loops.",
    });
    return answered(trace, false, `Routing loop. ${label}.`, LEARN.udr);
  }
  if (found.nic.properties.enableIPForwarding !== true) {
    trace.push({
      step: "apply",
      ok: true,
      detail: `IP forwarding is disabled on ${found.nic.name}. Learn: a NIC that forwards traffic to an address other than its own must have it enabled.`,
    });
    trace.push({ step: "apply", ok: true, detail: "Learn does not say explicitly that Azure drops the packet." });
    return answered(trace, false, `IP forwarding is disabled on ${found.nic.name}. ${label}.`, LEARN.nic);
  }
  trace.push({
    step: "apply",
    ok: true,
    detail: `${found.nic.name} has IP forwarding enabled. The guest operating system is not part of this check.`,
  });
  const denied = applianceOutbound(world, trace, found.nic, found.subnet, hop);
  if (denied) return denied;
  return applianceRoute(world, trace, found.nic, found.subnet, sourceSubnet, hop);
}

function applianceOutbound(world: World, trace: TraceLine[], nic: Resource, subnet: Resource, hop: ApplianceHop): Result<InboundCheck> | null {
  const nicNsg = attachedNsg(world, nic);
  const subnetNsg = attachedNsg(world, subnet);
  if (!nicNsg) trace.push({ step: "apply", ok: true, detail: `No network security group on ${nic.name}. No NSG at this layer.` });
  else {
    const matched = firstMatch(nicNsg, hop.port, "outbound", hop.scope);
    trace.push({ step: "apply", ok: true, detail: `${nic.name} uses ${nicNsg.name}. ${ruleLine(matched)}` });
    if (matched.access === "Deny") {
      trace.push({ step: "apply", ok: true, detail: `The network interface denied the traffic. The route on ${subnet.name} is not consulted.` });
      return answered(trace, false, verdict(matched), LEARN.nsgOverview);
    }
  }
  if (!subnetNsg) trace.push({ step: "apply", ok: true, detail: `No network security group on ${subnet.name}. No NSG at this layer.` });
  else {
    const matched = firstMatch(subnetNsg, hop.port, "outbound", hop.scope);
    trace.push({ step: "apply", ok: true, detail: `${subnet.name} uses ${subnetNsg.name}. ${ruleLine(matched)}` });
    if (matched.access === "Deny") {
      trace.push({ step: "apply", ok: true, detail: `The subnet denied the traffic on the way out. The route on ${subnet.name} is not consulted.` });
      return answered(trace, false, verdict(matched), LEARN.nsgOverview);
    }
  }
  return null;
}

function applianceRoute(world: World, trace: TraceLine[], nic: Resource, subnet: Resource, sourceSubnet: Resource, hop: ApplianceHop): Result<InboundCheck> {
  const vnet = parentVirtualNetwork(world, subnet);
  const route = hop.scope === "internet" || !hop.address
    ? userInternetRoute(world, subnet)
    : vnet
      ? winningUserRoute(world, subnet, vnet, hop.address, extraSystemPrefixes(world, vnet, hop.address))
      : null;
  const target = hop.address ?? "0.0.0.0/0";
  if (!route) {
    if (hop.address && hop.scope === "vnet") return deliverBySystemRoute(world, trace, nic, subnet, sourceSubnet, hop.address, hop.port);
    trace.push({ step: "apply", ok: true, detail: `${subnet.name} has no user route that wins for ${target}. This check stops at ${nic.name}.` });
    return answered(trace, false, `Stopped at ${nic.name}. ${subnet.name} has no user route that wins for ${target}.`, LEARN.udr);
  }
  const label = route.nextHop === "VirtualAppliance"
    ? `routes/${route.name}, ${route.prefix}, next hop VirtualAppliance ${route.nextHopIp}`
    : `routes/${route.name}, ${route.prefix}, next hop ${route.nextHop}`;
  trace.push({ step: "apply", ok: true, detail: `${subnet.name} uses ${route.tableName}. ${label}.` });
  if (route.nextHop === "None") {
    trace.push({ step: "apply", ok: true, detail: "Traffic routed to the None next hop type is dropped rather than routed outside the subnet." });
    return answered(trace, false, `Dropped. ${label}.`, LEARN.udr);
  }
  if (route.nextHop === "VirtualAppliance") {
    trace.push({ step: "apply", ok: true, detail: "A second appliance is not part of this check." });
    return answered(trace, false, `Stopped at ${nic.name}. ${label}. A second appliance is not part of this check.`, LEARN.udr);
  }
  trace.push({ step: "apply", ok: true, detail: "Azure routes that prefix to the internet." });
  return answered(trace, false, `Sent to the internet from ${nic.name}. ${label}.`, LEARN.udr);
}

function deliverBySystemRoute(
  world: World,
  trace: TraceLine[],
  nic: Resource,
  subnet: Resource,
  sourceSubnet: Resource,
  address: string,
  port: number,
): Result<InboundCheck> {
  const applianceVnet = parentVirtualNetwork(world, subnet);
  const originVnet = parentVirtualNetwork(world, sourceSubnet);
  if (!applianceVnet) {
    return answered(trace, false, `Stopped at ${nic.name}. ${subnet.name} has no user route that wins for ${address}.`, LEARN.udr);
  }
  const destinationVnet = vnetContaining(world, address);
  const peered = destinationVnet && canonicalId(destinationVnet.id) !== canonicalId(applianceVnet.id)
    ? destinationVnet
    : undefined;
  const local = !peered && destinationVnet && canonicalId(destinationVnet.id) === canonicalId(applianceVnet.id);
  if (!local && !peered) {
    trace.push({ step: "apply", ok: true, detail: `${subnet.name} has no user route that wins for ${address}. This check stops at ${nic.name}.` });
    return answered(trace, false, `Stopped at ${nic.name}. ${subnet.name} has no user route that wins for ${address}.`, LEARN.udr);
  }
  if (peered) {
    const forwarded = !originVnet || canonicalId(originVnet.id) !== canonicalId(applianceVnet.id);
    const localLink = peeringLink(world, applianceVnet, peered);
    const remoteLink = peeringLink(world, peered, applianceVnet);
    if (peeringState(localLink) !== "Connected" || peeringState(remoteLink) !== "Connected") {
      trace.push({ step: "apply", ok: true, detail: `${subnet.name} has no user route that wins for ${address}. This check stops at ${nic.name}.` });
      return answered(trace, false, `Stopped at ${nic.name}. ${subnet.name} has no user route that wins for ${address}.`, LEARN.udr);
    }
    if (forwarded) {
      trace.push({
        step: "apply",
        ok: true,
        detail: "Forwarded traffic: Learn describes the direction inconsistently, both links must allow it in the sandbox.",
      });
      if (localLink?.properties.allowForwardedTraffic !== true || remoteLink?.properties.allowForwardedTraffic !== true) {
        return answered(
          trace,
          false,
          `Forwarded traffic is not allowed from ${applianceVnet.name} to ${peered.name}. Learn describes the direction inconsistently, so both links must allow it.`,
          LEARN.peering,
        );
      }
    } else if (localLink?.properties.allowVirtualNetworkAccess === false) {
      return answered(trace, false, `${applianceVnet.name} is not allowed to access ${peered.name}. (sandbox wording)`, LEARN.peering);
    } else {
      trace.push({
        step: "apply",
        ok: true,
        detail: `${applianceVnet.name} is peered with ${peered.name}. Allow virtual network access is checked on the appliance side. Only that side is documented.`,
      });
    }
  }
  const destinationSubnet = subnetsOf(world, peered ?? applianceVnet).find((item) => {
    const prefix = item.properties.addressPrefix;
    return typeof prefix === "string" && prefixContains(prefix, address);
  });
  if (!destinationSubnet) {
    return answered(trace, false, `${address} is inside ${(peered ?? applianceVnet).name}, and no subnet contains it. (sandbox wording)`, LEARN.subnet);
  }
  trace.push({
    step: "apply",
    ok: true,
    detail: `${subnet.name} has no user route that wins for ${address}. The virtual network system route delivers it.`,
  });
  return finishAtDestination(world, trace, destinationSubnet, address, port, null);
}

function vnetContaining(world: World, address: string): Resource | undefined {
  return Object.values(world.resources).find((resource) =>
    resource.type.toLowerCase() === "microsoft.network/virtualnetworks" &&
    prefixesOf(resource).some((prefix) => prefixContains(prefix, address)),
  );
}

function finishAtDestination(
  world: World,
  trace: TraceLine[],
  destinationSubnet: Resource,
  destination: string,
  port: number,
  sourceVerdict: string | null,
): Result<InboundCheck> {
  const destinationNic = Object.values(world.resources).find((resource) =>
    resource.type.toLowerCase() === "microsoft.network/networkinterfaces" && assignedPrivateIp(world, resource) === destination,
  );
  if (!destinationNic) {
    trace.push({ step: "apply", ok: true, detail: `No network interface has ${destination}.` });
    return answered(trace, false, `No network interface has ${destination}. (sandbox wording)`, LEARN.nic);
  }
  trace.push({ step: "apply", ok: true, detail: `${destinationNic.name} has ${destination}.` });
  const destinationNsg = attachedNsg(world, destinationSubnet);
  if (!destinationNsg) {
    trace.push({ step: "apply", ok: true, detail: `No network security group on ${destinationSubnet.name}. No NSG at this layer.` });
  } else {
    const matched = firstMatch(destinationNsg, port, "inbound", "vnet");
    trace.push({ step: "apply", ok: true, detail: `${destinationSubnet.name} uses ${destinationNsg.name}. ${ruleLine(matched)}` });
    if (matched.access === "Deny") {
      trace.push({ step: "apply", ok: true, detail: "The subnet network security group denied the traffic. The network interface does not see it." });
      return answered(trace, false, verdict(matched), LEARN.nsgOverview);
    }
  }
  const destinationNicNsg = attachedNsg(world, destinationNic);
  if (!destinationNicNsg) {
    trace.push({ step: "apply", ok: true, detail: `No network security group on ${destinationNic.name}. No NSG at this layer.` });
    if (!destinationNsg) return answered(trace, true, sourceVerdict ?? VNET_NOT_FILTERED, LEARN.nsgHowItWorks);
    trace.push({ step: "apply", ok: true, detail: `${destinationNic.name} gets whatever ${destinationSubnet.name} allows.` });
    return answered(trace, true, verdict(firstMatch(destinationNsg, port, "inbound", "vnet")), LEARN.nsgHowItWorks);
  }
  const matched = firstMatch(destinationNicNsg, port, "inbound", "vnet");
  trace.push({ step: "apply", ok: true, detail: `${destinationNic.name} uses ${destinationNicNsg.name}. ${ruleLine(matched)}` });
  return answered(trace, matched.access === "Allow", verdict(matched), LEARN.nsgOverview);
}

function extraSystemPrefixes(world: World, vnet: Resource, address: string): string[] {
  if (prefixesOf(vnet).some((prefix) => prefixContains(prefix, address))) return [];
  const prefixes: string[] = [];
  for (const other of Object.values(world.resources)) {
    if (other.type.toLowerCase() !== "microsoft.network/virtualnetworks" || canonicalId(other.id) === canonicalId(vnet.id)) continue;
    const matched = prefixesOf(other).filter((prefix) => prefixContains(prefix, address));
    if (matched.length === 0) continue;
    const local = peeringLink(world, vnet, other);
    const remote = peeringLink(world, other, vnet);
    if (peeringState(local) === "Connected" && peeringState(remote) === "Connected") prefixes.push(...matched);
  }
  return prefixes;
}

function applianceTarget(world: World, sourceSubnet: Resource, ip: string): { nic: Resource; subnet: Resource } | null {
  const sourceVnet = parentVirtualNetwork(world, sourceSubnet);
  if (!sourceVnet) return null;
  for (const nic of Object.values(world.resources)) {
    if (nic.type.toLowerCase() !== "microsoft.network/networkinterfaces" || assignedPrivateIp(world, nic) !== ip) continue;
    const subnetId = nicSubnetId(nic);
    const subnet = subnetId ? world.resources[canonicalId(subnetId)] : undefined;
    if (!subnet) continue;
    const vnet = parentVirtualNetwork(world, subnet);
    if (!vnet) continue;
    if (canonicalId(vnet.id) === canonicalId(sourceVnet.id)) return { nic, subnet };
    const localLink = peeringLink(world, sourceVnet, vnet);
    const remoteLink = peeringLink(world, vnet, sourceVnet);
    if (peeringState(localLink) === "Connected" && peeringState(remoteLink) === "Connected") return { nic, subnet };
  }
  return null;
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

export function checkSameVirtualNetwork(world: World, vmId: string, address: string, port: number): Result<InboundCheck> {
  const opened = openPath(world, vmId, port, "TCP to an address in the same virtual network.");
  if (isResult(opened)) return opened;
  const { trace, vm, nic, subnet } = opened;
  const vnet = parentVirtualNetwork(world, subnet);
  let destination = parseHost(address);
  if (!destination) {
    if (!vnet) {
      return answered(trace, false, `${subnet.name} is not in a virtual network. (sandbox wording)`, LEARN.vnet);
    }
    const resolved = resolveDestinationName(world, vnet, address);
    if ("error" in resolved) return failure(trace, resolved.error);
    destination = resolved.address;
    trace.push({ step: "validate", ok: true, detail: resolved.detail });
  }
  if (!vnet) {
    return answered(trace, false, `${subnet.name} is not in a virtual network. (sandbox wording)`, LEARN.vnet);
  }
  const vnetPrefixes = prefixesOf(vnet);
  let destinationVnet = vnet;
  let peeredPrefixes: string[] = [];
  if (!vnetPrefixes.some((prefix) => prefixContains(prefix, destination))) {
    const other = Object.values(world.resources).find((resource) =>
      resource.type.toLowerCase() === "microsoft.network/virtualnetworks" &&
      canonicalId(resource.id) !== canonicalId(vnet.id) &&
      prefixesOf(resource).some((prefix) => prefixContains(prefix, destination)),
    );
    if (!other) {
      return failure(trace, {
        code: "AddressOutsideVnet",
        message: `${destination} is outside ${vnet.name}. (sandbox wording)`,
        step: "validate",
        learnUrl: LEARN.vnet,
        next: "Enter an address inside this virtual network.",
      });
    }
    const localLink = peeringLink(world, vnet, other);
    const remoteLink = peeringLink(world, other, vnet);
    const localState = peeringState(localLink);
    const remoteState = peeringState(remoteLink);
    if (localState !== "Connected" || remoteState !== "Connected") {
      return failure(trace, {
        code: "PeeringNotConnected",
        message: "The peering isn't successfully established until the peering status for both virtual network peerings is Connected.",
        step: "validate",
        learnUrl: LEARN.peering,
        next: !localLink || !remoteLink
          ? "Peer the two virtual networks. This page creates both links."
          : "Delete the remaining link and create both again. This page cannot remove a link.",
      });
    }
    if (localLink?.properties.allowVirtualNetworkAccess === false) {
      return failure(trace, {
        code: "VnetAccessDisabled",
        message: `${vnet.name} is not allowed to access ${other.name}. (sandbox wording)`,
        next: "This page creates the peering with access allowed.",
        step: "validate",
        learnUrl: LEARN.peering,
      });
    }
    destinationVnet = other;
    peeredPrefixes = prefixesOf(other);
    trace.push({
      step: "apply",
      ok: true,
      detail: `${vnet.name} is peered with ${other.name}. Both links are Connected. Allow virtual network access is checked on the source link. Only that side is documented.`,
    });
  }
  const destinationSubnet = subnetsOf(world, destinationVnet).find((item) => {
    const prefix = item.properties.addressPrefix;
    return typeof prefix === "string" && prefixContains(prefix, destination);
  });
  if (!destinationSubnet) {
    const prefixes = subnetsOf(world, destinationVnet)
      .map((item) => item.properties.addressPrefix)
      .filter((prefix): prefix is string => typeof prefix === "string");
    return failure(trace, {
      code: "AddressOutsideSubnet",
      message: `${destination} is inside ${destinationVnet.name}, and no subnet contains it. (sandbox wording)`,
      step: "validate",
      learnUrl: LEARN.subnet,
      next: prefixes.length > 0 ? `Enter an address inside ${prefixes.join(" or ")}.` : "Add a subnet that contains this address.",
    });
  }
  trace.push({
    step: "validate",
    ok: true,
    detail: `${vm.name} uses ${nic.name}. Destination ${destination} is in ${destinationSubnet.name}. Port ${port}.`,
  });

  const sourceNicNsg = attachedNsg(world, nic);
  const sourceSubnetNsg = attachedNsg(world, subnet);
  let sourceVerdict: string | null = null;
  if (!sourceNicNsg && !sourceSubnetNsg) {
    trace.push({ step: "apply", ok: true, detail: `No network security group on ${nic.name}. No NSG at this layer.` });
    trace.push({ step: "apply", ok: true, detail: `No network security group on ${subnet.name}. No NSG at this layer.` });
  } else {
    if (!sourceNicNsg) {
      trace.push({ step: "apply", ok: true, detail: `No network security group on ${nic.name}. No NSG at this layer.` });
    } else {
      const matched = firstMatch(sourceNicNsg, port, "outbound", "vnet");
      trace.push({ step: "apply", ok: true, detail: `${nic.name} uses ${sourceNicNsg.name}. ${ruleLine(matched)}` });
      if (matched.access === "Deny") {
        trace.push({ step: "apply", ok: true, detail: "The network interface denied the traffic. The destination does not see it." });
        return answered(trace, false, verdict(matched), LEARN.nsgOverview);
      }
      sourceVerdict = verdict(matched);
    }
    if (!sourceSubnetNsg) {
      trace.push({ step: "apply", ok: true, detail: `No network security group on ${subnet.name}. No NSG at this layer.` });
    } else {
      const matched = firstMatch(sourceSubnetNsg, port, "outbound", "vnet");
      trace.push({ step: "apply", ok: true, detail: `${subnet.name} uses ${sourceSubnetNsg.name}. ${ruleLine(matched)}` });
      if (matched.access === "Deny") {
        trace.push({ step: "apply", ok: true, detail: "The subnet denied the traffic on the way out. The destination does not see it." });
        return answered(trace, false, verdict(matched), LEARN.nsgOverview);
      }
      sourceVerdict = verdict(matched);
    }
  }

  const selected = winningUserRoute(world, subnet, vnet, destination, peeredPrefixes);
  if (selected?.nextHop === "VirtualAppliance") {
    return deliverAppliance(world, trace, subnet, selected, { port, scope: "vnet", address: destination });
  }
  if (selected) {
    trace.push({
      step: "apply",
      ok: true,
      detail: `${subnet.name} uses ${selected.tableName}. routes/${selected.name}, ${selected.prefix}, next hop ${selected.nextHop}. The longest matching prefix wins.`,
    });
    if (selected.nextHop === "None") {
      trace.push({
        step: "apply",
        ok: true,
        detail: "Traffic routed to the None next hop type is dropped rather than routed outside the subnet.",
      });
      trace.push({ step: "apply", ok: true, detail: "The destination does not see it." });
      return answered(trace, false, `Dropped. routes/${selected.name}, ${selected.prefix}, next hop None.`, LEARN.udr);
    }
    trace.push({ step: "apply", ok: true, detail: "Azure routes that prefix to the internet." });
    return answered(trace, false, `Sent to the internet. routes/${selected.name}, ${selected.prefix}, next hop Internet.`, LEARN.udr);
  }

  return finishAtDestination(world, trace, destinationSubnet, destination, port, sourceVerdict);
}

function openPath(world: World, vmId: string, port: number, detail: string): Path | Result<InboundCheck> {
  const trace: TraceLine[] = [{ step: "parse", ok: true, detail }];
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return failure(trace, {
      code: "InvalidPort",
      message: "Record one destination port, from 1 to 65535. (sandbox wording)",
      step: "validate",
      learnUrl: LEARN.nsgOverview,
      next: "Enter a whole number from 1 to 65535.",
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
  const subnetId = firstId(nic.properties.subnetId) ?? ipConfigId(nic, "subnetId", "subnet");
  const subnet = subnetId ? world.resources[canonicalId(subnetId)] : undefined;
  if (!subnet) {
    return answered(trace, false, `${nic.name} is not in a subnet. (sandbox wording)`, LEARN.subnet);
  }
  return { trace, vm, nic, subnet };
}

function isResult(value: Path | Result<InboundCheck>): value is Result<InboundCheck> {
  return "ok" in value;
}

function answered(trace: TraceLine[], allowed: boolean, summary: string, learnUrl: string): Result<InboundCheck> {
  trace.push({ step: "lifecycle", ok: true, detail: summary });
  return success(trace, { allowed, summary, learnUrl });
}

function attachedNsg(world: World, resource: Resource): Resource | undefined {
  const id = firstId(resource.properties.networkSecurityGroupId) ?? nestedId(resource.properties, "networkSecurityGroup");
  return id ? world.resources[canonicalId(id)] : undefined;
}

function firstMatch(nsg: Resource, port: number, flow: Flow, scope: Scope = "internet"): Rule {
  const defaults = flow === "inbound" ? DEFAULT_INBOUND : DEFAULT_OUTBOUND;
  const rules = [...customRules(nsg, flow), ...defaults].sort((left, right) => left.priority - right.priority);
  return rules.find((rule) => ruleMatches(rule, port, flow, scope)) ?? defaults[defaults.length - 1];
}

function customRules(nsg: Resource, flow: Flow): Rule[] {
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
    if (typeof fields.direction !== "string" || fields.direction.toLowerCase() !== flow) continue;
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

function ruleMatches(rule: Rule, port: number, flow: Flow, scope: Scope = "internet"): boolean {
  const protocol = rule.protocol.toLowerCase();
  if (protocol !== "tcp" && protocol !== "any") return false;
  const sourceOk = scope === "vnet" || flow === "outbound" ? sourceIsPrivate(rule.source) : sourceIsInternet(rule.source);
  const destinationOk = scope === "vnet" || flow === "inbound" ? destinationIsPrivate(rule.destination) : destinationIsInternet(rule.destination);
  if (!sourceOk || !destinationOk) return false;
  if (!portSpecMatches(rule.sourcePorts, null)) return false;
  return portSpecMatches(rule.destinationPorts, port);
}

const AZURE_DNS_SUFFIX = ".internal.cloudapp.net";

function resolveDestinationName(
  world: World,
  sourceVnet: Resource,
  query: string,
): { address: string; detail: string } | { error: EngineError } {
  const normalized = query.trim().toLowerCase().replace(/\.$/, "");
  const fromZone = resolvePrivateZone(world, sourceVnet, normalized);
  if (fromZone) return fromZone;
  const azure = resolveAzureName(world, sourceVnet, query);
  if ("error" in azure) return azure;
  return {
    address: azure.address,
    detail: `${azure.name} resolves to ${azure.address}. Azure-provided DNS, 168.63.129.16.`,
  };
}

function resolvePrivateZone(
  world: World,
  sourceVnet: Resource,
  query: string,
): { address: string; detail: string } | { error: EngineError } | null {
  const zones = Object.values(world.resources)
    .filter((resource) => resource.type.toLowerCase() === "microsoft.network/privatednszones" && zoneLinkedTo(world, resource, sourceVnet))
    .filter((zone) => query === zone.name.toLowerCase() || query.endsWith(`.${zone.name.toLowerCase()}`))
    .sort((left, right) => right.name.length - left.name.length || canonicalId(left.id).localeCompare(canonicalId(right.id)));
  const zone = zones[0];
  if (!zone) return null;
  const zoneName = zone.name.toLowerCase();
  const relative = query === zoneName ? "@" : query.slice(0, -(zoneName.length + 1));
  const prefix = `${canonicalId(zone.id)}/a/`;
  const record = Object.values(world.resources).find((resource) =>
    resource.type.toLowerCase() === "microsoft.network/privatednszones/a" &&
    canonicalId(resource.id).startsWith(prefix) &&
    resource.name.toLowerCase() === relative,
  );
  const address = record ? recordAddress(record) : null;
  if (!address) {
    return {
      error: {
        code: "PrivateZoneNxDomain",
        message: `Private DNS zone ${zone.name} has no record for this name, so the name did not resolve. (sandbox wording)`,
        step: "validate",
        learnUrl: LEARN.privateDns,
        next: "Add an A record in that zone, or use a name the zone does not cover.",
      },
    };
  }
  return {
    address,
    detail: `${relative}.${zone.name} resolves to ${address}. Private DNS zone ${zone.name}, linked to ${sourceVnet.name}.`,
  };
}

function zoneLinkedTo(world: World, zone: Resource, vnet: Resource): boolean {
  const prefix = `${canonicalId(zone.id)}/virtualnetworklinks/`;
  return Object.values(world.resources).some((resource) => {
    if (resource.type.toLowerCase() !== "microsoft.network/privatednszones/virtualnetworklinks") return false;
    if (!canonicalId(resource.id).startsWith(prefix)) return false;
    const network = resource.properties.virtualNetwork;
    if (!network || typeof network !== "object") return false;
    const id = (network as { id?: unknown }).id;
    return typeof id === "string" && canonicalId(id) === canonicalId(vnet.id);
  });
}

function recordAddress(record: Resource): string | null {
  const records = record.properties.aRecords;
  if (!Array.isArray(records)) return null;
  const first = records[0];
  if (!first || typeof first !== "object") return null;
  const address = (first as { ipv4Address?: unknown }).ipv4Address;
  return typeof address === "string" ? address : null;
}

function resolveAzureName(world: World, sourceVnet: Resource, query: string): { address: string; name: string } | { error: EngineError } {
  const normalized = query.trim().toLowerCase().replace(/\.$/, "");
  if (!isAzureDnsQuery(normalized)) {
    return {
      error: {
        code: "InvalidAddress",
        message: "Record one IPv4 address, or a virtual machine name in this virtual network. (sandbox wording)",
        step: "validate",
        learnUrl: LEARN.vmDns,
        next: "Enter an address such as 10.0.1.4, or a name such as vm-web-01.",
      },
    };
  }
  const short = normalized.endsWith(AZURE_DNS_SUFFIX) ? normalized.slice(0, -AZURE_DNS_SUFFIX.length) : normalized;
  if (short.includes(".")) {
    return {
      error: {
        code: "NameNotFound",
        message: "The name did not resolve. Azure-provided DNS only answers names in this virtual network. (sandbox wording)",
        step: "validate",
        learnUrl: LEARN.vmDns,
        next: "Enter a virtual machine name in this virtual network, such as vm-web-01.",
      },
    };
  }
  let sawOtherVnet = false;
  for (const resource of Object.values(world.resources)) {
    if (resource.type.toLowerCase() !== "microsoft.compute/virtualmachines" || resource.name.toLowerCase() !== short) continue;
    const nicId = firstId(resource.properties.nicIds) ?? profileNicId(resource);
    const nic = nicId ? world.resources[canonicalId(nicId)] : undefined;
    const subnetId = nic ? firstId(nic.properties.subnetId) ?? ipConfigId(nic, "subnetId", "subnet") : null;
    const subnet = subnetId ? world.resources[canonicalId(subnetId)] : undefined;
    const nicVnet = subnet ? parentVirtualNetwork(world, subnet) : undefined;
    if (!nic || !nicVnet) continue;
    if (canonicalId(nicVnet.id) !== canonicalId(sourceVnet.id)) {
      sawOtherVnet = true;
      continue;
    }
    const power = typeof resource.properties.powerState === "string" ? resource.properties.powerState : "";
    if (power !== "Running") {
      return {
        error: {
          code: "VmNotRunning",
          message: `${resource.name} is ${power || "not running"}. Azure-provided DNS returns its address only while the virtual machine is running. (sandbox wording)`,
          step: "validate",
          learnUrl: LEARN.vmDns,
          next: "Start the virtual machine, then check the name again.",
        },
      };
    }
    const address = assignedPrivateIp(world, nic);
    if (!address) continue;
    return { address, name: `${resource.name}.internal.cloudapp.net` };
  }
  if (sawOtherVnet) {
    return {
      error: {
        code: "NameOutsideVnet",
        message: "DNS names created for one virtual network can't be resolved from other virtual networks.",
        step: "validate",
        learnUrl: LEARN.vmDns,
        next: "Enter a name from this virtual network, or enter the private address.",
      },
    };
  }
  return {
    error: {
      code: "NameNotFound",
      message: "The name did not resolve. (sandbox wording)",
      step: "validate",
      learnUrl: LEARN.vmDns,
      next: "Enter a virtual machine name in this virtual network, such as vm-web-01.",
    },
  };
}

function isDnsLabel(value: string): boolean {
  return /^[a-z0-9]$/.test(value) || /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])$/.test(value);
}

function isAzureDnsQuery(value: string): boolean {
  if (!value || value.length > 253) return false;
  const name = value.endsWith(AZURE_DNS_SUFFIX) ? value.slice(0, -AZURE_DNS_SUFFIX.length) : value;
  if (!name) return false;
  if (value.endsWith(AZURE_DNS_SUFFIX)) return isDnsLabel(name);
  return name.split(".").every(isDnsLabel);
}

function parseHost(value: string): string | null {
  const address = value.trim();
  const parsed = parseCidr(`${address}/32`);
  if ("error" in parsed || parsed.prefix !== 32) return null;
  return address;
}

function prefixContains(prefix: string, address: string): boolean {
  const outer = parseCidr(prefix);
  const inner = parseCidr(`${address}/32`);
  if ("error" in outer || "error" in inner) return false;
  return containsCidr(outer, inner);
}

function peeringLink(world: World, from: Resource, to: Resource): Resource | undefined {
  const prefix = `${canonicalId(from.id)}/virtualnetworkpeerings/`;
  return Object.values(world.resources).find((resource) =>
    resource.type.toLowerCase() === "microsoft.network/virtualnetworks/virtualnetworkpeerings" &&
    canonicalId(resource.id).startsWith(prefix) &&
    typeof resource.properties.remoteVirtualNetworkId === "string" &&
    canonicalId(resource.properties.remoteVirtualNetworkId) === canonicalId(to.id),
  );
}

function peeringState(link: Resource | undefined): string {
  const state = link?.properties.peeringState;
  return typeof state === "string" ? state : link ? "Connected" : "";
}

function prefixesOf(vnet: Resource): string[] {
  const space = vnet.properties.addressSpace;
  if (!space || typeof space !== "object") return [];
  const raw = (space as { addressPrefixes?: unknown }).addressPrefixes;
  return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string") : [];
}

function parentVirtualNetwork(world: World, subnet: Resource): Resource | undefined {
  const marker = "/subnets/";
  const at = subnet.id.toLowerCase().lastIndexOf(marker);
  if (at < 0) return undefined;
  return world.resources[canonicalId(subnet.id.slice(0, at))];
}

function subnetsOf(world: World, vnet: Resource): Resource[] {
  const prefix = `${canonicalId(vnet.id)}/subnets/`;
  return Object.values(world.resources).filter(
    (resource) => canonicalId(resource.id).startsWith(prefix) && resource.type.toLowerCase() === "microsoft.network/virtualnetworks/subnets",
  );
}

function sourceIsInternet(source: string): boolean {
  const value = source.trim().toLowerCase();
  return value === "*" || value === "any" || value === "internet" || value === "0.0.0.0/0";
}

function destinationIsPrivate(destination: string): boolean {
  const value = destination.trim().toLowerCase();
  return value === "*" || value === "any" || value === "0.0.0.0/0" || value === "virtualnetwork";
}

function sourceIsPrivate(source: string): boolean {
  const value = source.trim().toLowerCase();
  return value === "*" || value === "any" || value === "0.0.0.0/0" || value === "virtualnetwork";
}

function destinationIsInternet(destination: string): boolean {
  const value = destination.trim().toLowerCase();
  return value === "*" || value === "any" || value === "0.0.0.0/0" || value === "internet";
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
