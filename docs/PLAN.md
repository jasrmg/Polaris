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

## 2. Scope decisions (already made)

| Topic | Decision |
|---|---|
| Exam | AZ-104 resources only. Source of truth is the official skills-measured list. |
| RBAC | **Out of v1.** No Entra users, groups or role assignments. |
| Networking | The largest group. |
| Governance extras | Policy, locks, tags, budgets are **left out** of v1 (they can still appear in exam notes). |
| Application Gateway | Left out (it is not a skills-measured heading). |
| Subscription / Resource Group | Container entries, not ordinary resources. |
| Hosting | Static export, no backend, no database. State lives in `localStorage`. |
| Regions in the simulator | Southeast Asia (`southeastasia`) and East Asia (`eastasia`). |

## 3. Working agreement (rules for every session)

1. **Checkpoints.** Work in small checkpoints. At the end of each one, tell the user and show the proposed commit message in chat.
2. **The user commits.** The assistant never runs `git commit`.
3. **It must run.** Before asking for a commit: `npm run check:snippets`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, then dev server plus a browser check.
4. **Say when to test by hand.** Flag which checkpoints deserve a manual click-through.
5. **Order of work:** catalog first, then the full revised resource list, then design the simulator engine.
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

## 5. Current catalog (17 entries)

| Category | Entries |
|---|---|
| Identity & Governance | Resource Group |
| Compute | Virtual Machine |
| Storage | Storage Account |
| Networking (14) | Virtual Network, Subnet, Public IP Address, Network Security Group, Application Security Group, Route Table, Virtual Network Peering, Network Virtual Appliance, Azure DNS Zone, Private DNS Zone, Load Balancer, Azure Bastion, Service Endpoint, Private Endpoint |

The hierarchy map still shows Tenant, Management group and Subscription as "Not in catalog yet".

## 6. Roadmap

Each checkpoint ends with the checks in section 3 and a commit message shown in chat.

### Phase 1 - Catalog (content)

**Checkpoint 8 - Compute** *(next)*
- Entries: Virtual Machine Scale Set, App Service plan, App Service (web app), Azure Container Instances, Azure Container Apps (environment + app).
- Decide whether App Service plan and web app are one entry or two (leaning two, since the exam asks about plans, scaling and slots separately).
- Check retired or renamed SKUs and sizes on Learn before writing examples (Standard_B2s was already retired once).
- Add icons, register in `index.ts`, update related links on Virtual Machine, Load Balancer, Virtual Network.
- Verify every claim against Learn, run the snippet checker, then do a browser sweep.
- **Good checkpoint for you to click through by hand.**

**Checkpoint 9 - Storage, monitoring, backup**
- Storage: Blob container, Azure Files share (SMB / NFS, tiers), plus notes on SAS, access tiers, lifecycle management and replication.
- Monitor & Backup: Log Analytics workspace, Azure Monitor alert rule (and action group), Network Watcher (connection monitor, IP flow verify, next hop), Recovery Services vault (backup policy, soft delete).
- Add the `monitor-backup` category entries (the category already exists in the schema).

**Checkpoint 10 - Hierarchy entries and dependency view**
- Add entries for Subscription (container). Decide whether Tenant and Management group get entries (they are conceptual, and RBAC is out of scope, so they may stay as short explainers).
- Dependency graph view on each resource page (prerequisites and related as a small diagram).
- Light polish: accessibility pass, keyboard navigation in the modal, empty states.

**Checkpoint 11 - Phase 1 release**
- GitHub Actions workflow for static deploy (Azure Static Web Apps or Vercel; pick one).
- Replace the boilerplate `README.md` with a real one (what it is, how to run, how to add a resource, the source-of-truth rule).
- Final content audit: re-verify against Learn, because docs and defaults drift.

### Phase 2 - Simulator

Start only after Phase 1 content is done (working agreement item 5).

**Checkpoint 12 - Design the engine (document first, no UI)**
- Write `docs/SIMULATOR.md` covering the points in section 7.
- Define the TypeScript types for the world model and write pure-function unit tests for the rules before any UI.
- Every behavioural rule in the engine must carry a comment with its Learn URL.

**Checkpoint 13 - Engine core**
- Resource graph, create/delete/stop/start, lifecycle states (Creating -> Running, Stopped, Deallocated), validation (name rules, CIDR overlap, region match, required parents).
- Persistence in `localStorage` with versioned schema and a "reset environment" button.

**Checkpoint 14 - Create pages ("Try it")**
- A form per resource generated from the `simulator` fields in the content files (fields already exist for some entries, and every entry needs them).
- Validation messages that explain *why* (for example "Subnet must fit inside the VNet's address space").

**Checkpoint 15 - Networking rules and reachability checker**
- Route selection (longest prefix, then UDR > BGP > system), NSG evaluation (priority order, default rules, subnet and NIC level), peering (non-transitive, forwarded traffic, gateway transit), NVA forwarding, DNS resolution (public zone, private zone, links, autoregistration), service and private endpoints.
- "Can A reach B?" tool that shows the path and the rule that allowed or blocked each hop.

**Checkpoint 16 - "My Environment" dashboard**
- Region-aware canvas or list showing everything the user created, state badges and a connectivity map for the two regions.
- Guided scenarios (for example "hub and spoke across two regions", "private access to storage").

**Checkpoint 17 - Final polish and deploy**
- Performance, mobile, accessibility, and an end-to-end test pass.

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

- App Service plan and web app: one entry or two?
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
| 7 | Load Balancer, Bastion, Service Endpoint, Private Endpoint, and a Learn verification pass over all 17 entries | Done, **but see note** |
| 8 | Compute: VM Scale Set, App Service Plan, App Service, Container Instances, Container Apps (22 entries total). Also fixed long unbroken words stretching the detail page on phones. | Done, waiting for commit |
| 9-17 | See roadmap | Not started |

**Lesson from checkpoint 7:** a commit once left four new content files untracked while `index.ts` imported them, which breaks a fresh clone. Run `git status` before every commit and stage new files.

**Decision made in checkpoint 8:** App Service Plan and App Service (Web App) are two separate entries, because the exam treats scaling, tiers and slots separately.
