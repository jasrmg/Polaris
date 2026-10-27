# Azure RBAC model: research for the Polaris access evaluator

**Status:** research only (no code changed). **Accessed:** 2026-10-27 (all pages fetched live on that date).
**Sources:** `learn.microsoft.com` only, plus the Microsoft-owned GitHub licence file noted in section 6.5.
**Purpose:** an exact, citable description of Azure RBAC so the sandbox can implement "can principal X do action Y on resource Z, and why?" (see `docs/PLAN.md` section 12).

Conventions: every point gives its URL. "Page date" is the `ms.date` metadata of the Learn page (the last time the page was marked reviewed), not the access date. Quotes are short and verbatim. Items marked **UNVERIFIED** are things Learn does not state or that I could not check. Short URLs omit `https://learn.microsoft.com/en-us`.

Page dates used (from the `ms.date` meta tag):

| Page | Page date |
|---|---|
| `/azure/role-based-access-control/overview` | 2024-03-12 |
| `/azure/role-based-access-control/role-definitions` | 2025-03-30 |
| `/azure/role-based-access-control/custom-roles` | 2025-10-23 |
| `/azure/role-based-access-control/role-assignments-steps` | 2025-10-15 |
| `/azure/role-based-access-control/troubleshoot-limits` | 2025-10-15 |
| `/azure/role-based-access-control/deny-assignments` | 2026-10-06 |
| `/azure/role-based-access-control/conditions-overview` | 2025-05-19 |
| `/azure/role-based-access-control/rbac-and-directory-admin-roles` | 2026-05-06 |
| `/azure/role-based-access-control/elevate-access-global-admin` | 2025-03-10 |
| `/azure/role-based-access-control/built-in-roles` | 2026-09-10 |
| `/azure/role-based-access-control/built-in-roles/<category>` (e.g. privileged) | 2026-07-01 |
| `/azure/role-based-access-control/resource-provider-operations` | 2026-07-01 |
| `/azure/azure-resource-manager/management/azure-subscription-service-limits` | 2026-08-04 |
| `/rest/api/authorization/*` (API version 2022-04-01) | 2024-05-07 |

---

## 1. Role definition structure

### 1.1 Properties

Source: `/azure/role-based-access-control/role-definitions` (page date 2025-03-30).

> "A role definition is a collection of permissions. It's sometimes just called a role."

The same data has two shapes, depending on the tool. PowerShell uses PascalCase and a flat shape; CLI and REST use camelCase and put the four action arrays inside a `permissions[]` array.

| PowerShell | CLI / REST | Meaning (Learn wording) |
|---|---|---|
| `Name` | `roleName` | "Display name of the role." |
| `Id` | `name` | "Unique ID of the role. Built-in roles have the same role ID across clouds." |
| (none) | `id` | "Fully qualified unique ID of the role. Even if the role is renamed, the role ID does not change." |
| `IsCustom` | `roleType` | "Set to true or CustomRole for custom roles. Set to false or BuiltInRole for built-in roles." |
| (none) | `type` | "Set to Microsoft.Authorization/roleDefinitions." |
| `Description` | `description` | "Description of the role." |
| `Actions` | `actions` | "control plane actions that the role allows to be performed" |
| `NotActions` | `notActions` | "control plane actions that are excluded from the allowed Actions" |
| `DataActions` | `dataActions` | "data plane actions that the role allows" |
| `NotDataActions` | `notDataActions` | "data plane actions that are excluded from the allowed DataActions" |
| `AssignableScopes` | `assignableScopes` | "the scopes that the role is available for assignment" |
| `Condition` | `condition` | "For built-in roles, condition statement based on one or more actions in role definition." |
| `ConditionVersion` | `conditionVersion` | "Condition version number. Defaults to 2.0 and is the only supported version." |
| (none) | `createdOn`, `updatedOn`, `createdBy`, `updatedBy` | Audit fields. `createdBy`/`updatedBy` are for custom roles. |

Implementation note (verified against the live per-category pages, section 6.1): in the published built-in JSON, `condition` and `conditionVersion` sit **inside each `permissions[]` entry**, not at the top level. 17 of 504 roles have them. Eight roles have two `permissions[]` entries (see 6.1), so an evaluator must iterate over `permissions[]` and union the entries, not read `permissions[0]`.

### 1.2 Operation string format

Same page.

> `{Company}.{ProviderName}/{resourceType}/{action}`

Learn describes the last segment: `*` ("grants access to all actions that match the string"), `read` (GET), `write` (PUT or PATCH), `action` ("custom actions like restart virtual machines (POST)"), `delete` (DELETE). Child resource types add segments, e.g. `Microsoft.Storage/storageAccounts/blobServices/containers/blobs/read`.

### 1.3 Wildcards

Sources: `/azure/role-based-access-control/role-definitions` (examples table) and `/azure/role-based-access-control/custom-roles` (page date 2025-10-23).

Learn's examples, verbatim:

| String | Learn's description |
|---|---|
| `*/read` | "Grants access to read actions for all resource types of all Azure resource providers." |
| `Microsoft.Compute/*` | "Grants access to all actions for all resource types in the Microsoft.Compute resource provider." |
| `Microsoft.Network/*/read` | "Grants access to read actions for all resource types in the Microsoft.Network resource provider." |
| `Microsoft.Compute/virtualMachines/*` | "Grants access to all actions of virtual machines and its child resource types." |
| `microsoft.web/sites/restart/Action` | "Grants access to restart a web app." |

Rules stated on `custom-roles`:

- "Actions, NotActions, DataActions, and NotDataActions support wildcards (*) to define permissions. A wildcard (*) extends a permission to everything that matches the action string you provide."
- Example: `Microsoft.CostManagement/exports/*` is "equivalent to" `.../exports/action`, `/read`, `/write`, `/delete`, `/run/action`, "This would also include any future export permissions that might be added."
- "You can have only one wildcard in an action string." (listed under "Custom role limits"). I scanned all 504 built-in role JSON blocks: none has more than one `*` in a string, so the single-wildcard model fits every built-in role too.

What can be derived from Learn's examples (an implementation inference, not an official grammar):

- `*` matches any characters, **including `/`** (because `Microsoft.Compute/virtualMachines/*` covers "child resource types", and `*/read` covers all providers).
- A leading `*` (`*/read`) and a mid-string `*` (`Microsoft.Authorization/*/Write` in Contributor) both occur in built-in roles.
- The Contributor role denies write by `Microsoft.Authorization/*/Write`, which matches `Microsoft.Authorization/roleAssignments/write`. This works only if matching is case-insensitive (see next).

**UNVERIFIED:** Learn gives no formal grammar for wildcard matching (for example, whether `Microsoft.Compute/*/read` must match at least one segment, or how a `*` in the middle matches multiple segments). The glob-style interpretation above is the simplest model consistent with all documented examples.

### 1.4 Case sensitivity

Source: `/azure/role-based-access-control/custom-roles`.

> "Permission strings are case-insensitive. When you create your custom roles, the convention is to match the case that you see for permissions in Azure resource provider operations."

Evidence of mixed case in the official data: Contributor's notActions use `Microsoft.Authorization/*/Delete` and `/*/Write`, while role-definitions uses `microsoft.web/sites/restart/Action`, and the permissions page lists both `microsoft.app/register/action` and `Microsoft.App/agents/read` (`/azure/role-based-access-control/permissions/compute`). **Evaluator: compare action strings case-insensitively** (lower-case at import and at query). Learn does not state case rules for scope strings, role names or role assignment names (scope comparison: **UNVERIFIED**; treat resource IDs case-insensitively, as ARM does, but say so as an assumption).

### 1.5 Example JSON from Learn

Two flavours exist. The `role-definitions` page shows Contributor in PowerShell and CLI shape, but that example is **stale**: it lists 8 `NotActions`. The live Contributor page (`/azure/role-based-access-control/built-in-roles/privileged`, page date 2026-07-01) lists 11 (adds `Microsoft.Resources/deploymentStacks/manageDenySetting/action`, `Microsoft.Subscription/cancel/action`, `Microsoft.Subscription/enable/action`). **Use the per-category pages as the source of truth, not the explanatory page.**

Built-in role JSON as published on `/azure/role-based-access-control/built-in-roles/privileged` and `/general` (REST/CLI shape, exact content, extracted 2026-10-27):

```json
{
  "assignableScopes": ["/"],
  "description": "Grants full access to manage all resources, but does not allow you to assign roles in Azure RBAC, manage assignments in Azure Blueprints, or share image galleries.",
  "id": "/providers/Microsoft.Authorization/roleDefinitions/b24988ac-6180-42a0-ab88-20f7382dd24c",
  "name": "b24988ac-6180-42a0-ab88-20f7382dd24c",
  "permissions": [{
    "actions": ["*"],
    "notActions": [
      "Microsoft.Authorization/*/Delete",
      "Microsoft.Authorization/*/Write",
      "Microsoft.Authorization/elevateAccess/Action",
      "Microsoft.Blueprint/blueprintAssignments/write",
      "Microsoft.Blueprint/blueprintAssignments/delete",
      "Microsoft.Compute/galleries/share/action",
      "Microsoft.Purview/consents/write",
      "Microsoft.Purview/consents/delete",
      "Microsoft.Resources/deploymentStacks/manageDenySetting/action",
      "Microsoft.Subscription/cancel/action",
      "Microsoft.Subscription/enable/action"
    ],
    "dataActions": [],
    "notDataActions": []
  }],
  "roleName": "Contributor",
  "roleType": "BuiltInRole",
  "type": "Microsoft.Authorization/roleDefinitions"
}
```

The other three, same shape (only the differing fields shown):

| Role | `name` (ID) | `permissions[0]` |
|---|---|---|
| Owner | `8e3af657-a8ff-443c-a75c-2fe8c4bcb635` | `actions: ["*"]`, everything else empty. Description: "Grants full access to manage all resources, including the ability to assign roles in Azure RBAC." |
| Reader | `acdd72a7-3385-48ef-bd42-f606fba81ae7` | `actions: ["*/read"]`, everything else empty. Description: "View all resources, but does not allow you to make any changes." |
| User Access Administrator | `18d7d88d-d35e-4fb5-a5c3-7773c20a72d9` | `actions: ["*/read", "Microsoft.Authorization/*", "Microsoft.Support/*"]`. Description: "Lets you manage user access to Azure resources." |
| Role Based Access Control Administrator | `f58310d9-a9f6-439a-9e8d-f62e7b41a168` | `actions: ["Microsoft.Authorization/roleAssignments/write", "Microsoft.Authorization/roleAssignments/delete", "*/read", "Microsoft.Support/*"]` |

The explanatory page also shows Storage Blob Data Reader with both `actions` (`.../containers/read`, `.../blobServices/generateUserDelegationKey/action`) and `dataActions` (`.../containers/blobs/read`), useful as a test fixture (`/azure/role-based-access-control/role-definitions`).

---

## 2. How Azure RBAC determines access

### 2.1 The official evaluation steps

Source: `/azure/role-based-access-control/overview`, section "How Azure RBAC determines if a user has access to a resource" (page date 2024-03-12). Learn says the steps "apply to Azure Resource Manager or data plane services integrated with Azure RBAC".

1. "A user (or service principal) acquires a token for Azure Resource Manager."
2. "The token includes the user's group memberships (including transitive group memberships)."
3. The user makes a REST call to ARM with the token.
4. "Azure Resource Manager retrieves all the role assignments and deny assignments that apply to the resource upon which the action is being taken."
5. "If a deny assignment applies, access is blocked. Otherwise, evaluation continues."
6. ARM narrows the role assignments to this user or their groups and determines which roles they have for this resource.
7. ARM checks whether the action is in those roles. "If the roles include Actions that have a wildcard (*), the effective permissions are computed by subtracting the NotActions from the allowed Actions. Similarly, the same subtraction is done for any data actions."
   - `Actions - NotActions = Effective management permissions`
   - `DataActions - NotDataActions = Effective data permissions`
8. "If the user doesn't have a role with the action at the requested scope, access isn't allowed. Otherwise, any conditions are evaluated."
9. "If the role assignment includes conditions, they're evaluated. Otherwise access is allowed." If conditions are met, access is allowed; otherwise not.

### 2.2 Flow in text form (for the evaluator)

```
input: principal P, action A (control-plane OR data-plane), target scope S (resource ID), optional request context
1. groups(P) = transitive group memberships of P (Learn: "transitive")
2. deny = every deny assignment at S or inherited from an ancestor scope
          (a deny with DoNotApplyToChildScopes=true does NOT apply below its own scope)
   for each deny d in deny:
      if P (or a group of P) matches d.Principals and not d.ExcludePrincipals,
         and A matches d.Actions (or d.DataActions) and not d.NotActions (or d.NotDataActions):
         -> DENIED (reason: deny assignment d)
3. assignments = role assignments at S or any ancestor scope
                 (MG -> subscription -> resource group -> resource)
                 whose principal is P or a group of P
4. for each assignment a with role R:
      for each permissions[] entry p of R:
         allowed = matches(A, p.actions or p.dataActions) AND NOT matches(A, p.notActions or p.notDataActions)
         if allowed:
             if p.condition or a.condition: evaluate (ABAC); if false, this assignment grants nothing
             if still allowed: record a as a granting assignment
5. if any granting assignment recorded -> ALLOWED (reasons: all granting assignments)
   else -> DENIED (reason: no role assignment grants A at S)
```

Points that Learn states explicitly and that the above relies on:

- **Additive model.** "Azure RBAC is an additive model, so your effective permissions are the sum of your role assignments." Example: Contributor at subscription plus Reader on a resource group = effectively Contributor; "the Reader role assignment has no impact." Source: `/azure/role-based-access-control/overview`.
- **NotActions is per role, not a deny.** > "NotActions is not a deny rule – it is simply a convenient way to create a set of allowed actions when specific actions need to be excluded." and "If a user is assigned a role that excludes an action in NotActions, and is assigned a second role that grants access to the same action, the user is allowed to perform that action." Same for NotDataActions. Source: `/azure/role-based-access-control/role-definitions`. So subtraction happens **inside one role definition**, then results are unioned across assignments. This is an implementable rule with no ambiguity.
- **Scope inheritance.** "Scopes are structured in a parent-child relationship... Lower levels inherit role permissions from higher levels." Four levels: management group, subscription, resource group, resource. Sources: `/azure/role-based-access-control/scope-overview` (page date 2025-03-30), `/azure/role-based-access-control/role-assignments-steps`. Scope string formats are in `scope-overview` (e.g. `/providers/Microsoft.Management/managementGroups/{name}`, `/subscriptions/{id}`, `/subscriptions/{id}/resourceGroups/{rg}`, `/subscriptions/{id}/resourceGroups/{rg}/providers/{provider}/{type}/{name}`).
- **Group transitivity.** "Role assignments are transitive for groups, which means that if a user is a member of a group and that group is a member of another group that has a role assignment, the user has the permissions in the role assignment." Source: `/azure/role-based-access-control/overview`.

### 2.3 Control plane vs data plane

Source: `/azure/role-based-access-control/role-definitions`.

- Control-plane actions are in `Actions`/`NotActions`; data-plane in `DataActions`/`NotDataActions`.
- "Control plane access is not inherited to your data plane provided that the container authentication method is set to Microsoft Entra User Account and not Access Key. This separation prevents roles with wildcards (*) from having unrestricted access to your data."
- Owner (`*`) at subscription: can read/write/delete containers, but "by default, Alice cannot read the blobs inside a container" (needs keys). `*` in `Actions` does not match anything in `DataActions`.
- "Only data plane actions can be added to the DataActions and NotDataActions properties. Resource providers identify which actions are data actions, by setting the isDataAction property to true."
- "Authorization for all control plane API calls is handled by Azure Resource Manager. Authorization for data plane API calls is handled by either a resource provider or Azure Resource Manager."

For the sandbox this means: keep two independent evaluations (control and data) over the same assignments, and mark each operation in the operation dataset with `isDataAction`. The caveat that data access via access keys bypasses RBAC is documented but is a per-service behaviour (flag as out of scope for v1).

### 2.4 Deny assignments

Source: `/azure/role-based-access-control/deny-assignments` (page date 2026-10-06).

- "Similar to a role assignment, a deny assignment attaches a set of deny actions to a user, group, or service principal at a particular scope for the purpose of denying access. Deny assignments block users from performing specific Azure resource actions even if a role assignment grants them access."
- **Who creates them:** "For generally available scenarios, Azure creates and manages deny assignments to protect resources. You can specify deny settings when creating a deployment stack, which creates a deny assignment that the deployment stack resources own." And: "You can't directly create your own deny assignments." "Customer-managed deny assignments are currently in private preview." The comparison table shows "Can be directly created" is a role-assignment capability only.
- **Managed applications** (`/azure/azure-resource-manager/managed-applications/overview`): in the default "Publisher managed" mode, "Customer access to the managed resource group is restricted by a deny assignment." Other modes remove the deny assignment.
- **Azure Blueprints:** the user's brief names Blueprints as a creator. The current `deny-assignments` page does **not** name Blueprints (it names deployment stacks). The Azure Blueprints Learn page (`/azure/governance/blueprints/overview`) says: "Azure Blueprints (Preview) will be retired on January 31, 2027, with a phased retirement beginning July 31, 2026." I did not find a current Learn statement that Blueprints creates deny assignments in the pages I fetched; treat as **UNVERIFIED** and do not model it.
- **Properties:** `DenyAssignmentName`, `Description`, `Permissions.Actions`/`NotActions`/`DataActions`/`NotDataActions` ("At least one Actions or one DataActions"), `Scope`, `DoNotApplyToChildScopes` (default false), `Principals[i].Id/Type`, `ExcludePrincipals[i].Id/Type`, `IsSystemProtected` ("Currently, all deny assignments are system protected").
- **All Principals:** a system-defined principal with the zero GUID `00000000-0000-0000-0000-000000000000` and type `SystemDefined`; it "can be used only in Principals and cannot be used in ExcludePrincipals", and can be combined with `ExcludePrincipals` to deny everyone but some principals.
- Compared with role assignments, deny assignments can "Exclude principals", "Prevent inheritance to child scopes" and "Apply to classic subscription administrator assignments" (the page's comparison table; the classic-administrator row is now moot, see 5.3).
- Example from the page: a deployment stack deny assignment with `Actions: {*/delete}`, `NotActions: {Microsoft.Authorization/locks/delete, Microsoft.Storage/storageAccounts/delete}`, `DoNotApplyToChildScopes: True`, `Principals: All Principals`, `ExcludePrincipals: User1`.
- **Limit:** "Number of system-managed deny assignments per Azure subscription: 2,000" (`/azure/azure-resource-manager/management/azure-subscription-service-limits`, section "Azure RBAC limits", page date 2026-08-04).
- Deployment stack roles that control deny settings (`/azure/azure-resource-manager/bicep/deployment-stacks`): "Azure Deployment Stack Contributor: Users can manage deployment stacks, but can't create or delete deny-assignments within the deployment stacks"; "Azure Deployment Stack Owner: ... including those users with deny-assignments."

### 2.5 Role assignment conditions (ABAC)

Source: `/azure/role-based-access-control/conditions-overview` (page date 2025-05-19).

- "A role assignment condition is an additional check that you can optionally add to your role assignment to provide more fine-grained access control. A condition filters down permissions granted as a part of the role definition and role assignment." "You cannot explicitly deny access to specific resources using conditions."
- Scope of support (as of that page): "Currently, conditions can be added to built-in or custom role assignments that have blob storage or queue storage data actions." Conditions are "added at the same scope as the role assignment" and need `Microsoft.Authorization/roleAssignments/write`.
- Attributes (blob storage): account name, blob index tags, blob path, blob prefix, container name, encryption scope name, is current version, hierarchical namespace, is private link, snapshot, UTC now, version ID.
- Condition syntax example from the page: `ActionMatches{...}`, `SubOperationMatches{...}`, `@Resource[...:Project<$key_case_sensitive$>] StringEqualsIgnoreCase 'Cascade'`, with `AND`, `OR`, `!`/`NOT`.
- REST: `properties.condition` and `properties.conditionVersion` ("Currently the only accepted value is '2.0'") on role assignment create (`/rest/api/authorization/role-assignments/create`, API 2022-04-01).
- Limit: "Size of condition for Azure role assignments: 8 KB" (limits page).
- **Delegation with conditions** (`/azure/role-based-access-control/delegate-role-assignments-overview`, page date 2026-03-30): constrained delegation can restrict "the roles that Dara can assign", "the principals that Dara can assign roles to", and "the role assignments Dara can remove". Several built-in roles (for example Virtual Machine Data Access Administrator (preview)) carry a role-definition condition that constrains role assignments (see 6.1).

**Complexity flag:** HIGH. The condition language has its own grammar (functions, operators, `@Request`, `@Resource`, `@Environment`, `@Principal` attribute sources), the evaluation needs request and resource attributes that the sandbox mostly does not model (blob tags, paths, private link), and the semantics for actions that "don't match" the condition (the `!(ActionMatches{...}) OR (...)` pattern) matter. I did not fetch the condition-format page (`/azure/role-based-access-control/conditions-format`), so the grammar is **UNVERIFIED** here.

---

## 3. Role assignment structure and rules

### 3.1 Structure

- "A role assignment consists of three elements: security principal, role definition, and scope." (`/azure/role-based-access-control/overview`)
- Assignment name is a GUID: "The name of the role assignment. It can be any valid GUID." (`/rest/api/authorization/role-assignments/create`, PUT `{scope}/providers/Microsoft.Authorization/roleAssignments/{roleAssignmentName}?api-version=2022-04-01`; also `/azure/role-based-access-control/role-assignments-rest`, which says to "use a GUID tool to generate a unique identifier".)
- Required body fields: `properties.principalId`, `properties.roleDefinitionId`. Optional: `properties.principalType`, `properties.condition`, `properties.conditionVersion`, `properties.delegatedManagedIdentityResourceId`, `properties.description`.
- Principal types as the Learn concept pages list them (`/azure/role-based-access-control/role-assignments-steps`): User, Group, Service principal, Managed identity ("a security principal").
- `principalType` enum in the REST reference (2022-04-01 page): `User`, `Group`, `ServicePrincipal`, `ForeignGroup`, `Device`, plus two newer values on the live page: `AgentUser` ("Agent identity derived from a user") and `AgentServicePrincipal` ("Agent identity derived from a service principal"). There is **no** `ManagedIdentity` enum value in this API; a managed identity is represented as a service principal (**inference**; Learn's REST page does not say it in so many words). Learn does not define `ForeignGroup` or `Device` beyond the name (**UNVERIFIED** semantics).
- The REST `role-assignments-rest` page says to set `principalType` to `ServicePrincipal` (with api-version `2018-09-01-preview` or later; "2022-04-01 is the first stable version") when a new service principal may not have replicated yet. Replication lag is a real-Azure behaviour the sandbox can ignore.
- Assignment of a role to a group applies to all members (`role-assignments-steps`).
- Scope of role to scope: a custom role can only be assigned inside its `assignableScopes`; built-in roles are assignable everywhere ("/") except the few with other scopes (6.1).
- Role assignments are "global": "Role definitions, role assignments, and deny assignments are stored globally" (`/azure/role-based-access-control/overview`). Not region-bound, so no region modelling is needed.

### 3.2 Limits (stated by Learn, as of 2026-10-27)

| Limit | Value | Source and page date |
|---|---|---|
| Role assignments per subscription | 5,000 ("fixed and cannot be increased"; includes subscription, resource group and resource scopes, **not** management group scope; "Eligible role assignments and role assignments scheduled in the future do not count") | `/azure/role-based-access-control/troubleshoot-limits` (2025-10-15), `role-assignments-steps` (2025-10-15), limits page (2026-08-04) |
| Role assignments per management group | 500 ("fixed and cannot be increased") | same |
| Description of a role assignment | recommended max 512 chars, max 2,048 | limits page (2026-08-04) |
| Condition size | 8 KB | limits page |
| Custom roles per tenant | 5,000 (2,000 for Azure operated by 21Vianet) | `custom-roles`, limits page |
| Custom role name | recommended max 256, max 512 chars | `custom-roles`, limits page |
| Custom role description | recommended max 512, max 2,048 chars | same |
| Size of a custom role definition | 1 MB | limits page |
| `AssignableScopes` entries per custom role | 2,000 | `custom-roles`, limits page |
| Management group entries in `AssignableScopes` | 1 | `role-definitions`, `custom-roles`, limits page |
| System-managed deny assignments per subscription | 2,000 | limits page |
| Co-administrators per subscription (classic, retired) | 200 | `rbac-and-directory-admin-roles` |
| Subscription owners (recommendation, not a limit) | "a maximum of 3" | `/azure/role-based-access-control/best-practices` (2025-03-30) |

### 3.3 Who can assign roles

- "To assign roles, you must be signed in with a user that is assigned a role that has role assignments write permission, such as Role Based Access Control Administrator at the scope you are trying to assign the role. Similarly, to remove a role assignment, you must have the role assignments delete permission." The two actions: `Microsoft.Authorization/roleAssignments/write` and `Microsoft.Authorization/roleAssignments/delete`. Error text: "does not have authorization to perform action 'Microsoft.Authorization/roleAssignments/write'." (`/azure/role-based-access-control/role-assignments-steps`)
- Built-in roles that can: Owner; User Access Administrator ("Assign themselves or others the Owner role"); Role Based Access Control Administrator ("Assign themselves or others the Owner role", "Can't manage access using other ways, such as Azure Policy"); Reservations Administrator (reservations only). Contributor "Can't assign roles in Azure RBAC" because its `NotActions` remove `Microsoft.Authorization/*/Write` (and `/Delete`). Sources: `role-assignments-steps`, `rbac-and-directory-admin-roles`, and the privileged page JSON.
- The write check is at the **scope of the assignment** (the evaluator treats `roleAssignments/write` as an ordinary action on the target scope).
- Privileged administrator definition: a role is privileged if it includes `*`, `*/delete`, `*/write`, `Microsoft.Authorization/denyAssignments/{write,delete}`, `Microsoft.Authorization/roleAssignments/{write,delete}`, or `Microsoft.Authorization/roleDefinitions/{write,delete}` (`/azure/role-based-access-control/role-definitions`, section "Privileged administrator role definition"). Useful for a UI "privileged" badge.

### 3.4 Privilege escalation notes (documented)

- `/azure/role-based-access-control/delegate-role-assignments-overview`: with Owner or User Access Administrator, a delegate "can assign any role to any user within their scope, including themselves" and "can assign the Owner or User Access Administrator roles to another user, who can then assign roles to other users."
- `best-practices`: "If you are assigning a role with permission to create role assignments, consider adding a condition to constrain the role assignment." Also "If you must assign a privileged administrator role, use a narrow scope."
- The Contributor `NotActions` entry `Microsoft.Authorization/elevateAccess/Action` is described on the privileged page as "Grants the caller User Access Administrator access at the tenant scope". See section 5.2.

### 3.5 PIM / eligible assignments

Learn frames PIM only lightly in the core RBAC pages: `best-practices` says "PIM helps protect privileged accounts by providing just-in-time privileged access to Microsoft Entra ID and Azure resources. Access can be time bound after which privileges are revoked automatically." `role-assignments-steps` and `troubleshoot-limits` state "Eligible role assignments and role assignments scheduled in the future do not count towards this limit." Eligible assignments live in PIM, separate from the Azure RBAC role assignment list (`troubleshoot-limits`: the Resource Graph query "checks active role assignments and doesn't consider eligible role assignments in Microsoft Entra Privileged Identity Management"). Activation workflows, approval and time bounds are **not** described on these pages; **UNVERIFIED** and out of scope for v1.

---

## 4. Custom roles

Source: `/azure/role-based-access-control/custom-roles` (page date 2025-10-23), plus `/azure/role-based-access-control/role-definitions`. Limits and who-can-do-what below are as stated.

- Assignable "at management group, subscription, and resource group scopes" (the intro says so; resource-scope assignment of a custom role works if the role's AssignableScopes include a parent).
- "Custom roles can be shared between subscriptions that trust the same Microsoft Entra tenant."
- **Required properties:** Name, Id (auto-generated by CLI/PowerShell), IsCustom, Description, Actions, AssignableScopes. Optional: NotActions, DataActions, NotDataActions.
- **Rules / restrictions (verbatim list under "Custom role limits"):**
  - "Each tenant can have up to 5000 custom roles." (2,000 for 21Vianet.)
  - "You cannot set AssignableScopes to the root scope ("/")."
  - "You cannot use wildcards (*) in AssignableScopes."
  - "You can have only one wildcard in an action string."
  - "You can define only one management group in AssignableScopes of a custom role."
  - "Azure Resource Manager doesn't validate the management group's existence in the role definition's AssignableScopes."
  - "Custom roles with DataActions can't be assigned at the management group scope." (A role with DataActions and one management group in `AssignableScopes` can be created; it can be assigned at subscriptions inside that group.)
  - `Name` "must be unique at the scope of the Microsoft Entra tenant".
- **What can't go in a custom role:** `DataActions`/`NotDataActions` accept only actions flagged `isDataAction` ("Only data plane actions can be added to the DataActions and NotDataActions properties"). Learn's page does **not** give a general blocklist of control-plane actions. (Observation, not a Learn claim: the role-assignment conditions page lists "Currently, conditions can be added to ... blob storage or queue storage data actions", which restricts where a condition applies.)
- **Who can create/update/delete:** needs `Microsoft.Authorization/roleDefinitions/write` "on all the AssignableScopes of the custom role" (Owners and User Access Administrators of those scopes). View needs `roleDefinitions/read`. "All built-in roles allow custom roles to be available for assignment."
- **Deleting:** "Before you can delete a custom role, you must remove any role assignments that use the custom role." Error `RoleDefinitionHasAssignments`.
- **Resource-scope AssignableScopes:** "possible ... using the command line, it's not recommended" because of the 5,000 limit (`role-definitions`).
- **Recommendation to avoid wildcards** in custom roles: `custom-roles` and `best-practices`.
- Example custom role JSON, "Virtual Machine Operator" (id `88888888-8888-8888-8888-888888888888`), is on the `custom-roles` page; its `AssignableScopes` mix subscriptions and one management group.
- Built-in role changes: a role's ID never changes even if renamed (`role-definitions`), and "preview" roles get renamed on GA (`best-practices`). Key by ID.

---

## 5. Azure roles vs Microsoft Entra roles

### 5.1 The distinction

Source: `/azure/role-based-access-control/rbac-and-directory-admin-roles` (page date 2026-05-06).

- "At a high level, Azure roles control permissions to manage Azure resources, while Microsoft Entra roles control permissions to manage Microsoft Entra resources."
- Comparison table: Azure roles: "Manage access to Azure resources", "Scope can be specified at multiple levels (management group, subscription, resource group, resource)". Entra roles: "Manage access to Microsoft Entra resources", scope "at the tenant level (organization-wide), administrative unit, or on an individual object". Both support custom roles.
- "By default, Azure roles and Microsoft Entra roles don't span Azure and Microsoft Entra ID." Global Administrator, for example, "doesn't have access to Azure resources" by default.
- Same text on the elevate page: "Microsoft Entra role assignments do not grant access to Azure resources, and Azure role assignments do not grant access to Microsoft Entra ID." (`/azure/role-based-access-control/elevate-access-global-admin`, page date 2025-03-10; the page's metadata was updated 2026-04-22.)
- Examples of Entra roles on that page: Global Administrator ("Manage access to all administrative features in Microsoft Entra ID", "Assign administrator roles to others", "Reset the password for any user and all other administrators"), User Administrator, Billing Administrator. Full list: Microsoft Entra permissions reference (`/entra/identity/role-based-access-control/permissions-reference`, linked from the built-in roles page; not fetched in full).
- The five fundamental Azure roles on that page: Owner, Contributor, Reader, Role Based Access Control Administrator, User Access Administrator. (The page says "Azure RBAC includes over 100 built-in roles", which is **stale**: see 6.1 for 505.)

### 5.2 Elevate access (Global Administrator to User Access Administrator at root)

Source: `/azure/role-based-access-control/elevate-access-global-admin`.

- "When you elevate your access, you are assigned the User Access Administrator role in Azure at root scope (/). This allows you to view all resources and assign access in any subscription or management group in the tenant."
- Portal: Microsoft Entra ID > Manage > Properties > "Access management for Azure resources" toggle = Yes. "This toggle is only available to users who are assigned the Global Administrator role in Microsoft Entra ID."
- "This setting is not a global property and applies only to the currently signed in user. You can't elevate access for all members of the Global Administrator role."
- The assignment is removed by setting the toggle to No (or via PowerShell, CLI, REST). "You should remove this elevated access once you have made the changes you need to make at root scope."
- Privileged Identity Management: activating Global Administrator first, and "deactivating your role assignment does not change the Access management for Azure resources toggle to No".
- REST: `Microsoft.Authorization/elevateAccess/Action` is the action (it is in Contributor's NotActions).
- **Sandbox modelling:** a directory-role flag "Global Administrator" plus a button "elevate access" that creates a role assignment (UAA at `/`, principal = that user). The root scope `/` is a **scope above all management groups**; the root management group is the tenant root group (`/providers/Microsoft.Management/managementGroups/{tenantId}`: **UNVERIFIED** from these pages; the elevate page speaks of "root scope (/)").

### 5.3 Classic administrators

`/azure/role-based-access-control/rbac-and-directory-admin-roles`: "As of August 31, 2024, Azure classic administrator roles ... are retired and no longer supported. Starting in December 2025, Azure automatically assigned the Owner role at subscription scope to users in the public cloud who were still assigned the Co-Administrator or Service Administrator role. As of May 2026, classic administrator roles are fully retired and you must assign roles in Azure role-based access control (RBAC) to manage access." Do **not** model Account Administrator, Service Administrator or Co-Administrator.

---

## 6. Source for the built-in roles dataset

### 6.1 (a) Built-in roles reference and per-category pages: BEST IMPORT SOURCE

- Index: https://learn.microsoft.com/azure/role-based-access-control/built-in-roles. It is a table per category (Role name, Description, ID). Learn says "Click the role name to see the list of Actions, NotActions, DataActions, and NotDataActions for each role."
- Each role name links to a per-category page: `/azure/role-based-access-control/built-in-roles/<category>` where category is one of: `privileged`, `general`, `compute`, `networking`, `storage`, `web-and-mobile`, `containers`, `databases`, `analytics`, `ai-machine-learning`, `internet-of-things`, `integration`, `identity`, `security`, `devops`, `migration`, `monitor`, `management-and-governance`, `hybrid-multicloud` (19 pages, all fetched, HTTP 200). Page metadata: `ms.topic: generated-reference`, `ms.custom: generated` (the pages are generated from a data source, so format is regular).
- **Machine readability:** each role has a human table (Actions, NotActions, DataActions, NotDataActions with descriptions) **and a `<pre>` code block containing the full role definition as JSON** (REST/CLI shape: `assignableScopes`, `description`, `id`, `name`, `permissions[]`, `roleName`, `roleType`, `type`). I parsed all 19 pages with a script: every `<pre>` block parsed as valid JSON. There is no official downloadable `.json` file on Learn for this set; a build script would fetch the 19 HTML pages and extract the `<pre>` JSON (or, alternatively, read the same Markdown from the public docs repo, see 6.5). This is an HTML-scrape of official content, not a stable API: **expect to re-run and diff.**
- **Count (how counted):**
  - Method: fetched https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles on 2026-10-27, split the HTML by its `<h2>` category headings, counted `<tr>` rows whose third cell is a GUID (excluding header rows).
  - Result: **505 rows, 505 unique role IDs** (no duplicates). By category: Privileged 5, General 1, Compute 40, Networking 14, Storage 49, Web and mobile 24, Containers 78, Databases 15, Analytics 11, AI and machine learning 43, Internet of things 23, Integration 60, Identity 4, Security 27, DevOps 23, Migration 7, Monitor 19, Management and governance 49, Hybrid and multicloud 13.
  - The 19 per-category pages hold **504 role JSON blocks**. The one row without JSON on the per-category pages is **Monitored Objects Contributor** (`56be40e2-4db1-4ccf-93c3-7e44c597135b`); its table link points to a Azure Monitor agent page (`/azure/azure-monitor/agents/azure-monitor-agent-windows-client`), not a per-category role section. Its definition must be fetched from another source (6.4) or hand-added.
  - So: **505 listed built-in roles, 504 with importable JSON**. Note that `PLAN.md` section 12 says "roughly 500", which is consistent.
- Data observations from the 504 JSON blocks (useful for schema design):
  - `roleType` is always `BuiltInRole`.
  - `assignableScopes`: 499 roles use `["/"]`; 3 use `["/providers/Microsoft.Management/serviceGroups"]` (Service Group Administrator, Contributor, Reader) and 2 use `["/providers/Microsoft.Capacity"]` (Reservations Administrator, Reservations Reader). Reservation roles are the ones Learn lists as privileged "Manage all the reservations in a tenant". Service groups are a scope type the plan does not model.
  - 8 roles have 2 `permissions[]` entries (Azure Container Storage Contributor/Owner, Service Group Administrator, Azure Migrate Execute Expert/Owner, Azure Local Migrate Execute Expert/Owner, Storage Actions Task Assignment Contributor).
  - 17 roles have a `condition` (with `conditionVersion: "2.0"`) inside a `permissions[]` entry, e.g. Foundry Account Owner, Foundry Owner, Foundry Project Manager, Virtual Machine Data Access Administrator (preview), Azure Container Storage Contributor.
  - 197 roles have non-empty `dataActions`.
  - Total size of the 504 JSON blocks: about 0.6 MB uncompressed.
- Roles flagged as preview carry "(preview)" in their name; roles get renamed at GA (`best-practices`), so key on ID.

### 6.2 (b) "Azure permissions" pages (permissions per resource provider)

- URL pattern: `/azure/role-based-access-control/permissions/<category>`, e.g. `/permissions/compute` (page date 2026-07-01), reached from https://learn.microsoft.com/azure/role-based-access-control/resource-provider-operations. They list, per resource provider, the **operations** (Action and Description columns, plus separate "DataAction" tables where data actions exist, e.g. Microsoft.Storage). They are **not** role definitions.
- Machine readability: HTML tables only; no JSON. About 1,262 table rows on the Compute page alone. Good source for the operation catalogue and descriptions, but the `isDataAction` flag is conveyed by which table (Action vs DataAction) the row is in. Operation string case varies row to row (see 1.4).

### 6.3 (c) Resource provider operations index

- https://learn.microsoft.com/azure/role-based-access-control/resource-provider-operations (page date 2026-07-01): "This article lists the permissions for Azure resource providers, which are used in built-in roles. ... The permissions are always evolving. To get the latest permissions, use Get-AzProviderOperation or az provider operation list."
- It is an **index** of providers by category with links to the permissions pages (about 152 provider rows by my table-row count; it is a rough count, including header-less rows). The comparison is not exact because some provider rows may be duplicated per category.
- Machine-readable official equivalent: REST **Provider Operations Metadata - List**, `GET https://management.azure.com/providers/Microsoft.Authorization/providerOperations?api-version=2022-04-01` (`/rest/api/authorization/provider-operations-metadata/list`), `az provider operation list` (`/cli/azure/provider/operation`), `Get-AzProviderOperation`. These return JSON that includes the `isDataAction` flag (the role-definitions page says providers set it). **They need an Azure login (a token for management.azure.com).** I did not run them (no Azure sign-in; and the tool environment must not call Azure). So the exact JSON shape and size are **UNVERIFIED** here.

### 6.4 (d) `az role definition list` and REST "Role Definitions - List"

- CLI: `az role definition list` ("List role definitions", GA, `/cli/azure/role/definition`). REST: `GET https://management.azure.com/{scope}/providers/Microsoft.Authorization/roleDefinitions?api-version=2022-04-01` (`/rest/api/authorization/role-definitions/list`, page date 2024-05-07), with an optional `$filter`.
- Output is the same JSON shape as on the per-category pages (the role-definitions page shows the CLI output).
- Both require an authenticated Azure session, so a build script would need a developer's Azure login (a free account is enough to call it; Learn does not say what role is required beyond "read"; **UNVERIFIED**). It is the most complete source (it also includes `createdOn`/`updatedOn` and would include Monitored Objects Contributor), but it is **not reproducible by CI without credentials** and the output includes tenant-specific custom roles (filter with `--custom-role-only false` / `roleType eq 'BuiltInRole'`; flag names **UNVERIFIED**, I did not run it).

### 6.5 Licence (facts, not legal advice)

- Learn site terms (https://learn.microsoft.com/legal/termsofuse, fetched 2026-10-27): "Unless otherwise specified, the Services are for your personal and non-commercial use. You may not modify, copy, distribute, transmit, publicly display, perform, reproduce, publish, license, create derivative works from, transfer or sell any information, software, products or services obtained from the Services (except for your own, personal, non-commercial use) without prior written consent from Microsoft." The same page also says: "Certain documentation may be subject to explicit license terms separate from the terms contained here. To the extent the terms conflict, the explicit license terms control."
- The Learn pages carry a link to their source in GitHub (`MicrosoftDocs/azure-docs`, `articles/role-based-access-control/built-in-roles/*.md`; shown in the page's edit-link metadata). The repository's `LICENSE` file at https://github.com/MicrosoftDocs/azure-docs (read via raw.githubusercontent.com, file `LICENSE`) is the text of **"Attribution 4.0 International"** (Creative Commons CC BY 4.0). I could not read the repository's README or `LICENSE-CODE` (rate-limited), and did not confirm which licence the README says applies to which directories. So: **UNVERIFIED** whether CC BY 4.0 explicitly covers the generated built-in roles tables. If it does, the usual CC BY terms are attribution plus indication of changes. Facts only: the site terms and the repository licence differ; the owner should decide whether to ask or to attribute.
- Practical mitigation that does not need a legal reading: Polaris could ship the *data* (role names, IDs, action strings, which are facts about the product) with a visible "Source: Microsoft Learn, as of date" attribution and a link, and avoid copying Learn's prose descriptions beyond the role description strings.

### 6.6 Effort estimate

- Per-category pages: one script (`fetch` 19 URLs, extract `<pre>` JSON, validate with the same schema, write one `roles.builtin.json` with an `asOf` date and the 505-vs-504 reconciliation check). Rough effort: 0.5 to 1 day, including a checker that fails the build when the table count and JSON count diverge.
- Monitored Objects Contributor: add by hand from another Learn page or from `az role definition show` output once; flag in the data as `source: manual`.
- Operations catalogue (optional for v1): scraping the permissions pages (Action and DataAction tables per provider) is similar effort again (about 1 day plus validation); needed only for a UI picker of actions and for validating custom-role action strings.
- All hand work should be avoided: the plan already says "imported by script with an as-of date".

---

## 7. What the sandbox can model deterministically (recommendation)

| Behaviour | Verdict for v1 | Reason (source) |
|---|---|---|
| Role definitions (actions, notActions, dataActions, notDataActions, assignableScopes), all 505 as data | **Yes** | Fully specified shape (sections 1 and 6). |
| Operation matching: case-insensitive, one `*` per string, glob matching | **Yes** | `custom-roles`, `role-definitions`. Grammar edge cases **UNVERIFIED**; test with every Learn example. |
| Scope tree: tenant root `/` > management groups > subscription > resource group > resource, inheritance | **Yes** | `scope-overview`, `role-assignments-steps`. |
| Role assignments (principal, role, scope, GUID name, description) and union across assignments, group transitivity | **Yes** | `overview`, REST create. |
| Per-role `Actions - NotActions`, "NotActions is not a deny" | **Yes** | `role-definitions`. |
| Control plane and data plane evaluated separately | **Yes** | `role-definitions`. Needs an `isDataAction` flag per operation (from the permissions pages or provider operations). Only a small hand-curated set is needed initially (storage blob/queue). |
| "Why" explanation: list the granting assignments and the matching action pattern; or "no assignment grants this action at this scope" | **Yes** | Direct from the evaluation steps in 2.1. |
| Who can assign roles (`roleAssignments/write` check at scope), Contributor cannot assign, Owner/UAA/RBAC Admin can | **Yes** | `role-assignments-steps`, privileged JSON. |
| Custom roles with the documented validation rules (no `/`, one wildcard, one management group, DataActions not at management group scope, limits 5,000, 2,000) | **Yes** | `custom-roles`. |
| Documented limits (5,000 assignments per subscription, 500 per management group, 5,000 custom roles) | **Yes, cheap** | Limits pages. Fine as an educational error message. |
| Elevate access (Global Admin -> UAA at `/`) and Entra directory roles as a separate system | **Yes, simplified** | `elevate-access-global-admin`, `rbac-and-directory-admin-roles`. Model Global Administrator as a directory flag only. |
| Deployment stack deny assignments (fixed pattern: deny `*/delete` for all principals except some, `DoNotApplyToChildScopes`) | **Maybe v1.5** | Deterministic once deployment stacks exist as an entry; `deny-assignments`. Do not offer user-created deny assignments (Learn: "You can't directly create your own deny assignments"). |
| Managed application deny assignment | **Later** | Needs marketplace publisher modelling. |
| ABAC role assignment conditions | **Not v1** | Complex grammar, needs resource/request/environment attributes. Show "this role has a condition" and **mark the result "conditional: not evaluated"** for the 17 built-in roles with a condition and any condition assignment. Prefer an explicit "condition not evaluated" explanation to a silently wrong answer. |
| Delegation with conditions (constrained role assignment) | **Not v1** | Depends on ABAC. |
| PIM eligible/time-bound assignments | **Not v1** | Not specified on the RBAC pages. Optionally a "scheduled/eligible" note. |
| Classic administrators | **Do not model** | Retired in May 2026 (5.3). |
| Azure Policy, locks, resource-provider-specific checks (e.g. keys bypass for data), "Reader cannot list keys" nuances | **Separate engine** | Not part of RBAC evaluation; `PLAN.md` has governance as its own checkpoint. |
| Service groups scope (3 built-in roles) | **Skip or import but mark "not assignable in sandbox"** | Scope type not in the plan. |

### Suggested data model (derived from the above, not from Learn)

`RoleDefinition { id (GUID), name, description, isCustom, permissions: [{actions, notActions, dataActions, notDataActions, condition?}], assignableScopes, source, asOf }`; `RoleAssignment { id (GUID), principalId, principalType, roleDefinitionId, scope, condition?, description? }`; `DenyAssignment { id, name, scope, doNotApplyToChildScopes, principals, excludePrincipals, actions, notActions, dataActions, notDataActions, isSystemProtected }`. Evaluator output: `{ decision, controlOrData, reasons: [{kind, assignmentId, roleId, matchedPattern, scopeInheritedFrom}], notes: [conditionNotEvaluated?] }`.

---

## 8. What I could not verify

- The formal wildcard matching algorithm (only examples are documented).
- Case rules for scope strings, role names and principal IDs.
- Meaning of `ForeignGroup` and `Device` principal types in assignment; how a managed identity appears as `principalType` (inferred `ServicePrincipal`).
- Whether Azure Blueprints creates deny assignments (current Learn page names deployment stacks and managed applications; Blueprints is retiring 2027-01-31).
- Condition grammar and evaluation edge cases (I did not fetch `conditions-format`).
- PIM activation semantics.
- The output of `az role definition list` and `Provider Operations Metadata - List` (need an authenticated Azure session; not run).
- Whether the CC BY 4.0 `LICENSE` of `MicrosoftDocs/azure-docs` applies to the generated built-in role pages (README and `LICENSE-CODE` could not be fetched). The site terms say the opposite default ("personal and non-commercial use"), so this is for the owner to resolve.
- The root management group ID and exact behaviour of root scope `/` for assignments (elevate page speaks of "root scope (/)" only).
- The count of 505 is only valid on 2026-10-27; the page said it was last updated 2026-09-10 (page date) and the page metadata `updated_at` is 2026-09-11. Microsoft adds roles often, so re-run the import periodically.

## 9. Pages consulted (all fetched 2026-10-27)

- `/azure/role-based-access-control/overview`, `role-definitions`, `custom-roles`, `role-assignments-steps`, `role-assignments-rest`, `scope-overview`, `best-practices`, `deny-assignments`, `conditions-overview`, `delegate-role-assignments-overview`, `troubleshoot-limits`, `rbac-and-directory-admin-roles`, `elevate-access-global-admin`, `built-in-roles`, `built-in-roles/<19 categories>`, `resource-provider-operations`, `permissions/compute`, `permissions/storage`
- `/azure/azure-resource-manager/management/azure-subscription-service-limits`, `/azure/azure-resource-manager/bicep/deployment-stacks`, `/azure/azure-resource-manager/managed-applications/overview`, `/azure/governance/blueprints/overview`
- `/rest/api/authorization/role-assignments/create`, `role-definitions/list`, `provider-operations-metadata/list`; `/cli/azure/role/definition`, `/cli/azure/provider/operation`
- `/legal/termsofuse`; `https://raw.githubusercontent.com/MicrosoftDocs/azure-docs/main/LICENSE` (CC BY 4.0 text)
