import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addInboundRule,
  addInternetRoute,
  addSecurityRule,
  peerVirtualNetworks,
  setIpForwarding,
  associateNicSecurityGroup,
  attachNetworkInterface,
  attachPublicIp,
  checkInboundInternet,
  checkOutboundInternet,
  checkSameVirtualNetwork,
  createResource,
  deleteResource,
  createResourceGroup,
  starterWorld,
  updateResource,
} from "./index";
import type { World } from "./types";

function vnetRule(name: string, direction: "Inbound" | "Outbound", priority: number) {
  return {
    name,
    properties: {
      priority,
      direction,
      access: "Deny" as const,
      protocol: "Tcp",
      sourceAddressPrefix: "VirtualNetwork",
      sourcePortRange: "*",
      destinationAddressPrefix: "VirtualNetwork",
      destinationPortRange: "443",
    },
  };
}

function outboundRule(name: string, access: "Allow" | "Deny", priority: number) {
  return {
    name,
    properties: {
      priority,
      direction: "Outbound",
      access,
      protocol: "Tcp",
      sourceAddressPrefix: "*",
      sourcePortRange: "*",
      destinationAddressPrefix: "Internet",
      destinationPortRange: "443",
    },
  };
}

function must<T>(result: { ok: boolean; value?: T; error?: { message: string } }): T {
  assert.equal(result.ok, true, result.error?.message);
  return result.value!;
}

function linkedWorld(): { world: World; vmId: string; nicId: string; subnetId: string; nsgId: string } {
  let world = must(createResourceGroup(starterWorld(), { name: "rg-demo", location: "southeastasia" }));
  world = must(createResource(world, {
    armType: "Microsoft.Network/virtualNetworks",
    name: "vnet-sea",
    resourceGroup: "rg-demo",
    location: "southeastasia",
    properties: { addressSpace: { addressPrefixes: ["10.0.0.0/16"] } },
  }));
  world = must(createResource(world, {
    armType: "Microsoft.Network/virtualNetworks/subnets",
    name: "snet-app",
    resourceGroup: "rg-demo",
    parentName: "vnet-sea",
    location: "southeastasia",
    properties: { addressPrefix: "10.0.1.0/24" },
  }));
  const subnetId = Object.values(world.resources).find((resource) => resource.name === "snet-app")!.id;
  world = must(createResource(world, {
    armType: "Microsoft.Network/networkInterfaces",
    name: "nic-web-01",
    resourceGroup: "rg-demo",
    location: "southeastasia",
    properties: {
      subnetId,
      ipConfigurations: [{ name: "ipconfig1", properties: { subnet: { id: subnetId } } }],
    },
  }));
  const nicId = Object.values(world.resources).find((resource) => resource.name === "nic-web-01")!.id;
  world = must(createResource(world, {
    armType: "Microsoft.Compute/virtualMachines",
    name: "vm-web-01",
    resourceGroup: "rg-demo",
    location: "southeastasia",
    osType: "Linux",
    properties: { osType: "Linux" },
  }));
  const vmId = Object.values(world.resources).find((resource) => resource.name === "vm-web-01")!.id;
  world = must(attachNetworkInterface(world, vmId, nicId));
  world = must(createResource(world, {
    armType: "Microsoft.Network/publicIPAddresses",
    name: "pip-web-01",
    resourceGroup: "rg-demo",
    location: "southeastasia",
    sku: { name: "Standard" },
    properties: { publicIPAllocationMethod: "Static", publicIPAddressVersion: "IPv4" },
  }));
  const pipId = Object.values(world.resources).find((resource) => resource.name === "pip-web-01")!.id;
  world = must(attachPublicIp(world, nicId, pipId));
  world = must(createResource(world, {
    armType: "Microsoft.Network/networkSecurityGroups",
    name: "nsg-web",
    resourceGroup: "rg-demo",
    location: "southeastasia",
  }));
  const nsgId = Object.values(world.resources).find((resource) => resource.name === "nsg-web")!.id;
  return { world, vmId, nicId, subnetId, nsgId };
}

describe("inbound internet check", () => {
  it("denies a Standard public IP when neither the subnet nor the NIC has a network security group", () => {
    const { world, vmId } = linkedWorld();
    const checked = checkInboundInternet(world, vmId, 443);
    assert.equal(checked.ok, true, checked.error?.message);
    assert.equal(checked.value?.allowed, false);
    assert.match(checked.value?.summary ?? "", /Standard public IP is denied/);
    assert.match(checked.trace.map((line) => line.detail ?? "").join("\n"), /No NSG at this layer/);
  });

  it("names the custom allow rule, then the default deny for another port", () => {
    const { world, vmId, subnetId, nsgId } = linkedWorld();
    const ruled = must(addInboundRule(world, subnetId, nsgId, { port: 443, access: "Allow", priority: 100 }));
    const allowed = checkInboundInternet(ruled, vmId, 443);
    assert.equal(allowed.value?.allowed, true);
    assert.match(allowed.value?.summary ?? "", /securityRules\/Allow-443-Inbound-100, priority 100/);
    const other = checkInboundInternet(ruled, vmId, 80);
    assert.equal(other.value?.allowed, false);
    assert.match(other.value?.summary ?? "", /defaultSecurityRules\/DenyAllInBound, priority 65500/);
  });

  it("stops at a subnet deny and lets a NIC deny override a subnet allow", () => {
    const first = linkedWorld();
    const deniedWorld = must(addInboundRule(first.world, first.subnetId, first.nsgId, { port: 443, access: "Deny", priority: 100 }));
    const denied = checkInboundInternet(deniedWorld, first.vmId, 443);
    assert.equal(denied.value?.allowed, false);
    assert.match(denied.value?.summary ?? "", /securityRules\/Deny-443-Inbound-100/);
    assert.match(denied.trace.map((line) => line.detail ?? "").join("\n"), /does not see it/);

    const again = linkedWorld();
    let world = must(addInboundRule(again.world, again.subnetId, again.nsgId, { port: 443, access: "Allow", priority: 100 }));
    const nicNsg = must(createResource(world, {
      armType: "Microsoft.Network/networkSecurityGroups",
      name: "nsg-nic",
      resourceGroup: "rg-demo",
      location: "southeastasia",
    }));
    const nicNsgId = Object.values(nicNsg.resources).find((resource) => resource.name === "nsg-nic")!.id;
    world = must(updateResource(nicNsg, nicNsgId, {
      properties: {
        securityRules: [{
          name: "Deny-443-Inbound-200",
          properties: {
            priority: 200,
            direction: "Inbound",
            access: "Deny",
            protocol: "Tcp",
            sourceAddressPrefix: "Internet",
            sourcePortRange: "*",
            destinationAddressPrefix: "*",
            destinationPortRange: "443",
          },
        }],
      },
    }));
    world = must(updateResource(world, again.nicId, { properties: { networkSecurityGroupId: nicNsgId } }));
    const both = checkInboundInternet(world, again.vmId, 443);
    assert.equal(both.value?.allowed, false);
    assert.match(both.value?.summary ?? "", /securityRules\/Deny-443-Inbound-200/);
  });

  it("allows outbound when no security group exists, and ignores an inbound deny", () => {
    const { world, vmId } = linkedWorld();
    const open = checkOutboundInternet(world, vmId, 443);
    assert.equal(open.ok, true, open.error?.message);
    assert.equal(open.value?.allowed, true);
    assert.match(open.value?.summary ?? "", /not filtered/);
    assert.equal((open.value?.summary ?? "").includes("AllowInternetOutBound"), false);

    const { world: ruledWorld, vmId: ruledVm, subnetId, nsgId } = linkedWorld();
    const ruled = must(addInboundRule(ruledWorld, subnetId, nsgId, { port: 443, access: "Deny", priority: 100 }));
    const inbound = checkInboundInternet(ruled, ruledVm, 443);
    assert.equal(inbound.value?.allowed, false);
    const outbound = checkOutboundInternet(ruled, ruledVm, 443);
    assert.equal(outbound.value?.allowed, true);
    assert.match(outbound.value?.summary ?? "", /defaultSecurityRules\/AllowInternetOutBound, priority 65001/);
  });

  it("checks the network interface before the subnet on the way out", () => {
    const { world, vmId, nicId, subnetId, nsgId } = linkedWorld();
    const associated = must(addInboundRule(world, subnetId, nsgId, { port: 80, access: "Allow", priority: 100 }));
    const nicNsg = must(createResource(associated, {
      armType: "Microsoft.Network/networkSecurityGroups",
      name: "nsg-nic",
      resourceGroup: "rg-demo",
      location: "southeastasia",
    }));
    const nicNsgId = Object.values(nicNsg.resources).find((resource) => resource.name === "nsg-nic")!.id;
    const withRule = must(updateResource(nicNsg, nicNsgId, {
      properties: {
        securityRules: [outboundRule("Deny-443-Outbound-100", "Deny", 100)],
      },
    }));
    const attached = must(updateResource(withRule, nicId, { properties: { networkSecurityGroupId: nicNsgId } }));
    const denied = checkOutboundInternet(attached, vmId, 443);
    assert.equal(denied.value?.allowed, false);
    assert.match(denied.value?.summary ?? "", /securityRules\/Deny-443-Outbound-100/);
    assert.match(denied.trace.map((line) => line.detail ?? "").join("\n"), /subnet does not see it/);

    const subnetDeny = must(updateResource(associated, nsgId, {
      properties: {
        securityRules: [outboundRule("Deny-443-Outbound-110", "Deny", 110)],
      },
    }));
    const fromSubnet = checkOutboundInternet(subnetDeny, vmId, 443);
    assert.equal(fromSubnet.value?.allowed, false);
    assert.match(fromSubnet.value?.summary ?? "", /securityRules\/Deny-443-Outbound-110/);
  });

  it("adds an outbound rule without changing the inbound one", () => {
    const { world, vmId, subnetId, nsgId } = linkedWorld();
    const inbound = must(addInboundRule(world, subnetId, nsgId, { port: 443, access: "Allow", priority: 100 }));
    const ruled = must(addSecurityRule(inbound, nsgId, { direction: "Outbound", port: 443, access: "Deny", priority: 100 }));
    const outbound = checkOutboundInternet(ruled, vmId, 443);
    assert.equal(outbound.value?.allowed, false);
    assert.match(outbound.value?.summary ?? "", /securityRules\/Deny-443-Outbound-100, priority 100/);
    const stillIn = checkInboundInternet(ruled, vmId, 443);
    assert.equal(stillIn.value?.allowed, true);
    assert.match(stillIn.value?.summary ?? "", /securityRules\/Allow-443-Inbound-100/);

    const again = addSecurityRule(ruled, nsgId, { direction: "Outbound", port: 80, access: "Allow", priority: 100 });
    assert.equal(again.ok, false);
    assert.equal(again.error?.code, "DuplicateRulePriority");
    assert.match(again.error?.message ?? "", /same priority and direction/);
    assert.match(again.error?.next ?? "", /different priority/);

    const low = addSecurityRule(ruled, nsgId, { direction: "Outbound", port: 443, access: "Deny", priority: 50 });
    assert.equal(low.ok, false);
    assert.equal(low.error?.code, "InvalidPriority");
  });

  it("lets a virtual network rule deny the private address and leave the internet check alone", () => {
    const { world, vmId, nsgId, subnetId } = linkedWorld();
    const associated = must(addInboundRule(world, subnetId, nsgId, { port: 80, access: "Allow", priority: 100 }));
    const ruled = must(addSecurityRule(associated, nsgId, { direction: "Outbound", port: 443, access: "Deny", priority: 200, scope: "vnet" }));
    const checked = checkSameVirtualNetwork(ruled, vmId, "10.0.1.4", 443);
    assert.equal(checked.value?.allowed, false);
    assert.match(checked.value?.summary ?? "", /securityRules\/Deny-443-Outbound-VirtualNetwork-200/);
    const internet = checkOutboundInternet(ruled, vmId, 443);
    assert.equal(internet.value?.allowed, true);
    assert.match(internet.value?.summary ?? "", /AllowInternetOutBound/);
    assert.equal((internet.value?.summary ?? "").includes("VirtualNetwork"), false);
    const clash = addSecurityRule(ruled, nsgId, { direction: "Outbound", port: 80, access: "Allow", priority: 200, scope: "internet" });
    assert.equal(clash.ok, false);
    assert.equal(clash.error?.code, "DuplicateRulePriority");
  });

  it("drops outbound internet traffic on a None route and leaves the other checks alone", () => {
    const { world, vmId, subnetId } = linkedWorld();
    const routed = must(addInternetRoute(world, subnetId, { tableName: "rt-app", routeName: "to-internet", nextHop: "None" }));
    const dropped = checkOutboundInternet(routed, vmId, 443);
    assert.equal(dropped.value?.allowed, false);
    assert.match(dropped.value?.summary ?? "", /Dropped\. routes\/to-internet, 0\.0\.0\.0\/0, next hop None/);
    assert.match(dropped.trace.map((line) => line.detail ?? "").join("\n"), /dropped rather than routed outside the subnet/);
    const inbound = checkInboundInternet(routed, vmId, 443);
    assert.equal(inbound.value?.allowed, false);
    assert.equal((inbound.value?.summary ?? "").includes("to-internet"), false);
    const inside = checkSameVirtualNetwork(routed, vmId, "10.0.1.4", 443);
    assert.equal(inside.value?.allowed, true);
    assert.equal((inside.value?.summary ?? "").includes("to-internet"), false);

    const { world: deniedWorld, vmId: deniedVm, subnetId: deniedSubnet, nsgId } = linkedWorld();
    const associated = must(addInboundRule(deniedWorld, deniedSubnet, nsgId, { port: 80, access: "Allow", priority: 100 }));
    const withDeny = must(addSecurityRule(associated, nsgId, { direction: "Outbound", port: 443, access: "Deny", priority: 100 }));
    const stillDenied = must(addInternetRoute(withDeny, deniedSubnet, { tableName: "rt-app", routeName: "to-internet", nextHop: "None" }));
    const outbound = checkOutboundInternet(stillDenied, deniedVm, 443);
    assert.match(outbound.value?.summary ?? "", /securityRules\/Deny-443-Outbound-100/);
    assert.equal((outbound.trace.map((line) => line.detail ?? "").join("\n")).includes("next hop None"), false);

    const allowedPort = checkOutboundInternet(stillDenied, deniedVm, 80);
    assert.match(allowedPort.value?.summary ?? "", /routes\/to-internet, 0\.0\.0\.0\/0, next hop None/);

    const viaInternet = must(addInternetRoute(world, subnetId, { tableName: "rt-web", routeName: "to-internet", nextHop: "Internet" }));
    const open = checkOutboundInternet(viaInternet, vmId, 443);
    assert.equal(open.value?.allowed, true);
    assert.match(open.value?.summary ?? "", /not filtered/);
    assert.match(open.trace.map((line) => line.detail ?? "").join("\n"), /next hop Internet/);

    const again = addInternetRoute(routed, subnetId, { tableName: "rt-app", routeName: "also-internet", nextHop: "Internet" });
    assert.equal(again.ok, false);
    assert.equal(again.error?.code, "DuplicateRoutePrefix");
    assert.match(again.error?.message ?? "", /can't be duplicated/);
    const otherTable = addInternetRoute(routed, subnetId, { tableName: "rt-other", routeName: "to-internet", nextHop: "None" });
    assert.equal(otherTable.ok, false);
    assert.equal(otherTable.error?.code, "RouteTableAlreadyAssociated");
    const removed = deleteResource(routed, Object.values(routed.resources).find((resource) => resource.name === "rt-app")!.id);
    assert.equal(removed.ok, false);
    assert.match(removed.error?.message ?? "", /associated to any subnets/);
    assert.match(removed.error?.next ?? "", /Reset the subscription/);

    const elsewhere = must(createResource(world, {
      armType: "Microsoft.Network/routeTables",
      name: "rt-east",
      resourceGroup: "rg-demo",
      location: "eastasia",
    }));
    const mismatch = addInternetRoute(elsewhere, subnetId, { tableName: "rt-east", routeName: "to-internet", nextHop: "None" });
    assert.equal(mismatch.ok, false);
    assert.equal(mismatch.error?.code, "RouteTableRegionMismatch");
  });

  it("lets a longer prefix decide a private address and leave the internet route alone", () => {
    const { world, vmId, subnetId } = linkedWorld();
    const internet = must(addInternetRoute(world, subnetId, { tableName: "rt-app", routeName: "to-internet", nextHop: "None", addressPrefix: "0.0.0.0/0" }));
    const longer = must(addInternetRoute(internet, subnetId, { tableName: "rt-app", routeName: "drop-subnet", nextHop: "None", addressPrefix: "10.0.1.0/24" }));
    const dropped = checkSameVirtualNetwork(longer, vmId, "10.0.1.4", 443);
    assert.equal(dropped.value?.allowed, false);
    assert.match(dropped.value?.summary ?? "", /Dropped\. routes\/drop-subnet, 10\.0\.1\.0\/24, next hop None/);
    assert.equal((dropped.trace.map((line) => line.detail ?? "").join("\n")).includes("has 10.0.1.4"), false);
    const outbound = checkOutboundInternet(longer, vmId, 443);
    assert.match(outbound.value?.summary ?? "", /routes\/to-internet, 0\.0\.0\.0\/0, next hop None/);
    assert.equal((outbound.value?.summary ?? "").includes("drop-subnet"), false);

    const onlyLonger = must(addInternetRoute(world, subnetId, { tableName: "rt-app", routeName: "drop-subnet", nextHop: "None", addressPrefix: "10.0.1.0/24" }));
    const stillOpen = checkOutboundInternet(onlyLonger, vmId, 443);
    assert.match(stillOpen.value?.summary ?? "", /not filtered/);
    const inside = checkSameVirtualNetwork(onlyLonger, vmId, "10.0.1.4", 80);
    assert.match(inside.value?.summary ?? "", /routes\/drop-subnet, 10\.0\.1\.0\/24/);

    const sent = must(addInternetRoute(world, subnetId, { tableName: "rt-web", routeName: "via-internet", nextHop: "Internet", addressPrefix: "10.0.1.4/32" }));
    const left = checkSameVirtualNetwork(sent, vmId, "10.0.1.4", 443);
    assert.match(left.value?.summary ?? "", /Sent to the internet\. routes\/via-internet, 10\.0\.1\.4\/32, next hop Internet/);
    const elsewhere = checkSameVirtualNetwork(sent, vmId, "10.0.1.5", 443);
    assert.equal(elsewhere.value?.allowed, false);
    assert.match(elsewhere.value?.summary ?? "", /No network interface has 10\.0\.1\.5/);

    const { world: deniedWorld, vmId: deniedVm, subnetId: deniedSubnet, nsgId } = linkedWorld();
    const associated = must(addInboundRule(deniedWorld, deniedSubnet, nsgId, { port: 80, access: "Allow", priority: 100 }));
    const ruled = must(addSecurityRule(associated, nsgId, { direction: "Outbound", port: 443, access: "Deny", priority: 200, scope: "vnet" }));
    const withRoute = must(addInternetRoute(ruled, deniedSubnet, { tableName: "rt-app", routeName: "drop-subnet", nextHop: "None", addressPrefix: "10.0.1.0/24" }));
    const denied = checkSameVirtualNetwork(withRoute, deniedVm, "10.0.1.4", 443);
    assert.match(denied.value?.summary ?? "", /Deny-443-Outbound-VirtualNetwork-200/);
    assert.equal((denied.trace.map((line) => line.detail ?? "").join("\n")).includes("drop-subnet"), false);

    const hostBits = addInternetRoute(world, subnetId, { tableName: "rt-app", routeName: "bad-prefix", nextHop: "None", addressPrefix: "10.0.1.4/24" });
    assert.equal(hostBits.ok, false);
    assert.equal(hostBits.error?.code, "InvalidPrefix");
    assert.match(hostBits.error?.next ?? "", /10\.0\.1\.0\/24/);
    const nested = addInternetRoute(longer, subnetId, { tableName: "rt-app", routeName: "drop-host", nextHop: "None", addressPrefix: "10.0.1.4/32" });
    assert.equal(nested.ok, true, nested.error?.message);
  });

  it("reaches a private address in a directly peered virtual network", () => {
    const { world, vmId, subnetId } = linkedWorld();
    const hub = must(createResource(world, {
      armType: "Microsoft.Network/virtualNetworks",
      name: "vnet-hub",
      resourceGroup: "rg-demo",
      location: "eastasia",
      properties: { addressSpace: { addressPrefixes: ["10.2.0.0/16"] } },
    }));
    const hubId = Object.values(hub.resources).find((resource) => resource.name === "vnet-hub")!.id;
    const withSubnet = must(createResource(hub, {
      armType: "Microsoft.Network/virtualNetworks/subnets",
      name: "snet-hub",
      resourceGroup: "rg-demo",
      parentName: "vnet-hub",
      location: "eastasia",
      properties: { addressPrefix: "10.2.0.0/24" },
    }));
    const hubSubnetId = Object.values(withSubnet.resources).find((resource) => resource.name === "snet-hub")!.id;
    const withNic = must(createResource(withSubnet, {
      armType: "Microsoft.Network/networkInterfaces",
      name: "nic-hub",
      resourceGroup: "rg-demo",
      location: "eastasia",
      properties: { subnetId: hubSubnetId, ipConfigurations: [{ name: "ipconfig1", properties: { subnet: { id: hubSubnetId } } }] },
    }));
    const seaId = Object.values(world.resources).find((resource) => resource.name === "vnet-sea")!.id;
    const before = checkSameVirtualNetwork(withNic, vmId, "10.2.0.4", 443);
    assert.equal(before.error?.code, "PeeringNotConnected");
    const peered = must(peerVirtualNetworks(withNic, seaId, hubId));
    const open = checkSameVirtualNetwork(peered, vmId, "10.2.0.4", 443);
    assert.equal(open.ok, true, open.error?.message);
    assert.equal(open.value?.allowed, true);
    assert.match(open.trace.map((line) => line.detail ?? "").join("\n"), /Both links are Connected/);
    assert.match(open.trace.map((line) => line.detail ?? "").join("\n"), /nic-hub has 10\.2\.0\.4/);

    const blocked = must(addInternetRoute(peered, subnetId, { tableName: "rt-app", routeName: "to-internet", nextHop: "None", addressPrefix: "0.0.0.0/0" }));
    const stillOpen = checkSameVirtualNetwork(blocked, vmId, "10.2.0.4", 443);
    assert.equal(stillOpen.value?.allowed, true);
    const internet = checkOutboundInternet(blocked, vmId, 443);
    assert.match(internet.value?.summary ?? "", /routes\/to-internet, 0\.0\.0\.0\/0, next hop None/);

    const spoke = must(createResource(peered, {
      armType: "Microsoft.Network/virtualNetworks",
      name: "vnet-spoke",
      resourceGroup: "rg-demo",
      location: "southeastasia",
      properties: { addressSpace: { addressPrefixes: ["10.3.0.0/16"] } },
    }));
    const spokeId = Object.values(spoke.resources).find((resource) => resource.name === "vnet-spoke")!.id;
    const hubToSpoke = must(peerVirtualNetworks(spoke, hubId, spokeId));
    const indirect = checkSameVirtualNetwork(hubToSpoke, vmId, "10.3.0.4", 443);
    assert.equal(indirect.error?.code, "PeeringNotConnected");

    const overlap = peerVirtualNetworks(world, seaId, seaId);
    assert.equal(overlap.error?.code, "PeeringSameNetwork");
    const sameSpace = must(createResource(world, {
      armType: "Microsoft.Network/virtualNetworks",
      name: "vnet-copy",
      resourceGroup: "rg-demo",
      location: "southeastasia",
      properties: { addressSpace: { addressPrefixes: ["10.0.0.0/16"] } },
    }));
    const copyId = Object.values(sameSpace.resources).find((resource) => resource.name === "vnet-copy")!.id;
    const refused = peerVirtualNetworks(sameSpace, seaId, copyId);
    assert.equal(refused.error?.code, "AddressSpaceOverlap");
    assert.match(refused.error?.message ?? "", /address spaces overlap/);

    const localId = Object.values(peered.resources).find((resource) => resource.name === "vnet-sea-to-vnet-hub")!.id;
    const cleared = must(updateResource(peered, localId, { properties: { allowVirtualNetworkAccess: false } }));
    const denied = checkSameVirtualNetwork(cleared, vmId, "10.2.0.4", 443);
    assert.equal(denied.error?.code, "VnetAccessDisabled");
    const removed = must(deleteResource(peered, localId));
    const disconnected = checkSameVirtualNetwork(removed, vmId, "10.2.0.4", 443);
    assert.equal(disconnected.error?.code, "PeeringNotConnected");
    assert.match(disconnected.error?.message ?? "", /both virtual network peerings is Connected/);
  });

  it("sends traffic to a virtual appliance and stops there", () => {
    const { world, vmId, subnetId } = linkedWorld();
    const withSubnet = must(createResource(world, {
      armType: "Microsoft.Network/virtualNetworks/subnets",
      name: "snet-nva",
      resourceGroup: "rg-demo",
      parentName: "vnet-sea",
      location: "southeastasia",
      properties: { addressPrefix: "10.0.2.0/24" },
    }));
    const nvaSubnetId = Object.values(withSubnet.resources).find((resource) => resource.name === "snet-nva")!.id;
    const withNic = must(createResource(withSubnet, {
      armType: "Microsoft.Network/networkInterfaces",
      name: "nic-nva",
      resourceGroup: "rg-demo",
      location: "southeastasia",
      properties: { subnetId: nvaSubnetId, ipConfigurations: [{ name: "ipconfig1", properties: { subnet: { id: nvaSubnetId } } }] },
    }));
    const nvaId = Object.values(withNic.resources).find((resource) => resource.name === "nic-nva")!.id;
    const missing = addInternetRoute(withNic, subnetId, { tableName: "rt-app", routeName: "via-nva", nextHop: "VirtualAppliance", addressPrefix: "0.0.0.0/0" });
    assert.equal(missing.error?.code, "InvalidNextHopAddress");
    const routed = must(addInternetRoute(withNic, subnetId, {
      tableName: "rt-app",
      routeName: "via-nva",
      nextHop: "VirtualAppliance",
      addressPrefix: "0.0.0.0/0",
      nextHopIpAddress: "10.0.2.4",
    }));
    const blocked = checkOutboundInternet(routed, vmId, 443);
    assert.match(blocked.value?.summary ?? "", /IP forwarding is disabled on nic-nva/);
    assert.match(blocked.trace.map((line) => line.detail ?? "").join("\n"), /does not say explicitly that Azure drops the packet/);
    const inside = checkSameVirtualNetwork(routed, vmId, "10.0.1.4", 443);
    assert.equal(inside.value?.allowed, true);
    assert.equal((inside.value?.summary ?? "").includes("nic-nva"), false);

    const enabled = must(setIpForwarding(routed, nvaId, true));
    const sent = checkOutboundInternet(enabled, vmId, 443);
    assert.match(sent.value?.summary ?? "", /Sent to nic-nva\. routes\/via-nva, 0\.0\.0\.0\/0, next hop VirtualAppliance 10\.0\.2\.4/);
    assert.match(sent.trace.map((line) => line.detail ?? "").join("\n"), /not part of this check/);

    const looped = must(addInternetRoute(world, subnetId, {
      tableName: "rt-loop",
      routeName: "to-self",
      nextHop: "VirtualAppliance",
      addressPrefix: "0.0.0.0/0",
      nextHopIpAddress: "10.0.1.4",
    }));
    const loop = checkOutboundInternet(looped, vmId, 443);
    assert.match(loop.value?.summary ?? "", /Routing loop/);
    const absent = must(addInternetRoute(world, subnetId, {
      tableName: "rt-missing",
      routeName: "nowhere",
      nextHop: "VirtualAppliance",
      addressPrefix: "0.0.0.0/0",
      nextHopIpAddress: "10.9.9.9",
    }));
    const gone = checkOutboundInternet(absent, vmId, 443);
    assert.match(gone.value?.summary ?? "", /No network interface in this virtual network or a peered one has 10\.9\.9\.9/);

    const associated = must(addInboundRule(withNic, subnetId, Object.values(withNic.resources).find((resource) => resource.name === "nsg-web")!.id, { port: 80, access: "Allow", priority: 100 }));
    const deniedWorld = must(addSecurityRule(associated, Object.values(associated.resources).find((resource) => resource.name === "nsg-web")!.id, {
      direction: "Outbound",
      port: 443,
      access: "Deny",
      priority: 100,
    }));
    const withAppliance = must(addInternetRoute(deniedWorld, subnetId, {
      tableName: "rt-app",
      routeName: "via-nva",
      nextHop: "VirtualAppliance",
      addressPrefix: "0.0.0.0/0",
      nextHopIpAddress: "10.0.2.4",
    }));
    const denied = checkOutboundInternet(withAppliance, vmId, 443);
    assert.match(denied.value?.summary ?? "", /securityRules\/Deny-443-Outbound-100/);
    assert.equal((denied.trace.map((line) => line.detail ?? "").join("\n")).includes("VirtualAppliance"), false);

    const internet = must(addInternetRoute(withNic, subnetId, {
      tableName: "rt-mix",
      routeName: "to-internet",
      nextHop: "Internet",
      addressPrefix: "0.0.0.0/0",
    }));
    const hostRoute = must(addInternetRoute(internet, subnetId, {
      tableName: "rt-mix",
      routeName: "via-host",
      nextHop: "VirtualAppliance",
      addressPrefix: "10.0.1.4/32",
      nextHopIpAddress: "10.0.2.4",
    }));
    const host = checkSameVirtualNetwork(hostRoute, vmId, "10.0.1.4", 443);
    assert.match(host.value?.summary ?? "", /IP forwarding is disabled on nic-nva/);
    const outbound = checkOutboundInternet(hostRoute, vmId, 443);
    assert.match(outbound.value?.summary ?? "", /not filtered/);
    assert.equal((outbound.trace.map((line) => line.detail ?? "").join("\n")).includes("via-host"), false);

    const hub = must(createResource(withNic, {
      armType: "Microsoft.Network/virtualNetworks",
      name: "vnet-hub",
      resourceGroup: "rg-demo",
      location: "eastasia",
      properties: { addressSpace: { addressPrefixes: ["10.2.0.0/16"] } },
    }));
    const hubId = Object.values(hub.resources).find((resource) => resource.name === "vnet-hub")!.id;
    const hubSubnet = must(createResource(hub, {
      armType: "Microsoft.Network/virtualNetworks/subnets",
      name: "snet-hub",
      resourceGroup: "rg-demo",
      parentName: "vnet-hub",
      location: "eastasia",
      properties: { addressPrefix: "10.2.0.0/24" },
    }));
    const hubSubnetId = Object.values(hubSubnet.resources).find((resource) => resource.name === "snet-hub")!.id;
    const hubNic = must(createResource(hubSubnet, {
      armType: "Microsoft.Network/networkInterfaces",
      name: "nic-hub",
      resourceGroup: "rg-demo",
      location: "eastasia",
      properties: { subnetId: hubSubnetId, ipConfigurations: [{ name: "ipconfig1", properties: { subnet: { id: hubSubnetId } } }] },
    }));
    const beforePeer = must(addInternetRoute(hubNic, subnetId, {
      tableName: "rt-peer",
      routeName: "via-hub",
      nextHop: "VirtualAppliance",
      addressPrefix: "10.0.1.4/32",
      nextHopIpAddress: "10.2.0.4",
    }));
    const outside = checkSameVirtualNetwork(beforePeer, vmId, "10.0.1.4", 443);
    assert.match(outside.value?.summary ?? "", /No network interface in this virtual network or a peered one has 10\.2\.0\.4/);
    const seaId = Object.values(world.resources).find((resource) => resource.name === "vnet-sea")!.id;
    const peered = must(peerVirtualNetworks(beforePeer, seaId, hubId));
    const forwarded = checkSameVirtualNetwork(peered, vmId, "10.0.1.4", 443);
    assert.match(forwarded.value?.summary ?? "", /IP forwarding is disabled on nic-hub/);
  });

  it("allows a private address in the virtual network, and ignores an internet rule", () => {
    const { world, vmId } = linkedWorld();
    const open = checkSameVirtualNetwork(world, vmId, "10.0.1.4", 443);
    assert.equal(open.ok, true, open.error?.message);
    assert.equal(open.value?.allowed, true);
    assert.match(open.value?.summary ?? "", /not filtered/);

    const { world: ruledWorld, vmId: ruledVm, subnetId, nsgId } = linkedWorld();
    const inbound = must(addInboundRule(ruledWorld, subnetId, nsgId, { port: 443, access: "Deny", priority: 100 }));
    const ruled = must(addSecurityRule(inbound, nsgId, { direction: "Outbound", port: 443, access: "Deny", priority: 100 }));
    const checked = checkSameVirtualNetwork(ruled, ruledVm, "10.0.1.4", 443);
    assert.equal(checked.value?.allowed, true);
    assert.match(checked.value?.summary ?? "", /defaultSecurityRules\/AllowVNetInBound, priority 65000/);
    const trace = checked.trace.map((line) => line.detail ?? "").join("\n");
    assert.match(trace, /AllowVnetOutBound/);
    assert.match(trace, /nic-web-01 has 10\.0\.1\.4/);
    assert.equal(trace.includes("not recorded"), false);
    assert.equal(trace.includes("Deny-443"), false);

    const before = JSON.stringify(world);
    const outside = checkSameVirtualNetwork(world, vmId, "8.8.8.8", 443);
    assert.equal(outside.ok, false);
    assert.equal(outside.error?.code, "AddressOutsideVnet");
    assert.match(outside.error?.next ?? "", /inside this virtual network/);
    const gap = checkSameVirtualNetwork(world, vmId, "10.0.9.4", 443);
    assert.equal(gap.error?.code, "AddressOutsideSubnet");
    assert.match(gap.error?.next ?? "", /10\.0\.1\.0\/24/);
    const bad = checkSameVirtualNetwork(world, vmId, "nope", 443);
    assert.equal(bad.error?.code, "InvalidAddress");
    assert.equal(JSON.stringify(world), before);
  });

  it("denies virtual network traffic at the first group that matches", () => {
    const { world, vmId, nicId, subnetId, nsgId } = linkedWorld();
    const associated = must(addInboundRule(world, subnetId, nsgId, { port: 80, access: "Allow", priority: 100 }));
    const nicNsg = must(createResource(associated, {
      armType: "Microsoft.Network/networkSecurityGroups",
      name: "nsg-nic",
      resourceGroup: "rg-demo",
      location: "southeastasia",
    }));
    const nicNsgId = Object.values(nicNsg.resources).find((resource) => resource.name === "nsg-nic")!.id;
    const withRule = must(updateResource(nicNsg, nicNsgId, {
      properties: { securityRules: [vnetRule("Deny-443-Outbound-100", "Outbound", 100)] },
    }));
    const attached = must(updateResource(withRule, nicId, { properties: { networkSecurityGroupId: nicNsgId } }));
    const denied = checkSameVirtualNetwork(attached, vmId, "10.0.1.4", 443);
    assert.equal(denied.value?.allowed, false);
    assert.match(denied.value?.summary ?? "", /securityRules\/Deny-443-Outbound-100/);
    assert.match(denied.trace.map((line) => line.detail ?? "").join("\n"), /destination does not see it/);

    const other = must(createResource(world, {
      armType: "Microsoft.Network/virtualNetworks/subnets",
      name: "snet-db",
      resourceGroup: "rg-demo",
      parentName: "vnet-sea",
      location: "southeastasia",
      properties: { addressPrefix: "10.0.2.0/24" },
    }));
    const dbId = Object.values(other.resources).find((resource) => resource.name === "snet-db")!.id;
    const dbNic = must(createResource(other, {
      armType: "Microsoft.Network/networkInterfaces",
      name: "nic-db",
      resourceGroup: "rg-demo",
      location: "southeastasia",
      properties: { subnetId: dbId, ipConfigurations: [{ name: "ipconfig1", properties: { subnet: { id: dbId } } }] },
    }));
    const dbNsg = must(createResource(dbNic, {
      armType: "Microsoft.Network/networkSecurityGroups",
      name: "nsg-db",
      resourceGroup: "rg-demo",
      location: "southeastasia",
    }));
    const dbNsgId = Object.values(dbNsg.resources).find((resource) => resource.name === "nsg-db")!.id;
    const dbRuled = must(updateResource(dbNsg, dbNsgId, {
      properties: { securityRules: [vnetRule("Deny-443-Inbound-100", "Inbound", 100)] },
    }));
    const linked = must(updateResource(dbRuled, dbId, { properties: { networkSecurityGroupId: dbNsgId } }));
    const fromApp = checkSameVirtualNetwork(linked, vmId, "10.0.2.4", 443);
    assert.equal(fromApp.value?.allowed, false);
    assert.match(fromApp.value?.summary ?? "", /securityRules\/Deny-443-Inbound-100/);
    assert.match(fromApp.trace.map((line) => line.detail ?? "").join("\n"), /does not see it/);
    const empty = checkSameVirtualNetwork(linked, vmId, "10.0.2.5", 443);
    assert.equal(empty.value?.allowed, false);
    assert.match(empty.value?.summary ?? "", /No network interface has 10\.0\.2\.5/);
  });

  it("refuses a fourth network interface in a /29 subnet", () => {
    let world = must(createResourceGroup(starterWorld(), { name: "rg-demo", location: "southeastasia" }));
    world = must(createResource(world, {
      armType: "Microsoft.Network/virtualNetworks",
      name: "vnet-sea",
      resourceGroup: "rg-demo",
      location: "southeastasia",
      properties: { addressSpace: { addressPrefixes: ["10.0.0.0/16"] } },
    }));
    world = must(createResource(world, {
      armType: "Microsoft.Network/virtualNetworks/subnets",
      name: "snet-tiny",
      resourceGroup: "rg-demo",
      parentName: "vnet-sea",
      location: "southeastasia",
      properties: { addressPrefix: "10.0.3.0/29" },
    }));
    const subnetId = Object.values(world.resources).find((resource) => resource.name === "snet-tiny")!.id;
    for (const name of ["nic-a", "nic-b", "nic-c"]) {
      world = must(createResource(world, {
        armType: "Microsoft.Network/networkInterfaces",
        name,
        resourceGroup: "rg-demo",
        location: "southeastasia",
        properties: { subnetId },
      }));
    }
    const full = createResource(world, {
      armType: "Microsoft.Network/networkInterfaces",
      name: "nic-d",
      resourceGroup: "rg-demo",
      location: "southeastasia",
      properties: { subnetId },
    });
    assert.equal(full.ok, false);
    assert.equal(full.error?.code, "SubnetFull");
    assert.match(full.error?.message ?? "", /first four addresses and the last/);
    assert.match(full.error?.next ?? "", /larger subnet/);
  });

  it("puts a network security group on the network interface and blocks deleting it", () => {
    const { world, vmId, nicId, subnetId, nsgId } = linkedWorld();
    const ruled = must(addInboundRule(world, subnetId, nsgId, { port: 443, access: "Allow", priority: 100 }));
    const associated = must(associateNicSecurityGroup(ruled, nicId, nsgId));
    const removed = deleteResource(associated, nsgId);
    assert.equal(removed.ok, false);
    assert.match(removed.error?.message ?? "", /can't delete it/);
    assert.match(removed.error?.next ?? "", /Reset the subscription/);
    const checked = checkInboundInternet(associated, vmId, 443);
    assert.equal(checked.value?.allowed, true);
    assert.match(checked.trace.map((line) => line.detail ?? "").join("\n"), /nic-web-01 uses nsg-web/);

    const fresh = linkedWorld();
    const east = must(createResource(fresh.world, {
      armType: "Microsoft.Network/networkSecurityGroups",
      name: "nsg-east",
      resourceGroup: "rg-demo",
      location: "eastasia",
    }));
    const eastId = Object.values(east.resources).find((resource) => resource.name === "nsg-east")!.id;
    const mismatch = associateNicSecurityGroup(east, fresh.nicId, eastId);
    assert.equal(mismatch.ok, false);
    assert.equal(mismatch.error?.code, "NsgRegionMismatch");

    const other = must(createResource(associated, {
      armType: "Microsoft.Network/networkSecurityGroups",
      name: "nsg-nic",
      resourceGroup: "rg-demo",
      location: "southeastasia",
    }));
    const otherId = Object.values(other.resources).find((resource) => resource.name === "nsg-nic")!.id;
    const again = associateNicSecurityGroup(other, nicId, otherId);
    assert.equal(again.ok, false);
    assert.equal(again.error?.code, "NsgAlreadyAssociated");
  });

  it("refuses a port outside 1 to 65535 and does not change the world", () => {
    const { world, vmId } = linkedWorld();
    const before = JSON.stringify(world);
    const checked = checkInboundInternet(world, vmId, 0);
    assert.equal(checked.ok, false);
    assert.equal(checked.error?.code, "InvalidPort");
    assert.equal(JSON.stringify(world), before);
  });
});
