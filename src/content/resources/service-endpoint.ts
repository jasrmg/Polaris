import type { ResourceInput } from "../schema";

export const serviceEndpoint: ResourceInput = {
  slug: "service-endpoint",
  name: "Service Endpoint",
  type: "Subnet setting (serviceEndpoints)",
  category: "networking",
  scope: "resource",
  icon: "Plug",

  tagline: "Extends a subnet's identity to an Azure service so the service can allow only that subnet.",
  definition:
    "A virtual network service endpoint is a setting on a subnet for services such as Azure Storage, SQL Database or Key Vault. It extends your virtual network's identity to the service, and traffic from the subnet goes straight to the service over the Azure backbone. The service keeps its public IP address and its DNS name still resolves to that public IP, but it now sees the subnet's private address as the source. You then add a virtual network rule on the service, so only the subnets you list can connect. Microsoft recommends private endpoints for secure, private access to Azure services.",
  analogy:
    "A staff badge that works at a partner's front door. You still walk to the partner's public entrance, but the guard now recognises your badge and lets you in, and turns away everyone without one.",
  whenToUse: [
    "Restricting a storage account or database so that only certain subnets can reach it.",
    "A free, quick way to keep traffic from a subnet to a PaaS service on the Microsoft backbone.",
    "Limiting a subnet to specific storage accounts only. Add a service endpoint policy on the subnet (Azure Storage).",
  ],
  notFor: [
    "Access from on-premises networks. Service endpoints can't be used for on-premises traffic. By default the service is not reachable from on-premises; you would have to allow your public or NAT IP addresses in its IP firewall. A private endpoint is reachable from on-premises.",
    "Needing a private IP address for the service in your VNet. A service endpoint does not create one.",
  ],

  prerequisites: [
    {
      name: "A subnet",
      slug: "subnet",
      why: "The endpoint is enabled on a subnet, for a specific service such as Microsoft.Storage.",
    },
    {
      name: "A supported Azure service resource",
      slug: "storage-account",
      why: "For example a storage account. The service must support service endpoints.",
    },
    {
      name: "A virtual network rule on the service firewall",
      why: "Enabling the endpoint is not enough. Add the subnet as a virtual network rule on the service's firewall. For a storage account, also set the default action to Deny so other networks are blocked.",
    },
  ],

  example: {
    portal: [
      "Open the virtual network, select Subnets in Settings, then the subnet (snet-app).",
      "Under Service endpoints, set Services to Microsoft.Storage and select Save.",
      "Open the storage account, then Security + networking, then Networking.",
      "On the Firewalls and virtual networks tab, set Public network access to Enabled from selected virtual networks and IP addresses.",
      "Under Virtual networks, select + Add existing virtual network, pick vnet-sea and snet-app, then select Add.",
      "Select Save to save the networking configuration.",
    ],
    cli: `az network vnet subnet update \\
  --resource-group rg-polaris-demo \\
  --vnet-name vnet-sea \\
  --name snet-app \\
  --service-endpoints Microsoft.Storage

az storage account network-rule add \\
  --resource-group rg-polaris-demo \\
  --account-name stpolarisdemo001 \\
  --vnet-name vnet-sea \\
  --subnet snet-app

az storage account update \\
  --resource-group rg-polaris-demo \\
  --name stpolarisdemo001 \\
  --default-action Deny`,
    powershell: `$vnet = Get-AzVirtualNetwork \`
  -Name "vnet-sea" \`
  -ResourceGroupName "rg-polaris-demo"

Set-AzVirtualNetworkSubnetConfig \`
  -Name "snet-app" \`
  -VirtualNetwork $vnet \`
  -AddressPrefix "10.1.2.0/24" \`
  -ServiceEndpoint "Microsoft.Storage"

$vnet = $vnet | Set-AzVirtualNetwork

$subnet = Get-AzVirtualNetworkSubnetConfig \`
  -Name "snet-app" \`
  -VirtualNetwork $vnet

Add-AzStorageAccountNetworkRule \`
  -ResourceGroupName "rg-polaris-demo" \`
  -Name "stpolarisdemo001" \`
  -VirtualNetworkResourceId $subnet.Id

Update-AzStorageAccountNetworkRuleSet \`
  -ResourceGroupName "rg-polaris-demo" \`
  -Name "stpolarisdemo001" \`
  -DefaultAction Deny`,
    bicep: `param location string = resourceGroup().location

resource vnet 'Microsoft.Network/virtualNetworks@2023-09-01' existing = {
  name: 'vnet-sea'
}

resource subnet 'Microsoft.Network/virtualNetworks/subnets@2023-09-01' = {
  parent: vnet
  name: 'snet-app'
  properties: {
    addressPrefix: '10.1.2.0/24'
    serviceEndpoints: [
      {
        service: 'Microsoft.Storage'
      }
    ]
  }
}

resource st 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: 'stpolarisdemo001'
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    networkAcls: {
      defaultAction: 'Deny'
      virtualNetworkRules: [
        {
          id: subnet.id
          action: 'Allow'
        }
      ]
    }
  }
}`,
  },
  examNotes: [
    "A service endpoint is enabled per subnet and per service, for example Microsoft.Storage or Microsoft.Sql.",
    "You must also add a VNet rule on the service's firewall. The endpoint alone does not restrict anything.",
    "The service keeps its public IP address and DNS still resolves to it. Traffic takes the Azure backbone and the service sees the subnet's private address as the source.",
    "Service endpoints can't be used from on-premises. To allow on-premises, add the public or NAT IPs (for example ExpressRoute Microsoft peering NAT IPs) to the service's IP firewall. A private endpoint is reachable from on-premises over VPN or ExpressRoute.",
    "Service endpoints are free. Private endpoints are billed per hour and per GB processed.",
    "For Azure Storage, setting the firewall default action to Deny is what blocks everyone else.",
    "Storage has two endpoint types: Microsoft.Storage (storage accounts in the same region as the VNet, plus the paired region) and Microsoft.Storage.Global (accounts in any region). A subnet can have only one of them.",
    "Service endpoint policies filter traffic from the subnet to specific storage accounts. They apply to Azure Storage and not to on-premises traffic.",
    "Enabling or removing an endpoint switches the source IP from public to private. Existing connections close and old firewall rules based on public IPs stop working.",
  ],

  related: ["subnet", "storage-account", "private-endpoint"],
  docsUrl:
    "https://learn.microsoft.com/azure/virtual-network/virtual-network-service-endpoints-overview",
};
