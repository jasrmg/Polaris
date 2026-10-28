import {
  categoryLabels,
  examLabels,
  kindLabels,
  tierLabels,
  type Category,
  type Exam,
  type Kind,
  type Resource,
  type Scope,
  type Tier,
} from "./schema";

/**
 * Card-sized view of a resource. The catalog is a client component, so we
 * pass this slim shape instead of the full entry (which carries large code
 * samples) to keep the client bundle small.
 */
export interface ResourceSummary {
  slug: string;
  name: string;
  type: string;
  kind: Kind;
  kindLabel: string;
  category: Category;
  categoryLabel: string;
  scope: Scope;
  tier: Tier;
  tierLabel: string;
  exams: Exam[];
  examLabels: string[];
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
    kind: r.kind,
    kindLabel: kindLabels[r.kind],
    category: r.category,
    categoryLabel: categoryLabels[r.category],
    scope: r.scope,
    tier: r.tier,
    tierLabel: tierLabels[r.tier],
    exams: r.exams,
    examLabels: r.exams.map((exam) => examLabels[exam]),
    icon: r.icon,
    tagline: r.tagline,
    definition: r.definition,
    prerequisiteCount: r.prerequisites.length,
  };
}
