import { regionIds } from "../regions";
import type { ResourceInput } from "../schema";

export const storageAccount: ResourceInput = {
  slug: "storage-account",
  name: "Storage Account",
  type: "Microsoft.Storage/storageAccounts",
  category: "storage",
  scope: "resource",
  icon: "Database",

  tagline: "One account that gives you blobs, files, queues and tables.",
  definition:
    "A storage account is the top-level namespace for Azure Storage. It gives you a globally unique endpoint and holds your data services: Blob containers, Azure Files shares, Queues and Tables. Performance tier, redundancy and access settings are chosen on the account and apply to everything inside.",
  analogy:
    "A storage account is a building with a unique street address. Blobs, file shares, queues and tables are the rooms inside.",
  whenToUse: [
    "Storing unstructured data such as images, backups and logs in Blob storage.",
    "Providing a managed SMB or NFS file share with Azure Files.",
    "Holding VM diagnostics, boot diagnostics or deployment artifacts.",
  ],
  notFor: [
    "Relational data that needs queries and transactions. Use a database service.",
    "Managed disks for VMs. Those are separate resources, not data in your account.",
  ],

  prerequisites: [
    {
      name: "An Azure subscription",
      why: "Billing and quota are tracked at the subscription level.",
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
      why: "Where your data physically lives. Redundancy options depend on region support.",
    },
    {
      name: "A performance tier and redundancy",
      why: "Standard or Premium, then LRS, ZRS, GRS, RA-GRS, GZRS or RA-GZRS. This decides cost and durability.",
    },
  ],

  example: {
    portal: [
      "Search for Storage accounts and select Create.",
      "Select the Subscription and Resource group.",
      "Enter a globally unique Storage account name, for example stpolarisdemo001.",
      "Choose a Region, Performance (Standard) and Redundancy (LRS is the cheapest).",
      "On Advanced keep Require secure transfer on and Allow Blob anonymous access off.",
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
    "The account name is global: it must be unique across all of Azure, not just your subscription.",
    "ZRS copies data across availability zones in one region. GRS copies to a paired region. GZRS combines both.",
    "Changing redundancy later is possible for most paths, but some conversions need a live migration request.",
    "Access is controlled by Entra ID RBAC, shared access signatures (SAS) and account keys. Prefer RBAC and SAS over keys.",
  ],

  related: ["resource-group", "virtual-machine"],
  docsUrl:
    "https://learn.microsoft.com/azure/storage/common/storage-account-create",

  simulator: [
    { key: "name", label: "Storage account name", type: "text", required: true, default: "stpolarisdemo001", help: "3-24 characters, lowercase letters and digits only." },
    { key: "region", label: "Region", type: "select", required: true, default: "southeastasia", options: regionIds },
    { key: "redundancy", label: "Redundancy", type: "select", required: true, default: "Standard_LRS", options: ["Standard_LRS", "Standard_ZRS", "Standard_GRS", "Standard_GZRS"] },
  ],
};
