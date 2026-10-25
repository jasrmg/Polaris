import type { ResourceInput } from "../schema";

export const networkVirtualAppliance: ResourceInput = {
  slug: "network-virtual-appliance",
  name: "Network Virtual Appliance",
  type: "Microsoft.Compute/virtualMachines (with IP forwarding)",
  category: "networking",
  scope: "resource",
  icon: "Router",

  tagline: "A VM that acts as a firewall or router in the middle of your traffic.",
  definition:
    "A network virtual appliance (NVA) is a virtual machine that runs networking software such as a firewall, router or WAN optimizer, often from a third-party vendor in the Azure Marketplace. Azure does not treat it as a special resource. It is a normal VM with IP forwarding turned on, placed in the path of traffic by a route table.",
  analogy:
    "A security checkpoint on the road. Traffic is not meant to end there. It stops, gets inspected, and carries on if it passes.",
  whenToUse: [
    "Inspecting or filtering traffic between VNets, or between a VNet and the internet, with a vendor firewall you already use.",
    "Connecting to an on-premises device or service that Azure has no built-in equivalent for.",
  ],
  notFor: [
    "Simple allow and deny rules. A network security group is free and enough.",
    "Cases where a managed service works. Azure Firewall needs no VM patching or scaling.",
  ],

  prerequisites: [
    {
      name: "A virtual machine with the appliance software",
      slug: "virtual-machine",
      why: "The NVA is a VM, usually deployed from an image in the Azure Marketplace.",
    },
    {
      name: "IP forwarding on the network interface",
      why: "Without it Azure drops packets that are not addressed to the VM itself. You must also enable forwarding inside the guest OS.",
    },
    {
      name: "A route table that points at the NVA",
      slug: "route-table",
      why: "Traffic only flows through the NVA if a UDR names its private IP as the next hop.",
    },
    {
      name: "A subnet for the NVA",
      slug: "subnet",
      why: "The NVA usually sits in its own subnet, for example in the hub VNet.",
    },
  ],

  example: {
    portal: [
      "Create the VM that will be the appliance, for example nva-hub-01, in a subnet of the hub VNet.",
      "Open the VM, choose Networking, select the network interface, then IP configurations.",
      "Set IP forwarding to Enabled and select Save.",
      "Inside the VM, enable IP forwarding in the operating system.",
      "Create a route table with a route whose next hop type is Virtual appliance and whose next hop address is the VM's private IP.",
      "Associate the route table with the subnets whose traffic should be inspected.",
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
    "IP forwarding must be enabled on the NVA's network interface in Azure and also inside the guest operating system.",
    "A UDR with next hop type VirtualAppliance and the NVA's private IP is what sends traffic through it. Use a static private IP so the route never goes stale.",
    "When the NVA is in a peered VNet, the peering needs Allow forwarded traffic on the link that carries the forwarded traffic.",
    "To make an NVA highly available, put two behind an internal Standard load balancer with HA ports.",
    "If traffic does not pass, check Effective routes, the NVA's NSG and Next hop in Network Watcher before blaming the appliance.",
  ],

  related: ["route-table", "vnet-peering", "virtual-machine"],
  docsUrl:
    "https://learn.microsoft.com/azure/architecture/reference-architectures/dmz/nva-ha",
};
