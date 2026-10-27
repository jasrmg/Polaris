<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project context (Polaris)

Read `docs/PLAN.md` first. Section 0 has the vision, the current state, the next step and a map of the docs.

Rules that apply to every session (full list in `docs/PLAN.md` section 3):

- Work in small checkpoints. At the end of each one, report what was done, what could not be verified, and show a proposed commit message in chat.
- **The owner makes all git commits. Never run `git commit`.** Before finishing, run `git status` and mention any new untracked files that must be staged.
- Catalog content must come from **Microsoft Learn or other official Microsoft docs only**. Verify every claim. If it cannot be verified, reword it to what the docs say or delete it.
- Before asking for a commit, run `npm run check:snippets` (needs the Bicep CLI), `npm run lint`, `npx tsc --noEmit` and `npm run build`, then check the app in a browser, including a phone-width view.
- Do not kill a dev server you did not start. The owner often has one running on port 3000.
- Sandbox work follows the design docs: `docs/SIMULATOR.md`, `docs/RBAC.md`, `docs/CLOUDSHELL.md` (evidence in `docs/research/`). If code and those docs disagree, change the doc first and tell the owner. Items marked "to confirm" in `docs/PLAN.md` section 14 are not decided.
- **Never commit raw exports from a real Azure account** (they contain subscription IDs). Keep them in `data/raw/` (git-ignored) or outside the repo, and strip IDs before anything is shipped.
- Keep the docs current: update `docs/PLAN.md` (sections 0, 5, 6, 9) and `README.md` at the end of each checkpoint.
