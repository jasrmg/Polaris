import type { ResourceInput } from "../schema";

export const group: ResourceInput = {
  slug: "group",
  name: "Group",
  type: "Microsoft Entra ID",
  kind: "directory-object",
  directoryType: "group",
  category: "identity-access",
  scope: "tenant",
  tier: 3,
  exams: ["az-104"],
  icon: "Users",

  tagline: "One assignment that covers every member.",
  definition:
    "A Microsoft Entra group is a set of users that need the same access. Assigning an Azure role to a group gives that role to the members. Learn says role assignments are transitive for groups, so a member of a nested group receives the assignment too. Creating a group in the Microsoft Entra admin center requires at least the Groups Administrator or User Administrator role. The group name cannot start with a space, or the group will not appear when you add a role assignment.",
  analogy:
    "A group is a mailing list for access. You pin the role on the list, and everyone on the list gets it, including people on lists inside the list.",
  whenToUse: [
    "Several people need the same Azure role at the same scope.",
    "You expect the membership to change, and you do not want to edit every role assignment.",
  ],
  notFor: [
    "A permission set. The group is the who. The role definition is the what.",
    "Replacing a user account. Someone still signs in as a user who is a member of the group.",
  ],

  prerequisites: [
    {
      name: "A Microsoft Entra tenant",
      why: "Groups are directory objects. Azure role assignments can point at them.",
      slug: "tenant",
    },
    {
      name: "Groups Administrator or User Administrator",
      why: "Learn says you need at least one of those Microsoft Entra roles to create a group and add members.",
    },
  ],

  example: {
    portal: [
      "Sign in to the Microsoft Entra admin center as at least a Groups Administrator.",
      "Browse to Entra ID, then Groups, then All groups.",
      "Select New group.",
      "Choose a group type and enter a group name. The name cannot start with a space.",
      "Choose a membership type, add members, and create the group.",
    ],
  },

  examNotes: [
    {
      exam: "az-104",
      points: [
        "An Azure role assigned to a group applies to the members, and nested group membership is included.",
      ],
    },
  ],

  related: ["user", "role-assignment", "tenant"],
  docsUrl: "https://learn.microsoft.com/en-us/entra/fundamentals/how-to-manage-groups",
};
