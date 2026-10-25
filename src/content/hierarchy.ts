import type { Scope } from "./schema";

export interface HierarchyNode {
  scope: Scope;
  name: string;
  icon: string;
  tagline: string;
  definition: string;
  example: string;
  /** What sits directly underneath this level. */
  contains: string;
}

/** Top to bottom: how Azure organises everything you create. */
export const hierarchy: HierarchyNode[] = [
  {
    scope: "tenant",
    name: "Tenant",
    icon: "Building2",
    tagline: "Your organisation's identity boundary.",
    definition:
      "A tenant is a dedicated instance of Microsoft Entra ID that represents your organisation. It is the directory of users and apps. Every subscription trusts exactly one tenant, and the tenant sits above the whole resource hierarchy.",
    example: "contoso.onmicrosoft.com",
    contains: "Management groups and subscriptions",
  },
  {
    scope: "management-group",
    name: "Management group",
    icon: "Layers",
    tagline: "A folder for subscriptions.",
    definition:
      "Management groups let you organise many subscriptions into a tree so governance applies once and flows down. They can be nested up to six levels deep, not counting the root and the subscription level.",
    example: "mg-production, mg-sandbox",
    contains: "Subscriptions and child management groups",
  },
  {
    scope: "subscription",
    name: "Subscription",
    icon: "CreditCard",
    tagline: "The billing and quota boundary.",
    definition:
      "A subscription is the agreement under which you use Azure. It is where usage is billed, where quotas apply, and a boundary for access. Resource groups are created inside a subscription.",
    example: "Visual Studio Enterprise, Pay-As-You-Go",
    contains: "Resource groups",
  },
  {
    scope: "resource-group",
    name: "Resource group",
    icon: "FolderOpen",
    tagline: "A container for resources that share a lifecycle.",
    definition:
      "A resource group holds related resources that you deploy, update and delete together. Each resource belongs to exactly one group. Groups cannot be nested.",
    example: "rg-polaris-demo",
    contains: "Resources",
  },
  {
    scope: "resource",
    name: "Resource",
    icon: "Boxes",
    tagline: "The actual service instance you use.",
    definition:
      "A resource is a manageable item such as a virtual machine, a virtual network or a storage account. Resources are what you create, configure and pay for.",
    example: "vm-web-01, vnet-hub, stpolarisdemo001",
    contains: "Settings, child resources and data",
  },
];
