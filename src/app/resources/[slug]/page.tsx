import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ResourceDetail } from "@/components/resource-detail";
import { ResourceHeading } from "@/components/resource-heading";
import { getResource, resources } from "@/content";
import { toPayload } from "@/content/payload";
import { toSummary } from "@/content/summary";

// Static export: only the slugs below exist.
export const dynamicParams = false;

export function generateStaticParams() {
  return resources.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/resources/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const resource = getResource(slug);
  if (!resource) return {};
  return { title: resource.name, description: resource.tagline };
}

export default async function ResourcePage({ params }: PageProps<"/resources/[slug]">) {
  const { slug } = await params;
  const resource = getResource(slug);
  if (!resource) notFound();

  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-3xl px-4 py-10 outline-none sm:px-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        All resources
      </Link>

      <div className="mt-6">
        <ResourceHeading resource={toSummary(resource)} />
      </div>

      <div className="mt-8">
        <ResourceDetail resource={toPayload(resource)} />
      </div>
    </main>
  );
}
