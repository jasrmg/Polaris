import type { ResourceInput } from "../schema";

export const lock: ResourceInput = {
  slug: "lock",
  name: "Resource lock",
  type: "Microsoft.Authorization/locks",
  kind: "azure-resource",
  category: "management-governance",
  scope: "resource",
  tier: 3,
  exams: ["az-104"],
  icon: "Lock",

  tagline: "Stops an authorized user from deleting or changing a resource.",
  definition:
    "A management lock protects a subscription, resource group, or resource from accidental change. You cannot add a lock to a management group. In the portal the levels are Delete and Read-only. In the command line they are CanNotDelete and ReadOnly. CanNotDelete lets authorized users read and modify a resource, but not delete it. ReadOnly lets them read it, but not delete or update it. A lock at a parent scope applies to everything inside it, including resources you add later. The most restrictive lock in the chain wins. Locks apply to control-plane operations, not to data-plane operations such as writing rows in a database. Creating or deleting a lock needs Microsoft.Authorization/locks/* or Microsoft.Authorization/*. Owner and User Access Administrator have that access.",
  analogy: "A padlock on a filing cabinet. The key to the office still does not open the cabinet.",
  whenToUse: [
    "Stopping someone with delete permission from removing a production resource group.",
    "Freezing a resource so it can be read but not reconfigured.",
  ],
  notFor: [
    "Hiding data inside the resource. A ReadOnly lock on a database server does not stop queries against the data.",
    "Locking a management group. Locks start at the subscription.",
  ],

  prerequisites: [
    {
      name: "Microsoft.Authorization/locks/*",
      why: "Owner and User Access Administrator can create and delete locks. A custom role needs the same actions.",
      slug: "role-definition",
    },
  ],

  example: {
    portal: [
      "Open the resource, resource group, or subscription.",
      "In Settings, select Locks. On a subscription the blade is named Resource locks.",
      "Select Add.",
      "Enter a lock name and a lock level: Delete or Read-only. Notes are optional.",
      "To remove it, select Delete on the lock.",
    ],
  },

  examNotes: [
    {
      exam: "az-104",
      points: [
        "Locks are inherited, and the most restrictive lock wins. A parent Read-only lock overrides a child's Delete lock.",
        "The portal says Delete and Read-only. The API says CanNotDelete and ReadOnly.",
        "A lock overrides the caller's permissions for control-plane operations. It does not apply to data-plane operations.",
      ],
    },
  ],

  related: ["resource-group", "subscription", "role-definition"],
  docsUrl: "https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/lock-resources",
};
