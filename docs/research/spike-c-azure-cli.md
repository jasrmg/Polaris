# Spike C: Azure CLI grammar, command surface, JMESPath, help text

Research only. No code was changed. All web facts were fetched on **2026-10-27** (access date for every URL below unless stated). Learn pages were fetched with `curl` and read as text; GitHub files were read from `raw.githubusercontent.com` or from local clones in `/tmp` (GitHub's REST API hit the unauthenticated rate limit, so Atom feeds and `git clone` were used for dates). Where a fact comes from the Azure CLI source instead of Learn, the source file is named. Where a source is not official Microsoft documentation (GitHub issues, Q&A posts) it is labelled **community report** and must not be used as catalog content.

## 0. Verdict

- **The simulated `az` is feasible.** The grammar is small and fully documented. The 29 catalog entries use **63 distinct commands in 15 groups** and **139 distinct flags**. 61 of the 63 commands match their Learn reference page flag for flag (the other two use `--out`, a documented alias of `--output`).
- **JMESPath:** use the official `jmespath.js` 0.16.0 (Apache-2.0, 5.7 KB gzipped, no dependencies). It is unmaintained (last release and last master commit 2022-01-19) but passes 885 of 892 cases in the current official compliance suite. The 7 failures are edge cases. The actively maintained alternative is `@jmespath-community/jmespath` (MPL-2.0, passes 891/892, but it is a community fork of the spec with extensions and a different raw-string escape).
- **Help text reuse:** `Azure/azure-cli` is MIT licensed, and help text lives in the repo as `_help.py` files plus docstrings in generated "AAZ" command files. Reuse in a static site is permitted by the licence if the copyright and permission notice are kept. Learn's reference pages are generated from that same source.
- **Biggest risks:** table/tsv output shapes (the real CLI has per-command table transformers that Learn does not document), the exact text of several error messages (Learn documents codes, not full CLI text), and the shell features the catalog snippets use (`$(...)`, variables, pipes, `@-`). See section 6.

---

## 1. Command grammar, global arguments, output, errors

### 1.1 Grammar

`az <group> [<subgroup> ...] <command> [--flag value ...]`. Groups nest up to four levels in our catalog, for example `az network private-dns link vnet create`, `az network dns record-set a add-record`, `az webapp deployment slot swap`. Source: command group pages, for example [az group](https://learn.microsoft.com/en-us/cli/azure/group) (lists `az group lock create` etc. as nested), [az network vnet subnet](https://learn.microsoft.com/en-us/cli/azure/network/vnet/subnet).

Each Learn reference page gives a synopsis with required parameters first and optional ones in `[...]`, for example (from [az group](https://learn.microsoft.com/en-us/cli/azure/group)):

```
az group create --location
                --name --resource-group
                [--acquire-policy-token]
                [--change-reference]
                [--managed-by]
                [--tags]
```

- `--name --resource-group -g -n` means those four spellings are aliases of one argument. `--location -l` likewise. These short aliases are **per command, not global** (the page lists them under the command's own parameters).
- Tags use `--tags key[=value] [key[=value] ...]` ("Space-separated tags ... Use "" to clear existing tags"). The catalog's `--tags env=dev owner=you` matches.
- Some commands are in extensions rather than core. Learn marks this in the group table ("Core" / "Extension" and "GA" / "Preview"). Of our 63 commands, 62 are Core/GA and `az network bastion create` is Extension/GA ([az network bastion](https://learn.microsoft.com/en-us/cli/azure/network/bastion): "part of the bastion extension ... will automatically install the first time you run an `az network bastion` command"). `az containerapp create` appears twice on [az containerapp](https://learn.microsoft.com/en-us/cli/azure/containerapp) (core and "containerapp extension" variants), and the catalog still runs `az extension add --name containerapp --upgrade`.

### 1.2 Global arguments

Learn lists these as "Global Parameters" at the bottom of every command page (example: [az group](https://learn.microsoft.com/en-us/cli/azure/group)) and explains them in [How to work with global parameters](https://learn.microsoft.com/en-us/cli/azure/azure-cli-global-parameters):

| Flag | Learn text (verbatim) | Default / values |
|---|---|---|
| `--debug` | "Increase logging verbosity to show all debug logs." | False |
| `--help -h` | "Show this help message and exit." | |
| `--only-show-errors` | "Only show errors, suppressing warnings." | False |
| `--output -o` | "Output format." | `json`; accepted `json, jsonc, none, table, tsv, yaml, yamlc` |
| `--query` | "JMESPath query string. See http://jmespath.org/ for more information and examples." | |
| `--subscription` | "Name or ID of subscription. You can configure the default subscription using `az account set -s NAME_OR_ID`." | |
| `--verbose` | "Increase logging verbosity. Use --debug for full debug logs." | False |

Notes:
- `--out` is a documented alias: "Use the `--output` (`--out` or `-o`) parameter" ([Output formats](https://learn.microsoft.com/en-us/cli/azure/format-output-azure-cli)). Two catalog entries (`network-watcher`) use `--out table`.
- `--no-wait` and `--yes/-y` are **not** global. They exist only on commands that support them. From [az group](https://learn.microsoft.com/en-us/cli/azure/group) (`az group delete`): `--no-wait` "Do not wait for the long-running operation to finish." (default False); `--yes -y` "Do not prompt for confirmation." (default False). Learn's [Tips for using the Azure CLI successfully](https://learn.microsoft.com/en-us/cli/azure/use-azure-cli-successfully) shows `az group delete --name MyResourceGroup --no-wait` and `az vm create ... --no-wait`.
- Most create/update commands also list `--acquire-policy-token` and `--change-reference` ("Global Policy Arguments" parameter group). Not used in our catalog; safe to ignore or accept silently.
- `--verbose` adds a timing line at the end. Learn example: `Command ran in 1.413 seconds (init: 0.487, invoke: 0.926)` ([global parameters](https://learn.microsoft.com/en-us/cli/azure/azure-cli-global-parameters)).
- `--debug` prints logger lines such as `cli.knack.cli: Command arguments: ['group', 'create', '--name', 'myResourceGroup', '--location', 'eastus', '--debug']` (same page). Not worth simulating beyond a short fake trace.
- `--only-show-errors` removes warnings (Learn's example removes the preview banner of `az interactive`).

### 1.3 `--help`

Learn example for a command ([global parameters](https://learn.microsoft.com/en-us/cli/azure/azure-cli-global-parameters), "fields omitted for brevity"):

```
Command
    az group create : Create a new resource group.

Arguments
    --location -l                 [Required] : Location. Values from: `az account list-locations`.
                                               You can configure the default location using `az
                                               configure --defaults location=<location>`.
    --name --resource-group -g -n [Required] : Name of the new resource group.
    --managed-by                             : The ID of the resource that manages this resource
                                               group.
    --tags                                   : Space-separated tags: key[=value] [key[=value] ...].
                                               Use "" to clear existing tags.

Global Arguments
    --debug                                  : Increase logging verbosity to show all debug logs.
    --help -h                                : Show this help message and exit.
    --only-show-errors                       : Only show errors, suppressing warnings.

Examples
    Create a new resource group in the West US region.
        az group create -l westus -n MyResourceGroup
```

For a group, Learn shows only the Subgroups part ([Get started with Azure CLI](https://learn.microsoft.com/en-us/cli/azure/get-started-with-azure-cli)):

```
Subgroups:
  application            : Manage applications for VM.
  availability-set       : Group resources into availability sets.
  boot-diagnostics       : Troubleshoot the startup of an Azure Virtual Machine.
  ...
```

Learn's own example drops `--output`, `--query`, `--subscription` and `--verbose` from "Global Arguments"; the reference pages list all seven. Pick one list (the reference page one) and be consistent.

### 1.4 Output formats

Source: [Output formats for Azure CLI commands](https://learn.microsoft.com/en-us/cli/azure/format-output-azure-cli) (page last updated 2026-09-01 per its footer).

| `-o` | Learn description |
|---|---|
| `json` | "JSON string. This setting is the default" |
| `jsonc` | "Colorized JSON" |
| `table` | "ASCII table with keys as column headings" |
| `tsv` | "Tab-separated values, with no keys" |
| `yaml` | "YAML, a human-readable alternative to JSON" |
| `yamlc` | "Colorized YAML" |
| `none` | "No output other than errors and warnings" |

Real examples from Learn:

**json** (default). Resource group create ([Prepare your environment](https://learn.microsoft.com/en-us/cli/azure/get-started-tutorial-1-prepare-environment)). Note `provisioningState` is nested under `properties`:

```
{
  "id": "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/msdocs-tutorial-rg-000000000",
  "location": "eastus",
  "managedBy": null,
  "name": "msdocs-tutorial-rg-000000000",
  "properties": {
    "provisioningState": "Succeeded"
  },
  "tags": null,
  "type": "Microsoft.Resources/resourceGroups"
}
```

Same page, `az account show`:

```
{
  "environmentName": "AzureCloud",
  "homeTenantId": "00000000-0000-0000-0000-000000000000",
  "id": "00000000-0000-0000-0000-000000000000",
  "isDefault": true,
  "managedByTenants": [],
  "name": "Your storage account name",
  "state": "Enabled",
  "tenantId": "00000000-0000-0000-0000-000000000000",
  "user": {
    "name": "yourName@contoso.com",
    "type": "user"
  }
}
```

(Another Learn page, [Azure DocumentDB console app](https://learn.microsoft.com/en-us/azure/documentdb/how-to-build-dotnet-console-app), shows the same object inside Cloud Shell with `"cloudShellID": true` in `user`. Useful for our simulated Cloud Shell. Keys come out alphabetically sorted in all Learn examples.)

**yaml** (same page as output formats; fields omitted by Learn):

```
az vm list --output yaml
- availabilitySet: null
  diagnosticsProfile: null
  hardwareProfile:
    vmSize: Standard_DS1_v2
  id: /subscriptions/.../resourceGroups/DEMORG1/providers/Microsoft.Compute/virtualMachines/DemoVM010
  ...
```

**table**:

```
az vm list --output table
Name         ResourceGroup    Location
-----------  ---------------  ----------
DemoVM010    DEMORG1          westus
demovm212    DEMORG1          westus
```

With a query that renames keys (same page):

```
az vm list --query "[].{resource:resourceGroup, name:name}" --output table
Resource    Name
----------  -----------
DEMORG1     DemoVM010
```

Table rules stated by Learn: "Nested objects aren't included in table output"; the keys `id`, `type` and `etag` are not printed ("use the JMESPath rekeying feature to change the key name"). The header capitalisation (`resource` becomes `Resource`) is confirmed by the Azure CLI's output library, [knack `output.py`](https://github.com/microsoft/knack/blob/master/knack/output.py) (`_TableOutput`): `SKIP_KEYS = ['id', 'type', 'etag']`, header = first character upper-cased, values that are `None`, list, dict or set are dropped, list-of-lists get `Column1..N`, scalar results get a header `Result`, rendering uses the `tabulate` "simple" format. **Caveat:** many list/show commands have their own table transformer that picks columns (for example `az vm list -o table` shows `Name ResourceGroup Location`, and `az network vnet` has `transform_vnet_table_output` with `Name, ResourceGroup, Location, NumSubnets, Prefixes, DnsServers, DDOSProtection, VMProtection` in [`network/_format.py`](https://github.com/Azure/azure-cli/blob/dev/src/azure-cli/azure/cli/command_modules/network/_format.py); `az group list` uses `transform_resource_group_list` in [`resource/commands.py`](https://github.com/Azure/azure-cli/blob/dev/src/azure-cli/azure/cli/command_modules/resource/commands.py)). Learn documents the result only for a few commands. For the rest, the auto-table rule above is the honest fallback.

**tsv**:

```
az vm list --output tsv --query '[].[id, location, resourceGroup, name]'
/subscriptions/.../resourceGroups/DEMORG1/providers/Microsoft.Compute/virtualMachines/DemoVM010    westus    DEMORG1    DemoVM010
```

Learn: "tab and newline separated values without extra formatting, keys, or other symbols", "doesn't print nested objects", and "there isn't a guarantee on output ordering"; use a multiselect list `[key1, key2]` or `[].[key1, key2]` to force order. Without a query Learn's example prints `None` for null values. A string result prints bare, which is what makes `ID=$(az ... --query id --output tsv)` work. Learn's explanation ([query page](https://learn.microsoft.com/en-us/cli/azure/query-azure-cli)): without `tsv`, `USER=$(az vm show ... --query "osProfile.adminUsername")` gives `"azureuser"` including the quotes.

**none**: no stdout at all. Errors and warnings still print. Learn example: `az keyvault secret set ... --output none`.

**jsonc / yamlc**: colourised versions. knack only emits colour when colour is enabled; otherwise the output equals json/yaml ([knack `output.py`](https://github.com/microsoft/knack/blob/master/knack/output.py): `if not self.cli_ctx.enable_color and format_type == 'jsonc'` falls back). The simulator can render colour with spans or fall back to plain.

Default output can be changed with `az config set core.output=table` ([same page](https://learn.microsoft.com/en-us/cli/azure/format-output-azure-cli), "Set the default output format").

### 1.5 `--query`

Source: [How to query Azure CLI command output using a JMESPath query](https://learn.microsoft.com/en-us/cli/azure/query-azure-cli).

- "All commands in Azure CLI support the `--query` parameter." Queries run "client-side on the Azure CLI command's returned JSON object before any display formatting." Results are treated as JSON even if the output format is table/tsv/yaml.
- Commands that can return more than one object return an array; commands returning one object return a dictionary.
- Query strings are case sensitive (`osProfile` vs `OsProfile`).
- Learn: "In JMESPath, strings are always surrounded by single quotes (`'`) or escape characters (`` ` ``). If you use double quotes as part of a string in a filter predicate, you'll get empty output." Backtick literals are used for numbers and booleans, for example `[?isDefault == \`false\`].name` and `[?storageProfile.osDisk.diskSizeGb >=\`50\`]` (the backslash is a Bash escape inside double quotes; in single quotes none is needed: `az account list --query '[?!isDefault].name'`).
- Learn query examples and what they exercise: projection `[].{Name:name, OS:storageProfile.osDisk.osType}`, filter `[?isDefault].name`, `[?!isDefault]`, comparison `>=`, `contains(...)`, pipe `... | [? contains(Storage,'SSD')]`, `sort_by([].{Name:name, Size:...}, &Size)`, multiselect list `[name, osProfile.adminUsername]`, flatten `publicKeys[].keyData`. All of these (and the catalog's own queries, section 2) ran correctly against `jmespath.js` in a local test (section 3).
- Source detail from [knack `query.py`](https://github.com/microsoft/knack/blob/master/knack/query.py): the query is compiled when arguments are parsed, applied in the "filter result" step, and called with `Options(collections.OrderedDict)`, so multiselect-hash keys keep the order they are written in. In JavaScript, object key order is insertion order except for integer-like keys, so a hash like `{1:name}` would reorder; ignore.
- Invalid query message, from [`azure-cli-core/.../core/util.py`](https://github.com/Azure/azure-cli/blob/dev/src/azure-cli-core/azure/cli/core/util.py) `handle_exception`: `Invalid jmespath query supplied for \`--query\`: <jmespath message>` followed by a recommendation line (`QUERY_REFERENCE`). The jmespath messages come from the Python library (the CLI pins `jmespath==0.9.5`, see section 3), so exact text will differ from any JavaScript library. Own wording is fine.

### 1.6 Subscription, login, defaults

- **`az login`** ([reference index](https://learn.microsoft.com/en-us/cli/azure/reference-index) entry for `az login`): "Log in to Azure. By default, this command logs in with a user account." Examples: `az login`, `az login --service-principal --username APP_ID --password CLIENT_SECRET --tenant TENANT_ID`, `az login --identity`. Interactive sign-in shows a subscription selector ([Sign in interactively](https://learn.microsoft.com/en-us/cli/azure/authenticate-azure-cli-interactively)):

```
Retrieving subscriptions for the selection...
[Tenant and subscription selection]

No    Subscription name                     Subscription ID                           Tenant name
----  ------------------------------------  ----------------------------------------  --------------
[1]   Facility Services Subscription        00000000-0000-0000-0000-000000000000      Contoso
...
Select a subscription and tenant (Type a number or Enter for no changes): 2
```

  Cloud Shell is already signed in: "Cloud Shell automatically securely authenticates" ([Cloud Shell overview](https://learn.microsoft.com/en-us/azure/cloud-shell/overview)). So in the simulated Cloud Shell, `az login` is optional; a short fake message is enough.
- **`az account show [--name --subscription]`**: "Get the details of a subscription. If the subscription isn't specified, shows the details of the default subscription." **`az account set --name --subscription`** (`-n -s`, required): "Set a subscription to be the current active subscription." **`az account list [--all] [--refresh]`**: "By default, only 'Enabled' subscriptions from the current cloud is shown." **`az account list-locations`**: "List supported regions for the current subscription." **`az account clear`**: "Clear all subscriptions from the CLI's local cache." All from [az account](https://learn.microsoft.com/en-us/cli/azure/account). Learn's example query output uses `isDefault`, `name`, `id`, `tenantId` ([Manage subscriptions](https://learn.microsoft.com/en-us/cli/azure/manage-azure-subscriptions-azure-cli): `az account list --query "[?isDefault]"`). Learn does not print `az account list` or `az account list -o table` output, so those shapes must be derived from the `az account show` object.
- **Defaults.** `az configure --defaults group=myRG web=myweb vm=myvm`; clear with `az configure --defaults vm='' web=''`; `--list-defaults -l`; `--scope {global, local}` ([reference index](https://learn.microsoft.com/en-us/cli/azure/reference-index), `az configure`, which also says "This command is interactive. For automation ... use the new `az config`"). Learn's configuration page ([Azure CLI configuration](https://learn.microsoft.com/en-us/cli/azure/azure-cli-configuration)) lists the keys `defaults.group`, `defaults.location`, `defaults.web`, `defaults.vm`, `defaults.vmss`, `defaults.acr` and `az config set defaults.location=westus2 defaults.group=MyResourceGroup`, and states: "When you provide a default value, that argument is no longer required by any command. Instead, the default value is used." The `az group create` help says the same for location (`az configure --defaults location=<location>`). Env var form: `AZURE_{section}_{name}`, for example `AZURE_DEFAULTS_LOCATION`.

### 1.7 How errors print

**Prefix.** The CLI logs errors through Python logging. In knack's [`log.py`](https://github.com/microsoft/knack/blob/master/knack/log.py) the console format is built as: level name (`ERROR`, `WARNING`...) is **included only when colour is off** ("color: True: Hide level names; False: Show level names"), followed by `: ` and the message. So plain output (pipes, CI logs, many Cloud Shell captures) looks like `ERROR: <message>`, while an interactive coloured terminal shows the message in red without the prefix. Both forms appear in **community reports**: `ERROR: (ResourceNotFound) The Resource ...` in a CI log ([azure-cli issue 26574](https://github.com/Azure/azure-cli/issues/26574)) and no prefix in a terminal paste ([azure-cli issue 30992](https://github.com/Azure/azure-cli/issues/30992)). Recommendation: always print the `ERROR: ` prefix in the simulated shell (red, like a terminal that has colour). That matches what users paste into forums.

**Structure of service errors.** Azure SDK errors are formatted by [`azure-core` `exceptions.py`](https://github.com/Azure/azure-sdk-for-python/blob/main/sdk/core/azure-core/azure/core/exceptions.py) `ODataV4Format`: `"({code}) {message}\n"` then `Code: {code}`, `Message: {message}`, optional `Target: ...`, `Exception Details:` and `Inner error: ...`. That is why CLI errors have the message twice:

```
ERROR: (ResourceNotFound) The Resource 'Microsoft.Web/sites/aspnet-entra-web-app' under resource group 'mdk-demos' was not found. For more details please go to https://aka.ms/ARMResourceNotFoundFix
Code: ResourceNotFound
Message: The Resource 'Microsoft.Web/sites/aspnet-entra-web-app' under resource group 'mdk-demos' was not found. For more details please go to https://aka.ms/ARMResourceNotFoundFix
```

(real text from **community report** [azure-cli issue 30992](https://github.com/Azure/azure-cli/issues/30992), without the `ERROR:` prefix there; the structure is confirmed by the azure-core source above.) The exit code for handled errors is 1 (`exit_code = 1` in [`util.py`](https://github.com/Azure/azure-cli/blob/dev/src/azure-cli-core/azure/cli/core/util.py)). CLI-side errors (`azclierror`) are printed with `logger.error(message)` followed by recommendation lines ([`azclierror.py`](https://github.com/Azure/azure-cli/blob/dev/src/azure-cli-core/azure/cli/core/azclierror.py) `print_error`), for example the **community report** [azure-cli issue 22210](https://github.com/Azure/azure-cli/issues/22210): `ERROR: the following arguments are required: --subscription/-s` then `TRY THIS:` and an example command.

**Learn's own error documentation** (official, quote-safe):

| Code | What Learn gives | URL |
|---|---|---|
| `ResourceNotFound` | `Code=ResourceNotFound; Message=The Resource 'Microsoft.Storage/storageAccounts/{storage name}' under resource group {resource group name} was not found.` Also `Code=NotFound; Message=Cannot find ServerFarm with name exampleplan.` Three values to check: resource name, resource group name, subscription. | [Resolve errors for resource not found](https://learn.microsoft.com/en-us/azure/azure-resource-manager/troubleshooting/error-not-found) |
| `ResourceGroupNotFound` | Listed only as a code: "Check the name of the target resource group for the deployment. The target resource group must already exist in your subscription. Check your subscription context." **No message text on Learn.** The CLI text `(ResourceGroupNotFound) Resource group 'myrg01' could not be found.` is from **community reports** ([Q&A 1179698](https://learn.microsoft.com/en-us/answers/questions/1179698/syntax-error), [azure-cli issue 22210](https://github.com/Azure/azure-cli/issues/22210)). | [Common deployment errors](https://learn.microsoft.com/en-us/azure/azure-resource-manager/templates/common-deployment-errors) |
| `AuthorizationFailed` | Message format: `The client '<client>' with object id '<objectId>' does not have authorization to perform action '<action>' over scope '<scope>' or the scope is invalid.` The role-assignment variant on the same page ends with `... or the scope is invalid. If access was recently granted, please refresh your credentials.` Fix text: "to manage virtual machines in a resource group, you should have the Virtual Machine Contributor role on the resource group (or parent scope)". | [Troubleshoot Azure RBAC](https://learn.microsoft.com/en-us/azure/role-based-access-control/troubleshooting) |
| `InvalidTemplateDeployment` | Full CLI example (JSON form): `{"error":{"code":"InvalidTemplateDeployment","message":"The template deployment 'vm_deploy_<32 character ID>' is not valid according to the validation procedure. The tracking id is '<36 character ID>'. See inner errors for details.","details":[{"code":"SkuNotAvailable","message":"The requested VM size for resource 'Following SKUs have failed for Capacity Restrictions: Standard_DS1_v2' is currently not available in location 'westus'. Please try another size or deploy to a different location or different zone. See https://aka.ms/azureskunotavailable for details."}]}}` | [Troubleshooting Azure CLI](https://learn.microsoft.com/en-us/cli/azure/use-azure-cli-successfully-troubleshooting) |
| Storage account names | `Code=AccountNameInvalid; Message=S!torageckrexph7isnoc is not a valid storage account name. Storage account name must be between 3 and 24 characters in length and use numbers and lower-case letters only.` `Code=StorageAccountAlreadyTaken; Message=The storage account named storageckrexph7isnoc is already taken.` `Code=StorageAccountInAnotherResourceGroup; Message=The account storageckrexph7isnoc is already in another resource group in this subscription.` `Code=InvalidResourceLocation; Message=The resource 'storageckrexph7isnoc' already exists in location 'westus' in resource group 'demostorage'. A resource with the same name cannot be created in location 'eastus'. Please select a new resource name.` | [Resolve errors for storage account names](https://learn.microsoft.com/en-us/azure/azure-resource-manager/troubleshooting/error-storage-account-name) |

Other Learn facts that help error simulation:
- **`NameUnavailable`:** none of the Learn pages fetched for storage use it; Learn documents `StorageAccountAlreadyTaken` (the common-errors table also lists `StorageAccountAlreadyExists` as an alias in the same row). `NameUnavailable` appears in **community reports** for other services, for example `(NameUnavailable) The specified name is already in use.` for App Configuration ([azure-cli issue 22714](https://github.com/Azure/azure-cli/issues/22714)). Use `StorageAccountAlreadyTaken` for storage.
- `az storage account check-name --name` exists ("Check that the storage account name is valid and is not already in use", [az storage account](https://learn.microsoft.com/en-us/cli/azure/storage/account)). Learn does not show its output.
- The CLI error categories Learn lists ([Troubleshooting Azure CLI](https://learn.microsoft.com/en-us/cli/azure/use-azure-cli-successfully-troubleshooting)): unrecognized argument, required argument missing, mutually exclusive argument, invalid argument value, bad request, resource not found, authentication. Example of a typo: `cli.azure.cli.core.azclierror: unrecognized arguments: msdocs-rg-test`.
- Wrong subscription: `The subscription of '"00000000-0000-0000-0000-000000000000"' doesn't exist in cloud 'AzureCloud'.` (same page; it happens when the ID is a JSON-quoted string from a `--query` without `--output tsv`). This is a good teaching error for the simulator.
- An unregistered resource provider gives "Subscription not found" for commands such as `az storage account create` (same page). The catalog's `az provider register --namespace Microsoft.App` supports this lesson.

---

## 2. First command groups: the minimum surface from the catalog

Scan of every `cli:` field in `src/content/resources/*.ts` (29 files, all 29 have a `cli:` field). Counting rules: each `az ...` invocation is counted, including those inside `$(...)` and after a `|`. "Entries" is the number of catalog entries that use the command; "Calls" is total invocations. 63 distinct commands, 81 invocations, 15 top-level groups.

By top-level group (distinct commands / invocations): `network` 26 / 37, `monitor` 7 / 8, `storage` 6 / 8, `webapp` 6 / 6, `appservice` 2 / 4, `backup` 4 / 4, `vm` 2 / 2, `containerapp` 2 / 2, `container` 2 / 2, `provider` 1 / 2, `group` 1 / 2, `ad` 1 / 1, `role` 1 / 1, `extension` 1 / 1, `vmss` 1 / 1.

Most common commands: `az network public-ip create` (3 entries), `az network vnet subnet update` (3). All other commands have 1 or 2 entries. Flags by number of distinct commands that use them: `--resource-group` 57 of 63, `--name` 49, `--location` 13, `--sku` 7, `--query` 6, `--vnet-name` 6, `--output` 5. 108 of the 139 distinct flags appear on only one command.

| Command | Entries | Calls | Flags used (n entries if >1) |
|---|--:|--:|---|
| `az ad signed-in-user show` | 1 | 1 | `--output`, `--query` |
| `az appservice plan create` | 2 | 2 | `--is-linux` ×2, `--location`, `--name` ×2, `--number-of-workers`, `--resource-group` ×2, `--sku` ×2 |
| `az appservice plan update` | 1 | 2 | `--name`, `--number-of-workers`, `--resource-group`, `--sku` |
| `az backup protection backup-now` | 1 | 1 | `--backup-management-type`, `--container-name`, `--item-name`, `--resource-group`, `--retain-until`, `--vault-name` |
| `az backup protection enable-for-vm` | 1 | 1 | `--policy-name`, `--resource-group`, `--vault-name`, `--vm` |
| `az backup vault backup-properties set` | 1 | 1 | `--backup-storage-redundancy`, `--name`, `--resource-group` |
| `az backup vault create` | 1 | 1 | `--location`, `--name`, `--resource-group` |
| `az container create` | 1 | 1 | `--cpu`, `--dns-name-label`, `--image`, `--memory`, `--name`, `--os-type`, `--ports`, `--resource-group`, `--restart-policy` |
| `az container show` | 1 | 1 | `--name`, `--output`, `--query`, `--resource-group` |
| `az containerapp create` | 1 | 1 | `--environment`, `--image`, `--ingress`, `--max-replicas`, `--min-replicas`, `--name`, `--query`, `--resource-group`, `--scale-rule-http-concurrency`, `--scale-rule-name`, `--target-port` |
| `az containerapp env create` | 1 | 1 | `--location`, `--name`, `--resource-group` |
| `az extension add` | 1 | 1 | `--name`, `--upgrade` |
| `az group create` | 2 | 2 | `--location` ×2, `--name` ×2, `--tags` |
| `az monitor action-group create` | 1 | 1 | `--action`, `--location`, `--name`, `--resource-group`, `--short-name` |
| `az monitor action-group show` | 1 | 1 | `--name`, `--output`, `--query`, `--resource-group` |
| `az monitor autoscale create` | 1 | 1 | `--count`, `--max-count`, `--min-count`, `--name`, `--resource`, `--resource-group`, `--resource-type` |
| `az monitor autoscale rule create` | 1 | 2 | `--autoscale-name`, `--condition`, `--resource-group`, `--scale` |
| `az monitor log-analytics workspace create` | 1 | 1 | `--location`, `--quota`, `--resource-group`, `--retention-time`, `--sku`, `--workspace-name` |
| `az monitor log-analytics workspace show` | 1 | 1 | `--resource-group`, `--workspace-name` |
| `az monitor metrics alert create` | 1 | 1 | `--action`, `--condition`, `--description`, `--evaluation-frequency`, `--name`, `--resource-group`, `--scopes`, `--severity`, `--window-size` |
| `az network asg create` | 1 | 2 | `--location`, `--name`, `--resource-group` |
| `az network bastion create` | 1 | 1 | `--location`, `--name`, `--public-ip-address`, `--resource-group`, `--sku`, `--vnet-name` |
| `az network dns record-set a add-record` | 1 | 1 | `--ipv4-address`, `--record-set-name`, `--resource-group`, `--zone-name` |
| `az network dns zone create` | 1 | 1 | `--name`, `--resource-group` |
| `az network lb create` | 1 | 1 | `--backend-pool-name`, `--frontend-ip-name`, `--name`, `--public-ip-address`, `--resource-group`, `--sku` |
| `az network lb probe create` | 1 | 1 | `--lb-name`, `--name`, `--path`, `--port`, `--protocol`, `--resource-group` |
| `az network lb rule create` | 1 | 1 | `--backend-pool-name`, `--backend-port`, `--disable-outbound-snat`, `--enable-tcp-reset`, `--frontend-ip-name`, `--frontend-port`, `--lb-name`, `--name`, `--probe-name`, `--protocol`, `--resource-group` |
| `az network nic ip-config address-pool add` | 1 | 1 | `--address-pool`, `--ip-config-name`, `--lb-name`, `--nic-name`, `--resource-group` |
| `az network nic ip-config update` | 1 | 1 | `--application-security-groups`, `--name`, `--nic-name`, `--resource-group` |
| `az network nic update` | 1 | 1 | `--ip-forwarding`, `--name`, `--resource-group` |
| `az network nsg create` | 1 | 1 | `--location`, `--name`, `--resource-group` |
| `az network nsg rule create` | 2 | 2 | `--access` ×2, `--destination-address-prefixes`, `--destination-asgs`, `--destination-port-ranges` ×2, `--direction` ×2, `--name` ×2, `--nsg-name` ×2, `--priority` ×2, `--protocol` ×2, `--resource-group` ×2, `--source-address-prefixes`, `--source-asgs`, `--source-port-ranges` |
| `az network private-dns link vnet create` | 2 | 2 | `--name` ×2, `--registration-enabled` ×2, `--resource-group` ×2, `--virtual-network` ×2, `--zone-name` ×2 |
| `az network private-dns zone create` | 2 | 2 | `--name` ×2, `--resource-group` ×2 |
| `az network private-endpoint create` | 1 | 1 | `--connection-name`, `--group-id`, `--name`, `--private-connection-resource-id`, `--resource-group`, `--subnet`, `--vnet-name` |
| `az network private-endpoint dns-zone-group create` | 1 | 1 | `--endpoint-name`, `--name`, `--private-dns-zone`, `--resource-group`, `--zone-name` |
| `az network public-ip create` | 3 | 3 | `--allocation-method` ×3, `--dns-name`, `--location`, `--name` ×3, `--resource-group` ×3, `--sku` ×3 |
| `az network route-table create` | 1 | 1 | `--disable-bgp-route-propagation`, `--location`, `--name`, `--resource-group` |
| `az network route-table route create` | 2 | 2 | `--address-prefix` ×2, `--name` ×2, `--next-hop-ip-address` ×2, `--next-hop-type` ×2, `--resource-group` ×2, `--route-table-name` ×2 |
| `az network vnet create` | 1 | 1 | `--address-prefixes`, `--location`, `--name`, `--resource-group`, `--subnet-name`, `--subnet-prefixes` |
| `az network vnet peering create` | 1 | 2 | `--allow-vnet-access`, `--name`, `--remote-vnet`, `--resource-group`, `--vnet-name` |
| `az network vnet subnet create` | 2 | 2 | `--address-prefixes` ×2, `--name` ×2, `--resource-group` ×2, `--vnet-name` ×2 |
| `az network vnet subnet update` | 3 | 3 | `--name` ×3, `--network-security-group`, `--resource-group` ×3, `--route-table`, `--service-endpoints`, `--vnet-name` ×3 |
| `az network watcher configure` | 1 | 1 | `--enabled`, `--locations`, `--resource-group` |
| `az network watcher show-next-hop` | 1 | 1 | `--dest-ip`, `--nic`, `--out`, `--resource-group`, `--source-ip`, `--vm` |
| `az network watcher test-ip-flow` | 1 | 1 | `--direction`, `--local`, `--nic`, `--out`, `--protocol`, `--remote`, `--resource-group`, `--vm` |
| `az provider register` | 1 | 2 | `--namespace` |
| `az role assignment create` | 1 | 1 | `--assignee`, `--role`, `--scope` |
| `az storage account create` | 2 | 2 | `--allow-blob-public-access`, `--kind` ×2, `--location` ×2, `--min-tls-version`, `--name` ×2, `--resource-group` ×2, `--sku` ×2 |
| `az storage account network-rule add` | 1 | 1 | `--account-name`, `--resource-group`, `--subnet`, `--vnet-name` |
| `az storage account show` | 2 | 2 | `--name` ×2, `--output` ×2, `--query` ×2, `--resource-group` ×2 |
| `az storage account update` | 1 | 1 | `--default-action`, `--name`, `--resource-group` |
| `az storage container create` | 1 | 1 | `--account-name`, `--auth-mode`, `--name` |
| `az storage share-rm create` | 1 | 1 | `--access-tier`, `--enabled-protocols`, `--name`, `--quota`, `--resource-group`, `--storage-account` |
| `az vm create` | 1 | 1 | `--admin-username`, `--generate-ssh-keys`, `--image`, `--name`, `--resource-group`, `--size` |
| `az vm show` | 1 | 1 | `--name`, `--output`, `--query`, `--resource-group` |
| `az vmss create` | 1 | 1 | `--admin-username`, `--generate-ssh-keys`, `--image`, `--instance-count`, `--name`, `--orchestration-mode`, `--resource-group`, `--vm-sku` |
| `az webapp config appsettings set` | 1 | 1 | `--name`, `--resource-group`, `--settings` |
| `az webapp create` | 1 | 1 | `--name`, `--plan`, `--resource-group`, `--runtime` |
| `az webapp deploy` | 1 | 1 | `--name`, `--resource-group`, `--src-path`, `--type` |
| `az webapp deployment slot create` | 1 | 1 | `--name`, `--resource-group`, `--slot` |
| `az webapp deployment slot swap` | 1 | 1 | `--name`, `--resource-group`, `--slot`, `--target-slot` |
| `az webapp update` | 1 | 1 | `--https-only`, `--name`, `--resource-group` |

Check against Learn (script run 2026-10-27, fetching the Learn page of each command group and comparing flag names in the command's section): **61 of 63 commands match every flag**. The two others are `az network watcher show-next-hop` and `az network watcher test-ip-flow`, which use `--out`, documented as an alias of `--output`. So the catalog's CLI examples are consistent with Learn.

### 2.1 Things the catalog uses that are not `az` commands

The scan found these shell features, which a test runner or the Cloud Shell parser must handle if "every catalog CLI example runs against the engine" (PLAN.md section 13):

| Feature | Seen in | Example |
|---|---|---|
| Line continuation `\` | all multi-line examples | `az group create \` newline `--name ...` |
| Comments `# ...` | `blob-container`, `private-endpoint` | `# Give yourself a data role first ...` |
| Variable assignment from command substitution | `alert-rule` (2), `blob-container`, `private-endpoint` | `VM_ID=$(az vm show ... --query id --output tsv)` |
| Variable assignment with `$RANDOM` | `app-service` | `APP_NAME="app-polaris-$RANDOM"` |
| Variable expansion, quoted and unquoted | `app-service`, `alert-rule`, `blob-container` | `--name $APP_NAME`, `--scope "$STORAGE_ID"` |
| Double-quoted strings with spaces and `:` | several | `--condition "avg Percentage CPU > 80"`, `--runtime "NODE:24-lts"`, `--query "{FQDN:ipAddress.fqdn,ProvisioningState:provisioningState}"` |
| Pipe into another command, stdin marker `@-` | `blob-container` | `az ad signed-in-user show --query id --output tsv \| az role assignment create --assignee @- ...` |
| Values `key=value` lists after one flag | `resource-group`, `app-service` | `--tags env=dev owner=you` |
| `host:port` values | `network-watcher` | `--local 10.0.1.4:60000` |
| Boolean flags with no value and with value | several | `--is-linux`, `--enabled`, `--https-only true`, `--registration-enabled false` |
| `./app.zip` path argument | `app-service` | `--src-path ./app.zip` (no real file system; the sim must fake it) |

`az ad signed-in-user show` is outside the Azure Resource Manager world (Microsoft Entra), so it needs a simulated user object. `--assignee @-` reading stdin is real CLI behaviour for `az role assignment create` in the catalog, so the sim needs a minimal pipe.

### 2.2 Suggested order for the first command groups

Derived from the table plus PLAN.md section 13:
1. Session: `az login`, `az account show / set / list / list-locations / clear`, `az configure --defaults`, `az config set`, `az version`, `az extension add`, `az provider register / show`.
2. `az group create / show / list / delete / exists` (the catalog uses only `create`, but every other command needs the group).
3. Networking: `az network vnet [subnet|peering] create/show/list/update`, `nsg [rule]`, `public-ip`, `route-table [route]`, `private-dns zone|link vnet`, `asg`, `nic`, `lb`.
4. `az vm create/show/list`, `az storage account create/show/update/network-rule add`, `az role assignment create/list` (needed for the RBAC story).
5. Everything else in the table can be registered from data later, as long as the registry accepts the flags in the table.

---

## 3. JMESPath

### 3.1 Spec and compliance tests

- Specification: [jmespath.org/specification.html](https://jmespath.org/specification.html). Relevant rules (verified in the page text): ordering operators `>, >=, <, <=` "are only valid for numbers"; `max_by` etc. on an empty array "will produce a return value of null"; built-in function list: `abs avg contains ceil ends_with floor join keys length map max max_by merge min min_by not_null reverse sort sort_by starts_with sum to_array to_string to_number type values`.
- Libraries page: [jmespath.org/libraries.html](https://jmespath.org/libraries.html) lists "JMESPath Org Implementations" Python (jmespath.py), Go, Lua, JavaScript (jmespath.js), PHP, Ruby, Rust, all marked "Fully compliant", where compliance level "is based on which compliance tests the library can pass". Community implementations include TypeScript `jmespath-ts`.
- **Compliance suite:** [github.com/jmespath/jmespath.test](https://github.com/jmespath/jmespath.test) (official org). Cloned 2026-10-27, head commit `53abcc3` dated 2022-05-25. `tests/` has 16 JSON files (`basic, benchmarks, boolean, current, escape, filters, functions, identifiers, indices, literal, multiselect, pipe, slice, syntax, unicode, wildcard`) with **908 cases** (892 excluding the 16 benchmark cases). Case format (from its README): `given` input, `cases` list of `expression` plus either `result` or `error` (`syntax`, `invalid-arity`, `invalid-type`, `invalid-value`, `unknown-function`). **The repository has no `LICENSE` file and the README states no licence** (checked the root listing and README). That matters only if we copy the JSON into our repo; running it from a dev dependency or downloading it in CI avoids redistribution. Flagged as unverified legal status.

### 3.2 Official JavaScript implementation: `jmespath/jmespath.js`

| Item | Fact | Source |
|---|---|---|
| Licence | **Apache License 2.0**. The `LICENSE` file is the short notice "Copyright 2014 James Saryerwinnie ... Licensed under the Apache License, Version 2.0" with the usual terms text. `package.json` has `"license": "Apache-2.0"`. GitHub's detector reports "Other / NOASSERTION" because the file is only the notice header. | [LICENSE](https://raw.githubusercontent.com/jmespath/jmespath.js/master/LICENSE), [package.json](https://raw.githubusercontent.com/jmespath/jmespath.js/master/package.json), [GitHub API](https://api.github.com/repos/jmespath/jmespath.js) |
| Size | `jmespath.js` source 58,448 bytes. Prebuilt `artifacts/jmespath.min.js` 18,128 bytes, **5,665 bytes gzipped** (measured). Zero runtime dependencies. | [jsDelivr package listing](https://data.jsdelivr.com/v1/packages/npm/jmespath@0.16.0), measured locally |
| Latest release | **0.16.0**, tag and npm publish on 2022-01-19 (npm time `2022-01-19T20:39:39Z`). npm `latest` is still 0.16.0. | [releases atom](https://github.com/jmespath/jmespath.js/releases.atom), [npm registry](https://registry.npmjs.org/jmespath) |
| Last commit | `master` HEAD is the 2022-01-19 merge "prep-0.16.0". The GitHub API reports `pushed_at` 2023-12-07 (a side branch; master has nothing newer). 66 open issues; repository not archived. | [commits atom](https://github.com/jmespath/jmespath.js/commits/master.atom), [GitHub API](https://api.github.com/repos/jmespath/jmespath.js) |
| Status | **Effectively unmaintained** for about 4 years, though widely used (npm reported 9,339,611 downloads in one week for the `jmespath` package in the response I fetched). | [npm downloads API](https://api.npmjs.org/downloads/point/last-week/jmespath) |
| Browser | Plain ES5 file wrapped as `(function(exports){...})(typeof exports === "undefined" ? this.jmespath = {} : exports)`; no Node APIs, no `eval`/`new Function` (the only grep hit is a comment). Exposes `search`, `compile`, `tokenize`, `strictDeepEqual`. README: `jmespath.search(data, "foo.bar.baz[2]")`. The `bower.json` and the `artifacts/jmespath.min.js` build target browsers. **I only executed it under Node 24; I did not load it in a real browser** (see section 6). | [jmespath.js](https://raw.githubusercontent.com/jmespath/jmespath.js/master/jmespath.js), [README](https://raw.githubusercontent.com/jmespath/jmespath.js/master/README.md) |
| Types | None bundled. `@types/jmespath` 0.15.2 exists (MIT, DefinitelyTyped, published 2023-11-07). Package has no ESM entry (`main: jmespath.js`); bundlers handle the CJS/UMD wrapper. | [npm @types/jmespath](https://registry.npmjs.org/@types/jmespath) |
| Functions | All 26 spec functions are implemented (checked in source). | [jmespath.js](https://raw.githubusercontent.com/jmespath/jmespath.js/master/jmespath.js) |

**My conformance run (2026-10-27):** I ran the current official `jmespath.test` suite against `jmespath.js` 0.16.0 under Node 24 (strict deep equality for results; any thrown error for `error` cases; benchmarks skipped): **885 of 892 pass**. The 7 failures:
- `boolean.json`: 4 cases where an ordering comparison involving a non-number (`emptylist < one`, `emptylist < nullvalue`, `emptylist < boolvalue`, `one < boolvalue`) returns `true`/`false` instead of `null` (spec: ordering operators only valid for numbers).
- `functions.json`: `max_by([], &age)` and `min_by([], &age)` return `undefined` instead of `null`.
- `syntax.json`: `[:::]` does not raise a syntax error.

These explain why the repo's own bundled copy of the tests (`test/compliance/`, last changed 2015-11-10 and differing from the current suite in 6 files: boolean, filters, functions, literal, multiselect, syntax) passes while the newer suite does not. None of the 7 affects the Learn query examples. Error objects are also rougher than Python's: `foo.` throws a raw `TypeError` ("Cannot read properties of undefined (reading 'type')"), others throw `ParserError`/`Error` with messages like `Unknown function: nofn()` or `ArgumentError: abs() takes 1 argument but received 2`. The shell must wrap all of them into one `Invalid jmespath query supplied for \`--query\`: ...` message.

**Learn query examples run locally:** I ran 21 queries from the Learn query page and from the catalog (projection with rename, filters with `==`, `>=`, backtick `false`, `!isDefault`, `contains`, pipe + filter, `sort_by`, multiselect list/hash, `length`, index, nested path such as `properties.configuration.ingress.fqdn`) against fixture data under both `jmespath.js` and `@jmespath-community/jmespath`. All returned the results Learn shows (for example `[?storageProfile.osDisk.diskSizeGb >=\`50\`].{Name:name}` returns only `WinTest`).

### 3.3 What `az` itself uses

[`azure-cli` `requirements.py3.Linux.txt`](https://raw.githubusercontent.com/Azure/azure-cli/dev/src/azure-cli/requirements.py3.Linux.txt) pins `jmespath==0.9.5` (the Python library, official org), `knack==0.14.0`, `tabulate==0.8.9`. The newest `jmespath` on PyPI is 1.1.0 (uploaded 2026-01-22, MIT; [PyPI](https://pypi.org/pypi/jmespath/json)), so the Python reference implementation is still maintained even though `az` pins an older one. For fidelity, the JavaScript library should follow the original spec (the one `jmespath.py` 0.9.5 implements), not a fork.

### 3.4 Alternatives

| Library | Source and status | Licence | Size | Compliance (my run) | Notes |
|---|---|---|---|---|---|
| `@jmespath-community/jmespath` 1.4.1 | [github.com/jmespath-community/typescript-jmespath](https://github.com/jmespath-community/typescript-jmespath), npm 1.4.1 published 2026-10-27 (releases in 2024-10, 2025-02, 2025-07, 2026-10); TypeScript; ESM, CJS and UMD builds; no runtime deps. Separate GitHub org from `jmespath`. | **MPL-2.0** (LICENSE and npm metadata) | UMD min 43,755 bytes, 12,206 gzipped | 891 / 892 (only `'\\'` raw-string escape differs) | README has an "Extensions to original spec" section and a different spec at `jmespath.site`. The raw-string escape change shows it is not byte-compatible with `az`. `engines` says Node >= 20.19 (build/dev, irrelevant in a browser). The relationship to `jmespath.org` is not stated on the libraries page I fetched (not listed there). |
| `jmespath-ts` / `@metrichor/jmespath` 0.3.1 | Listed on the official libraries page as community TypeScript ("Fully compliant"). The linked repo `github.com/nanoporetech/jmespath-ts` returned **404** on 2026-10-27; npm `@metrichor/jmespath` last published 2021-06-01. | MPL-2.0 | n/a | not tested | Link rot plus no release since 2021: not recommended. |

### 3.5 Recommendation

1. **Use `jmespath.js` 0.16.0 from the official `jmespath` org**, copied or installed as a pinned dependency, with its Apache-2.0 notice kept in the repo/site credits. Reasons: official, tiny (5.7 KB gzipped), no dependencies, ES5, implements all 26 functions, matches the original-spec semantics `az` relies on, and passes everything the Learn examples exercise.
2. **Add our own conformance test in CI**: download `jmespath/jmespath.test` and run it, with the 7 known failures listed as expected. Optionally patch them (they are short: return `null` for non-number ordering, `null` for `max_by`/`min_by` of an empty array, reject empty step in slices) in a small wrapper rather than forking the library.
3. **Wrap errors** (all thrown values become one `Invalid jmespath query` message) and **post-process results** exactly as the CLI does (`--query` result goes into the chosen output formatter).
4. **Fallback:** if the project later needs maintained code or newer JMESPath features, switch to `@jmespath-community/jmespath` after checking the raw-string difference against our catalog's queries (the catalog uses none). Note MPL-2.0 is file-level copyleft: using it unmodified as a dependency does not by itself require publishing our own source, but check this with the owner before adopting.

---

## 4. Reusing `az` help text

### 4.1 Licence (facts, not legal advice)

- `Azure/azure-cli` is **MIT** licensed: `LICENSE` reads "MIT License Copyright (c) 2016 Microsoft Corporation", with the standard permission to "use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies" subject to: "The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software." GitHub also reports MIT. Sources: [LICENSE](https://raw.githubusercontent.com/Azure/azure-cli/dev/LICENSE), [GitHub API](https://api.github.com/repos/Azure/azure-cli). Source files carry the header "Licensed under the MIT License. See License.txt in the project root" (for example [`network/_help.py`](https://raw.githubusercontent.com/Azure/azure-cli/dev/src/azure-cli/azure/cli/command_modules/network/_help.py)).
- A [`NOTICE.txt`](https://raw.githubusercontent.com/Azure/azure-cli/dev/NOTICE.txt) exists (third-party material in the repo). It governs third-party code, not Microsoft's help strings. I did not audit it line by line.
- Learn's docs repo: [MicrosoftDocs/azure-docs-cli](https://github.com/MicrosoftDocs/azure-docs-cli) has `LICENSE` = Creative Commons Attribution 4.0 (documentation) and `LICENSE-CODE` = MIT (code samples). Its [README](https://raw.githubusercontent.com/MicrosoftDocs/azure-docs-cli/main/README.md) says the **reference** documentation "is generated from the source code, and is also used in the command-line `-h` help" and changes must go to `azure/azure-cli`. So the reference pages on Learn and the CLI help are the same text from the MIT-licensed repo. The conceptual articles (output formats, query, troubleshooting) are CC BY 4.0 in that repo; the learn.microsoft.com site has its own terms of use, which I did not read.
- Consequence for Polaris: quoting short help strings and examples with attribution to Azure CLI / Microsoft Learn is consistent with the project rule "Microsoft Learn or other official Microsoft docs only". Copying files wholesale from `azure-cli` would need the MIT notice kept. Whether and how to credit is a decision for the owner.

### 4.2 Where help text lives

From the [azure-cli file tree](https://github.com/Azure/azure-cli) (`dev` branch, listed on 2026-10-27) and [`doc/authoring_help.md`](https://raw.githubusercontent.com/Azure/azure-cli/dev/doc/authoring_help.md):

1. **`_help.py` files** in each command module: Python modules that register YAML strings with `helps['<command path>'] = """ ... """` (via `knack.help_files`). Fields: `type: group|command`, `short-summary`, `long-summary`, `parameters` (name, short-summary, populator-commands), `examples` (name, text). Example start of [`network/_help.py`](https://raw.githubusercontent.com/Azure/azure-cli/dev/src/azure-cli/azure/cli/command_modules/network/_help.py):

```python
helps['network application-gateway address-pool create'] = """
type: command
short-summary: Create an address pool.
examples:
  - name: Create an address pool with two endpoints.
    text: |
        az network application-gateway address-pool create -g MyResourceGroup \\
            --gateway-name MyAppGateway -n MyAddressPool --servers 10.0.0.4 10.0.0.5
"""
```

2. **AAZ generated commands** (newer modules such as network): the command's Python docstring is the help (summary, long summary, and `:example:` blocks) and argument `help=` strings live in the generated `_build_arguments_schema`. Example, [`network/aaz/latest/network/vnet/_create.py`](https://raw.githubusercontent.com/Azure/azure-cli/dev/src/azure-cli/azure/cli/command_modules/network/aaz/latest/network/vnet/_create.py): docstring "Create a virtual network." with `:example:` entries such as `az network vnet create -g MyResourceGroup -n MyVnet --address-prefix 10.0.0.0/16 --subnet-name MySubnet --subnet-prefixes 10.0.0.0/24`. The same module still has a `helps['network vnet create']` entry in `_help.py`; the AAZ docstring is the newer source and the two can differ.
3. **Argument help** also appears as `help=` in each module's `_params.py` (for example `network/_params.py`, 71 KB).
4. The doc says YAML `help.yaml` files "eventually" replace `_help.py` (not seen in the tree listing used for the counts below).
5. The Learn reference pages are generated from these sources, so extracting the 63 commands used by the catalog can be done from Learn's pages as well (the pages list each parameter with its help sentence).

### 4.3 How big it is

Measured 2026-10-27 on branch `dev` (azure-cli 2.91.0 is the latest release, published 2026-10-05, [releases](https://api.github.com/repos/Azure/azure-cli/releases/latest)):
- **77 `_help.py` files** (75 under `command_modules/` across 64 modules, 2 in `azure-cli-core`), **2,797,784 bytes**, **361,276 bytes gzipped**, **5,513 `helps[...]` entries**. Largest: `network/_help.py` 258 KB, `acs` 202 KB, `appservice` 163 KB, `storage` 159 KB, `resource` 155 KB, `vm` 151 KB.
- AAZ-generated command files: 3,281 `.py` files, about 92 MB of code under `aaz/latest/` (mostly argument schemas and request code, not help). The help text inside them was not measured separately.
- The whole repo is about 1 GB on GitHub (API `size` 1,005,548 KB).
- **Implication:** shipping all help is not needed or sensible for a static site. The 63 catalog commands can be extracted at build time into a JSON registry (description, parameters with aliases, examples); this is a few tens of KB.

### 4.4 `az <cmd> --help` format

See section 1.3 for the Learn example. The sections are `Command` (or `Group`), `Arguments`, `Global Arguments`, `Examples`; subgroup and command lists appear as `Subgroups:` and `Commands:` blocks with `name : summary` lines. Required arguments are tagged `[Required]` and aliases are space separated. Learn reference pages show the same info as synopsis, "Required Parameters", "Optional Parameters", "Global Parameters" with default and accepted values.

---

## 5. Implications for the design (starting points, not decisions)

1. **Registry from data:** keep one command registry (path, params with aliases and types, help, handler) and derive `--help`, flag validation and the "unrecognized arguments" error from it. Generate the registry for the catalog commands from the Learn/azure-cli sources at build time, and fail the build if a catalog `cli:` flag is not in the registry (the 61/63 result shows the sources already agree).
2. **Output pipeline:** result object, then `--query` (JMESPath on JSON), then formatter (json, jsonc, yaml, yamlc, table, tsv, none). Implement the knack table/tsv rules (section 1.4) as the default and add per-command table transformers only for commands where Learn shows a table.
3. **Parser:** a small POSIX-like tokenizer (quotes, `\` continuation, `$VAR`, `$(...)`, `|`, `#`, `@-`) in front of the `az` argument parser. The catalog needs these (section 2.1).
4. **Errors:** emit `ERROR: (Code) Message`, then `Code: ...` and `Message: ...` lines for service errors, `ERROR: <message>` for CLI errors, and exit code 1. Use only codes and message text that are documented on Learn (table in 1.7). For `ResourceGroupNotFound`, label the message as unverified or reword.
5. **Labelling:** keep the "simulated" banner; show `az login` as already signed in (as Cloud Shell is).

---

## 6. What I could not verify

- **Whether `jmespath.js` runs unmodified in a browser.** The source is browser-safe by inspection (UMD, no Node APIs) and passes in Node 24, but I did not load it in a browser or through the Next.js bundler.
- **Exact `az account list`, `az account list -o table`, `az group list -o table`, `az group show` table/tsv output.** Learn shows `az vm list` examples but not these. Table columns come from per-command transformers in source that I did not enumerate for all 63 commands.
- **Official text for `ResourceGroupNotFound`, `NameUnavailable` (storage), and the confirmation prompt of `az group delete`.** Learn has the codes (and the storage names), not these messages. Message texts here are from community reports or source code and are labelled as such.
- **When the `ERROR: ` prefix shows in Cloud Shell.** Source says it is hidden when colour is on; community reports show both forms.
- **Differences between `jmespath.py` 0.9.5 (what `az` pins) and `jmespath.js`.** I only tested `jmespath.js` against the current official suite and Learn examples, not against Python 0.9.5 output. The ordering-operator and empty-array cases above are the known JS deviations from the spec.
- **Legal status of `jmespath/jmespath.test`** (no licence file) and **Learn site terms**; the `azure-cli` `NOTICE.txt` was not audited. These are facts, not legal advice.
- **Relationship between `jmespath-community` and `jmespath.org`.** I verified the library's own repo/npm data only; the official libraries page does not list it. The `jmespath-ts` GitHub link on the official page was a 404.
- **Size of help text inside AAZ command files** (not measured), and whether any module still ships `help.yaml` (none seen in the listing used for counts).
- **Learn's page "last updated" dates** are as printed in the page footers on the access date (for example 2026-09-01 for the output-formats and global-parameters pages).
- The GitHub REST API rate limit blocked some queries; dates for `jmespath.js` came from Atom feeds and a local clone instead.

## 7. Source list

Learn: [Output formats](https://learn.microsoft.com/en-us/cli/azure/format-output-azure-cli), [Query with JMESPath](https://learn.microsoft.com/en-us/cli/azure/query-azure-cli), [Global parameters](https://learn.microsoft.com/en-us/cli/azure/azure-cli-global-parameters), [az group](https://learn.microsoft.com/en-us/cli/azure/group), [az account](https://learn.microsoft.com/en-us/cli/azure/account), [Reference index (az login, az configure)](https://learn.microsoft.com/en-us/cli/azure/reference-index), [Azure CLI configuration](https://learn.microsoft.com/en-us/cli/azure/azure-cli-configuration), [Sign in interactively](https://learn.microsoft.com/en-us/cli/azure/authenticate-azure-cli-interactively), [Manage subscriptions](https://learn.microsoft.com/en-us/cli/azure/manage-azure-subscriptions-azure-cli), [Get started 1: prepare environment](https://learn.microsoft.com/en-us/cli/azure/get-started-tutorial-1-prepare-environment), [Get started with Azure CLI](https://learn.microsoft.com/en-us/cli/azure/get-started-with-azure-cli), [Tips for using the Azure CLI successfully](https://learn.microsoft.com/en-us/cli/azure/use-azure-cli-successfully), [Troubleshooting Azure CLI](https://learn.microsoft.com/en-us/cli/azure/use-azure-cli-successfully-troubleshooting), [Resource not found](https://learn.microsoft.com/en-us/azure/azure-resource-manager/troubleshooting/error-not-found), [Storage account names](https://learn.microsoft.com/en-us/azure/azure-resource-manager/troubleshooting/error-storage-account-name), [Common deployment errors](https://learn.microsoft.com/en-us/azure/azure-resource-manager/templates/common-deployment-errors), [Azure RBAC troubleshooting](https://learn.microsoft.com/en-us/azure/role-based-access-control/troubleshooting), [Cloud Shell overview](https://learn.microsoft.com/en-us/azure/cloud-shell/overview), plus the command-group pages for every group in section 2.

Specs and libraries: [JMESPath specification](https://jmespath.org/specification.html), [libraries](https://jmespath.org/libraries.html), [jmespath/jmespath.test](https://github.com/jmespath/jmespath.test), [jmespath/jmespath.js](https://github.com/jmespath/jmespath.js), [npm jmespath](https://registry.npmjs.org/jmespath), [jmespath-community/typescript-jmespath](https://github.com/jmespath-community/typescript-jmespath), [npm @jmespath-community/jmespath](https://registry.npmjs.org/@jmespath-community/jmespath), [PyPI jmespath](https://pypi.org/pypi/jmespath/json).

Azure CLI source: [Azure/azure-cli](https://github.com/Azure/azure-cli) (LICENSE, `NOTICE.txt`, `doc/authoring_help.md`, `network/_help.py`, `network/_format.py`, `resource/commands.py`, `azure-cli-core/.../util.py`, `azclierror.py`, `requirements.py3.Linux.txt`), [microsoft/knack](https://github.com/microsoft/knack) (`log.py`, `output.py`, `query.py`), [azure-core exceptions](https://github.com/Azure/azure-sdk-for-python/blob/main/sdk/core/azure-core/azure/core/exceptions.py), [MicrosoftDocs/azure-docs-cli](https://github.com/MicrosoftDocs/azure-docs-cli).

Community reports (not for catalog use): [azure-cli issue 30992](https://github.com/Azure/azure-cli/issues/30992), [issue 26574](https://github.com/Azure/azure-cli/issues/26574), [issue 22210](https://github.com/Azure/azure-cli/issues/22210), [issue 22714](https://github.com/Azure/azure-cli/issues/22714), [Q&A 1179698](https://learn.microsoft.com/en-us/answers/questions/1179698/syntax-error).
