import type { ResourceInput } from "../schema";

export const privateDnsZone: ResourceInput = {
  slug: "private-dns-zone",
  name: "Private DNS Zone",
  type: "Microsoft.Network/privateDnsZones",
  category: "networking",
  kind: "azure-resource",
  exams: ["az-104"],
  tier: 1,
  scope: "resource",
  icon: "Lock",

  tagline: "Friendly names that only resolve inside the VNets you link.",
  definition:
    "A private DNS zone provides name resolution for resources inside virtual networks, using a domain of your choice such as contoso.internal. Only VNets that you link to the zone can resolve its records. A link can also have auto-registration, which automatically keeps A records for the VMs in that VNet up to date. The zone is a global resource, not tied to one VNet or region.",
  analogy:
    "An internal staff directory. Employees inside the building can look people up by name, but the directory is not published to the outside world.",
  whenToUse: [
    "Reaching VMs by name (web01.contoso.internal) instead of private IP address.",
    "Resolving private endpoints, which use zones such as privatelink.blob.core.windows.net.",
    "Keeping internal host names out of public DNS.",
  ],
  notFor: [
    "Names that internet users must resolve. Use a public Azure DNS zone.",
    "Resolution from on-premises networks on its own. That needs DNS forwarding or Azure DNS Private Resolver.",
  ],

  prerequisites: [
    {
      name: "A resource group",
      slug: "resource-group",
      why: "The private zone is a resource and needs a group.",
    },
    {
      name: "A virtual network to link",
      slug: "virtual-network",
      why: "Resolution works only in VNets linked to the zone.",
    },
    {
      name: "A virtual network link",
      why: "The link joins the VNet to the zone. Without one, nothing resolves.",
    },
  ],

  example: {
    portal: [
      "Search for Private DNS zones and select Create.",
      "Select the Resource group and enter the Name, for example contoso.internal.",
      "Select Review + create, then Create.",
      "Open the zone, and under DNS Management select Virtual Network Links, then + Add.",
      "Enter a Link name such as link-vnet-sea and select vnet-sea as the Virtual Network.",
      "Under Configuration, tick Enable auto registration to register VM names automatically, then select Create.",
    ],
    cli: `az network private-dns zone create \\
  --resource-group rg-polaris-demo \\
  --name contoso.internal

az network private-dns link vnet create \\
  --resource-group rg-polaris-demo \\
  --zone-name contoso.internal \\
  --name link-vnet-sea \\
  --virtual-network vnet-sea \\
  --registration-enabled true`,
    powershell: `New-AzPrivateDnsZone \`
  -ResourceGroupName "rg-polaris-demo" \`
  -Name "contoso.internal"

$vnet = Get-AzVirtualNetwork \`
  -Name "vnet-sea" \`
  -ResourceGroupName "rg-polaris-demo"

New-AzPrivateDnsVirtualNetworkLink \`
  -ResourceGroupName "rg-polaris-demo" \`
  -ZoneName "contoso.internal" \`
  -Name "link-vnet-sea" \`
  -VirtualNetworkId $vnet.Id \`
  -EnableRegistration`,
    bicep: `resource zone 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: 'contoso.internal'
  location: 'global'
}

resource vnet 'Microsoft.Network/virtualNetworks@2023-09-01' existing = {
  name: 'vnet-sea'
}

resource link 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: zone
  name: 'link-vnet-sea'
  location: 'global'
  properties: {
    registrationEnabled: true
    virtualNetwork: {
      id: vnet.id
    }
  }
}`,
  },
  examNotes: [
    {
      exam: "az-104",
      points: [
    "A private zone resolves only for VNets linked to it (or through a DNS Private Resolver). Peering is not required for resolution, and a VNet needs its own link to the zone.",
    "A link with auto-registration (registrationEnabled true) makes the VNet a registration VNet. A VNet can have only one registration zone but can link to many zones for resolution only (limit 1,000 zones per VNet).",
    "A zone can have many links: up to 1,000 VNet links, of which up to 100 can have auto-registration.",
    "Auto-registration works only for VMs, and only for the primary NIC. It creates A records, not PTR records, and removes them when the VM is deleted or stopped. Records for other resources, such as an internal load balancer, are created manually.",
    "Private endpoints use special privatelink zones, for example privatelink.blob.core.windows.net, linked to the VNet.",
    "With default VNet DNS settings, linked private zones are queried first, then Azure-provided DNS (168.63.129.16). A custom DNS server skips the zone unless it forwards to 168.63.129.16 or uses a Private Resolver.",
    "A private zone name needs at least two labels (contoso.internal works) and cannot hold NS delegations.",
  ],
    },
  ],

  related: ["azure-dns-zone", "virtual-network", "vnet-peering", "private-endpoint"],
  docsUrl: "https://learn.microsoft.com/azure/dns/private-dns-privatednszone",
  simulator: {
    armType: "Microsoft.Network/privateDnsZones",
    apiVersion: "2020-06-01",
    nameRule: "private-dns-zone",
  },
};
