# Spike A: generate create forms and validation from Microsoft's published resource definitions?

**Access date:** 2026-10-27 (every URL and number below was fetched on this date; all sizes and counts are a snapshot of `main` that day).
**Type of work:** research only. No code changed. Scratch files were kept in `/tmp/spk` (not in the repo).
**Context:** `docs/PLAN.md` section 12 ("Idea to evaluate for scale ... Verify the licence, size and staleness").

## 0. Verdict (short)

**Yes, with limits.** Use `Azure/bicep-types-az` as a **build-time source** for property names, types, enums, read-only/required flags and the few length/pattern/range constraints it carries. Do **not** treat it as the whole create-form: it has no portal labels, no tabs, no defaults, and its "required" flags are schema-level, not portal-level. Use Azure REST API specs only as a **targeted supplement** (defaults, `x-ms-mutability`). Use Learn template pages only for **human cross-checking**, not as a data source.

Recommended shape: a build script copies a **pruned subset** (about 30 types) into static JSON with an "as of" date and the source commit SHA. Hand-written layer on top for labels, tab layout and cross-resource rules.

## 1. Licences (read from each repo's `LICENSE` file)

| Source | Licence | Evidence |
|---|---|---|
| `Azure/bicep-types-az` (the data, `generated/`) | MIT, "Copyright (c) Microsoft Corporation" | https://raw.githubusercontent.com/Azure/bicep-types-az/main/LICENSE |
| `Azure/bicep-types` (the format and tooling, TS/.NET/Go) | MIT, same notice | https://raw.githubusercontent.com/Azure/bicep-types/main/LICENSE |
| npm `@azure/bicep-types` (reader/writer library, v0.6.145, licence field `MIT`) | MIT | https://raw.githubusercontent.com/Azure/bicep-types/main/src/bicep-types/package.json and https://registry.npmjs.org/@azure/bicep-types |
| `Azure/azure-rest-api-specs` | MIT, "Copyright (c) 2017 Microsoft" | https://raw.githubusercontent.com/Azure/azure-rest-api-specs/main/LICENSE |
| Learn "Bicep, ARM template & Terraform AzAPI reference" pages (`learn.microsoft.com/azure/templates/...`) | **Not verified.** The page's metadata points its source at `MicrosoftDocs/azure-resource-manager-schema-reference-pr`, which returns HTTP 404 (not public), so no `LICENSE` could be read. Other `MicrosoftDocs/azure-docs` content is CC BY 4.0 (https://api.github.com/repos/MicrosoftDocs/azure-docs reports `cc-by-4.0`), but that does not prove the template-reference pages share it. | https://learn.microsoft.com/en-us/azure/templates/microsoft.network/virtualnetworks |

Notes:
- The npm package name is **`@azure/bicep-types`**, not `@azure-tools/bicep-types` (the latter returns `{"error":"Not found"}` from the npm registry). It contains **only the reader/writer code and type definitions, not the Azure data** (`package.json` `files` is `/lib`).
- The Azure data itself is published three ways, per the ADR https://raw.githubusercontent.com/Azure/bicep-types-az/main/docs/adr/adr-11882-publication-of-providers-package.md and the workflow `.github/workflows/publish-types.yml`: the `generated/` folder in git, a NuGet package consumed by the Bicep compiler, and an OCI artifact pushed with `bicep publish-provider`. **I did not find an npm package that ships the Azure data.** The practical route for us is to read `generated/` from git at a pinned commit SHA.
- MIT permits redistribution of derived JSON as long as the copyright and licence notice are kept. We would need to add a notice (for example in the app's credits page). This is my reading of MIT, not legal advice.

## 2. Data format and how a browser app would consume it

### Layout of `Azure/bicep-types-az/generated/`
Source: https://github.com/Azure/bicep-types-az/tree/main/generated and the git tree API.

- `generated/index.json` (9,960,976 bytes) and `generated/index.md` (5,969,574 bytes) at the root.
- One folder per service group, then `microsoft.<provider>/<api-version>/types.json` (+ a `types.md`).
- **Folder names are not stable keys.** Examples seen today: `network/`, `privatedns/`, `_legacy/dns/`, `resources_11/`, `compute_1/`, `storage_0/`, `web/`, `app_0/`, `containerservice_1/`, `sql_1/`. A numeric suffix and a `_legacy/` bucket exist. Always resolve through `index.json`; never hard-code a folder.
- `index.json` has the top-level keys `resources`, `resourceFunctions`, `namespaceFunctions`, `settings`. `resources` has **36,600 entries** keyed `Type@apiVersion` and values `{"$ref": "<relative path>/types.json#/<index>"}`. Example:
  `"Microsoft.DocumentDB/databaseAccounts@2015-04-01": {"$ref": "_legacy/cosmos-db/microsoft.documentdb/2015-04-01/types.json#/35"}`.
- Distinct resource types in the index: **3,615**, across **285** distinct provider namespaces (counted by lowercased first path segment).
- Each `types.json` is **one flat JSON array** of type nodes. References are `{"$ref": "#/<array index>"}` (same file). Nodes have a `$type` discriminator. For `microsoft.network/2026-03-01/types.json` (1,418,576 bytes, 5,352 nodes): `StringLiteralType` 2755, `ObjectType` 1026, `ArrayType` 675, `UnionType` 562, `ResourceType` 141, `ResourceFunctionType` 135, `StringType` 25, `IntegerType` 25, `DiscriminatedObjectType` 6, `BooleanType` 1, `AnyType` 1. Primitive nodes are shared and de-duplicated, so `#/2` is the single unconstrained string.
- Format definitions (C#, TS): https://github.com/Azure/bicep-types/tree/main/src (`Bicep.Types/Concrete/*.cs`, `bicep-types/src/types.ts`, `writers/json.ts`).

### Constraint and flag fields (from the format source)
- `StringType`: `sensitive?`, `minLength?`, `maxLength?`, `pattern?`. https://raw.githubusercontent.com/Azure/bicep-types/main/src/Bicep.Types/Concrete/StringType.cs
- `IntegerType`: `minValue?`, `maxValue?`. `ArrayType`: `itemType`, `minLength?`, `maxLength?`.
- `ObjectTypeProperty`: `type`, `flags`, `description?`. Flags bitmask: Required=1, ReadOnly=2, WriteOnly=4, DeployTimeConstant=8, Identifier=16. https://raw.githubusercontent.com/Azure/bicep-types/main/src/Bicep.Types/Concrete/ObjectType.cs
- `ResourceType`: `name` (`Type@version`), `body` (ref to an `ObjectType`), `readableScopes`, `writableScopes` bitmasks (Tenant=1, ManagementGroup=2, Subscription=4, ResourceGroup=8, Extension=16; `types.ts`).
- Enums are `UnionType` of `StringLiteralType`.

### One real example: `Microsoft.Network/virtualNetworks@2026-03-01`
Fetched from https://raw.githubusercontent.com/Azure/bicep-types-az/main/generated/network/microsoft.network/2026-03-01/types.json. Resolved by hand through the `$ref` chain:

```jsonc
// node 3586
{ "$type": "ResourceType", "name": "Microsoft.Network/virtualNetworks@2026-03-01",
  "body": {"$ref": "#/3584"}, "readableScopes": 8, "writableScopes": 8 }   // 8 = ResourceGroup

// node 3584 (the resource body)
{ "$type": "ObjectType", "name": "Microsoft.Network/virtualNetworks", "properties": {
  "id":         {"type": {"$ref": "#/2"},    "flags": 10, "description": "The resource id"},          // ReadOnly+DeployTimeConstant
  "name":       {"type": {"$ref": "#/2"},    "flags": 9,  "description": "The resource name"},        // Required+DeployTimeConstant
  "properties": {"type": {"$ref": "#/3071"}, "flags": 0,  "description": "Properties of the virtual network."},
  "etag":       {"type": {"$ref": "#/2"},    "flags": 2,  "description": "A unique read-only string that changes whenever the resource is updated."},
  "location":   {"type": {"$ref": "#/2"},    "flags": 0,  "description": "Resource location."},
  "tags":       {"type": {"$ref": "#/3585"}, "flags": 0,  "description": "Resource tags."} } }

// node 2204: addressSpace
{ "$type": "ObjectType", "name": "AddressSpace", "properties": {
  "addressPrefixes": {"type": {"$ref": "#/2205"}, "flags": 0,
    "description": "A list of address blocks reserved for this virtual network in CIDR notation."} } }
// node 2205: {"$type":"ArrayType","itemType":{"$ref":"#/2"}}   -> array of unconstrained string; no CIDR pattern

// node 3107: provisioningState (read-only enum, note the LAST element)
{ "$type": "UnionType", "elements": [ ...StringLiteral Failed, Succeeded, Canceled, Creating, Updating, Deleting..., {"$ref": "#/2"} ] }
```

Findings from this walk:
- `virtualNetworks` has **9 body properties**; `properties` (`VirtualNetworkPropertiesFormat`) has **17**: `addressSpace`, `dhcpOptions`, `flowTimeoutInMinutes`, `subnets`, `virtualNetworkPeerings`, `resourceGuid` (ReadOnly), `provisioningState` (ReadOnly), `enableDdosProtection`, `enableVmProtection`, `ddosProtectionPlan`, `bgpCommunities`, `encryption`, `ipAllocations`, `flowLogs` (ReadOnly), `privateEndpointVNetPolicies`, `defaultPublicNatGateway` (ReadOnly), `summarizedGatewayPrefixes`.
- **Enums are open.** Every enum union I looked at ends with a bare `StringType` (`#/2`), so a validator that allows "any string" would be correct for Bicep but useless for a dropdown unless we strip that last element. `privateEndpointVNetPolicies` = `Disabled | Basic | <any string>`.
- **Required is sparse.** In the VNet body only `name` is Required. `location` and `properties.addressSpace` are not flagged, although the portal needs them. `Subnet.addressPrefix` is not Required either.
- **No constraints on the VNet name or on CIDR strings** in the types (`name` is the bare `#/2`).
- Constraints do exist elsewhere. Storage: `Microsoft.Storage/storageAccounts@2026-09-01` `name` is `{"$type":"StringType","minLength":3,"maxLength":24,"pattern":"^[a-z0-9]+$"}`, and `sku.name` is a 14-value enum (`Standard_LRS` ... `PremiumV2_ZRS`) plus the open string.

### Browser consumption
A browser app should **not** fetch these files at runtime: `network/.../types.json` alone is 1.4 MB and `index.json` is 10 MB. Realistic options:
1. **Build-time script (recommended):** Node script reads `index.json`, follows `$ref`s for a chosen list of `Type@version`, walks the node graph to a closure, drops what we do not need, re-indexes, writes one small JSON per resource type into `public/` or `src/data/`, plus a `meta.json` with the source commit SHA and access date. The npm library `@azure/bicep-types` has `readTypesJson` / `readIndexJson` helpers (`writers/json.ts`), or the format is simple enough to read with plain `JSON.parse`.
2. Runtime lazy fetch of per-type pruned files (same data, loaded on "Try it").

## 3. Size on disk

### `Azure/bicep-types-az` (`generated/`), from the recursive git tree API (not truncated)
| Measure | Value |
|---|---|
| Blobs under `generated/` | 7,190 files, **614,985,939 bytes** (~587 MiB) |
| of which `types.json` | 3,334 files, **383,424,906 bytes** (~366 MiB) |
| `index.json` | 9,960,976 bytes |
| Repo size reported by GitHub API (git history included) | 227,392 KB |
| Largest single file seen (Network 2026-03-01) | 1,418,576 bytes (network 2024-10-01 was 1,225,100, so ~16 percent growth in about 17 months) |

### Subset experiment (~30 types), measured
I took the **latest non-preview version** of 32 types: `resourceGroups`; Network `virtualNetworks`, `subnets`, `virtualNetworkPeerings`, `networkSecurityGroups`, `routeTables`, `publicIPAddresses`, `networkInterfaces`, `loadBalancers`, `applicationGateways`, `natGateways`, `privateDnsZones`, `dnsZones`, `privateEndpoints`, `azureFirewalls`, `bastionHosts`; Compute `virtualMachines`, `virtualMachineScaleSets`, `disks`, `availabilitySets`; `storageAccounts`; `keyvault vaults`; Web `sites`, `serverfarms`; App `containerApps`, `managedEnvironments`; `containerservice managedClusters`; `sql servers`; `operationalinsights workspaces`; `userAssignedIdentities`; `roleAssignments`, `roleDefinitions`. All 32 were found in the index. For each I computed the closure of nodes reachable from the resource node and summed the union per file (node JSON kept as published, minified, **not re-indexed, descriptions kept**):

| Result | Size |
|---|---|
| Union of reachable nodes, 15 source files | **829,016 bytes (~810 KB) minified, 141,232 bytes (~138 KB) gzip** |
| Largest single closure: `applicationGateways` | 191,079 bytes |
| Typical Network resource | ~102 KB each, because they share one reachable cluster of ~565 nodes (Subnet, NSG, route table, NIC, private endpoint all reference each other); the union for the whole Network provider is 1,403 nodes / 259 KB |
| Smaller types (`natGateways`, `privateDnsZones`, `userAssignedIdentities`) | 3.5 to 5 KB each |

Cost of "everything": 366 MiB of `types.json` plus the 10 MB index. Not realistic for the browser; only worthwhile as build-time input.
Not measured: gzip of the full set; the size after dropping descriptions or after pruning deep nested properties we would never show (I expect a large reduction but did not test it).

### `Azure/azure-rest-api-specs`
- Repo size per GitHub API: 638,640 KB (~624 MiB, with history). 318 top-level folders under `specification/`. Recursive tree API was **truncated** (39,476 entries returned), so I did not get an exact total working-tree size.
- One API version of Network: `specification/network/resource-manager/Microsoft.Network/Network/stable/2026-03-01/` is **20 files, 3,194,306 bytes**; `virtualNetwork.json` alone is 785,043 bytes. Storage `Storage/stable/2026-09-01/openapi.json` is 732,126 bytes. For comparison, the Bicep closure for `virtualNetworks` is ~112 KB and for `storageAccounts` ~50 KB, so a whole spec file is roughly 8 to 15 times larger. That is not a like-for-like comparison (a spec file also holds all operations and several resource types), so treat it as an order of magnitude only.

## 4. Update cadence (GitHub API, 2026-10-27)

| Repo | Commits in last 7 days | last 30 days | last 90 days | Latest commit | Releases |
|---|---|---|---|---|---|
| `Azure/bicep-types-az` | 12 | 31 | 74 | 2026-10-27 | none published on GitHub |
| `Azure/bicep-types` | 2 | 11 | 38 | 2026-10-23 (code) | none |
| `Azure/azure-rest-api-specs` | 71 | 428 | 1,151 | 2026-10-27 | one old tag release (2016) |

- The data in `bicep-types-az/generated/` is regenerated from the specs by the "Update Types" workflow on a **weekly cron (Sundays 05:45 UTC)** or on demand (https://raw.githubusercontent.com/Azure/bicep-types-az/main/.github/workflows/update-types.yml). Commits that touched `generated/index.json` (commit messages "Update types from azure-rest-api-specs/tree/<sha>"): 2026-10-20, 2026-09-28, 2026-09-09, 2026-08-25, 2026-08-20, 2026-07-29, 2026-07-07, 2026-06-01, 2026-04-30. So **in practice roughly every 1 to 4 weeks**, not weekly; the ADR says a human reviews and merges them ("typically reviewed, but not in great detail").
- Data seems **fresh, not stale**: the Network 2026-03-01 and Compute 2026-04-01 API versions, and Storage 2026-09-01, are already present.
- **Churn risk in the pipeline:** the commit "Add migration path from autorest -> typespec (#2790)" (2026-10-08) and "Restore Cosmosdb and DNS types (#2877)" (2026-10-22) show the generator is changing and types can disappear and be restored (the DNS types now live in `_legacy/`). Pin a commit SHA; do not track `main`.
- The specs themselves are moving to TypeSpec (the `info` block of the 2026 Network and Storage OpenAPI files contains `"x-typespec-generated": [{"emitter": "@azure-tools/typespec-autorest"}]`).

## 5. What it can and cannot give us

### Can give (verified in the files above)
| Need | Bicep types (`bicep-types-az`) | REST specs (`azure-rest-api-specs`) |
|---|---|---|
| Property names, nesting, array/object/boolean/int/string types | Yes | Yes |
| Required | Yes, but only `Required` flag on top-level and nested objects, schema-level | Yes (`required` arrays per definition, plus path/query parameter requirements) |
| Enums / allowed values | Yes, but the trailing open string means "any string" is also valid | Yes, `enum` plus `x-ms-enum` (e.g. `SkuName` 14 values; Storage spec has 120 `x-ms-enum` occurrences) |
| Regex patterns, min/max length, min/max value | Yes, **sparingly**: in Network 2026-03-01, 19 string patterns, 12 maxLength, 3 minLength, 24 integer minValue, 20 maxValue; none on the VNet name | Yes and richer: Storage spec has 170 `"pattern"`, 186 `minLength`, 184 `maxLength`; path parameter `accountName` has `minLength:3, maxLength:24` and a description of allowed characters |
| Read-only vs writable | Yes (`ReadOnly` flag) | `readOnly: true` (Storage 277 occurrences, VNet 293) |
| Write-only / secret | `WriteOnly` flag, `sensitive` on strings | `x-ms-secret`, `format: password` |
| Per-field create/update/read | No | `x-ms-mutability` (Storage spec has 20 occurrences, e.g. `["read","create"]`). The VNet spec has 0, so coverage is **uneven** |
| Default values | **No** (the types have no default field) | Yes, `default` (168 in Storage, 271 in VNet) |
| Short description per property | Yes (`description`) | Yes |
| Where a resource can be deployed | Yes (`writableScopes`) | Implicit in paths |
| Flat resource-type and API-version list | Yes (`index.json`, 36,600 entries) | Indirect (folder listing) |

### Cannot give (not in any of the three sources, so must stay hand-written or come from other docs)
- **Portal labels, tab names, field order, help text, "Review + create" behaviour.** The Learn template pages list property names and descriptions but no portal UI.
- **Cross-field and cross-resource rules**: CIDR overlap within a VNet or between peered VNets, subnet inside the address space, GatewaySubnet naming rules, name uniqueness (for example globally unique storage account names), peering reachability, route evaluation.
- **Region support and SKU availability** (which SKU exists in `southeastasia`, quota, zones). The types list SKU names as strings, not where they can be used.
- **Naming rules that Microsoft documents separately** (for example the VNet name rules in the Azure naming-rules docs). They are **not** in the VNet type (name is a bare string). Checking against https://learn.microsoft.com/azure/azure-resource-manager/management/resource-name-rules would still be needed and I did not verify that page's content in this spike.
- **Property semantics** such as "changing this property forces a new resource", dependencies between properties (for example "Premium_LRS requires kind BlockBlobStorage or FileStorage"), and which combinations are invalid. Only partially present as prose in descriptions.
- Behaviour tiers 1 and 2 from `PLAN.md` section 12: the generated schemas cover **property validation for tier 2** only.

### Learn template pages (candidate 3)
Fetched https://learn.microsoft.com/en-us/azure/templates/microsoft.network/virtualnetworks. It is rendered HTML with Bicep, ARM JSON and Terraform AzAPI skeletons (`'string'`, `bool`, `int` placeholders), a "Property values" table (name, description, value type with "(required)"), and a handful of hand-written samples (examples use older API versions, such as `2022-07-01` and `2024-05-01`). Its page metadata says `updated_at` 2026-10-20 and the source is a non-public repo. It does **not** expose min/max or pattern constraints in the table text I extracted. Conclusion: useful as the **human-readable cross-check** (and as the citation target for the "Microsoft Learn only" rule), **not** a machine-readable source. Scraping HTML would be fragile and its licence status is unknown.

## 6. Recommendation and risks

### Recommendation
1. **Adopt `bicep-types-az` as the build-time source of truth for property names, types, read-only flags, enums and the available length/pattern/range limits** for tier-2 resources. Generate a small static JSON per resource type at build time, store `sourceCommit`, `generatedAt: 2026-..`, API version, and a licence notice, and surface the "as of" date in the UI (same approach as the RBAC roles import, section 12).
2. **Keep a hand-written overlay** per resource type: portal labels, tab/step layout, which fields to show (the full VNet has ~17 nested properties plus ~560 reachable nodes; a portal form shows maybe 8), defaults, and simulator rules. The overlay refers to generated property paths, so a build check can fail if an overlay path no longer exists in the generated schema (this is where the generator earns its keep: it catches drift).
3. **Use the REST specs only to fill gaps** per type (defaults, `x-ms-mutability`, richer patterns). Do this selectively with a script that reads one spec per type, since spec files are large and some are TypeSpec-generated and moving.
4. **Pin to a commit SHA** of `bicep-types-az`, update by a manual script run when we add or refresh a type.
5. Prune at build time: descriptions kept (they are useful) but strip unreachable and rarely used nodes via an allow-list of property paths.

### Risks
- **"Required" is not portal-required.** Deriving form validity from flags will accept an empty VNet that the portal rejects. The overlay must declare the portal's required fields.
- **Open enums.** Must strip the trailing `StringType` to get a closed dropdown, which then becomes our claim ("these are the allowed values") rather than strictly Microsoft's. State it as "values listed in the API definition".
- **Honesty rule (PLAN section 3, rule 6).** Generated data comes from official Microsoft repos, but the repo is not "Microsoft Learn". Treat it as an official Microsoft source (it is under `github.com/Azure`, as the task allows), and cite the commit. Any behaviour claim (such as "this SKU needs that kind") still needs a Learn page.
- **Generator churn and layout instability** (folder suffixes, `_legacy/`, types removed then restored, autorest to TypeSpec migration). Mitigation: resolve through `index.json`, pin a SHA, run a build check that expected `Type@version` keys exist.
- **API versions in the data are newer than most Learn quickstarts/examples.** Our catalog examples use particular versions; the generated schema should be pinned to the same version a given catalog example uses, otherwise property names in the form and in the Bicep example may differ. Check per type.
- **Shared-node bloat.** Without pruning, one Network type drags in ~565 nodes (~100 KB). Needs a pruning step, which is extra build code to maintain.
- **Licence notice** needed (MIT). Unverified: any Microsoft trademark rules around reusing property descriptions in a non-Microsoft site. The descriptions are in an MIT repo, but I did not review a policy beyond the LICENSE file.
- **No test of the pruning step was done**, so the 138 KB gzip figure is an upper bound for the full-descriptions form, not the final bundle size.

## 7. What I could not verify
- Licence of the Learn template-reference pages (source repo not public).
- Whether Learn naming-rules pages encode constraints that could back-fill name validation; not fetched.
- Exact total working-tree size of `azure-rest-api-specs` (tree API truncated) and gzip size of the full `bicep-types-az` data.
- Constraint coverage beyond Network 2026-03-01 and Storage 2026-09-01 (I counted those two; other providers were not surveyed).
- GitHub API rate limit (60 unauthenticated requests per hour) was hit near the end, so commit counts for "last 7 days" use the `Link` header page count of `per_page=1` queries and could be off by one.
- Whether any npm package ships the Azure type data (I found none; this is an absence of evidence, not proof).
- Whether the OCI artifact (`bicep publish-provider`) is anonymously readable; not tested.

## 8. Sources fetched (all Microsoft-owned)
- https://github.com/Azure/bicep-types-az (README, LICENSE, `generated/index.json`, `generated/network/microsoft.network/2026-03-01/types.json`, `generated/storage_0/microsoft.storage/2026-09-01/types.json`, `.github/workflows/update-types.yml`, `.github/workflows/publish-types.yml`, `docs/adr/adr-11882-publication-of-providers-package.md`)
- https://github.com/Azure/bicep-types (README, LICENSE, `src/Bicep.Types/Concrete/*.cs`, `src/bicep-types/package.json`, `src/bicep-types/src/types.ts`, `writers/json.ts`)
- https://github.com/Azure/azure-rest-api-specs (LICENSE, `specification/network/resource-manager/Microsoft.Network/Network/stable/2026-03-01/virtualNetwork.json`, `specification/storage/resource-manager/Microsoft.Storage/Storage/stable/2026-09-01/openapi.json`, `specification/common-types/resource-management/v5/types.json`)
- GitHub REST API for repo metadata, trees, commits and releases of the three Azure repos
- https://registry.npmjs.org/@azure/bicep-types (metadata only; npm registry is not Microsoft-owned but publishes the Microsoft package)
- https://learn.microsoft.com/en-us/azure/templates/microsoft.network/virtualnetworks
