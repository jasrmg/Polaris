import { applicationSecurityGroup } from "./resources/application-security-group";
import { azureBastion } from "./resources/azure-bastion";
import { azureDnsZone } from "./resources/azure-dns-zone";
import { loadBalancer } from "./resources/load-balancer";
import { networkSecurityGroup } from "./resources/network-security-group";
import { networkVirtualAppliance } from "./resources/network-virtual-appliance";
import { privateDnsZone } from "./resources/private-dns-zone";
import { privateEndpoint } from "./resources/private-endpoint";
import { publicIpAddress } from "./resources/public-ip-address";
import { resourceGroup } from "./resources/resource-group";
import { routeTable } from "./resources/route-table";
import { serviceEndpoint } from "./resources/service-endpoint";
import { storageAccount } from "./resources/storage-account";
import { subnet } from "./resources/subnet";
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
  resourceGroup,
  virtualMachine,
  storageAccount,
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
