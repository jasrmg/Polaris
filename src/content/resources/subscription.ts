import type { ResourceInput } from "../schema";

export const subscription: ResourceInput = {
  slug: "subscription",
  name: "Subscription",
  type: "Azure subscription",
  kind: "azure-resource",
  category: "management-governance",
  scope: "subscription",
  tier: 3,
  exams: ["az-104"],
  icon: "CreditCard",

  tagline: "The boundary where Azure resources, access and the bill are managed.",
  definition:
    "A subscription is the scope where Azure resources and Azure role assignments are managed. It trusts one Microsoft Entra tenant, which is the directory used to sign in. One tenant can be trusted by many subscriptions. Learn also lists subscriptions as one of the four management scopes, with management groups above them and resource groups below, and it treats a subscription as a resource. A new subscription is placed in the root management group unless you choose another group. Resource groups are created inside a subscription.",
  analogy:
    "A subscription is the account the bill is attached to. Everything you create in it shows up on that account, and the people allowed in are decided there.",
  whenToUse: [
    "Separating billing, quotas and access for different environments or business units.",
    "Giving a team its own place to create resource groups without sharing another team's subscription.",
  ],
  notFor: [
    "Storing users and groups. Those live in the Microsoft Entra tenant that the subscription trusts.",
    "Nesting subscriptions. A subscription has one parent management group. Resource groups live inside it and cannot be nested either.",
  ],

  prerequisites: [
    {
      name: "A Microsoft Entra tenant",
      why: "The subscription trusts that directory for sign-in and for the identities you can assign roles to.",
      slug: "tenant",
    },
    {
      name: "A parent management group",
      why: "A new subscription is placed in the root management group by default. The portal can ask you to pick a different group in the same directory.",
      slug: "management-group",
    },
    {
      name: "Permission on a billing account, when your agreement requires it",
      why: "For a Microsoft Customer Agreement, Learn says you need Owner or Contributor on the invoice section, billing profile or billing account, or the Azure subscription creator role on the invoice section. Other agreements use their own steps.",
    },
  ],

  example: {
    portal: [
      "These steps are the ones Learn documents for a Microsoft Customer Agreement. Other agreements use a different flow.",
      "In the Azure portal, go to Subscriptions and select Add.",
      "On Basics, enter a subscription name and select the billing account, billing profile and invoice section.",
      "Next to Plan, select Microsoft Azure Plan, or Microsoft Azure Plan for DevTest when the subscription is for development or testing.",
      "On Advanced, select the subscription directory (the Microsoft Entra tenant), a management group in that directory, and one or more subscription owners.",
      "Optionally add tags, then select Review + create.",
    ],
  },

  examNotes: [
    {
      exam: "az-104",
      points: [
        "A subscription trusts a single Microsoft Entra directory. Moving it to another directory removes existing Azure role assignments.",
        "Azure roles on the subscription do not grant Microsoft Entra roles, and a Global Administrator does not get access to Azure resources unless they elevate access.",
        "New subscriptions default to the root management group.",
      ],
    },
  ],

  related: ["tenant", "management-group", "resource-group"],
  docsUrl: "https://learn.microsoft.com/en-us/azure/cost-management-billing/manage/create-subscription",
};
