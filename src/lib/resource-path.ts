/** Public URL of a resource's full page (trailing slash matches next.config). */
export function resourcePath(slug: string): string {
  return `/resources/${slug}/`;
}

/**
 * Static JSON endpoint the modal fetches lazily. Route handlers are exported
 * as plain files, so unlike pages there is no trailing slash.
 */
export function resourceDataPath(slug: string): string {
  return `/data/resources/${slug}`;
}

const PATH_RE = /^\/resources\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/;

/** Extract the slug from a pathname like /resources/virtual-machine/. */
export function slugFromPathname(pathname: string): string | null {
  return PATH_RE.exec(pathname)?.[1] ?? null;
}
