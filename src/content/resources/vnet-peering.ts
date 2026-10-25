import type { ResourceInput } from "../schema";

export const vnetPeering: ResourceInput = {
  slug: "vnet-peering",
  name: "Virtual Network Peering",
  type: "Microsoft.Network/virtualNetworks/virtualNetworkPeerings",
  category: "networking",
  scope: "resource",
  icon: "Link2",

  tagline: "A private link between two VNets, in the same region or across regions.",
  definition:
    "VNet peering connects two virtual networks so resources in each can reach the other using private IP addresses. The traffic stays on the Microsoft backbone network. Peering within one region is called regional peering, and peering between regions (for example Southeast Asia and East Asia) is called global peering. A peering is made of two links, one in each VNet.",
  analogy:
    "A private corridor between two buildings. Both buildings must agree to open their end of the corridor, and the corridor only joins those two buildings. It does not join their neighbours.",
  whenToUse: [
    "Letting workloads in different VNets talk privately, such as an app VNet and a shared-services VNet.",
    "Connecting VNets in different regions without a VPN gateway.",
    "Building hub-and-spoke networks where spokes share a gateway or firewall in the hub.",
  ],
  notFor: [
    "VNets with overlapping address spaces. Peering will not be created.",
    "Transitive connectivity. If A peers with B and B peers with C, A cannot reach C without extra routing.",
  ],

  prerequisites: [
    {
      name: "Two virtual networks",
      slug: "virtual-network",
      why: "Peering joins two VNets. They can be in different regions, subscriptions or tenants.",
    },
    {
      name: "Non-overlapping address spaces",
      why: "For example 10.1.0.0/16 and 10.2.0.0/16. Overlapping ranges cannot be peered.",
    },
    {
      name: "A peering link in each direction",
      why: "The portal creates both links for you. With the CLI or PowerShell you create each one yourself.",
      autoCreated: true,
    },
    {
      name: "Permission on both VNets",
      why: "You need network contributor rights on both sides, which matters when the VNets are in different subscriptions.",
    },
  ],

  example: {
    portal: [
      "Open the first virtual network (vnet-sea) and select Peerings, then Add.",
      "Name the link from this network, for example sea-to-ea.",
      "Choose the remote virtual network (vnet-ea) and name the link from the remote network, for example ea-to-sea.",
      "Keep Allow access to remote virtual network enabled for both links.",
      "Select Add. The peering status should change to Connected.",
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
    "Peering is non-transitive. Reaching a third network needs another peering, or a UDR to an NVA or firewall.",
    "A peering has two links. The status is Initiated until the second link exists, then Connected.",
    "Regional peering is within one region. Global peering crosses regions. Both use private IPs over the Microsoft backbone.",
    "Address spaces must not overlap. If you change an address space later, sync the peering.",
    "Allow forwarded traffic must be on for traffic that an NVA in the peered VNet forwards on behalf of other sources.",
    "Gateway transit lets a spoke use the hub's VPN gateway. The spoke sets Use remote gateways, and the hub sets Allow gateway transit. A VNet with its own gateway cannot use remote gateways.",
  ],

  related: ["virtual-network", "network-virtual-appliance", "private-dns-zone"],
  docsUrl:
    "https://learn.microsoft.com/azure/virtual-network/virtual-network-peering-overview",
};
