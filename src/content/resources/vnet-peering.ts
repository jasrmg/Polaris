import type { ResourceInput } from "../schema";

export const vnetPeering: ResourceInput = {
  slug: "vnet-peering",
  name: "Virtual Network Peering",
  type: "Microsoft.Network/virtualNetworks/virtualNetworkPeerings",
  category: "networking",
  kind: "azure-resource",
  exams: ["az-104"],
  tier: 1,
  scope: "resource",
  icon: "Link2",

  tagline: "A private link between two VNets, in the same region or across regions.",
  definition:
    "VNet peering connects two virtual networks so resources in each can reach the other using private IP addresses. The traffic stays on the Microsoft backbone network, with no public internet, gateway or encryption needed between the VNets. Virtual network peering connects VNets in the same region, and global virtual network peering connects VNets in different regions (for example Southeast Asia and East Asia). A peering needs a link configured in each VNet.",
  analogy:
    "A private corridor between two buildings. Both buildings must agree to open their end of the corridor, and the corridor only joins those two buildings. It does not join their neighbours.",
  whenToUse: [
    "Letting workloads in different VNets talk privately, such as an app VNet and a shared-services VNet.",
    "Connecting VNets in different regions without a VPN gateway.",
    "Building hub-and-spoke networks where spokes share a gateway or firewall in the hub.",
  ],
  notFor: [
    "VNets with overlapping address spaces. Peered VNets must have nonoverlapping IP address spaces.",
    "Transitive connectivity. If A peers with B and B peers with C, A cannot reach C unless you peer A and C directly or route through an NVA in the hub.",
  ],

  prerequisites: [
    {
      name: "Two virtual networks",
      slug: "virtual-network",
      why: "Peering joins two VNets. They can be in different regions, subscriptions or tenants.",
    },
    {
      name: "Non-overlapping address spaces",
      why: "For example 10.1.0.0/16 and 10.2.0.0/16. The VNets you peer must have nonoverlapping IP address spaces.",
    },
    {
      name: "A peering link in each direction",
      why: "The portal creates both links for you. With the CLI or PowerShell you create each one yourself.",
      autoCreated: true,
    },
    {
      name: "Permission on both VNets",
      why: "Your account needs the Network Contributor role, or a custom role with the virtualNetworkPeerings actions, on the VNets you create links for. For VNets in different Microsoft Entra tenants, add a guest user from each tenant to the other.",
    },
  ],

  example: {
    portal: [
      "Open the first virtual network (vnet-sea), select Peerings under Settings, then select + Add.",
      "Under Remote virtual network summary, name the link in the remote network (for example ea-to-sea) and select the remote virtual network (vnet-ea).",
      "Under Local virtual network summary, name the link in this network, for example sea-to-ea.",
      "Keep the defaults: access between the networks is allowed in both directions, and forwarded traffic, gateway transit and remote gateway options are cleared.",
      "Select Add. The portal creates both links. Select Refresh and the peering status changes from Updating to Connected.",
    ],
    cli: `az network vnet peering create \\
  --resource-group rg-polaris-demo \\
  --name sea-to-ea \\
  --vnet-name vnet-sea \\
  --remote-vnet vnet-ea \\
  --allow-vnet-access

az network vnet peering create \\
  --resource-group rg-polaris-demo \\
  --name ea-to-sea \\
  --vnet-name vnet-ea \\
  --remote-vnet vnet-sea \\
  --allow-vnet-access`,
    powershell: `$sea = Get-AzVirtualNetwork \`
  -Name "vnet-sea" \`
  -ResourceGroupName "rg-polaris-demo"

$ea = Get-AzVirtualNetwork \`
  -Name "vnet-ea" \`
  -ResourceGroupName "rg-polaris-demo"

Add-AzVirtualNetworkPeering \`
  -Name "sea-to-ea" \`
  -VirtualNetwork $sea \`
  -RemoteVirtualNetworkId $ea.Id

Add-AzVirtualNetworkPeering \`
  -Name "ea-to-sea" \`
  -VirtualNetwork $ea \`
  -RemoteVirtualNetworkId $sea.Id`,
    bicep: `resource vnetSea 'Microsoft.Network/virtualNetworks@2023-09-01' existing = {
  name: 'vnet-sea'
}

resource vnetEa 'Microsoft.Network/virtualNetworks@2023-09-01' existing = {
  name: 'vnet-ea'
}

resource seaToEa 'Microsoft.Network/virtualNetworks/virtualNetworkPeerings@2023-09-01' = {
  parent: vnetSea
  name: 'sea-to-ea'
  properties: {
    remoteVirtualNetwork: {
      id: vnetEa.id
    }
    allowVirtualNetworkAccess: true
    allowForwardedTraffic: false
    allowGatewayTransit: false
    useRemoteGateways: false
  }
}

resource eaToSea 'Microsoft.Network/virtualNetworks/virtualNetworkPeerings@2023-09-01' = {
  parent: vnetEa
  name: 'ea-to-sea'
  properties: {
    remoteVirtualNetwork: {
      id: vnetSea.id
    }
    allowVirtualNetworkAccess: true
    allowForwardedTraffic: false
    allowGatewayTransit: false
    useRemoteGateways: false
  }
}`,
  },
  examNotes: [
    {
      exam: "az-104",
      points: [
    "Peering is non-transitive. Reaching a third network needs a direct peering, or routing through an NVA in the hub.",
    "A peering needs a link in each VNet. The first link shows Initiated, and both show Connected once the second link exists. Traffic does not flow until both are Connected.",
    "Virtual network peering is within one region. Global virtual network peering crosses regions. Both keep traffic on the Microsoft backbone and both support gateway transit.",
    "Address spaces must not overlap. After you resize the address space of a peered VNet, the peers must sync with the change (portal or PowerShell).",
    "Global peering limit: resources cannot reach the front-end IP of a Basic load balancer in a globally peered VNet. Standard Load Balancer works over both kinds of peering.",
    "Allow forwarded traffic lets a VNet receive traffic that did not originate in the peered VNet, such as traffic sent by an NVA there. It does not create the UDR or the NVA.",
    "Gateway transit lets a spoke use the hub's gateway. The hub link enables Allow gateway transit, the spoke link enables Use remote gateways. A VNet that has its own gateway cannot use a remote gateway.",
    "Peering does not resolve names across VNets with default Azure DNS. Use Azure Private DNS or a custom DNS server.",
  ],
    },
  ],

  related: ["virtual-network", "network-virtual-appliance", "private-dns-zone"],
  docsUrl:
    "https://learn.microsoft.com/azure/virtual-network/virtual-network-peering-overview",
  simulator: {
    armType: "Microsoft.Network/virtualNetworks/virtualNetworkPeerings",
    apiVersion: "2023-09-01",
    nameRule: "vnet-peering",
  },
};
