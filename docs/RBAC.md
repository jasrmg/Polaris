# Polaris sandbox: Azure RBAC and the directory

**Status:** design, checkpoint 10 (written 2026-10-27). Built in checkpoint 13 (directory and RBAC), with the "act as" identity also used by checkpoint 17 (Cloud Shell).
**Siblings:** [`SIMULATOR.md`](SIMULATOR.md) (world, pipeline, scopes) and [`CLOUDSHELL.md`](CLOUDSHELL.md). Evidence: [`research/rbac-model.md`](research/rbac-model.md) (shorthand `rbac`) and [`research/azure-resource-model.md`](research/azure-resource-model.md).
Tags **[Learn]**, **[Decision]**, **[Owner]**, **[Open]** mean the same as in `SIMULATOR.md` section 0. URLs below are on `https://learn.microsoft.com/en-us`, written without that prefix.

**What this models:** Azure role-based access control, the same model Azure uses, so that "can this identity do this to that, and why?" has the real answer. **What it does not model:** AWS IAM or any other provider's access model (a provider pack later, see `SIMULATOR.md` section 12), and Microsoft Entra roles beyond a small flag (section 3).

## 1. Decisions

| Decision | Answer |
|---|---|
| **[Owner]** Act as other identities | Yes. The sandbox has simulated users, groups and service principals, and the user can switch who they act as. A refusal ("access denied") is the main teaching moment. |
| **[Owner]** Role data | Ship only built-in roles that Learn documents. Permissions come from the live API export. Roles Learn does not document are a later, opt-in list (section 8). |
| **[Owner]** Scope | One tenant, many subscriptions, management groups editable. Role assignments inherit down that tree. |
| **[Decision]** v1 evaluator | Control plane and data plane, scope inheritance, group transitivity, notActions, custom roles with documented validation, who-can-assign, elevate access, explanation output. Not in v1: ABAC conditions (shown as "not evaluated"), PIM, delegation with conditions, customer-created deny assignments (Azure does not allow them). |

## 2. Data model

Shapes follow the REST/CLI form Learn publishes. [Learn, `azure/role-based-access-control/role-definitions`, page date 2025-03-30]

```ts
interface RoleDefinition {
  id: string;                  // "/providers/Microsoft.Authorization/roleDefinitions/{guid}" (no subscription id, section 8)
  name: string;                // the GUID
  roleName: string;
  description: string;
  roleType: "BuiltInRole" | "CustomRole";
  assignableScopes: string[];  // built-in: ["/"] mostly; custom: never "/" and no wildcard
  permissions: Array<{         // MORE THAN ONE entry is possible: union them
    actions: string[]; notActions: string[]; dataActions: string[]; notDataActions: string[];
    condition?: string | null; conditionVersion?: string | null;   // sits inside each permissions[] entry
  }>;
  source: "api-export" | "learn" | "custom";
  asOf: string;                // import date, shown in the UI
}

interface RoleAssignment {
  id: string; name: string;    // name is a GUID
  principalId: string; principalType: "User" | "Group" | "ServicePrincipal";
  roleDefinitionId: string; scope: string;
  condition?: string; description?: string; createdOn: number;
}
```

- A role assignment is "security principal, role definition and scope". Role definitions, assignments and deny assignments are **stored globally**, not per region. [Learn, `.../overview`]
- `principalType`: the REST enum also has `ForeignGroup`, `Device` and two agent values; Learn does not define the first two beyond their names, and there is no `ManagedIdentity` value (a managed identity is a service principal; Learn's REST page does not say so in words, so this is an inference). **[Decision]** v1 supports `User`, `Group`, `ServicePrincipal`; a managed identity is a directory object whose `principalType` is `ServicePrincipal`. [Open: confirm wording in Learn]
- Condition fields exist in the type so import loses nothing; v1 does not evaluate them (section 6).
- Deny assignments: type reserved, not user-creatable (section 6).

## 3. The directory (Microsoft Entra, kept separate)

**Learn:** Azure roles manage access to Azure resources; Microsoft Entra roles manage access to Entra resources (users, groups, domains). "By default, Azure roles and Microsoft Entra roles don't span Azure and Microsoft Entra ID", so Global Administrator has no access to Azure resources by default. [`.../rbac-and-directory-admin-roles`, page date 2026-05-06; `.../elevate-access-global-admin`] A subscription trusts exactly one tenant. [Entra: `entra/fundamentals/how-subscriptions-associated-directory`]

Directory objects (all synthetic; no real people, no real domains):

| Object | Fields | Notes |
|---|---|---|
| User | `id` (GUID), `displayName`, `userPrincipalName` (`name@<tenant>.onmicrosoft.com`), `directoryRoles[]`, `memberOf[]` | The starter world has one: "You". More are created in the directory page or with `az ad user create` (later). |
| Group | `id`, `displayName`, `members[]` (users, groups, service principals) | Nested groups are allowed: "role assignments are transitive for groups". [Learn, `.../overview`] Cycles are rejected by **[Decision]**. |
| Service principal | `id`, `appId`, `displayName`, `directoryRoles[]` | |
| Managed identity | `id`, `displayName`, `kind` (system-assigned owner resource, or user-assigned resource ID) | Created when a resource turns on identity; deleted with it. A system-assigned identity must be re-enabled and a user-assigned one recreated if the subscription moves tenant (single tenant here, so this is a note only). [Entra: `how-subscriptions-associated-directory`] |

**Entra directory roles: deliberately minimal.** The only directory role modelled is **Global Administrator**, as a flag on a user. It affects two things: who may use "Elevate access" (below), and what the Entra pages in the UI allow. All other Entra roles are listed as "not simulated". The UI labels the two systems differently ("Azure roles" and "Microsoft Entra roles") because mixing them up is the classic mistake. [Learn]

**Elevate access** [Learn, `.../elevate-access-global-admin`, page date 2025-03-10]: a Global Administrator can turn on "Access management for Azure resources" (Microsoft Entra ID, Manage, Properties). This assigns User Access Administrator at root scope (`/`) to **that user only**: "applies only to the currently signed in user". It is removed by turning the toggle off; Learn says to remove it when done. The action behind it, `Microsoft.Authorization/elevateAccess/Action`, is in Contributor's `notActions`. **[Decision]** the engine implements it as creating and deleting one role assignment at `/`; deactivating a PIM role does not change the toggle (documented), and the sandbox has no PIM.

**Starter world [Decision]:** user "You" has Owner at the default subscription and the Global Administrator flag. Learn does not describe a default state; this is a convenience. Reset restores it.

## 4. Scopes and inheritance

Learn: four scope levels (management group, subscription, resource group, resource); "lower levels inherit role permissions from higher levels". Scope strings are the ARM IDs in `SIMULATOR.md` section 3.1. [Learn, `.../scope-overview`, `.../role-assignments-steps`]

**Root scope `/`:** an assignment at `/` applies to every management group and subscription in the tenant. Learn mentions "root scope (/)" on the elevate page; whether it equals the root management group's ID is not stated on the pages read. **[Decision]** the engine treats `/` as an invisible scope above the root management group, so inheritance runs `/` → root management group → … → subscription → resource group → resource. **[Open]** confirm in Learn.

Constraints enforced [Learn]:

| Rule | Source |
|---|---|
| 5,000 role assignments per subscription (all subscription, resource group and resource scopes; management group scope not counted; eligible and future-scheduled assignments not counted) | limits page, `troubleshoot-limits` |
| 500 per management group | same |
| Assignment name is a GUID; required fields `principalId`, `roleDefinitionId` | REST role-assignments create (2022-04-01) |
| A role can only be assigned inside its `assignableScopes` | `.../role-definitions` |
| Description up to 2,048 characters (512 recommended) | limits page |

## 5. Evaluation

**Official steps** [Learn, `.../overview`, "How Azure RBAC determines if a user has access to a resource"]: get a token with group memberships (transitive); ARM retrieves the role assignments and deny assignments that apply to the resource; a deny assignment blocks access; otherwise narrow to the user's and groups' assignments; check whether the action is in those roles after subtracting `notActions` from `actions`; if the assignment has a condition, evaluate it; otherwise allow.

The sandbox implements:

```
input: principal P, action A, plane (control | data), scope S, optional context
1. groups(P) = P plus all transitive groups                                  (Learn: transitive)
2. denies = deny assignments at S or inherited, honouring DoNotApplyToChildScopes
   for each deny matching P (or its groups) and A and not excluded -> DENIED, reason: that deny assignment
3. assignments = role assignments at S or any ancestor whose principal is in groups(P)
4. for each assignment a with role R, for each entry p in R.permissions:        (union ALL entries)
     allowed = match(A, p.actions[plane]) and not match(A, p.notActions[plane])  (subtract INSIDE one role)
     if allowed and (p.condition or a.condition): result = "not evaluated", record a note
     else if allowed: record a as granting
5. any granting assignment -> ALLOWED, with every granting assignment as the reason
   else if a conditional match was recorded -> "CONDITIONAL: not evaluated" with the assignment named
   else -> DENIED, reason: "no role assignment grants {A} at {S}"
```

Rules this relies on, each stated by Learn:

- **Additive.** Effective permissions are the sum of assignments (Contributor at subscription plus Reader on a group is just Contributor). [`.../overview`]
- **`notActions` is not a deny.** "It is simply a convenient way to create a set of allowed actions when specific actions need to be excluded." If a second role grants an action excluded by the first role, the user can do it. The same applies to `notDataActions`. So subtraction happens inside one role definition, then results are unioned. [`.../role-definitions`]
- **Control plane and data plane are separate.** `actions` and `notActions` are control plane; `dataActions` and `notDataActions` are data plane. A `*` in `actions` does not grant anything in `dataActions`; for example an Owner can manage containers but "by default cannot read the blobs inside a container" (when Microsoft Entra authentication, not an access key, is used). [`.../role-definitions`] The sandbox keeps two independent evaluations and needs an `isDataAction` flag per operation (section 9).
- **Assignments are global**, so no region logic. [`.../overview`]

### 5.1 Matching action strings

Operation format `{Company}.{Provider}/{resourceType}/{action}`, last segment `*`, `read` (GET), `write` (PUT/PATCH), `action` (POST), `delete`. Learn's examples are the test fixtures: `*/read`, `Microsoft.Compute/*`, `Microsoft.Network/*/read`, `Microsoft.Compute/virtualMachines/*`, `microsoft.web/sites/restart/Action`. [`.../role-definitions`, `.../custom-roles`]

- **Case-insensitive.** "Permission strings are case-insensitive." (needed because Contributor's `notActions` write `Microsoft.Authorization/*/Write`). Lower-case at import and at query. [`.../custom-roles`]
- **One `*` per string** in custom roles ("You can have only one wildcard in an action string"). All built-in roles also have at most one; checked on 504 role blocks. [`.../custom-roles`; `rbac` 1.3]
- **Glob semantics [Decision]:** `*` matches any characters, including `/`. Learn has no formal grammar (`rbac` 1.3, **[Open]**); this reading is consistent with every documented example, and the tests use exactly those examples.

### 5.2 Who can assign roles

Needs `Microsoft.Authorization/roleAssignments/write` (and `/delete` to remove), at the scope of the assignment. The engine treats that as an ordinary action on the target scope, so the same evaluator decides. Built-in roles that can: Owner, User Access Administrator, Role Based Access Control Administrator (and Reservations Administrator for reservations). Contributor cannot because its `notActions` include `Microsoft.Authorization/*/Write` and `/Delete`. The documented error text is "does not have authorization to perform action 'Microsoft.Authorization/roleAssignments/write'". [`.../role-assignments-steps`; privileged roles page]

Privileged administrator roles (a UI badge) are those whose permissions include `*`, `*/delete`, `*/write`, `Microsoft.Authorization/denyAssignments/{write,delete}`, `roleAssignments/{write,delete}` or `roleDefinitions/{write,delete}`. [`.../role-definitions`]

### 5.3 The explanation (the product)

```ts
interface AccessDecision {
  decision: "allowed" | "denied" | "conditional";
  plane: "control" | "data";
  action: string; scope: string; principal: string;
  reasons: Array<
    | { kind: "granted-by"; assignmentId: string; roleId: string; matchedPattern: string; inheritedFrom: string | null }
    | { kind: "excluded-by-notaction"; roleId: string; pattern: string }   // matched actions but also a notActions pattern
    | { kind: "denied-by-deny-assignment"; denyId: string }
    | { kind: "no-assignment" }
    | { kind: "condition-not-evaluated"; assignmentId: string; roleId: string }
  >;
  hints: string[];   // e.g. "Contributor excludes Microsoft.Authorization/*/Write, so it cannot assign roles"
}
```

The "what if" page lets the user pick a principal, an action (typed or chosen from the operation list) and a scope, then shows this structure in words. Cloud Shell authorisation failures use the same function and print Learn's documented `AuthorizationFailed` text (`CLOUDSHELL.md` section 8).

## 6. Not evaluated in v1

| Feature | Handling | Why |
|---|---|---|
| ABAC conditions | The 17 built-in roles that carry a `condition`, and any assignment with a condition, give "conditional: not evaluated" with the condition text shown. | The condition language has its own grammar and needs request and resource attributes the sandbox does not model. A visible "not evaluated" beats a silently wrong answer. `rbac` 2.5 |
| Delegation with conditions | Same | Depends on conditions |
| Deny assignments | Evaluated if present; **users cannot create them.** Learn: "You can't directly create your own deny assignments"; Azure creates them for deployment stacks and managed applications. Deployment stack deny assignments arrive when deployment stacks exist (the fixed pattern in the research). Azure Blueprints creating deny assignments is **not** modelled (not confirmed by the current page). [`.../deny-assignments`, page date 2026-10-06] | |
| PIM and eligible assignments | Not simulated | Not described on the core RBAC pages |
| Classic administrators | Not modelled | Fully retired in May 2026 [`.../rbac-and-directory-admin-roles`] |
| Data access through keys or SAS | Documented as a bypass; not simulated | Per-service behaviour |
| Service groups scope | Roles using it are imported but marked "not assignable in sandbox" | Not an ARM scope in the sandbox |

## 7. Custom roles

Learn rules enforced [`.../custom-roles`, page date 2025-10-23; limits page]:

- Required: `Name`, `Id` (generated), `IsCustom`, `Description`, `Actions`, `AssignableScopes`. Optional: `NotActions`, `DataActions`, `NotDataActions`.
- Assignable at management group, subscription and resource group scope (resource scope by command line works but is discouraged because of the limit).
- Up to 5,000 custom roles per tenant; name unique in the tenant (recommended max 256, max 512 characters); description recommended max 512, max 2,048.
- `AssignableScopes` cannot be `/`, cannot contain wildcards, at most 2,000 entries, **at most one management group**, and ARM does not validate that the management group exists. A custom role with `DataActions` cannot be assigned at management group scope.
- Only data actions go in `DataActions` and `NotDataActions` (flagged `isDataAction` by the provider).
- Creating, updating or deleting needs `Microsoft.Authorization/roleDefinitions/write` (or delete) on **all** of the role's assignable scopes; reading needs `roleDefinitions/read`.
- Delete fails while assignments exist (`RoleDefinitionHasAssignments`): "remove any role assignments that use the custom role" first.
- Role IDs never change even if a role is renamed; preview roles are renamed at general availability. Key on the GUID, never on the name. [`.../role-definitions`, `.../best-practices`]
- The "Virtual Machine Operator" example on the custom-roles page is a test fixture.

**[Decision]** the custom role editor offers an operation picker built from the curated operation list (section 9), and also accepts typed patterns so a learner can try wildcards. It warns that a typed action that matches no known operation may be invalid in Azure.

## 8. The built-in roles dataset

### 8.1 What we found (2026-10-27)

| Measure | Count | Notes |
|---|---:|---|
| Roles in the owner's `az role definition list` export (filtered to built-in roles) | 970 | An earlier summary export also showed 2 tenant custom roles; the full export already excludes them and none may ever be shipped. Every role has `assignableScopes: ["/"]`. |
| Roles listed on Learn's built-in roles page | about 505 | `rbac` 6.1 counted 505 rows, 504 with a JSON block on the 19 category pages. |
| In both the export and the Learn JSON | 499 | These ship. |
| On Learn but not in the export | 6 | `Reservations Administrator`, `Reservations Reader`, `Service Group Administrator`, `Service Group Contributor`, `Service Group Reader` (JSON on Learn) and `Monitored Objects Contributor` (no JSON on the category pages). They use other scopes (`/providers/Microsoft.Capacity`, service groups) so a subscription-level listing does not show them. [`rbac` 6.1] |
| In the export but not on Learn | 471 | Service-specific or partner roles (for example `AVS Orchestrator Role`, `AgFood Platform Service Admin`). They have no Learn description page. |
| Of the 499, permissions differ between export and Learn JSON | 34 | 72 action strings only in the export, 21 only on Learn. Role names match for all 499. |

The 34 differences show that Learn's generated pages do not always match what the API returns today. **[Decision]** the **API export wins** for permissions (it is what Azure enforces), and the import report lists every difference so a human can see it. Descriptions: 27 differ in wording; **[Decision]** use the API text and link the Learn page.

### 8.2 The rule **[Owner]**

1. A role ships only if Learn documents it (its GUID is on Learn's built-in roles page).
2. Permissions, name and description come from the API export; Learn's JSON is used to cross-check and for the 6 roles missing from the export (copied by hand with attribution, marked `source: "learn"`).
3. The 471 undocumented roles are not shipped in v1. A later opt-in "show all roles from the API" list is allowed, labelled "not documented on Microsoft Learn".
4. Role effort scales with the catalog: every role works in the evaluator for free, but verification, tests and scenarios start with roles relevant to catalog resources, and each catalog entry gets a "roles that matter here" list (VM: Virtual Machine Contributor, Virtual Machine Administrator Login, Reader, with a one-line Learn-backed note each).

### 8.3 Import process (checkpoint 13)

- `scripts/import-roles.ts` reads a raw export from `data/raw/` (git-ignored), reads Learn's built-in roles page for the documented GUID list, and writes `src/engine/azure/data/built-in-roles.json` (about 0.6 MB, loaded only when the RBAC screens open).
- **Privacy [hard rule]:** the raw export contains the owner's subscription ID inside every role `id` (`/subscriptions/<guid>/providers/...`). The importer rewrites it to `/providers/Microsoft.Authorization/roleDefinitions/{guid}` (the form Learn shows) and fails if any `/subscriptions/` string remains. Raw exports never enter git: `data/raw/` and `roles_*.json` are in `.gitignore`. The owner's export currently sits in their Downloads folder.
- The export is UTF-16 when produced by a PowerShell redirect; the importer detects the encoding.
- Output carries `asOf`, the count and the list of differences. A check fails the build if a shipped role has no Learn page, if a GUID repeats, or if `assignableScopes` includes a subscription-specific value.
- Re-run periodically (Microsoft adds roles often); the diff is reviewed by a human.
- **Licence:** [Open] Learn's site terms say personal and non-commercial use, while the docs repository is CC BY 4.0; which covers the generated role pages was not settled (`rbac` 6.5). The design avoids the question: the data comes from the API output; Learn is used only for the list of documented GUIDs and for linking. Facts (role names, IDs, action strings) are shipped with a visible "Source: Azure Resource Manager API and Microsoft Learn, as of {date}" credit and link. This is not legal advice.

## 9. Operations (for pickers and `isDataAction`)

The evaluator needs to know whether an operation string is a data action. Sources: Learn's "Azure permissions" pages per category (`azure/role-based-access-control/permissions/<category>`), which list Action and DataAction tables per provider; or the official API `Provider Operations Metadata - List` / `az provider operation list`, which needs a sign-in. [Learn, `.../resource-provider-operations`, page date 2026-07-01]

**[Decision]** v1 ships a **small hand-curated operation list** for the providers of the catalog (Microsoft.Compute, Network, Storage, Resources, Authorization, Insights, OperationalInsights, RecoveryServices, Web, App, ContainerInstance, Management), each entry `{ name, description, isDataAction, learnUrl }`, imported by script from the permissions pages and checked into the repo. Data actions are needed for storage blobs and queues first. The owner may later export the full list with `az provider operation list` (same privacy and `data/raw/` rule).

## 10. "Act as" and the Cloud Shell

- The session holds `actingAs: principalId`. The header shows who you are; changing it is instant and logged in the activity trace.
- Every engine call takes the acting principal. The pipeline's authorize step (`SIMULATOR.md` section 4.1) calls the evaluator for each action the operation needs (for example a VM create needs `Microsoft.Compute/virtualMachines/write`, plus the network write actions for what it creates).
- In the shell, `az login` lists directory users and service principals to choose from (no passwords); `az login --service-principal`, `--identity` and `az logout` switch the acting principal; `az account show` prints that identity in its `user` field. Cloud Shell itself is already signed in as you; a short note says so. [Learn, `azure/cloud-shell/overview`] Details: `CLOUDSHELL.md` section 7.

## 11. Limits stated by Learn (as of 2026-10-27)

5,000 role assignments per subscription; 500 per management group; 5,000 custom roles per tenant; role assignment description 2,048 maximum; condition size 8 KB; custom role definition size 1 MB; 2,000 `AssignableScopes` entries; one management group per custom role; 2,000 system-managed deny assignments per subscription. The best-practice "no more than 3 subscription owners" is advice, not a limit, and is shown as a hint only. [limits page, `.../custom-roles`, `.../best-practices`]

## 12. Tests (checkpoint 13)

Fixtures straight from Learn: Reader `*/read`; Owner `*`; Contributor with its eleven `notActions` (cannot assign roles); User Access Administrator; Role Based Access Control Administrator; Storage Blob Data Reader (both `actions` and `dataActions`); the Contributor-plus-Reader additive example; the `notActions` not-a-deny example; the wildcard table; the Virtual Machine Operator custom role. Plus: group transitivity (user in group in group), inheritance from management group to resource, `/` elevate access, data plane versus control plane for an Owner, a role with two `permissions[]` entries, a conditional role giving "not evaluated", and the import checks in 8.3.

## 13. Catalog entries added with this work (checkpoint 13)

Role definition, Role assignment, Custom role, Managed identity, Service principal, User, Group (kinds per `SIMULATOR.md` section 9.1; Role definition and Role assignment are `azure-resource`, the others `directory-object`). Management group, Subscription, Tenant arrive earlier (checkpoint 11).

## 14. Not verified and open

1. Formal wildcard grammar (only examples are documented), and whether `*` must match at least one segment.
2. Case rules for scope strings, role names, principal IDs (resource IDs are treated case-insensitively as an assumption, `SIMULATOR.md` 3.1).
3. Whether root scope `/` is the same as the root management group ID for assignments.
4. Meaning of `ForeignGroup` and `Device`; how a managed identity appears as `principalType` (inferred `ServicePrincipal`).
5. Condition grammar (`conditions-format` page not fetched); PIM activation semantics.
6. Whether the Learn built-in roles page is generated from the same data as the API: 34 of 499 roles differ today (section 8.1). Reason unknown.
7. Why 471 roles exist in the API without Learn pages (could be internal, preview or recently added). Not investigated.
8. Content licence (section 8.3).
9. What role the API needs to list role definitions: the owner ran it successfully with a role that includes `*/read`; Learn does not state the minimum.
