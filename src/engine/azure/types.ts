/**
 * Azure world. Plain data only, so it can be saved and diffed.
 * See docs/SIMULATOR.md section 2.
 */

export const SCHEMA_VERSION = 1;

export type SubscriptionState = "Enabled" | "Warned" | "PastDue" | "Disabled" | "Deleted";

export type RegistrationState = "Registered" | "NotRegistered" | "Registering";

export type PowerState =
  | "Creating"
  | "Starting"
  | "Running"
  | "Stopping"
  | "Stopped"
  | "Deallocating"
  | "Deallocated";

export interface Tenant {
  id: string;
  displayName: string;
  /** Looks like contoso.onmicrosoft.com. Learn: create-new-tenant. */
  initialDomain: string;
}

export interface DirectoryUser {
  id: string;
  displayName: string;
  userPrincipalName: string;
  /** The only modelled Entra role is Global Administrator. See docs/RBAC.md section 3. */
  directoryRoles: string[];
}

export interface Directory {
  users: Record<string, DirectoryUser>;
  groups: Record<string, { id: string; displayName: string; members: string[] }>;
  servicePrincipals: Record<string, { id: string; appId: string; displayName: string }>;
}

export interface ManagementGroup {
  id: string;
  name: string;
  displayName: string;
  parentId: string | null;
  tenantId: string;
}

export interface Subscription {
  id: string;
  subscriptionId: string;
  displayName: string;
  state: SubscriptionState;
  tenantId: string;
  parentId: string;
}

export interface ResourceGroup {
  id: string;
  name: string;
  type: "Microsoft.Resources/resourceGroups";
  location: string;
  subscriptionId: string;
  tags: Record<string, string>;
  provisioningState: "Succeeded";
}

export interface Resource {
  id: string;
  name: string;
  type: string;
  location: string;
  tags: Record<string, string>;
  resourceGroup: string;
  subscriptionId: string;
  kind?: string;
  sku?: { name: string };
  managedBy?: string;
  properties: Record<string, unknown>;
}

export interface RoleAssignment {
  id: string;
  name: string;
  principalId: string;
  principalType: "User" | "Group" | "ServicePrincipal";
  roleDefinitionId: string;
  scope: string;
}

export interface ManagementLock {
  id: string;
  name: string;
  level: "CanNotDelete" | "ReadOnly";
  scope: string;
}

export interface CliSession {
  actingPrincipalId: string;
  subscriptionId: string;
  defaults: { group?: string; location?: string };
}

export interface World {
  format: "polaris-world";
  schemaVersion: number;
  provider: "azure";
  createdAt: string;
  /** Simulated milliseconds. Rules never read Date.now(). */
  clock: number;
  tenant: Tenant;
  directory: Directory;
  managementGroups: Record<string, ManagementGroup>;
  subscriptions: Record<string, Subscription>;
  resourceGroups: Record<string, ResourceGroup>;
  resources: Record<string, Resource>;
  roleAssignments: Record<string, RoleAssignment>;
  locks: Record<string, ManagementLock>;
  policyAssignments: Record<string, never>;
  providerRegistrations: Record<string, Record<string, RegistrationState>>;
  deployments: Record<string, never>;
  session: CliSession;
}

export type HttpMethod = "GET" | "PUT" | "PATCH" | "POST" | "DELETE";
