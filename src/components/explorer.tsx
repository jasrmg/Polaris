"use client";

import Fuse from "fuse.js";
import { MotionConfig } from "framer-motion";
import { Search, SearchX } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  categoryLabels,
  examLabels,
  kindLabels,
  tierLabels,
  type Category,
  type Exam,
  type Kind,
  type Scope,
  type Tier,
} from "@/content/schema";
import type { ResourceSummary } from "@/content/summary";
import { resourcePath, slugFromPathname } from "@/lib/resource-path";
import { cn } from "@/lib/utils";
import { HierarchyMap } from "./hierarchy-map";
import { ResourceCard } from "./resource-card";
import { ResourceModal } from "./resource-modal";

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
  const [kind, setKind] = useState<Kind | null>(null);
  const [exam, setExam] = useState<Exam | null>(null);
  const [tier, setTier] = useState<Tier | null>(null);

  // The URL is the source of truth for the modal. Opening pushes
  // /resources/<slug>/ with the native History API (Next syncs usePathname),
  // so refresh, copy-link and the back button all behave like a real page.
  const pathname = usePathname();
  const activeSlug = slugFromPathname(pathname);
  const activeResource = useMemo(
    () => resources.find((r) => r.slug === activeSlug) ?? null,
    [resources, activeSlug],
  );

  const openResource = useCallback(
    (slug: string) => {
      const url = resourcePath(slug);
      // Switching resources inside the modal replaces the entry, so Back
      // always returns to the catalog instead of walking a chain of modals.
      if (activeSlug) window.history.replaceState(null, "", url);
      else window.history.pushState(null, "", url);
    },
    [activeSlug],
  );

  const closeResource = useCallback(() => window.history.back(), []);

  const fuse = useMemo(
    () =>
      new Fuse(resources, {
        keys: [
          { name: "name", weight: 3 },
          { name: "tagline", weight: 2 },
          { name: "type", weight: 1.5 },
          { name: "categoryLabel", weight: 1 },
          { name: "kindLabel", weight: 1 },
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

  // Search and level narrow the list first. Category counts are computed from
  // that narrowed list, so a chip never promises results a click can't deliver.
  const narrowed = useMemo(() => {
    const base = query.trim() ? fuse.search(query.trim()).map((m) => m.item) : resources;
    return base.filter((r) => {
      if (scope && r.scope !== scope) return false;
      if (kind && r.kind !== kind) return false;
      if (exam && !r.exams.includes(exam)) return false;
      if (tier && r.tier !== tier) return false;
      return true;
    });
  }, [fuse, query, resources, scope, kind, exam, tier]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<Category, number>();
    for (const r of narrowed) counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
    return counts;
  }, [narrowed]);

  // Chips exist for every category in the catalog, not just the narrowed list.
  const catalogCategories = useMemo(
    () => (Object.keys(categoryLabels) as Category[]).filter((c) => resources.some((r) => r.category === c)),
    [resources],
  );

  const visible = useMemo(
    () => (category ? narrowed.filter((r) => r.category === category) : narrowed),
    [narrowed, category],
  );

  const presentKinds = useMemo(
    () => (Object.keys(kindLabels) as Kind[]).filter((k) => resources.some((r) => r.kind === k)),
    [resources],
  );
  const presentExams = useMemo(
    () => (Object.keys(examLabels) as Exam[]).filter((e) => resources.some((r) => r.exams.includes(e))),
    [resources],
  );
  const presentTiers = useMemo(
    () => ([1, 2, 3] as Tier[]).filter((t) => resources.some((r) => r.tier === t)),
    [resources],
  );

  const hasFilters =
    query.trim() !== "" ||
    category !== null ||
    scope !== null ||
    kind !== null ||
    exam !== null ||
    tier !== null;

  function clearAll() {
    setQuery("");
    setCategory(null);
    setScope(null);
    setKind(null);
    setExam(null);
    setTier(null);
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="grid min-w-0 gap-12">
        <HierarchyMap selected={scope} onSelect={setScope} counts={scopeCounts} />

        <section aria-labelledby="catalog-heading" className="min-w-0">
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
            {catalogCategories.map((c) => {
              const count = categoryCounts.get(c) ?? 0;
              return (
                <FilterChip
                  key={c}
                  active={category === c}
                  disabled={count === 0 && category !== c}
                  onClick={() => setCategory(category === c ? null : c)}
                >
                  {categoryLabels[c]}
                  <span className="ml-1.5 text-xs opacity-70">{count}</span>
                </FilterChip>
              );
            })}
          </div>

          <div role="group" aria-label="Filter by kind, exam and fidelity" className="mt-2 flex flex-wrap gap-2">
            {presentKinds.map((k) => (
              <FilterChip key={k} active={kind === k} onClick={() => setKind(kind === k ? null : k)}>
                {kindLabels[k]}
              </FilterChip>
            ))}
            {presentExams.map((e) => (
              <FilterChip key={e} active={exam === e} onClick={() => setExam(exam === e ? null : e)}>
                {examLabels[e]}
              </FilterChip>
            ))}
            {presentTiers.map((t) => (
              <FilterChip key={t} active={tier === t} onClick={() => setTier(tier === t ? null : t)}>
                {tierLabels[t]}
              </FilterChip>
            ))}
          </div>

          {visible.length > 0 ? (
            <ul className="mt-6 grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((r) => (
                <li key={r.slug} className="min-w-0">
                  <ResourceCard resource={r} onOpen={openResource} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-6 flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
              <SearchX aria-hidden="true" className="size-8 text-muted-foreground" />
              <p className="font-medium">
                {scope && scopeCounts[scope] === 0
                  ? "Nothing at this level yet"
                  : "No resources match"}
              </p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {scope && scopeCounts[scope] === 0
                  ? "This level is explained above, but it has no catalog entries yet. Clear the filter to see what is available."
                  : "Try a different word, or clear the filters to see the whole catalog."}
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

      <ResourceModal
        resource={activeResource}
        onClose={closeResource}
        onOpenResource={openResource}
      />
    </MotionConfig>
  );
}

function FilterChip({
  active,
  disabled = false,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center rounded-full border px-3 text-sm transition-colors outline-none",
        "focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-45",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-card hover:border-primary/50 hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
