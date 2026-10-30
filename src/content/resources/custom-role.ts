import type { ResourceInput } from "../schema";

export const customRole: ResourceInput = {
  slug: "custom-role",
  name: "Custom role",
  type: "Microsoft.Authorization/roleDefinitions",
  kind: "azure-resource",
  category: "identity-access",
  scope: "subscription",
  tier: 3,
  exams: ["az-104"],
  icon: "ShieldCheck",

  tagline: "A role you write when no built-in role fits.",
  definition:
    "A custom role is a role definition you create, with roleType CustomRole. It needs a name, an id, a description, at least one action, and assignable scopes. Assignable scopes can be a management group, a subscription or a resource group. They cannot be the root scope /, and an action string can contain only one wildcard. A tenant can have 5,000 custom roles. Creating, updating or deleting one needs Microsoft.Authorization/roleDefinitions/write or delete on all of the role's assignable scopes. You cannot delete a custom role while a role assignment still uses it.",
  analogy:
    "A custom role is a job description you write yourself, instead of picking one from the company handbook.",
  whenToUse: [
    "A built-in role allows more than you want, and you need a shorter list of actions.",
    "You want to clone a built-in role and add or remove a few permissions.",
  ],
  notFor: [
    "Replacing Owner or Contributor when one of those already matches. Learn says to start with the most restrictive built-in role.",
    "A deny. NotActions only removes actions from that role's allow list. It does not block an action that another role grants.",
  ],

  prerequisites: [
    {
      name: "roleDefinitions/write on every assignable scope",
      why: "Learn says creating or updating a custom role needs Microsoft.Authorization/roleDefinitions/write on all of the role's assignable scopes.",
      slug: "role-definition",
    },
  ],

  example: {
    portal: [
      "Decide which permissions you need. Learn suggests starting from an existing built-in role.",
      "Open a management group, subscription or resource group where the custom role should be assignable, then open Access control (IAM).",
      "Start by cloning an existing role, from scratch, or from a JSON file. Cloning is the easiest when an existing role is close.",
    ],
  },

  examNotes: [
    {
      exam: "az-104",
      points: [
        "AssignableScopes cannot be /. A custom role can name at most one management group.",
        "A custom role with DataActions cannot be assigned at management group scope.",
      ],
    },
  ],

  related: ["role-definition", "role-assignment"],
  docsUrl: "https://learn.microsoft.com/en-us/azure/role-based-access-control/custom-roles",
};
