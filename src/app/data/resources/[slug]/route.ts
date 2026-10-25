import { getResource, resources } from "@/content";
import { toPayload } from "@/content/payload";

// Static export: every slug is rendered to a file at build time.
export const dynamicParams = false;

export function generateStaticParams() {
  return resources.map((r) => ({ slug: r.slug }));
}

export async function GET(
  _request: Request,
  ctx: RouteContext<"/data/resources/[slug]">,
) {
  const { slug } = await ctx.params;
  const resource = getResource(slug);
  if (!resource) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json(toPayload(resource));
}
