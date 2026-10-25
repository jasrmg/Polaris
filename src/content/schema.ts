import { z } from "zod";

/** Where a resource lives in the Azure hierarchy. */
export const scopeSchema = z.enum([
  "tenant",
  "management-group",
  "subscription",
  "resource-group",
  "resource",
]);

/** Matches the AZ-104 skills-measured domains. */
export const categorySchema = z.enum([
  "identity-governance",
  "storage",
  "compute",
  "networking",
  "monitor-backup",
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

/** Reserved for phase 2: describes the create form for the simulator. */
export const simulatorFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(["text", "select", "number", "boolean"]),
  required: z.boolean().default(true),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  options: z.array(z.string()).optional(),
  help: z.string().optional(),
});

export const resourceSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "kebab-case only"),
  name: z.string().min(1),
  /** Azure resource provider type, e.g. Microsoft.Compute/virtualMachines. */
  type: z.string().min(1),
  category: categorySchema,
  scope: scopeSchema,
  /** lucide-react icon name; mapped to a component in the UI layer. */
  icon: z.string().min(1),

  tagline: z.string().min(1).max(120),
  definition: z.string().min(1),
  analogy: z.string().min(1),
  whenToUse: z.array(z.string().min(1)).min(1),
  notFor: z.array(z.string().min(1)).default([]),

  prerequisites: z.array(prerequisiteSchema).default([]),
  example: exampleConfigSchema,
  /** Things the AZ-104 exam likes to ask about this resource. */
  examNotes: z.array(z.string().min(1)).default([]),

  related: z.array(z.string()).default([]),
  docsUrl: z.url(),

  simulator: z.array(simulatorFieldSchema).optional(),
});

export type Scope = z.infer<typeof scopeSchema>;
export type Category = z.infer<typeof categorySchema>;
export type Prerequisite = z.infer<typeof prerequisiteSchema>;
export type ExampleConfig = z.infer<typeof exampleConfigSchema>;
/** Shape authors write (defaults optional). */
export type ResourceInput = z.input<typeof resourceSchema>;
/** Shape the app consumes (defaults applied). */
export type Resource = z.output<typeof resourceSchema>;

export const categoryLabels: Record<Category, string> = {
  "identity-governance": "Identity & Governance",
  storage: "Storage",
  compute: "Compute",
  networking: "Networking",
  "monitor-backup": "Monitor & Backup",
};

export const scopeLabels: Record<Scope, string> = {
  tenant: "Tenant",
  "management-group": "Management group",
  subscription: "Subscription",
  "resource-group": "Resource group",
  resource: "Resource",
};
