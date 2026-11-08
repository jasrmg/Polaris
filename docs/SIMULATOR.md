# Polaris sandbox: world model and engine design

**Status:** design, checkpoint 10 (written 2026-10-27). Nothing in this file is built yet. The owner reads it and pushes back before checkpoint 11 starts.
**Siblings:** [`RBAC.md`](RBAC.md) (access evaluation, directory, roles) and [`CLOUDSHELL.md`](CLOUDSHELL.md) (the simulated `az`). Facts and sources: [`research/`](research/) (six reports, all dated 2026-10-27).

## 0. How to read this document

Every rule is tagged so nobody mistakes a design choice for an Azure fact.

| Tag | Meaning |
|---|---|
| **[Learn]** | Stated by Microsoft Learn or another official Microsoft source. The source is linked here or in the research file named next to it. |
| **[Decision]** | A design choice for the sandbox. Learn does not say it. Changing it is a design change, not a bug fix. |
| **[Owner]** | Decided by the owner. Listed in section 14. |
| **[Open]** | Not decided or not verifiable. Listed in section 15. |

Project rule 6 still applies: if a behaviour is not documented, the sandbox does not invent it. It says "not simulated" instead.

Research file shorthand: `res-model` = [`research/azure-resource-model.md`](research/azure-resource-model.md), `net` = [`research/networking-rules.md`](research/networking-rules.md), `rbac` = [`research/rbac-model.md`](research/rbac-model.md). A tag like `[S7]` points into that file's source index.

## 1. Principles

1. **Explainability is the product.** Every refusal names the check that refused (permission, lock, name rule, dependency, route, NSG rule) and links to the Learn page for it. A "no" without a reason is a bug.
2. **Pure engine, thin UI.** The engine is plain TypeScript with no React and no browser APIs. It takes a world and a request and returns a new world plus a result. The create forms, the Cloud Shell and the tests all call the same functions, so a form and a command can never disagree.
3. **Honest simulation.** The UI says "simulated". Timings are a UX choice, never claimed as Azure's. Where Learn is silent or contradicts itself the sandbox either states the rule it chose (and why) or marks the area "not simulated".
4. **Every rule carries its source.** Each engine rule has a comment with its Learn URL and a unit test. Imported data carries an "as of" date.
5. **Provider-aware from the start.** Azure-specific rules live in an Azure pack; the generic core knows nothing about subscriptions or ARM (section 12). Version 1 ships only the Azure pack.
6. **Single tenant, many subscriptions.** [Owner] One simulated Microsoft Entra tenant. A default subscription exists, the user can add more subscriptions and management groups, and can switch the identity they act as (see `RBAC.md`).

## 2. The world

One serialisable object. All keys are plain data (no classes, no functions) so it can be saved, exported and diffed.

```ts
interface World {
  format: "polaris-world";
  schemaVersion: number;            // bump on every breaking change, see section 10
  provider: "azure";                // future: "aws" | "gcp" (section 12)
  createdAt: string;                // ISO
  clock: number;                    // simulated time in ms, advanced by the engine (section 4)
  tenant: Tenant;
  directory: Directory;             // users, groups, service principals, managed identities (RBAC.md)
  managementGroups: Record<Id, ManagementGroup>;
  subscriptions: Record<Id, Subscription>;
  resourceGroups: Record<Id, ResourceGroup>;
  resources: Record<Id, Resource>;  // everything below a resource group, plus subscription-scope resources
  roleAssignments: Record<Id, RoleAssignment>;
  customRoles: Record<Id, RoleDefinition>;  // built-in roles are shipped data, not part of the world
  locks: Record<Id, ManagementLock>;
  policyAssignments: Record<Id, PolicyAssignment>;  // checkpoint 14
  policyStates: Record<Id, PolicyState>;           // non-compliant rows recorded on create, update, or assignment change
  providerRegistrations: Record<Id /* sub id */, Record<string /* namespace */, "Registered" | "NotRegistered" | "Registering">>;
  deployments: Record<Id, Deployment>;      // checkpoint 18
  session: CliSession;              // who is acting, default subscription, az defaults (CLOUDSHELL.md)
}
```

`Id` is a full ARM-style ID string, compared case-insensitively (section 3). Keys are stored lower-cased; the original casing is kept in the object.

### 2.1 Hierarchy rules

All **[Learn]** from `res-model` section 1. Source tags in brackets.

| Entity | Rules the engine enforces |
|---|---|
| Tenant | Exactly one, with a GUID ID. The root management group's ID equals the tenant ID and its display name is "Tenant root group"; it cannot be moved or deleted. [S1] Initial domain looks like `contoso.onmicrosoft.com`. [S41] Entra is a nonregional service. [S27] |
| Management group | Unique parent; a tree has at most six levels below the root (the root and the subscription level are not counted); 10,000 per directory; name 1-90 characters, letters, digits, hyphen, underscore, period, parentheses, must start with a letter or digit and not end with a period; scope is tenant. Use the ID, not the display name, in scopes. All subscriptions in one group trust the same tenant. [S1][S6][S7] |
| Subscription | GUID ID; trusts exactly one tenant; exactly one parent (default: the root group). `state` is one of `Enabled`, `Warned`, `PastDue`, `Disabled`, `Deleted` (REST enum). [S4] 980 resource groups per subscription. [S6] |
| Resource group | Name unique within the subscription; 1-90 characters; letters, digits, underscore, hyphen, period, parentheses; cannot end with a period. **Location cannot be changed, the group cannot be renamed, cannot be nested.** Resources in it may live in other regions. Tags on the group are not inherited by its resources. Deleting it deletes everything inside, irreversibly. [S2][S7][S19][S38][S39][S40] |
| Resource | Lives in exactly one resource group, or at subscription, management group or tenant scope for the few types that allow it. Envelope: `id, name, type, location, tags, kind, sku, identity, managedBy, properties`. `provisioningState` is a property inside `properties`, not an envelope field. [S2][S13][S19] |

**Subscription state behaviour** [Learn, S3]: `Enabled` and `PastDue` allow all operations. `Warned` allows GET and DELETE but not PUT, PATCH or POST. `Disabled` blocks PUT, PATCH and POST (VMs are deallocated), GET and DELETE still work. `Deleted` allows nothing. The `Expired` state exists on the billing page but not in the REST enum, so it is skipped. **[Decision]** the world has a "subscription status" teaching toggle ("what can I still do?"). Learn gives no transition diagram, so the user sets the state directly instead of the engine moving it.

**Limits the engine enforces** (cheap and decision-making): 980 resource groups per subscription, 800 instances of one type per resource group (some types exempt), 50 tags per resource, tag key 512 and value 256 characters, 20 management locks per scope, 5 reserved addresses per subnet. [S6][S29] Everything else in the limits page is **not enforced** (documented as "may skip" in `res-model` 7.3). **[Decision]** VM core quota (new subscriptions default to 20 cores per region, defaults vary by offer type [S6]) is optional and off by default.

## 3. IDs and naming

### 3.1 ARM IDs [Learn, S9][S11][S12]

| Kind | Format |
|---|---|
| Management group | `/providers/Microsoft.Management/managementGroups/{name}` |
| Subscription | `/subscriptions/{guid}` |
| Resource group | `/subscriptions/{guid}/resourceGroups/{name}` |
| Resource | `/subscriptions/{guid}/resourceGroups/{rg}/providers/{namespace}/{type}/{name}` |
| Child resource | type and name segments alternate: `.../providers/Microsoft.Storage/storageAccounts/{a}/blobServices/default/containers/{c}` |
| Subscription-scope resource | `/subscriptions/{guid}/providers/{namespace}/{type}/{name}` |
| Extension resource (role assignment, lock) | the base ID plus `/providers/Microsoft.Authorization/roleAssignments/{guid}` |

Rules:

- **[Decision]** Parse segment keywords case-insensitively (`resourceGroups`, `resourcegroups`) and compare names case-insensitively, because Learn says names are case-insensitive and its own pages mix `resourcegroups` and `resourceGroups`. [S7][S9][S19][S38]
- **[Decision]** Child IDs use the alternating form from the examples, not the order the scope-overview diagram suggests (research file section 8, point 5).
- Names must not contain `#`. [S7]
- Role assignment and role definition names are GUIDs. [S7]
- Subscription IDs and tenant IDs the sandbox generates are random GUIDs. **They must never be a real ID.** The starter world uses fixed fake GUIDs (all examples in docs use the all-zero pattern).

### 3.2 Name rules and uniqueness

Source: [Naming rules and restrictions](https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/resource-name-rules) (S7), and its Microsoft-owned GitHub source (S8) for cells that Learn's rendering truncates. The full 36-row table for the current catalog is in `res-model` section 4. The engine stores it as data:

```ts
interface NameRule {
  type: string;                 // ARM type, lower-case
  minLength: number; maxLength: number;
  allowed: string;              // regex source, tested case-insensitively unless caseSensitive
  mustStartWith?: string; mustNotEndWith?: string; noConsecutive?: string[];
  forbiddenChars?: string;      // for the Insights family
  uniqueIn: "global" | "tenant" | "subscription" | "resourceGroup" | "parent";
  variants?: Record<string, Partial<NameRule>>;   // e.g. VM Windows vs Linux
  source: string;               // Learn URL
}
```

Uniqueness scopes **[Learn, S7]**: resource group = subscription; subnet, peering = virtual network; blob container, file share = storage account; storage account and web app = **global**; role assignment, management group = tenant; most others = resource group. **[Decision]** "Global" uniqueness is checked only against names inside this one world (a sandbox cannot know Azure's global namespace). The error text says so ("name is not available in this sandbox").

Special cases kept from the research: a VM has a host name (the strict rule) and a resource name (up to 64 characters). "Alert rule" is three ARM types with three forbidden-character lists. Public IP DNS labels are unique per location. [S7][S8][S31]

## 4. Operations and lifecycle

### 4.1 The request pipeline [Decision]

Learn documents each check separately but not the order Azure runs them in. The sandbox uses this order and says in the explanation which step stopped the request:

```
parse → authenticate (acting identity) → authorize (RBAC.md) → subscription state
      → resource provider registered? → locks → policy (checkpoint 14)
      → validate (names, properties, parents, regions, dependencies) → apply → lifecycle
```

Every step returns either `ok` or a structured error:

```ts
interface EngineError { code: string; message: string; target?: string; details?: EngineError[]; step: string; learnUrl?: string; next?: string }
interface Result<T> { ok: boolean; value?: T; error?: EngineError; trace: TraceLine[]; world: World }
```

`code` and `message` use Learn's documented codes and text where Learn has them (`AuthorizationFailed`, `ResourceNotFound`, `AccountNameInvalid`, `StorageAccountAlreadyTaken`, see `CLOUDSHELL.md` section 8) and say "(sandbox wording)" where Learn has only the code. `next` is sandbox guidance for a page that exists. It is not Learn text. It is left off when the message already says what to change, and when the fix is not on a page yet.

### 4.2 Provisioning state [Learn, S15][S16][S18][S20]

There is no universal enum. The common core across Learn is `Creating`, `Updating`, `Deleting`, `Succeeded`, `Failed`, `Canceled`, plus `Accepted` for asynchronous work. Per type: VM adds `Migrating` (skipped), storage account lists `Creating`, `ResolvingDNS`, `Succeeded`, deployments list twelve values. "Succeeded, Failed and Canceled mean the operation finished; all other values mean it is still running." [S15]

**[Decision]** each type declares its own list in its simulator block; the engine only requires the terminal set above. The resource group's value list is not enumerated by Learn, so the group goes `Succeeded` directly (the portal says creation takes "a few seconds" [S36]).

### 4.3 Time

- **[Decision]** The engine owns a `clock` and never reads `Date.now()` inside rules. A scheduler advances `Creating → Succeeded` after a short, configurable delay (default 1-3 seconds, zero in tests). This is a UX choice, not an Azure number. Learn gives durations for very few things (Bastion about 10 minutes for the dedicated SKUs, Developer SKU in seconds, a resource group move up to four hours, soft-delete retention 14 days [S44][S49][S45]); the sandbox may *label* those but does not wait for them.
- `--no-wait` and asynchronous results (HTTP 201/202 with a status link) are modelled in the shell as "operation accepted, state Creating". [S15]

### 4.4 Virtual machine power state [Learn, S16][S21]

Provisioning state and power state are separate. Power states and billing: `Creating` (not billed), `Starting` (billed), `Running` (billed), `Stopping` (billed), **`Stopped` (allocated, still billed)**, `Deallocating` (not billed), **`Deallocated` (not billed)**. Disks and networking keep billing in all states. `az vm stop` powers off but the VM "will continue to be billed"; `az vm deallocate` moves it to "Stopped (Deallocated)". A dynamic public IP can change after a deallocate and start; a static one cannot. [S31] **[Decision]** the UI shows a billing badge from this table and nothing numeric. Display strings for stopped and deallocated are not on Learn (`res-model` section 8, point 2), so the sandbox writes its own labels, not "VM stopped" as if quoted.

### 4.5 Deleting [Learn]

Resource group delete order [S14]: remove locks and backup data first; then delete all child resources, then resources that manage others (`managedBy`), then the rest; fail if a resource is connected to a resource outside the group that is not being deleted ("you can't delete a virtual network with subnets that a virtual machine uses"). A deleted group cannot be recovered.

Per-type blockers the engine enforces (each cites its page in `res-model` 6.2): subnet with attached resources [S29]; virtual network with connected resources [S33]; NIC attached to a VM [S34]; NSG associated with a subnet or NIC (default rules cannot be deleted) [S30]; ASG containing NICs [S30]; route table associated with a subnet [S32]; public IP associated with a NIC or frontend [S31]; Recovery Services vault with protected items, backup data, soft-deleted data (14 days) or registered storage accounts [S45]; locks (`CanNotDelete` blocks delete, `ReadOnly` blocks delete and update, inherited down the tree, most restrictive wins) [S46].

VM delete: by default disks, NICs and public IPs are **kept**; the portal wizard sets the OS disk to "Delete with VM" and the CLI/PowerShell default is to detach. Options `--os-disk-delete-option`, `--data-disk-delete-option`, `--nic-delete-option`. [S47] Leftovers keep billing, and the UI says so.

Peering delete: **[Learn conflict]** one page says deleting a link also deletes the remote link, others say the remote link becomes `Disconnected`. **[Decision]** the second (section 11, N6).

### 4.6 Regions [Learn, S24][S25][S27][S28]

Two regions: `southeastasia` (Singapore, 3 availability zones, paired with East Asia) and `eastasia` (Hong Kong, 3 zones, paired with Southeast Asia). `global` is used for DNS zones. Nonregional services (subscriptions, management groups, DNS zones, Policy, Entra ID) have no region. A resource group has a location and its resources may differ. A public IP must be in the same location as what it is attached to; an NSG or route table associated with a subnet must be in the same subscription and location as the VNet. [S31][S29][S32] Learn says region pairing does not by itself provide failover [S24]; the sandbox models only that GRS names the paired region. `southeastasia3` (Johor Bahru) is a different region and is not modelled.

### 4.7 Resource provider registration [Learn, S10][S37]

State per subscription: `Registered`, `NotRegistered`, `Registering`. **[Decision]** the first create of a type auto-registers its provider (the portal and ARM/Bicep deployments register providers), except where the catalog documents a manual step (the Container Apps quickstart registers `Microsoft.App`). Registering needs the `/register/action` permission. A provider cannot be unregistered while it has resource types in use. The two documented not-registered errors are used as written in S37.

## 5. Governance

Checkpoint 14 built this. Evidence is [`research/policy-model.md`](research/policy-model.md) (fetched 2026-11-03).

- **Tags:** 50 per resource, group, or subscription; key 512 and value 256 characters; a storage account key is 128; names cannot contain `< > % & \ ? /`; group tags are not inherited. Azure DNS zones are limited to 15 tags. [policy S11]
- **Locks:** `CanNotDelete` and `ReadOnly`, on a subscription, group or resource; inherited; most restrictive wins; 20 per scope; lock name 1-90 characters. A lock needs `Microsoft.Authorization/locks/*` permission (`RBAC.md`). [S6][S7][S46]
- **Policy:** assignments with `deny` and `audit` (and `disabled`) against five built-in definitions: Allowed locations, Allowed resource types, Not allowed resource types, Require a tag and its value on resources, and Require a tag on resources. `DoNotEnforce` records non-compliance and does not block. A deny with enforcement on returns `RequestDisallowedByPolicy`. Append, modify, initiatives, exemptions, and custom rule text are not simulated. [policy S1-S10, S14]

## 6. Networking behaviour (tier 1)

Checkpoint 16 builds the reachability checker. One question is a new inbound TCP connection from the internet to a virtual machine's Standard public IP, on one port. It evaluates the subnet network security group first, then the network interface network security group, and names the matching rule. No network security group on either one denies that flow (decision N1). The outbound question, on one port to the internet, evaluates the network interface first and then the subnet. With no network security group on either, that outbound flow is not filtered. An inbound rule does not decide it. An existing network security group can be associated with the network interface from My Environment; that association does not add a rule, and both checks then evaluate it. One TCP rule can also be added to a group that already exists: inbound from Internet, or outbound to Internet, without changing which subnet or network interface uses the group. A third question takes one IPv4 address inside the same virtual network. The way out is checked first, then the destination subnet. An internet rule does not decide it. The network interface that has the address is checked after the destination subnet. The sandbox assigns the lowest free address in the subnet. Azure reserves the first four addresses and the last address, and does not guarantee that dynamic allocation is the next address. Routes, peering, DNS, and appliances are still the rest of the checkpoint. The full algorithm, with every step cited, is in [`research/networking-rules.md`](research/networking-rules.md) section 7. This section freezes the **decisions** that research left to the owner. They are **[Decision]**s by the assistant using the research's recommendation, listed so the owner can overrule any of them. Where Learn pages disagree, both pages are named in the research file (section 8.2).

| # | Topic | Chosen rule | Why |
|---|---|---|---|
| N1 | NSG on neither the subnet nor the NIC | Inbound from the internet to a **Standard** public IP or Standard load balancer frontend is denied. Any other flow treats that layer as "no NSG, does not filter" and the trace prints "no NSG at this layer". | S2 and the Learn training module S47 disagree; this is the only reading that keeps both true. |
| N2 | ASGs and tags in one rule | One service tag per source or destination field; up to 10 ASGs per field. | S1 says one, S44 and S48 say 10. The limits page is the dedicated numeric source. |
| N3 | UDR limit per route table | Not enforced in v1. | S5 says 400 (1,000 with Virtual Network Manager), S44 says 1,000. Not decision-making for a learner. |
| N4 | Next hop name for the VNet | Emit `VnetLocal`. | S39 (REST) vs S36 (portal wording). |
| N5 | "Allow forwarded traffic" | For a forwarded packet both links must allow it; the trace says "Learn describes the direction inconsistently". A packet is "forwarded" when it came through an NVA hop and its original source is not in the VNet sending it across. | S7 and S46 describe opposite sides. The content text stays non-directional. |
| N6 | Deleting one peering link | The other link becomes `Disconnected`; the user deletes it and recreates both. | S8 and S9 describe the state machine; S7's portal note disagrees. |
| N7 | Route with the same prefix as a default route | The user-defined route wins and the default route becomes `Invalid`. | S5's routing example. Its other note about BGP being "more specific" is not applied (no BGP in v1). |
| N8 | Default routes | Model ten, show six in effective-route output. | S5 lists ten, S37/S40 print six. |
| N9 | Private subnet default | New subnets default to `defaultOutboundAccess = false`. A per-subnet "legacy API behaviour" toggle sets `null`. The create form shows the Learn note. | S22 ("API released after March 31, 2026") and S24 word it differently. |
| N10 | Effective route next-hop names | Use the S5/S21 names (`VirtualNetworkPeering`, `VirtualNetworkServiceEndpoint`). | S40's enum omits them but S5 and S21 show them. |
| N11 | Rule-name casing | Use S32's casing for default rule names. | S1 and S32 differ. |
| N12 | `Internet` service tag | Approximate: any IPv4 address not in the VNet set and not in `0.0.0.0/8`, `10.0.0.0/8`, `100.64.0.0/10`, `127.0.0.0/8`, `169.254.0.0/16`, `172.16.0.0/12`, `192.168.0.0/16`, `224.0.0.0/3`. The UI says "approximation". | Learn's list is truncated in S32. |
| N13 | `VirtualNetwork` tag | VNet space, plus peered VNet space when `allowVirtualNetworkAccess` is on, plus prefixes of UDRs that are not `/0`. A trace warning notes this is partial. | S4 says the tag may include UDR prefixes and default routes without details. |
| N14 | NVA source address | The NVA does **not** NAT; the original source address is kept. It is a flag on the appliance. | Learn does not say. |
| N15 | Which peering link gates A to B | Only the link on A's side must have `allowVirtualNetworkAccess`. The trace notes "only the source-side link setting is documented". | S46 describes the local-to-remote direction only. |
| N16 | Public IP SKUs | Standard only. Basic public IPs and Basic Load Balancer were retired on 2025-09-30. | S23, S25. |
| N17 | Peering sync | Not simulated; every peering is in sync. | S6, S8 |

**Not simulated** (declared in the UI, full list in `net` 7.2): SNAT port exhaustion, NAT gateway internals, ExpressRoute, VPN gateways and BGP, Azure Firewall rule processing, Virtual Network Manager, Application Gateway and WAF, Route Server, Virtual WAN, DNS Private Resolver, ICMP behaviour (limited), IPv6, flow logs, idle timeouts, MTU, bandwidth, classic deployment model.

## 7. Fidelity tiers (the contract every catalog entry makes)

| Tier | The sandbox does | An entry at this tier must have |
|---|---|---|
| **1 Behaviour** | Real rules that change outcomes: connectivity, routing, DNS, access evaluation, locks | Everything in tier 2, plus engine rules with Learn-cited unit tests and explanation text for each refusal |
| **2 Lifecycle** | Create, configure, start, stop, delete, validate properties and names, billing-state notes | A `simulator` block (section 9), create form, naming rule, provisioning states, delete blockers, at least one catalog CLI command that runs against it |
| **3 Catalog** | Documented only, no "Try it" | The normal Atlas content; `tier: 3` |

Current catalog (29 entries) proposal: tier 1 = virtual network, subnet, network security group, application security group, route table, vnet peering, network virtual appliance, private DNS zone, Azure DNS zone, public IP address, network watcher, service endpoint, private endpoint, load balancer, resource group. Tier 2 = virtual machine, storage account, blob container, file share, app service plan, app service, container instances, container apps, VM scale set, Log Analytics workspace, alert rule, action group, Recovery Services vault, Azure Bastion. This is a proposal for review; it is changed in the entry file, not in code.

## 8. Directory layout (engine core landed in checkpoint 12)

```
src/engine/core/        generic: world store, result and trace types, serialise. No Azure concepts.
src/engine/azure/       Azure pack: hierarchy, ARM ids, naming, CIDR, subscription states, provider registration, locks, VM power
src/engine/azure/data/  built-in roles (checkpoint 13) and five built-in policies (checkpoint 14). Operation catalogue and generated resource schemas are later.
src/engine/azure/rbac/  evaluator, directory operations, built-in role lookup (checkpoint 13)
src/engine/azure/policy/ deny and audit evaluation for the shipped definitions (checkpoint 14)
src/cli/                later: tokenizer, shell interpreter, az parser, registry, output formatters (CLOUDSHELL.md)
src/content/            catalog entries (unchanged location until the multi-cloud refactor)
```

Checkpoint 12 built `core` and the Azure pack. Checkpoint 13 added `data/` and `rbac/`. Checkpoint 14 evaluates deny and audit on resource and resource group writes. `cli/` is not created yet.

Dependency rule: `core` imports nothing from `azure`; `cli` and the UI import the engine, never the other way round. A lint rule (`no-restricted-imports`) enforces the core side. Sandbox pages load `@/engine/azure` with a dynamic import. Catalog pages do not import it, so the roles file stays out of the catalog bundle.

## 9. Schema decisions for the catalog (applied in checkpoint 11)

All of these change `src/content/schema.ts`. They resolve the proposal in `PLAN.md` section 11.

### 9.1 `kind` **[Decision, proposed]**

| `kind` | What it is | Examples | Extra required fields |
|---|---|---|---|
| `azure-resource` | Addressable through Azure Resource Manager, including containers and extension resources. Learn calls resource groups, subscriptions and management groups "resources" too. [S2] | VM, resource group, subscription, management group, role assignment, lock | today's fields (`type`, `scope`, `example`) |
| `directory-object` | An object in Microsoft Entra, outside the ARM tree | tenant, user, group, service principal, managed identity | `directoryType`; no ARM `example` tabs, instead Portal, CLI and PowerShell tabs where they exist |
| `devops-tool` | Azure DevOps or GitHub feature | Azure Pipelines, GitHub Actions | `yaml` example |
| `concept` | A practice, not a thing you create | blue-green deployment, branching strategy | no region, no `type` |

Why four and not three: the Entra tenant and users are not ARM resources, and mixing them into `azure-resource` would give them fake ARM types. This follows Learn's own split between Azure and Entra roles (`RBAC.md` section 3).

### 9.2 `exams` **[Decision, proposed]**

`exams: Array<"az-104" | "az-400">` and `examNotes` becomes `{ exam, points[] }[]`. The migration attaches today's `examNotes` text to `az-104`. The home page filters by exam; the exam tag is never the boundary of scope. The source of truth for each exam is its official skills list, re-fetched before planning that exam.

### 9.3 Service-area `category` **[Owner, 2026-10-28]**

Today's five ids are AZ-104 domains. Replace them with service areas so AZ-400 and later providers fit:

| New id | Label | Old ids it absorbs |
|---|---|---|
| `management-governance` | Management and governance | `identity-governance` (resource group) |
| `identity-access` | Identity and access | (new: RBAC, Entra objects) |
| `compute` | Compute | `compute` (VM, VMSS, App Service plan, App Service) |
| `containers` | Containers | Container Instances, Container Apps (moved out of `compute`) |
| `storage` | Storage | `storage` |
| `networking` | Networking | `networking` |
| `monitoring` | Monitoring | Log Analytics, alert rule, action group |
| `backup-recovery` | Backup and recovery | Recovery Services vault |
| `security` | Security | (new: Key Vault, Defender, later) |
| `databases` | Databases | (new, later) |
| `devops` | DevOps | (new, AZ-400) |

Category is a navigation aid, not an Azure fact. **[Owner, 2026-10-28]** Network Watcher is `networking`.

Checkpoint 11 stores the slim block only: `armType`, `apiVersion`, optional `nameRule`, and `provisioning` when a Learn page enumerates the values. The `form` steps below are checkpoint 15. Confirmed by the owner on 2026-10-28.

### 9.4 `tier` and the shape of `simulator` **[Owner, 2026-10-28]**

`tier: 1 | 2 | 3` (section 7), required on every entry. The old ad hoc `simulator` array (`key, label, type, required, default, options, help`) is replaced by one object, required for tiers 1 and 2:

```ts
simulator: {
  armType: string;                       // "Microsoft.Network/virtualNetworks"
  apiVersion: string;                    // pinned, must equal the version used in the catalog's Bicep/ARM example
  nameRule: string;                      // key into the NameRule table (section 3.2)
  provisioning: string[];                // allowed provisioningState values for this type
  schemaRef?: string;                    // generated schema key, "Microsoft.Network/virtualNetworks@2026-03-01"
  form: { steps: Array<{
    id: string; label: string;           // portal tab names from the Learn quickstart
    fields: Array<{
      path: string;                      // property path in the ARM body, checked against schemaRef at build time
      label: string; control: "text"|"select"|"multi"|"toggle"|"cidr"|"number"|"ref";
      required: boolean;                 // portal-required, not schema-required (see section 11)
      default?: unknown; options?: Array<{value: string; label: string}>;
      refType?: string;                  // for control "ref": which resource type to pick
      help?: string; learnUrl?: string;
    }> }> };
  deleteBlockers?: string[];             // engine rule ids from section 4.5
  billingNote?: string;
  cli?: string[];                        // command paths from the catalog that act on this type (CLOUDSHELL.md)
}
```

Build checks: every `path` exists in the generated schema; every `cli` command is in the registry; `apiVersion` matches the example. Fields the owner sees in the portal and in the generated types can differ; the overlay wins.

## 10. Persistence and versioning

- **[Decision]** Save the world as one JSON envelope `{ format: "polaris-world", schemaVersion, savedAt, world }`. Imported data (built-in roles, schemas) is **not** saved with it; only user state is.
- **[Decision]** Access goes through a `WorldStore` interface. v1 implementation is `localStorage` (as the plan says). If a world outgrows it, the interface lets us switch to IndexedDB without touching the engine. Browsers limit this storage; the exact limit is a browser fact that is not on Learn and is checked when the store is built.
- Every breaking change bumps `schemaVersion` and adds a pure `migrate(from, to)` function with a test using a saved fixture. Unknown newer versions are refused with a message, never partly loaded.
- Export and import are the same envelope as a downloadable file. Sharing a sandbox (checkpoint 19) is that file or a compressed link.
- Reset recreates the starter world: one tenant, one subscription, one user "You" with the Owner role on that subscription and the Global Administrator directory role. **[Decision]** this is a sandbox convenience; Learn does not describe a default state.
- Never store real credentials, tokens or real Azure IDs. Nothing is sent anywhere.

## 11. Spike A verdict: generate forms from Microsoft's resource definitions

Full evidence: [`research/spike-a-generated-forms.md`](research/spike-a-generated-forms.md).

**Verdict: yes, as a build-time source for property names and types, with a hand-written overlay.**

1. **Source:** `Azure/bicep-types-az` `generated/` (MIT, Microsoft). Not the Learn template pages (licence of their source repo is not public) and not the whole REST specs (about 10 times bigger, used only to fill gaps such as defaults).
2. **What it gives:** property names, nesting, types, enums, `ReadOnly` / `WriteOnly` flags, a few length, pattern and range limits, and descriptions. A 32-type subset is about 829 KB minified, 141 KB gzipped before pruning.
3. **What it cannot give:** portal labels, tab layout, defaults, cross-field rules (CIDR overlap, GatewaySubnet), region and SKU availability, naming rules, behaviour. Those stay hand-written in the overlay (section 9.4) or come from Learn.
4. **Risks and mitigations:** "required" in the types is not "portal-required" (the overlay declares it). Enums are open (the trailing string is dropped to make a dropdown, and the UI says "values listed in the API definition"). The generator is moving to TypeSpec and types have disappeared and returned (DNS), so **pin a commit SHA** and fail the build if an expected `Type@version` key is missing. Add the MIT notice to a credits page.
5. **API version rule:** the generated schema must be pinned to the same API version as the catalog's Bicep example for that type, otherwise form fields and example code drift.
6. **Pruning:** an allow-list of property paths per type keeps each type to the fields a portal form shows (a VNet closure is about 560 nodes unpruned).
7. **When:** checkpoint 15. The first slice wires hand-written create forms for a resource group, virtual network, subnet, virtual machine, and storage account, plus the My Environment list. The second slice adds a public IP address, a network security group, and a network interface (`6e243a4`). The link slice, from My Environment, attaches one network interface to a virtual machine, one public IP to that interface, and one network security group to a subnet with one inbound rule. Those actions call the engine and show its refusal. They do not evaluate reachability. The generator script, and create forms for the other tier 1 and tier 2 entries, are the rest of checkpoint 15. The generator still does not supply portal labels.

## 12. Multi-cloud readiness (section 10 of the plan, made concrete)

Version 1 contains only Azure. The design keeps these separable so adding AWS (and later maybe GCP or another provider, depending on what the owner studies) is additive:

- `World.provider` exists now. The generic core (`src/engine/core`) has no concept of subscription, ARM or NSG.
- Provider-specific: hierarchy levels, ID formats, name rules, regions, the networking rule pack, the RBAC model (AWS IAM is a different model, so `RBAC.md` is the *Azure* access pack, not a generic one), the CLI registry and grammar (`az` vs `aws`), example formats.
- Content moves under a provider folder only in the later refactor checkpoint described in `PLAN.md` section 10. Nothing is renamed now.
- Do not generalise early. Introduce an abstraction only when the second provider actually needs it.

## 13. Tests

- One test file per rule family. Each test names its Learn URL in a comment and uses Learn's own examples as fixtures where Learn has them (for example the VM4 NSG example, Contributor not assigning roles, the `*/read` wildcard examples).
- **Drift tests:** every catalog `cli:` example runs against a fresh world and must succeed; every catalog ARM example deploys into a fresh world; every overlay `path` exists in the generated schema.
- **Property tests** for the pure parts: ID round-trip, CIDR overlap and containment, wildcard matching.
- No test may read the wall clock or the network.

## 14. Owner decisions recorded (2026-10-27)

| Decision | Answer |
|---|---|
| Deployments in the shell | ARM JSON only in v1; catalog Bicep is compiled to ARM at build time (`CLOUDSHELL.md`) |
| Switching identity | Yes, "act as" simulated users, groups and service principals (`RBAC.md`) |
| Tenant size | One tenant, default subscription, add more subscriptions and management groups |
| Built-in roles | Ship only roles that Learn documents. Permissions come from the owner's `az role definition list` export. The extra undocumented roles are a later, opt-in list (`RBAC.md` section 8) |
| Order | Provider after AWS is decided by what the owner studies next |

## 15. Not verified and open

1. Learn does not give the order in which ARM runs authorization, locks, policy and validation (section 4.1 is a design choice).
2. No documented creation time for most resources; the timer is a UX choice.
3. Subscription state transitions are undocumented; the user sets the state.
4. Display strings for VM stopped and deallocated; resource group `provisioningState` values; per-service availability-zone support in the two regions; naming rows for Container Apps environments and Network Watcher (`res-model` section 8).
5. Policy deny and audit for five built-in definitions is researched (`research/policy-model.md`). Append, modify, initiatives, exemptions, and a background compliance cycle are still not simulated.
6. Whether the content licence of generated Learn pages allows import. Not needed for this design: sources are the owner's API export and MIT repos (see `RBAC.md` section 8).
7. The 17 networking decisions above are the assistant's defaults for owner review. Two Learn pages quoted in `net` (S47, S48) were read only as search excerpts and must be fetched in full before their claims are used in product text.
