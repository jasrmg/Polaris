import type { ResourceInput } from "../schema";

export const managementGroup: ResourceInput = {
  slug: "management-group",
  name: "Management group",
  type: "Microsoft.Management/managementGroups",
  kind: "azure-resource",
  category: "management-governance",
  scope: "management-group",
  tier: 3,
  exams: ["az-104"],
  icon: "Layers",

  tagline: "A folder of subscriptions that policy and access flow down through.",
  definition:
    "Management groups organise subscriptions into one tree per directory so you can apply policy and Azure role assignments once and have them inherit to everything below. A directory can hold 10,000 management groups. The tree can be six levels deep, and that limit does not include the root level or the subscription level. Each management group and each subscription has only one parent, and a management group can have many children. The root management group's display name is Tenant root group by default, its ID is the Microsoft Entra tenant ID, and it cannot be moved or deleted.",
  analogy:
    "A management group is a folder of subscriptions. A rule you stick on the folder applies to every subscription inside it, and to the folders inside those.",
  whenToUse: [
    "Applying one policy, such as a limit on where virtual machines can be created, to many subscriptions.",
    "Granting access to several subscriptions with one role assignment on the group, instead of one assignment per subscription.",
  ],
  notFor: [
    "Holding virtual machines or other resources directly. A management group holds subscriptions and other management groups.",
    "Billing by itself. A management group is a governance scope. The subscription is where usage is billed.",
  ],

  prerequisites: [
    {
      name: "A Microsoft Entra tenant",
      why: "All subscriptions and management groups in the tree belong to one directory. The root group's ID is that tenant's ID.",
      slug: "tenant",
    },
    {
      name: "A management group ID that is unique in the directory",
      why: "1 to 90 characters: letters, digits, hyphens, underscores, periods and parentheses. It must start with a letter or number and cannot end with a period. The ID cannot be changed after you create the group. The display name is optional and can be changed.",
    },
  ],

  example: {
    portal: [
      "In the Azure portal, select All services, then Management + governance, then Management groups.",
      "Select Add management group.",
      "Leave Create new selected.",
      "Enter a management group ID. This ID is how commands refer to the group, and it cannot be edited later.",
      "Optionally enter a display name. You can change the display name later.",
      "Select Save.",
    ],
    cli: `az account management-group create \\
  --name mg-production \\
  --display-name "Production" \\
  --parent "<parent-id>"`,
  },

  examNotes: [
    {
      exam: "az-104",
      points: [
        "Policy and role assignments on a management group inherit to the subscriptions and groups below it.",
        "The root management group cannot be moved or deleted. Its default display name is Tenant root group and its ID is the tenant ID.",
        "No one has access to the root management group by default. A Global Administrator can elevate their own access.",
        "A new subscription lands in the root management group unless you place it somewhere else.",
      ],
    },
  ],

  related: ["tenant", "subscription", "resource-group"],
  docsUrl: "https://learn.microsoft.com/en-us/azure/governance/management-groups/overview",
};
