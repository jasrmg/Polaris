import type { ResourceInput } from "../schema";

export const roleAssignment: ResourceInput = {
  slug: "role-assignment",
  name: "Role assignment",
  type: "Microsoft.Authorization/roleAssignments",
  kind: "azure-resource",
  category: "identity-access",
  scope: "subscription",
  tier: 3,
  exams: ["az-104"],
  icon: "KeyRound",

  tagline: "Attaches a role to a person, group or app at a scope.",
  definition:
    "A role assignment grants a security principal the permissions in a role definition at a scope. The principal can be a user, a group, a service principal or a managed identity. The scope can be a management group, a subscription, a resource group or a resource. Lower levels inherit role permissions from higher levels. Assigning a role needs Microsoft.Authorization/roleAssignments/write, for example Role Based Access Control Administrator or User Access Administrator, at that scope. Removing one needs Microsoft.Authorization/roleAssignments/delete. Role assignments are stored globally, not in a region.",
  analogy:
    "A role assignment is pinning the job description on someone's badge, and deciding which floor the badge opens.",
  whenToUse: [
    "Giving a person or a group access to a subscription, resource group or one resource.",
    "Letting an application or a managed identity call Azure without sharing a person's password.",
  ],
  notFor: [
    "Defining a new set of permissions. That is a role definition or a custom role.",
    "Granting a Microsoft Entra role such as Global Administrator. That is a separate assignment in the directory.",
  ],

  prerequisites: [
    {
      name: "A security principal",
      why: "The assignment needs a user, group, service principal or managed identity that already exists in the directory.",
      slug: "user",
    },
    {
      name: "A role definition",
      why: "The assignment points at a built-in or custom role. The role can only be assigned inside its assignable scopes.",
      slug: "role-definition",
    },
    {
      name: "roleAssignments/write at the scope",
      why: "Learn says you must be signed in with a role that has Microsoft.Authorization/roleAssignments/write, such as Role Based Access Control Administrator or User Access Administrator.",
    },
  ],

  example: {
    portal: [
      "Sign in to the Azure portal.",
      "Search for the scope, such as Management groups, Subscriptions, Resource groups, or a specific resource, and open it.",
      "Select Access control (IAM). Open the Role assignments tab to see assignments at this scope.",
      "Select Add, then Add role assignment.",
      "On the Role tab, choose a job function role or a privileged administrator role, then Next.",
      "On the Members tab, select who needs access, then review and assign.",
    ],
  },

  examNotes: [
    {
      exam: "az-104",
      points: [
        "There are four scopes: management group, subscription, resource group and resource. Child scopes inherit assignments from parent scopes.",
        "If the account lacks permission, the portal reports that it does not have authorization to perform action Microsoft.Authorization/roleAssignments/write.",
      ],
    },
  ],

  related: ["role-definition", "custom-role", "user", "group", "service-principal", "managed-identity"],
  docsUrl: "https://learn.microsoft.com/en-us/azure/role-based-access-control/role-assignments-portal",
};
