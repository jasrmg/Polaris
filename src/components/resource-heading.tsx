import type { ElementType } from "react";
import { Badge } from "@/components/ui/badge";
import { scopeLabels } from "@/content/schema";
import type { ResourceSummary } from "@/content/summary";
import { ResourceIcon } from "./resource-icon";

interface ResourceHeadingProps {
  resource: ResourceSummary;
  /** Lets the dialog, drawer and full page each supply their own accessible title element. */
  Title?: ElementType;
  Description?: ElementType;
}

export function ResourceHeading({
  resource,
  Title = "h1",
  Description = "p",
}: ResourceHeadingProps) {
  return (
    <div className="flex items-start gap-4">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <ResourceIcon name={resource.icon} className="size-6" />
      </span>
      <div className="min-w-0">
        <Title className="text-xl font-semibold leading-tight tracking-tight">
          {resource.name}
        </Title>
        <p className="mt-0.5 break-all font-mono text-[11px] text-muted-foreground">
          {resource.type}
        </p>
        <Description className="mt-2 text-sm text-muted-foreground">
          {resource.tagline}
        </Description>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant="secondary">{resource.categoryLabel}</Badge>
          <Badge variant="outline">{resource.tierLabel}</Badge>
          <Badge variant="outline">{scopeLabels[resource.scope]}</Badge>
          {resource.kind !== "azure-resource" && (
            <Badge variant="outline">{resource.kindLabel}</Badge>
          )}
          {resource.examLabels.map((label) => (
            <Badge key={label} variant="outline">
              {label}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}
