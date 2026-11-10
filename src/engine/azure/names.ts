/**
 * Name checks from the Azure naming-rules page.
 * Character classes follow docs/research/azure-resource-model.md section 4.
 * "Global" uniqueness is only inside this world. See docs/SIMULATOR.md section 3.2.
 */

import type { EngineError } from "../core/result";
import { LEARN } from "./learn";

export interface NameContext {
  /** Windows host names are 1-15 characters. Learn states two VM names. */
  osType?: "Windows" | "Linux";
}

const STEP = "validate";

function invalid(code: string, message: string, target?: string): EngineError {
  return { code, message, target, step: STEP, learnUrl: LEARN.names };
}

function length(name: string, min: number, max: number, label: string): EngineError | null {
  if (name.length < min || name.length > max) {
    return invalid("InvalidResourceName", `${label} must be ${min}-${max} characters. (sandbox wording)`, name);
  }
  return null;
}

function hasControl(name: string): boolean {
  return [...name].some((ch) => {
    const code = ch.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

/** Letters, digits, underscore, hyphen, period, parentheses. Cannot end with a period. */
function resourceGroupName(name: string): EngineError | null {
  const sized = length(name, 1, 90, "A resource group name");
  if (sized) return sized;
  if (name.endsWith(".") || !/^[\p{L}\p{N}_.()-]+$/u.test(name)) {
    return invalid(
      "InvalidResourceName",
      "A resource group name can use letters, digits, underscores, hyphens, periods and parentheses, and cannot end with a period. (sandbox wording)",
      name,
    );
  }
  return null;
}

function managementGroupName(name: string): EngineError | null {
  const sized = length(name, 1, 90, "A management group name");
  if (sized) return sized;
  if (!/^[\p{L}\p{N}][\p{L}\p{N}_.()-]*$/u.test(name) || name.endsWith(".")) {
    return invalid(
      "InvalidResourceName",
      "A management group name must start with a letter or number and cannot end with a period. (sandbox wording)",
      name,
    );
  }
  return null;
}

const VM_FORBIDDEN = new Set("~!@#$%^&*()=+_[ ]{}\\|;:.'\",<>/?".split(""));

function vmForbidden(name: string): EngineError | null {
  if (name.includes(" ") || hasControl(name) || [...name].some((ch) => VM_FORBIDDEN.has(ch))) {
    return invalid(
      "InvalidResourceName",
      "A virtual machine name cannot include spaces, control characters, or the characters the naming page lists as invalid. (sandbox wording)",
      name,
    );
  }
  return null;
}

function virtualMachineName(name: string, ctx: NameContext): EngineError | null {
  const max = ctx.osType === "Windows" ? 15 : 64;
  const sized = length(name, 1, max, "A virtual machine name");
  if (sized) return sized;
  const forbidden = vmForbidden(name);
  if (forbidden) return forbidden;
  if ((ctx.osType === "Windows" || ctx.osType === "Linux") && (name.endsWith("-") || name.endsWith("."))) {
    return invalid(
      "InvalidResourceName",
      "A virtual machine host name cannot end with a hyphen, and a Linux name cannot end with a period. (sandbox wording)",
      name,
    );
  }
  return null;
}

function vmssName(name: string, ctx: NameContext): EngineError | null {
  const max = ctx.osType === "Windows" ? 15 : 64;
  const sized = length(name, 1, max, "A virtual machine scale set name");
  if (sized) return sized;
  const forbidden = vmForbidden(name);
  if (forbidden) return forbidden;
  if (name.startsWith("_") || name.endsWith(".") || name.endsWith("-")) {
    return invalid(
      "InvalidResourceName",
      "A scale set name cannot start with an underscore or end with a period or hyphen. (sandbox wording)",
      name,
    );
  }
  return null;
}

function storageAccountName(name: string): EngineError | null {
  if (!/^[a-z0-9]{3,24}$/.test(name)) {
    return invalid(
      "AccountNameInvalid",
      `${name} is not a valid storage account name. Storage account name must be between 3 and 24 characters in length and use numbers and lower-case letters only.`,
      name,
    );
  }
  return null;
}

function hyphenatedLower(name: string, min: number, max: number, label: string, endHyphen: boolean): EngineError | null {
  const sized = length(name, min, max, label);
  if (sized) return sized;
  const shape = endHyphen ? /^[a-z0-9][a-z0-9-]*$/ : /^[a-z0-9]([a-z0-9]|-(?!-))*[a-z0-9]$|^[a-z0-9]$/;
  if (!shape.test(name) || name.includes("--") || name.startsWith("-") || (!endHyphen && name.endsWith("-"))) {
    return invalid(
      "InvalidResourceName",
      `${label} uses lowercase letters, numbers and hyphens, with no consecutive hyphens. (sandbox wording)`,
      name,
    );
  }
  return null;
}

function vnetLike(name: string, min: number, max: number, label: string): EngineError | null {
  const sized = length(name, min, max, label);
  if (sized) return sized;
  if (!/^[A-Za-z0-9]([A-Za-z0-9_.-]*[A-Za-z0-9_])?$/.test(name)) {
    return invalid(
      "InvalidResourceName",
      `${label} uses alphanumerics, underscores, periods and hyphens. It must start with an alphanumeric and end with an alphanumeric or underscore. (sandbox wording)`,
      name,
    );
  }
  return null;
}

function privateDnsRecordName(name: string): EngineError | null {
  if (!/^[A-Za-z0-9]$/.test(name) && !/^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])$/.test(name)) {
    return invalid(
      "InvalidResourceName",
      "An A record name is one label. It uses letters, numbers and hyphens, and it cannot start or end with a hyphen. (sandbox wording)",
      name,
    );
  }
  return null;
}

function dnsZoneName(name: string): EngineError | null {
  const sized = length(name, 1, 63, "A DNS zone name");
  if (sized) return sized;
  const labels = name.split(".");
  if (labels.length < 2 || labels.length > 34 || labels.some((label) => !/^[A-Za-z0-9_-]+$/.test(label))) {
    return invalid(
      "InvalidResourceName",
      "A DNS zone name has 2 to 34 labels. Each label uses alphanumerics, underscores and hyphens. (sandbox wording)",
      name,
    );
  }
  return null;
}

function punycodeName(name: string, min: number, max: number, label: string, edges: boolean): EngineError | null {
  const sized = length(name, min, max, label);
  if (sized) return sized;
  if (!/^[\p{L}\p{N}-]+$/u.test(name) || (edges && (name.startsWith("-") || name.endsWith("-")))) {
    return invalid(
      "InvalidResourceName",
      `${label} uses letters, numbers and hyphens. (sandbox wording)`,
      name,
    );
  }
  return null;
}

function containerAppName(name: string): EngineError | null {
  const sized = length(name, 2, 32, "A container app name");
  if (sized) return sized;
  if (!/^[a-z][a-z0-9-]*[a-z0-9]$/.test(name)) {
    return invalid(
      "InvalidResourceName",
      "A container app name uses lowercase letters, numbers and hyphens. It starts with a letter and ends with a letter or number. (sandbox wording)",
      name,
    );
  }
  return null;
}

function logAnalyticsName(name: string): EngineError | null {
  const sized = length(name, 4, 63, "A Log Analytics workspace name");
  if (sized) return sized;
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*[A-Za-z0-9]$/.test(name)) {
    return invalid(
      "InvalidResourceName",
      "A Log Analytics workspace name uses alphanumerics and hyphens, and starts and ends with an alphanumeric. (sandbox wording)",
      name,
    );
  }
  return null;
}

function insightsName(name: string, forbidden: string, label: string): EngineError | null {
  const sized = length(name, 1, 260, label);
  if (sized) return sized;
  const blocked = new Set(forbidden.split(""));
  if (hasControl(name) || [...name].some((ch) => blocked.has(ch)) || name.endsWith(" ") || name.endsWith(".")) {
    return invalid(
      "InvalidResourceName",
      `${label} cannot use the characters the naming page lists, or end with a space or a period. (sandbox wording)`,
      name,
    );
  }
  return null;
}

function vaultName(name: string): EngineError | null {
  const sized = length(name, 2, 50, "A Recovery Services vault name");
  if (sized) return sized;
  if (!/^[A-Za-z][A-Za-z0-9-]*$/.test(name)) {
    return invalid(
      "InvalidResourceName",
      "A Recovery Services vault name uses letters, numbers and hyphens, and starts with a letter. (sandbox wording)",
      name,
    );
  }
  return null;
}

const CHECKS: Record<string, (name: string, ctx: NameContext) => EngineError | null> = {
  "microsoft.resources/resourcegroups": (name) => resourceGroupName(name),
  "microsoft.management/managementgroups": (name) => managementGroupName(name),
  "microsoft.compute/virtualmachines": (name, ctx) => virtualMachineName(name, ctx),
  "microsoft.compute/virtualmachinescalesets": (name, ctx) => vmssName(name, ctx),
  "microsoft.storage/storageaccounts": (name) => storageAccountName(name),
  "microsoft.storage/storageaccounts/blobservices/containers": (name) =>
    hyphenatedLower(name, 3, 63, "A blob container name", true),
  "microsoft.storage/storageaccounts/fileservices/shares": (name) =>
    hyphenatedLower(name, 3, 63, "A file share name", false),
  "microsoft.network/virtualnetworks": (name) => vnetLike(name, 2, 64, "A virtual network name"),
  "microsoft.network/virtualnetworks/subnets": (name) => vnetLike(name, 1, 80, "A subnet name"),
  "microsoft.network/virtualnetworks/virtualnetworkpeerings": (name) => vnetLike(name, 1, 80, "A peering name"),
  "microsoft.network/publicipaddresses": (name) => vnetLike(name, 1, 80, "A public IP name"),
  "microsoft.network/networksecuritygroups": (name) => vnetLike(name, 1, 80, "A network security group name"),
  "microsoft.network/applicationsecuritygroups": (name) => vnetLike(name, 1, 80, "An application security group name"),
  "microsoft.network/routetables": (name) => vnetLike(name, 1, 80, "A route table name"),
  "microsoft.network/dnszones": (name) => dnsZoneName(name),
  "microsoft.network/privatednszones": (name) => dnsZoneName(name),
  "microsoft.network/privatednszones/virtualnetworklinks": (name) => vnetLike(name, 1, 80, "A virtual network link name"),
  "microsoft.network/privatednszones/a": (name) => privateDnsRecordName(name),
  "microsoft.network/loadbalancers": (name) => vnetLike(name, 1, 80, "A load balancer name"),
  "microsoft.network/bastionhosts": (name) => vnetLike(name, 1, 80, "A Bastion name"),
  "microsoft.network/privateendpoints": (name) => vnetLike(name, 2, 64, "A private endpoint name"),
  "microsoft.network/networkwatchers": (name) => vnetLike(name, 1, 80, "A Network Watcher name"),
  "microsoft.network/networkinterfaces": (name) => vnetLike(name, 1, 80, "A network interface name"),
  "microsoft.web/serverfarms": (name) => punycodeName(name, 1, 60, "An App Service plan name", false),
  "microsoft.web/sites": (name) => punycodeName(name, 2, 60, "A web app name", true),
  "microsoft.containerinstance/containergroups": (name) =>
    hyphenatedLower(name, 1, 63, "A container group name", false),
  "microsoft.app/containerapps": (name) => containerAppName(name),
  "microsoft.operationalinsights/workspaces": (name) => logAnalyticsName(name),
  "microsoft.insights/actiongroups": (name) => insightsName(name, ":<>+/&%\\?|", "An action group name"),
  "microsoft.insights/metricalerts": (name) => insightsName(name, "*#&+:<>?@%{}\\/|", "A metric alert name"),
  "microsoft.recoveryservices/vaults": (name) => vaultName(name),
};

export function knownArmType(armType: string): boolean {
  return armType.toLowerCase() in CHECKS;
}

export function validateName(armType: string, name: string, ctx: NameContext = {}): EngineError | null {
  if (name.includes("#")) {
    return invalid("InvalidResourceName", "A resource name cannot contain #.", name);
  }
  const check = CHECKS[armType.toLowerCase()];
  if (!check) {
    return invalid("InvalidResourceType", `The sandbox has no name rule for ${armType}. (sandbox wording)`, armType);
  }
  return check(name, ctx);
}

export const NAME_ARM_TYPES = Object.keys(CHECKS);
