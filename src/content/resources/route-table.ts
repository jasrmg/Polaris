import type { ResourceInput } from "../schema";

export const routeTable: ResourceInput = {
  slug: "route-table",
  name: "Route Table",
  type: "Microsoft.Network/routeTables",
  category: "networking",
  scope: "resource",
  icon: "Route",

  tagline: "Custom signposts that override where Azure sends traffic from a subnet.",
  definition:
    "Azure creates default routes for every subnet so traffic finds its way inside the VNet, to peered VNets and out to the internet. A route table holds user-defined routes (UDRs) that override those defaults. Each route says \"traffic for this address range goes to this next hop\", for example a firewall or NVA. You associate the route table with one or more subnets.",
  analogy:
    "Azure already has road signs. A route table is a roadwork detour sign: \"all traffic to the internet must go through the checkpoint first\".",
  whenToUse: [
    "Sending traffic through a firewall or NVA (forced inspection).",
    "Making spokes in a hub-and-spoke network reach each other through the hub, since peering is not transitive.",
    "Blocking a destination by routing it to next hop type None.",
  ],
  notFor: [
    "Allowing or denying traffic. Routes decide where traffic goes; NSGs decide whether it is allowed.",
  ],

  prerequisites: [
    {
      name: "A resource group",
      slug: "resource-group",
      why: "The route table is a resource and needs a group.",
    },
    {
      name: "A region",
      why: "A route table can only be associated with subnets in the same region and subscription.",
    },
    {
      name: "A subnet to associate it with",
      slug: "subnet",
      why: "A route table does nothing until it is associated with a subnet.",
    },
    {
      name: "A next hop for each route",
      slug: "network-virtual-appliance",
      why: "For a VirtualAppliance next hop you need the private IP address of the device, and that device must forward traffic.",
    },
  ],

  example: {
    portal: [
      "Search for Route tables and select Create.",
      "Select the Resource group, choose a Region and enter a Name such as rt-spoke.",
      "Select Review + create, then Create.",
      "Open the route table, choose Routes, then Add.",
      "Set Address prefix 0.0.0.0/0, Next hop type Virtual appliance and Next hop address 10.0.2.4.",
      "Choose Subnets, select Associate, and pick the subnet that should use the route table.",
    ],
    cli: `az network route-table create \\
  --resource-group rg-polaris-demo \\
  --name rt-spoke \\
  --location southeastasia \\
  --disable-bgp-route-propagation true

az network route-table route create \\
  --resource-group rg-polaris-demo \\
  --route-table-name rt-spoke \\
  --name to-internet-via-nva \\
  --address-prefix 0.0.0.0/0 \\
  --next-hop-type VirtualAppliance \\
  --next-hop-ip-address 10.0.2.4

az network vnet subnet update \\
  --resource-group rg-polaris-demo \\
  --vnet-name vnet-spoke1 \\
  --name snet-workload \\
  --route-table rt-spoke`,
    powershell: `$route = New-AzRouteConfig \`
  -Name "to-internet-via-nva" \`
  -AddressPrefix "0.0.0.0/0" \`
  -NextHopType VirtualAppliance \`
  -NextHopIpAddress "10.0.2.4"

$rt = New-AzRouteTable \`
  -ResourceGroupName "rg-polaris-demo" \`
  -Name "rt-spoke" \`
  -Location "southeastasia" \`
  -Route $route \`
  -DisableBgpRoutePropagation

$vnet = Get-AzVirtualNetwork \`
  -Name "vnet-spoke1" \`
  -ResourceGroupName "rg-polaris-demo"

Set-AzVirtualNetworkSubnetConfig \`
  -VirtualNetwork $vnet \`
  -Name "snet-workload" \`
  -AddressPrefix "10.2.1.0/24" \`
  -RouteTable $rt

$vnet | Set-AzVirtualNetwork`,
    bicep: `resource rt 'Microsoft.Network/routeTables@2023-09-01' = {
  name: 'rt-spoke'
  location: resourceGroup().location
  properties: {
    disableBgpRoutePropagation: true
    routes: [
      {
        name: 'to-internet-via-nva'
        properties: {
          addressPrefix: '0.0.0.0/0'
          nextHopType: 'VirtualAppliance'
          nextHopIpAddress: '10.0.2.4'
        }
      }
    ]
  }
}`,
  },
  examNotes: [
    "Azure picks the route with the longest matching prefix. If prefixes tie, a user-defined route beats BGP, which beats a system route.",
    "Next hop types: VirtualNetworkGateway, VirtualNetwork, Internet, VirtualAppliance and None. None drops the traffic.",
    "One route table can be associated with many subnets, but a subnet has at most one route table.",
    "Peering is not transitive. To let two spokes talk through a hub, add UDRs in the spokes that point at an NVA or firewall in the hub.",
    "Use Effective routes on a NIC, or Next hop in Network Watcher, to see which route a packet really takes.",
    "Disable BGP route propagation to stop routes learned from a VPN or ExpressRoute gateway from being added to the subnet.",
  ],

  related: ["network-virtual-appliance", "vnet-peering", "subnet"],
  docsUrl:
    "https://learn.microsoft.com/azure/virtual-network/virtual-networks-udr-overview",
};
