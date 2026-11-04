/** Resources whose Try it button opens a create form in this slice. */
export const TRY_SLUGS = [
  "resource-group",
  "virtual-network",
  "subnet",
  "virtual-machine",
  "storage-account",
] as const;

export type TrySlug = (typeof TRY_SLUGS)[number];

export function isTrySlug(slug: string): slug is TrySlug {
  return (TRY_SLUGS as readonly string[]).includes(slug);
}

export function sandboxHomePath(): string {
  return "/sandbox/";
}

export function sandboxCreatePath(slug: TrySlug): string {
  return `/sandbox/${slug}/`;
}
