import { LEARN } from "./learn";

/** Obviously fake GUIDs. Never a real tenant or subscription ID. */
export const TENANT_ID = "00000000-0000-0000-0000-000000000001";
export const USER_ID = "00000000-0000-0000-0000-000000000002";
export const SUBSCRIPTION_ID = "00000000-0000-0000-0000-000000000003";
export const ROLE_ASSIGNMENT_ID = "00000000-0000-0000-0000-000000000004";

/**
 * Built-in Owner role definition. Checkpoint 13 replaces this constant with the imported dataset.
 * Learn: built-in-roles/privileged#owner
 */
export const OWNER_ROLE_DEFINITION_ID =
  "/providers/Microsoft.Authorization/roleDefinitions/8e3af657-a8ff-443c-a75c-2fe8c4bcb635";

export const LIMITS = {
  resourceGroupsPerSubscription: 980,
  instancesPerTypePerGroup: 800,
  managementGroupsPerDirectory: 10_000,
  /** Levels below the root. The root and the subscription are not counted. */
  managementGroupDepth: 6,
  tags: 50,
  tagKey: 512,
  tagValue: 256,
  locksPerScope: 20,
} as const;

export const REGIONS = ["southeastasia", "eastasia"] as const;
export type RegionName = (typeof REGIONS)[number];

/** Providers the catalog tells you to register yourself. */
export const MANUAL_PROVIDERS = new Set(["microsoft.app", "microsoft.operationalinsights"]);

export const CREATED_AT = "2026-01-01T00:00:00.000Z";

export const LIMITS_LEARN = LEARN.limits;
