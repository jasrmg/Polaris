import type { ResourceInput } from "../schema";

export const servicePrincipal: ResourceInput = {
  slug: "service-principal",
  name: "Service principal",
  type: "Microsoft Entra ID",
  kind: "directory-object",
  directoryType: "service-principal",
  category: "identity-access",
  scope: "tenant",
  tier: 3,
  exams: ["az-104"],
  icon: "KeyRound",

  tagline: "The identity an application uses in one tenant.",
  definition:
    "A service principal is the security identity an application or service uses to access Azure resources. Learn describes it as a user identity for an application. When you register an application in a tenant, an application object and a service principal are created in that home tenant. The application object is the blueprint. A service principal is created in each tenant where the application is used. To access resources protected by the tenant, the application must be represented by that security principal. You can assign an Azure role to it the same way you assign one to a user.",
  analogy:
    "A service principal is the application's own badge. The application object is the design of the badge. The service principal is the badge issued in this directory.",
  whenToUse: [
    "An application needs to sign in to Azure and call resource APIs.",
    "You want a role assignment for an app, separate from the people who wrote it.",
  ],
  notFor: [
    "A person signing in. That is a user.",
    "An Azure resource that should receive an identity without you managing a secret. That is a managed identity, which is a service principal Azure manages for you.",
  ],

  prerequisites: [
    {
      name: "An application registration in the tenant",
      why: "Registering an app in the portal creates the application object and the service principal in the home tenant. Creating the service principal is a separate step if you use Microsoft Graph.",
      slug: "tenant",
    },
  ],

  example: {
    portal: [
      "In the Microsoft Entra admin center, open App registrations to manage application objects in the home tenant.",
      "Register the application. The home tenant then has an application object and a service principal.",
      "To grant the app access to an Azure resource, open that resource's Access control (IAM) and add a role assignment for the service principal.",
    ],
  },

  examNotes: [
    {
      exam: "az-104",
      points: [
        "The application object lives in the home tenant. A service principal is the instance in a tenant where the app is used.",
      ],
    },
  ],

  related: ["tenant", "managed-identity", "role-assignment", "user"],
  docsUrl: "https://learn.microsoft.com/en-us/entra/identity-platform/app-objects-and-service-principals",
};
