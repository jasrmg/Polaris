# Spike B: Bicep in the browser, and what a simulated deployment engine must understand

**Status:** research only, no code changed. **Accessed:** 2026-10-27 (all URLs fetched that day).
**Feeds:** `docs/PLAN.md` section 13 (Cloud Shell, checkpoint 18 deployments) and the checkpoint 10 design docs.
**Sources used:** learn.microsoft.com, github.com/Azure/* (via raw.githubusercontent.com and the GitHub API), azure.github.io/bicep (the official playground), and NuGet package metadata for Microsoft-authored packages. Nothing else.

Legend: **[Confirmed]** = I fetched or ran it. **[Inferred]** = my reasoning from confirmed facts. **[Not verified]** = I could not check it. My own effort or risk judgements are marked "my estimate".

---

## 0. Verdict (short)

1. **Yes, Bicep compiles to ARM JSON fully inside a browser, with no server.** The official playground does exactly that, using the real Bicep compiler built as .NET WebAssembly running in a Web Worker. **[Confirmed]** by reading the source and by compiling a sample in the live playground (section 1.4).
2. **But it is heavy: about 70.6 MB uncompressed, about 48.5 MB gzipped, in 174 files.** Roughly 37.8 MB of that is one file (the Azure resource type definitions, which does not compress). **[Confirmed]** by downloading every file listed in the playground's boot manifest (section 1.5). It is not published to npm and not attached to GitHub releases, so we would either build it from source or copy the playground's static files. **[Confirmed]**
3. **`bicep-node` is a wrapper for the Bicep CLI and cannot run in a browser.** **[Confirmed from the package description only.]** I did not read its source (section 1.6).
4. **Recommendation:** ship the Cloud Shell v1 with **ARM JSON only**, and compile the catalog's Bicep examples to ARM **at build time** (Polaris already compiles them with the Bicep CLI in `npm run check:snippets`). Treat in-browser Bicep as an optional, lazy-loaded, opt-in v2 feature (section 4).
5. **The hard part is not Bicep. It is the deployment engine.** Compiled Bicep is just ARM JSON, so the same expression evaluator, dependency ordering and what-if diff are needed either way (section 3).

---

## 1. Question 1: can Bicep be compiled to ARM JSON in a browser?

### 1.1 Learn confirms the playground exists and what it does

- "Bicep Playground allows you to view equivalent ARM templates and Bicep files side by side. You can select Sample Template to see both versions, or select Decompile to upload your own ARM template and view the equivalent Bicep file." <https://learn.microsoft.com/en-us/azure/azure-resource-manager/bicep/decompile> **[Confirmed]**
- "The Bicep Playground lets you view Bicep and equivalent JSON side by side." <https://learn.microsoft.com/en-us/azure/azure-resource-manager/bicep/compare-template-syntax> **[Confirmed]**
- The Azure/bicep README says "You can also use the Bicep Playground to try out Bicep in your browser." <https://github.com/Azure/bicep> **[Confirmed]**
- Not found: a dedicated Learn page for the playground. `.../bicep/playground` returned 404. **[Confirmed]**

### 1.2 How it is built (source in Azure/bicep, `main`)

Everything below is **[Confirmed]** by fetching the files.

| Fact | Evidence |
|---|---|
| The playground "runs the Bicep compiler in a .NET WebAssembly worker and uses Monaco for the Bicep and generated ARM template editors." | <https://raw.githubusercontent.com/Azure/bicep/main/src/playground/README.md> |
| There is a project `src/Bicep.Wasm` (`Microsoft.NET.Sdk.BlazorWebAssembly`) that references `Bicep.Core` and `Bicep.Decompiler`. | <https://raw.githubusercontent.com/Azure/bicep/main/src/Bicep.Wasm/Bicep.Wasm.csproj> |
| It exports exactly these functions to JavaScript via `[JSExport]`: `Ping`, `CompileAndEmitDiagnostics(content, sourcePath)`, `Decompile(content)`, `GetSemanticTokensLegend`, `GetSemanticTokens`. Compile returns JSON with `template` (the ARM JSON string) and `diagnostics`. | <https://raw.githubusercontent.com/Azure/bicep/main/src/Bicep.Wasm/WorkerInterop.cs> and `Interop.cs` in the same folder |
| The compile path uses the normal `TemplateEmitter` on a `Compilation`, so output is the same emitter the CLI uses. | `Interop.cs` (same folder) |
| A TypeScript Web Worker loads `_framework/dotnet.js`, calls `dotnet.create()`, and calls `getAssemblyExports("Bicep.Wasm")`. | <https://raw.githubusercontent.com/Azure/bicep/main/src/playground/src/compiler/compiler.worker.ts> |
| Build: `dotnet publish -c Release -p:InvariantGlobalization=true -p:InvariantTimezone=true -p:WasmBuildNative=true ../Bicep.Wasm/Bicep.Wasm.csproj`, then a script copies `Bicep.Wasm/bin/Release/net10.0/publish/wwwroot/_framework` into the playground's `public/_framework`. Vite then bundles the site. | <https://raw.githubusercontent.com/Azure/bicep/main/src/playground/package.json> and `scripts/stage-wasm-assets.mjs` |
| Build prerequisites: the .NET SDK pinned in `global.json` (`10.0.402`), Node, npm, and `dotnet workload install wasm-tools`. | playground `README.md` above, and <https://raw.githubusercontent.com/Azure/bicep/main/global.json> |
| The playground's `package.json` has `"private": true`, so the playground itself is not published to npm. | playground `package.json` above |
| A size guard exists in the build: initial JS budget 2,650,000 bytes, native .NET runtime budget 2,000,000 bytes, only `compiler`, `editor` and `json` workers allowed, no ICU data. | <https://raw.githubusercontent.com/Azure/bicep/main/src/playground/scripts/check-build.mjs> |

**Not required by the compile path, but present:** OCI registry support (`WasmModuleRegistryProvider` includes `OciArtifactRegistry`) and a `loadQuickstart` JS import that fetches sample files. Public registry modules therefore need the network. **[Confirmed that the code exists; [Not verified] how it behaves offline.]**

### 1.3 Licence

- `LICENSE` in Azure/bicep is the **MIT License, "Copyright (c) Microsoft Corporation."** <https://raw.githubusercontent.com/Azure/bicep/main/LICENSE>; the GitHub API also reports `spdx_id: MIT` <https://api.github.com/repos/Azure/bicep>. **[Confirmed]**
- Source files carry the header "Licensed under the MIT License." **[Confirmed]**
- Packages the WASM bundle includes, per NuGet metadata, are MIT and authored by "Microsoft": `Azure.Deployments.Expression`, `Azure.Deployments.Templates`, `Azure.Deployments.Core`, `Microsoft.PowerPlatform.ResourceStack`, `Azure.Bicep.Types.Az`. <https://api.nuget.org/v3-flatcontainer/azure.deployments.expression/1.812.0/azure.deployments.expression.nuspec> (and the same pattern for the others). **[Confirmed]**
- **[Not verified]:** the bundle also contains non-Microsoft assemblies (for example `Newtonsoft.Json`, `Humanizer`, `System.*`). I did not review their licences or the repo's notice files. Before redistributing the binaries inside Polaris, someone should read the NOTICE/third-party licence text. Redistributing the built files is likely fine under MIT (my reading), but that is not legal advice.

### 1.4 Live check: it actually compiles in a browser

I opened <https://azure.github.io/bicep/> in the Cursor browser on 2026-10-27. The status bar read "Bicep 0.48.1-gcec7951cf6" and "Compiled 1931 ms" (empty file, cold start). I chose the sample `microsoft.analysisservices/analysis-services-create/main.bicep`, opened the "ARM template" tab, and the generated JSON (`"type": "Microsoft.AnalysisServices/servers"`, `"name": "[parameters('serverName')]"`, and so on) appeared with status "Up to date, Compiled 471 ms". **[Confirmed]** This is one anecdotal run on one machine, not a benchmark.

The playground is served from GitHub Pages, which is plain static hosting. **[Confirmed]** (response header `Server: GitHub.com`). That shows the compiler needs no server-side code. **[Inferred]:** because GitHub Pages cannot set custom response headers, the playground probably does not need cross-origin isolation (SharedArrayBuffer); I did not test this directly.

### 1.5 Bundle size (measured)

I downloaded `_framework/dotnet.js`, parsed the embedded boot config (`/*json-start*/ ... /*json-end*/`), and downloaded every listed file from <https://azure.github.io/bicep/_framework/>. **[Confirmed]**

| Item | Raw bytes | gzip (my level 6) |
|---|---|---|
| **All 174 runtime and assembly files** (1 native wasm, 2 core assemblies, 169 assemblies, plus 2 JS modules) | **70,650,341** | **48,523,725** |
| `Azure.Bicep.Types.Az.*.wasm` (Azure resource type definitions) | 37,762,329 | 36,720,170 (does not compress; server sent 36,720,468 bytes with `Content-Encoding: gzip`) |
| `Microsoft.WindowsAzure.ResourceStack.*.wasm` | 3,483,417 | 1,176,657 |
| `Azure.Bicep.Core.*.wasm` | 2,848,025 | 958,856 (server sent 968,637) |
| `dotnet.native.*.wasm` (the .NET runtime itself) | 1,388,739 | 538,365 |
| `Azure.Deployments.Templates.*.wasm` | 717,077 | 249,666 |
| `dotnet.js` loader | 107,536 | about 28 KB (server `Content-Length: 28282`, gzip) |
| Playground app JS `assets/index-*.js` | 314,448 | 94,184 transferred |

- Without the single Types.Az file the total would be roughly 32.9 MB raw / 11.8 MB gzip. **[Inferred arithmetic.]** **[Not verified]** whether Bicep still compiles correctly if that file is absent or replaced by a smaller subset. It is the Azure resource type data (package `Azure.Bicep.Types.Az`, "Bicep types generated from public Azure OpenAPI specs", <https://github.com/Azure/bicep-types-az>). I would expect it to be required for type validation and for resource completion.
- The boot config marks files `"cache": "force-cache"`, so a repeat visit should be served from the HTTP cache. **[Confirmed in config; [Not verified] in practice.]**
- Caveats: (a) I computed the totals from the boot manifest, **not** from a real first-load network trace, because the worker's requests did not appear in the page's Performance entries; (b) I did not test Brotli; (c) I did not confirm that the runtime downloads all 174 files at startup (it is the usual behaviour for a boot manifest, but I did not prove it).

### 1.6 `bicep-node` and other packages

- npm `bicep-node` latest `0.0.12`, licence MIT, description **"Node wrapper for interacting with the Bicep CLI."** Repository field: `git+https://github.com/anthony-c-martin/bicep-node.git`, maintainer `anthony-c-martin`. <https://registry.npmjs.org/bicep-node> **[Confirmed]**
- It is therefore **not browser-capable** (it drives the CLI binary, which is a native executable) and it is hosted under a personal GitHub account, **not** under `github.com/Azure` or `github.com/MicrosoftDocs`. I could not fetch `Azure/bicep-node` (not found). I did not read the package source, so "wrapper for the CLI" rests on its published description. **[Confirmed: description; Not verified: source.]**
- No npm package for `Bicep.Wasm`: I queried `@azure/bicep`, `bicep-wasm` and `@azure/bicep-wasm` in the npm registry and all returned "Not found". That is not an exhaustive search. **[Confirmed for those three names.]**
- GitHub release `v0.48.1` (published 2026-10-05) has **no WASM asset**. Assets are CLI binaries (about 109 to 125 MB each), NuGet packages (`Azure.Bicep.Core`, `.Decompiler`, `.IO`, `.LangServer`, `.RpcClient`, ...) and VSIX files. <https://api.github.com/repos/Azure/bicep/releases/latest> **[Confirmed]**
- Learn says the CLI is the supported route outside the playground: `bicep build main.bicep` or `az bicep build --file main.bicep`, "Typically, you don't need to run this command because it runs automatically when you deploy a Bicep file." <https://learn.microsoft.com/en-us/azure/azure-resource-manager/bicep/bicep-cli> **[Confirmed]**

### 1.7 Can it be bundled into a static site?

**Technically yes** **[Inferred from the playground being a static site]**. Two ways to get the files:

| Option | How | Pros | Cons |
|---|---|---|---|
| A. Build from source in our own CI | Clone Azure/bicep at a tag, install .NET SDK 10.0.402 and `wasm-tools`, run the `build-wasm` steps, copy `_framework` | Pinned, reproducible, we control the version | Heavy toolchain; **I did not try it** so build time and failures are unknown |
| B. Copy the files published at azure.github.io/bicep/_framework | Download the files named in the boot manifest (file names contain content hashes) | No toolchain | We pin a snapshot of a third party's deploy; file names change per Bicep release; no official "distribution" contract found |

Other points:

- Files are static, so Polaris's static Next.js export could serve them from `public/`. **[Inferred]** AGENTS.md requires reading the Next.js docs in `node_modules/next/dist/docs/` before using Next APIs (for Web Worker/asset handling). **[Not done in this spike.]**
- Some static hosts cap individual file or total site size. **[Not verified, not a Microsoft source]** Check the chosen host's limits against the 37.8 MB single file before committing.
- Would need a Worker wrapper like `compiler.worker.ts` (MIT, about 4.9 KB) and a virtual file system. The WASM `CompileAndEmitDiagnostics` takes one string plus a `sourcePath`, so multi-file modules (`module x './x.bicep'`) in a Cloud Shell virtual disk are **[Not verified]**. The `LocalModuleRegistry` is registered, but how the WASM file system serves local files was not examined.
- It is Bicep 0.48.1 today. Learn says newer language features (user-defined types and functions, compile-time imports, experimental features) switch the output to languageVersion 2.0 (see section 3). **[Confirmed]** <https://learn.microsoft.com/en-us/azure/azure-resource-manager/bicep/bicep-cli>

### 1.8 Related find: Microsoft's own template evaluator (not in the browser build as an export)

- The same WASM bundle already contains `Azure.Deployments.Expression`, `Azure.Deployments.Templates` and `Azure.Deployments.Core` assemblies (listed in the boot manifest). NuGet describes `Azure.Deployments.Expression` as "the logic for Azure Resource Manager template expressions" (MIT). **[Confirmed]**
- Azure/bicep has `src/Bicep.Core/Utils/TemplateEvaluator.cs`, which uses those packages to evaluate templates, and `src/Bicep.Core/Utils/Snapshots/`. Learn documents `bicep snapshot` (Bicep CLI 0.41.2 or newer), which writes a normalized, deterministic snapshot and a validate mode that "compares your current Bicep code against the saved snapshot and shows a visual diff, much like the what-if command but entirely local." **[Confirmed]** <https://learn.microsoft.com/en-us/azure/azure-resource-manager/bicep/bicep-cli>
- **Bicep.Wasm does not export any of that**; it only exports compile, decompile and semantic tokens. Reusing the real expression engine in the browser would require our own .NET WASM build exposing it. **[Inferred]; [Not verified]** whether it would work; the source of `Azure.Deployments.*` is in an internal repo (`msazure.visualstudio.com`, per the nuspec), so we get binaries, not source. This is a possible v2+ idea, not a v1 plan.

---

## 2. Question 2: fallback if Bicep cannot be used

**ARM JSON only is a workable fallback.** What it looks like:

1. `az deployment group create --template-file x.json` accepts ARM JSON (Learn: "Deploy resources with ARM templates and the Azure CLI", example `az deployment group create ... --template-file`). <https://learn.microsoft.com/en-us/azure/azure-resource-manager/templates/deploy-to-resource-group> **[Confirmed]**
2. For `.bicep` input the shell prints a clear message ("Bicep compilation isn't available in this simulator; use ARM JSON"), and the UI shows the Bicep example as read-only, exactly as PLAN section 13 already says.
3. **Build-time compile**: every catalog Bicep example is already compiled with the Bicep CLI by `npm run check:snippets` (PLAN section 0). Extend that step to emit the resulting ARM JSON into the catalog data, so each Bicep example has a "deployable ARM" twin without any browser compiler. **[Inferred]; the current script's output format was not inspected.**
4. A user who pastes their own Bicep can compile it in the official playground and paste the ARM JSON back (Learn points to it as the side-by-side tool). This is a manual step, but it is honest.
5. The reverse direction (ARM to Bicep, `Decompile`) is also in the WASM but is not needed.

Honesty note for the UI: Learn states that decompile and build output "might not be exactly the same" as the original, and that `bicep build` output is "functionally equivalent". <https://learn.microsoft.com/en-us/azure/azure-resource-manager/bicep/decompile> **[Confirmed]**

---

## 3. Question 3: what a simulated deployment engine must understand

All Learn URLs below were fetched 2026-10-27.

### 3.1 Template structure

<https://learn.microsoft.com/en-us/azure/azure-resource-manager/templates/syntax> **[Confirmed]**

- Top level: `$schema`, `languageVersion`, `contentVersion`, `apiProfile`, `definitions`, `parameters`, `variables`, `functions`, `resources` (array, or object with languageVersion 2.0), `outputs`. Required: `$schema`, `contentVersion`, `resources`.
- Stated limits: 256 parameters, 256 variables, 800 resources, 64 outputs.
- Parameter types: `string`, `securestring`, `int`, `bool`, `object`, `secureObject`, `array`. Constraints: `defaultValue`, `allowedValues`, `minValue`, `maxValue`, `minLength`, `maxLength` (more in languageVersion 2.0).
- Resource object fields: `condition`, `type`, `apiVersion`, `name`, `location`, `dependsOn`, `tags`, `identity`, `sku`, `kind`, `scope`, `copy`, `plan`, `properties`, child `resources`.
- Comments `//` and `/* */` are allowed in templates (CLI needs the extended JSON handling), and a `metadata` object can appear almost anywhere.
- Scope-specific schemas (resource group `2019-04-01`, subscription `2018-05-01`, management group and tenant `2019-08-01`).

### 3.2 Size assessment per feature

"Small" = a day or two for one person; "Medium" = several days; "Large" = weeks or open-ended. **These sizes are my estimate**, not from any source.

| Feature | What Learn says (source) | Size |
|---|---|---|
| Template JSON validation (required fields, limits, parameter types and constraints, `allowedValues`) | `syntax` page above | **Small** |
| Expression language `"[...]"`, string literals, property and index access, `[[` escape | `syntax`, `template-functions` | **Medium**. Needs a real parser (never `eval`). |
| `parameters()`, `variables()` | Deployment value functions list: `deployer`, `deployment`, `environment`, `parameters`, `variables`. <https://learn.microsoft.com/en-us/azure/azure-resource-manager/templates/template-functions> | **Small** |
| `resourceGroup()`, `subscription()`, `tenant()`, `managementGroup()` | Documented return shape: `resourceGroup()` returns `id`, `name`, `type`, `location`, `managedBy`, `tags`, `properties.provisioningState`. `resourceGroup()` can't be used in a subscription-level deployment. <https://learn.microsoft.com/en-us/azure/azure-resource-manager/templates/template-functions-scope> | **Small** (data comes from the sandbox world) |
| `concat`, `format`, `toLower`, `toUpper`, `replace`, `substring`, `split`, `join`, `trim`, `contains`, `startsWith`, `padLeft`, `length`... | String functions list. `concat` "Combines multiple string values ... or combines multiple arrays". <https://learn.microsoft.com/en-us/azure/azure-resource-manager/templates/template-functions-string> | **Small each, medium in total** (about 30 string functions, plus array, object, numeric, logical, comparison, CIDR and date groups) |
| `uniqueString(...)` | "Creates a deterministic hash string"; returns "13 characters long"; "isn't globally unique". The hash algorithm is not documented on that page. Scopes shown: `subscription().subscriptionId`, `resourceGroup().id`, `resourceGroup().id, deployment().name`. | **Small to build, but values will differ from real Azure.** **[Not verified]** whether the exact algorithm can be reproduced from public sources. Must be labelled simulated. |
| `resourceId()`, `subscriptionResourceId()`, `extensionResourceId()` | Format "varies based on if the deployment happens at the scope of a resource group, subscription, management group, or tenant". <https://learn.microsoft.com/en-us/azure/azure-resource-manager/templates/template-functions-resource> | **Small to medium** (scope-dependent segments, child types with several name segments) |
| `if`, `and`, `or`, `not`, `equals`, `coalesce`, `bool`, etc. | Logical and comparison lists in `template-functions` | **Small** |
| `condition` on a resource | Whole resource only; does not cascade to children; a `dependsOn` on a skipped resource is removed automatically; `reference`/`list*` in a skipped resource are still evaluated (and error if the target doesn't exist) unless guarded by `if`. <https://learn.microsoft.com/en-us/azure/azure-resource-manager/templates/conditional-resource-deployment> | **Small** |
| `dependsOn` and ordering | Resources deploy in dependency order, otherwise in parallel. Child resources have no implicit dependency on the parent. `reference()`/`list*()` by **name** (not ID) create an implicit dependency. Circular dependencies are detected at validation. <https://learn.microsoft.com/en-us/azure/azure-resource-manager/templates/resource-dependency> | **Medium** (graph, topological sort, implicit edges from expressions, copy-loop edges) |
| `copy` on resources | `count` up to 800, may be 0; `mode` serial/parallel with `batchSize`; `copyIndex(offset)` is zero-based; no copy on child resources (use fully qualified type and `parent/child` name); can't use `reference` for `count`. Copy also exists for properties, variables and outputs. <https://learn.microsoft.com/en-us/azure/azure-resource-manager/templates/copy-resources> | **Medium** (resource copy), **medium** more for property, variable and output copy |
| User-defined `functions` | Restrictions: can't access variables, can't call other user functions, can't use `reference`, parameters have no defaults. `syntax` page | **Medium** |
| Lambda functions (`filter`, `map`, `reduce`, `sort`, `groupBy`, `toObject`, `mapValues`) | `template-functions` list | **Medium** |
| `reference()` | "Returns an object representing a resource's runtime state"; output "highly relies on how each resource provider (RP) implements its PUT and GET responses"; "doesn't return a single, predefined format"; `'Full'` returns id/location/identity too; only valid in `outputs` and resource `properties`. <https://learn.microsoft.com/en-us/azure/azure-resource-manager/templates/template-functions-resource> | **Large in fidelity.** Each resource type needs a model of what the real GET returns (for example `primaryEndpoints.blob`). Can start with the properties the sandbox already stores. |
| `list*()` (`listKeys`, `listSecrets`, `listAccountSas`) | `template-functions` list | **Large**; defer (secrets, per-RP behaviour) |
| `languageVersion` 2.0 (symbolic names, `existing`, `references()`, user-defined types, limited `deployment()`, resources as an object, `dependsOn` by symbolic name) | `syntax` page. Learn bicep-cli: user-defined types/functions, compile-time imports and experimental features "automatically enable language version 2.0 code generation". | **Large**. Needed to run compiled output of advanced Bicep. Defer. |
| Deployment modes | See 3.3 | Incremental **medium**, Complete **large** |
| Scopes | See 3.4 | Resource group **medium**; others **large** |
| Nested and linked deployments (`Microsoft.Resources/deployments`) | Nested supports `resourceGroup`, `subscriptionId`, `scope`, `expressionEvaluationOptions` (default `inner` in languageVersion 2.0). Linked templates need a URI, which a no-backend sandbox cannot fetch. | Nested inline **large**; linked **not possible** (no network) |
| Per-resource-type behaviour (defaults, read-only properties, name rules, API-version-specific schemas) | `apiVersion` is required per resource; "To determine available values, see template reference". | **Largest cost, and it grows with the catalog.** Needs a per-type adapter from ARM body to the sandbox engine model. |
| Errors, deployment history, `--no-wait`, rollback | `az deployment group` command list: create, delete, export, list, show, validate, what-if, cancel. <https://learn.microsoft.com/en-us/cli/azure/deployment/group> | **Medium** |

### 3.3 Deployment modes (<https://learn.microsoft.com/en-us/azure/azure-resource-manager/templates/deployment-modes>) **[Confirmed]**

- Default is **Incremental**. Existing resources not in the template are left alone.
- **Incremental redeploy reapplies all properties.** "Properties that aren't included in the template are reset to the default values." The template is the final state, not a partial update. This is a common surprise and an important behaviour to simulate (replace, not merge), but it needs per-type knowledge of defaults. Special cases: subnets belong on the `virtualNetworks` resource; `Microsoft.Web/sites/config` is a child resource.
- **Complete** deletes resources in the target resource group that are not in the template. Rules: only root-level templates; **subscription-level deployments don't support complete mode**; resources in secondary resource groups are not deleted; a locked resource group blocks deletion; copy loops are resolved first, then anything not produced is deleted; a `condition: false` resource is deleted with REST `2019-05-10` or later; child resources are not always deleted unless the parent is (for example a CNAME record under a DNS zone that remains in the template). A per-type table of deletion behaviour is on a separate Learn page that I did **not** fetch.
- Learn says "Use deployment stacks to perform resource deletions ... as the complete mode will be gradually deprecated" and "Complete mode is not recommended." This is a strong argument to defer it.

### 3.4 Deployment scopes **[Confirmed]**

- Resource group: `az deployment group create`. <https://learn.microsoft.com/en-us/azure/azure-resource-manager/templates/deploy-to-resource-group>
- Subscription: `az deployment sub create`; needs `--location` for deployment data; in Bicep set `targetScope = 'subscription'`; can create resource groups, policy, role assignments, locks. <https://learn.microsoft.com/en-us/azure/azure-resource-manager/bicep/deploy-to-subscription>
- Management group and tenant: `az deployment mg create`, `az deployment tenant create`. <https://learn.microsoft.com/en-us/azure/azure-resource-manager/templates/deploy-what-if>
- A deployment name's location is immutable (`InvalidDeploymentLocation`). A resource group deployment can target other resource groups and subscriptions through nested deployments, up to 800 resource groups. The only prohibited scope transitions are resource group to management group, and subscription to management group.
- Polaris sandbox has one tenant/subscription world at first, so resource group scope is the natural v1.

### 3.5 What-if output format

Sources: <https://learn.microsoft.com/en-us/azure/azure-resource-manager/templates/deploy-what-if> (Learn), <https://learn.microsoft.com/en-us/cli/azure/deployment/group> (CLI reference), and the REST spec <https://raw.githubusercontent.com/Azure/azure-rest-api-specs/main/specification/resources/resource-manager/Microsoft.Resources/deployments/stable/2024-03-01/deployments.json>. **[Confirmed]**

**Commands.** `az deployment group what-if`, `az deployment sub what-if`, `az deployment mg what-if`, `az deployment tenant what-if`. `az deployment group create --confirm-with-what-if` (or `-c`) previews then prompts; `--no-pretty-print` returns JSON. CLI options include `--result-format {FullResourcePayloads, ResourceIdOnly}`, `--exclude-change-types`, `--mode`, `--parameters`, `--validation-level`. On `create`: `--what-if`, `--what-if-exclude-change-types`, `--what-if-result-format`, `--proceed-if-no-change`.

**Resource change types.** The set differs slightly by source, which is worth knowing:

| Source | Resource `changeType` values |
|---|---|
| REST spec (`WhatIfChange.changeType`) and CLI `--what-if-exclude-change-types` | `Create`, `Delete`, `Ignore`, `Deploy`, `NoChange`, `Modify`, `Unsupported` |
| Learn what-if page text ("seven different types") | `Create`, `Delete`, `Ignore`, `NoChange`, `NoEffect`, `Modify`, `Deploy` (**no `Unsupported`**) |

So the list in the task (Create, Delete, Ignore, Deploy, Modify, NoChange, Unsupported) matches the REST spec and CLI. The Learn what-if page lists `NoEffect` instead and does not mention `Unsupported`. In the REST spec `NoEffect` is a **property** change type (`PropertyChangeType`: `Create`, `Delete`, `Modify`, `Array`, `NoEffect`). **[Not verified]** why the Learn text differs.

Meanings:

- **Create**: not present now, defined in template.
- **Delete**: only in complete mode; exists but not in template; only types that support complete-mode deletion.
- **Ignore**: exists, not in template, will not be touched. Also used for resources beyond the expansion limits.
- **NoChange**: exists and in template, redeployed, properties won't change (full-payload format only).
- **Modify**: exists, in template, properties will change (full-payload format only).
- **Deploy**: will be redeployed, may or may not change; returned when it can't tell (resource-ID-only format).
- **Unsupported** (REST/CLI): "The resource is not supported by What-If", with an `unsupportedReason` string. **[Confirmed in the spec.]**

**Text output** (copied from Learn, the exact layout the shell should mimic):

```text
Resource and property changes are indicated with these symbols:
  - Delete
  + Create
  ~ Modify

The deployment will update the following scope:

Scope: /subscriptions/./resourceGroups/ExampleGroup

  ~ Microsoft.Network/virtualNetworks/vnet-001 [2018-10-01]
    - tags.Owner: "Team A"
    ~ properties.addressSpace.addressPrefixes: [
      - 0: "10.0.0.0/16"
      + 0: "10.0.0.0/15"
      ]
    ~ properties.subnets: [
      - 0:

          name:                     "subnet001"
          properties.addressPrefix: "10.0.0.0/24"

      ]

Resource changes: 1 to modify.
```

- Resource-ID-only format uses `! Deploy` and ends "Resource changes: 1 to deploy."
- Complete mode deletes print `- Microsoft.Network/virtualNetworks/vnet-001` with `id`, `location`, `name`, `tags...`, `type`, then "Resource changes: 1 to delete." and a prompt `[Y] Yes  [A] Yes to All  [N] No  [L] No to All  [S] Suspend  [?] Help (default is "Y"):` (PowerShell wording, shown on that Learn page).
- **[Not verified]:** which symbols and colours the CLI uses for NoChange, Ignore, NoEffect and Unsupported. The Learn page I fetched only shows `-`, `+`, `~`, `!`. Do not invent them; look for the Learn or CLI doc that shows them, or print those types in a clearly labelled simulated format.

**JSON shape** (REST 2024-03-01):

```text
WhatIfOperationResult { status, properties: { changes: WhatIfChange[] }, error }
WhatIfChange { resourceId, changeType, unsupportedReason, before, after, delta: WhatIfPropertyChange[] }
WhatIfPropertyChange { path, propertyChangeType, before, after, children: WhatIfPropertyChange[] }
```

**Learn's documented quirks (replicate honestly or label as deviation):**

- "The what-if operation can't resolve the reference function. Every time you set a property to a template expression that includes the reference function, what-if reports the property will change."
- "Some of the properties that are listed as deleted won't actually change." Real what-if has "noise" from service-side defaults. A simulator that compares like with like will not have this noise. That is a deliberate difference to document.
- Limits: 500 nested templates, 800 resource groups, 5 minutes of expansion; past a limit the remaining resources become `Ignore`.
- Permissions: what-if needs "the same permission requirements" as deploy: write on the resources and `Microsoft.Resources/deployments/*`. This ties directly into the RBAC evaluator planned for checkpoint 13.

**Suggested what-if algorithm.** Evaluate the template against the world (all expressions except `reference`), then for each resource look up the current resource by ID: absent gives Create; present and equal gives NoChange; present and different gives Modify with a property-level delta; present in the world but not in the template gives Ignore (incremental) or Delete (complete). Resource types with no sandbox adapter give Unsupported with a reason. **[Inferred design, not from Learn.]**

---

## 4. Question 4: recommendation for Cloud Shell v1

### 4.1 Ship in v1

- `az deployment group create | what-if | validate | show | list | delete`, **resource group scope**, **Incremental mode**, ARM JSON input via `--template-file` from a small virtual file store (paste/upload/"load catalog example").
- `--parameters` as JSON file, inline JSON and `KEY=VALUE`, with later values overriding earlier ones (CLI reference wording above). `--no-prompt` and prompts for missing parameters.
- Expression engine with a curated function subset: `parameters`, `variables`, `resourceGroup`, `subscription`, `concat`, `format`, `uniqueString` (labelled simulated), `toLower`, `toUpper`, `if`, `equals`, `and`, `or`, `not`, `length`, `add`/`sub`, `copyIndex`, `resourceId`, `split`, `replace`, `substring`, `union`/`createObject` as needed. Unknown functions give a clear "not supported in this simulator" error naming the function.
- `condition`, `dependsOn` ordering with implicit edges from `reference(name)`, resource-level `copy` (count, `copyIndex`, treat serial as in-order), `outputs`.
- `what-if` with both result formats, `--confirm-with-what-if`, `--exclude-change-types`, text output in the Learn layout, `--no-pretty-print` JSON in the REST shape, Create/Modify/NoChange/Ignore/Unsupported (and `Deploy` for resource-ID-only). Honour the `reference()` quirk.
- Deployment history in the world (name, mode, state, outputs, timestamp).
- RBAC check using the checkpoint 13 evaluator (`Microsoft.Resources/deployments/*` plus write on each resource).
- Only resource types the sandbox engine models: others fail on `create` with a clear error and show as `Unsupported` in what-if.
- Catalog ARM examples compiled at build time from Bicep, plus a test that deploys every catalog ARM example into a fresh world and fails the build on error (extends the PLAN section 13 "docs and simulation don't drift" rule).

### 4.2 Defer

| Deferred | Why |
|---|---|
| **Bicep in the browser** (opt-in "Compile Bicep" that lazy-loads the WASM in a Worker) | About 48.5 MB gzipped for the full bundle; unknown behaviour for multi-file modules; adds a pinned third-party runtime; the engine is the real prerequisite. Revisit after v1 ships. |
| **Complete mode** | Learn says not recommended and "gradually deprecated" (use deployment stacks). Needs per-type delete rules from a Learn table I did not fetch. |
| **Subscription, management group, tenant scope** | Needs the container model (checkpoint 11). Subscription scope is the best first extension because it creates resource groups, policy and role assignments. Management group and tenant after that. |
| **Nested deployments, `languageVersion` 2.0, user-defined functions, lambdas** | Large or medium; mostly needed for advanced or Bicep-compiled templates. |
| **`reference()` full fidelity, `list*()`** | Per-type GET modelling; secrets handling. Provide only the properties each adapter stores. |
| **Linked templates / `--template-uri` to arbitrary URLs** | No network. Only allow catalog-hosted templates by name. |
| `--rollback-on-error`, `--validation-level`, template specs, deployment stacks, policy tokens | Out of v1; accept the flag and print "not supported in the simulator" where harmless. |

### 4.3 Risks

1. **Per-type adapters dominate the cost** and grow with every catalog entry. Mitigation: a generic JSON-bag resource plus an adapter table, only for types already in the sandbox.
2. **Incremental semantics need defaults.** If the engine merges instead of replaces, the simulator teaches the wrong behaviour; if it replaces, it needs correct defaults per type. Where defaults are not on Learn, follow the PLAN rule: do not invent them.
3. **Fidelity of `uniqueString`, `reference` output and what-if noise**: values will differ from real Azure. Label as simulated.
4. **Rule 6 of PLAN (Microsoft Learn only)**: much real ARM behaviour (error codes, partial-failure semantics, exact CLI output for all change types) is not on Learn. The spec is the REST spec and Learn; anything else must be cut or labelled.
5. **Scope creep**: the template language is large (this page's function list has dozens of functions across ten groups). Keep the supported-function list explicit and test-driven.
6. **Security and robustness**: user-supplied templates must be parsed, never evaluated as JavaScript; cap copy counts (Learn limit 800), template size, recursion depth and total expressions to avoid freezing the tab.
7. **If Bicep WASM is added later**: 48.5 MB gzip on mobile data, GitHub Pages-style hosting limits, a pinned version (0.48.1 today), a heavy .NET 10 + `wasm-tools` build, third-party licence notices to include, and the Next.js static export rules in AGENTS.md.

### 4.4 Suggested first steps (my estimate of order)

1. Write the ARM template validator and expression parser with golden tests copied from Learn examples.
2. Build the dependency graph and the deploy-in-order loop against the sandbox engine, with RBAC checks.
3. Add the what-if diff and the text and JSON formatters.
4. Extend `check:snippets` so each catalog Bicep example also writes its compiled ARM JSON, and add the "deploy every catalog example" test.

---

## 5. What I could not verify (summary)

- I did **not** build `Bicep.Wasm` locally, so build time, tool versions that really work, and output size from our own build are unknown.
- I did **not** capture a real first-load network trace of the playground (worker requests were invisible to the page's Performance API) and did not test Brotli. The 48.5 MB gzip figure is a sum of per-file downloads using my gzip level 6; for the two files compared against server `Content-Length` it was within about 1%.
- Whether Bicep still compiles with `Azure.Bicep.Types.Az` removed or trimmed, whether all 174 files are fetched at startup, and how local multi-file modules work in the WASM.
- Licences and notices for non-Microsoft assemblies inside the bundle; any official statement that the playground's static files may be re-hosted.
- The `uniqueString` algorithm; symbols and colours for NoChange, Ignore, NoEffect and Unsupported in CLI text output; why the Learn what-if text lists `NoEffect` and not `Unsupported`.
- Learn pages I did not fetch: the complete-mode deletion table, array/date/lambda/object function pages, nested/linked template pages, error-code troubleshooting. Function counts in section 3 come from the category lists on `template-functions` and `template-functions-string`, not from every function page.
- `bicep-node` source (only its npm description and repository field were read). No Microsoft-hosted `Azure/bicep-node` repository was found.
- The Next.js side: how to serve large WASM assets and a Web Worker from the static export (AGENTS.md says to read the local Next docs first; not done here).
