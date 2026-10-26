# Polaris: Azure Resource Atlas - Plan

Living document. Update the **Status** section at the end of every checkpoint.
If you are picking this project up cold (human or AI), read this file first, then `AGENTS.md`.

---

## 1. What this is

A responsive, frontend-only (static export) site that works as a **visual vocabulary of Azure resources**.

- Shows the hierarchy: tenant > management group > subscription > resource group > resource.
- Every resource has: plain-English definition, analogy, when to use / not use, prerequisites, example config (Portal, Azure CLI, PowerShell, Bicep, ARM), AZ-104 exam notes, a modal, and a shareable page.
- **Phase 2:** a free in-browser **simulator** ("Try it" -> create page). Resources show Creating / Running / Stopped. It models two regions, peering, DNS, NVA/UDR routing and reachability checks. **Nothing ever talks to real Azure.**

Audience: someone studying AZ-104 who wants to understand how Azure pieces fit together, with no Azure account needed.

> **Vision update (decided 2026-10-25, supersedes the exam focus):** Polaris is **not exam-specific**. It started that way, but the goal is a **free place to try Azure out**: the atlas teaches what each thing is, and a browser-only sandbox lets you create and configure it and get the feel of Azure, without hosting anything real. **RBAC is now in scope** (section 12). Exams (AZ-104, AZ-400) become tags and study aids, not the boundary of the product.

> **Scope expansion (decided 2026-10-25):** Polaris is no longer limited to AZ-104. The goal is to cover **as many Azure resources and services as possible**, because the user will also take **AZ-400 (DevOps Engineer Expert)** next. Entries are tagged with the exams they appear in (see section 11). The scope rows in section 2 that say "left out" were AZ-104-only decisions and are **to be revisited**.

> **Priority order (decided 2026-10-25):** Polaris will grow beyond Azure (AWS first, then possibly GCP and others, see section 10), **but Azure comes first and must be fully covered before any other cloud is started.** Do not begin multi-cloud work until v1 ships (checkpoint 20) and the Azure coverage gates pass.

## 2. Scope decisions (already made)

| Topic | Decision |
|---|---|
| Exam | Started as AZ-104 only. **Now AZ-104 first, then AZ-400, then the wider Azure catalog** (section 11). Source of truth per exam is the official skills-measured list. |
| RBAC | Out of the AZ-104 pass so far. **Revisit:** managed identities and service principals are in AZ-400. |
| Networking | The largest group. |
| Governance extras | Policy, locks, tags, budgets were left out for AZ-104. **Revisit** (AZ-400 touches Defender for Cloud, policy and compliance). |
| Application Gateway | Was left out as not a skills-measured heading in AZ-104. **Revisit** under the wider-catalog goal. |
| Subscription / Resource Group | Container entries, not ordinary resources. |
| Hosting | Static export, no backend, no database. State lives in `localStorage`. |
| Regions in the simulator | Southeast Asia (`southeastasia`) and East Asia (`eastasia`). |

## 3. Working agreement (rules for every session)

1. **Checkpoints.** Work in small checkpoints. At the end of each one, tell the user and show the proposed commit message in chat.
2. **The user commits.** The assistant never runs `git commit`.
3. **It must run.** Before asking for a commit: `npm run check:snippets`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, then dev server plus a browser check.
4. **Say when to test by hand.** Flag which checkpoints deserve a manual click-through.
5. **Order of work (revised 2026-10-25):** finish checkpoint 9, then design the sandbox and migrate the schema (10-11), then build the engine, RBAC, governance, create pages, networking rules and Cloud Shell (12-19), then release (20). Catalog batches continue after checkpoint 11. See section 6.
6. **Sources: Microsoft Learn or other official Microsoft docs only.** Every factual claim in content (limits, defaults, names, portal labels, CLI flags, SKUs, exam notes) is verified against Learn before commit. If it cannot be verified, reword it to what Learn says or delete it. No blog posts, no memory.
7. **Read the Next.js docs first.** `AGENTS.md` says this Next.js version has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before using a Next API.
8. **Check `git status` before finishing a checkpoint.** New files must not be left untracked (see the Status section).

### Content verification routine

For each new or changed entry:

1. Fetch the Learn overview, the quickstart or tutorial, and the CLI / PowerShell / Bicep reference pages.
2. Compare each claim. Fix wording, portal step labels, flags and property names to match Learn.
3. Note anything Learn does not state and either drop it or label it clearly.
4. Run `BICEP_PATH=/tmp/bicep-tool/bicep npm run check:snippets` (see Tooling notes).
5. Mention in the checkpoint report what was verified and what could not be.

Batching tip: verification of several entries can be split across read-only subagents, but make them **return or apply changes in the same turn**, and write findings down. Do not rely on chat context surviving.

## 4. Architecture (as built)

- **Next.js 16.4.3** App Router + Turbopack, `output: "export"`, `trailingSlash: true`. React 19, Tailwind v4, shadcn/ui (Base UI), framer-motion, fuse.js, zod 4, next-themes, lucide-react.
- **Content** is typed TypeScript, validated by Zod at build time:
  - `src/content/schema.ts`: `resourceSchema` (slug, name, type, category, scope, icon, tagline <= 120 chars, definition, analogy, whenToUse, notFor, prerequisites, example, examNotes, related, docsUrl, optional simulator fields).
  - `src/content/resources/<slug>.ts`: one file per resource. Register it in `src/content/index.ts`.
  - `src/content/index.ts` loader: checks slugs are unique and that `related` and `prerequisites[].slug` point at real entries.
  - `src/content/hierarchy.ts`, `regions.ts`, `summary.ts`, `payload.ts`: hierarchy levels, region list, list-card shape, detail payload.
- **Icons:** `src/components/resource-icon.tsx` maps a lucide icon name to a component. Add new icon names there (fallback is Cloud).
- **Routes:** home (hierarchy map + searchable catalog), `/resources/<slug>/` (full page), `/data/resources/<slug>` (static JSON used by the client modal). The modal opens via the History API and is shareable by URL.
- **Snippet checker:** `scripts/check-snippets.ts` compiles every Bicep example with the real Bicep CLI and parses every ARM example. It catches wrong property names.
- **Snippet writing rules** (inside TS template literals): no `${}`; use `\\` for bash line continuation; use `` \` `` for the PowerShell backtick.

### Tooling notes (Cursor sandbox)

- `bicep` and `tsx` must run outside the sandbox. Bicep binary lives at `/tmp/bicep-tool/bicep` (re-download if `/tmp` was cleared) and is passed with `BICEP_PATH`.
- Start the dev server outside the sandbox and in the background. Stop it with `pkill -f "next dev"`.
- Browser testing: CDP scripts in the Cursor browser. The pane is small, so use iframes at a fixed width (for example 390px) to test phone layouts.

## 5. Current catalog (29 entries)

| Category | Entries |
|---|---|
| Identity & Governance | Resource Group |
| Compute (6) | Virtual Machine, Virtual Machine Scale Set, App Service Plan, App Service (Web App), Container Instances, Container Apps |
| Storage (3) | Storage Account, Blob Container, Azure Files Share |
| Monitor & Backup (5) | Log Analytics Workspace, Azure Monitor Alert Rule, Action Group, Network Watcher, Recovery Services Vault |
| Networking (14) | Virtual Network, Subnet, Public IP Address, Network Security Group, Application Security Group, Route Table, Virtual Network Peering, Network Virtual Appliance, Azure DNS Zone, Private DNS Zone, Load Balancer, Azure Bastion, Service Endpoint, Private Endpoint |

The hierarchy map still shows Tenant, Management group and Subscription as "Not in catalog yet".

## 6. Roadmap

Reordered 2026-10-25. Each checkpoint ends with the checks in section 3 and a commit message shown in chat.

**Why the order changed:** the product is now an Azure sandbox with RBAC and a simulated Cloud Shell (section 12), not just a catalog. The world model now includes the tenant, the directory, management groups, subscriptions and role assignments. If we keep writing catalog entries first, we will rewrite them when the model arrives. So: finish checkpoint 9, then **design the sandbox and migrate the schema once**, then build the engine, and keep adding catalog content afterwards in batches that fit the new schema.

### Done

Checkpoints 1-8 (see the status log): scaffold, theming, schema, home page, modal and pages, networking, compute. 22 entries.

### Next

**Checkpoint 9 - Storage, monitoring, backup** *(done)*
- Storage: Blob container, Azure Files share (SMB / NFS, tiers), plus notes on SAS, access tiers, lifecycle management and replication.
- Monitor & Backup: Log Analytics workspace, Azure Monitor alert rule (and action group), Network Watcher (connection monitor, IP flow verify, next hop), Recovery Services vault (backup policy, soft delete).
- Verify every claim against Learn, snippet checker, browser sweep.

**Checkpoint 10 - Design the sandbox (documents and decisions, no UI)** *(next)*
- `docs/SIMULATOR.md`: the world model (tenant > directory > management groups > subscriptions > resource groups > resources, role assignments, locks, policy assignments), lifecycle states, validation, persistence format and versioning, tiers of fidelity (section 12).
- `docs/RBAC.md`: role definition and assignment model, scope inheritance, action wildcard matching, notActions, dataActions, deny assignments, custom roles, how Entra directory roles are kept separate. Every rule cites Learn.
- `docs/CLOUDSHELL.md`: command grammar, which `az` command groups ship first, output formats, `--query`, error messages, session state (`az login`, `az account set`, defaults).
- Schema decisions: `kind`, `exams`, fidelity `tier`, service-area categories, the shape of `simulator` fields (replace the ad hoc ones).
- Short spikes, each with a written verdict: (a) generating create forms and validation from Microsoft's published resource definitions (licence, size, staleness), (b) a JMESPath implementation for `--query`, (c) whether Bicep can be compiled in the browser or only ARM JSON, (d) whether `az` help text can be reused from the open-source CLI (licence).
- **Good checkpoint for you to read and push back on.** Nothing gets built until you agree.

**Checkpoint 11 - Schema migration and hierarchy entries**
- Add `kind`, `exams`, `tier` and service-area categories. Migrate all existing entries. Add filters (by exam, by kind, by tier) to the catalog.
- Add the hierarchy entries: Tenant, Management group, Subscription (containers).
- Dependency graph view on each page, and a light accessibility pass.

**Checkpoint 12 - Engine core**
- Pure TypeScript engine, no React: resource graph, create / update / delete / start / stop, lifecycle states (Creating -> Running, Stopped, Deallocated), name and CIDR validation, parent and region rules.
- `localStorage` persistence with a versioned schema, reset, import and export.
- Unit tests for every rule. Each rule carries a comment with its Learn URL.

**Checkpoint 13 - Directory and RBAC**
- Import all built-in roles with a script and an "as of" date.
- Simulated directory (users, groups, service principals, managed identities), role assignments at every scope with inheritance, custom roles.
- Evaluator and the "what if" checker (allowed or denied, with the reason).
- Catalog entries: Role definition, Role assignment, Custom role, Managed identity, Service principal, User, Group.

**Checkpoint 14 - Governance that changes outcomes**
- Tags, resource locks (CanNotDelete, ReadOnly), and Azure Policy (assignments with deny and audit effects, built-in definitions as data). These matter to the sandbox because they decide whether an action succeeds.
- Catalog entries for each.

**Checkpoint 15 - Create pages ("Try it")**
- A create form per tier 1 and tier 2 entry, following the Learn portal labels, with validation messages that explain why.
- "My Environment" list with state badges.

**Checkpoint 16 - Networking behaviour and reachability checker**
- Route selection (longest prefix, then UDR > BGP > system), NSG evaluation, peering (non-transitive, forwarded traffic, gateway transit), NVA forwarding, DNS (public, private, links, autoregistration), service and private endpoints.
- "Can A reach B?" with a full trace and the rule that allowed or blocked each hop.

**Checkpoint 17 - Cloud Shell v1**
- Terminal UI in the page, command parser, and the first command groups: `az login`, `az account`, `az group`, `az network vnet / subnet / nsg / public-ip`, `az vm`, `az storage account`, `az role assignment`.
- Output formats (`json`, `table`, `tsv`), `--query`, `--help`, errors that match the documented ones.
- The CLI examples already in the catalog must run against the in-browser world.

**Checkpoint 18 - Cloud Shell v2**
- `az deployment group / sub create` with ARM JSON (and Bicep if the spike says it is possible), `what-if`, export as ARM / Bicep.
- More command groups, PowerShell flavour if justified, tab completion.

**Checkpoint 19 - Dashboard, scenarios, sharing**
- Region-aware dashboard and connectivity map, guided scenarios (hub and spoke across two regions, private access to storage, least-privilege RBAC).
- Share a sandbox as a file or a link, with no backend.

**Checkpoint 20 - Release v1**
- GitHub Actions static deploy (Azure Static Web Apps or Vercel).
- Replace the boilerplate `README.md`.
- Azure coverage gate for AZ-104 (`docs/COVERAGE.md`: every skills bullet mapped to an entry, status and fidelity tier), plus a content audit against Learn.

### After v1 (and in between, in batches)

- **Catalog expansion** continues in batches of about five entries, using `docs/BACKLOG.md`, and always after checkpoint 11 so entries use the new schema. Priority: AZ-400 Azure services first, then DevOps tools and concepts, then the long tail (section 11).
- **Multi-cloud** (section 10) starts only after v1 and the AZ-104 and AZ-400 coverage gates.
- **Rule for interleaving:** a catalog batch may be inserted between any two checkpoints from 12 onwards if the user wants more content, but never before checkpoint 11.

## 7. Simulator design notes (to be expanded in `docs/SIMULATOR.md`)

These are starting points, not verified facts. Each rule must be checked against Learn before it is implemented.

- **World model:** `subscription -> resourceGroups -> resources`, each resource has `id`, `type`, `region`, `state`, `properties`, and parent references. Region is one of `southeastasia`, `eastasia`.
- **State machine:** `Creating` (short timer) -> `Running`. VMs also `Stopped` and `Deallocated`, because they bill differently.
- **Pure engine, thin UI:** engine functions take a world and return a new world or a result (`createResource(world, input)`, `checkReachability(world, from, to, port, protocol)`). No React inside the engine, so it can be unit tested.
- **Reachability algorithm (sketch):**
  1. Resolve the destination name (DNS), or take the destination IP.
  2. Pick the next hop from the source subnet's effective routes.
  3. Walk hops (VNet local, peering, NVA, internet), tracking forwarded traffic and peering rules.
  4. At each NIC and subnet boundary, evaluate NSG rules in priority order, outbound at the source and inbound at the destination.
  5. Return a trace plus the first blocking rule.
- **Explainability is the product.** A "no" must always say which rule or missing piece caused it.
- **Out of scope for the simulator:** real timing, cost estimation, quotas, and anything RBAC.

## 8. Open questions

- Answered 2026-10-25: "100% Azure" means as many Azure resources as possible, not just AZ-104, and AZ-400 is next. The coverage gate is therefore per exam (section 11). Still open: where the long tail of Azure services stops, and what order to add it in.
- AZ-400 is mostly DevOps practice and tooling (GitHub, Azure DevOps, pipelines), not ARM resources. How should those entries look? See section 11.
- Do Tenant and Management group get catalog entries, or stay explainer-only on the hierarchy map?
- Hosting target for deploy: Azure Static Web Apps (on-theme) or Vercel (simplest)?
- `az network private-endpoint dns-zone-group create --zone-name`: Learn describes it as the DNS zone name, but its own examples use a label. The content treats it as a label and says so. Re-check when the CLI reference is updated.
- Bicep API versions in examples (for example `2023-09-01`) compile fine, but Learn lists newer ones. Decide whether to bump them in one sweep.
- Peering "Allow forwarded traffic": Learn describes which side carries it inconsistently, so the content is deliberately non-directional.

## 9. Status log

| # | Checkpoint | State |
|---|---|---|
| 1 | Scaffold Next.js with static export | Done |
| 2 | shadcn/ui, theming, base dependencies | Done |
| 3 | Typed content schema and first entries | Done |
| 4 | Home page: hierarchy map and searchable catalog | Done |
| 5 | Detail modal and static resource pages | Done |
| 6 | 10 networking resources and the snippet checker | Done |
| 7 | Load Balancer, Bastion, Service Endpoint, Private Endpoint, and a Learn verification pass over all 17 entries | Done |
| 8 | Compute: VM Scale Set, App Service Plan, App Service, Container Instances, Container Apps (22 entries total). Also fixed long unbroken words stretching the detail page on phones. | Done, waiting for commit |
| 9 | Storage and monitor and backup: Blob Container, Azure Files Share, Log Analytics Workspace, Alert Rule, Action Group, Network Watcher, Recovery Services Vault (29 entries total) | Done, waiting for commit |
| 10 | Design the sandbox (documents only) | Next |
| 11-20 | See roadmap in section 6 | Not started |

**Lesson from checkpoint 7:** a commit once left four new content files untracked while `index.ts` imported them, which breaks a fresh clone. Run `git status` before every commit and stage new files.

**Decision made in checkpoint 8:** App Service Plan and App Service (Web App) are two separate entries, because the exam treats scaling, tiers and slots separately.

## 10. Future: multi-cloud (AWS first, then GCP or others)

**Status: planned, not started. Azure must be covered first** (coverage gates in checkpoint 20 and the AZ-400 batches). Everything below is a design direction, not a commitment, and it is the reason the sandbox design is provider-aware from the start (checkpoint 10).

Goal: a provider switcher (Azure, AWS, GCP, others) so the same atlas can teach any cloud once the user has studied it. The content shape (definition, analogy, when to use, prerequisites, exam notes) is already provider-neutral. These parts are Azure-specific today and would need to become per-provider:

| Area | Azure today | Per-provider version |
|---|---|---|
| Hierarchy map | Tenant > management group > subscription > resource group > resource | Provider-defined levels (AWS: organization > account > region/VPC; GCP: organization > folder > project) |
| Categories | The five AZ-104 domains | Categories that match that provider's exam |
| `type` field | ARM resource type | Generic resource-type string |
| Example tabs | Portal, CLI, PowerShell, Bicep, ARM | Provider formats (AWS: Console, CLI, CloudFormation, CDK; GCP: Console, gcloud, and so on) |
| Snippet checker | Bicep compiler | One checker per provider (for example `cfn-lint` for CloudFormation) |
| Regions and simulator rules | Southeast Asia and East Asia, NSG and UDR rules | Provider regions and a rule pack per provider |
| Source of truth | Microsoft Learn only | That provider's official docs only |

Direction (to be refined when the work starts):

- **Provider layer:** each provider is a config (name, hierarchy levels, categories, example formats, regions, docs source, exam name). Content moves from `src/content/resources/` to `src/content/azure/...`, with `src/content/aws/...` beside it. Slugs are unique per provider, and the loader validates cross-references within a provider.
- **URLs and switcher:** `/azure/resources/<slug>/`, `/aws/resources/<slug>/`. A header switcher remembers the choice in `localStorage`. Home page and search show one provider at a time.
- **Cross-cloud equivalents:** each entry can link to its counterpart ("AWS: VPC", "GCP: VPC network") and state the real differences (for example, AWS security groups are stateful and attach to the instance, while network ACLs are stateless and attach to the subnet). This makes learning a second cloud faster.
- **Simulator:** generic engine core (resource graph, lifecycle, persistence, reachability walker) plus a rule pack per provider for routing, firewalls, DNS and peering, because those rules genuinely differ between clouds.
- **Rename:** "Polaris: Azure Resource Atlas" becomes something like "Polaris: Cloud Resource Atlas" when the second provider ships.
- **Same working rules per provider:** every claim verified against that provider's official docs, snippet checker for each example format, checkpoints with commit messages shown in chat.

Suggested order once the gate passes: (1) one refactor checkpoint that introduces the provider layer with Azure as the only provider and no visible change, (2) design the simulator engine to be provider-aware, (3) start AWS content with the same checkpoint rhythm as Azure.

Open questions for later: which providers after AWS, and which exam each is tied to (this decides the categories).

## 11. Scope expansion: wider Azure catalog and AZ-400

Decided 2026-10-25. Skills list read from the live AZ-400 study guide ("Skills measured as of July 27, 2026"): https://learn.microsoft.com/credentials/certifications/resources/study-guides/az-400. Re-fetch it before planning the AZ-400 checkpoints, because it changes.

### What AZ-400 covers (domain weights)

| Domain | Weight |
|---|---|
| Design and implement processes and communications | 10-15% |
| Design and implement a source control strategy | 10-15% |
| Design and implement build and release pipelines | 50-55% |
| Develop a security and compliance plan | 10-15% |
| Implement an instrumentation strategy | 5-10% |

### Why this changes the design

Most of AZ-400 is **not Azure resources**. It is DevOps practice and tooling: GitHub Flow, branch policies, GitHub Actions and Azure Pipelines, YAML templates, deployment strategies (blue-green, canary, ring, feature flags), pipeline security, Dependabot and code scanning. The current schema assumes an ARM-style resource with a region, a type, prerequisites and a Bicep example. That does not fit a branch policy or a pipeline.

Parts of AZ-400 that **are** Azure services and fit the current model (to be confirmed against the live list): Azure Key Vault, Azure App Configuration (Feature Manager), managed identities and service principals, Azure Container Registry and AKS, Azure Monitor with Application Insights, VM / Container Insights, Defender for Cloud, Azure Deployment Environments, Azure Automation State Configuration and Azure Machine Configuration, plus deployment slots and load balancing (already in the catalog).

### Proposed model (needs the user's confirmation)

- **Entry kinds:** add a `kind` field: `azure-resource` (today's entries), `devops-tool` (Azure DevOps and GitHub features such as Azure Pipelines, Azure Repos, Azure Boards, Azure Artifacts, GitHub Actions), and `concept` (practices such as deployment strategies or branching strategies). Each kind gets its own required fields, so a concept does not need a region or a Bicep example.
- **Exam tags:** replace the single exam-domain `category` with two things: a service-area category (Networking, Compute, Storage, DevOps, Security, Monitoring, and so on) and an `exams` list (`az-104`, `az-400`, later others). Each entry can carry exam notes per exam.
- **Hierarchy map:** DevOps tools live outside the ARM hierarchy (an Azure DevOps organization or a GitHub organization is not a subscription or resource group). Give them their own small map or a separate section instead of forcing them into the Azure tree.
- **Examples:** DevOps entries use YAML (GitHub Actions workflow, Azure Pipelines YAML) as the main example. The snippet checker gets a YAML syntax check at minimum, and a real schema check where an official schema exists.
- **Simulator:** stays focused on networking and compute core. Not every entry needs a "Try it" page. A pipeline walkthrough could be a later, separate idea.

### Long tail of Azure services

"As many as possible" has no natural end, so keep a backlog file `docs/BACKLOG.md` of services not yet covered, ordered by (1) appears in AZ-104 or AZ-400, (2) commonly used, (3) the rest. Each checkpoint takes the next batch of about five entries and follows the same Learn-verification routine. Candidates already deferred from earlier scope decisions: Application Gateway, Azure Firewall, VPN Gateway, ExpressRoute, NAT Gateway, Azure Policy, resource locks, tags, budgets, Entra ID objects, managed identities, Key Vault, Azure SQL, Cosmos DB, Azure Functions.

### Revised order

Superseded by the roadmap in section 6 (reordered 2026-10-25 when the sandbox vision was adopted). In short: checkpoint 9, then design (10), schema migration (11), engine, RBAC, governance, create pages, networking, Cloud Shell, release, then AZ-400 and long-tail batches.

## 12. Vision: Azure sandbox that feels like Azure, with RBAC

Decided 2026-10-25. The site is a free, browser-only place to try Azure without an Azure account or any cost. Nothing is hosted and nothing talks to real Azure, but creating, configuring, connecting and securing things should feel like the real thing.

### Two parts, one product

| Part | What it is |
|---|---|
| **Atlas** (built so far) | What each resource is, prerequisites, examples, notes. Learn mode. |
| **Sandbox** (Phase 2, now the core of the product) | Create and configure resources in a simulated tenant. Try mode. |

The sandbox is no longer an optional add-on. The catalog exists to feed it.

### RBAC is in scope: copy Azure's real model

Yes, we copy how Azure does it, including the built-in roles. The data is public:

- Azure has **several hundred built-in roles** (the Microsoft Learn built-in roles page lists roughly 500 role IDs, so confirm the exact count when importing). Each role is a definition: a name, an ID, `actions`, `notActions`, `dataActions`, `notDataActions` and assignable scopes.
- Source of truth: the Learn built-in roles reference and the Azure RBAC docs, and the role definitions that Microsoft publishes. Import them into a static JSON file by a script with a recorded "as of" date, not by hand. Re-import periodically, since Microsoft adds roles.
- **Ship all built-in roles as data, but model behaviour deeply only where it matters.** Evaluating "can this principal do this action on this resource" needs only the role's action strings, so every built-in role works for free once the evaluator exists.

What the RBAC part of the sandbox models:

- A simulated **directory** (Entra-style): users, groups, service principals, managed identities. This lives at the tenant level, outside the subscription tree.
- **Role assignments** at any scope (management group, subscription, resource group, resource), with **inheritance down the scope tree**.
- **Custom roles**, with the same action syntax and wildcard matching (`Microsoft.Compute/*`, `*/read`).
- **Evaluation:** actions minus notActions, union across assignments, and deny assignments where documented. Data actions are evaluated separately from control-plane actions.
- A **"what if" checker**: pick a principal, an action and a resource, and the sandbox says allowed or denied and shows which assignment or missing role caused it. This follows the "explainability is the product" rule.
- Owner / Contributor / Reader / User Access Administrator behaviours as documented (for example, Contributor cannot assign roles).
- Entra directory roles (for example Global Administrator) are a **separate** system from Azure RBAC roles. Model them separately and say so in the UI, because mixing them up is a classic mistake.

Every rule is checked against Microsoft Learn before it is implemented, like the rest of the content.

### Fidelity tiers (so "as close to Azure as possible" stays achievable)

Azure has hundreds of resource types, and hand-modelling the behaviour of each is not realistic. So each entry declares how deep its simulation goes:

| Tier | What the sandbox does | Examples |
|---|---|---|
| 1 - Behaviour | Real rules: connectivity, routing, DNS, access evaluation | VNet, NSG, route table, peering, private DNS, RBAC |
| 2 - Lifecycle | Create, configure, start/stop/delete, property validation, billing-state notes | VM, storage account, App Service, Container Apps |
| 3 - Catalog | Documented only, no "Try it" yet | Long-tail services |

Idea to evaluate for scale: generate the create forms and property validation from Microsoft's own published resource definitions (the Bicep resource type definitions and the Azure REST API specifications, both published by Microsoft) instead of writing every form by hand. That would give real property names and allowed values for tier 2 at scale. Verify the licence, size and staleness before committing to it.

### "Feels like Azure" ideas (not commitments)

- Portal-style create flow with the same tab names and labels used in the Learn quickstarts.
- A simulated **Cloud Shell** that accepts a documented subset of `az` commands and Bicep what-if style output, against the in-browser world. The CLI and Bicep examples already in the catalog become runnable.
- A simulated **Activity log** and **role assignment** blade.
- Export the sandbox as a Bicep file, and import one.
- Sharing a sandbox state via a link or a downloadable file (no backend).

### Effect on the plan

- The sandbox design (checkpoint 10) now comes right after checkpoint 9 and the simulator engine design moves up in importance, because the world model now includes the tenant, the directory, management groups, subscriptions and role assignments, not just networking. Design it before adding much more catalog content, so new entries are written to fit it.
- RBAC and directory entries join the catalog (checkpoint 10 area): Role definition, Role assignment, Custom role, Managed identity, Service principal, User, Group, Management group, Subscription, Tenant.
- The catalog schema gets the `kind`, `exams` and fidelity-tier fields described in section 11, plus the tier above.
- The earlier "left out" scope items (RBAC, Policy, locks, tags, budgets) are now in scope. Policy and locks matter to the sandbox because they change what actions succeed.

### Risks to keep honest about

- **Fidelity:** a simulation is never the real service. The UI must always say "simulated" and link to Learn for the real behaviour. Where Learn does not document a behaviour, the sandbox should not invent one.
- **Scope creep:** "everything in Azure" has no end, which is why the tiers and `docs/BACKLOG.md` exist.
- **Drift:** Azure changes weekly. Imported data carries an "as of" date, and the content audit in checkpoint 20 repeats on a schedule.

## 13. Simulated Cloud Shell: design notes

Decided 2026-10-25. Built in checkpoints 17 and 18, designed in checkpoint 10 (`docs/CLOUDSHELL.md`). These are starting points to be checked against the Azure CLI reference on Learn.

- **What it is:** a terminal in the page that parses `az` commands and runs them against the in-browser world, the same engine the create pages use. A command and a form must produce the same result, because both call the same engine functions.
- **Parser:** `az <group> [<subgroup>] <command> --flag value`, with the documented short flags, `--help`, and `--output` (`json`, `table`, `tsv`). Output shapes follow the Learn reference examples. Where Learn does not document an output, the shell says so instead of inventing one.
- **`--query`:** JMESPath, as the real CLI uses. Use an existing JMESPath library if the spike (checkpoint 10) confirms it is suitable.
- **Session state:** simulated `az login`, `az account show / set`, `az configure --defaults` (group, location). Defaults are stored with the world in `localStorage`.
- **First command groups:** `account`, `group`, `network vnet / subnet / nsg / public-ip / route-table / vnet peering / private-dns`, `vm`, `storage account`, `role assignment / role definition`, later `deployment`, `webapp`, `container`.
- **Command registry from the catalog:** the CLI examples in the catalog entries are already checked against Learn. The shell should accept at least every flag those examples use, and a test must run every catalog CLI example against the engine and fail the build if it errors. That keeps the docs and the simulation from drifting apart.
- **Errors:** use the real, documented error codes and messages for the common failures (resource not found, name not available, authorization failed with the role that was missing). Authorization failures use the RBAC evaluator from checkpoint 13.
- **Deployments (checkpoint 18):** `az deployment group create` with an ARM JSON template, `what-if` output, and export of the sandbox as ARM. Bicep needs a Bicep-to-ARM compiler in the browser. The checkpoint 10 spike decides whether that is possible. If not, ship ARM JSON only and show the Bicep example as read-only.
- **PowerShell flavour:** a second shell mode (`New-AzResourceGroup`, `Get-AzVM`) is possible later, since the catalog already has PowerShell examples. Decide after Cloud Shell v2.
- **Labelling:** the shell always shows a banner that it is simulated, so nobody mistakes it for a real subscription.
- **Not planned:** running real shell commands, anything that needs a real network, and Azure features that are not documented well enough to simulate honestly.
