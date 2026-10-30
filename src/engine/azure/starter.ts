/**
 * Reset world. One tenant, the root management group, one subscription, and user "You".
 * Learn does not describe a default sandbox. See docs/SIMULATOR.md section 10 and docs/RBAC.md section 3.
 */

import { SCHEMA_VERSION, type World } from "./types";
import {
  CREATED_AT,
  OWNER_ROLE_DEFINITION_ID,
  ROLE_ASSIGNMENT_ID,
  SUBSCRIPTION_ID,
  TENANT_ID,
  USER_ID,
} from "./constants";
import { canonicalId, managementGroupId, subscriptionId } from "./ids";

export function starterWorld(): World {
  const tenantScope = managementGroupId(TENANT_ID);
  const subScope = subscriptionId(SUBSCRIPTION_ID);
  const assignmentScope = `${subScope}/providers/Microsoft.Authorization/roleAssignments/${ROLE_ASSIGNMENT_ID}`;
  return {
    format: "polaris-world",
    schemaVersion: SCHEMA_VERSION,
    provider: "azure",
    createdAt: CREATED_AT,
    clock: 0,
    tenant: {
      id: TENANT_ID,
      displayName: "Contoso",
      initialDomain: "contoso.onmicrosoft.com",
    },
    directory: {
      users: {
        [USER_ID]: {
          id: USER_ID,
          displayName: "You",
          userPrincipalName: "you@contoso.onmicrosoft.com",
          directoryRoles: ["Global Administrator"],
        },
      },
      groups: {},
      servicePrincipals: {},
    },
    managementGroups: {
      [canonicalId(tenantScope)]: {
        id: tenantScope,
        name: TENANT_ID,
        displayName: "Tenant root group",
        parentId: null,
        tenantId: TENANT_ID,
      },
    },
    subscriptions: {
      [canonicalId(subScope)]: {
        id: subScope,
        subscriptionId: SUBSCRIPTION_ID,
        displayName: "Default subscription",
        state: "Enabled",
        tenantId: TENANT_ID,
        parentId: tenantScope,
      },
    },
    resourceGroups: {},
    resources: {},
    roleAssignments: {
      [canonicalId(assignmentScope)]: {
        id: assignmentScope,
        name: ROLE_ASSIGNMENT_ID,
        principalId: USER_ID,
        principalType: "User",
        roleDefinitionId: OWNER_ROLE_DEFINITION_ID,
        scope: subScope,
        createdOn: 0,
      },
    },
    roleDefinitions: {},
    denyAssignments: {},
    locks: {},
    policyAssignments: {},
    providerRegistrations: {},
    deployments: {},
    session: {
      actingPrincipalId: USER_ID,
      subscriptionId: SUBSCRIPTION_ID,
      defaults: { location: "southeastasia" },
    },
  };
}
