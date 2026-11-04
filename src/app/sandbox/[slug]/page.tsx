import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CreateView } from "@/components/sandbox/create-view";
import { getResource } from "@/content";
import { TRY_SLUGS, isTrySlug } from "@/lib/sandbox-path";

export const dynamicParams = false;

export function generateStaticParams() {
  return TRY_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/sandbox/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  if (slug === "network-interface") {
    return { title: "Create a network interface", description: "Simulated. Nothing here touches real Azure." };
  }
  const resource = isTrySlug(slug) ? getResource(slug) : undefined;
  if (!resource) return {};
  return { title: `Create ${resource.name}`, description: "Simulated. Nothing here touches real Azure." };
}

export default async function SandboxCreatePage({ params }: PageProps<"/sandbox/[slug]">) {
  const { slug } = await params;
  if (!isTrySlug(slug)) notFound();

  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-3xl px-4 py-10 outline-none sm:px-6">
      <CreateView slug={slug} />
    </main>
  );
}
