import type { ResourceInput } from "../schema";

export const user: ResourceInput = {
  slug: "user",
  name: "User",
  type: "Microsoft Entra ID",
  kind: "directory-object",
  directoryType: "user",
  category: "identity-access",
  scope: "tenant",
  tier: 3,
  exams: ["az-104"],
  icon: "User",

  tagline: "A person in the directory a subscription trusts.",
  definition:
    "A user is an individual who has a profile in Microsoft Entra ID. In a workforce tenant, Learn distinguishes internal members, internal guests, external members and external guests. Internal members are typically employees and have credentials in that tenant. You can assign an Azure role to a user at a management group, subscription, resource group or resource. An Azure role does not make the user a Microsoft Entra administrator, and a Microsoft Entra role such as Global Administrator does not by itself grant access to Azure resources.",
  analogy:
    "A user is a person's record in the ID office. A role assignment is the extra pass that record needs before it can open an Azure resource.",
  whenToUse: [
    "Giving a person their own sign-in in the tenant.",
    "Assigning that person an Azure role, instead of sharing one account.",
  ],
  notFor: [
    "An application that signs in on its own. That uses a service principal or a managed identity.",
    "Giving the same access to many people one by one, when a group would do.",
  ],

  prerequisites: [
    {
      name: "A Microsoft Entra tenant",
      why: "The user profile lives in the directory. Subscriptions trust that directory for sign-in.",
      slug: "tenant",
    },
    {
      name: "User Administrator, to create users",
      why: "Learn says to sign in to the Microsoft Entra admin center as at least a User Administrator to create a user.",
    },
  ],

  example: {
    portal: [
      "Sign in to the Microsoft Entra admin center as at least a User Administrator.",
      "Browse to Entra ID, then Users.",
      "Select New user, then Create new user.",
      "On Basics, enter a user principal name, choose the domain after the @ sign, and enter a display name.",
      "Complete the remaining tabs on the New user page.",
    ],
  },

  examNotes: [
    {
      exam: "az-104",
      points: [
        "Azure roles and Microsoft Entra roles are different systems. Global Administrator does not grant access to Azure resources unless that user elevates access.",
      ],
    },
  ],

  related: ["tenant", "group", "role-assignment"],
  docsUrl: "https://learn.microsoft.com/en-us/entra/fundamentals/how-to-create-delete-users",
};
