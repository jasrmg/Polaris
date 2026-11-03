# Azure Policy, tags, and locks (checkpoint 14)

**Fetched:** 2026-11-03. Facts below are from Microsoft Learn or from the Microsoft `Azure/azure-policy` repository that Learn links for built-in definitions. Anything the sandbox does not evaluate is listed at the end and is not claimed as implemented.

## Sources

| Id | Page |
|---|---|
| S1 | [Azure Policy overview](https://learn.microsoft.com/en-us/azure/governance/policy/overview) |
| S2 | [Definition structure](https://learn.microsoft.com/en-us/azure/governance/policy/concepts/definition-structure) |
| S3 | [Effect basics](https://learn.microsoft.com/en-us/azure/governance/policy/concepts/effect-basics) |
| S4 | [Deny effect](https://learn.microsoft.com/en-us/azure/governance/policy/concepts/effect-deny) |
| S5 | [Audit effect](https://learn.microsoft.com/en-us/azure/governance/policy/concepts/effect-audit) |
| S6 | [Assignment structure](https://learn.microsoft.com/en-us/azure/governance/policy/concepts/assignment-structure) |
| S7 | [Scope](https://learn.microsoft.com/en-us/azure/governance/policy/concepts/scope) |
| S8 | [Assign a policy in the portal](https://learn.microsoft.com/en-us/azure/governance/policy/assign-policy-portal) |
| S9 | [Create and manage policies](https://learn.microsoft.com/en-us/azure/governance/policy/tutorials/create-and-manage) |
| S10 | [RequestDisallowedByPolicy](https://learn.microsoft.com/en-us/azure/azure-resource-manager/troubleshooting/error-policy-requestdisallowedbypolicy) |
| S11 | [Tags](https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/tag-resources) |
| S12 | [Tag resources in the portal](https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/tag-resources-portal) |
| S13 | [Locks](https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/lock-resources) |
| S14 | Built-in JSON in [Azure/azure-policy](https://github.com/Azure/azure-policy/tree/master/built-in-policies/policyDefinitions), read 2026-11-03: `General/AllowedLocations_Deny.json`, `General/AllowedResourceTypes_Deny.json`, `General/InvalidResourceTypes_Deny.json`, `Tags/RequireTagAndValue_Deny.json`, `Tags/RequireTag_Deny.json` |

## 1. What Policy is

Azure Policy evaluates resource state against business rules. It does not care who made the change or who has permission to make it. Azure RBAC controls who can act. Some policy resources, including definitions and assignments, are visible to all users. [S1]

Owner has full rights on policy resources. Resource Policy Contributor includes most policy operations. Contributor and Reader can read them. Contributor can trigger remediation, but cannot create or update definitions or assignments. [S1]

## 2. Definitions

A definition has a display name (maximum 128 characters), a description (maximum 512), a mode, parameters, and a policy rule. The rule is `if` / `then`. The `then` block sets the effect. `policyType` is returned by the service, not set by the caller: `Builtin`, `Custom`, or `Static`. [S2]

Mode `indexed` evaluates resource types that support tags and location. Mode `all` also evaluates resource groups, subscriptions, and types that do not. Policies that target a resource group or subscription set mode to `all` and target `Microsoft.Resources/subscriptions/resourceGroups` or `Microsoft.Resources/subscriptions`. A definition with no mode defaults to `all` in Azure PowerShell. A null mode from Azure CLI is treated as `indexed`. Definitions created in the portal use `all`. [S2]

A definition is stored at a management group or a subscription. It can only be assigned to resources in that hierarchy. [S2]

## 3. Effects this checkpoint uses

On a create or update, Azure Policy builds the list of assignments that apply, then evaluates each definition. For Resource Manager mode, `disabled` is checked first (the rule is skipped). `append` and `modify` run next. `deny` runs before `audit`, so a blocked request is not also logged as an audit. [S3]

`deny` prevents the request before it is sent to the resource provider. The request is returned as `403 (Forbidden)`. Existing resources that match are marked non-compliant. The Resource Manager form of deny has no extra properties. [S4]

`audit` does not stop the request. On a create or update it adds a `Microsoft.Authorization/policies/audit/action` operation to the activity log and marks the resource non-compliant. The Resource Manager form has no extra properties. [S5]

Each assignment is evaluated on its own. The combined result is cumulative most restrictive. Two deny assignments that require different locations can block a new resource that satisfies neither. [S3]

The portal compliance table: a new or updated resource whose audit condition is true is Non-Compliant; if the condition is false it is Compliant. An existing resource that matches a deny or audit condition is Non-Compliant. [S8]

## 4. Assignments

An assignment has a scope, a single `policyDefinitionId`, a display name (maximum 128), a description (maximum 512), parameters, `notScopes`, and `enforcementMode`. The scope includes child containers and child resources. `notScopes` excludes them from evaluation. An exclusion is not an exemption. [S6] [S7]

`enforcementMode` `Default` enforces the effect on create and update. `DoNotEnforce` does not enforce the effect and does not write the deny entry to the activity log. Use it to see compliance before you enforce. If the property is omitted, the value is `Default`. `Enroll` is a third mode and is out of this checkpoint. [S6]

Portal path: search for Policy, select Assignments, select Assign policy, set scope, definition, and enforcement (defaults to Enabled), then parameters, then create. [S8] [S9]

A blocked deployment reports `RequestDisallowedByPolicy`. The message includes the resource name, the policy assignment, and the policy definition. The Learn sample starts `Resource <name> was disallowed by policy. Policy identifiers:`. [S10]

## 5. Shipped built-in definitions

Copied from S14 on 2026-11-03. The sandbox evaluates these five by id. It does not interpret an arbitrary policy rule.

| Display name | Definition id | Mode | Effect |
|---|---|---|---|
| Allowed locations | `e56962a6-4747-49cd-b67b-bf8b01975c4c` | Indexed | Parameter `effect`: Audit, Deny, or Disabled. Default Deny. Matches when `location` is not in `listOfAllowedLocations`, and location is not `global`, and type is not `Microsoft.AzureActiveDirectory/b2cDirectories`. The description says resource groups are excluded. |
| Allowed resource types | `a08ec900-254a-4555-9bf5-e42af04b5c5c` | Indexed | Same effect parameter. Matches when `type` is not in `listOfResourceTypesAllowed`. The description says only types that support tags and location are affected. |
| Not allowed resource types | `6c112d4e-5bc7-47ae-a041-ea2d9dccd749` | All | Same effect parameter. Matches when `type` is in `listOfResourceTypesNotAllowed`. |
| Require a tag and its value on resources | `1e30110a-5ceb-460c-a204-c1c3969c6d62` | Indexed | Effect is the literal `deny`. Matches when `tags[tagName]` is not equal to `tagValue`. Description: does not apply to resource groups. |
| Require a tag on resources | `871b6d14-10aa-478d-b590-94f262ecfa99` | Indexed | Effect is the literal `deny`. Matches when `tags[tagName]` does not exist. Description: does not apply to resource groups. |

## 6. Tags

Tags apply to resources, resource groups, and subscriptions, not to management groups. Resources do not inherit tags from a group or a subscription. [S11]

Limits: 50 name-value pairs on each resource, resource group, or subscription. Name 512 characters, value 256. A storage account tag name is 128 characters. Tag names cannot contain `<`, `>`, `%`, `&`, `\`, `?`, or `/`. Azure DNS (public and private zones, and A records) supports 15 tags, and those names cannot contain spaces or parentheses or start with a number. [S11]

Tag names are case-insensitive for operations. The provider may keep the casing you sent. Tag values are case-sensitive. Tags are plain text. Do not put secrets in them. [S11]

Portal: open the resource or group, select Add tags, enter a name and value, select Save. [S12]

Write access to `Microsoft.Resources/tags` (Tag Contributor) can tag even without access to the resource itself. Tag Contributor cannot apply tags to resources or resource groups through the portal. It can tag subscriptions in the portal. Contributor can tag what it can write. [S11]

## 7. Locks

Already enforced before this checkpoint. Confirmed again on S13: CanNotDelete and ReadOnly, inherited, most restrictive wins, not on management groups, control plane only. Portal labels are Delete and Read-only. Creating or deleting a lock needs `Microsoft.Authorization/*` or `Microsoft.Authorization/locks/*`. Owner and User Access Administrator have that access.

## 8. Not simulated

Append, modify, deployIfNotExists, auditIfNotExists, denyAction, manual, initiatives, exemptions, resource selectors, overrides, the Enroll enforcement mode, a background compliance cycle, and the activity log. Custom policy definitions can be described in the catalog. The engine rejects a definition id that is not one of the five above. The sandbox compares locations and resource types case-insensitively. Tag values use exact `equals`. Tag names are matched case-insensitively, which is the tag operation rule in S11, not a claim about the policy language. Compliance for resources that already exist is recorded when the assignment is created or deleted, and when the resource is created or updated. A denied create stores no resource and no compliance row.
