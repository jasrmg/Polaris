import type { ResourceInput } from "../schema";

export const publicIpAddress: ResourceInput = {
  slug: "public-ip-address",
  name: "Public IP Address",
  type: "Microsoft.Network/publicIPAddresses",
  category: "networking",
  scope: "resource",
  icon: "Globe",

  tagline: "An internet-reachable address you can attach to a resource.",
  definition:
    "A public IP address is a separate Azure resource that gives something an address reachable from the internet. You attach it to a network interface, load balancer frontend, bastion host, NAT gateway or similar. A Standard public IP is always static and is closed to inbound traffic until a network security group explicitly allows it.",
  analogy:
    "A public IP is the street address of your front door. Without one, nobody outside can find you, and even with one the door stays locked until you add a rule.",
  whenToUse: [
    "Exposing a VM, load balancer or bastion host to the internet.",
    "Giving outbound traffic a stable source address that partners can allow-list.",
    "Pointing a DNS name at an Azure resource using a DNS name label.",
  ],
  notFor: [
    "Resources that only need to talk inside the VNet. Use private IPs and keep them off the internet.",
    "Administrative access to VMs in production. Prefer Azure Bastion over putting a public IP on every VM.",
  ],

  prerequisites: [
    {
      name: "An Azure subscription",
      why: "Public IPs are billed and limited per subscription.",
    },
    {
      name: "A resource group",
      slug: "resource-group",
      why: "The public IP is its own resource and needs a group.",
    },
    {
      name: "A region",
      why: "It must be in the same region as the resource you attach it to.",
    },
    {
      name: "The Standard SKU",
      why: "Standard is the current SKU: always static and secure by default. Basic public IPs were retired on 30 September 2025.",
    },
    {
      name: "A resource to attach it to",
      why: "A NIC, load balancer, bastion host or NAT gateway. A public IP on its own does nothing.",
    },
  ],

  example: {
    portal: [
      "Search for Public IP addresses and select Create.",
      "Select the Subscription and Resource group.",
      "Enter a Name, for example pip-web-01, and choose a Region.",
      "Keep the SKU as Standard and the Assignment as Static.",
      "Optionally enter a DNS name label such as polaris-web-01.",
      "Select Review + create, then Create.",
    ],
    cli: `az network public-ip create \\
  --resource-group rg-polaris-demo \\
  --name pip-web-01 \\
  --location southeastasia \\
  --sku Standard \\
  --allocation-method Static \\
  --dns-name polaris-web-01`,
    powershell: `New-AzPublicIpAddress \`
  -ResourceGroupName "rg-polaris-demo" \`
  -Name "pip-web-01" \`
  -Location "southeastasia" \`
  -Sku Standard \`
  -AllocationMethod Static \`
  -DomainNameLabel "polaris-web-01"`,
    bicep: `resource pip 'Microsoft.Network/publicIPAddresses@2023-09-01' = {
  name: 'pip-web-01'
  location: resourceGroup().location
  sku: {
    name: 'Standard'
    tier: 'Regional'
  }
  properties: {
    publicIPAllocationMethod: 'Static'
    publicIPAddressVersion: 'IPv4'
    dnsSettings: {
      domainNameLabel: 'polaris-web-01'
    }
  }
}`,
  },
  examNotes: [
    "A Standard public IP is secure by default: inbound traffic is dropped until an NSG rule allows it.",
    "Standard public IPs are always static. Older exam material that compares Basic and Standard is out of date because Basic was retired.",
    "The DNS name label becomes label.region.cloudapp.azure.com and must be unique within the region.",
    "A public IP is a separate resource. Deleting a VM does not always delete its public IP, so check for leftovers and their cost.",
  ],

  related: ["network-security-group", "virtual-machine"],
  docsUrl:
    "https://learn.microsoft.com/azure/virtual-network/ip-services/public-ip-addresses",
};
