import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SUBSCRIPTION_ID, USER_ID } from "./constants";
import {
  assignPolicy,
  assignRole,
  createResource,
  createResourceGroup,
  createUser,
  deletePolicyAssignment,
  setActingPrincipal,
  starterWorld,
} from "./index";
import { findBuiltInRole } from "./rbac/dataset";

const ALLOWED_LOCATIONS = "/providers/Microsoft.Authorization/policyDefinitions/e56962a6-4747-49cd-b67b-bf8b01975c4c";
const NOT_ALLOWED_TYPES = "/providers/Microsoft.Authorization/policyDefinitions/6c112d4e-5bc7-47ae-a041-ea2d9dccd749";
const REQUIRE_TAG_VALUE = "/providers/Microsoft.Authorization/policyDefinitions/1e30110a-5ceb-460c-a204-c1c3969c6d62";

function worldWithGroup() {
  const created = createResourceGroup(starterWorld(), { name: "rg-demo", location: "southeastasia" });
  assert.equal(created.ok, true, created.error?.message);
  return created.value!;
}

function vm(world: ReturnType<typeof worldWithGroup>, location: string, name = "vm-web-01") {
  return createResource(world, {
    armType: "Microsoft.Compute/virtualMachines",
    name,
    resourceGroup: "rg-demo",
    location,
    properties: { osType: "Linux" },
    osType: "Linux",
  });
}

describe("policy", () => {
  it("denies a location outside the allowed list and lets an allowed location through", () => {
    let world = worldWithGroup();
    const assigned = assignPolicy(world, {
      name: "allowed-locations",
      scope: `/subscriptions/${SUBSCRIPTION_ID}`,
      policyDefinitionId: ALLOWED_LOCATIONS,
      parameters: { listOfAllowedLocations: ["southeastasia"] },
    });
    assert.equal(assigned.ok, true, assigned.error?.message);
    world = assigned.value!;
    const denied = vm(world, "eastasia");
    assert.equal(denied.ok, false);
    assert.equal(denied.error?.code, "RequestDisallowedByPolicy");
    assert.equal(denied.error?.step, "policy");
    assert.match(denied.error?.message ?? "", /was disallowed by policy/);
    const allowed = vm(world, "southeastasia");
    assert.equal(allowed.ok, true, allowed.error?.message);
  });

  it("audits a non-compliant resource and still creates it", () => {
    let world = worldWithGroup();
    world = assignPolicy(world, {
      name: "audit-locations",
      scope: `/subscriptions/${SUBSCRIPTION_ID}`,
      policyDefinitionId: ALLOWED_LOCATIONS,
      parameters: { listOfAllowedLocations: ["southeastasia"], effect: "Audit" },
    }).value!;
    const created = vm(world, "eastasia");
    assert.equal(created.ok, true, created.error?.message);
    const states = Object.values(created.value!.policyStates);
    assert.equal(states.length, 1);
    assert.equal(states[0].complianceState, "NonCompliant");
    assert.equal(states[0].effect, "audit");
  });

  it("does not enforce a deny assignment when enforcement is DoNotEnforce", () => {
    let world = worldWithGroup();
    world = assignPolicy(world, {
      name: "locations-off",
      scope: `/subscriptions/${SUBSCRIPTION_ID}`,
      policyDefinitionId: ALLOWED_LOCATIONS,
      parameters: { listOfAllowedLocations: ["southeastasia"] },
      enforcementMode: "DoNotEnforce",
    }).value!;
    const created = vm(world, "eastasia");
    assert.equal(created.ok, true, created.error?.message);
    assert.equal(Object.values(created.value!.policyStates)[0].effect, "deny");
  });

  it("marks an existing resource when the assignment is created and does not delete it", () => {
    let world = worldWithGroup();
    world = vm(world, "eastasia").value!;
    const assigned = assignPolicy(world, {
      name: "allowed-locations",
      scope: `/subscriptions/${SUBSCRIPTION_ID}`,
      policyDefinitionId: ALLOWED_LOCATIONS,
      parameters: { listOfAllowedLocations: ["southeastasia"] },
    });
    assert.equal(assigned.ok, true, assigned.error?.message);
    assert.equal(Object.keys(assigned.value!.resources).length, 1);
    assert.equal(Object.values(assigned.value!.policyStates)[0].effect, "deny");
  });

  it("skips indexed policies for resource groups and resources in notScopes", () => {
    let world = worldWithGroup();
    const groupId = Object.values(world.resourceGroups)[0].id;
    world = assignPolicy(world, {
      name: "allowed-locations",
      scope: `/subscriptions/${SUBSCRIPTION_ID}`,
      policyDefinitionId: ALLOWED_LOCATIONS,
      parameters: { listOfAllowedLocations: ["southeastasia"] },
      notScopes: [groupId],
    }).value!;
    const group = createResourceGroup(world, { name: "rg-east", location: "eastasia" });
    assert.equal(group.ok, true, group.error?.message);
    const skipped = vm(world, "eastasia");
    assert.equal(skipped.ok, true, skipped.error?.message);
  });

  it("denies a resource group when a mode All policy lists its type", () => {
    const world = assignPolicy(worldWithGroup(), {
      name: "no-groups",
      scope: `/subscriptions/${SUBSCRIPTION_ID}`,
      policyDefinitionId: NOT_ALLOWED_TYPES,
      parameters: { listOfResourceTypesNotAllowed: ["Microsoft.Resources/subscriptions/resourceGroups"] },
    }).value!;
    const denied = createResourceGroup(world, { name: "rg-other", location: "southeastasia" });
    assert.equal(denied.ok, false);
    assert.equal(denied.error?.code, "RequestDisallowedByPolicy");
  });

  it("requires a tag and its value, and ignores resource groups", () => {
    let world = worldWithGroup();
    world = assignPolicy(world, {
      name: "env-tag",
      scope: `/subscriptions/${SUBSCRIPTION_ID}`,
      policyDefinitionId: REQUIRE_TAG_VALUE,
      parameters: { tagName: "environment", tagValue: "Production" },
    }).value!;
    const missing = createResource(world, {
      armType: "Microsoft.Storage/storageAccounts",
      name: "stpolarisdemo001",
      resourceGroup: "rg-demo",
    });
    assert.equal(missing.error?.code, "RequestDisallowedByPolicy");
    const wrongCase = createResource(world, {
      armType: "Microsoft.Storage/storageAccounts",
      name: "stpolarisdemo002",
      resourceGroup: "rg-demo",
      tags: { environment: "production" },
    });
    assert.equal(wrongCase.ok, false);
    const tagged = createResource(world, {
      armType: "Microsoft.Storage/storageAccounts",
      name: "stpolarisdemo003",
      resourceGroup: "rg-demo",
      tags: { Environment: "Production" },
    });
    assert.equal(tagged.ok, true, tagged.error?.message);
  });

  it("refuses a policy assignment from a contributor", () => {
    let world = worldWithGroup();
    const contributor = findBuiltInRole("Contributor");
    assert.ok(contributor);
    world = createUser(world, {
      id: "00000000-0000-0000-0000-000000000020",
      displayName: "Contributor user",
      userPrincipalName: "contributor@contoso.onmicrosoft.com",
    }).value!;
    world = assignRole(world, {
      name: "00000000-0000-0000-0000-000000000021",
      principalId: "00000000-0000-0000-0000-000000000020",
      roleDefinitionId: contributor!.id,
      scope: `/subscriptions/${SUBSCRIPTION_ID}`,
    }).value!;
    world = setActingPrincipal(world, "00000000-0000-0000-0000-000000000020").value!;
    const denied = assignPolicy(world, {
      name: "allowed-locations",
      scope: `/subscriptions/${SUBSCRIPTION_ID}`,
      policyDefinitionId: ALLOWED_LOCATIONS,
      parameters: { listOfAllowedLocations: ["southeastasia"] },
    });
    assert.equal(denied.error?.code, "AuthorizationFailed");
    assert.equal(world.session.actingPrincipalId === USER_ID, false);
  });

  it("clears compliance when the assignment is deleted", () => {
    let world = worldWithGroup();
    world = vm(world, "eastasia").value!;
    world = assignPolicy(world, {
      name: "allowed-locations",
      scope: `/subscriptions/${SUBSCRIPTION_ID}`,
      policyDefinitionId: ALLOWED_LOCATIONS,
      parameters: { listOfAllowedLocations: ["southeastasia"] },
    }).value!;
    assert.equal(Object.keys(world.policyStates).length, 1);
    const removed = deletePolicyAssignment(world, "allowed-locations", `/subscriptions/${SUBSCRIPTION_ID}`);
    assert.equal(removed.ok, true, removed.error?.message);
    assert.equal(Object.keys(removed.value!.policyStates).length, 0);
    assert.equal(Object.keys(removed.value!.resources).length, 1);
  });
});

describe("tags", () => {
  it("rejects a tag name that contains a slash and a storage name over 128 characters", () => {
    const world = worldWithGroup();
    const slash = createResource(world, {
      armType: "Microsoft.Compute/virtualMachines",
      name: "vm-web-01",
      resourceGroup: "rg-demo",
      tags: { "cost/center": "apps" },
      properties: { osType: "Linux" },
      osType: "Linux",
    });
    assert.equal(slash.error?.code, "InvalidTagName");
    const longKey = "k".repeat(129);
    const storage = createResource(world, {
      armType: "Microsoft.Storage/storageAccounts",
      name: "stpolarisdemo001",
      resourceGroup: "rg-demo",
      tags: { [longKey]: "prod" },
    });
    assert.equal(storage.error?.code, "TagTooLong");
  });
});
