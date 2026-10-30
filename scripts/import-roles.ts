/**
 * Build the shipped built-in role dataset.
 *
 * Reads a raw `az role definition list` export (UTF-16 or UTF-8). That file
 * contains subscription IDs and must stay outside git (data/raw/ or Downloads).
 * Reads Microsoft Learn's built-in roles index for the documented GUID list,
 * and the per-category pages for roles the export does not include.
 *
 * Permissions for roles in both sources come from the export. Learn is the
 * allow-list and the source for the roles a subscription listing omits.
 * See docs/RBAC.md section 8.
 *
 * Usage: npx tsx scripts/import-roles.ts /path/to/roles_full.json
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const LEARN_INDEX = "https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles";
const CATEGORIES = [
  "privileged",
  "general",
  "compute",
  "networking",
  "storage",
  "web-and-mobile",
  "containers",
  "databases",
  "analytics",
  "ai-machine-learning",
  "internet-of-things",
  "integration",
  "identity",
  "security",
  "devops",
  "migration",
  "monitor",
  "management-and-governance",
  "hybrid-multicloud",
] as const;

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Permission {
  actions: string[];
  notActions: string[];
  dataActions: string[];
  notDataActions: string[];
  condition?: string | null;
  conditionVersion?: string | null;
}

interface RawRole {
  id?: string;
  name?: string;
  roleName?: string;
  description?: string;
  roleType?: string;
  assignableScopes?: string[];
  permissions?: Array<Record<string, unknown>>;
}

interface ShippedRole {
  id: string;
  name: string;
  roleName: string;
  description: string;
  roleType: "BuiltInRole";
  assignableScopes: string[];
  permissions: Permission[];
  source: "api-export" | "learn";
  /** False when Learn lists the role but does not publish its action JSON. */
  permissionsPublished: boolean;
  /** False for scopes this sandbox does not model (service groups, reservations). */
  assignableInSandbox: boolean;
  learnUrl: string;
}

function readExport(path: string): RawRole[] {
  const buf = readFileSync(path);
  const utf16 = buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe;
  const text = utf16 ? buf.subarray(2).toString("utf16le") : buf.toString("utf8").replace(/^\uFEFF/, "");
  const parsed = JSON.parse(text) as unknown;
  if (!Array.isArray(parsed)) throw new Error("The export must be a JSON array.");
  return parsed as RawRole[];
}

function decodeHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function rows(html: string): string[][] {
  const found: string[][] = [];
  for (const row of html.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((match) => decodeHtml(match[1]));
    if (cells.length > 0) found.push(cells);
  }
  return found;
}

function fetchText(url: string): string {
  // Node fetch hits a certificate error in this environment. curl does not.
  return execFileSync("curl", ["-fsSL", "-A", "PolarisImport/1.0", url], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
}

function learnRoles(html: string): Map<string, { roleName: string; description: string }> {
  const listed = new Map<string, { roleName: string; description: string }>();
  for (const cells of rows(html)) {
    const guid = cells[2]?.trim().toLowerCase();
    if (!guid || !GUID.test(guid)) continue;
    listed.set(guid, { roleName: cells[0] ?? "", description: cells[1] ?? "" });
  }
  return listed;
}

function jsonBlocks(html: string): RawRole[] {
  const roles: RawRole[] = [];
  for (const block of html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/gi) ?? []) {
    const text = decodeHtml(block).replace(/^<pre[^>]*>/i, "").replace(/<\/pre>$/i, "");
    // decodeHtml strips tags, so the JSON is the remaining text. Quotes were decoded.
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) continue;
    try {
      const parsed = JSON.parse(text.slice(start, end + 1)) as RawRole;
      if (parsed.name && parsed.roleName && parsed.permissions) roles.push(parsed);
    } catch {
      // Explanatory pages also contain non-role <pre> blocks.
    }
  }
  return roles;
}

function permissionsOf(role: RawRole): Permission[] {
  return (role.permissions ?? []).map((entry) => ({
    actions: stringList(entry.actions),
    notActions: stringList(entry.notActions),
    dataActions: stringList(entry.dataActions),
    notDataActions: stringList(entry.notDataActions),
    ...(entry.condition != null ? { condition: String(entry.condition) } : {}),
    ...(entry.conditionVersion != null ? { conditionVersion: String(entry.conditionVersion) } : {}),
  }));
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item));
}

function sandboxAssignable(scopes: string[]): boolean {
  if (scopes.length === 0) return false;
  return scopes.every((scope) => scope === "/" || scope.startsWith("/subscriptions/") || scope.startsWith("/providers/Microsoft.Management/managementGroups/"));
}

function keyList(entries: Permission[]): string {
  return JSON.stringify(
    entries.map((entry) => ({
      actions: [...entry.actions].map((item) => item.toLowerCase()).sort(),
      notActions: [...entry.notActions].map((item) => item.toLowerCase()).sort(),
      dataActions: [...entry.dataActions].map((item) => item.toLowerCase()).sort(),
      notDataActions: [...entry.notDataActions].map((item) => item.toLowerCase()).sort(),
    })),
  );
}

function onlyIn(left: string[], right: string[]): string[] {
  const other = new Set(right.map((item) => item.toLowerCase()));
  return left.filter((item) => !other.has(item.toLowerCase()));
}

function main(): void {
  const exportPath = process.argv[2];
  if (!exportPath) {
    throw new Error("Pass the path to the raw role export. Do not put that file in the repo.");
  }
  const exported = readExport(exportPath);
  const byGuid = new Map<string, RawRole>();
  for (const role of exported) {
    const guid = role.name?.toLowerCase();
    if (!guid || !GUID.test(guid)) throw new Error("A role in the export has no GUID name.");
    byGuid.set(guid, role);
  }

  const indexHtml = fetchText(LEARN_INDEX);
  const documented = learnRoles(indexHtml);
  if (documented.size < 500) {
    throw new Error(`Expected about 505 documented roles, parsed ${documented.size}.`);
  }

  const learnJson = new Map<string, RawRole>();
  for (const category of CATEGORIES) {
    const html = fetchText(`${LEARN_INDEX}/${category}`);
    for (const role of jsonBlocks(html)) {
      const guid = role.name?.toLowerCase();
      if (guid) learnJson.set(guid, role);
    }
  }

  const asOf = new Date().toISOString().slice(0, 10);
  const shipped: ShippedRole[] = [];
  const permissionDiffs: Array<{ roleName: string; guid: string; onlyInApi: string[]; onlyOnLearn: string[] }> = [];
  const descriptionDiffs: string[] = [];

  for (const [guid, listed] of documented) {
    const fromApi = byGuid.get(guid);
    const fromLearn = learnJson.get(guid);
    const sourceRole = fromApi ?? fromLearn;
    const scopes = sourceRole?.assignableScopes ?? [];
    const permissions = sourceRole ? permissionsOf(sourceRole) : [];
    const role: ShippedRole = {
      id: `/providers/Microsoft.Authorization/roleDefinitions/${guid}`,
      name: guid,
      roleName: sourceRole?.roleName || listed.roleName,
      description: sourceRole?.description || listed.description,
      roleType: "BuiltInRole",
      assignableScopes: scopes,
      permissions,
      source: fromApi ? "api-export" : "learn",
      permissionsPublished: Boolean(sourceRole),
      assignableInSandbox: sandboxAssignable(scopes),
      learnUrl: LEARN_INDEX,
    };
    shipped.push(role);

    if (fromApi && fromLearn) {
      const apiPerms = permissionsOf(fromApi);
      const learnPerms = permissionsOf(fromLearn);
      if (keyList(apiPerms) !== keyList(learnPerms)) {
        const apiActions = apiPerms.flatMap((entry) => [...entry.actions, ...entry.notActions, ...entry.dataActions, ...entry.notDataActions]);
        const learnActions = learnPerms.flatMap((entry) => [...entry.actions, ...entry.notActions, ...entry.dataActions, ...entry.notDataActions]);
        permissionDiffs.push({
          roleName: role.roleName,
          guid,
          onlyInApi: onlyIn(apiActions, learnActions),
          onlyOnLearn: onlyIn(learnActions, apiActions),
        });
      }
      if ((fromApi.description ?? "") !== (fromLearn.description ?? "")) descriptionDiffs.push(role.roleName);
    }
  }

  shipped.sort((a, b) => a.roleName.localeCompare(b.roleName));
  const body = JSON.stringify({ asOf, learnUrl: LEARN_INDEX, roles: shipped });
  const exportSubscriptionIds = new Set<string>();
  for (const role of exported) {
    const match = role.id?.match(/\/subscriptions\/([0-9a-f-]{36})/i);
    if (match) exportSubscriptionIds.add(match[1].toLowerCase());
  }
  const lowered = body.toLowerCase();
  for (const subscriptionId of exportSubscriptionIds) {
    if (lowered.includes(subscriptionId)) {
      throw new Error("Refusing to write the dataset: a subscription ID from the export is still present.");
    }
  }
  if (shipped.some((role) => role.id.toLowerCase().includes("/subscriptions/"))) {
    throw new Error("Refusing to write the dataset: a role id still contains /subscriptions/.");
  }
  const guids = shipped.map((role) => role.name);
  if (new Set(guids).size !== guids.length) throw new Error("A role GUID is repeated.");

  const outDir = resolve("src/engine/azure/data");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "built-in-roles.json"), `${JSON.stringify({ asOf, learnUrl: LEARN_INDEX, roles: shipped }, null, 2)}\n`);
  const report = {
    asOf,
    documentedOnLearn: documented.size,
    inExport: byGuid.size,
    shipped: shipped.length,
    fromApi: shipped.filter((role) => role.source === "api-export").length,
    fromLearn: shipped.filter((role) => role.source === "learn").length,
    permissionsNotPublished: shipped.filter((role) => !role.permissionsPublished).map((role) => role.roleName),
    notAssignableInSandbox: shipped.filter((role) => !role.assignableInSandbox).map((role) => role.roleName),
    undocumentedNotShipped: [...byGuid.keys()].filter((guid) => !documented.has(guid)).length,
    permissionDiffs,
    descriptionDiffs,
  };
  writeFileSync(resolve(outDir, "role-import-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `Shipped ${report.shipped} roles (${report.fromApi} from the API, ${report.fromLearn} from Learn). ` +
      `${report.undocumentedNotShipped} undocumented roles were left out. ` +
      `${permissionDiffs.length} permission diffs, ${descriptionDiffs.length} description diffs.`,
  );
  console.log("Wrote", resolve(outDir, "built-in-roles.json"));
}

try {
  main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
