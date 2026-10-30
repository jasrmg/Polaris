import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { OWNER_ROLE_DEFINITION_ID, SUBSCRIPTION_ID, USER_ID } from "./constants";
import { resourceId, subscriptionId } from "./ids";
import {
  addGroupMember,
  assignRole,
  createCustomRole,
  createGroup,
  createResourceGroup,
  createUser,
  deleteCustomRole,
  elevateAccess,
  evaluateAccess,
  findBuiltInRole,
  setActingPrincipal,
  starterWorld,
} from "./index";
import type { DenyAssignment, World } from "./types";

const SUB = subscriptionId(SUBSCRIPTION_ID);
const READER = "00000000-0000-0000-0000-000000000021";
const GROUP_INNER = "00000000-0000-0000-0000-000000000022";
const GROUP_OUTER = "00000000-0000-0000-0000-000000000023";

function roleId(name: string): string {
  const role = findBuiltInRole(name);
  assert.ok(role, name);
  return role.id;
}

function must<T>(result: { ok: boolean; value?: T; error?: { message?: string } }): T {
  assert.equal(result.ok, true, result.error?.message);
  return result.value as T;
}

// Learn: role-definitions, custom-roles, overview, elevate-access-global-admin
describe("rbac evaluation", () => {
  it("lets Reader read and stops Reader from writing", () => {
    let world = starterWorld();
    world = must(createUser(world, { id: READER, displayName: "Ada", userPrincipalName: "ada@contoso.onmicrosoft.com" }));
    world = must(assignRole(world, { name: "00000000-0000-0000-0000-000000000031", principalId: READER, roleDefinitionId: roleId("Reader"), scope: SUB }));
    world = must(setActingPrincipal(world, READER));
    const read = evaluateAccess(world, { principalId: READER, action: "Microsoft.Compute/virtualMachines/read", plane: "control", scope: SUB });
    assert.equal(read.decision, "allowed");
    assert.equal(read.reasons.some((reason) => reason.kind === "granted-by" && reason.matchedPattern === "*/read"), true);
    const write = evaluateAccess(world, { principalId: READER, action: "Microsoft.Compute/virtualMachines/write", plane: "control", scope: SUB });
    assert.equal(write.decision, "denied");
    const created = createResourceGroup(world, { name: "rg-ada", location: "southeastasia" });
    assert.equal(created.ok, false);
    assert.equal(created.error?.code, "AuthorizationFailed");
    assert.match(created.error?.message ?? "", /does not have authorization to perform action/);
  });

  it("keeps notActions inside one role, then unions roles", () => {
    let world = starterWorld();
    world = must(createUser(world, { id: READER, displayName: "Ada", userPrincipalName: "ada@contoso.onmicrosoft.com" }));
    world = must(assignRole(world, { name: "00000000-0000-0000-0000-000000000032", principalId: READER, roleDefinitionId: roleId("Contributor"), scope: SUB }));
    const denied = evaluateAccess(world, { principalId: READER, action: "Microsoft.Authorization/roleAssignments/write", plane: "control", scope: SUB });
    assert.equal(denied.decision, "denied");
    assert.equal(denied.hints.some((hint) => hint.includes("cannot assign roles")), true);
    world = must(setActingPrincipal(world, READER));
    const assignment = assignRole(world, { name: "00000000-0000-0000-0000-000000000033", principalId: USER_ID, roleDefinitionId: roleId("Reader"), scope: SUB });
    assert.equal(assignment.ok, false);
    assert.match(assignment.error?.message ?? "", /roleAssignments\/write/);
    assert.match(assignment.error?.message ?? "", /refresh your credentials/);

    world = must(setActingPrincipal(world, USER_ID));
    world = must(createCustomRole(world, {
      name: "88888888-8888-8888-8888-888888888888",
      roleName: "Virtual Machine Operator",
      description: "Can monitor and restart virtual machines.",
      assignableScopes: [SUB],
      permissions: [{
        actions: [
          "Microsoft.Storage/*/read",
          "Microsoft.Network/*/read",
          "Microsoft.Compute/*/read",
          "Microsoft.Compute/virtualMachines/start/action",
          "Microsoft.Compute/virtualMachines/restart/action",
          "Microsoft.Authorization/*/read",
          "Microsoft.ResourceHealth/availabilityStatuses/read",
          "Microsoft.Resources/subscriptions/resourceGroups/read",
          "Microsoft.Insights/alertRules/*",
          "Microsoft.Insights/diagnosticSettings/*",
          "Microsoft.Support/*",
        ],
        notActions: [],
        dataActions: [],
        notDataActions: [],
      }],
    }));
    world = must(assignRole(world, { name: "00000000-0000-0000-0000-000000000034", principalId: READER, roleDefinitionId: "88888888-8888-8888-8888-888888888888", scope: SUB }));
    const start = evaluateAccess(world, { principalId: READER, action: "Microsoft.Compute/virtualMachines/start/action", plane: "control", scope: SUB });
    assert.equal(start.decision, "allowed");
    const vmWrite = evaluateAccess(world, { principalId: READER, action: "Microsoft.Compute/virtualMachines/write", plane: "control", scope: SUB });
    assert.equal(vmWrite.decision, "allowed");
    assert.equal(vmWrite.reasons.some((reason) => reason.kind === "granted-by" && reason.roleId === roleId("Contributor")), true);
  });

  it("does not let a notAction in one role cancel a grant from another", () => {
    let world = starterWorld();
    world = must(createCustomRole(world, {
      name: "00000000-0000-0000-0000-000000000041",
      roleName: "All but VM write",
      description: "Excludes one write.",
      assignableScopes: [SUB],
      permissions: [{ actions: ["*"], notActions: ["Microsoft.Compute/virtualMachines/write"], dataActions: [], notDataActions: [] }],
    }));
    world = must(createCustomRole(world, {
      name: "00000000-0000-0000-0000-000000000042",
      roleName: "VM write",
      description: "Grants the excluded write.",
      assignableScopes: [SUB],
      permissions: [{ actions: ["Microsoft.Compute/virtualMachines/write"], notActions: [], dataActions: [], notDataActions: [] }],
    }));
    world = must(createUser(world, { id: READER, displayName: "Ada", userPrincipalName: "ada@contoso.onmicrosoft.com" }));
    world = must(assignRole(world, { name: "00000000-0000-0000-0000-000000000043", principalId: READER, roleDefinitionId: "00000000-0000-0000-0000-000000000041", scope: SUB }));
    const blocked = evaluateAccess(world, { principalId: READER, action: "Microsoft.Compute/virtualMachines/write", plane: "control", scope: SUB });
    assert.equal(blocked.decision, "denied");
    world = must(assignRole(world, { name: "00000000-0000-0000-0000-000000000044", principalId: READER, roleDefinitionId: "00000000-0000-0000-0000-000000000042", scope: SUB }));
    const allowed = evaluateAccess(world, { principalId: READER, action: "Microsoft.Compute/virtualMachines/write", plane: "control", scope: SUB });
    assert.equal(allowed.decision, "allowed");
  });

  it("matches Learn's wildcard examples without caring about case", () => {
    const samples: Array<[string, string, boolean]> = [
      ["Microsoft.Compute/virtualMachines/read", "*/read", true],
      ["Microsoft.Compute/virtualMachines/write", "Microsoft.Compute/*", true],
      ["Microsoft.Network/virtualNetworks/read", "Microsoft.Network/*/read", true],
      ["Microsoft.Compute/virtualMachines/start/action", "Microsoft.Compute/virtualMachines/*", true],
      ["Microsoft.Web/sites/restart/action", "microsoft.web/sites/restart/Action", true],
      ["Microsoft.Network/virtualNetworks/write", "Microsoft.Network/*/read", false],
    ];
    let world = starterWorld();
    for (const [index, [action, pattern, expected]] of samples.entries()) {
      const name = `00000000-0000-0000-0000-00000000005${index}`;
      world = must(createCustomRole(world, {
        name,
        roleName: `Pattern ${index}`,
        description: "Wildcard fixture.",
        assignableScopes: [SUB],
        permissions: [{ actions: [pattern], notActions: [], dataActions: [], notDataActions: [] }],
      }));
      world = must(assignRole(world, { name: `00000000-0000-0000-0000-00000000006${index}`, principalId: USER_ID, roleDefinitionId: name, scope: SUB }));
      const decision = evaluateAccess(world, { principalId: USER_ID, action, plane: "control", scope: SUB });
      const grantedByPattern = decision.reasons.some(
        (reason) => reason.kind === "granted-by" && reason.roleId.endsWith(name),
      );
      assert.equal(grantedByPattern, expected, `${pattern} against ${action}`);
    }
  });

  it("unions two permission entries and separates the data plane", () => {
    let world = starterWorld();
    world = must(createCustomRole(world, {
      name: "00000000-0000-0000-0000-000000000071",
      roleName: "Two entries",
      description: "One control action and one data action, in separate entries.",
      assignableScopes: [SUB],
      permissions: [
        { actions: ["Microsoft.Compute/virtualMachines/read"], notActions: [], dataActions: [], notDataActions: [] },
        { actions: [], notActions: [], dataActions: ["Microsoft.Storage/storageAccounts/blobServices/containers/blobs/read"], notDataActions: [] },
      ],
    }));
    world = must(createUser(world, { id: READER, displayName: "Ada", userPrincipalName: "ada@contoso.onmicrosoft.com" }));
    world = must(assignRole(world, { name: "00000000-0000-0000-0000-000000000072", principalId: READER, roleDefinitionId: "00000000-0000-0000-0000-000000000071", scope: SUB }));
    assert.equal(evaluateAccess(world, { principalId: READER, action: "Microsoft.Compute/virtualMachines/read", plane: "control", scope: SUB }).decision, "allowed");
    assert.equal(evaluateAccess(world, { principalId: READER, action: "Microsoft.Storage/storageAccounts/blobServices/containers/blobs/read", plane: "data", scope: SUB }).decision, "allowed");
    assert.equal(evaluateAccess(world, { principalId: READER, action: "Microsoft.Storage/storageAccounts/blobServices/containers/blobs/read", plane: "control", scope: SUB }).decision, "denied");

    const blob = findBuiltInRole("Storage Blob Data Reader");
    assert.ok(blob);
    world = must(assignRole(world, { name: "00000000-0000-0000-0000-000000000073", principalId: READER, roleDefinitionId: blob.id, scope: SUB }));
    assert.equal(evaluateAccess(world, { principalId: READER, action: "Microsoft.Storage/storageAccounts/blobServices/containers/blobs/write", plane: "data", scope: SUB }).decision, "denied");
    const ownerData = evaluateAccess(world, { principalId: USER_ID, action: "Microsoft.Storage/storageAccounts/blobServices/containers/blobs/read", plane: "data", scope: SUB });
    assert.equal(ownerData.decision, "denied");
  });

  it("follows nested groups and management-group inheritance", () => {
    let world = starterWorld();
    world = must(createUser(world, { id: READER, displayName: "Ada", userPrincipalName: "ada@contoso.onmicrosoft.com" }));
    world = must(createGroup(world, { id: GROUP_INNER, displayName: "Inner" }));
    world = must(createGroup(world, { id: GROUP_OUTER, displayName: "Outer" }));
    world = must(addGroupMember(world, GROUP_INNER, READER));
    world = must(addGroupMember(world, GROUP_OUTER, GROUP_INNER));
    world = must(elevateAccess(world, "00000000-0000-0000-0000-000000000080"));
    const cycle = addGroupMember(world, GROUP_INNER, GROUP_OUTER);
    assert.equal(cycle.ok, false);
    assert.equal(cycle.error?.code, "GroupCycle");
    world = must(assignRole(world, { name: "00000000-0000-0000-0000-000000000081", principalId: GROUP_OUTER, roleDefinitionId: roleId("Reader"), scope: "/" }));
    const resource = resourceId(SUBSCRIPTION_ID, "rg-demo", "Microsoft.Compute/virtualMachines", ["vm-web-01"]);
    const read = evaluateAccess(world, { principalId: READER, action: "Microsoft.Compute/virtualMachines/read", plane: "control", scope: resource });
    assert.equal(read.decision, "allowed");
    assert.equal(read.reasons.find((reason) => reason.kind === "granted-by")?.inheritedFrom, "/");
  });

  it("elevates a Global Administrator to User Access Administrator at /", () => {
    let world = starterWorld();
    world = must(elevateAccess(world, "00000000-0000-0000-0000-000000000091"));
    const decision = evaluateAccess(world, { principalId: USER_ID, action: "Microsoft.Authorization/roleAssignments/write", plane: "control", scope: "/" });
    assert.equal(decision.decision, "allowed");
    world = must(createUser(world, { id: READER, displayName: "Ada", userPrincipalName: "ada@contoso.onmicrosoft.com" }));
    world = must(setActingPrincipal(world, READER));
    const refused = elevateAccess(world, "00000000-0000-0000-0000-000000000092");
    assert.equal(refused.ok, false);
    assert.equal(refused.error?.step, "authorize");
  });

  it("reports a condition as not evaluated and lets a deny assignment win", () => {
    let world = starterWorld();
    world = must(createUser(world, { id: READER, displayName: "Ada", userPrincipalName: "ada@contoso.onmicrosoft.com" }));
    world = must(assignRole(world, {
      name: "00000000-0000-0000-0000-000000000093",
      principalId: READER,
      roleDefinitionId: roleId("Owner"),
      scope: SUB,
      condition: "@Resource[Microsoft.Storage/storageAccounts:name] StringEquals 'locked'",
    }));
    const conditional = evaluateAccess(world, { principalId: READER, action: "Microsoft.Compute/virtualMachines/write", plane: "control", scope: SUB });
    assert.equal(conditional.decision, "conditional");
    const deny: DenyAssignment = {
      id: "/subscriptions/" + SUBSCRIPTION_ID + "/providers/Microsoft.Authorization/denyAssignments/00000000-0000-0000-0000-000000000094",
      name: "00000000-0000-0000-0000-000000000094",
      scope: SUB,
      doNotApplyToChildScopes: false,
      appliesToAllPrincipals: true,
      principals: [],
      excludePrincipals: [],
      actions: ["*/delete"],
      notActions: [],
      dataActions: [],
      notDataActions: [],
    };
    const deniedWorld: World = { ...world, denyAssignments: { [deny.id.toLowerCase()]: deny } };
    const deleted = evaluateAccess(deniedWorld, { principalId: USER_ID, action: "Microsoft.Compute/virtualMachines/delete", plane: "control", scope: SUB });
    assert.equal(deleted.decision, "denied");
    assert.equal(deleted.reasons[0]?.kind, "denied-by-deny-assignment");
  });

  it("refuses a second wildcard, root assignable scope, and deleting a role that is in use", () => {
    let world = starterWorld();
    const twoStars = createCustomRole(world, {
      name: "00000000-0000-0000-0000-000000000095",
      roleName: "Two stars",
      description: "Invalid.",
      assignableScopes: [SUB],
      permissions: [{ actions: ["Microsoft.Compute/*/virtualMachines/*"], notActions: [], dataActions: [], notDataActions: [] }],
    });
    assert.equal(twoStars.ok, false);
    const rootScope = createCustomRole(world, {
      name: "00000000-0000-0000-0000-000000000096",
      roleName: "Root scope",
      description: "Invalid.",
      assignableScopes: ["/"],
      permissions: [{ actions: ["*/read"], notActions: [], dataActions: [], notDataActions: [] }],
    });
    assert.equal(rootScope.ok, false);
    world = must(createCustomRole(world, {
      name: "00000000-0000-0000-0000-000000000097",
      roleName: "Readers plus",
      description: "Temporary.",
      assignableScopes: [SUB],
      permissions: [{ actions: ["*/read"], notActions: [], dataActions: [], notDataActions: [] }],
    }));
    world = must(assignRole(world, { name: "00000000-0000-0000-0000-000000000098", principalId: USER_ID, roleDefinitionId: "00000000-0000-0000-0000-000000000097", scope: SUB }));
    const removed = deleteCustomRole(world, "Readers plus", SUB);
    assert.equal(removed.ok, false);
    assert.equal(removed.error?.code, "RoleDefinitionHasAssignments");
    assert.match(removed.error?.message ?? "", /remove any role assignments/i);
  });
});

describe("built-in role dataset", () => {
  it("ships Learn-documented roles and no subscription id", () => {
    const raw = readFileSync(new URL("./data/built-in-roles.json", import.meta.url), "utf8");
    assert.equal(raw.toLowerCase().includes("/subscriptions/"), true);
    assert.equal(/\/subscriptions\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(raw), false);
    const file = JSON.parse(raw) as { roles: Array<{ id: string; name: string; roleName: string; permissionsPublished: boolean; source: string }> };
    const names = new Set(file.roles.map((role) => role.name));
    assert.equal(names.size, file.roles.length);
    assert.equal(file.roles.every((role) => role.id === `/providers/Microsoft.Authorization/roleDefinitions/${role.name}`), true);
    const owner = file.roles.find((role) => role.name === OWNER_ROLE_DEFINITION_ID.split("/").pop());
    assert.equal(owner?.roleName, "Owner");
    const unpublished = file.roles.filter((role) => !role.permissionsPublished).map((role) => role.roleName);
    assert.deepEqual(unpublished, ["Monitored Objects Contributor"]);
    const report = JSON.parse(readFileSync(new URL("./data/role-import-report.json", import.meta.url), "utf8")) as { shipped: number; fromApi: number; fromLearn: number; undocumentedNotShipped: number };
    assert.equal(report.shipped, file.roles.length);
    assert.equal(report.fromApi, 499);
    assert.equal(report.fromLearn, 6);
    assert.equal(report.undocumentedNotShipped, 471);
  });
});
