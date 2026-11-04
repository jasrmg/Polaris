"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { resourcePath } from "@/lib/resource-path";
import { TRY_SLUGS, sandboxCreatePath, type TrySlug } from "@/lib/sandbox-path";
import { SandboxBanner } from "./sandbox-banner";
import { useSandbox } from "./use-sandbox";

const CREATE_LINKS: { slug: TrySlug; label: string }[] = [
  { slug: "resource-group", label: "Resource group" },
  { slug: "virtual-network", label: "Virtual network" },
  { slug: "subnet", label: "Subnet" },
  { slug: "virtual-machine", label: "Virtual machine" },
  { slug: "storage-account", label: "Storage account" },
];

function powerText(state: string): string {
  if (state === "Stopped") return "Stopped (Allocated)";
  if (state === "Deallocated") return "Stopped (Deallocated)";
  return state;
}

export function EnvironmentView() {
  const session = useSandbox();
  const [message, setMessage] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [pendingReset, setPendingReset] = useState(false);

  if (!session.ready) {
    return <p className="text-sm text-muted-foreground">Loading the simulated subscription…</p>;
  }
  if (session.loadError || !session.world) {
    return (
      <div className="grid gap-3">
        <SandboxBanner />
        <p role="alert" className="text-sm">{session.loadError ?? "The saved world could not be read."}</p>
        <Button type="button" onClick={session.reset}>Start a new subscription</Button>
      </div>
    );
  }

  const world = session.world;
  const groups = Object.values(world.resourceGroups).sort((a, b) => a.name.localeCompare(b.name));
  const resources = Object.values(world.resources).sort((a, b) => a.name.localeCompare(b.name));

  async function removeGroup(id: string) {
    const error = await session.apply((engine, current) => engine.deleteResourceGroup(current, id));
    setMessage(error ? error.message : null);
    setPendingDelete(null);
  }

  async function removeResource(id: string) {
    const error = await session.apply((engine, current) => engine.deleteResource(current, id));
    setMessage(error ? error.message : null);
    setPendingDelete(null);
  }

  async function changePower(id: string, action: "start" | "stop" | "deallocate") {
    const error = await session.apply((engine, current) => engine.setPower(current, id, action));
    setMessage(error ? error.message : null);
  }

  return (
    <div className="grid gap-6">
      <SandboxBanner />
      <p className="text-sm text-muted-foreground">
        Signed in as {session.actorName}, Owner on {session.subscriptionName}.
      </p>
      <div className="flex flex-wrap gap-2">
        {CREATE_LINKS.map((item) => (
          <Link
            key={item.slug}
            href={sandboxCreatePath(item.slug)}
            className="inline-flex h-8 items-center rounded-lg border px-2.5 text-sm hover:bg-muted"
          >
            Create {item.label.toLowerCase()}
          </Link>
        ))}
        {pendingReset ? (
          <Button type="button" variant="outline" onClick={() => { setMessage(null); setPendingReset(false); session.reset(); }}>
            Confirm reset
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={() => setPendingReset(true)}>
            Reset subscription
          </Button>
        )}
      </div>
      {message && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm min-w-0 [overflow-wrap:anywhere]">
          {message}
        </p>
      )}
      {groups.length === 0 && resources.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing created yet. Start with a resource group. The catalog entries are still at{" "}
          <Link href="/" className="text-primary underline-offset-4 hover:underline">the atlas</Link>.
        </p>
      ) : (
        <ul className="grid gap-3">
          {groups.map((group) => {
            const inside = resources.filter((resource) => resource.resourceGroup.toLowerCase() === group.name.toLowerCase());
            return (
              <li key={group.id} className="rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium [overflow-wrap:anywhere]">{group.name}</p>
                    <p className="text-xs text-muted-foreground">{group.location} · Resource group</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{group.provisioningState}</Badge>
                    {pendingDelete === group.id ? (
                      <Button type="button" variant="destructive" size="sm" onClick={() => removeGroup(group.id)}>
                        Confirm delete
                      </Button>
                    ) : (
                      <Button type="button" variant="outline" size="sm" onClick={() => setPendingDelete(group.id)}>
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
                {inside.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">No resources in this group.</p>
                ) : (
                  <ul className="mt-3 grid gap-2">
                    {inside.map((resource) => {
                      const powerState = typeof resource.properties.powerState === "string" ? resource.properties.powerState : null;
                      const provisioning = typeof resource.properties.provisioningState === "string" ? resource.properties.provisioningState : null;
                      const isVm = resource.type.toLowerCase() === "microsoft.compute/virtualmachines";
                      const canPower = provisioning === "Succeeded";
                      return (
                        <li key={resource.id} className="rounded-lg border p-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-medium [overflow-wrap:anywhere]">{resource.name}</p>
                              <p className="font-mono text-[11px] text-muted-foreground [overflow-wrap:anywhere]">{resource.type}</p>
                              <p className="text-xs text-muted-foreground">{resource.location}</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {provisioning && <Badge variant="secondary">{provisioning}</Badge>}
                              {powerState && <Badge variant="outline">{powerText(powerState)}</Badge>}
                              {powerState === "Stopped" && (
                                <span className="text-xs text-muted-foreground">Still billed</span>
                              )}
                              {pendingDelete === resource.id ? (
                                <Button type="button" variant="destructive" size="sm" onClick={() => removeResource(resource.id)}>
                                  Confirm delete
                                </Button>
                              ) : (
                                <Button type="button" variant="outline" size="sm" onClick={() => setPendingDelete(resource.id)}>
                                  Delete
                                </Button>
                              )}
                            </div>
                          </div>
                          {isVm && powerState && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Button type="button" size="sm" variant="outline" disabled={!canPower || (powerState !== "Stopped" && powerState !== "Deallocated")} onClick={() => changePower(resource.id, "start")}>
                                Start
                              </Button>
                              <Button type="button" size="sm" variant="outline" disabled={!canPower || (powerState !== "Running" && powerState !== "Starting")} onClick={() => changePower(resource.id, "stop")}>
                                Stop
                              </Button>
                              <Button type="button" size="sm" variant="outline" disabled={!canPower || (powerState !== "Running" && powerState !== "Stopped" && powerState !== "Starting" && powerState !== "Stopping")} onClick={() => changePower(resource.id, "deallocate")}>
                                Deallocate
                              </Button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Try it in this slice: {TRY_SLUGS.map((slug, index) => (
          <span key={slug}>
            {index > 0 ? ", " : ""}
            <Link href={resourcePath(slug)} className="underline-offset-4 hover:underline">{slug}</Link>
          </span>
        ))}
        . Other catalog entries stay documentation until their forms are added.
      </p>
    </div>
  );
}
