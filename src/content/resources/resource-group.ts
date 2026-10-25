import { regionIds } from "../regions";
import type { ResourceInput } from "../schema";

export const resourceGroup: ResourceInput = {
  slug: "resource-group",
  name: "Resource Group",
  type: "Microsoft.Resources/resourceGroups",
  category: "identity-governance",
  scope: "resource-group",
  icon: "FolderOpen",

  tagline: "A folder-like container that holds related Azure resources.",
  definition:
    "A resource group is a logical container for Azure resources that share the same lifecycle: you deploy, update, secure and delete them together. Every resource must live in exactly one resource group. The group stores metadata about its resources in a region you choose, but the resources inside can be in other regions.",
  analogy:
    "Think of a project folder on your computer. Delete the folder and everything inside goes with it.",
  whenToUse: [
    "Grouping everything for one app or environment (for example dev, test, prod) so you can delete it in one step.",
    "Applying access (RBAC), policy or a budget once and having it flow down to every resource inside.",
    "Tracking cost per project by grouping resources and tagging them.",
  ],
  notFor: [
    "Nesting: resource groups cannot contain other resource groups.",
    "Holding resources that have different lifecycles, such as a shared network used by many apps. Give those their own group.",
  ],

  prerequisites: [
    {
      name: "An Azure subscription",
      why: "A resource group is created inside a subscription, which is also where the bill lands.",
    },
    {
      name: "A name that is unique within the subscription",
      why: "Up to 90 characters: letters, digits, underscores, hyphens, periods and parentheses. It cannot end with a period.",
    },
    {
      name: "A location (region)",
      why: "Where the group's metadata is stored. It does not force the resources inside to use the same region.",
    },
  ],

  example: {
    portal: [
      "Search for Resource groups and select Create.",
      "Pick the Subscription.",
      "Enter a Resource group name, for example rg-polaris-demo.",
      "Choose a Region.",
      "On the Tags tab add tags such as env=dev and owner=you.",
      "Select Review + create, then Create.",
    ],
    cli: `az group create \\
  --name rg-polaris-demo \\
  --location southeastasia \\
  --tags env=dev owner=you`,
    powershell: `New-AzResourceGroup \`
  -Name "rg-polaris-demo" \`
  -Location "southeastasia" \`
  -Tag @{ env = "dev"; owner = "you" }`,
    bicep: `targetScope = 'subscription'

param rgName string = 'rg-polaris-demo'
param location string = 'southeastasia'

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: rgName
  location: location
  tags: {
    env: 'dev'
    owner: 'you'
  }
}`,
    arm: `{
  "$schema": "https://schema.management.azure.com/schemas/2018-05-01/subscriptionDeploymentTemplate.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "rgName": { "type": "string", "defaultValue": "rg-polaris-demo" },
    "location": { "type": "string", "defaultValue": "southeastasia" }
  },
  "resources": [
    {
      "type": "Microsoft.Resources/resourceGroups",
      "apiVersion": "2024-03-01",
      "name": "[parameters('rgName')]",
      "location": "[parameters('location')]",
      "tags": { "env": "dev", "owner": "you" }
    }
  ]
}`,
  },
  examNotes: [
    "Deploying a resource group from Bicep or ARM is a subscription-scope deployment: use az deployment sub create, not az deployment group create.",
    "Tags on a resource group are not inherited by its resources unless you assign an Azure Policy such as Inherit a tag from the resource group.",
    "Moving a resource to another group changes its group but not its location.",
    "A resource lock (CanNotDelete or ReadOnly) on a group applies to every resource inside it.",
  ],

  related: ["virtual-machine", "storage-account"],
  docsUrl:
    "https://learn.microsoft.com/azure/azure-resource-manager/management/manage-resource-groups-portal",

  simulator: [
    { key: "name", label: "Resource group name", type: "text", required: true, default: "rg-polaris-demo" },
    {
      key: "region",
      label: "Region",
      type: "select",
      required: true,
      default: "southeastasia",
      options: regionIds,
    },
  ],
};
