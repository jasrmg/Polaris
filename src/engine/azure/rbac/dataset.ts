/**
 * Built-in roles imported by scripts/import-roles.ts.
 * Loaded here, not copied into each saved world. See docs/RBAC.md section 8.
 */

import file from "../data/built-in-roles.json";
import type { RoleDefinition } from "../types";

export interface BuiltInRoleFile {
  asOf: string;
  learnUrl: string;
  roles: RoleDefinition[];
}

const data = file as BuiltInRoleFile;
const byGuid = new Map(data.roles.map((role) => [role.name.toLowerCase(), role]));
const byName = new Map(data.roles.map((role) => [role.roleName.toLowerCase(), role]));

export function builtInRoleFile(): BuiltInRoleFile {
  return data;
}

export function findBuiltInRole(idOrName: string): RoleDefinition | undefined {
  const trimmed = idOrName.trim();
  const guid = trimmed.split("/").pop()?.toLowerCase() ?? "";
  return byGuid.get(guid) ?? byName.get(trimmed.toLowerCase());
}
