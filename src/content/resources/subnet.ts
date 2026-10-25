import type { ResourceInput } from "../schema";

export const subnet: ResourceInput = {
  slug: "subnet",
  name: "Subnet",
  type: "Microsoft.Network/virtualNetworks/subnets",
  category: "networking",
  scope: "resource",
  icon: "LayoutGrid",

  tagline: "A slice of a virtual network's address space where resources attach.",
  definition:
    "A subnet is a range of IP addresses inside a virtual network. Resources such as VM network interfaces get their private IP address from a subnet. Security rules (NSGs), custom routes and service endpoints are attached at the subnet level, so subnets are how you group resources that should be treated the same way.",
  analogy:
    "If the VNet is a building, a subnet is one floor. Each floor can have its own door lock (NSG) and its own signposts (route table).",
  whenToUse: [
    "Separating tiers such as web, app and data so each gets its own security rules.",
    "Reserving the specially named subnets that Azure services require, such as GatewaySubnet or AzureBastionSubnet.",
    "Attaching a route table that steers traffic through a firewall or NVA.",
  ],
  notFor: [
    "Isolation between unrelated workloads. Use separate VNets or subscriptions when the separation needs to be strong.",
  ],

  prerequisites: [
    {
      name: "A virtual network",
      slug: "virtual-network",
      why: "A subnet is a child of a VNet and must come from the VNet's address space.",
    },
    {
      name: "A range that fits inside the VNet and does not overlap another subnet",
      why: "For example 10.1.2.0/24 inside 10.1.0.0/16. The smallest allowed subnet is /29 and the largest is /2.",
    },
    {
      name: "A required name, for special subnets",
      why: "Some services need an exact name: GatewaySubnet, AzureBastionSubnet, AzureFirewallSubnet.",
    },
  ],

  example: {
    portal: [
      "Open the virtual network and select Subnets.",
      "Select + Subnet.",
      "Enter a Name, for example snet-app.",
      "Enter the Starting address (10.1.2.0) and Size (/24).",
      "Optionally attach a Network security group or Route table.",
      "Select Add.",
    ],
    cli: `az network vnet subnet create \\
  --resource-group rg-polaris-demo \\
  --vnet-name vnet-sea \\
  --name snet-app \\
  --address-prefixes 10.1.2.0/24`,
    powershell: `$vnet = Get-AzVirtualNetwork \`
  -Name "vnet-sea" \`
  -ResourceGroupName "rg-polaris-demo"

Add-AzVirtualNetworkSubnetConfig \`
  -Name "snet-app" \`
  -VirtualNetwork $vnet \`
  -AddressPrefix "10.1.2.0/24"

$vnet | Set-AzVirtualNetwork`,
    bicep: `resource vnet 'Microsoft.Network/virtualNetworks@2023-09-01' existing = {
  name: 'vnet-sea'
}

resource subnet 'Microsoft.Network/virtualNetworks/subnets@2023-09-01' = {
  parent: vnet
  name: 'snet-app'
  properties: {
    addressPrefix: '10.1.2.0/24'
  }
}`,
  },
  examNotes: [
    "Azure reserves 5 addresses per subnet, so a /29 leaves only 3 usable addresses.",
    "Special subnets need exact names: GatewaySubnet, AzureBastionSubnet (/26 or larger) and AzureFirewallSubnet (/26 or larger).",
    "NSGs and route tables are associated with subnets (an NSG can also go on a NIC; a route table cannot).",
    "You cannot delete a subnet while resources, such as NICs, are still attached to it.",
    "Redeploying a VNet template that lists subnets inline replaces the whole subnet list. Subnets missing from the template are removed.",
  ],

  related: ["virtual-network", "network-security-group", "route-table"],
  docsUrl: "https://learn.microsoft.com/azure/virtual-network/virtual-network-manage-subnet",
};
