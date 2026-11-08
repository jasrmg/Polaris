import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addInboundRule,
  addSecurityRule,
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
