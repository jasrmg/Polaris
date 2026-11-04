"use client";

import { useCallback, useEffect, useState } from "react";
import type { EngineError, World } from "@/engine/azure";

type Engine = typeof import("@/engine/azure");

function loadEngine(): Promise<Engine> {
  return import("@/engine/azure");
}

export function useSandbox() {
  const [world, setWorld] = useState<World | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [engine, setEngine] = useState<Engine | null>(null);

  useEffect(() => {
    let cancel = false;
    loadEngine().then((loaded) => {
      if (cancel) return;
      setEngine(loaded);
      const store = loaded.worldStore(window.localStorage);
      const existing = loaded.loadWorld(store);
      if (existing.ok) {
        setWorld(existing.world);
      } else if (existing.error === "No saved world.") {
        setWorld(loaded.resetWorld(store, new Date().toISOString()));
      } else {
        setLoadError(existing.error);
      }
      setReady(true);
    }).catch(() => {
      if (!cancel) {
        setLoadError("The sandbox could not load.");
        setReady(true);
      }
    });
    return () => {
      cancel = true;
    };
  }, []);

  const persist = useCallback((loaded: Engine, next: World) => {
    loaded.saveWorld(loaded.worldStore(window.localStorage), next, new Date().toISOString());
    setWorld(next);
  }, []);

  const apply = useCallback(async (
    op: (loaded: Engine, current: World) => { ok: boolean; value?: World; error?: EngineError },
  ): Promise<EngineError | null> => {
    if (!engine || !world) {
      return { code: "NotReady", message: "The sandbox is still loading.", step: "parse" };
    }
    const result = op(engine, world);
    if (!result.ok || !result.value) {
      return result.error ?? { code: "Failed", message: "The sandbox could not apply that.", step: "apply" };
    }
    persist(engine, result.value);
    return null;
  }, [engine, persist, world]);

  const reset = useCallback(() => {
    if (!engine) return;
    const next = engine.resetWorld(engine.worldStore(window.localStorage), new Date().toISOString());
    setWorld(next);
    setLoadError(null);
  }, [engine]);

  const subscriptionName = world
    ? Object.values(world.subscriptions).find((item) => item.subscriptionId === world.session.subscriptionId)?.displayName ?? "Default subscription"
    : "Default subscription";
  const actorName = world
    ? world.directory.users[world.session.actingPrincipalId]?.displayName ?? "You"
    : "You";

  return { ready, loadError, world, engine, subscriptionName, actorName, apply, reset };
}
