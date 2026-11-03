import type { ResourceInput } from "../schema";

export const policyAssignment: ResourceInput = {
  slug: "policy-assignment",
  name: "Policy assignment",
  type: "Microsoft.Authorization/policyAssignments",
  kind: "azure-resource",
  category: "management-governance",
  scope: "subscription",
  tier: 3,
  exams: ["az-104"],
  icon: "ShieldCheck",

  tagline: "Turns a policy definition on for a scope.",
  definition:
    "A policy assignment applies a policy definition to a scope: a management group, subscription, resource group, or resource. Everything under that scope is included. notScopes lists children to leave out. Parameters on the assignment fill in the definition, for example the list of allowed locations. Enforcement defaults to Enabled, which is enforcementMode Default: the effect runs on create and update. Disabled is DoNotEnforce: Azure still evaluates compliance, but it does not enforce the effect or write the deny entry to the activity log. A display name can be 128 characters and a description 512. Owner can create assignments. Contributor can read policy, but cannot create or update definitions or assignments. A denied request fails with RequestDisallowedByPolicy and names the assignment and the definition.",
  analogy: "Posting the house rule on one floor. The floors below follow it, unless you list a room as excluded.",
  whenToUse: [
    "Restricting locations or resource types for a subscription or one resource group.",
    "Auditing first, with the effect set to Audit or enforcement set to Disabled, before you switch the assignment to Deny.",
  ],
  notFor: [
    "Changing the rule itself. Edit or replace the policy definition.",
    "A temporary waiver for one resource. That is a policy exemption, and an excluded scope is not the same thing.",
  ],

  prerequisites: [
    {
      name: "A policy definition",
      why: "The assignment points at one definition and supplies its parameter values.",
      slug: "policy-definition",
    },
    {
      name: "Permission to write policy assignments",
      why: "Owner has full rights. Resource Policy Contributor includes most policy operations. Contributor cannot create or update assignments.",
      slug: "role-definition",
    },
  ],

  example: {
    portal: [
      "Search for Policy and open it.",
      "Select Assignments, then Assign policy.",
      "On Basics, choose the scope. Exclusions are optional.",
      "Select the policy definition. The assignment name defaults to the definition name. Policy enforcement defaults to Enabled.",
      "On Parameters, fill in any values the definition needs, such as a tag name.",
      "On Non-compliance messages, you can add a message that is shown when a resource is denied or non-compliant.",
      "Review + create, then Create.",
    ],
  },

  examNotes: [
    {
      exam: "az-104",
      points: [
        "Azure Policy evaluates resource state without regard to who made the change. Azure RBAC decides who is allowed to act.",
        "Assignments are evaluated separately, and the result is cumulative most restrictive. Two deny assignments that require different locations can block a new resource that matches neither.",
        "RequestDisallowedByPolicy means a deny assignment stopped the deployment. The error names the policy assignment and the policy definition.",
      ],
    },
  ],

  related: ["policy-definition", "subscription", "resource-group", "tag"],
  docsUrl: "https://learn.microsoft.com/en-us/azure/governance/policy/assign-policy-portal",
};
