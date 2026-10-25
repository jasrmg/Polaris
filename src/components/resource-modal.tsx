"use client";

import { X } from "lucide-react";
import { Suspense, use, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import type { ResourcePayload } from "@/content/payload";
import type { ResourceSummary } from "@/content/summary";
import { resourceDataPath } from "@/lib/resource-path";
import { useMediaQuery } from "@/lib/use-media-query";
import { ResourceDetail } from "./resource-detail";
import { ResourceHeading } from "./resource-heading";

type Result = { ok: true; data: ResourcePayload } | { ok: false };

// One request per resource per page load. Failures are not cached so Retry works.
const cache = new Map<string, Promise<Result>>();

function loadResource(slug: string): Promise<Result> {
  let promise = cache.get(slug);
  if (!promise) {
    promise = fetch(resourceDataPath(slug))
      .then(async (res): Promise<Result> =>
        res.ok ? { ok: true, data: (await res.json()) as ResourcePayload } : { ok: false },
      )
      .catch((): Result => ({ ok: false }));
    cache.set(slug, promise);
    void promise.then((r) => {
      if (!r.ok) cache.delete(slug);
    });
  }
  return promise;
}

function DetailBody({
  slug,
  onOpenResource,
  onRetry,
}: {
  slug: string;
  onOpenResource: (slug: string) => void;
  onRetry: () => void;
}) {
  const result = use(loadResource(slug));

  if (!result.ok) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-6">
        <p className="font-medium">Could not load the details.</p>
        <p className="text-sm text-muted-foreground">
          Check your connection and try again.
        </p>
        <Button variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

  return <ResourceDetail resource={result.data} onOpenResource={onOpenResource} />;
}

function DetailSkeleton() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Loading details">
      <div className="h-8 w-64 animate-pulse rounded-lg bg-muted" />
      <div className="h-4 w-full animate-pulse rounded bg-muted" />
      <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
      <div className="h-24 w-full animate-pulse rounded-lg bg-muted" />
    </div>
  );
}

/**
 * The header only sticks when the window is tall enough to leave room for
 * the body. In short windows it scrolls away with the content instead.
 */
const stickyHeader =
  "border-b bg-popover [@media(min-height:700px)]:sticky [@media(min-height:700px)]:top-0 [@media(min-height:700px)]:z-10";

interface ResourceModalProps {
  /** The resource to show, or null when closed. */
  resource: ResourceSummary | null;
  onClose: () => void;
  onOpenResource: (slug: string) => void;
}

export function ResourceModal({ resource, onClose, onOpenResource }: ResourceModalProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const open = resource !== null;

  // Keep rendering the last resource while the close animation plays.
  const [shown, setShown] = useState<ResourceSummary | null>(resource);
  if (resource && resource.slug !== shown?.slug) setShown(resource);

  const [attempt, setAttempt] = useState(0);

  if (!shown) return null;

  const body = (
    <Suspense key={`${shown.slug}:${attempt}`} fallback={<DetailSkeleton />}>
      <DetailBody
        slug={shown.slug}
        onOpenResource={onOpenResource}
        onRetry={() => setAttempt((n) => n + 1)}
      />
    </Suspense>
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[88dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
        >
          {/* Header and body scroll together, so a short window can never
              squeeze the body to nothing. On tall windows the header sticks. */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className={`relative ${stickyHeader} p-6 pr-14`}>
              <ResourceHeading
                resource={shown}
                Title={DialogTitle}
                Description={DialogDescription}
              />
              <DialogClose
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="absolute right-3 top-3"
                  />
                }
              >
                <X />
                <span className="sr-only">Close</span>
              </DialogClose>
            </div>
            <div className="p-6">{body}</div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={(next) => !next && onClose()} showSwipeHandle>
      <DrawerContent>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className={`${stickyHeader} p-4`}>
            <ResourceHeading
              resource={shown}
              Title={DrawerTitle}
              Description={DrawerDescription}
            />
          </div>
          <div className="p-4">{body}</div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
