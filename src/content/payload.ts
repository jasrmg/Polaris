import { getResource } from "./index";
import type { Resource } from "./schema";

/**
 * Everything the detail view needs for one resource, including the display
 * names of resources it links to (so the client never needs the whole
 * catalog). Served as static JSON for the modal and used directly by the
 * full page.
 */
export interface ResourcePayload extends Resource {
  linkedNames: Record<string, string>;
}

export function toPayload(resource: Resource): ResourcePayload {
  const slugs = new Set<string>([
    ...resource.related,
    ...resource.prerequisites.flatMap((p) => (p.slug ? [p.slug] : [])),
  ]);
  const linkedNames: Record<string, string> = {};
  for (const slug of slugs) {
    const linked = getResource(slug);
    if (linked) linkedNames[slug] = linked.name;
  }
  return { ...resource, linkedNames };
}
