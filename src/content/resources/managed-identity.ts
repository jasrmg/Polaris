import type { ResourceInput } from "../schema";

export const managedIdentity: ResourceInput = {
  slug: "managed-identity",
  name: "Managed identity",
  type: "Microsoft Entra ID",
  kind: "directory-object",
  directoryType: "managed-identity",
  category: "identity-access",
  scope: "tenant",
  tier: 3,
  exams: ["az-104"],
  icon: "Fingerprint",

  tagline: "An identity Azure creates so a resource can sign in without a password.",
  definition:
    "A managed identity is an identity in Microsoft Entra ID that Azure manages. Applications use it to obtain tokens without handling credentials, and those credentials are not accessible to you. A system-assigned identity is enabled on one Azure resource. Azure creates a service principal tied to that resource and deletes the service principal when the resource is deleted. Only that resource can use it, and its name matches the resource. A user-assigned identity is its own Azure resource. You can assign it to more than one resource, and its service principal is managed separately from those resources. Learn recommends user-assigned identities for Microsoft services.",
  analogy:
    "A system-assigned identity is a badge printed on the machine itself, thrown away with the machine. A user-assigned identity is a badge you can clip onto several machines.",
  whenToUse: [
    "A virtual machine, app or other supported resource needs to call Azure, and you do not want to store a secret for it.",
    "Several resources should share one identity. Use a user-assigned managed identity.",
  ],
  notFor: [
    "An application registered by you, with your own secret or certificate. That is an application service principal.",
    "Signing a person in. A managed identity is for a workload.",
  ],

  prerequisites: [
    {
      name: "A supported Azure resource, or a user-assigned identity resource",
      why: "System-assigned identities are turned on at the resource. User-assigned identities are created separately and then attached.",
      slug: "virtual-machine",
    },
  ],

  example: {
    portal: [
      "For a system-assigned identity, open a supported resource and enable the managed identity on that resource. Azure creates a service principal with the same name and deletes it when the resource is deleted.",
      "For a user-assigned identity, create the managed identity as its own resource, then assign it to one or more Azure resources.",
      "Grant access by adding a role assignment for that identity on the resource it needs to use, such as a storage account.",
    ],
  },

  examNotes: [
    {
      exam: "az-104",
      points: [
        "System-assigned identities share the resource's lifecycle. User-assigned identities can be attached to multiple resources.",
      ],
    },
  ],

  related: ["service-principal", "virtual-machine", "role-assignment"],
  docsUrl: "https://learn.microsoft.com/en-us/entra/identity/managed-identities-azure-resources/overview",
};
