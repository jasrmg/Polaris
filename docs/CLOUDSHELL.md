# Polaris sandbox: the simulated Cloud Shell

**Status:** design, checkpoint 10 (written 2026-10-27). Built in checkpoint 17 (shell v1) and 18 (deployments, v2).
**Siblings:** [`SIMULATOR.md`](SIMULATOR.md) (engine, pipeline, world) and [`RBAC.md`](RBAC.md) (authorisation, "act as"). Evidence: [`research/spike-b-bicep-in-browser.md`](research/spike-b-bicep-in-browser.md) (`spike-b`) and [`research/spike-c-azure-cli.md`](research/spike-c-azure-cli.md) (`spike-c`).
Tags **[Learn]**, **[Decision]**, **[Owner]**, **[Open]** as in `SIMULATOR.md` section 0. Where a fact comes from the Azure CLI source or a community report instead of Learn it is marked **[Source]** or **[Community]**; **[Community]** text is never copied into the catalog or presented as Azure's wording.

**What it is:** a terminal in the page that accepts a documented subset of the Azure CLI (`az`) and runs it against the in-browser world, through the same engine functions the create forms use. **What it is not:** a real shell, a real Azure subscription, a network client. A banner says "Simulated Azure Cloud Shell: nothing here touches real Azure" at all times.

## 1. Decisions

| Decision | Answer |
|---|---|
| **[Owner]** Deployments in v1 | ARM JSON only. Catalog Bicep examples are compiled to ARM at build time. No in-browser Bicep compiler. |
| **[Owner]** Identity | The shell acts as the selected simulated identity (`RBAC.md` section 10). |
| **[Decision]** `--query` | The official `jmespath.js` 0.16.0 (section 9). |
| **[Decision]** Help text | Short, Learn-checked summaries from a build-time registry of exactly the commands we support; MIT-licensed `azure-cli` is the preferred raw source (section 10). |
| **[Decision]** PowerShell flavour | Deferred. Decide after v2; the catalog's PowerShell examples are shown, not run, until then. |
| **[Decision]** Scope | Commands the catalog uses first (63 commands, 139 flags), then the groups every command needs. Anything else: `az` says it is not supported in the simulator and links to the Learn reference page. |

## 2. Architecture

```
input line(s)
  → tokenizer / mini-shell (quotes, \ continuation, # comments, $VAR, $(...), |, @-, $RANDOM)
  → az argument parser (registry: command path, flags with aliases and types, required, defaults)
  → authorise as the acting identity (RBAC.md)  → engine call (SIMULATOR.md pipeline)
  → result object (ARM-shaped JSON)
  → --query (JMESPath over the result)
  → formatter (json, jsonc, yaml, yamlc, table, tsv, none)
  → terminal (stdout and stderr, exit code)
```

- **Registry from data [Source, spike-c 5.1].** One registry entry per command: path, summary, parameters (names, aliases such as `--name -n`, type, required, default, accepted values), examples, handler id, and the engine type it acts on. `--help`, flag validation and the "unrecognized arguments" error are derived from it. The build **fails** if a catalog `cli:` flag is missing from the registry; today 61 of the 63 catalog commands already match Learn's reference flag for flag, and the other two use `--out`, a documented alias of `--output` ([Learn, `cli/azure/format-output-azure-cli`]).
- **Pure functions.** `run(world, line, session) → { world, stdout, stderr, exitCode }`. No timers inside; asynchronous work is advanced by the engine clock (`SIMULATOR.md` section 4.3).
- **Security and robustness:** user input is parsed, never evaluated as JavaScript. Cap line length, number of tokens, template size, copy counts (800) and recursion so a bad paste cannot freeze the tab.

## 3. Grammar [Learn, spike-c 1.1]

`az <group> [<subgroup> ...] <command> [--flag value ...]`. Groups nest up to four levels in the catalog (`az network private-dns link vnet create`, `az webapp deployment slot swap`). Learn's reference pages list required parameters first and optional ones in brackets. `--name --resource-group -g -n` means those spellings are aliases of one argument. Aliases are **per command**, not global ([Learn, `cli/azure/group`]).

- Tags: `--tags key[=value] [key[=value] ...]`.
- Boolean flags work with no value (`--is-linux`) and with a value (`--https-only true`).
- Lists after one flag are space separated (`--tags env=dev owner=you`, `--address-prefixes 10.0.0.0/16`).
- `host:port` values are plain strings (`--local 10.0.1.4:60000`).
- Core versus extension commands: Learn marks each ("Core"/"Extension", "GA"/"Preview"). Of the 63 commands, 62 are Core GA; `az network bastion create` is an extension command that installs itself on first use ([Learn, `cli/azure/network/bastion`]), and the catalog runs `az extension add --name containerapp --upgrade`. **[Decision]** the registry records `extension: "bastion"` and the shell prints a short "installing extension" line the first time, then remembers it in the session.

**Global arguments** [Learn, `cli/azure/azure-cli-global-parameters`]: `--debug`, `--help -h`, `--only-show-errors`, `--output -o` (default `json`; `json, jsonc, none, table, tsv, yaml, yamlc`; `--out` alias), `--query`, `--subscription`, `--verbose`. `--no-wait` and `--yes -y` are **not** global; they exist only on commands that support them. `--acquire-policy-token` and `--change-reference` appear on create/update commands; **[Decision]** accept and ignore them. `--verbose` appends a timing line in Learn's example form (`Command ran in 1.413 seconds ...`; the numbers are simulated). `--debug` prints a short fake trace.

## 4. The mini-shell [Source, spike-c 2.1]

The catalog's CLI snippets use these features, so v1 must handle all of them or the "every catalog example runs" test fails:

| Feature | Seen in | Example |
|---|---|---|
| Line continuation `\` | all multi-line examples | `az group create \` newline `--name ...` |
| Comments | blob-container, private-endpoint | `# Give yourself a data role first ...` |
| Variable from command substitution | alert-rule (2), blob-container, private-endpoint | `VM_ID=$(az vm show ... --query id --output tsv)` |
| `$RANDOM` | app-service | `APP_NAME="app-polaris-$RANDOM"` |
| Variable expansion, quoted and unquoted | app-service, alert-rule, blob-container | `--scope "$STORAGE_ID"` |
| Double-quoted strings with spaces and colons | several | `--condition "avg Percentage CPU > 80"`, `--query "{FQDN:ipAddress.fqdn,...}"` |
| Pipe and stdin marker `@-` | blob-container | `az ad signed-in-user show --query id --output tsv \| az role assignment create --assignee @- ...` |
| Local file path | app-service | `--src-path ./app.zip` |

Beyond `az` itself the shell supports a small, honest set of built-ins: `echo`, `clear`, `help`, `cat` and `ls` over a **virtual file store** (files the user pastes, uploads or loads from the catalog, such as `./app.zip` as a placeholder and ARM templates), `export VAR=...`, and the variables above. Anything else prints "command not found in the simulated shell". **[Decision]** single quotes keep text literal, double quotes expand `$VAR` and `$(...)`, and the quoting rules follow Bash. Learn's guidance on JMESPath quoting (strings in single quotes or backticks; double quotes inside a filter predicate give empty output; the Bash backslash before backticks inside double quotes) is the test set for the quoting code. [Learn, `cli/azure/query-azure-cli`]

## 5. Output formats [Learn, `cli/azure/format-output-azure-cli`]

| `-o` | Behaviour |
|---|---|
| `json` | Default. Keys are sorted alphabetically in all of Learn's examples, so the formatter sorts keys. `provisioningState` is nested under `properties` for a resource group, matching Learn's example. |
| `jsonc`, `yamlc` | Colourised. Render with spans; plain when colour is off. |
| `yaml` | Human-readable YAML. |
| `table` | ASCII table with keys as column headings. Learn: nested objects are not included; the keys `id`, `type` and `etag` are not printed; use `--query` rekeying to rename. **[Source]** header = key with its first letter upper-cased (`resource` becomes `Resource`); null, list and dict values are dropped; scalar results get the header `Result`. |
| `tsv` | Tab and newline separated, no keys, nested objects not printed, "no guarantee on output ordering"; use `[].[a, b]` to force order. A string result prints bare, which is what makes `ID=$(az ... --query id --output tsv)` work; without `tsv` the value keeps its quotes ([Learn, `cli/azure/query-azure-cli`]). Null prints `None`. |
| `none` | No stdout. Errors and warnings still print. |

**Caveat [Source, spike-c 1.4]:** many commands have their own table transformer that chooses columns (`az vm list -o table` shows `Name ResourceGroup Location`; `az network vnet` has columns `Name, ResourceGroup, Location, NumSubnets, Prefixes, DnsServers, DDOSProtection, VMProtection`). Learn documents the table for only a few commands. **[Decision]** use Learn's shown columns where it shows them, the auto-table rule for the rest, and put "Output shape follows the generic table rule" in the command's help when no Learn example exists. Default format can be changed with `az config set core.output=table` [Learn].

**`az account list` and `az group list` table output are not shown by Learn** (spike-c section 6). They are derived from the `az account show` object and the generic rule, and flagged in the registry as `shape: "derived"`.

## 6. `--query` [Learn, `cli/azure/query-azure-cli`]

"All commands in Azure CLI support the `--query` parameter." It runs client-side on the returned JSON before formatting; results stay JSON for table/tsv/yaml; query strings are case sensitive; commands returning several objects return an array. Learn's examples that the tests must pass: projection `[].{Name:name, OS:storageProfile.osDisk.osType}`, filter `[?isDefault].name`, `[?!isDefault]`, comparison `>=` with backtick numbers, `contains(...)`, pipe `| [? contains(...)]`, `sort_by(..., &Size)`, multiselect list, flatten `publicKeys[].keyData`, and the six `--query` forms in the catalog.

Implementation: see section 9 (spike verdict C). An invalid query prints `Invalid jmespath query supplied for \`--query\`: <message>` **[Source: azure-cli `util.py`]** with the library's own message, because JavaScript messages differ from the Python library's (the CLI pins `jmespath==0.9.5`).

## 7. Session state

**[Learn, spike-c 1.6]**

- **`az login`**: "Log in to Azure. By default, this command logs in with a user account." Variants `--service-principal --username APP_ID --password CLIENT_SECRET --tenant TENANT_ID` and `--identity`. Interactive login prints a subscription selector table when several exist ([Learn, `cli/azure/authenticate-azure-cli-interactively`]). **[Decision]** in the simulation `az login` shows the directory's users and service principals to pick (no passwords), `--service-principal` and `--identity` accept any directory service principal or managed identity, and `az logout` returns to the signed-in "You". Cloud Shell is already signed in ("Cloud Shell automatically securely authenticates", [Learn, `azure/cloud-shell/overview`]), so a fresh session starts signed in and `az login` is optional; `az account show` prints `cloudShellID: true` inside `user` as Learn's Cloud Shell example does.
- **`az account show / set / list / list-locations / clear`**: default subscription logic as documented ("If the subscription isn't specified, shows the details of the default subscription"; `list` shows only Enabled subscriptions unless `--all`). `az account show` JSON has `environmentName, homeTenantId, id, isDefault, managedByTenants, name, state, tenantId, user {name, type}` ([Learn, `cli/azure/get-started-tutorial-1-prepare-environment`]).
- **Defaults:** `az configure --defaults group=myRG location=southeastasia`, `--list-defaults`, clear with `''`; `az config set defaults.group=... defaults.location=...`; keys `defaults.group`, `defaults.location`, `defaults.web`, `defaults.vm`, `defaults.vmss`, `defaults.acr`. "When you provide a default value, that argument is no longer required by any command." Environment variables `AZURE_DEFAULTS_LOCATION` and so on. Defaults are stored in the world's `session`.
- **Wrong-subscription lesson [Learn, spike-c 1.7]:** `The subscription of '"<guid>"' doesn't exist in cloud 'AzureCloud'.` appears when a quoted JSON string from `--query` without `--output tsv` is used as an ID; the registry keeps this as a scripted teaching error.
- **Unregistered provider [Learn]:** commands such as `az storage account create` give "Subscription not found" when the provider is not registered; `az provider register --namespace Microsoft.App` supports the lesson. The engine follows `SIMULATOR.md` section 4.7.

## 8. Errors [Learn and Source, spike-c 1.7]

**Format:** service errors print `ERROR: (Code) Message`, then `Code: ...`, `Message: ...` and optional `Target`/`Exception Details` lines **[Source: azure-core `ODataV4Format`]**; CLI errors print `ERROR: <message>`, then recommendation lines (`TRY THIS:` and an example) **[Source: `azclierror.py`]**. Exit code 1 for handled errors. **[Decision]** always print the `ERROR: ` prefix, in red. **[Open]** knack hides the prefix when colour is on; both forms occur in the wild, so this is a presentation choice.

Documented text we may use verbatim (all [Learn]):

| Code | Text |
|---|---|
| `ResourceNotFound` | `Code=ResourceNotFound; Message=The Resource 'Microsoft.Storage/storageAccounts/{name}' under resource group {rg} was not found.` ([`.../troubleshooting/error-not-found`]) |
| `AuthorizationFailed` | `The client '<client>' with object id '<objectId>' does not have authorization to perform action '<action>' over scope '<scope>' or the scope is invalid.` and for role assignments `... If access was recently granted, please refresh your credentials.` ([`.../role-based-access-control/troubleshooting`]). Generated from `AccessDecision` (`RBAC.md` section 5.3). |
| `AccountNameInvalid` | `<name> is not a valid storage account name. Storage account name must be between 3 and 24 characters in length and use numbers and lower-case letters only.` |
| `StorageAccountAlreadyTaken` | `The storage account named <name> is already taken.` |
| `StorageAccountInAnotherResourceGroup` | `The account <name> is already in another resource group in this subscription.` |
| `InvalidResourceLocation` | `The resource '<name>' already exists in location '<loc>' in resource group '<rg>'. A resource with the same name cannot be created in location '<other>'. Please select a new resource name.` |
| `InvalidTemplateDeployment` | JSON example with `SkuNotAvailable` detail ([`cli/azure/use-azure-cli-successfully-troubleshooting`]) |
| `RoleDefinitionHasAssignments` | named in `.../custom-roles`; message text is **sandbox wording** |
| CLI categories | unrecognized argument, required argument missing, mutually exclusive argument, invalid argument value, bad request, resource not found, authentication |

**Not on Learn, so labelled "(sandbox wording)" in the text:** the `ResourceGroupNotFound` message (Learn gives only the code; the usual `(ResourceGroupNotFound) Resource group 'x' could not be found.` is **[Community]**), the storage name-availability code in `az storage account check-name` output, the confirmation prompt of `az group delete`. Do not paste community text into catalog content. **[Decision]** the shell shows a small "(simulated wording)" tag in the margin for these lines.

## 9. Spike C verdict: JMESPath

Evidence: `spike-c` section 3.

**Verdict: use `jmespath.js` 0.16.0 from the official `jmespath` organisation, pinned.**

- Apache-2.0, 5.7 KB gzipped, no dependencies, implements the 26 functions of the original spec, passes 885 of 892 cases of the current official compliance suite plus every Learn example and every catalog query in a local test (Node 24; not yet tried through the Next.js bundler or a browser).
- **Maintenance risk:** last release and last commit 2022-01-19. The 7 failing cases are edge cases (ordering operators on non-numbers, `max_by`/`min_by` on empty arrays, empty slice step). Patch them in a small wrapper, not a fork, and keep a CI test that runs the official suite with those 7 as expected failures.
- **Fidelity:** the real CLI uses the Python library pinned at 0.9.5; the original-spec library is the closest match. The maintained alternative `@jmespath-community/jmespath` (MPL-2.0, 891/892, 12 KB gzipped) is a community fork of the spec with extensions and a different raw-string escape, so it is **not** byte-compatible with `az`. It is the fallback if the original library breaks, after checking against the catalog's queries (none use raw-string escapes). MPL-2.0 is file-level copyleft; ask the owner before adopting it.
- Wrap library errors into one `Invalid jmespath query` message; apply `--query` before the formatter exactly as the CLI does.
- Keep the Apache-2.0 notice on the credits page.

## 10. Spike D verdict: reusing `az` help text

Evidence: `spike-c` section 4.

**Verdict: reuse is allowed; keep it small and attributed.**

- `Azure/azure-cli` is **MIT** (Microsoft). Reuse needs the copyright and permission notice kept. Learn's CLI reference pages are generated from that same source (the docs repo README says so), so a string from either is the same text. Learn's site terms say personal and non-commercial use; the MIT repo is the cleaner source. [Source; not legal advice]
- Help lives in 77 `_help.py` files (5,513 entries, 2.8 MB) plus docstrings inside about 3,281 generated "AAZ" command files. Shipping all of it is neither needed nor sensible.
- **Plan:** a build script extracts, for only the commands in our registry, the summary, parameter help and examples at a **pinned azure-cli tag** (2.91.0 was current on 2026-10-27), writes a few tens of KB of JSON with the tag, date and licence notice, and a human reviews the diff. If extraction from AAZ-generated files proves too fragile when tried on five commands at the start of checkpoint 17, fall back to hand-curated short summaries checked against the Learn reference page, with attribution. Either way the build fails when a supported flag has no help text.
- `az <cmd> --help` output sections: `Command` (or `Group`), `Arguments`, `Global Arguments`, `Examples`, with `Subgroups:` and `Commands:` blocks for groups; required arguments tagged `[Required]`. [Learn, `cli/azure/azure-cli-global-parameters`]

## 11. Command groups (checkpoint 17 and after)

The catalog uses **63 distinct commands in 15 groups, 81 invocations**. By group: `network` 26 commands, `monitor` 7, `storage` 6, `webapp` 6, `appservice` 2, `backup` 4, `vm` 2, `containerapp` 2, `container` 2, `provider` 1, `group` 1, `ad` 1, `role` 1, `extension` 1, `vmss` 1. The full command-by-flag table is in `spike-c` section 2 and is regenerated from the catalog by a script, not maintained by hand.

| Wave | Commands |
|---|---|
| **v1 (checkpoint 17)** | Session: `login`, `logout`, `account show/set/list/list-locations/clear`, `configure`, `config set`, `version`, `extension add`, `provider register/show`. `group create/show/list/delete/exists`. Networking: `network vnet` (+ `subnet`, `peering`) create/show/list/update, `nsg` (+ `rule`), `public-ip`, `route-table` (+ `route`), `asg`, `nic`, `private-dns zone / link vnet`, `lb`. `vm create/show/list/start/stop/deallocate/delete`. `storage account create/show/update/network-rule add`. `role assignment create/list/delete`, `role definition list/show`. `ad signed-in-user show` (simulated directory object). |
| **v1.5** | Everything else in the 63, registered from data: `webapp`, `appservice`, `container`, `containerapp`, `vmss`, `monitor`, `backup`, `network watcher`, `network bastion`, `network dns`, `network private-endpoint`, `storage container/share-rm`. |
| **v2 (checkpoint 18)** | `deployment group create/what-if/validate/show/list/delete`, `deployment sub ...`, `resource list/show/delete`, `tag`, `lock`, `policy` as governance (checkpoint 14) provides them. |

`az ad ...` is Microsoft Entra, not Azure Resource Manager; it works on the simulated directory. Everything unsupported prints: `<command> is not supported in the simulator. Reference: <Learn URL>`.

**Drift rules:** every catalog `cli:` snippet runs against a fresh world in a test and must succeed; a snippet that cannot is either fixed or marked `simulator: "notRunnable"` with a stated reason in the entry file.

## 12. Deployments, what-if and export (checkpoint 18)

### 12.1 Spike B verdict: Bicep in the browser

Evidence: `spike-b`.

**Verdict: Bicep can compile in a browser, but we will not ship it in v1.**

- **Feasible:** the official Bicep playground runs the real compiler as .NET WebAssembly in a Web Worker ([Learn, Bicep playground]; source in `Azure/bicep`, MIT). A sample compiled in the live playground.
- **Heavy:** about 70.6 MB uncompressed, about 48.5 MB gzipped, 174 files; 37.8 MB is one file (the resource type definitions). It is not on npm and not in GitHub releases, so we would build it from source (.NET + `wasm-tools`) or copy the playground's static files. `bicep-node` wraps the CLI and cannot run in a browser.
- **[Owner] decision:** ship ARM JSON only in v1. Catalog Bicep examples are compiled to ARM at build time by the existing `npm run check:snippets` step (extended to write the ARM output). In-browser Bicep stays an optional, lazy-loaded, opt-in feature to revisit after v1.
- **The hard part is the engine, not Bicep.** Compiled Bicep is ARM JSON, so the expression evaluator, dependency ordering and what-if are needed either way.

### 12.2 What v1 deployments support

`az deployment group create | what-if | validate | show | list | delete`, at resource group scope, **Incremental** mode, ARM JSON from the virtual file store. `--parameters` as file, inline JSON and `KEY=VALUE`, later values overriding earlier. Template size limits stated by Learn: 256 parameters, 256 variables, 800 resources, 64 outputs; parameter types `string, securestring, int, bool, object, secureObject, array` with `allowedValues`, `minValue`, `maxValue`, `minLength`, `maxLength`. [Learn, `azure/azure-resource-manager/templates/syntax`]

**Expression engine, curated subset (parsed, never `eval`):** `parameters`, `variables`, `resourceGroup`, `subscription`, `concat`, `format`, `toLower`, `toUpper`, `replace`, `substring`, `split`, `length`, `if`, `equals`, `and`, `or`, `not`, `add`, `sub`, `copyIndex`, `resourceId`, `uniqueString` (labelled simulated: the algorithm is not documented, so values differ from Azure), `union`, `createObject`. An unknown function gives "function X is not supported in this simulator". Also `condition`, `dependsOn` (implicit edges from `reference(name)`), resource-level `copy` (count up to 800, `copyIndex`), `outputs`. Dependency order: deploy in dependency order, otherwise in parallel; children have no implicit dependency on the parent; circular dependencies are an error. [Learn, `.../templates/resource-dependency`, `.../copy-resources`, `.../conditional-resource-deployment`]

**Incremental redeploy reapplies all properties:** "Properties that aren't included in the template are reset to the default values." The template is the final state, not a partial update. The engine **replaces** rather than merges, which needs correct defaults per type; where a default is not documented the deployment reports the property as "not modelled" instead of inventing one (spike-b risk 2). [Learn, `.../templates/deployment-modes`]

**Authorisation:** `Microsoft.Resources/deployments/*` plus write on each resource, through the RBAC evaluator. What-if needs the same permissions as deploy. [Learn, `.../templates/deploy-what-if`]

**Only resource types the engine models** deploy; others fail on `create` with a clear error and appear as `Unsupported` in what-if.

### 12.3 What-if output [Learn, `.../templates/deploy-what-if`; REST `Deployments - What If` 2024-03-01]

- Commands `az deployment group what-if` (and `sub`, `mg`, `tenant` later); `az deployment group create --confirm-with-what-if` (`-c`); `--no-pretty-print` JSON; `--result-format {FullResourcePayloads, ResourceIdOnly}`; `--exclude-change-types`.
- **Resource change types:** REST and CLI list `Create, Delete, Ignore, Deploy, NoChange, Modify, Unsupported`; the Learn page text lists `NoEffect` instead of `Unsupported` (and `NoEffect` is a *property* change type in REST). **[Decision]** use the REST/CLI set, because the shell must match the CLI.
- **Text layout:** use Learn's exactly: the legend `- Delete`, `+ Create`, `~ Modify`, `Scope: ...`, resource lines `~ Microsoft.Network/virtualNetworks/vnet-001 [2018-10-01]`, property paths and `Resource changes: 1 to modify.`; resource-ID-only format uses `! Deploy`. **[Open]** symbols and colours for NoChange, Ignore, NoEffect and Unsupported are not shown on the pages read; print them in a clearly labelled simulated format.
- **Algorithm [Decision]:** evaluate the template against the world (every expression except `reference`), then per resource: absent gives Create; present and equal gives NoChange; present and different gives Modify with a property delta; in the world but not in the template gives Ignore (incremental) or Delete (complete, later).
- **Learn's quirks:** `reference()` cannot be resolved, so a property set from it always shows as changing (replicate); real what-if has "noise" from service-side defaults (a like-for-like simulator does not; documented as a deliberate difference).

### 12.4 Deferred

Complete mode (Learn: "not recommended", "gradually deprecated" in favour of deployment stacks), subscription / management group / tenant scope (subscription scope first, it creates resource groups, policy and role assignments), nested deployments, `languageVersion` 2.0, user-defined functions, lambdas, full `reference()` and `list*()`, linked templates (no network), rollback, template specs, deployment stacks. Flags for these are accepted and print "not supported in the simulator" where harmless.

### 12.5 Export

`az group export` and "export as ARM / Bicep" are checkpoint 18 stretch items. The world serialises resources through the same per-type adapters used for deployments; Bicep text is not generated in v1.

## 13. Terminal UI (checkpoint 17)

- A page and a docked panel; responsive: on a phone the terminal takes the full width and a **commands palette** replaces typing long flags. Check at 390 px as with every page.
- History (up/down), copy-run buttons next to every CLI example in the catalog ("Run in simulated Cloud Shell"), tab completion in v2.
- Output lines link to Learn for errors; each refusal shows the "why" from the engine trace (`SIMULATOR.md` principle 1).
- Accessibility: the terminal is a log region (`role="log"`), keyboard operable, no colour-only meaning.

## 14. Not verified and open

1. Table and tsv shapes for `az account list`, `az group list`, `az group show`; per-command table transformers beyond what Learn shows.
2. Official text for `ResourceGroupNotFound`, the storage `check-name` output, the `az group delete` prompt.
3. When the `ERROR: ` prefix shows in real Cloud Shell.
4. Differences between `jmespath.py` 0.9.5 and `jmespath.js` beyond the 7 known failures; whether `jmespath.js` runs through the Next.js bundler unmodified.
5. Whether AAZ-generated help can be extracted reliably (decided by trying at the start of checkpoint 17).
6. `uniqueString` algorithm; CLI symbols for several what-if change types; why Learn's what-if text lists `NoEffect`.
7. The complete-mode deletion table, array, date, lambda and object function pages, nested and linked template pages and error-code pages on Learn were not fetched.
8. How Next.js serves a Web Worker or large static asset in the static export (only needed if in-browser Bicep is revisited); read `node_modules/next/dist/docs/` first, as `AGENTS.md` requires.
9. Licence status of `jmespath/jmespath.test` (no licence file) and the audit of azure-cli `NOTICE.txt`.
