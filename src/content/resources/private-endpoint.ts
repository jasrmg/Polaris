import type { ResourceInput } from "../schema";

export const privateEndpoint: ResourceInput = {
  slug: "private-endpoint",
  name: "Private Endpoint",
  type: "Microsoft.Network/privateEndpoints",
  category: "networking",
  kind: "azure-resource",
  exams: ["az-104"],
  tier: 1,
  scope: "resource",
  icon: "Cable",

  tagline: "Gives an Azure service a private IP address inside your subnet.",
  definition:
    "A private endpoint is a network interface that uses a private IP address from your subnet to connect you privately to a service powered by Azure Private Link, such as one storage account or one SQL server. It is reachable from the same VNet, peered VNets and on-premises networks over VPN or ExpressRoute, and traffic stays on the Microsoft backbone. Creating a private endpoint does not block the service's public endpoint. To do that, turn off public network access or use the service's firewall.",
  analogy:
    "A private door installed inside your own building that opens straight into the partner's office. No one walks outside, and it works from any floor, including other offices you are connected to.",
  whenToUse: [
    "Making a storage account or database reachable only from private networks.",
    "Letting on-premises users reach a PaaS service over a VPN or ExpressRoute without using its public IP.",
    "Meeting rules that require private connectivity to a PaaS service, with traffic kept off the public internet.",
  ],
  notFor: [
    "A free, quick subnet-only restriction. A service endpoint costs nothing.",
    "Hosting your own service for others to connect to. That is a Private Link service.",
  ],

  prerequisites: [
    {
      name: "A subnet for the endpoint",
      slug: "subnet",
      why: "The endpoint's network interface takes a private IP address from this subnet. The endpoint must be in the same region and subscription as the VNet, but the service it connects to can be in another region. To make NSGs or route tables apply to the endpoint, enable network policies on the subnet. It is a subnet setting that covers every private endpoint in it.",
    },
    {
      name: "The target resource and sub-resource",
      slug: "storage-account",
      why: "For example a storage account (general-purpose v2) with the blob sub-resource. Azure Storage needs a separate private endpoint for each sub-resource, so blob and file need separate endpoints.",
    },
    {
      name: "A private DNS zone linked to the VNet",
      slug: "private-dns-zone",
      why: "Name resolution must return the private IP. Storage blob uses privatelink.blob.core.windows.net. Without it (or equivalent DNS you manage yourself), the name resolves to the public IP.",
    },
    {
      name: "A DNS zone group on the endpoint",
      why: "Registers the endpoint's private IP in the zone automatically. The portal creates the private DNS zone and records for you when you keep the default DNS settings.",
      autoCreated: true,
    },
  ],

  example: {
    portal: [
      "In the portal search box, enter Private endpoint and select Private endpoints, then + Create.",
      "On Basics, choose the Subscription and Resource group, enter a Name such as pe-st-blob, and select the Region (the same region as the VNet).",
      "Select Next: Resource. Set Resource type to Microsoft.Storage/storageAccounts, pick the storage account as Resource, and set Target subresource to blob.",
      "Select Next: Virtual Network. Pick vnet-sea and snet-app. Optionally use Network policy for private endpoints to enable NSGs and route tables.",
      "Select Next: DNS and leave the defaults. This creates privatelink.blob.core.windows.net and links it to the VNet.",
      "Select Next: Tags, then Next: Review + create, then Create.",
      "Optional: open the storage account, then Security + networking, then Networking, and on the Firewalls and virtual networks tab set Public network access to Disabled, then Save.",
    ],
    cli: `STORAGE_ID=$(az storage account show \\
  --name stpolarisdemo001 \\
  --resource-group rg-polaris-demo \\
  --query id \\
  --output tsv)

az network private-endpoint create \\
  --resource-group rg-polaris-demo \\
  --name pe-st-blob \\
  --vnet-name vnet-sea \\
  --subnet snet-app \\
  --private-connection-resource-id $STORAGE_ID \\
  --group-id blob \\
  --connection-name conn-st-blob

az network private-dns zone create \\
  --resource-group rg-polaris-demo \\
  --name privatelink.blob.core.windows.net

az network private-dns link vnet create \\
  --resource-group rg-polaris-demo \\
  --zone-name privatelink.blob.core.windows.net \\
  --name link-vnet-sea \\
  --virtual-network vnet-sea \\
  --registration-enabled false

# --private-dns-zone is the zone (name or ID). --zone-name is a label for
# this zone config inside the group, as in the Learn quickstart.
az network private-endpoint dns-zone-group create \\
  --resource-group rg-polaris-demo \\
  --endpoint-name pe-st-blob \\
  --name default \\
  --private-dns-zone privatelink.blob.core.windows.net \\
  --zone-name blob`,
    powershell: `# DNS is separate: also create a private DNS zone
# (privatelink.blob.core.windows.net) and link it to the VNet.
# Otherwise the storage name still resolves to its public IP.
$st = Get-AzStorageAccount \`
  -ResourceGroupName "rg-polaris-demo" \`
  -Name "stpolarisdemo001"

$connection = New-AzPrivateLinkServiceConnection \`
  -Name "conn-st-blob" \`
  -PrivateLinkServiceId $st.Id \`
  -GroupId "blob"

$vnet = Get-AzVirtualNetwork \`
  -Name "vnet-sea" \`
  -ResourceGroupName "rg-polaris-demo"

$subnet = $vnet.Subnets | Where-Object { $_.Name -eq "snet-app" }

# -Location must be the VNet's region.
New-AzPrivateEndpoint \`
  -ResourceGroupName "rg-polaris-demo" \`
  -Name "pe-st-blob" \`
  -Location "southeastasia" \`
  -Subnet $subnet \`
  -PrivateLinkServiceConnection $connection`,
    bicep: `param location string = resourceGroup().location

resource st 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: 'stpolarisdemo001'
}

resource vnet 'Microsoft.Network/virtualNetworks@2023-09-01' existing = {
  name: 'vnet-sea'
}

resource subnet 'Microsoft.Network/virtualNetworks/subnets@2023-09-01' existing = {
  parent: vnet
  name: 'snet-app'
}

resource zone 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: 'privatelink.blob.core.windows.net'
  location: 'global'
}

resource vnetLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: zone
  name: 'link-vnet-sea'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: vnet.id
    }
  }
}

resource pe 'Microsoft.Network/privateEndpoints@2023-09-01' = {
  name: 'pe-st-blob'
  location: location
  properties: {
    subnet: {
      id: subnet.id
    }
    privateLinkServiceConnections: [
      {
        name: 'conn-st-blob'
        properties: {
          privateLinkServiceId: st.id
          groupIds: [
            'blob'
          ]
        }
      }
    ]
  }
}

resource dnsGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-09-01' = {
  parent: pe
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'blob'
        properties: {
          privateDnsZoneId: zone.id
        }
      }
    ]
  }
}`,
  },
  examNotes: [
    {
      exam: "az-104",
      points: [
    "A private endpoint is a NIC with a private IP from your subnet, connected to one sub-resource of one service (for example blob, not the whole storage account).",
    "DNS is the usual failure. The privatelink zone, such as privatelink.blob.core.windows.net, must be linked to the VNet or the name still resolves to the public IP.",
    "Private endpoints work from on-premises over VPN or ExpressRoute. Service endpoints do not.",
    "Service endpoint: free, subnet identity, service keeps its public IP. Private endpoint: billed per hour plus per GB processed, private IP in your VNet. A private endpoint does not turn off public access by itself.",
    "For Azure Storage, each sub-resource needs its own endpoint, for example blob and file on the same storage account. The group ID for blob is blob.",
    "The private endpoint must be in the same region and subscription as the VNet. The service it connects to can be in a different region.",
    "Connections are approved automatically if you have permission on the target resource. Otherwise the connection is Pending until the resource owner approves it. Only Approved connections carry traffic.",
    "NSGs and user-defined routes apply to private endpoints only when network policies are enabled on the subnet. The setting covers every private endpoint in the subnet.",
    "On the CLI, dns-zone-group create takes the zone in --private-dns-zone and a label for the zone config in --zone-name.",
  ],
    },
  ],

  related: ["subnet", "private-dns-zone", "service-endpoint", "storage-account"],
  docsUrl: "https://learn.microsoft.com/azure/private-link/private-endpoint-overview",
  simulator: {
    armType: "Microsoft.Network/privateEndpoints",
    apiVersion: "2023-09-01",
    nameRule: "private-endpoint",
  },
};
