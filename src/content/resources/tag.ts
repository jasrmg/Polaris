import type { ResourceInput } from "../schema";

export const tag: ResourceInput = {
  slug: "tag",
  name: "Tag",
  type: "Tag",
  kind: "concept",
  category: "management-governance",
  scope: "resource",
  tier: 3,
  exams: ["az-104"],
  icon: "Tags",

  tagline: "A key and value you attach so you can find and group resources.",
  definition:
    "A tag is a metadata key-value pair on an Azure resource, resource group, or subscription. Management groups cannot be tagged. A resource does not inherit tags from its resource group or subscription. Each resource, resource group, and subscription can have 50 tags. A tag name can be 512 characters and a value 256, except a storage account tag name, which can be 128. Tag names cannot contain <, >, %, &, \\, ?, or /. Tag names are case-insensitive for operations. Tag values are case-sensitive. Tags are stored as plain text, so they are not a place for secrets.",
  analogy: "A sticky note on a box: the note names the box, it does not change what is inside.",
  whenToUse: [
    "Labelling resources by environment, owner, or cost center so Cost Management can group the bill.",
    "Finding every resource with the same tag from the portal's Tags view.",
  ],
  notFor: [
    "Secrets, connection strings, or anything you would not want in a cost report.",
    "Expecting a resource to pick up the tags on its resource group. It does not, unless a policy copies them.",
  ],

  prerequisites: [
    {
      name: "Write access to the resource, or Microsoft.Resources/tags",
      why: "Contributor can tag a resource it can write. Tag Contributor can tag through PowerShell and the REST API. In the portal, Tag Contributor can tag subscriptions, not resources or resource groups.",
    },
  ],

  example: {
    portal: [
      "Open the resource or resource group. Existing tags are on the overview. If none were applied, the list is empty.",
      "Select Add tags.",
      "Enter a name and a value. Add more rows if you need them.",
      "Select Save. The tags appear on the overview.",
      "To see every resource with one tag, search for tags, then select the tag.",
    ],
  },

  examNotes: [
    {
      exam: "az-104",
      points: [
        "Tags are not inherited. A policy such as Inherit a tag from the resource group is what copies a group tag onto resources.",
        "The limit is 50 name-value pairs. The name limit is 512 characters and the value limit is 256, with a 128-character name limit on storage accounts.",
        "Tag names are case-insensitive. Tag values are case-sensitive.",
      ],
    },
  ],

  related: ["resource-group", "subscription", "policy-assignment"],
  docsUrl: "https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/tag-resources",
};
