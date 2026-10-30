import type { ResourceInput } from "../schema";

export const roleDefinition: ResourceInput = {
  slug: "role-definition",
  name: "Role definition",
  type: "Microsoft.Authorization/roleDefinitions",
  kind: "azure-resource",
  category: "identity-access",
  scope: "tenant",
  tier: 3,
  exams: ["az-104"],
  icon: "Shield",

  tagline: "The list of actions a role allows, and the ones it leaves out.",
  definition:
    "A role definition is a collection of permissions. It lists the control plane actions that can be performed, such as read, write and delete, the control plane actions excluded from those allowed actions, and the data plane actions that apply to data inside a resource. Built-in roles have the same role ID across clouds. The role ID does not change when the role is renamed, and Learn says to use the role ID in scripts. Role definitions are not stored in a region.",
  analogy:
    "A role definition is the job description. It says what the job is allowed to do. It does not, by itself, give that job to anyone.",
  whenToUse: [
    "Reading what a built-in role allows before you assign it.",
    "Creating a custom role when no built-in role matches the actions you need.",
  ],
  notFor: [
    "Granting access to a person. That is a role assignment, which points at a role definition, a principal and a scope.",
    "Microsoft Entra directory roles. Those manage directory objects such as users and groups, not Azure resources.",
  ],

  prerequisites: [],

  example: {
    portal: [
      "Open the scope you care about, such as a subscription or resource group, and select Access control (IAM).",
      "Open the Role assignments tab, then Add, then Add role assignment.",
      "On the Role tab, select a job function role or a privileged administrator role. In the Details column, select View to read that role's actions.",
    ],
  },

  examNotes: [
    {
      exam: "az-104",
      points: [
        "Actions and NotActions are control plane. DataActions and NotDataActions are data plane. A wildcard in Actions does not grant data actions.",
        "NotActions excludes actions from the allowed list inside that role. It is not a deny. Another role can still grant the excluded action.",
      ],
    },
  ],

  related: ["role-assignment", "custom-role", "user"],
  docsUrl: "https://learn.microsoft.com/en-us/azure/role-based-access-control/role-definitions",
};
