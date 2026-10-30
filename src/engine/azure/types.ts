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

export interface DirectoryGroup {
  id: string;
  displayName: string;
  /** User, group and service principal ids. Cycles are rejected. */
  members: string[];
}

export interface DirectoryServicePrincipal {
  id: string;
  appId: string;
  displayName: string;
  directoryRoles: string[];
  /** Set when this service principal is a managed identity. A managed identity has no separate principalType. */
  managedIdentity?: { kind: "system" | "user"; ownerId?: string };
}

export interface Directory {
  users: Record<string, DirectoryUser>;
  groups: Record<string, DirectoryGroup>;
  servicePrincipals: Record<string, DirectoryServicePrincipal>;
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

export interface RolePermission {
  actions: string[];
  notActions: string[];
  dataActions: string[];
  notDataActions: string[];
  condition?: string | null;
  conditionVersion?: string | null;
}

export interface RoleDefinition {
  id: string;
  name: string;
  roleName: string;
  description: string;
  roleType: "BuiltInRole" | "CustomRole";
  assignableScopes: string[];
  permissions: RolePermission[];
  source: "api-export" | "learn" | "custom";
  /** False when Learn lists the role but does not publish its actions. */
  permissionsPublished: boolean;
  /** False for scopes this sandbox does not model, such as service groups. */
  assignableInSandbox: boolean;
}

/**
 * Present so evaluation can run. Users cannot create these.
 * See docs/RBAC.md section 6.
 */
export interface DenyAssignment {
  id: string;
  name: string;
  scope: string;
  doNotApplyToChildScopes: boolean;
  appliesToAllPrincipals: boolean;
  principals: string[];
  excludePrincipals: string[];
  actions: string[];
  notActions: string[];
  dataActions: string[];
  notDataActions: string[];
}

export interface RoleAssignment {
  id: string;
  name: string;
  principalId: string;
  principalType: "User" | "Group" | "ServicePrincipal";
  roleDefinitionId: string;
  scope: string;
  condition?: string;
  description?: string;
  /** World clock at creation. Rules do not call Date.now(). */
  createdOn: number;
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
  /** Custom roles only. Built-in roles stay in the imported dataset. */
  roleDefinitions: Record<string, RoleDefinition>;
  denyAssignments: Record<string, DenyAssignment>;
  locks: Record<string, ManagementLock>;
  policyAssignments: Record<string, never>;
  providerRegistrations: Record<string, Record<string, RegistrationState>>;
  deployments: Record<string, never>;
  session: CliSession;
}

export type HttpMethod = "GET" | "PUT" | "PATCH" | "POST" | "DELETE";
