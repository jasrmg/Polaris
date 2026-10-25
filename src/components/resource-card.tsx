import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { scopeLabels } from "@/content/schema";
import type { ResourceSummary } from "@/content/summary";
import { resourcePath } from "@/lib/resource-path";
import { ResourceIcon } from "./resource-icon";

interface ResourceCardProps {
  resource: ResourceSummary;
  onOpen: (slug: string) => void;
}

/**
 * A real link to the resource's full page, so middle-click, copy-link and
 * "open in new tab" work. A plain click opens the modal instead.
 */
export function ResourceCard({ resource, onOpen }: ResourceCardProps) {
  return (
    <Link
      href={resourcePath(resource.slug)}
      prefetch={false}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        onOpen(resource.slug);
      }}
      className="group block h-full rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <article className="flex h-full flex-col gap-3 rounded-xl border bg-card p-5 transition-colors group-hover:border-primary/50 group-hover:bg-accent/40">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ResourceIcon name={resource.icon} className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-medium leading-tight">{resource.name}</h3>
            <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
              {resource.type}
            </p>
          </div>
          <ChevronRight
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
          />
        </div>

        <p className="text-sm text-muted-foreground">{resource.tagline}</p>

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          <Badge variant="secondary">{resource.categoryLabel}</Badge>
          <Badge variant="outline">{scopeLabels[resource.scope]}</Badge>
          <span className="ml-auto text-xs text-muted-foreground">
            {resource.prerequisiteCount} prerequisites
          </span>
        </div>
      </article>
    </Link>
  );
}
