import type { ResourceInput } from "../schema";

export const storageAccount: ResourceInput = {
  slug: "storage-account",
  name: "Storage Account",
  type: "Microsoft.Storage/storageAccounts",
  category: "storage",
  kind: "azure-resource",
  exams: ["az-104"],
  tier: 2,
  scope: "resource",
  icon: "Database",

  tagline: "One account that gives you blobs, files, queues and tables.",
  definition:
    "A storage account is the top-level namespace for Azure Storage. It gives you a globally unique account name that forms a separate endpoint for each service, and holds your data services: Blob containers, Azure Files shares, Queues and Tables. The account type and redundancy are set on the account and apply to everything inside.",
  analogy:
    "A storage account is a building with a unique street address. Blobs, file shares, queues and tables are the rooms inside.",
  whenToUse: [
    "Storing unstructured data such as images, backups and logs in Blob storage.",
    "Providing a managed SMB or NFS file share with Azure Files.",
    "Passing messages between application components with Queue storage, or keeping simple NoSQL key-value data in Table storage.",
  ],
  notFor: [
    "Relational data that needs queries and transactions. Use a database service.",
    "Managed disks for VMs. Those are separate resources, not data in your account.",
  ],

  prerequisites: [
    {
      name: "An Azure subscription",
      why: "Billing is per subscription. By default you can create up to 250 storage accounts per region in a subscription.",
    },
    {
      name: "A resource group",
      slug: "resource-group",
      why: "Every resource has to live in a group.",
    },
    {
      name: "A globally unique name",
      why: "3 to 24 characters, lowercase letters and digits only. The name becomes part of the public endpoint.",
    },
    {
      name: "A region",
      why: "The primary region for your data. GRS and GZRS also copy it to the paired secondary region, which cannot be changed. Redundancy options depend on region support.",
    },
    {
      name: "A performance tier and redundancy",
      why: "Standard or Premium. Standard general-purpose v2 supports LRS, ZRS, GRS, RA-GRS, GZRS and RA-GZRS. Premium accounts support only LRS or ZRS. This decides cost and durability.",
    },
  ],

  example: {
    portal: [
      "Search for Storage accounts and select Create.",
      "Select the Subscription and Resource group.",
      "Enter a globally unique Storage account name, for example stpolarisdemo001.",
      "Choose a Region, Performance (Standard) and Redundancy (LRS is the cheapest).",
      "On Security keep Require secure transfer for REST API operations on, and clear Allow enabling anonymous access on individual containers.",
      "Select Review + create, then Create.",
    ],
    cli: `az storage account create \\
  --name stpolarisdemo001 \\
  --resource-group rg-polaris-demo \\
  --location southeastasia \\
  --sku Standard_LRS \\
  --kind StorageV2 \\
  --min-tls-version TLS1_2 \\
  --allow-blob-public-access false`,
    powershell: `New-AzStorageAccount \`
  -ResourceGroupName "rg-polaris-demo" \`
  -Name "stpolarisdemo001" \`
  -Location "southeastasia" \`
  -SkuName "Standard_LRS" \`
  -Kind "StorageV2" \`
  -MinimumTlsVersion "TLS1_2" \`
  -AllowBlobPublicAccess $false`,
    bicep: `param storageName string = 'stpolarisdemo001'
param location string = resourceGroup().location

resource sa 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    supportsHttpsTrafficOnly: true
  }
}`,
    arm: `{
  "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "storageName": { "type": "string", "defaultValue": "stpolarisdemo001" },
    "location": { "type": "string", "defaultValue": "[resourceGroup().location]" }
  },
  "resources": [
    {
      "type": "Microsoft.Storage/storageAccounts",
      "apiVersion": "2023-05-01",
      "name": "[parameters('storageName')]",
      "location": "[parameters('location')]",
      "sku": { "name": "Standard_LRS" },
      "kind": "StorageV2",
      "properties": {
        "minimumTlsVersion": "TLS1_2",
        "allowBlobPublicAccess": false,
        "supportsHttpsTrafficOnly": true
      }
    }
  ]
}`,
  },
  examNotes: [
    {
      exam: "az-104",
      points: [
    "The account name is global: it must be unique across all of Azure, not just your subscription.",
    "ZRS copies data across availability zones in one region. GRS copies to a paired region. GZRS combines both.",
    "You can add or remove geo-redundancy in the portal, PowerShell or CLI. Adding or removing zone redundancy needs a conversion, which you can start yourself in most regions or request through support. Some account types need a manual migration.",
    "Access is controlled by Entra ID RBAC, shared access signatures (SAS) and account keys. Prefer Entra ID, use a user delegation SAS when you need SAS (blobs only), and avoid account keys.",
    "If you leave out --sku, az storage account create uses Standard_RAGRS, not LRS. The default kind is StorageV2.",
  ],
    },
  ],

  related: ["resource-group", "virtual-machine", "blob-container", "file-share", "service-endpoint", "private-endpoint"],
  docsUrl:
    "https://learn.microsoft.com/azure/storage/common/storage-account-create",

  simulator: {
    armType: "Microsoft.Storage/storageAccounts",
    apiVersion: "2023-05-01",
    nameRule: "storage-account",
    provisioning: ["Creating", "ResolvingDNS", "Succeeded"],
    provisioningSource: "https://learn.microsoft.com/en-us/rest/api/storagerp/storage-accounts/get-properties",
  },
};
