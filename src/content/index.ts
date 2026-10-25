import { resourceGroup } from "./resources/resource-group";
import { storageAccount } from "./resources/storage-account";
import { virtualMachine } from "./resources/virtual-machine";
import {
  resourceSchema,
  type Category,
  type Resource,
  type ResourceInput,
} from "./schema";

const rawResources: ResourceInput[] = [
  resourceGroup,
  virtualMachine,
  storageAccount,
];

/**
 * Parse every entry with Zod, then check cross-references.
 * This runs at build time, so a bad entry fails `next build` instead of
 * shipping a broken page.
 */
function loadResources(input: ResourceInput[]): Resource[] {
  const parsed = input.map((entry) => {
    const result = resourceSchema.safeParse(entry);
    if (!result.success) {
      const slug = (entry as { slug?: string }).slug ?? "<unknown>";
      throw new Error(
        `Invalid resource "${slug}":\n${result.error.issues
          .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
          .join("\n")}`,
      );
    }
    return result.data;
  });

  const slugs = new Set<string>();
  for (const r of parsed) {
    if (slugs.has(r.slug)) throw new Error(`Duplicate resource slug "${r.slug}"`);
    slugs.add(r.slug);
  }

  for (const r of parsed) {
    const refs = [
      ...r.related,
      ...r.prerequisites.flatMap((p) => (p.slug ? [p.slug] : [])),
    ];
    for (const ref of refs) {
      if (!slugs.has(ref)) {
        throw new Error(`Resource "${r.slug}" references unknown slug "${ref}"`);
      }
    }
  }

  return parsed;
}

export const resources: Resource[] = loadResources(rawResources);

export function getResource(slug: string): Resource | undefined {
  return resources.find((r) => r.slug === slug);
}

export function getResourcesByCategory(category: Category): Resource[] {
  return resources.filter((r) => r.category === category);
}
