import type { ResourceInput } from "../schema";

export const tenant: ResourceInput = {
  slug: "tenant",
  name: "Tenant",
  type: "Microsoft Entra ID",
  kind: "directory-object",
  directoryType: "tenant",
  category: "identity-access",
  scope: "tenant",
  tier: 3,
  exams: ["az-104"],
  icon: "Building2",

  tagline: "The Microsoft Entra directory that a subscription trusts.",
  definition:
    "A tenant is your organisation's Microsoft Entra directory. Every Azure subscription has a trust relationship with one tenant, and it uses that directory to authenticate and authorize security principals and devices. A subscription can trust only one directory. One tenant can be trusted by many subscriptions. Azure roles control access to Azure resources. Microsoft Entra roles control access to directory resources such as users and groups.",
  analogy:
    "The tenant is the organisation's ID office. Subscriptions ask that office who someone is before they can touch a resource.",
  whenToUse: [
    "You need a directory of users, groups and apps that subscriptions trust for sign-in.",
    "You want a separate directory for another organisation or for a lab, instead of sharing one tenant.",
  ],
  notFor: [
    "Holding Azure resources by itself. Resources live in a subscription, which then trusts the tenant.",
    "Replacing Azure RBAC. A Microsoft Entra role, such as Global Administrator, does not by itself grant access to Azure resources.",
  ],

  prerequisites: [
    {
      name: "Permission to create a tenant",
      why: "If tenant creation is switched off, Learn says you need at least the Tenant Creator role. A governed workforce tenant also needs an Enterprise Agreement or Pay-As-You-Go subscription, and Tenant Contributor or Subscription Owner or Creator on that subscription.",
    },
  ],

  example: {
    portal: [
      "Sign in to the Azure portal and select Microsoft Entra ID.",
      "Go to Entra ID, then Overview, then Manage tenants.",
      "Select Create.",
      "On Basics, choose Microsoft Entra ID to create a workforce tenant. Choose Microsoft Entra ID (B2C) only when you need an Azure AD B2C tenant.",
      "Enter an organization name and an initial domain name, and choose a country or region.",
      "Select Review + create, then Create.",
      "The new tenant's domain looks like contoso.onmicrosoft.com. The user who creates the tenant is assigned the Global Administrator role.",
    ],
  },

  examNotes: [
    {
      exam: "az-104",
      points: [
        "A subscription trusts a single directory. One Microsoft Entra tenant can be trusted by multiple subscriptions.",
        "Changing a subscription's directory does not make the subscription owner a Global Administrator.",
        "The user who creates a tenant is automatically a Global Administrator of that tenant.",
      ],
    },
  ],

  related: ["management-group", "subscription", "user", "group"],
  docsUrl: "https://learn.microsoft.com/en-us/entra/fundamentals/how-subscriptions-associated-directory",
};
