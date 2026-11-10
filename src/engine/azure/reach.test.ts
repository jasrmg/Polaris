import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addInboundRule,
  addPrivateDnsRecord,
  setPrivateDnsRegistration,
  addInternetRoute,
  addSecurityRule,
  peerVirtualNetworks,
  setForwardedTraffic,
  setPeeringOptions,
  setPower,
  setIpForwarding,
  setServiceEndpoint,
  setStorageFirewall,
  associateNicSecurityGroup,
  attachNetworkInterface,
  attachPublicIp,
  checkInboundInternet,
  checkOutboundInternet,
  checkSameVirtualNetwork,
  checkStorage,
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
    assert.equal(sent.value?.allowed, false);
    assert.match(sent.value?.summary ?? "", /Stopped at nic-nva\. snet-nva has no user route that wins for 0\.0\.0\.0\/0/);
    assert.match(sent.trace.map((line) => line.detail ?? "").join("\n"), /guest operating system is not part of this check/);

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

  it("uses the appliance security group and one route, then stops", () => {
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
    const enabled = must(setIpForwarding(withNic, nvaId, true));
    const routed = must(addInternetRoute(enabled, subnetId, {
      tableName: "rt-app",
      routeName: "via-nva",
      nextHop: "VirtualAppliance",
      addressPrefix: "0.0.0.0/0",
      nextHopIpAddress: "10.0.2.4",
    }));
    const droppedWorld = must(addInternetRoute(routed, nvaSubnetId, {
      tableName: "rt-nva",
      routeName: "drop-internet",
      nextHop: "None",
      addressPrefix: "0.0.0.0/0",
    }));
    const dropped = checkOutboundInternet(droppedWorld, vmId, 443);
    assert.equal(dropped.value?.allowed, false);
    assert.match(dropped.value?.summary ?? "", /Dropped\. routes\/drop-internet, 0\.0\.0\.0\/0, next hop None/);

    const internetWorld = must(addInternetRoute(routed, nvaSubnetId, {
      tableName: "rt-nva-internet",
      routeName: "leave",
      nextHop: "Internet",
      addressPrefix: "0.0.0.0/0",
    }));
    const sentInternet = checkOutboundInternet(internetWorld, vmId, 443);
    assert.match(sentInternet.value?.summary ?? "", /Sent to the internet from nic-nva\. routes\/leave, 0\.0\.0\.0\/0, next hop Internet/);
    assert.equal(sentInternet.value?.allowed, false);

    const second = must(addInternetRoute(routed, nvaSubnetId, {
      tableName: "rt-nva-next",
      routeName: "via-next",
      nextHop: "VirtualAppliance",
      addressPrefix: "0.0.0.0/0",
      nextHopIpAddress: "10.0.1.4",
    }));
    const halted = checkOutboundInternet(second, vmId, 443);
    assert.match(halted.value?.summary ?? "", /IP forwarding is disabled on nic-web-01/);
    assert.match(halted.trace.map((line) => line.detail ?? "").join("\n"), /via-next/);

    const nsg = must(createResource(droppedWorld, {
      armType: "Microsoft.Network/networkSecurityGroups",
      name: "nsg-nva",
      resourceGroup: "rg-demo",
      location: "southeastasia",
    }));
    const nsgId = Object.values(nsg.resources).find((resource) => resource.name === "nsg-nva")!.id;
    const ruled = must(addSecurityRule(nsg, nsgId, { direction: "Outbound", port: 443, access: "Deny", priority: 100 }));
    const associated = must(associateNicSecurityGroup(ruled, nvaId, nsgId));
    const denied = checkOutboundInternet(associated, vmId, 443);
    assert.match(denied.value?.summary ?? "", /securityRules\/Deny-443-Outbound-100/);
    const deniedTrace = denied.trace.map((line) => line.detail ?? "").join("\n");
    assert.match(deniedTrace, /route on snet-nva is not consulted/);
    assert.equal(deniedTrace.includes("drop-internet"), false);

    const host = must(addInternetRoute(routed, subnetId, {
      tableName: "rt-app",
      routeName: "via-host",
      nextHop: "VirtualAppliance",
      addressPrefix: "10.0.1.4/32",
      nextHopIpAddress: "10.0.2.4",
    }));
    const noRoute = checkSameVirtualNetwork(host, vmId, "10.0.1.4", 80);
    assert.equal(noRoute.value?.allowed, true);
    const noRouteTrace = noRoute.trace.map((line) => line.detail ?? "").join("\n");
    assert.match(noRouteTrace, /system route delivers it/);
    assert.match(noRouteTrace, /nic-web-01 has 10\.0\.1\.4/);

    const nvaDrop = must(addInternetRoute(host, nvaSubnetId, {
      tableName: "rt-nva-host",
      routeName: "drop-host",
      nextHop: "None",
      addressPrefix: "10.0.1.4/32",
    }));
    const privateDrop = checkSameVirtualNetwork(nvaDrop, vmId, "10.0.1.4", 80);
    assert.match(privateDrop.value?.summary ?? "", /Dropped\. routes\/drop-host, 10\.0\.1\.4\/32, next hop None/);

    const broad = must(addInternetRoute(host, nvaSubnetId, {
      tableName: "rt-nva-broad",
      routeName: "drop-all",
      nextHop: "None",
      addressPrefix: "0.0.0.0/0",
    }));
    const stillLocal = checkSameVirtualNetwork(broad, vmId, "10.0.1.4", 80);
    assert.equal(stillLocal.value?.allowed, true);
    const stillTrace = stillLocal.trace.map((line) => line.detail ?? "").join("\n");
    assert.match(stillTrace, /system route delivers it/);
    assert.equal(stillTrace.includes("drop-all"), false);
  });

  it("uses a Microsoft.Storage service endpoint instead of a user route", () => {
    const { world, vmId, subnetId } = linkedWorld();
    const account = must(createResource(world, {
      armType: "Microsoft.Storage/storageAccounts",
      name: "stsea001",
      resourceGroup: "rg-demo",
      location: "eastasia",
      sku: { name: "Standard_LRS" },
      kind: "StorageV2",
    }));
    const accountId = Object.values(account.resources).find((resource) => resource.name === "stsea001")!.id;
    const blocked = must(addInternetRoute(account, subnetId, {
      tableName: "rt-app",
      routeName: "drop-internet",
      nextHop: "None",
      addressPrefix: "0.0.0.0/0",
    }));
    const dropped = checkStorage(blocked, vmId, accountId, 443);
    assert.match(dropped.value?.summary ?? "", /Dropped\. routes\/drop-internet/);
    assert.match(dropped.trace.map((line) => line.detail ?? "").join("\n"), /firewall is not consulted/);
    const internet = checkOutboundInternet(blocked, vmId, 443);
    assert.match(internet.value?.summary ?? "", /Dropped\. routes\/drop-internet/);

    const enabled = must(setServiceEndpoint(blocked, subnetId, "Microsoft.Storage"));
    const open = checkStorage(enabled, vmId, accountId, 443);
    assert.equal(open.value?.allowed, true, open.error?.message);
    const openTrace = open.trace.map((line) => line.detail ?? "").join("\n");
    assert.match(openTrace, /VirtualNetworkServiceEndpoint/);
    assert.match(openTrace, /eastasia, the paired region of southeastasia/);
    assert.equal(openTrace.includes("drop-internet"), false);

    const denied = must(setStorageFirewall(enabled, accountId, { defaultAction: "Deny", subnetId: "" }));
    const rejected = checkStorage(denied, vmId, accountId, 443);
    assert.equal(rejected.value?.allowed, false);
    assert.match(rejected.value?.summary ?? "", /HTTP 403 or 404/);

    const allowed = must(setStorageFirewall(denied, accountId, { defaultAction: "Deny", subnetId }));
    const accepted = checkStorage(allowed, vmId, accountId, 443);
    assert.equal(accepted.value?.allowed, true, accepted.error?.message);
    assert.match(accepted.value?.summary ?? "", /Virtual network rule/);

    const nsg = must(createResource(allowed, {
      armType: "Microsoft.Network/networkSecurityGroups",
      name: "nsg-storage",
      resourceGroup: "rg-demo",
      location: "southeastasia",
    }));
    const nsgId = Object.values(nsg.resources).find((resource) => resource.name === "nsg-storage")!.id;
    const ruled = must(addSecurityRule(nsg, nsgId, { direction: "Outbound", port: 443, access: "Deny", priority: 100 }));
    const nicId = Object.values(ruled.resources).find((resource) => resource.name === "nic-web-01")!.id;
    const associated = must(associateNicSecurityGroup(ruled, nicId, nsgId));
    const stopped = checkStorage(associated, vmId, accountId, 443);
    assert.match(stopped.value?.summary ?? "", /Deny-443-Outbound-100/);
    assert.equal(stopped.trace.some((line) => (line.detail ?? "").includes("VirtualNetworkServiceEndpoint")), false);
  });

  it("follows a second appliance, then stops on a loop or the eighth hop", () => {
    const { world, vmId, subnetId } = linkedWorld();
    const hop = (current: World, index: number) => {
      const withSubnet = must(createResource(current, {
        armType: "Microsoft.Network/virtualNetworks/subnets",
        name: `snet-nva-${index}`,
        resourceGroup: "rg-demo",
        parentName: "vnet-sea",
        location: "southeastasia",
        properties: { addressPrefix: `10.0.${index}.0/24` },
      }));
      const nvaSubnetId = Object.values(withSubnet.resources).find((resource) => resource.name === `snet-nva-${index}`)!.id;
      const withNic = must(createResource(withSubnet, {
        armType: "Microsoft.Network/networkInterfaces",
        name: `nic-nva-${index}`,
        resourceGroup: "rg-demo",
        location: "southeastasia",
        properties: { subnetId: nvaSubnetId, ipConfigurations: [{ name: "ipconfig1", properties: { subnet: { id: nvaSubnetId } } }] },
      }));
      const nicId = Object.values(withNic.resources).find((resource) => resource.name === `nic-nva-${index}`)!.id;
      return { world: must(setIpForwarding(withNic, nicId, true)), subnetId: nvaSubnetId };
    };
    const first = hop(world, 2);
    const second = hop(first.world, 3);
    const fromSource = must(addInternetRoute(second.world, subnetId, {
      tableName: "rt-app",
      routeName: "via-nva",
      nextHop: "VirtualAppliance",
      addressPrefix: "10.0.1.4/32",
      nextHopIpAddress: "10.0.2.4",
    }));
    const onward = must(addInternetRoute(fromSource, first.subnetId, {
      tableName: "rt-nva-2",
      routeName: "via-second",
      nextHop: "VirtualAppliance",
      addressPrefix: "10.0.1.4/32",
      nextHopIpAddress: "10.0.3.4",
    }));
    const droppedWorld = must(addInternetRoute(onward, second.subnetId, {
      tableName: "rt-nva-3",
      routeName: "drop-there",
      nextHop: "None",
      addressPrefix: "10.0.1.4/32",
    }));
    const dropped = checkSameVirtualNetwork(droppedWorld, vmId, "10.0.1.4", 80);
    assert.match(dropped.value?.summary ?? "", /Dropped\. routes\/drop-there, 10\.0\.1\.4\/32, next hop None/);
    assert.match(dropped.trace.map((line) => line.detail ?? "").join("\n"), /nic-nva-2/);

    const looped = must(addInternetRoute(onward, second.subnetId, {
      tableName: "rt-nva-loop",
      routeName: "back",
      nextHop: "VirtualAppliance",
      addressPrefix: "10.0.1.4/32",
      nextHopIpAddress: "10.0.2.4",
    }));
    const loop = checkSameVirtualNetwork(looped, vmId, "10.0.1.4", 80);
    assert.match(loop.value?.summary ?? "", /Routing loop/);

    let chained = fromSource;
    let previousSubnet = first.subnetId;
    for (let index = 3; index <= 9; index += 1) {
      const created = index === 3 ? { world: chained, subnetId: second.subnetId } : hop(chained, index);
      chained = must(addInternetRoute(created.world, previousSubnet, {
        tableName: `rt-hop-${index - 1}`,
        routeName: `to-${index}`,
        nextHop: "VirtualAppliance",
        addressPrefix: "10.0.1.4/32",
        nextHopIpAddress: `10.0.${index}.4`,
      }));
      previousSubnet = created.subnetId;
    }
    chained = must(addInternetRoute(chained, previousSubnet, {
      tableName: "rt-hop-9",
      routeName: "to-10",
      nextHop: "VirtualAppliance",
      addressPrefix: "10.0.1.4/32",
      nextHopIpAddress: "10.0.10.4",
    }));
    const limited = checkSameVirtualNetwork(chained, vmId, "10.0.1.4", 80);
    assert.match(limited.value?.summary ?? "", /Stopped after 8 appliance hops/);
    assert.equal(limited.trace.some((line) => (line.detail ?? "").includes("No network interface")), false);
  });

  it("delivers through an appliance when both peerings allow forwarded traffic", () => {
    const { world, vmId, subnetId } = linkedWorld();
    const hub = must(createResource(world, {
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
    const nvaId = Object.values(hubNic.resources).find((resource) => resource.name === "nic-hub")!.id;
    const enabled = must(setIpForwarding(hubNic, nvaId, true));
    const seaId = Object.values(world.resources).find((resource) => resource.name === "vnet-sea")!.id;
    const peered = must(peerVirtualNetworks(enabled, seaId, hubId));
    const routed = must(addInternetRoute(peered, subnetId, {
      tableName: "rt-app",
      routeName: "via-hub",
      nextHop: "VirtualAppliance",
      addressPrefix: "10.0.1.4/32",
      nextHopIpAddress: "10.2.0.4",
    }));
    const blocked = checkSameVirtualNetwork(routed, vmId, "10.0.1.4", 80);
    assert.equal(blocked.value?.allowed, false);
    assert.match(blocked.value?.summary ?? "", /Forwarded traffic is not allowed from vnet-hub to vnet-sea/);
    assert.match(blocked.trace.map((line) => line.detail ?? "").join("\n"), /both links must allow it in the sandbox/);

    const opened = must(setForwardedTraffic(routed, seaId, hubId, true));
    const delivered = checkSameVirtualNetwork(opened, vmId, "10.0.1.4", 80);
    assert.equal(delivered.value?.allowed, true, delivered.value?.summary);
    assert.match(delivered.trace.map((line) => line.detail ?? "").join("\n"), /nic-web-01 has 10\.0\.1\.4/);

    const localId = Object.values(opened.resources).find((resource) => resource.name === "vnet-hub-to-vnet-sea")!.id;
    const oneSide = must(updateResource(opened, localId, { properties: { allowForwardedTraffic: false } }));
    const closed = checkSameVirtualNetwork(oneSide, vmId, "10.0.1.4", 80);
    assert.match(closed.value?.summary ?? "", /Forwarded traffic is not allowed/);

    const nvaSubnet = must(createResource(peered, {
      armType: "Microsoft.Network/virtualNetworks/subnets",
      name: "snet-nva",
      resourceGroup: "rg-demo",
      parentName: "vnet-sea",
      location: "southeastasia",
      properties: { addressPrefix: "10.0.2.0/24" },
    }));
    const nvaSubnetId = Object.values(nvaSubnet.resources).find((resource) => resource.name === "snet-nva")!.id;
    const nvaNic = must(createResource(nvaSubnet, {
      armType: "Microsoft.Network/networkInterfaces",
      name: "nic-nva",
      resourceGroup: "rg-demo",
      location: "southeastasia",
      properties: { subnetId: nvaSubnetId, ipConfigurations: [{ name: "ipconfig1", properties: { subnet: { id: nvaSubnetId } } }] },
    }));
    const localNvaId = Object.values(nvaNic.resources).find((resource) => resource.name === "nic-nva")!.id;
    const localEnabled = must(setIpForwarding(nvaNic, localNvaId, true));
    const localAppliance = must(addInternetRoute(localEnabled, subnetId, {
      tableName: "rt-local",
      routeName: "via-local",
      nextHop: "VirtualAppliance",
      addressPrefix: "10.2.0.4/32",
      nextHopIpAddress: "10.0.2.4",
    }));
    const normal = checkSameVirtualNetwork(localAppliance, vmId, "10.2.0.4", 80);
    assert.equal(normal.value?.allowed, true, normal.value?.summary);
    const normalTrace = normal.trace.map((line) => line.detail ?? "").join("\n");
    assert.match(normalTrace, /nic-hub has 10\.2\.0\.4/);
    assert.equal(normalTrace.includes("Forwarded traffic:"), false);
  });

  it("records gateway transit on one link and does not carry traffic", () => {
    const { world, vmId } = linkedWorld();
    const hub = must(createResource(world, {
      armType: "Microsoft.Network/virtualNetworks",
      name: "vnet-hub",
      resourceGroup: "rg-demo",
      location: "eastasia",
      properties: { addressSpace: { addressPrefixes: ["10.2.0.0/16"] } },
    }));
    const hubId = Object.values(hub.resources).find((resource) => resource.name === "vnet-hub")!.id;
    const seaId = Object.values(world.resources).find((resource) => resource.name === "vnet-sea")!.id;
    const peered = must(peerVirtualNetworks(hub, seaId, hubId));
    const before = JSON.stringify(peered);
    const early = setPeeringOptions(peered, seaId, hubId, { forwarded: false, allowGatewayTransit: false, useRemoteGateways: true });
    assert.equal(early.error?.code, "RemoteGatewayTransitDisabled");
    assert.match(early.error?.next ?? "", /Allow gateway transit to Enabled/);
    assert.equal(JSON.stringify(peered), before);

    const hubTransit = must(setPeeringOptions(peered, hubId, seaId, { forwarded: true, allowGatewayTransit: true, useRemoteGateways: false }));
    const spoke = must(setPeeringOptions(hubTransit, seaId, hubId, { forwarded: true, allowGatewayTransit: false, useRemoteGateways: true }));
    const hubLink = Object.values(spoke.resources).find((resource) => resource.name === "vnet-hub-to-vnet-sea")!;
    const spokeLink = Object.values(spoke.resources).find((resource) => resource.name === "vnet-sea-to-vnet-hub")!;
    assert.equal(hubLink.properties.allowGatewayTransit, true);
    assert.equal(hubLink.properties.useRemoteGateways, false);
    assert.equal(spokeLink.properties.useRemoteGateways, true);
    assert.equal(spokeLink.properties.allowGatewayTransit, false);
    assert.equal(hubLink.properties.allowForwardedTraffic, true);
    assert.equal(spokeLink.properties.allowForwardedTraffic, true);

    const third = must(createResource(spoke, {
      armType: "Microsoft.Network/virtualNetworks",
      name: "vnet-extra",
      resourceGroup: "rg-demo",
      location: "southeastasia",
      properties: { addressSpace: { addressPrefixes: ["10.3.0.0/16"] } },
    }));
    const extraId = Object.values(third.resources).find((resource) => resource.name === "vnet-extra")!.id;
    const again = must(peerVirtualNetworks(third, seaId, extraId));
    const extraTransit = must(setPeeringOptions(again, extraId, seaId, { forwarded: false, allowGatewayTransit: true, useRemoteGateways: false }));
    const second = setPeeringOptions(extraTransit, seaId, extraId, { forwarded: false, allowGatewayTransit: false, useRemoteGateways: true });
    assert.equal(second.error?.code, "RemoteGatewayAlreadyUsed");

    const withSubnet = must(createResource(spoke, {
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
    const open = checkSameVirtualNetwork(withNic, vmId, "10.2.0.4", 80);
    assert.equal(open.value?.allowed, true, open.value?.summary);
    assert.equal((open.trace.map((line) => line.detail ?? "").join("\n")).includes("gateway"), false);
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
    assert.equal(bad.error?.code, "NameNotFound");
    const malformed = checkSameVirtualNetwork(world, vmId, "-bad", 443);
    assert.equal(malformed.error?.code, "InvalidAddress");
    assert.equal(JSON.stringify(world), before);
  });

  it("resolves a virtual machine name in this virtual network", () => {
    const { world, vmId } = linkedWorld();
    const byName = checkSameVirtualNetwork(world, vmId, "vm-web-01", 443);
    assert.equal(byName.value?.allowed, true, byName.error?.message);
    assert.match(byName.trace.map((line) => line.detail ?? "").join("\n"), /vm-web-01\.internal\.cloudapp\.net resolves to 10\.0\.1\.4/);
    const byFqdn = checkSameVirtualNetwork(world, vmId, "VM-WEB-01.internal.cloudapp.net", 443);
    assert.equal(byFqdn.value?.allowed, true, byFqdn.error?.message);

    const stopped = must(setPower(world, vmId, "deallocate"));
    const down = checkSameVirtualNetwork(stopped, vmId, "vm-web-01", 443);
    assert.equal(down.error?.code, "VmNotRunning");

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
    const hubNicId = Object.values(withNic.resources).find((resource) => resource.name === "nic-hub")!.id;
    const withVm = must(createResource(withNic, {
      armType: "Microsoft.Compute/virtualMachines",
      name: "vm-hub",
      resourceGroup: "rg-demo",
      location: "eastasia",
      properties: { nicIds: [hubNicId] },
    }));
    const seaId = Object.values(world.resources).find((resource) => resource.name === "vnet-sea")!.id;
    const peered = must(peerVirtualNetworks(withVm, seaId, hubId));
    const other = checkSameVirtualNetwork(peered, vmId, "vm-hub", 443);
    assert.equal(other.error?.code, "NameOutsideVnet");
    assert.match(other.error?.message ?? "", /can't be resolved from other virtual networks/);
    const zone = checkSameVirtualNetwork(world, vmId, "web.contoso.internal", 443);
    assert.equal(zone.error?.code, "NameNotFound");
    assert.match(zone.error?.message ?? "", /Azure-provided DNS only answers names in this virtual network/);
  });

  it("answers a private DNS record before Azure-provided DNS", () => {
    const { world, vmId } = linkedWorld();
    const seaId = Object.values(world.resources).find((resource) => resource.name === "vnet-sea")!.id;
    const before = JSON.stringify(world);
    const bad = addPrivateDnsRecord(world, seaId, { zoneName: "contoso.internal", recordName: "web", ipv4Address: "nope" });
    assert.equal(bad.error?.code, "InvalidAddress");
    assert.equal(JSON.stringify(world), before);

    const recorded = must(addPrivateDnsRecord(world, seaId, { zoneName: "contoso.internal", recordName: "web", ipv4Address: "10.0.1.4" }));
    const hit = checkSameVirtualNetwork(recorded, vmId, "Web.contoso.internal", 443);
    assert.equal(hit.value?.allowed, true, hit.error?.message);
    assert.match(hit.trace.map((line) => line.detail ?? "").join("\n"), /Private DNS zone contoso\.internal, linked to vnet-sea/);
    const missing = checkSameVirtualNetwork(recorded, vmId, "app.contoso.internal", 443);
    assert.equal(missing.error?.code, "PrivateZoneNxDomain");
    assert.equal(missing.trace.some((line) => (line.detail ?? "").includes("168.63.129.16")), false);
    const vmName = checkSameVirtualNetwork(recorded, vmId, "vm-web-01", 443);
    assert.equal(vmName.value?.allowed, true, vmName.error?.message);

    const again = addPrivateDnsRecord(recorded, seaId, { zoneName: "contoso.internal", recordName: "web", ipv4Address: "10.0.1.5" });
    assert.equal(again.error?.code, "ResourceAlreadyExists");

    const child = must(addPrivateDnsRecord(recorded, seaId, { zoneName: "web.contoso.internal", recordName: "other", ipv4Address: "10.0.1.4" }));
    const longer = checkSameVirtualNetwork(child, vmId, "other.web.contoso.internal", 443);
    assert.equal(longer.value?.allowed, true, longer.error?.message);
    const covered = checkSameVirtualNetwork(child, vmId, "web.contoso.internal", 443);
    assert.equal(covered.error?.code, "PrivateZoneNxDomain");
    assert.match(covered.error?.message ?? "", /web\.contoso\.internal/);

    const hub = must(createResource(world, {
      armType: "Microsoft.Network/virtualNetworks",
      name: "vnet-hub",
      resourceGroup: "rg-demo",
      location: "eastasia",
      properties: { addressSpace: { addressPrefixes: ["10.2.0.0/16"] } },
    }));
    const hubId = Object.values(hub.resources).find((resource) => resource.name === "vnet-hub")!.id;
    const elsewhere = must(addPrivateDnsRecord(hub, hubId, { zoneName: "contoso.internal", recordName: "web", ipv4Address: "10.0.1.4" }));
    const hidden = checkSameVirtualNetwork(elsewhere, vmId, "web.contoso.internal", 443);
    assert.equal(hidden.error?.code, "NameNotFound");
  });

  it("registers a running virtual machine and removes the record when it stops", () => {
    const { world, vmId } = linkedWorld();
    const seaId = Object.values(world.resources).find((resource) => resource.name === "vnet-sea")!.id;
    const taken = must(addPrivateDnsRecord(world, seaId, { zoneName: "contoso.internal", recordName: "vm-web-01", ipv4Address: "10.0.1.4" }));
    const before = JSON.stringify(taken);
    const refused = setPrivateDnsRegistration(taken, seaId, { zoneName: "contoso.internal", enabled: true });
    assert.equal(refused.error?.code, "RecordNameTaken");
    assert.equal(JSON.stringify(taken), before);

    const registered = must(setPrivateDnsRegistration(world, seaId, { zoneName: "contoso.internal", enabled: true }));
    const hit = checkSameVirtualNetwork(registered, vmId, "vm-web-01.contoso.internal", 443);
    assert.equal(hit.value?.allowed, true, hit.error?.message);
    assert.match(hit.trace.map((line) => line.detail ?? "").join("\n"), /Private DNS zone contoso\.internal/);
    const manual = must(addPrivateDnsRecord(registered, seaId, { zoneName: "contoso.internal", recordName: "web", ipv4Address: "10.0.1.4" }));
    const web = checkSameVirtualNetwork(manual, vmId, "web.contoso.internal", 443);
    assert.equal(web.value?.allowed, true, web.error?.message);

    const snapshot = JSON.stringify(manual);
    const second = setPrivateDnsRegistration(manual, seaId, { zoneName: "fabrikam.internal", enabled: true });
    assert.equal(second.error?.code, "RegistrationZoneExists");
    assert.equal(JSON.stringify(manual), snapshot);

    const stopped = must(setPower(manual, vmId, "stop"));
    const down = checkSameVirtualNetwork(stopped, vmId, "vm-web-01.contoso.internal", 443);
    assert.equal(down.error?.code, "PrivateZoneNxDomain");
    const started = must(setPower(stopped, vmId, "start"));
    const back = checkSameVirtualNetwork(started, vmId, "vm-web-01.contoso.internal", 443);
    assert.equal(back.value?.allowed, true, back.error?.message);

    const off = must(setPrivateDnsRegistration(started, seaId, { zoneName: "contoso.internal", enabled: false }));
    const removed = checkSameVirtualNetwork(off, vmId, "vm-web-01.contoso.internal", 443);
    assert.equal(removed.error?.code, "PrivateZoneNxDomain");
    const kept = checkSameVirtualNetwork(off, vmId, "web.contoso.internal", 443);
    assert.equal(kept.value?.allowed, true, kept.error?.message);

    const again = must(setPrivateDnsRegistration(off, seaId, { zoneName: "contoso.internal", enabled: true }));
    const deleted = must(deleteResource(again, vmId));
    const leftover = Object.values(deleted.resources).find((resource) => resource.name === "vm-web-01" && resource.type.toLowerCase().endsWith("/a"));
    assert.equal(leftover, undefined);

    const empty = must(createResource(world, {
      armType: "Microsoft.Network/virtualNetworks",
      name: "vnet-empty",
      resourceGroup: "rg-demo",
      location: "southeastasia",
      properties: { addressSpace: { addressPrefixes: ["10.8.0.0/16"] } },
    }));
    const emptyId = Object.values(empty.resources).find((resource) => resource.name === "vnet-empty")!.id;
    const linked = must(setPrivateDnsRegistration(empty, emptyId, { zoneName: "empty.internal", enabled: true }));
    const gone = must(deleteResource(linked, emptyId));
    const linkLeft = Object.values(gone.resources).some((resource) => resource.type.toLowerCase().endsWith("/virtualnetworklinks") && resource.name === "link-vnet-empty");
    assert.equal(linkLeft, false);
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
