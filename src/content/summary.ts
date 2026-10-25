import { categoryLabels, type Category, type Resource, type Scope } from "./schema";

/**
 * Card-sized view of a resource. The catalog is a client component, so we
 * pass this slim shape instead of the full entry (which carries large code
 * samples) to keep the client bundle small.
 */
export interface ResourceSummary {
  slug: string;
  name: string;
  type: string;
  category: Category;
  categoryLabel: string;
  scope: Scope;
  icon: string;
  tagline: string;
  definition: string;
  prerequisiteCount: number;
}

export function toSummary(r: Resource): ResourceSummary {
  return {
    slug: r.slug,
    name: r.name,
    type: r.type,
    category: r.category,
    categoryLabel: categoryLabels[r.category],
    scope: r.scope,
    icon: r.icon,
    tagline: r.tagline,
    definition: r.definition,
    prerequisiteCount: r.prerequisites.length,
  };
}
