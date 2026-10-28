"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { Fragment } from "react";
import { Button } from "@/components/ui/button";
import { hierarchy } from "@/content/hierarchy";
import type { Scope } from "@/content/schema";
import { cn } from "@/lib/utils";
import { ResourceIcon } from "./resource-icon";

interface HierarchyMapProps {
  selected: Scope | null;
  onSelect: (scope: Scope | null) => void;
  /** How many catalog entries live at each level. */
  counts: Record<Scope, number>;
}

export function HierarchyMap({ selected, onSelect, counts }: HierarchyMapProps) {
  const active = hierarchy.find((n) => n.scope === selected) ?? null;

  return (
    <section aria-labelledby="hierarchy-heading" className="min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="hierarchy-heading" className="text-xl font-semibold tracking-tight">
            How Azure is organised
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Select a level to learn what it is and filter the catalog below.
          </p>
        </div>
      </div>

      <ol className="mt-5 flex flex-col items-stretch gap-1 md:flex-row md:items-stretch md:gap-0">
        {hierarchy.map((node, i) => {
          const isActive = node.scope === selected;
          return (
            <Fragment key={node.scope}>
              <li className="flex-1">
                <button
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => onSelect(isActive ? null : node.scope)}
                  className={cn(
                    "flex h-full w-full items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors outline-none md:flex-col md:items-start md:gap-2 md:p-4",
                    "hover:border-primary/50 focus-visible:ring-3 focus-visible:ring-ring/50",
                    isActive && "border-primary bg-primary/10",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground",
                      isActive && "bg-primary text-primary-foreground",
                    )}
                  >
                    <ResourceIcon name={node.icon} className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{node.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {counts[node.scope] > 0 ? `${counts[node.scope]} in catalog` : "Not in catalog yet"}
                    </span>
                  </span>
                </button>
              </li>
              {i < hierarchy.length - 1 && (
                <li
                  aria-hidden="true"
                  className="flex items-center justify-center text-muted-foreground md:px-1"
                >
                  <ChevronDown className="size-4 md:hidden" />
                  <ChevronRight className="hidden size-4 md:block" />
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>

      <div className="mt-4 min-h-28" aria-live="polite">
        <AnimatePresence mode="wait">
          {active ? (
            <motion.div
              key={active.scope}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="rounded-xl border border-primary/30 bg-card p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium">{active.name}</h3>
                  <p className="text-sm text-primary">{active.tagline}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onSelect(null)}
                  aria-label="Clear level filter"
                >
                  <X />
                </Button>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {active.definition}
              </p>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Example
                  </dt>
                  <dd className="mt-1 font-mono text-xs">{active.example}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Contains
                  </dt>
                  <dd className="mt-1">{active.contains}</dd>
                </div>
              </dl>
            </motion.div>
          ) : (
            <motion.p
              key="hint"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground"
            >
              Everything you create in Azure lives inside this tree. Pick a level to
              see how it fits.
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
