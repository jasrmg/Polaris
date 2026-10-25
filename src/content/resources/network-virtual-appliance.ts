import type { ResourceInput } from "../schema";

export const networkVirtualAppliance: ResourceInput = {
  slug: "network-virtual-appliance",
  name: "Network Virtual Appliance",
  type: "Microsoft.Network/networkInterfaces (IP forwarding enabled)",
  category: "networking",
  scope: "resource",
  icon: "Router",

  tagline: "A VM that acts as a firewall or router in the middle of your traffic.",
  definition:
    "A network virtual appliance (NVA) is a virtual machine that runs a network application such as a firewall, WAN optimization or load balancing software. Ready-to-deploy NVAs from partners are in the Azure Marketplace. There is no single NVA resource type in Azure. It is a normal VM whose network interface (Microsoft.Network/networkInterfaces) has IP forwarding enabled, usually placed in the path of traffic by a route table.",
  analogy:
    "A security checkpoint on the road. Traffic is not meant to end there. It stops, gets inspected, and carries on if it passes.",
  whenToUse: [
    "Inspecting or filtering traffic between VNets, or between a VNet and the internet, with a vendor firewall you already use.",
    "Ending VPN or SD-WAN tunnels from external locations with an appliance from your vendor.",
  ],
  notFor: [
    "Simple allow and deny rules. A network security group has no cost and can filter traffic in and out of subnets and NICs.",
    "Cases where a managed service works. Azure Firewall is a managed firewall service with built-in high availability and scalability, and Learn also calls it an Azure-native NVA.",
  ],

  prerequisites: [
    {
      name: "A virtual machine with the appliance software",
      slug: "virtual-machine",
      why: "The NVA is a VM, usually deployed from an image in the Azure Marketplace.",
    },
    {
      name: "IP forwarding on the network interface",
      why: "Without it Azure drops packets that are not addressed to the VM itself. This is an Azure setting, and you might also need to enable IP forwarding inside the VM's operating system.",
    },
    {
      name: "A route table that points at the NVA",
      slug: "route-table",
      why: "Traffic only flows through the NVA if a UDR uses next hop type Virtual appliance with the private IP of the NVA's network interface.",
    },
    {
      name: "A subnet for the NVA",
      slug: "subnet",
      why: "In Learn's examples the NVA sits in its own subnet, for example in the hub VNet.",
    },
  ],

  example: {
    portal: [
      "Create the VM that will be the appliance, for example nva-hub-01, in a subnet of the hub VNet.",
      "Open the VM, choose Networking, select the network interface, then IP configurations.",
      "Set IP forwarding to Enabled and select Save.",
      "Check the appliance software, and if needed enable IP forwarding inside the VM's operating system.",
      "Create a route table, then under Routes select + Add. Set Next hop type to Virtual appliance and Next hop address to the VM's private IP.",
      "Under the virtual network's Subnets, associate the route table with each subnet whose traffic should be inspected.",
    ],
    cli: `az network nic update \\
  --resource-group rg-polaris-demo \\
  --name nic-nva-hub-01 \\
  --ip-forwarding true

az network route-table route create \\
  --resource-group rg-polaris-demo \\
  --route-table-name rt-spoke \\
  --name via-nva \\
  --address-prefix 10.3.0.0/16 \\
  --next-hop-type VirtualAppliance \\
  --next-hop-ip-address 10.0.2.4`,
    powershell: `$nic = Get-AzNetworkInterface \`
  -ResourceGroupName "rg-polaris-demo" \`
  -Name "nic-nva-hub-01"

$nic.EnableIPForwarding = $true
$nic | Set-AzNetworkInterface`,
    bicep: `resource nic 'Microsoft.Network/networkInterfaces@2023-09-01' = {
  name: 'nic-nva-hub-01'
  location: resourceGroup().location
  properties: {
    enableIPForwarding: true
    ipConfigurations: [
      {
        name: 'ipconfig1'
        properties: {
          privateIPAllocationMethod: 'Static'
          privateIPAddress: '10.0.2.4'
          subnet: {
            id: resourceId('Microsoft.Network/virtualNetworks/subnets', 'vnet-hub', 'snet-nva')
          }
        }
      }
    ]
  }
}`,
  },
  examNotes: [
    "IP forwarding is an Azure setting on each NIC that forwards traffic. The VM must also run an application that can forward the traffic, and you might need to enable forwarding in the guest OS.",
    "A UDR with next hop type VirtualAppliance and the private IP of the NVA's network interface is what sends traffic through it. Learn also uses Virtual appliance for Azure Firewall, a managed service, with the firewall's private IP.",
    "When the NVA is in a hub, the peerings must be configured to accept forwarded traffic (Allow forwarded traffic).",
    "To make an NVA highly available, run at least two behind an internal Standard Load Balancer with an HA ports rule.",
    "If traffic does not pass, check Effective routes, the NVA's NSG and Next hop in Network Watcher before blaming the appliance.",
  ],

  related: ["route-table", "vnet-peering", "virtual-machine", "load-balancer"],
  docsUrl:
    "https://learn.microsoft.com/azure/virtual-network/virtual-network-network-interface",
};
