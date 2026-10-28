/**
 * Name constraints for catalog types, taken from the Azure naming-rules page.
 * The engine (checkpoint 12) enforces them. Checkpoint 11 only checks that a
 * simulator block points at a key in this table.
 *
 * Source: https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/resource-name-rules
 * Summaries match docs/research/azure-resource-model.md section 4 (fetched 2026-10-27).
 */
export interface NameRule {
  min: number;
  max: number;
  uniqueIn: "global" | "tenant" | "subscription" | "resourceGroup" | "parent";
  summary: string;
}

const NAMING =
  "https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/resource-name-rules";

export const namingRulesSource = NAMING;

const vnetLike =
  "Alphanumerics, underscores, periods and hyphens. Start with an alphanumeric. End with an alphanumeric or underscore.";

export const nameRules: Record<string, NameRule> = {
  "resource-group": {
    min: 1,
    max: 90,
    uniqueIn: "subscription",
    summary:
      "Letters, digits, underscores, hyphens, periods and parentheses. Cannot end with a period.",
  },
  "management-group": {
    min: 1,
    max: 90,
    uniqueIn: "tenant",
    summary:
      "Alphanumerics, hyphens, underscores, periods and parentheses. Start with a letter or number. Cannot end with a period.",
  },
  "virtual-machine": {
    min: 1,
    max: 64,
    uniqueIn: "resourceGroup",
    summary:
      "Host name: 1-15 characters on Windows, 1-64 on Linux, with a documented set of forbidden characters. The resource name can be up to 64 characters.",
  },
  "virtual-machine-scale-set": {
    min: 1,
    max: 64,
    uniqueIn: "resourceGroup",
    summary:
      "Same forbidden characters as a virtual machine. Cannot start with an underscore or end with a period or hyphen. Windows host names are 1-15 characters.",
  },
  "storage-account": {
    min: 3,
    max: 24,
    uniqueIn: "global",
    summary: "Lowercase letters and numbers. Must be unique across Azure.",
  },
  "blob-container": {
    min: 3,
    max: 63,
    uniqueIn: "parent",
    summary:
      "Lowercase letters, numbers and hyphens. Start with a lowercase letter or number. No consecutive hyphens.",
  },
  "file-share": {
    min: 3,
    max: 63,
    uniqueIn: "parent",
    summary:
      "Lowercase letters, numbers and hyphens. Cannot start or end with a hyphen. No consecutive hyphens.",
  },
  "virtual-network": { min: 2, max: 64, uniqueIn: "resourceGroup", summary: vnetLike },
  subnet: { min: 1, max: 80, uniqueIn: "parent", summary: vnetLike },
  "vnet-peering": { min: 1, max: 80, uniqueIn: "parent", summary: vnetLike },
  "public-ip-address": { min: 1, max: 80, uniqueIn: "resourceGroup", summary: vnetLike },
  "network-security-group": { min: 1, max: 80, uniqueIn: "resourceGroup", summary: vnetLike },
  "application-security-group": { min: 1, max: 80, uniqueIn: "resourceGroup", summary: vnetLike },
  "route-table": { min: 1, max: 80, uniqueIn: "resourceGroup", summary: vnetLike },
  "azure-dns-zone": {
    min: 1,
    max: 63,
    uniqueIn: "resourceGroup",
    summary:
      "The naming page says 1-63 characters and 2 to 34 labels. Each label uses alphanumerics, underscores and hyphens.",
  },
  "private-dns-zone": {
    min: 1,
    max: 63,
    uniqueIn: "resourceGroup",
    summary:
      "The naming page says 1-63 characters and 2 to 34 labels. Each label uses alphanumerics, underscores and hyphens.",
  },
  "load-balancer": { min: 1, max: 80, uniqueIn: "resourceGroup", summary: vnetLike },
  "azure-bastion": { min: 1, max: 80, uniqueIn: "resourceGroup", summary: vnetLike },
  "private-endpoint": { min: 2, max: 64, uniqueIn: "resourceGroup", summary: vnetLike },
  "network-watcher": { min: 1, max: 80, uniqueIn: "resourceGroup", summary: vnetLike },
  "network-interface": { min: 1, max: 80, uniqueIn: "resourceGroup", summary: vnetLike },
  "app-service-plan": {
    min: 1,
    max: 60,
    uniqueIn: "resourceGroup",
    summary: "Alphanumeric, hyphens and Unicode characters that map to Punycode.",
  },
  "app-service": {
    min: 2,
    max: 60,
    uniqueIn: "global",
    summary:
      "Alphanumeric, hyphens and Punycode-mappable Unicode. Cannot start or end with a hyphen. The name is the host label under azurewebsites.net.",
  },
  "container-instances": {
    min: 1,
    max: 63,
    uniqueIn: "resourceGroup",
    summary:
      "Lowercase letters, numbers and hyphens. Cannot start or end with a hyphen. No consecutive hyphens.",
  },
  "container-apps": {
    min: 2,
    max: 32,
    uniqueIn: "resourceGroup",
    summary: "Lowercase letters, numbers and hyphens. Start with a letter. End with an alphanumeric.",
  },
  "log-analytics-workspace": {
    min: 4,
    max: 63,
    uniqueIn: "resourceGroup",
    summary: "Alphanumerics and hyphens. Start and end with an alphanumeric.",
  },
  "action-group": {
    min: 1,
    max: 260,
    uniqueIn: "resourceGroup",
    summary:
      "Cannot use : < > + / & % \\ ? or the pipe character, or control characters. Cannot end with a space or a period.",
  },
  "alert-rule": {
    min: 1,
    max: 260,
    uniqueIn: "resourceGroup",
    summary:
      "This entry's type is a metric alert. That name cannot use * # & + : < > ? @ % { } \\ / or the pipe character, or control characters, and cannot end with a space or a period. Log-search and activity-log alerts have their own character lists.",
  },
  "recovery-services-vault": {
    min: 2,
    max: 50,
    uniqueIn: "resourceGroup",
    summary: "Alphanumerics and hyphens. Start with a letter.",
  },
};
