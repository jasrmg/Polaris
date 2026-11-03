import type { ResourceInput } from "../schema";

export const policyDefinition: ResourceInput = {
  slug: "policy-definition",
  name: "Policy definition",
  type: "Microsoft.Authorization/policyDefinitions",
  kind: "azure-resource",
  category: "management-governance",
  scope: "tenant",
  tier: 3,
  exams: ["az-104"],
  icon: "ScrollText",

  tagline: "The rule that says what is compliant, and what to do when it is not.",
  definition:
    "A policy definition is the condition Azure Policy evaluates and the effect it takes when the condition is met. Built-in definitions are written and maintained by Microsoft. Custom definitions are the ones you write. A definition has a display name of up to 128 characters, a description of up to 512, a mode, parameters, and a policy rule with if and then. Mode indexed evaluates resource types that support tags and location. Mode all also evaluates resource groups, subscriptions, and types that do not support tags. A definition is saved at a management group or a subscription, and it can only be assigned inside that location. Deny rejects a create or update that matches. Audit records the resource as non-compliant and does not stop the request.",
  analogy: "The written house rule. Assigning it is posting the rule on a floor.",
  whenToUse: [
    "Reading a built-in definition, such as Allowed locations, before you assign it.",
    "Writing a custom rule when no built-in matches, after you map the requirement to a resource property alias.",
  ],
  notFor: [
    "Deciding who is allowed to click. That is a role assignment. Policy looks at the resource, not at who sent the request.",
    "A one-off exception for one resource. That is a policy exemption, which is separate from the definition.",
  ],

  prerequisites: [
    {
      name: "A management group or subscription for the definition location",
      why: "The location is the highest scope the definition can be assigned to. A definition saved on one subscription cannot be assigned outside it.",
      slug: "subscription",
    },
  ],

  example: {
    portal: [
      "Search for Policy and open it.",
      "Under Authoring, select Definitions.",
      "Select + Policy definition.",
      "Set Definition location to the management group or subscription where the definition is saved. If you will assign it to more than one subscription, choose a management group that contains them.",
      "Enter a name, a description, and a category. Paste the policy rule JSON, then select Save.",
    ],
  },

  examNotes: [
    {
      exam: "az-104",
      points: [
        "policyType is Builtin, Custom, or Static. You do not set it yourself. Static is the regulatory compliance definitions Microsoft owns.",
        "Use mode indexed for tag and location rules. Use mode all when the rule must include resource groups.",
        "Deny returns the request as 403 Forbidden before it reaches the resource provider. Audit writes a warning and lets the request continue.",
      ],
    },
  ],

  related: ["policy-assignment", "tag", "subscription"],
  docsUrl: "https://learn.microsoft.com/en-us/azure/governance/policy/concepts/definition-structure",
};
