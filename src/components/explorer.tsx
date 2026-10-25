"use client";

import Fuse from "fuse.js";
import { MotionConfig } from "framer-motion";
import { Search, SearchX } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { categoryLabels, type Category, type Scope } from "@/content/schema";
import type { ResourceSummary } from "@/content/summary";
import { cn } from "@/lib/utils";
import { HierarchyMap } from "./hierarchy-map";
import { ResourceCard } from "./resource-card";

const scopes: Scope[] = [
  "tenant",
  "management-group",
  "subscription",
  "resource-group",
  "resource",
];

export function Explorer({ resources }: { resources: ResourceSummary[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | null>(null);
  const [scope, setScope] = useState<Scope | null>(null);

  const fuse = useMemo(
    () =>
      new Fuse(resources, {
        keys: [
          { name: "name", weight: 3 },
          { name: "tagline", weight: 2 },
          { name: "type", weight: 1.5 },
          { name: "categoryLabel", weight: 1 },
          { name: "definition", weight: 0.5 },
        ],
        threshold: 0.3,
        ignoreLocation: true,
      }),
    [resources],
  );

  const scopeCounts = useMemo(() => {
    const counts = Object.fromEntries(scopes.map((s) => [s, 0])) as Record<Scope, number>;
    for (const r of resources) counts[r.scope] += 1;
    return counts;
  }, [resources]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<Category, number>();
    for (const r of resources) counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
    return counts;
  }, [resources]);

  const visible = useMemo(() => {
    const base = query.trim() ? fuse.search(query.trim()).map((m) => m.item) : resources;
    return base.filter(
      (r) => (!category || r.category === category) && (!scope || r.scope === scope),
    );
  }, [fuse, query, resources, category, scope]);

  const hasFilters = query.trim() !== "" || category !== null || scope !== null;

  function clearAll() {
    setQuery("");
    setCategory(null);
    setScope(null);
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="grid gap-12">
        <HierarchyMap selected={scope} onSelect={setScope} counts={scopeCounts} />

        <section aria-labelledby="catalog-heading">
          <h2 id="catalog-heading" className="text-xl font-semibold tracking-tight">
            Resource catalog
          </h2>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative sm:max-w-sm sm:flex-1">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search resources, e.g. network, disk"
                aria-label="Search resources"
                className="h-9 pl-8"
              />
            </div>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {visible.length} of {resources.length} shown
            </p>
          </div>

          <div
            role="group"
            aria-label="Filter by category"
            className="mt-3 flex flex-wrap gap-2"
          >
            <FilterChip active={category === null} onClick={() => setCategory(null)}>
              All
            </FilterChip>
            {(Object.keys(categoryLabels) as Category[])
              .filter((c) => categoryCounts.has(c))
              .map((c) => (
                <FilterChip
                  key={c}
                  active={category === c}
                  onClick={() => setCategory(category === c ? null : c)}
                >
                  {categoryLabels[c]}
                  <span className="ml-1.5 text-xs opacity-70">{categoryCounts.get(c)}</span>
                </FilterChip>
              ))}
          </div>

          {visible.length > 0 ? (
            <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((r) => (
                <li key={r.slug}>
                  <ResourceCard resource={r} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-6 flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
              <SearchX aria-hidden="true" className="size-8 text-muted-foreground" />
              <p className="font-medium">No resources match</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Try a different word, or clear the filters to see the whole catalog.
              </p>
              {hasFilters && (
                <Button variant="outline" onClick={clearAll}>
                  Clear filters
                </Button>
              )}
            </div>
          )}
        </section>
      </div>
    </MotionConfig>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center rounded-full border px-3 text-sm transition-colors outline-none",
        "focus-visible:ring-3 focus-visible:ring-ring/50",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-card hover:border-primary/50 hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
