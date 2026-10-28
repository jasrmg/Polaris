import type { ResourceInput } from "../schema";

export const publicIpAddress: ResourceInput = {
  slug: "public-ip-address",
  name: "Public IP Address",
  type: "Microsoft.Network/publicIPAddresses",
  category: "networking",
  kind: "azure-resource",
  exams: ["az-104"],
  tier: 1,
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
      why: "Public IPv4 addresses have a nominal charge, and public IPs are limited per region and per subscription.",
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
      why: "Standard is the current SKU: always static and secure by default. Basic public IPs were retired on 30 September 2025. A Standard v2 SKU also exists, but it works only with the Standard v2 NAT gateway. You cannot change the SKU after creation.",
    },
    {
      name: "A resource to associate it with",
      why: "You create the public IP on its own, then associate it with a resource such as a VM network interface, a public load balancer, a bastion host, a NAT gateway, an application gateway or an Azure Firewall. It has no effect until it is associated.",
    },
  ],

  example: {
    portal: [
      "Search for Public IP addresses and select Create.",
      "Select the Subscription and Resource group.",
      "Choose a Region, then enter a Name, for example pip-web-01.",
      "Select the SKU Standard. Keep the Tier as Regional and the Availability zone as Zone-redundant.",
      "The IP address assignment is Static, which is the only option for Standard.",
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
    {
      exam: "az-104",
      points: [
    "A Standard public IP is secure by default: inbound traffic is dropped until an NSG rule allows it.",
    "Standard public IPs are always static. Basic SKU public IPs were retired on 30 September 2025, but Learn still describes Basic in comparison tables, so you may see it in older material.",
    "The DNS name label becomes label.region.cloudapp.azure.com. It must be unique within that Azure region across all subscriptions and all customers.",
    "By default, deleting a VM leaves its public IP in place. Set the delete option when you create the VM (Delete public IP and NIC when VM is deleted), or remove the public IP yourself, because it keeps costing money.",
  ],
    },
  ],

  related: ["network-security-group", "virtual-machine", "load-balancer", "azure-bastion"],
  docsUrl:
    "https://learn.microsoft.com/azure/virtual-network/ip-services/public-ip-addresses",
  simulator: {
    armType: "Microsoft.Network/publicIPAddresses",
    apiVersion: "2023-09-01",
    nameRule: "public-ip-address",
  },
};
