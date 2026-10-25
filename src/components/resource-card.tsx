import { Badge } from "@/components/ui/badge";
import { scopeLabels } from "@/content/schema";
import type { ResourceSummary } from "@/content/summary";
import { ResourceIcon } from "./resource-icon";

export function ResourceCard({ resource }: { resource: ResourceSummary }) {
  return (
    <article className="flex h-full flex-col gap-3 rounded-xl border bg-card p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ResourceIcon name={resource.icon} className="size-5" />
        </span>
        <div className="min-w-0">
          <h3 className="font-medium leading-tight">{resource.name}</h3>
          <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
            {resource.type}
          </p>
        </div>
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
  );
}
