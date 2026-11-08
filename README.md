# Polaris

A free, browser-only place to learn and try out Azure. Nothing is hosted, nothing talks to real Azure, and no Azure account is needed.

Polaris has two parts:

- **Atlas (built):** a catalog of Azure resources. Each entry has a plain-English definition, an analogy, when to use it, prerequisites, example configuration (Portal, Azure CLI, PowerShell, Bicep, ARM), exam notes, a modal and a shareable page.
- **Sandbox (eight create forms):** create a resource group, virtual network, subnet, public IP address, network security group, network interface, virtual machine, or storage account in a simulated tenant. From My Environment you can attach a network interface to a virtual machine, a public IP to that interface, a network security group to a subnet with one inbound rule, a network security group to a network interface, and one TCP rule on a group that already exists, for internet traffic or virtual-network traffic. From a subnet you can add one 0.0.0.0/0 route: None drops outbound internet traffic that the security groups allow, and Internet leaves that check with the security groups. On the virtual machine you can check one new inbound TCP connection from the internet, one new outbound TCP connection to the internet, and one new TCP connection to a private address in the same virtual network. A network interface shows the private address the sandbox assigned. A refusal on these pages names the rule and, when the page can fix it, what to do next. The engine also evaluates RBAC and deny/audit policy. A simulated Cloud Shell that runs `az` is still to come. The engine is in `src/engine/`. Open it from **My Environment**.

Every fact in the catalog is checked against Microsoft Learn or other official Microsoft documentation.

**Azure only for now, multi-cloud later.** Version 1 contains only Azure. The plan is to add other cloud providers (AWS first) as the owner studies them, after Azure v1 is done. See section 10 of `docs/PLAN.md`.

> **Working on this project (human or AI): read [`docs/PLAN.md`](docs/PLAN.md) first.** Section 0 has the current state, the next step, the rules and a map of the docs.

## Status

43 entries, including the directory and RBAC entries and Tag, Resource lock, Policy definition, and Policy assignment. The sandbox design is in `docs/SIMULATOR.md`, `docs/RBAC.md` and `docs/CLOUDSHELL.md` (evidence in `docs/research/`). The engine in `src/engine/` evaluates Azure RBAC and five built-in policies. Try it is on for seven catalog entries, and a network interface can be created from My Environment. Those pieces can be linked there, including a network security group on a network interface and one TCP rule on a group that already exists, for internet traffic or virtual-network traffic. A subnet can take one 0.0.0.0/0 route, and that route can drop outbound internet traffic after the security groups allow it. A virtual machine can be checked for one inbound internet connection, one outbound connection to the internet, and one connection to a private address in the same virtual network. Each network interface has a private address. The other catalog entries stay documentation until their forms are added. See the roadmap in `docs/PLAN.md`.

## Run it

Requires Node.js and npm.

```bash
npm install
npm run dev        # http://localhost:3000
```

## Checks

Run these before committing. The first one needs the Bicep CLI.

```bash
BICEP_PATH=/path/to/bicep npm run check:snippets   # compiles every Bicep example, parses every ARM example
npm run lint
npx tsc --noEmit
npm run build                                       # static export; also validates all content
npm test                                            # engine rules
```

If the Bicep CLI is not found, `check:snippets` skips the Bicep checks and says so. Install it with `az bicep install` or from the official Bicep releases.

## How the project is laid out

| Path | What it holds |
|---|---|
| `src/content/schema.ts` | The Zod schema every catalog entry must satisfy |
| `src/content/resources/<slug>.ts` | One file per catalog entry |
| `src/content/index.ts` | Registers entries; at build time checks unique slugs and that cross-references resolve |
| `src/content/hierarchy.ts`, `regions.ts` | Hierarchy levels and the two simulated regions |
| `src/components/` | UI: explorer, hierarchy map, cards, detail view, modal, code blocks |
| `src/components/resource-icon.tsx` | Maps an entry's icon name to a lucide icon |
| `src/app/` | Next.js App Router pages: home, `/resources/<slug>/`, `/sandbox/`, and static JSON used by the modal |
| `src/engine/` | In-browser Azure world. Sandbox pages load it with a dynamic import. Catalog pages do not. |
| `scripts/check-snippets.ts` | The snippet checker |
| `docs/` | Plan (`PLAN.md`), sandbox design (`SIMULATOR.md`, `RBAC.md`, `CLOUDSHELL.md`), backlog, and `research/` (evidence reports with sources) |

The site is a static export (`output: "export"`), so it can be hosted anywhere that serves files.

## Adding a catalog entry

1. Read `docs/PLAN.md` section 3 (the rules) first. Sources must be Microsoft Learn or other official Microsoft docs.
2. Copy a recent entry such as `src/content/resources/container-apps.ts` and write the new one from Learn. Each claim (limits, defaults, portal labels, CLI flags, property names) must be verified.
3. Register it in `src/content/index.ts`.
4. If it uses a new lucide icon name, add it to `src/components/resource-icon.tsx`.
5. Add the slug to `related` in the entries it connects to.
6. Run the checks above and look at the page in the browser, including on a phone-width window.

Writing rules for code samples inside the TypeScript template literals: no `${}`, use `\\` for bash line continuation, and `` \` `` for the PowerShell backtick.

## Notes for AI agents

- This project uses a Next.js version with breaking changes. See `AGENTS.md`, and read the guide in `node_modules/next/dist/docs/` before using a Next.js API.
- The owner makes all git commits. Do not commit.
