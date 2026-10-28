import { nameRules } from "./name-rules";
import { actionGroup } from "./resources/action-group";
import { alertRule } from "./resources/alert-rule";
import { blobContainer } from "./resources/blob-container";
import { fileShare } from "./resources/file-share";
import { logAnalyticsWorkspace } from "./resources/log-analytics-workspace";
import { networkWatcher } from "./resources/network-watcher";
import { recoveryServicesVault } from "./resources/recovery-services-vault";
import { appService } from "./resources/app-service";
import { appServicePlan } from "./resources/app-service-plan";
import { containerApps } from "./resources/container-apps";
import { containerInstances } from "./resources/container-instances";
import { virtualMachineScaleSet } from "./resources/virtual-machine-scale-set";
import { applicationSecurityGroup } from "./resources/application-security-group";
import { azureBastion } from "./resources/azure-bastion";
import { azureDnsZone } from "./resources/azure-dns-zone";
import { loadBalancer } from "./resources/load-balancer";
import { managementGroup } from "./resources/management-group";
import { networkSecurityGroup } from "./resources/network-security-group";
import { networkVirtualAppliance } from "./resources/network-virtual-appliance";
import { privateDnsZone } from "./resources/private-dns-zone";
import { privateEndpoint } from "./resources/private-endpoint";
import { publicIpAddress } from "./resources/public-ip-address";
import { resourceGroup } from "./resources/resource-group";
import { routeTable } from "./resources/route-table";
import { serviceEndpoint } from "./resources/service-endpoint";
import { storageAccount } from "./resources/storage-account";
import { subscription } from "./resources/subscription";
import { subnet } from "./resources/subnet";
import { tenant } from "./resources/tenant";
import { virtualMachine } from "./resources/virtual-machine";
import { virtualNetwork } from "./resources/virtual-network";
import { vnetPeering } from "./resources/vnet-peering";
import {
  resourceSchema,
  type Category,
  type Resource,
  type ResourceInput,
} from "./schema";

const rawResources: ResourceInput[] = [
  tenant,
  managementGroup,
  subscription,
  resourceGroup,
  virtualMachine,
  virtualMachineScaleSet,
  appServicePlan,
  appService,
  containerInstances,
  containerApps,
  storageAccount,
  blobContainer,
  fileShare,
  // Monitor & backup
  logAnalyticsWorkspace,
  alertRule,
  actionGroup,
  networkWatcher,
  recoveryServicesVault,
  // Networking
  virtualNetwork,
  subnet,
  publicIpAddress,
  networkSecurityGroup,
  applicationSecurityGroup,
  routeTable,
  vnetPeering,
  networkVirtualAppliance,
  azureDnsZone,
  privateDnsZone,
  loadBalancer,
  azureBastion,
  serviceEndpoint,
  privateEndpoint,
];

/**
 * Parse every entry with Zod, then check cross-references.
 * This runs at build time, so a bad entry fails `next build` instead of
 * shipping a broken page.
 */
function loadResources(input: ResourceInput[]): Resource[] {
  const parsed = input.map((entry) => {
    const result = resourceSchema.safeParse(entry);
    if (!result.success) {
      const slug = (entry as { slug?: string }).slug ?? "<unknown>";
      throw new Error(
        `Invalid resource "${slug}":\n${result.error.issues
          .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
          .join("\n")}`,
      );
    }
    return result.data;
  });

  const slugs = new Set<string>();
  for (const r of parsed) {
    if (slugs.has(r.slug)) throw new Error(`Duplicate resource slug "${r.slug}"`);
    slugs.add(r.slug);
  }

  for (const r of parsed) {
    const refs = [
      ...r.related,
      ...r.prerequisites.flatMap((p) => (p.slug ? [p.slug] : [])),
    ];
    for (const ref of refs) {
      if (!slugs.has(ref)) {
        throw new Error(`Resource "${r.slug}" references unknown slug "${ref}"`);
      }
    }
    const rule = r.simulator?.nameRule;
    if (rule && !nameRules[rule]) {
      throw new Error(`Resource "${r.slug}" uses unknown name rule "${rule}"`);
    }
    if (r.simulator) {
      const samples = [r.example.bicep, r.example.arm].filter(Boolean).join("\n");
      const needle = `${r.simulator.armType}@${r.simulator.apiVersion}`;
      if (samples && !samples.includes(needle)) {
        throw new Error(
          `Resource "${r.slug}" simulator apiVersion ${r.simulator.apiVersion} is not in its Bicep or ARM example (${needle})`,
        );
      }
    }
  }

  return parsed;
}

export const resources: Resource[] = loadResources(rawResources);

export function getResource(slug: string): Resource | undefined {
  return resources.find((r) => r.slug === slug);
}

export function getResourcesByCategory(category: Category): Resource[] {
  return resources.filter((r) => r.category === category);
}
