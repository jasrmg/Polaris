"use client";

import { ArrowRight, Check, CircleHelp, ExternalLink, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ResourcePayload } from "@/content/payload";
import { resourcePath } from "@/lib/resource-path";
import { CodeBlock } from "./code-block";

interface ResourceDetailProps {
  resource: ResourcePayload;
  /**
   * When set (inside the modal), links to other resources open in place
   * instead of doing a full navigation.
   */
  onOpenResource?: (slug: string) => void;
}

/** One row that scrolls sideways on narrow screens instead of wrapping. */
const tabsListClass =
  "w-full max-w-full justify-start overflow-x-auto [scrollbar-width:none] sm:w-fit";

function ResourceLink({
  slug,
  onOpen,
  children,
}: {
  slug: string;
  onOpen?: (slug: string) => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={resourcePath(slug)}
      prefetch={false}
      onClick={(e) => {
        if (!onOpen || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        onOpen(slug);
      }}
      className="inline-flex items-center gap-1 rounded-md font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {children}
      <ArrowRight className="size-3" aria-hidden="true" />
    </Link>
  );
}

export function ResourceDetail({ resource, onOpenResource }: ResourceDetailProps) {
  const snippets = [
    { id: "cli", label: "Azure CLI", code: resource.example.cli },
    { id: "powershell", label: "PowerShell", code: resource.example.powershell },
    { id: "bicep", label: "Bicep", code: resource.example.bicep },
    { id: "arm", label: "ARM JSON", code: resource.example.arm },
  ].filter((s): s is { id: string; label: string; code: string } => Boolean(s.code));

  return (
    <Tabs defaultValue="overview" className="gap-4">
      <TabsList className={tabsListClass}>
        <TabsTrigger value="overview" className="flex-none px-3 py-1">Overview</TabsTrigger>
        <TabsTrigger value="prerequisites" className="flex-none px-3 py-1">
          Prerequisites
          <Badge variant="secondary" className="ml-1 h-4 px-1.5">
            {resource.prerequisites.length}
          </Badge>
        </TabsTrigger>
        <TabsTrigger value="configure" className="flex-none px-3 py-1">Configure</TabsTrigger>
        {resource.examNotes.length > 0 && (
          <TabsTrigger value="exam" className="flex-none px-3 py-1">Exam notes</TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="overview" className="grid gap-6">
        <section>
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            What it is
          </h3>
          <p className="mt-2 leading-relaxed">{resource.definition}</p>
          <p className="mt-3 rounded-lg border-l-2 border-primary bg-primary/5 p-3 italic text-muted-foreground">
            {resource.analogy}
          </p>
        </section>

        <div className="grid gap-6 sm:grid-cols-2">
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Use it when
            </h3>
            <ul className="mt-2 grid gap-2">
              {resource.whenToUse.map((item) => (
                <li key={item} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="min-w-0 [overflow-wrap:anywhere]">{item}</span>
                </li>
              ))}
            </ul>
          </section>
          {resource.notFor.length > 0 && (
            <section>
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Not for
              </h3>
              <ul className="mt-2 grid gap-2">
                {resource.notFor.map((item) => (
                  <li key={item} className="flex gap-2">
                    <X className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
                    <span className="min-w-0 [overflow-wrap:anywhere]">{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {resource.related.length > 0 && (
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Related resources
            </h3>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {resource.related.map((slug) => (
                <ResourceLink key={slug} slug={slug} onOpen={onOpenResource}>
                  {resource.linkedNames[slug] ?? slug}
                </ResourceLink>
              ))}
            </div>
          </section>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t pt-4">
          <Button disabled>
            <Sparkles />
            Try it
          </Button>
          <span className="text-xs text-muted-foreground">
            The free simulator is coming soon.
          </span>
          <a
            href={resource.docsUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Microsoft Learn
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        </div>
      </TabsContent>

      <TabsContent value="prerequisites" className="grid gap-3">
        <p className="text-muted-foreground">
          You need these before you can create a {resource.name}, in roughly this order.
        </p>
        <ol className="grid gap-3">
          {resource.prerequisites.map((p, i) => (
            <li key={p.name} className="flex gap-3 rounded-lg border bg-card p-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium">
                {i + 1}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {p.slug ? (
                      <ResourceLink slug={p.slug} onOpen={onOpenResource}>{p.name}</ResourceLink>
                    ) : (
                      p.name
                    )}
                  </span>
                  {p.autoCreated && (
                    <Badge variant="outline">Created for you in the portal</Badge>
                  )}
                </div>
                <p className="mt-1 text-muted-foreground min-w-0 [overflow-wrap:anywhere]">{p.why}</p>
              </div>
            </li>
          ))}
        </ol>
      </TabsContent>

      {/* minmax(0, 1fr): without it a long code line widens the grid column
          past the screen instead of scrolling inside the code block. */}
      <TabsContent value="configure" className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <Tabs defaultValue="portal" className="min-w-0 gap-3">
          <TabsList className={tabsListClass}>
            <TabsTrigger value="portal" className="flex-none px-3 py-1">Portal</TabsTrigger>
            {snippets.map((s) => (
              <TabsTrigger key={s.id} value={s.id} className="flex-none px-3 py-1">
                {s.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="portal">
            <ol className="grid gap-2">
              {resource.example.portal.map((step, i) => (
                <li key={step} className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium">
                    {i + 1}
                  </span>
                  <span className="pt-0.5 min-w-0 [overflow-wrap:anywhere]">{step}</span>
                </li>
              ))}
            </ol>
          </TabsContent>

          {snippets.map((s) => (
            <TabsContent key={s.id} value={s.id}>
              <CodeBlock code={s.code} label={s.label} />
            </TabsContent>
          ))}
        </Tabs>
        {!resource.example.arm && (
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <CircleHelp className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            No ARM JSON is shown for this resource. In the portal you can export one from the
            resource group (Export template) and convert it with az bicep decompile.
          </p>
        )}
      </TabsContent>

      {resource.examNotes.length > 0 && (
        <TabsContent value="exam" className="grid gap-3">
          <p className="text-muted-foreground">
            Things the AZ-104 exam likes to ask about a {resource.name}.
          </p>
          <ul className="grid gap-2">
            {resource.examNotes.map((note) => (
              <li key={note} className="flex gap-2 rounded-lg border bg-card p-3">
                <CircleHelp className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 [overflow-wrap:anywhere]">{note}</span>
              </li>
            ))}
          </ul>
        </TabsContent>
      )}
    </Tabs>
  );
}
