import { z } from "zod";

/**
 * The hierarchy level an entry describes. Container entries are their own
 * level (the Resource Group entry is "resource-group"); every ordinary
 * service such as a VM or a storage account is "resource".
 */
export const scopeSchema = z.enum([
  "tenant",
  "management-group",
  "subscription",
  "resource-group",
  "resource",
]);

/**
 * What kind of thing the entry describes. Azure resources (including
 * management groups and subscriptions, which Learn also calls resources)
 * stay separate from Microsoft Entra directory objects, DevOps tools and
 * practices. See docs/SIMULATOR.md section 9.1.
 */
export const kindSchema = z.enum([
  "azure-resource",
  "directory-object",
  "devops-tool",
  "concept",
]);

/** Study-aid tags. An entry can carry more than one. Not a scope boundary. */
export const examSchema = z.enum(["az-104", "az-400"]);

/**
 * How deep the sandbox will simulate this entry.
 * 1 behaviour, 2 lifecycle, 3 catalog only. See docs/SIMULATOR.md section 7.
 */
export const tierSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

/** Service areas, not exam domains. See docs/SIMULATOR.md section 9.3. */
export const categorySchema = z.enum([
  "management-governance",
  "identity-access",
  "compute",
  "containers",
  "storage",
  "networking",
  "monitoring",
  "backup-recovery",
  "security",
  "databases",
  "devops",
]);

/** A thing that must exist (or be chosen) before this resource can be created. */
export const prerequisiteSchema = z.object({
  name: z.string().min(1),
  /** Short reason, written for a beginner. */
  why: z.string().min(1),
  /** Link to another entry in the catalog, when one exists. */
  slug: z.string().optional(),
  /** True if the portal creates it for you when missing. */
  autoCreated: z.boolean().default(false),
});

/** Copy-pasteable examples. Only `portal` is required. */
export const exampleConfigSchema = z.object({
  portal: z.array(z.string().min(1)).min(1),
  cli: z.string().optional(),
  powershell: z.string().optional(),
  bicep: z.string().optional(),
  arm: z.string().optional(),
});

export const examNoteSchema = z.object({
  exam: examSchema,
  points: z.array(z.string().min(1)).min(1),
});

/**
 * Slim simulator block (checkpoint 11). Create-form fields are checkpoint 15.
 * `provisioning` lists only values a Learn page enumerates for this type.
 */
export const simulatorSchema = z.object({
  /** ARM resource type this entry creates or updates, such as Microsoft.Network/virtualNetworks. */
  armType: z.string().min(1),
  /** API version used by this entry's Bicep or ARM example. */
  apiVersion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Key in src/content/name-rules.ts. Omitted when the entry is not a named resource. */
  nameRule: z.string().min(1).optional(),
  provisioning: z.array(z.string().min(1)).default([]),
  /** Learn page that enumerates `provisioning`, when that list is non-empty. */
  provisioningSource: z.url().optional(),
});

export const resourceSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "kebab-case only"),
    name: z.string().min(1),
    /**
     * Shown under the title. For an Azure resource this is the ARM type.
     * A directory object uses a plain label, such as "Microsoft Entra ID".
     */
    type: z.string().min(1),
    kind: kindSchema,
    /** Set when kind is directory-object, for example "tenant" or "user". */
    directoryType: z.string().min(1).optional(),
    category: categorySchema,
    scope: scopeSchema,
    tier: tierSchema,
    exams: z.array(examSchema).default([]),
    /** lucide-react icon name; mapped to a component in the UI layer. */
    icon: z.string().min(1),

    tagline: z.string().min(1).max(120),
    definition: z.string().min(1),
    analogy: z.string().min(1),
    whenToUse: z.array(z.string().min(1)).min(1),
    notFor: z.array(z.string().min(1)).default([]),

    prerequisites: z.array(prerequisiteSchema).default([]),
    example: exampleConfigSchema,
    examNotes: z.array(examNoteSchema).default([]),

    related: z.array(z.string()).default([]),
    docsUrl: z.url(),

    simulator: simulatorSchema.optional(),
  })
  .superRefine((entry, ctx) => {
    if ((entry.tier === 1 || entry.tier === 2) && !entry.simulator) {
      ctx.addIssue({
        code: "custom",
        path: ["simulator"],
        message: "Tier 1 and tier 2 entries need a simulator block",
      });
    }
    if (entry.kind === "directory-object" && !entry.directoryType) {
      ctx.addIssue({
        code: "custom",
        path: ["directoryType"],
        message: "Directory objects need directoryType",
      });
    }
    if (
      entry.simulator &&
      entry.simulator.provisioning.length > 0 &&
      !entry.simulator.provisioningSource
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["simulator", "provisioningSource"],
        message: "A provisioning list needs the Learn URL that enumerates it",
      });
    }
  });

export type Scope = z.infer<typeof scopeSchema>;
export type Kind = z.infer<typeof kindSchema>;
export type Exam = z.infer<typeof examSchema>;
export type Tier = z.infer<typeof tierSchema>;
export type Category = z.infer<typeof categorySchema>;
export type Prerequisite = z.infer<typeof prerequisiteSchema>;
export type ExampleConfig = z.infer<typeof exampleConfigSchema>;
export type ExamNote = z.infer<typeof examNoteSchema>;
/** Shape authors write (defaults optional). */
export type ResourceInput = z.input<typeof resourceSchema>;
/** Shape the app consumes (defaults applied). */
export type Resource = z.output<typeof resourceSchema>;

export const categoryLabels: Record<Category, string> = {
  "management-governance": "Management & governance",
  "identity-access": "Identity & access",
  compute: "Compute",
  containers: "Containers",
  storage: "Storage",
  networking: "Networking",
  monitoring: "Monitoring",
  "backup-recovery": "Backup & recovery",
  security: "Security",
  databases: "Databases",
  devops: "DevOps",
};

export const kindLabels: Record<Kind, string> = {
  "azure-resource": "Azure resource",
  "directory-object": "Directory object",
  "devops-tool": "DevOps tool",
  concept: "Concept",
};

export const examLabels: Record<Exam, string> = {
  "az-104": "AZ-104",
  "az-400": "AZ-400",
};

export const tierLabels: Record<Tier, string> = {
  1: "Behaviour",
  2: "Lifecycle",
  3: "Catalog",
};

export const scopeLabels: Record<Scope, string> = {
  tenant: "Tenant",
  "management-group": "Management group",
  subscription: "Subscription",
  "resource-group": "Resource group",
  resource: "Resource",
};
