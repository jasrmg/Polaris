import type { ResourceInput } from "../schema";

export const virtualNetwork: ResourceInput = {
  slug: "virtual-network",
  name: "Virtual Network",
  type: "Microsoft.Network/virtualNetworks",
  category: "networking",
  kind: "azure-resource",
  exams: ["az-104"],
  tier: 1,
  scope: "resource",
  icon: "Network",

  tagline: "Your own private network in Azure, with its own IP address space.",
  definition:
    "An Azure Virtual Network (VNet) is a private, isolated network that you define with one or more IP address ranges. You carve it into subnets and attach resources such as VMs to those subnets. Resources in the same VNet can reach each other by default, and the VNet is how you control routing, filtering and connections to other networks.",
  analogy:
    "Think of the cabling and rooms inside an office building. The VNet is the whole building, subnets are the floors, and nobody outside gets in unless you open a door.",
  whenToUse: [
    "Giving VMs and other services private IP addresses that never touch the public internet.",
    "Connecting Azure resources to each other, to other VNets (peering) or to an on-premises network.",
    "Controlling traffic with network security groups, route tables and private endpoints.",
  ],
  notFor: [
    "Spanning more than one region. A VNet lives in one region; connect regions with peering.",
    "Hosting resources that are fully managed and public by design, such as a plain storage account, unless you add a private endpoint or a service endpoint.",
  ],

  prerequisites: [
    {
      name: "An Azure subscription",
      why: "A VNet is created inside a subscription and counts against its network quotas.",
    },
    {
      name: "A resource group",
      slug: "resource-group",
      why: "Every resource needs a group to live in.",
    },
    {
      name: "A region",
      why: "A VNet exists in exactly one region, and the resources you attach must be in the same region.",
    },
    {
      name: "An address space that does not overlap",
      why: "Pick a private range such as 10.1.0.0/16. Ranges that overlap with a VNet you want to peer or connect later will block the connection.",
    },
    {
      name: "A subnet for your resources",
      slug: "subnet",
      why: "Resources attach to subnets, not to the VNet directly. The portal makes you define one subnet when you create the VNet, but a VNet does not have to have any subnets.",
      autoCreated: true,
    },
  ],

  example: {
    portal: [
      "Search for Virtual networks and select + Create.",
      "Select the Subscription and Resource group.",
      "Enter a Name, for example vnet-sea, and choose a Region.",
      "On IP addresses, set the address space to 10.1.0.0/16.",
      "Select the default subnet, change its Name to snet-web and its range to 10.1.1.0/24, then select Save.",
      "Select Review + create, then Create.",
    ],
    cli: `az network vnet create \\
  --resource-group rg-polaris-demo \\
  --name vnet-sea \\
  --location southeastasia \\
  --address-prefixes 10.1.0.0/16 \\
  --subnet-name snet-web \\
  --subnet-prefixes 10.1.1.0/24`,
    powershell: `$subnet = New-AzVirtualNetworkSubnetConfig \`
  -Name "snet-web" \`
  -AddressPrefix "10.1.1.0/24"

New-AzVirtualNetwork \`
  -ResourceGroupName "rg-polaris-demo" \`
  -Name "vnet-sea" \`
  -Location "southeastasia" \`
  -AddressPrefix "10.1.0.0/16" \`
  -Subnet $subnet`,
    bicep: `param location string = resourceGroup().location

resource vnet 'Microsoft.Network/virtualNetworks@2023-09-01' = {
  name: 'vnet-sea'
  location: location
  properties: {
    addressSpace: {
      addressPrefixes: [
        '10.1.0.0/16'
      ]
    }
  }
}

resource subnet 'Microsoft.Network/virtualNetworks/subnets@2023-09-01' = {
  parent: vnet
  name: 'snet-web'
  properties: {
    addressPrefix: '10.1.1.0/24'
  }
}`,
    arm: `{
  "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "location": { "type": "string", "defaultValue": "[resourceGroup().location]" }
  },
  "resources": [
    {
      "type": "Microsoft.Network/virtualNetworks",
      "apiVersion": "2023-09-01",
      "name": "vnet-sea",
      "location": "[parameters('location')]",
      "properties": {
        "addressSpace": { "addressPrefixes": [ "10.1.0.0/16" ] },
        "subnets": [
          {
            "name": "snet-web",
            "properties": { "addressPrefix": "10.1.1.0/24" }
          }
        ]
      }
    }
  ]
}`,
  },
  examNotes: [
    {
      exam: "az-104",
      points: [
    "A VNet belongs to one region and one subscription. It can span all availability zones in that region.",
    "Address spaces of VNets that you peer or join with a VPN must not overlap.",
    "Azure reserves 5 IP addresses in every subnet: the first four and the last one.",
    "By default, resources in different subnets of the same VNet can talk to each other. Use network security groups to filter that traffic.",
    "You can add address ranges to a VNet later. If the VNet is peered, sync the peering after every resize. The new range must not overlap a peered or on-premises network. Resizing is not supported when the peer is a classic VNet.",
    "In Bicep, Learn recommends defining subnets as child resources instead of inside the VNet resource. The ARM example lists them inline, which is what an exported template looks like.",
  ],
    },
  ],

  related: [
    "subnet",
    "vnet-peering",
    "network-watcher",
    "network-security-group",
    "private-dns-zone",
    "azure-bastion",
  ],
  docsUrl: "https://learn.microsoft.com/azure/virtual-network/quick-create-portal",
  simulator: {
    armType: "Microsoft.Network/virtualNetworks",
    apiVersion: "2023-09-01",
    nameRule: "virtual-network",
    provisioning: ["Failed", "Succeeded", "Canceled", "Creating", "Updating", "Deleting"],
    provisioningSource: "https://learn.microsoft.com/en-us/rest/api/virtualnetwork/virtual-networks/get",
  },
};
