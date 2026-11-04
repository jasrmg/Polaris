import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resources } from "../../content";
import { LEARN } from "./learn";
import { parseId, resourceId } from "./ids";
import { validateName } from "./names";
import {
  addInboundRule,
  advance,
  attachNetworkInterface,
  attachPublicIp,
  createManagementGroup,
  createResource,
  createResourceGroup,
  deleteManagementGroup,
  deleteResource,
  deleteResourceGroup,
  powerIsBilled,
  powerLabel,
  putLock,
  registerProvider,
  setPower,
  setSubscriptionState,
  assignRole,
  elevateAccess,
  starterWorld,
  updateResourceGroup,
} from "./index";
import { OWNER_ROLE_DEFINITION_ID, SUBSCRIPTION_ID, TENANT_ID, USER_ID } from "./constants";
import type { World } from "./types";

function withRootOwner(world: World): World {
  const elevated = elevateAccess(world, "00000000-0000-0000-0000-000000000010");
  assert.equal(elevated.ok, true, elevated.error?.message);
  const assigned = assignRole(elevated.value!, {
    name: "00000000-0000-0000-0000-000000000011",
    principalId: USER_ID,
    roleDefinitionId: OWNER_ROLE_DEFINITION_ID,
    scope: "/",
  });
  assert.equal(assigned.ok, true, assigned.error?.message);
  return assigned.value!;
}

// Learn: https://learn.microsoft.com/en-us/azure/governance/management-groups/overview
describe("hierarchy", () => {
  it("starts with one tenant, the root group, and user You", () => {
    const world = starterWorld();
    assert.equal(world.tenant.id, TENANT_ID);
    assert.equal(world.tenant.initialDomain, "contoso.onmicrosoft.com");
    const root = Object.values(world.managementGroups)[0];
    assert.equal(root.displayName, "Tenant root group");
    assert.equal(root.name, TENANT_ID);
    assert.equal(root.parentId, null);
    assert.deepEqual(world.directory.users[world.session.actingPrincipalId].directoryRoles, ["Global Administrator"]);
    const deleted = deleteManagementGroup(withRootOwner(world), root.id);
    assert.equal(deleted.ok, false);
    assert.equal(deleted.error?.learnUrl, LEARN.managementGroups);
  });

  it("stops at six levels below the root", () => {
    let world = withRootOwner(starterWorld());
    let parent = Object.values(world.managementGroups)[0].id;
    for (let level = 1; level <= 6; level += 1) {
      const created = createManagementGroup(world, { name: `group-${level}`, displayName: `Group ${level}`, parentId: parent });
      assert.equal(created.ok, true, created.error?.message);
      world = created.value!;
      parent = Object.values(world.managementGroups).find((group) => group.name === `group-${level}`)!.id;
    }
    const seventh = createManagementGroup(world, { name: "group-7", displayName: "Too deep", parentId: parent });
    assert.equal(seventh.ok, false);
    assert.equal(seventh.error?.code, "ManagementGroupDepth");
  });
});

// Learn: https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/resource-name-rules
describe("names and ids", () => {
  it("round-trips a child resource id", () => {
    const id = resourceId(SUBSCRIPTION_ID, "rg-demo", "Microsoft.Network/virtualNetworks/subnets", ["vnet-sea", "snet-app"]);
    const parsed = parseId(id);
    assert.equal(parsed?.name, "snet-app");
    assert.equal(parsed?.armType?.toLowerCase(), "microsoft.network/virtualnetworks/subnets");
    assert.equal(parseId(id.toLowerCase())?.resourceGroup?.toLowerCase(), "rg-demo");
  });

  it("uses the storage account error text", () => {
    const error = validateName("Microsoft.Storage/storageAccounts", "NO");
    assert.equal(error?.code, "AccountNameInvalid");
    assert.ok(error?.message.includes("lower-case letters only"));
  });

  it("covers every catalog simulator type", () => {
    for (const resource of resources) {
      if (!resource.simulator) continue;
      const error = validateName(resource.simulator.armType, "a");
      assert.notEqual(error?.code, "InvalidResourceType", resource.slug);
    }
  });
});

// Learn: https://learn.microsoft.com/en-us/azure/virtual-network/virtual-network-manage-subnet
describe("networks", () => {
  function withGroup() {
    const created = createResourceGroup(starterWorld(), { name: "rg-demo", location: "southeastasia" });
    assert.equal(created.ok, true);
    return created.value!;
  }

  it("rejects a subnet that does not fit, then blocks deleting a subnet that has a NIC", () => {
    let world = withGroup();
    const vnet = createResource(world, {
      armType: "Microsoft.Network/virtualNetworks",
      name: "vnet-sea",
      resourceGroup: "rg-demo",
      properties: { addressSpace: { addressPrefixes: ["10.0.0.0/16"] } },
    });
    assert.equal(vnet.ok, true, vnet.error?.message);
    world = vnet.value!;
    const tiny = createResource(world, {
      armType: "Microsoft.Network/virtualNetworks/subnets",
      name: "snet-tiny",
      resourceGroup: "rg-demo",
      parentName: "vnet-sea",
      properties: { addressPrefix: "10.0.0.0/30" },
    });
    assert.equal(tiny.ok, false);
    const subnet = createResource(world, {
      armType: "Microsoft.Network/virtualNetworks/subnets",
      name: "snet-app",
      resourceGroup: "rg-demo",
      parentName: "vnet-sea",
      properties: { addressPrefix: "10.0.1.0/24" },
    });
    assert.equal(subnet.ok, true, subnet.error?.message);
    world = subnet.value!;
    const subnetId = Object.values(world.resources).find((resource) => resource.name === "snet-app")!.id;
    const nic = createResource(world, {
      armType: "Microsoft.Network/networkInterfaces",
      name: "nic-app",
      resourceGroup: "rg-demo",
      properties: { subnetId },
    });
    assert.equal(nic.ok, true, nic.error?.message);
    world = nic.value!;
    const removed = deleteResource(world, subnetId);
    assert.equal(removed.ok, false);
    assert.ok(removed.error?.message.includes("no resources in the subnet"));
  });

  it("attaches a NIC and a public IP, records one inbound rule, and blocks those deletes", () => {
    let world = withGroup();
    const vnet = createResource(world, {
      armType: "Microsoft.Network/virtualNetworks",
      name: "vnet-sea",
      resourceGroup: "rg-demo",
      location: "southeastasia",
      properties: { addressSpace: { addressPrefixes: ["10.0.0.0/16"] } },
    });
    assert.equal(vnet.ok, true, vnet.error?.message);
    world = vnet.value!;
    const subnet = createResource(world, {
      armType: "Microsoft.Network/virtualNetworks/subnets",
      name: "snet-app",
      resourceGroup: "rg-demo",
      parentName: "vnet-sea",
      location: "southeastasia",
      properties: { addressPrefix: "10.0.1.0/24" },
    });
    assert.equal(subnet.ok, true, subnet.error?.message);
    world = subnet.value!;
    const subnetId = Object.values(world.resources).find((resource) => resource.name === "snet-app")!.id;
    const nested = createResource(world, {
      armType: "Microsoft.Network/networkInterfaces",
      name: "nic-nested",
      resourceGroup: "rg-demo",
      location: "southeastasia",
      properties: {
        ipConfigurations: [{ name: "ipconfig1", properties: { subnet: { id: subnetId } } }],
      },
    });
    assert.equal(nested.ok, true, nested.error?.message);
    world = nested.value!;
    const nestedDelete = deleteResource(world, subnetId);
    assert.equal(nestedDelete.ok, false);
    assert.ok(nestedDelete.error?.message.includes("no resources in the subnet"));
    world = deleteResource(world, Object.values(world.resources).find((resource) => resource.name === "nic-nested")!.id).value!;

    const nic = createResource(world, {
      armType: "Microsoft.Network/networkInterfaces",
      name: "nic-web-01",
      resourceGroup: "rg-demo",
      location: "southeastasia",
      properties: { subnetId },
    });
    assert.equal(nic.ok, true, nic.error?.message);
    world = nic.value!;
    const nicId = Object.values(world.resources).find((resource) => resource.name === "nic-web-01")!.id;
    const vm = createResource(world, {
      armType: "Microsoft.Compute/virtualMachines",
      name: "vm-web-01",
      resourceGroup: "rg-demo",
      location: "southeastasia",
      osType: "Linux",
      properties: { osType: "Linux" },
    });
    assert.equal(vm.ok, true, vm.error?.message);
    world = vm.value!;
    const vmId = Object.values(world.resources).find((resource) => resource.name === "vm-web-01")!.id;
    const elsewhere = createResource(world, {
      armType: "Microsoft.Network/networkInterfaces",
      name: "nic-east",
      resourceGroup: "rg-demo",
      location: "eastasia",
    });
    assert.equal(elsewhere.ok, true, elsewhere.error?.message);
    world = elsewhere.value!;
    const eastNic = Object.values(world.resources).find((resource) => resource.name === "nic-east")!.id;
    const wrongRegion = attachNetworkInterface(world, vmId, eastNic);
    assert.equal(wrongRegion.ok, false);
    assert.equal(wrongRegion.error?.code, "NicRegionMismatch");
    const attached = attachNetworkInterface(world, vmId, nicId);
    assert.equal(attached.ok, true, attached.error?.message);
    world = attached.value!;
    const nicDelete = deleteResource(world, nicId);
    assert.equal(nicDelete.ok, false);
    assert.ok(nicDelete.error?.message.includes("isn't attached to a VM"));

    const pip = createResource(world, {
      armType: "Microsoft.Network/publicIPAddresses",
      name: "pip-web-01",
      resourceGroup: "rg-demo",
      location: "southeastasia",
      sku: { name: "Standard" },
      properties: { publicIPAllocationMethod: "Static", publicIPAddressVersion: "IPv4" },
    });
    assert.equal(pip.ok, true, pip.error?.message);
    world = pip.value!;
    const pipId = Object.values(world.resources).find((resource) => resource.name === "pip-web-01")!.id;
    const linked = attachPublicIp(world, nicId, pipId);
    assert.equal(linked.ok, true, linked.error?.message);
    world = linked.value!;
    const pipDelete = deleteResource(world, pipId);
    assert.equal(pipDelete.ok, false);
    assert.ok(pipDelete.error?.message.includes("isn't associated"));

    const nsg = createResource(world, {
      armType: "Microsoft.Network/networkSecurityGroups",
      name: "nsg-web",
      resourceGroup: "rg-demo",
      location: "southeastasia",
    });
    assert.equal(nsg.ok, true, nsg.error?.message);
    world = nsg.value!;
    const nsgId = Object.values(world.resources).find((resource) => resource.name === "nsg-web")!.id;
    const low = addInboundRule(world, subnetId, nsgId, { port: 443, access: "Allow", priority: 50 });
    assert.equal(low.ok, false);
    assert.equal(low.error?.code, "InvalidPriority");
    const rule = addInboundRule(world, subnetId, nsgId, { port: 443, access: "Allow", priority: 100 });
    assert.equal(rule.ok, true, rule.error?.message);
    world = rule.value!;
    const again = addInboundRule(world, subnetId, nsgId, { port: 80, access: "Deny", priority: 100 });
    assert.equal(again.ok, false);
    assert.equal(again.error?.code, "DuplicateRulePriority");
    const nsgDelete = deleteResource(world, nsgId);
    assert.equal(nsgDelete.ok, false);
    assert.ok(nsgDelete.error?.message.includes("can't delete it"));
    const stored = world.resources[Object.keys(world.resources).find((id) => world.resources[id].name === "nsg-web")!];
    const rules = stored.properties.securityRules as { properties: { protocol: string; destinationPortRange: string } }[];
    assert.equal(rules[0].properties.protocol, "Tcp");
    assert.equal(rules[0].properties.destinationPortRange, "443");
  });

  it("marks the remote peering Disconnected when one link is deleted", () => {
    let world = withGroup();
    for (const name of ["vnet-a", "vnet-b"]) {
      const created = createResource(world, {
        armType: "Microsoft.Network/virtualNetworks",
        name,
        resourceGroup: "rg-demo",
        properties: { addressSpace: { addressPrefixes: [name === "vnet-a" ? "10.0.0.0/16" : "10.1.0.0/16"] } },
      });
      assert.equal(created.ok, true, created.error?.message);
      world = created.value!;
    }
    const a = Object.values(world.resources).find((resource) => resource.name === "vnet-a")!.id;
    const b = Object.values(world.resources).find((resource) => resource.name === "vnet-b")!.id;
    const left = createResource(world, {
      armType: "Microsoft.Network/virtualNetworks/virtualNetworkPeerings",
      name: "a-to-b",
      resourceGroup: "rg-demo",
      parentName: "vnet-a",
      properties: { remoteVirtualNetworkId: b },
    });
    assert.equal(left.ok, true, left.error?.message);
    world = left.value!;
    const right = createResource(world, {
      armType: "Microsoft.Network/virtualNetworks/virtualNetworkPeerings",
      name: "b-to-a",
      resourceGroup: "rg-demo",
      parentName: "vnet-b",
      properties: { remoteVirtualNetworkId: a },
    });
    assert.equal(right.ok, true, right.error?.message);
    world = right.value!;
    const leftId = Object.values(world.resources).find((resource) => resource.name === "a-to-b")!.id;
    const deleted = deleteResource(world, leftId);
    assert.equal(deleted.ok, true);
    const remote = Object.values(deleted.value!.resources).find((resource) => resource.name === "b-to-a");
    assert.equal(remote?.properties.peeringState, "Disconnected");
  });
});

// Learn: https://learn.microsoft.com/en-us/azure/virtual-machines/states-billing
describe("virtual machine power", () => {
  it("bills a stopped VM and does not bill a deallocated one", () => {
    let world = createResourceGroup(starterWorld(), { name: "rg-demo", location: "southeastasia" }).value!;
    const created = createResource(world, {
      armType: "Microsoft.Compute/virtualMachines",
      name: "vm-web-01",
      resourceGroup: "rg-demo",
      properties: { osType: "Linux" },
      osType: "Linux",
    });
    assert.equal(created.ok, true, created.error?.message);
    world = created.value!;
    const id = Object.values(world.resources).find((resource) => resource.name === "vm-web-01")!.id;
    assert.equal(world.resources[id.toLowerCase()].properties.powerState, "Running");
    const stopped = setPower(world, id, "stop");
    assert.equal(stopped.ok, true);
    assert.equal(stopped.value!.resources[id.toLowerCase()].properties.powerState, "Stopped");
    assert.equal(powerIsBilled("Stopped"), true);
    assert.equal(powerLabel("Stopped"), "Stopped (Allocated)");
    const deallocated = setPower(stopped.value!, id, "deallocate");
    assert.equal(deallocated.value!.resources[id.toLowerCase()].properties.powerState, "Deallocated");
    assert.equal(powerIsBilled("Deallocated"), false);
    assert.equal(powerLabel("Deallocated"), "Stopped (Deallocated)");
  });
});

// Learn: https://learn.microsoft.com/en-us/azure/cost-management-billing/manage/subscription-states
describe("subscription state", () => {
  it("blocks creates while warned and deallocates VMs when disabled", () => {
    let world = createResourceGroup(starterWorld(), { name: "rg-demo", location: "southeastasia" }).value!;
    const vm = createResource(world, {
      armType: "Microsoft.Compute/virtualMachines",
      name: "vm-web-01",
      resourceGroup: "rg-demo",
    });
    world = vm.value!;
    const warned = setSubscriptionState(world, SUBSCRIPTION_ID, "Warned");
    assert.equal(warned.ok, true);
    const blocked = createResourceGroup(warned.value!, { name: "rg-other", location: "eastasia" });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.error?.step, "subscription state");
    const disabled = setSubscriptionState(warned.value!, SUBSCRIPTION_ID, "Disabled");
    const machine = Object.values(disabled.value!.resources)[0];
    assert.equal(machine.properties.powerState, "Deallocated");
  });
});

// Learn: https://learn.microsoft.com/en-us/azure/azure-resource-manager/troubleshooting/error-register-resource-provider
describe("providers", () => {
  it("does not auto-register Microsoft.App", () => {
    const world = createResourceGroup(starterWorld(), { name: "rg-demo", location: "southeastasia" }).value!;
    const denied = createResource(world, {
      armType: "Microsoft.App/containerApps",
      name: "ca-web",
      resourceGroup: "rg-demo",
    });
    assert.equal(denied.error?.code, "MissingSubscriptionRegistration");
    const registered = registerProvider(world, "Microsoft.App");
    const allowed = createResource(registered.value!, {
      armType: "Microsoft.App/containerApps",
      name: "ca-web",
      resourceGroup: "rg-demo",
    });
    assert.equal(allowed.ok, true, allowed.error?.message);
  });
});

// Learn: https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/lock-resources
describe("locks and resource groups", () => {
  it("keeps a resource group location and refuses a locked delete", () => {
    let world = createResourceGroup(starterWorld(), { name: "rg-demo", location: "southeastasia" }).value!;
    const group = Object.values(world.resourceGroups)[0];
    const moved = updateResourceGroup(world, group.id, { location: "eastasia" });
    assert.equal(moved.ok, false);
    const duplicate = createResourceGroup(world, { name: "RG-DEMO", location: "eastasia" });
    assert.equal(duplicate.ok, false);
    const locked = putLock(world, { name: "no-delete", scope: group.id, level: "CanNotDelete" });
    world = locked.value!;
    const removed = deleteResourceGroup(world, group.id);
    assert.equal(removed.ok, false);
    assert.equal(removed.error?.step, "locks");
  });

  it("does not delete a group that still has a VM outside using its subnet", () => {
    let world = createResourceGroup(starterWorld(), { name: "rg-net", location: "southeastasia" }).value!;
    world = createResourceGroup(world, { name: "rg-app", location: "southeastasia" }).value!;
    world = createResource(world, {
      armType: "Microsoft.Network/virtualNetworks",
      name: "vnet-sea",
      resourceGroup: "rg-net",
      properties: { addressSpace: { addressPrefixes: ["10.0.0.0/16"] } },
    }).value!;
    world = createResource(world, {
      armType: "Microsoft.Network/virtualNetworks/subnets",
      name: "snet-app",
      resourceGroup: "rg-net",
      parentName: "vnet-sea",
      properties: { addressPrefix: "10.0.0.0/24" },
    }).value!;
    const subnetId = Object.values(world.resources).find((resource) => resource.name === "snet-app")!.id;
    world = createResource(world, {
      armType: "Microsoft.Network/networkInterfaces",
      name: "nic-app",
      resourceGroup: "rg-app",
      properties: { subnetId },
    }).value!;
    const group = Object.values(world.resourceGroups).find((item) => item.name === "rg-net")!;
    const removed = deleteResourceGroup(world, group.id);
    assert.equal(removed.ok, false);
    assert.equal(removed.error?.learnUrl, LEARN.deleteGroup);
  });
});

// Learn: https://learn.microsoft.com/en-us/rest/api/storagerp/storage-accounts/get-properties
describe("provisioning delay", () => {
  it("walks a storage account through ResolvingDNS", () => {
    const world = createResourceGroup(starterWorld(), { name: "rg-demo", location: "southeastasia" }).value!;
    const created = createResource(world, {
      armType: "Microsoft.Storage/storageAccounts",
      name: "stpolarisdemo001",
      resourceGroup: "rg-demo",
    }, { delayMs: 1000 });
    assert.equal(created.ok, true, created.error?.message);
    const id = Object.values(created.value!.resources)[0].id.toLowerCase();
    assert.equal(created.value!.resources[id].properties.provisioningState, "Creating");
    const resolving = advance(created.value!, 1000);
    assert.equal(resolving.resources[id].properties.provisioningState, "ResolvingDNS");
    const done = advance(resolving, 1000);
    assert.equal(done.resources[id].properties.provisioningState, "Succeeded");
  });
});
