import type { ResourceInput } from "../schema";

export const privateDnsZone: ResourceInput = {
  slug: "private-dns-zone",
  name: "Private DNS Zone",
  type: "Microsoft.Network/privateDnsZones",
  category: "networking",
  scope: "resource",
  icon: "Lock",

  tagline: "Friendly names that only resolve inside the VNets you link.",
  definition:
    "A private DNS zone provides name resolution for resources inside virtual networks, using a domain of your choice such as contoso.internal. Only VNets that you link to the zone can resolve its records. A link can also have auto-registration, which creates and removes DNS records for VMs in the VNet automatically.",
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
      "Open the zone, choose Virtual network links, then Add.",
      "Enter a link name such as link-vnet-sea and select vnet-sea.",
      "Tick Enable auto registration to register VM names automatically, then select OK.",
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
    "A private zone only resolves for VNets that are linked to it. Peering VNets does not share the zone.",
    "A VNet link with auto-registration creates records for VMs in that VNet. A VNet can have only one registration link, but a zone can have many resolution-only links.",
    "Auto-registration creates A records for VMs in the linked VNet and removes them when the VM is deleted.",
    "Private endpoints use special privatelink zones, for example privatelink.blob.core.windows.net, linked to the VNet.",
    "Azure's built-in resolver at 168.63.129.16 answers queries for linked private zones.",
  ],

  related: ["azure-dns-zone", "virtual-network", "vnet-peering"],
  docsUrl: "https://learn.microsoft.com/azure/dns/private-dns-privatednszone",
};
