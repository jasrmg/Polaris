# Azure resource model: facts for the Polaris sandbox world model

**Type:** research only (no code changed). **Accessed:** 2026-10-27 (all pages below were fetched on this date).
**Sources:** `learn.microsoft.com` plus two Microsoft-owned GitHub pages, flagged where used. Nothing else.
**How to read this:** every fact carries a source tag like `[S7]`. The full URL for each tag is in the index at the bottom ("Source index"). Anything Learn does not state is in section 8 ("Could not verify") or is explicitly labelled **Recommendation** (my proposal, not a Learn fact).
**Why this exists:** `docs/PLAN.md` sections 0, 3, 7 and 12 say the sandbox world model must follow Learn and must not invent behaviour. This file is the citable input for `docs/SIMULATOR.md` (checkpoint 10).

---

## 1. Hierarchy

### 1.1 Overview (Learn's four scope levels)

Learn says Azure has four levels of management scope: management groups, subscriptions, resource groups and resources; lower levels inherit settings from higher levels [S2]. Azure RBAC uses the same four levels [S9]. The Microsoft Entra tenant sits above all of them and is not one of the four "scope levels" (see 1.2). ARM templates can be deployed to tenants, management groups, subscriptions or resource groups [S2].

### 1.2 Microsoft Entra tenant (directory)

| Fact | Source |
|---|---|
| Every Azure subscription has a trust relationship with a Microsoft Entra tenant (directory). Subscriptions rely on it to authenticate and authorize security principals. | [S5] |
| A subscription trusts exactly one directory. One tenant can be trusted by multiple subscriptions. | [S5] |
| "Azure subscriptions associated with a Microsoft Entra tenant": limit **Unlimited**. | [S6] |
| Azure roles control access to Azure resources. Microsoft Entra roles control access to directory resources (users, groups, domains). Changing a subscription's directory does not make the subscription owner a Global Administrator. | [S5] |
| Changing a subscription's directory: users with Azure RBAC role assignments lose access, classic administrators lose access, role assignments are **not** transferred, system-assigned managed identities must be re-enabled and user-assigned ones re-created. | [S5] |
| A new tenant has an initial domain such as `contoso.onmicrosoft.com`. The user who creates the tenant is automatically Global Administrator. | [S41], [S52] |
| Each subscription has a tenant ID. Find it with `az account list`, `az account tenant list`, `Get-AzTenant`, or the portal (Microsoft Entra ID > Properties). | [S42] |
| The root management group's ID is the same value as the Microsoft Entra tenant ID. | [S1] |
| Entra data location is chosen when creating the tenant (geographic or worldwide); Learn classes Microsoft Entra ID as a nonregional service. | [S27] |

### 1.3 Management groups

| Fact | Source |
|---|---|
| Management groups are a governance scope above subscriptions. Assignments (policy, RBAC) cascade by inheritance to all subscriptions below. | [S1] |
| All subscriptions in one management group must trust the same Microsoft Entra tenant. | [S1] |
| A single directory can support **10,000** management groups. | [S1], [S6] |
| A tree can support up to **six levels of depth**, not counting the root level or the subscription level. (Limits page: "Root level plus 6 levels"; "The 6 levels don't include the subscription level".) | [S1], [S6] |
| Each management group and each subscription supports **only one parent**. A management group can have many children. Subscriptions per management group: Unlimited. | [S1], [S6] |
| Each directory has a single **root management group**. Default display name **Tenant root group**; its ID equals the tenant ID. It cannot be moved or deleted. | [S1] |
| New subscriptions default to the root management group. When anyone first uses management groups, the root is created and all existing subscriptions become its children, so there is exactly one hierarchy per directory. | [S1] |
| No one has default access to the root management group. Only Microsoft Entra Global Administrators can elevate themselves (User Access Administrator at the root). | [S1] |
| Moving a subscription or management group needs write permissions on the child, the target parent and the current parent. If the target or current parent is the root, those permission requirements do not apply. | [S1] |
| ARM caches management group hierarchy details for up to **30 minutes**, so the portal may not show a move immediately. | [S1] |
| Management group scope ID: `/providers/Microsoft.Management/managementGroups/{management-group-id}`. Use the ID, not the display name, in custom role definitions. | [S1], [S9] |
| Name rule for `Microsoft.Management/managementgroups`: scope **tenant**, 1-90 characters, alphanumerics, hyphens, underscores, periods and parentheses, start with a letter or number, cannot end with a period. | [S7] |
| Custom roles: only **one** management group may be in a new role's assignable scopes; custom roles with `DataActions` cannot be assigned at management group scope; ARM does not validate that the management group exists. | [S1] |
| Role assignments per management group: **500**. Role assignments per subscription: **5,000**. Management-group-level deployments: 800 (history), locations of such deployments: 10. | [S6] |
| Learn lists "Azure management groups" and "Azure subscriptions" as **nonregional** services (not deployed into a specific region). | [S27] |

### 1.4 Subscriptions

| Fact | Source |
|---|---|
| Subscription ID is a UUID/GUID (REST: "The value must be an UUID"; limits page: "subscription IDs must be non-empty GUIDs"). Example ID form: `/subscriptions/8d65815f-a5b6-402f-9298-045155da7d74`. | [S4], [S6] |
| Subscription object fields (REST `Subscriptions - Get`, API 2022-12-01): `id`, `subscriptionId`, `displayName`, `state`, `tenantId`, `tags`, `managedByTenants[]`, `authorizationSource`, `subscriptionPolicies {locationPlacementId, quotaId, spendingLimit}`. | [S4] |
| `SubscriptionState` enum (REST): **Enabled, Warned, PastDue, Disabled, Deleted**. | [S4] |
| `locationPlacementId` "indicates which regions are visible for a subscription". `spendingLimit` values: On, Off, CurrentPeriodOff. | [S4] |
| Subscription limits: resource groups per subscription **980**; tags directly on a subscription 50; subscription-level deployments 800; locations of subscription-level deployments 10. | [S6] |

**Subscription states: what Learn says each allows** (portal "Status" names come from a different page than the REST enum, see section 8):

| State | What Learn says | Source |
|---|---|---|
| Active / Enabled | Can deploy new resources and manage existing ones. All operations (PUT, PATCH, DELETE, POST, GET) available for registered resource providers. | [S3] |
| Past Due | Outstanding payment. Still active; all operations available. | [S3] |
| Warned | Resources can be retrieved or deleted (GET/DELETE) but not created (PUT/PATCH/POST). Resources go offline but recover when the subscription is active again. Not charged. | [S3] |
| Disabled | Cannot create or manage resources. VMs are deallocated, temporary IPs are freed, storage is read-only, other services disabled. PUT, PATCH, POST disabled; GET and DELETE still work. Ownership transfer disabled. May stay disabled 1-90 days depending on type, then permanently deleted. | [S3] |
| Expired | (Portal state page only, not in the REST enum.) Subscription was canceled. PUT/PATCH/POST disabled, GET/DELETE allowed. Can be reactivated. | [S3] |
| Deleted | Subscription deleted with all underlying resources and data. No operations available. | [S3] |

### 1.5 Resource groups

| Fact | Source |
|---|---|
| A resource group is a container for related resources. Each resource exists in **only one** resource group. Resources can be added to, removed from, or moved between resource groups at any time (moves change the ID, not the region). | [S2], [S49] |
| The group has a **location**; it stores the metadata about its resources there. Resources inside can be in **different regions** than the group. | [S2], [S36] |
| The RG `location` "cannot be changed after the resource group has been created". | [S19] |
| **Cannot be renamed** ("create a new resource group with the desired name and move the resources"). | [S38], [S39] |
| **Cannot be nested**. | [S39], [S40] |
| Tags on a resource group are **not inherited** by its resources. | [S2] |
| A resource can connect to resources in other resource groups. | [S2] |
| Deleting a resource group deletes all resources in it. Deletion is irreversible; a resource group cannot be recovered. | [S2], [S14] |
| Up to **800 instances of a resource type per resource group** (some types exempt). Resources per RG overall: not limited. | [S2], [S6] |
| Some resources exist outside a resource group: they deploy to the subscription, management group or tenant; only specific types support those scopes. | [S2] |
| Control-plane operations on the group's resources are routed through the group's location. If that region is unavailable, ARM reroutes to a backup region for control-plane calls; data-plane is unaffected. | [S2], [S38] |
| RG name: scope **subscription**, 1-90, underscores, hyphens, periods, parentheses, and letters/digits (as defined by .NET `Char.IsLetterOrDigit`), cannot end with period. REST path parameter pattern `^[-\w._()]+$`, name is case insensitive. | [S7], [S19] |
| Creating one in the portal: "It takes a few seconds to create a resource group." | [S36] |
| RG object (REST): `id`, `name`, `type`, `location`, `managedBy`, `tags`, `properties.provisioningState`. | [S19] |
| Management locks per unique scope: 20. Locks inherit down the scope tree; "the most restrictive lock in the inheritance chain takes precedence". Lock levels: `CanNotDelete`, `ReadOnly` (portal: Delete, Read-only). | [S6], [S46] |

### 1.6 Resources

Learn's terminology: a *resource* is "a manageable item that's available through Azure"; resource groups, subscriptions, management groups and tags are also resources [S2]. A *resource provider* supplies resources (for example `Microsoft.Compute`) [S2]. An *extension resource* adds to another resource's capabilities; a role assignment is the example [S2], [S9]. Resource limits per tags: 50 tags per resource or RG, tag name max 512, tag value max 256 [S6].

---

## 2. ARM resource IDs

### 2.1 ID formats (all from Learn)

| Kind | Format | Source |
|---|---|---|
| Management group | `/providers/Microsoft.Management/managementGroups/{managementGroupName}` (example `/providers/Microsoft.Management/managementGroups/marketing-group`) | [S9] |
| Subscription | `/subscriptions/{subscriptionId}` (a GUID) | [S9] |
| Resource group | `/subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}` | [S9] |
| Resource (RG scope) | `/subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/{resourceProviderNamespace}/{resourceType}/{resourceName}` | [S11] |
| Child resource | Full type = `{namespace}/{parentType}/{childType}`; full name = `{parentName}/{childName}`. "The number of segments in the type is always one more than the number of segments in the name." In the ID, type and name segments alternate: `.../providers/Microsoft.Storage/storageAccounts/azurestorage12345/blobServices/default/containers/blob-container-01` | [S12], [S9] |
| Resource at subscription scope | `/subscriptions/{subscriptionId}/providers/{resourceProviderNamespace}/{resourceType}/{resourceName}` | [S11] |
| Resource at management group scope | `/providers/Microsoft.Management/managementGroups/{managementGroupName}/providers/{resourceType}/{resourceName}` (`resourceType` includes the namespace) | [S11] |
| Resource at tenant scope | `/providers/{resourceProviderNamespace}/{resourceType}/{resourceName}` | [S11] |
| Extension resource | base resource ID + `/providers/{extNamespace}/{extType}/{extName}`, for example a role assignment at RG scope: `/subscriptions/{subscriptionId}/resourceGroups/{rg}/providers/Microsoft.Authorization/roleAssignments/{roleAssignmentId}`; its scope is the ID with `/providers/Microsoft.Authorization/...` removed | [S11], [S9] |

Other ID facts:

- The REST `Get By Id` description gives the generic form `/subscriptions/{guid}/resourceGroups/{resource-group-name}/{resource-provider-namespace}/{resource-type}/{resource-name}` (it omits the `providers/` segment; Learn's own `resourceId` function page includes it, so treat the `resourceId` page as authoritative) [S13], [S11].
- Resource type = `{resource-provider}/{resource-type}`, for example `Microsoft.KeyVault/vaults` [S10].
- Role assignment and role definition names are 36-character GUIDs with scope **tenant** [S7].
- **Casing.** Learn: "Resource and resource group names are case-insensitive unless specifically noted ... Always perform a case-insensitive comparison of names", and APIs may return different casing than you supplied [S7], [S38]. Learn's own scope page writes the segment as `/resourcegroups` in the diagram and `resourceGroups` in the examples, and the REST page uses `/resourcegroups/` in the path [S9], [S19]. So the sandbox should parse segment keywords case-insensitively and compare names case-insensitively. An explicit sentence "resource IDs are case-insensitive" is only found in a comment on a GitHub issue in the Azure org ([S51], weak), not on Learn.
- Names must not contain `#` (breaks URL parsing in ARM requests) [S7].

### 2.2 Resource provider namespaces and types

- A resource provider is "a set of REST operations that support functionality for a specific Azure service"; the namespace looks like `Microsoft.Compute`, `Microsoft.Storage`, `Microsoft.Network` [S10], [S2].
- The naming page groups resource names by namespace (for example `Microsoft.Network`, `Microsoft.Compute`, `Microsoft.Storage`) [S7].
- Each type has valid **API versions** and valid **locations** you can query (`az provider show`, `Get-AzResourceProvider`) [S10].
- Template/Bicep declaration: `type` + `apiVersion` set which properties exist; then `name`, `location`, `tags`, `sku`, `kind`, `properties` [S43]. Example in Learn: storage account with `sku.name`, `kind: StorageV2`, `properties.accessTier` [S43].

### 2.3 Common envelope fields (REST `GenericResource`, API 2021-04-01) [S13]

| Field | What Learn says |
|---|---|
| `id` | Resource ID |
| `name` | Resource name |
| `type` | Resource type |
| `location` | Resource location |
| `tags` | Resource tags (object) |
| `kind` | "The kind of the resource"; pattern `^[-\w._,()]+$` |
| `sku` | `{ name, tier, size, family, model, capacity (int32) }` |
| `identity` | `{ type, principalId, tenantId, userAssignedIdentities }`; `type` in {`SystemAssigned`, `UserAssigned`, `SystemAssigned, UserAssigned`, `None`}; user-assigned keys are ARM IDs of `Microsoft.ManagedIdentity/userAssignedIdentities/{name}` |
| `properties` | Object; the resource-specific part |
| `managedBy` | "ID of the resource that manages this resource" (used in delete ordering, see 6) |
| `plan`, `extendedLocation` | Marketplace plan; extended location (only value `EdgeZone`) |

`provisioningState` is **not** a top-level envelope field. It is a resource-specific property inside `properties` (resource group: `properties.provisioningState` [S19]; the VNet and VM REST samples show it in the properties/instance view [S18], [S22]).

---

## 3. Provisioning states and lifecycle

### 3.1 What Learn documents

- Create, update and delete operations (PUT, PATCH, DELETE) "typically return a `provisioningState`". **Succeeded, Failed, Canceled** mean the operation finished; "all other values indicate the operation is still running". The provider can return a custom in-progress value, for example **Accepted** when the request is received and running [S15].
- Async operations first return HTTP 201 or 202; completion returns 200 or 204. The status endpoint is in `Azure-AsyncOperation` or `Location`, with `Retry-After`. If no `provisioningState` is returned, the operation finished and succeeded [S15].
- Failed/Canceled async status includes an `error { code, message }` object [S15].

### 3.2 Documented value sets per resource provider (they differ)

| Where | Values Learn lists | Source |
|---|---|---|
| Deployments (`Microsoft.Resources/deployments`, API 2025-04-01) | NotSpecified, Accepted, Running, Ready, Creating, Created, Deleting, Deleted, Canceled, Failed, Succeeded, Updating | [S17] |
| Microsoft.Network (VNet REST, API 2026-01-01) | Failed, Succeeded, Canceled, Creating, Updating, Deleting | [S18] |
| Virtual machine | Creating, Updating, Failed, Succeeded, Deleting, Migrating (Migrating is for ASM-to-ARM migration) | [S16] |
| VM OS provisioning substates (generalized images only; appear as e.g. `ProvisioningState/creating/osProvisioningComplete`) | OSProvisioningInProgress, OSProvisioningComplete, Succeeded, Failed | [S16] |
| Storage account (API 2026-09-01) | Creating, ResolvingDNS, Succeeded | [S20] |
| Resource group | Field exists (`properties.provisioningState`, "The provisioning state") but the page does not enumerate values | [S19] |
| Subscription | Uses `state` (section 1.4), not `provisioningState` | [S4] |

Takeaway: there is **no single universal enum**. The common core across Learn pages is Creating, Updating, Deleting, Succeeded, Failed, Canceled (+ Accepted for async/deployments).

### 3.3 VM power states and billing [S16]

Power state = "last known state of the VM", separate from provisioning state (the status of a user-initiated control-plane operation).

| Power state | Description (Learn) | Billing (compute) |
|---|---|---|
| Creating | Allocating resources | Not billed* |
| Starting | Powering up | **Billed** |
| Running | Fully up, standard working state | Billed |
| Stopping | Transitional running to stopped | Billed |
| Stopped | Allocated on a host but not running. Also called PoweredOff or **Stopped (Allocated)**. Result of the `PowerOff` API or a guest-OS shutdown. | **Billed** |
| Deallocating | Transitional running to deallocated | Not billed* |
| Deallocated | Released the lease on the hardware. Shown as **Stopped (Deallocated)** if powered off, or Hibernated (Deallocated) if hibernated. | **Not billed*** |

\* "Some Azure resources, such as Disks and Networking continue to incur charges." [S16]

Instance view codes:

- Instance view `statuses[]` entries have `code`, `level` (Info, Warning, Error), `displayStatus`, `message`, `time` [S22].
- Learn's example: `{ "code": "PowerState/running", "level": "Info", "displayStatus": "VM running" }`, and `ProvisioningState/succeeded` with "Provisioning succeeded" [S16], [S22].
- The Learn Java SDK reference for the same data lists the power-state code values: `PowerState/deallocated`, `PowerState/deallocating`, `PowerState/running`, `PowerState/starting`, `PowerState/stopped`, `PowerState/stopping`, `PowerState/unknown` [S23]. (The REST instance-view page itself only shows `running`; see section 8.)
- CLI: `az vm stop` "Power off (stop) a running VM. The VM will continue to be billed. To avoid this, you can deallocate the VM through `az vm deallocate`." `az vm deallocate`: "The status will change from 'Stopped' to 'Stopped (Deallocated)'." [S21]
- Disabled subscription: VMs are deallocated [S3].
- Public IP: a dynamic address can change when a VM is stopped (deallocated) and restarted; it stays the same on reboot or a guest-OS stop. Static addresses are not released until the public IP resource is deleted. Standard SKU is always static [S31].

### 3.4 Typical creation durations (only where Learn states them)

| What | Duration Learn states | Source |
|---|---|---|
| Resource group (portal) | "a few seconds" | [S36] |
| Azure Bastion, dedicated SKUs (Basic, Standard, Premium via Default or Custom settings) | "approximately 10 minutes"; Developer SKU "deploys in seconds" | [S44] |
| Move resources between groups | The source and target groups are locked "up to four hours"; "most moves are completed faster" | [S49] |
| Soft-deleted Recovery Services items | Permanently deleted after 14 days | [S45] |
| Force-deleted VM NIC MAC address | "may take up to 10 min to free" | [S47] |

Learn gives no general creation time for VMs, VNets, storage accounts etc. in the pages checked. The sandbox timer is a UX choice, not a documented value (see 7).

---

## 4. Naming rules

Source: the official "Naming rules and restrictions for Azure resources" page [S7]. Its Learn render truncates the VM and VMSS "Valid Characters" cell; the full text comes from the Microsoft-owned GitHub source of that same page (`MicrosoftDocs/azure-docs`, front matter `ms.date: 08/05/2026`) [S8]. General rules from that page: names are case-insensitive unless the character column says otherwise; "alphanumeric" means a-z, A-Z, 0-9; resources with a public endpoint cannot contain reserved words or trademarks; do not use `#` [S7].

"Scope" below is the page's Scope column: where the name must be unique.

| Resource type (ARM) | Catalog entry | Length | Valid characters (verbatim summary) | Uniqueness scope | Source |
|---|---|---|---|---|---|
| `Microsoft.Resources/resourcegroups` | resource-group | 1-90 | Underscores, hyphens, periods, parentheses, letters or digits (`Char.IsLetterOrDigit`); cannot end with a period | **subscription** | [S7] |
| `Microsoft.Compute/virtualMachines` | virtual-machine | 1-15 (Windows), 1-64 (Linux) | No spaces, control characters or the characters `~ ! @ # $ % ^ & * ( ) = + _ [ ] { } \ \| ; : . ' " , < > / ?` (the list includes the pipe character). Windows names cannot include periods or end with a hyphen; Linux names cannot end with a period or hyphen. | resource group | [S8] |
| `Microsoft.Compute/virtualMachineScaleSets` | virtual-machine-scale-set | 1-15 (Windows), 1-64 (Linux) | Same forbidden characters as VMs; cannot start with underscore; cannot end with period or hyphen | resource group | [S8] |
| `Microsoft.Storage/storageAccounts` | storage-account | 3-24 | Lowercase letters and numbers | **global** | [S7], [S48] |
| `.../storageAccounts/blobServices/containers` | blob-container | 3-63 | Lowercase letters, numbers, hyphens; start with a lowercase letter or number; no consecutive hyphens | storage account | [S7] |
| `.../storageAccounts/fileServices/shares` | file-share | 3-63 | Lowercase letters, numbers, hyphens; cannot start or end with a hyphen; no consecutive hyphens | storage account | [S7] |
| `Microsoft.Network/virtualNetworks` | virtual-network | 2-64 | Alphanumerics, underscores, periods, hyphens; start with alphanumeric; end with alphanumeric or underscore | resource group | [S7] |
| `Microsoft.Network/virtualNetworks/subnets` | subnet | 1-80 | Same as VNet | **virtual network** | [S7] |
| `Microsoft.Network/virtualNetworks/virtualNetworkPeerings` | vnet-peering | 1-80 | Same as VNet | virtual network | [S7] |
| `Microsoft.Network/publicIPAddresses` | public-ip-address | 1-80 | Same as VNet | resource group | [S7] |
| `Microsoft.Network/networkSecurityGroups` | network-security-group | 1-80 | Same as VNet | resource group | [S7] |
| `.../networkSecurityGroups/securityRules` | (NSG rules) | 1-80 | Same as VNet | network security group | [S7] |
| `Microsoft.Network/applicationSecurityGroups` | application-security-group | 1-80 | Same as VNet | resource group | [S7] |
| `Microsoft.Network/routeTables` (+ `routes`) | route-table | 1-80 | Same as VNet | resource group (routes: route table) | [S7] |
| `Microsoft.Network/dnsZones` | azure-dns-zone | "1-63 characters, 2 to 34 labels" (each label separated by a period; `contoso.com` has two labels) | Each label: alphanumerics, underscores, hyphens | resource group | [S7] |
| `Microsoft.Network/privateDnsZones` | private-dns-zone | "1-63 characters, 2 to 34 labels" | Each label: alphanumerics, underscores, hyphens | resource group | [S7] |
| `.../privateDnsZones/virtualNetworkLinks` | (VNet link) | 1-80 | Same as VNet | private DNS zone | [S7] |
| `Microsoft.Network/loadBalancers` | load-balancer | 1-80 | Same as VNet | resource group | [S7] |
| `Microsoft.Network/bastionHosts` | azure-bastion | 1-80 | Same as VNet | resource group | [S7] |
| `Microsoft.Network/privateEndpoints` | private-endpoint | 2-64 | Same as VNet | resource group | [S7] |
| `Microsoft.Network/networkWatchers` | network-watcher | 1-80 | Same as VNet | resource group | [S7] |
| `Microsoft.Network/networkInterfaces` | (NIC, not in catalog) | 1-80 | Same as VNet | resource group | [S7] |
| `Microsoft.Web/serverfarms` | app-service-plan | 1-60 | Alphanumeric, hyphens, Unicode characters mappable to Punycode | resource group | [S7] |
| `Microsoft.Web/sites` | app-service | 2-60 | Alphanumeric, hyphens, Punycode-mappable Unicode; cannot start or end with a hyphen | **global** (per domain when on an App Service Environment); URL is `<name>.azurewebsites.net` | [S7] |
| `Microsoft.Web/sites/slots` | (slot) | 2-59 | As above | site | [S7] |
| `Microsoft.ContainerInstance/containerGroups` | container-instances | 1-63 | Lowercase letters, numbers, hyphens; cannot start or end with a hyphen; no consecutive hyphens | resource group | [S7] |
| `Microsoft.App/containerApps` | container-apps | 2-32 | Lowercase letters, numbers, hyphens; start with a letter, end with alphanumeric | resource group | [S7] |
| `Microsoft.OperationalInsights/workspaces` | log-analytics-workspace | 4-63 | Alphanumerics and hyphens; start and end with alphanumeric | resource group | [S7] |
| `Microsoft.Insights/actionGroups` | action-group | 1-260 | Cannot use `: < > + / & % \ ?` or the pipe character, or control characters; cannot end with space or period | resource group | [S8] |
| `Microsoft.Insights/metricAlerts` | alert-rule (metric) | 1-260 | Cannot use `* # & + : < > ? @ % { } \ /` or the pipe character, or control characters; cannot end with space or period | resource group | [S8] |
| `Microsoft.Insights/scheduledQueryRules` | alert-rule (log search) | 1-260 | Cannot use `* < > % { } & : \ ? / #` or the pipe character, or control characters; cannot end with space or period | resource group | [S8] |
| `Microsoft.Insights/activityLogAlerts` | alert-rule (activity log) | 1-260 | Cannot use `< > * % { } & : \ ? + / #` or the pipe character, or control characters; cannot end with space or period | resource group | [S8] |
| `Microsoft.RecoveryServices/vaults` | recovery-services-vault | 2-50 | Alphanumerics and hyphens; start with a letter | resource group | [S7], [S8] |
| `Microsoft.Management/managementgroups` | (container, checkpoint 11) | 1-90 | Alphanumerics, hyphens, underscores, periods, parentheses; start with letter or number; cannot end with period | tenant | [S7] |
| `Microsoft.Authorization/roleAssignments`, `roleDefinitions` | (checkpoint 13) | 36 | Must be a GUID | tenant | [S7] |
| `Microsoft.Authorization/locks` | (checkpoint 14) | 1-90 | Alphanumerics, periods, underscores, hyphens, parentheses; cannot end in period | scope of assignment | [S7] |

Notes and gaps for the catalog list:

- **Service endpoint**: it is a subnet setting, not a named resource, so there is no row [S29].
- **Container Apps environment** (`Microsoft.App/managedEnvironments`): no row on the naming page (not verified, see section 8).
- **Alert rule**: "alert rule" is three different ARM types with three different forbidden-character lists (above). Prometheus rule groups are `Microsoft.AlertsManagement/prometheusRuleGroups`, 1-260 [S8].
- **VM**: two names. "Azure virtual machines have two distinct names: resource name and host name. When you create a virtual machine in the portal, the same value is used for both names. The restrictions in the preceding table are for the host name. The actual resource name can have up to 64 characters." [S7]
- **Resources not at resource-group uniqueness** (exactly as the Scope column shows): resource group = subscription; subnet and peering = virtual network; blob container and file share = storage account; storage account and web app = global; role assignment and management group = tenant.
- **Public IP DNS name label** (`label.<region>.cloudapp.azure.com`): "Must be unique within the Azure location ... across all subscriptions and all customers". The public IP resource name itself must be unique within the resource group [S31].
- **Container group DNS label** uniqueness (region) and "DNS name label scope reuse" options are in the catalog notes (`container-instances.ts`), not re-fetched here.
- **Cross-check vs. the catalog:** the existing prerequisites in `resource-group.ts` (90 chars; letters, digits, underscores, hyphens, periods, parentheses; cannot end with a period) and `blob-container.ts` (3-63; no consecutive hyphens) agree with [S7].

---

## 5. Locations

| Fact | Source |
|---|---|
| Programmatic region names are lowercase without spaces: Southeast Asia = `southeastasia`, East Asia = `eastasia`. Get the list with `az account list-locations`, `Get-AzLocation` or the ARM REST API. | [S25] |
| Southeast Asia: physical location **Singapore**, geography **Asia Pacific**, availability zones **3**, paired region **East Asia**. | [S25] |
| East Asia: physical location **Hong Kong**, geography **Asia Pacific**, availability zones **3**, paired region **Southeast Asia**. | [S25] |
| The Southeast Asia / East Asia pair appears in both directions in Learn's region pair table (a symmetric pair). Asymmetric pairs are listed separately (Brazil South, West India, India South Central, West US 3) and do not include these two. | [S24] |
| Region pair benefits Learn gives: recovery sequence (one region of each pair prioritized), sequential updates, data residency within the geography. "Deploying resources to a region in a pair doesn't automatically make them more resilient, nor does it provide automatic high availability, disaster recovery capabilities, or failover." | [S24] |
| GRS "can automatically replicate data to a paired region". You can't choose your own pairs. | [S24], [S26] |
| Regions with availability zones "have at least three zones". Even in such a region, some services might not support zones. | [S26], [S25] |
| A different region exists named **Southeast Asia 3** (`southeastasia3`, Johor Bahru, Malaysia, paired with Malaysia West). It is not the same as `southeastasia`. | [S25], [S24] |
| Resource groups have a location, and resources can be in other regions. | [S2] |
| Resources that must match a location: a public IP must be in the same location as the resource it is associated with; an NSG or route table associated with a subnet must be in the same subscription and location as the VNet. | [S31], [S29], [S32] |
| Nonregional ("global" or "geographic") services are not deployed into a specific region. Learn's nonregional list includes Azure subscriptions, Azure management groups, Azure DNS private zones, Azure DNS public zones, Azure Policy, Azure Resource Graph, Azure Cloud Shell and Microsoft Entra ID. (The Global and Geographic check marks do not survive text conversion, so which kind each is could not be read.) | [S27] |
| A DNS zone resource is declared with `location: 'global'` in Learn's Bicep quickstart. | [S28] |
| Azure Resource Manager is supported in all regions, but the resources you deploy might not be supported in all regions, and subscription limitations can block some regions. Valid locations per resource type are queryable. | [S10] |

---

## 6. Deleting and dependencies

### 6.1 Resource group delete

All from [S14] unless noted:

1. To delete a resource group, first remove any underlying **resource locks and backup data**.
2. ARM orders the deletes: (1) all **child (nested)** resources; (2) resources that **manage other resources** (a resource can set `managedBy` to say a different resource manages it; "the resource that manages the other resource is deleted before the other resources"); (3) the remaining resources.
3. ARM issues a DELETE per resource and "waits for any dependencies to finish before proceeding". Success codes: 200, 204, 404 (sync), 202 (async).
4. On error, ARM retries 5xx, 429 and 408 for a default of 15 minutes. After deletion it issues GET; 404 = deleted. If GET returns 200 or 201, ARM **recreates** the resource.
5. Permission needed is only the delete action on the resource group, not on each resource.
6. The delete can fail because of a lock, an automatically placed lock from a related service, or "if the resources are connected to resources in other resource groups that aren't being deleted. For example, you can't delete a virtual network with subnets that a virtual machine uses."
7. A deleted resource group cannot be recovered. Some resource types have soft delete (Key Vault, blobs, containers, Azure Backup, VMs and others).
8. A read-only lock on source, destination group or subscription blocks moves [S49]; a lock "prevents you from deleting either resource group" during a move [S49].

### 6.2 Per-type delete blockers Learn states

| Resource | What Learn says blocks the delete | Source |
|---|---|---|
| Subnet | "You can delete a subnet only if there are no resources in the subnet." Attempts to add, change or delete a subnet fail if there are connections to: gateway connections, gateways, IPs, virtual network peerings, App Service Environment. | [S29] |
| Virtual network | "You can delete a virtual network only if there are no resources connected to it." Check **Connected devices** in the portal. | [S33] |
| NIC | "You can delete a NIC only when the NIC isn't attached to a VM." To detach, stop and deallocate the VM first; a VM must always have at least one NIC. | [S34] |
| NSG | "If an NSG is associated with any subnets or network interfaces, you can't delete it. Dissociate ... from all subnets and network interfaces." Default rules (priorities 65000, 65001, 65500) cannot be deleted. | [S30] |
| Application security group | "You can't delete an application security group if it contains any network interfaces." | [S30] |
| Route table | "You can't delete a route table associated to any subnets." A route table can be associated with zero or more subnets; association is per subnet, not per VNet. | [S32] |
| Public IP | "Deletion of public IPs requires that the public IP object isn't associated to any IP configuration or virtual machine network interface." Dissociate first (VM NIC, load balancer frontend, firewall). Deleted public IPs cannot be recovered. | [S31] |
| VNet peering | Deleting a peering from one VNet **also deletes the peering on the remote VNet** (portal note). While deleted, traffic cannot flow. | [S35] |
| Recovery Services vault | Cannot delete a vault that contains protected data sources, backup data, backup data in soft-deleted state (soft-deleted items are permanently deleted after 14 days), or registered storage accounts. | [S45] |
| Virtual machine | Deleting a VM may leave disks, NIC and public IP behind. Default: portal create wizard sets the OS disk to **Delete with VM** (cleared if you attach an existing OS disk); CLI and PowerShell default to **detach** the OS disk. "By default, disks, NICs, and Public IPs associated with a VM are persisted when the VM is deleted." Options: `--os-disk-delete-option`, `--data-disk-delete-option`, `--nic-delete-option`, portal "Delete public IP and NIC when VM is deleted". Detached resources keep billing. For Flexible scale sets the default `deleteOption` is `Delete`. | [S47] |
| Resource with a lock | `CanNotDelete` blocks delete; `ReadOnly` blocks delete and update. Locks inherit from parents; most restrictive wins. | [S46] |

### 6.3 Cross-reference with the catalog's own `examNotes`

| Catalog statement | Status |
|---|---|
| `subnet.ts`: "You cannot delete a subnet while resources, such as NICs, are still attached to it." | Consistent with [S29] (Learn says "no resources in the subnet"; "such as NICs" is the catalog's example). |
| `resource-group.ts`: "cannot rename ... cannot nest" | Consistent with [S38], [S39], [S40]. |
| `resource-group.ts`: lock on a group applies to every resource inside, most restrictive wins | Consistent with [S46]. |
| `public-ip-address.ts`: "By default, deleting a VM leaves its public IP in place. Set the delete option when you create the VM ..." | Consistent with [S47]. |
| `recovery-services-vault.ts`: vault delete blockers | Consistent with [S45] (catalog also mentions private endpoints and Site Recovery; not re-checked here). |
| `network-security-group.ts`: default rules priorities 65000/65001/65500 cannot be deleted | Consistent with [S30] (default rules cannot be deleted; priorities not re-checked). |
| `virtual-network.ts` / `subnet.ts`: Azure reserves 5 addresses (first four and last one) | Learn [S29] says the first and last address plus "three more" = 5. The "first four and the last one" split is the catalog's own phrasing. |

---

## 7. Sandbox: must model vs may skip (recommendation)

**Everything in this section is a Recommendation** (my proposal for the owner to confirm). The "Evidence" column is the Learn fact it rests on. This follows PLAN.md section 7 ("Out of scope for the simulator: real timing, cost estimation and quotas") and section 12 (honesty rule).

### 7.1 Must model

| Item | Why (evidence) |
|---|---|
| One tenant with a GUID ID and a **root management group whose ID = tenant ID**, display name "Tenant root group", cannot move or delete | [S1] |
| Management group tree: unique parent, max **6 levels below root** (excluding subscription level), MG name rule (1-90) and ID vs display name | [S1], [S6], [S7] |
| Subscriptions: GUID ID, exactly one tenant, exactly one parent (default root), **state** (Enabled, Warned, PastDue, Disabled, Deleted) with the documented allowed operations | [S3], [S4] |
| Resource groups: subscription-unique name (1-90), **location immutable**, no nesting, no rename, resources may live in other regions, delete cascades, tags not inherited | [S2], [S7], [S19], [S38], [S39] |
| ARM IDs generated and parsed per section 2, with case-insensitive comparison | [S7], [S9], [S11] |
| Name validation by type and **uniqueness scope** (section 4): global (storage account, web app), subscription (RG), RG, parent (subnet in VNet, container in storage account) | [S7] |
| `provisioningState` as a per-resource-type set, with Creating -> Succeeded and Deleting, Failed | [S15], [S16], [S18] |
| VM power state including **Stopped (allocated, billed)** vs **Stopped (deallocated, not billed)**, via start / stop / deallocate | [S16], [S21] |
| Two regions `southeastasia` and `eastasia`, each with 3 zones, paired with each other; `global` for DNS zones; RG location vs resource location | [S25], [S24], [S28] |
| Delete blockers: subnet with NICs, VNet with connected resources, NSG/route table associated, public IP associated, ASG with NICs, NIC attached to VM, vault with items | [S29], [S30], [S31], [S32], [S33], [S34], [S45] |
| RG delete: children first, then `managedBy` managers, then the rest; locks block it; cannot be recovered | [S14] |
| Locks (`CanNotDelete`, `ReadOnly`) inherited down the tree, most restrictive wins (already roadmap checkpoint 14) | [S46] |
| Resource provider registration state per subscription (**Registered**, **NotRegistered**, plus the transient **Registering**) and the two documented errors when a provider is not registered | [S10], [S37] |

### 7.2 Should model, simply

| Item | Why |
|---|---|
| Resource envelope `{id, name, type, location, tags, kind, sku, identity, managedBy, properties}` | [S13]. Keeps `az ... show`-style output faithful. |
| Resource provider registration **mostly automatic**: Learn says the portal typically registers the provider on create and ARM/Bicep deployments register the providers in the template, and some providers are registered by default. Model it as: first create of a type auto-registers, except where the catalog documents a manual step (for example the Container Apps CLI quickstarts register `Microsoft.App` and `Microsoft.OperationalInsights`, a catalog note). Register needs `/register/action` (in Contributor and Owner). Cannot unregister while resource types from it exist. | [S10], [S37] |
| A small set of **limits that change outcomes** and are cheap to enforce: 980 RGs per subscription, 800 instances of a type per RG, 50 tags per resource, tag key 512 / value 256, 5 reserved addresses per subnet, 20 management locks per scope | [S6], [S29] |
| VM cores quota: Learn says new subscriptions default to **20 cores per region** (with the note that defaults vary by offer type). Optional, but it is the most common real-world failure ("quota exceeded"). | [S6] |
| Subscription `Disabled`/`Warned` behaviour as a teaching toggle ("what can I still do?") | [S3] |

### 7.3 May skip

| Item | Why it is safe to skip |
|---|---|
| Real timing, cost estimates, spending limit and billing mechanics | PLAN.md section 7. Learn gives durations only for a few things (3.4). Billing is modelled only as a label on VM power state. |
| Most numeric limits and quotas beyond 7.2 (about 3,000 subnets per VNet, 1,000 VNets, etc.) | Not decision-making for a learner sandbox. They are in [S6] if needed later. |
| `Migrating` VM provisioning state, ASM classic resources, Cloud Services | Only for ASM-to-ARM migration [S16]. |
| `Expired` subscription state | Only on the billing states page, not in the REST enum [S3], [S4]. |
| Multiple tenants, B2B guests, subscription directory transfer, `managedByTenants` | [S5]. Keep a single-tenant world in v1. |
| Sovereign clouds, other regions, `Southeast Asia 3`, edge zones (`extendedLocation`) | [S25], [S13] |
| Region-pair behaviours such as paired-region failover and GRS secondary reads | Learn says nothing automatic happens just because regions are paired [S24]; model only that GRS names the paired region. |
| Reserved-word and trademark name blocks, Unicode/Punycode names, resource-type-specific edge rules not in the catalog | [S7] |
| Resource Graph caching delay, ARM management-group cache (30 min) | [S1] |

---

## 8. Could not verify / open points

1. **Subscription states have two Learn vocabularies.** The REST enum has 5 values (Enabled, Warned, PastDue, Disabled, Deleted) [S4]; the billing states page also describes **Expired** and names the states Active/Enabled, Past Due, etc. [S3]. Learn does not give a transition diagram, nor which states can follow which, nor whether the portal "Status" maps 1:1 to the REST `state`.
2. **No PowerState list on the REST instance-view page.** Only `PowerState/running` is shown there [S22]. The full set of codes comes from the Learn Java SDK class reference [S23]. The exact `displayStatus` strings for stopped and deallocated ("VM stopped", "VM deallocated") were not found on Learn; the only hit was a snippet of a Microsoft docs GitHub commit showing "VM deallocating" [S50], which I treat as unverified.
3. **Creation durations**: Learn gives only the few numbers in 3.4. No stated duration for VM, VNet, subnet, NSG, public IP, storage account, or Log Analytics.
4. **Resource ID case-insensitivity.** Names are documented as case-insensitive [S7], [S38]; the explicit statement for whole IDs/URIs is only from a GitHub issue comment [S51]. Learn's pages themselves mix `resourcegroups` and `resourceGroups` [S9], [S19].
5. **Child-resource ID form.** Learn's scope diagram lists "resourceType / resourceSubType1 / resourceSubType2 / resourceName" [S9] which reads as if names come last; Learn's own examples and the Bicep child page show type and name segments alternating [S9], [S12]. I used the examples.
6. **Resource group `provisioningState` values** are not enumerated on the RG REST page [S19]. `Succeeded` appears in the Learn examples I saw; `Deleting` for RGs was not verified.
7. **Naming page gaps for catalog types:** no row for Container Apps environments (`managedEnvironments`) or for the Network Watcher `NetworkWatcherRG`. The DNS zone row says "1-63 characters, 2 to 34 labels" without saying whether 63 applies per label or in total.
8. **Learn render of the naming table truncates** the VM/VMSS forbidden-character cell at the `|` character. I took the full text from the page's GitHub source [S8], which is Microsoft-owned but a `main`-branch file (may be newer than the rendered page).
9. **Which nonregional services are "global" vs "geographic"**: the check marks did not survive conversion [S27].
10. **Availability zone service support.** Learn says both regions have 3 zones [S25], but "some services might not support them in that region" [S25]; per-service zone support for those two regions (VM sizes, Bastion, Container Apps, etc.) was not checked.
11. **Management group `Service Group`**: the management group overview now has a "Service Group" column (a scope that groups resources across scope boundaries but has no inheritance) [S1]. I did not research it; it is not part of the ARM scope tree Learn describes elsewhere [S2], [S9].
12. **Quota semantics** (per region, per VM family, per offer type) are only summarised from [S6]; offer-specific defaults were not collected.
13. **Catalog statements marked "not re-checked"** in 6.3 (vault private endpoints and Site Recovery, NSG default rule priorities, "first four and last one" address split, private endpoint same-region rule, container group DNS scope) were left to the existing verification in the catalog files.
14. **Entra data not covered**: tenant limits (users, groups), tenant deletion preconditions, and directory roles. The RBAC/directory design belongs in `docs/RBAC.md`.

---

## Source index

All URLs are Microsoft-owned. Fetched 2026-10-27.

| Tag | URL |
|---|---|
| S1 | https://learn.microsoft.com/en-us/azure/governance/management-groups/overview |
| S2 | https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/overview |
| S3 | https://learn.microsoft.com/en-us/azure/cost-management-billing/manage/subscription-states |
| S4 | https://learn.microsoft.com/en-us/rest/api/resources/subscriptions/get |
| S5 | https://learn.microsoft.com/en-us/entra/fundamentals/how-subscriptions-associated-directory |
| S6 | https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/azure-subscription-service-limits |
| S7 | https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/resource-name-rules |
| S8 | https://github.com/MicrosoftDocs/azure-docs/blob/main/articles/azure-resource-manager/management/resource-name-rules.md (fetched as raw Markdown; front matter `ms.date: 08/05/2026`) |
| S9 | https://learn.microsoft.com/en-us/azure/role-based-access-control/scope-overview |
| S10 | https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/resource-providers-and-types |
| S11 | https://learn.microsoft.com/en-us/azure/azure-resource-manager/templates/template-functions-resource |
| S12 | https://learn.microsoft.com/en-us/azure/azure-resource-manager/bicep/child-resource-name-type |
| S13 | https://learn.microsoft.com/en-us/rest/api/resources/resources/get-by-id |
| S14 | https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/delete-resource-group |
| S15 | https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/async-operations |
| S16 | https://learn.microsoft.com/en-us/azure/virtual-machines/states-billing |
| S17 | https://learn.microsoft.com/en-us/rest/api/resources/deployments/get |
| S18 | https://learn.microsoft.com/en-us/rest/api/virtualnetwork/virtual-networks/get |
| S19 | https://learn.microsoft.com/en-us/rest/api/resources/resource-groups/get |
| S20 | https://learn.microsoft.com/en-us/rest/api/storagerp/storage-accounts/get-properties |
| S21 | https://learn.microsoft.com/en-us/cli/azure/vm?view=azure-cli-latest |
| S22 | https://learn.microsoft.com/en-us/rest/api/compute/virtual-machines/instance-view |
| S23 | https://learn.microsoft.com/de-ch/java/api/com.azure.resourcemanager.compute.models.powerstate?view=azure-java-stable |
| S24 | https://learn.microsoft.com/en-us/azure/reliability/regions-paired |
| S25 | https://learn.microsoft.com/en-us/azure/reliability/regions-list |
| S26 | https://learn.microsoft.com/en-us/azure/reliability/regions-overview |
| S27 | https://learn.microsoft.com/en-us/azure/reliability/regions-nonregional-services |
| S28 | https://learn.microsoft.com/en-us/azure/dns/dns-get-started-bicep |
| S29 | https://learn.microsoft.com/en-us/azure/virtual-network/virtual-network-manage-subnet |
| S30 | https://learn.microsoft.com/en-us/azure/virtual-network/manage-network-security-group |
| S31 | https://learn.microsoft.com/en-us/azure/virtual-network/ip-services/virtual-network-public-ip-address |
| S32 | https://learn.microsoft.com/en-us/azure/virtual-network/manage-route-table |
| S33 | https://learn.microsoft.com/en-us/azure/virtual-network/manage-virtual-network |
| S34 | https://learn.microsoft.com/en-us/azure/virtual-network/virtual-network-network-interface |
| S35 | https://learn.microsoft.com/en-us/azure/virtual-network/virtual-network-manage-peering |
| S36 | https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/manage-resource-groups-portal |
| S37 | https://learn.microsoft.com/en-us/azure/azure-resource-manager/troubleshooting/error-register-resource-provider |
| S38 | https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/frequently-asked-questions |
| S39 | https://learn.microsoft.com/en-us/training/modules/design-governance/5-design-for-resource-groups |
| S40 | https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/decision-guides/resource-consistency/ |
| S41 | https://learn.microsoft.com/en-us/entra/fundamentals/create-new-tenant |
| S42 | https://learn.microsoft.com/en-us/entra/fundamentals/how-to-find-tenant |
| S43 | https://learn.microsoft.com/en-us/azure/azure-resource-manager/templates/resource-declaration |
| S44 | https://learn.microsoft.com/en-us/azure/bastion/quickstart-host-portal |
| S45 | https://learn.microsoft.com/en-us/azure/backup/backup-azure-delete-vault |
| S46 | https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/lock-resources |
| S47 | https://learn.microsoft.com/en-us/azure/virtual-machines/delete |
| S48 | https://learn.microsoft.com/en-us/azure/storage/common/storage-account-create |
| S49 | https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/move-resource-group-and-subscription |
| S50 | https://github.com/MicrosoftDocs/azure-compute-docs/commit/e1ff406b7b67d2913cab6a3fa25b25d8beba7003 (weak: commit snippet, unverified) |
| S51 | https://github.com/Azure/azure-cli/issues/8283 (weak: an Azure team member's comment in a GitHub issue) |
| S52 | https://learn.microsoft.com/en-us/entra/fundamentals/whatis |
