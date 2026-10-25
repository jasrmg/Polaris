import type { ResourceInput } from "../schema";

export const azureBastion: ResourceInput = {
  slug: "azure-bastion",
  name: "Azure Bastion",
  type: "Microsoft.Network/bastionHosts",
  category: "networking",
  scope: "resource",
  icon: "Terminal",

  tagline: "RDP and SSH into VMs from the portal, with no public IP on the VM.",
  definition:
    "Azure Bastion is a managed service you deploy into a virtual network. It lets you open an RDP or SSH session to your VMs over TLS from the Azure portal (or a native client on higher SKUs). The VMs only need private IP addresses, so you do not have to expose ports 3389 or 22 to the internet or put a public IP on every VM.",
  analogy:
    "A guarded reception desk. Visitors check in at the desk with their credentials, and the desk walks them to the room. The rooms themselves have no door onto the street.",
  whenToUse: [
    "Administering VMs securely without public IP addresses or open RDP and SSH ports.",
    "Giving admins browser-based access without a VPN or a jump box VM to patch.",
    "Reaching VMs in peered virtual networks from a single Bastion host.",
  ],
  notFor: [
    "Application traffic for end users. Use a load balancer or other front end.",
    "Occasional use on a tight budget with many VNets. A Bastion host is billed by the hour while it exists, so delete it when it is not needed.",
  ],

  prerequisites: [
    {
      name: "A virtual network",
      slug: "virtual-network",
      why: "Bastion is deployed into a VNet and can reach VMs in that VNet and in peered VNets.",
    },
    {
      name: "A subnet named AzureBastionSubnet",
      slug: "subnet",
      why: "The name must be exact, and the subnet must be /26 or larger. It must be in the same VNet and resource group as the Bastion host and cannot hold other resources. The free Developer SKU does not need it.",
    },
    {
      name: "A Standard, static public IP address",
      slug: "public-ip-address",
      why: "Bastion uses it as its own entry point. The SKU must be Standard and the allocation Static. The target VMs do not need a public IP. Developer and private-only deployments do not need one either.",
    },
    {
      name: "A target VM that allows RDP or SSH from the Bastion subnet",
      slug: "virtual-machine",
      why: "Bastion connects over the private network, so an NSG on the VM's subnet must allow port 3389 (RDP) or 22 (SSH) from the AzureBastionSubnet. You also need the Reader role on the VM and its network interface.",
    },
  ],

  example: {
    portal: [
      "Open the virtual network (vnet-sea), then select Connect, then Bastion.",
      "To choose your own settings, select Configure manually. (Deploy Bastion instead uses default settings with the Standard SKU.)",
      "Enter the Name (bas-sea) and Region, and choose the Tier (SKU), for example Standard.",
      "Select the virtual network. If AzureBastionSubnet is missing, select Edit subnet, set the purpose to Azure Bastion, and use a /26 or larger range such as 10.1.255.0/26.",
      "Under Public IPv4 address, select Create new and enter a name such as pip-bastion.",
      "Select Review + Create, then Create. Deployment takes about 10 minutes.",
      "Open a VM, select Connect, then Bastion, and enter the username and password or SSH key.",
    ],
    cli: `az network vnet subnet create \\
  --resource-group rg-polaris-demo \\
  --vnet-name vnet-sea \\
  --name AzureBastionSubnet \\
  --address-prefixes 10.1.255.0/26

az network public-ip create \\
  --resource-group rg-polaris-demo \\
  --name pip-bastion \\
  --sku Standard \\
  --allocation-method Static

az network bastion create \\
  --resource-group rg-polaris-demo \\
  --name bas-sea \\
  --vnet-name vnet-sea \\
  --public-ip-address pip-bastion \\
  --location southeastasia \\
  --sku Standard`,
    powershell: `$vnet = Get-AzVirtualNetwork \`
  -Name "vnet-sea" \`
  -ResourceGroupName "rg-polaris-demo"

Add-AzVirtualNetworkSubnetConfig \`
  -Name "AzureBastionSubnet" \`
  -VirtualNetwork $vnet \`
  -AddressPrefix "10.1.255.0/26"

$vnet | Set-AzVirtualNetwork

New-AzPublicIpAddress \`
  -ResourceGroupName "rg-polaris-demo" \`
  -Name "pip-bastion" \`
  -Location "southeastasia" \`
  -Sku Standard \`
  -AllocationMethod Static

New-AzBastion \`
  -ResourceGroupName "rg-polaris-demo" \`
  -Name "bas-sea" \`
  -PublicIpAddressRgName "rg-polaris-demo" \`
  -PublicIpAddressName "pip-bastion" \`
  -VirtualNetworkRgName "rg-polaris-demo" \`
  -VirtualNetworkName "vnet-sea" \`
  -Sku "Standard"`,
    bicep: `param location string = resourceGroup().location

resource vnet 'Microsoft.Network/virtualNetworks@2023-09-01' existing = {
  name: 'vnet-sea'
}

resource bastionSubnet 'Microsoft.Network/virtualNetworks/subnets@2023-09-01' = {
  parent: vnet
  name: 'AzureBastionSubnet'
  properties: {
    addressPrefix: '10.1.255.0/26'
  }
}

resource pip 'Microsoft.Network/publicIPAddresses@2023-09-01' = {
  name: 'pip-bastion'
  location: location
  sku: {
    name: 'Standard'
  }
  properties: {
    publicIPAllocationMethod: 'Static'
  }
}

resource bastion 'Microsoft.Network/bastionHosts@2023-09-01' = {
  name: 'bas-sea'
  location: location
  sku: {
    name: 'Standard'
  }
  properties: {
    ipConfigurations: [
      {
        name: 'ipconfig'
        properties: {
          subnet: {
            id: bastionSubnet.id
          }
          publicIPAddress: {
            id: pip.id
          }
        }
      }
    ]
  }
}`,
  },
  examNotes: [
    "The subnet must be named exactly AzureBastionSubnet and be /26 or larger. Every SKU except Developer needs it.",
    "The Bastion public IP must be Standard SKU and Static. The target VMs need no public IP.",
    "Bastion connects over TLS on port 443 from the browser. The VM's subnet NSG must allow RDP (3389) or SSH (22) from the AzureBastionSubnet, not from the internet.",
    "One Bastion host can serve VMs in its own VNet and in peered VNets.",
    "Four SKUs. Developer: free, shared infrastructure, one VM at a time, select regions, no dedicated subnet. Basic: dedicated, fixed at two instances. Standard: adds host scaling, native client, shareable links, IP-based connection, custom ports and file transfer. Premium: adds session recording and private-only deployment.",
    "Browser-based connection works on every SKU. The native SSH or RDP client needs Standard or Premium.",
    "If you put an NSG on AzureBastionSubnet you must create all the required rules: inbound 443 from Internet, 443 from GatewayManager, 443 from AzureLoadBalancer and 8080/5701 within VirtualNetwork; outbound 22/3389 to VirtualNetwork, 443 to AzureCloud, 8080/5701 within VirtualNetwork and 80 to Internet.",
    "Billing starts when Bastion is deployed, whatever the usage. Delete the host after a test.",
  ],

  related: ["virtual-network", "public-ip-address", "virtual-machine"],
  docsUrl: "https://learn.microsoft.com/azure/bastion/bastion-overview",
};
