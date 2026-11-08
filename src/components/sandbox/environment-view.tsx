"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { assignedPrivateIp } from "@/engine/azure/addresses";
import type { EngineError, InboundCheck, Resource, World } from "@/engine/azure";
import { resourcePath } from "@/lib/resource-path";
import { TRY_SLUGS, sandboxCreatePath, type TrySlug } from "@/lib/sandbox-path";
import { SandboxBanner } from "./sandbox-banner";
import { useSandbox } from "./use-sandbox";

const CREATE_LINKS: { slug: TrySlug; label: string }[] = [
  { slug: "resource-group", label: "Resource group" },
  { slug: "virtual-network", label: "Virtual network" },
  { slug: "subnet", label: "Subnet" },
  { slug: "public-ip-address", label: "Public IP address" },
  { slug: "network-security-group", label: "Network security group" },
  { slug: "network-interface", label: "Network interface" },
  { slug: "virtual-machine", label: "Virtual machine" },
  { slug: "storage-account", label: "Storage account" },
];

const healthyBadge = "border-transparent bg-emerald-600/15 text-emerald-800 dark:text-emerald-300";
const selectClass =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function typeIs(resource: Resource, typeKey: string): boolean {
  return resource.type.toLowerCase() === typeKey;
}

function firstId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return null;
}

function named(resources: Resource[], id: string): string {
  return resources.find((item) => item.id.toLowerCase() === id.toLowerCase())?.name ?? id;
}

function chosen(resources: Resource[], current: string | null): string {
  if (current && resources.some((item) => item.id.toLowerCase() === current.toLowerCase())) return current;
  return resources[0]?.id ?? "";
}

function linkLines(resource: Resource, resources: Resource[], world: World): string[] {
  const lines: string[] = [];
  if (typeIs(resource, "microsoft.network/networkinterfaces")) {
    const address = assignedPrivateIp(world, resource);
    if (address) lines.push(`Private IP address: ${address}. The sandbox uses the lowest free address. Azure does not guarantee that order.`);
  }
  const nicId = firstId(resource.properties.nicIds);
  if (nicId) lines.push(`Network interface: ${named(resources, nicId)}`);
  const pipId = firstId(resource.properties.publicIpAddressId);
  if (pipId) lines.push(`Public IP address: ${named(resources, pipId)}`);
  const nsgId = firstId(resource.properties.networkSecurityGroupId);
  if (nsgId) lines.push(`Network security group: ${named(resources, nsgId)}`);
  const routeTableId = firstId(resource.properties.routeTableId);
  if (routeTableId) lines.push(`Route table: ${named(resources, routeTableId)}`);
  if (Array.isArray(resource.properties.routes)) {
    for (const route of resource.properties.routes) {
      if (!route || typeof route !== "object") continue;
      const name = (route as { name?: unknown }).name;
      const props = (route as { properties?: unknown }).properties;
      if (typeof name !== "string" || !props || typeof props !== "object") continue;
      const prefix = (props as { addressPrefix?: unknown }).addressPrefix;
      const nextHop = (props as { nextHopType?: unknown }).nextHopType;
      if (typeof prefix === "string" && typeof nextHop === "string") lines.push(`Route ${name}, ${prefix}, next hop ${nextHop}.`);
    }
  }
  const rules = resource.properties.securityRules;
  if (!Array.isArray(rules)) return lines;
  for (const rule of rules) {
    if (!rule || typeof rule !== "object") continue;
    const props = (rule as { properties?: unknown }).properties;
    if (!props || typeof props !== "object") continue;
    const fields = props as {
      destinationPortRange?: unknown;
      sourceAddressPrefix?: unknown;
      destinationAddressPrefix?: unknown;
      access?: unknown;
      priority?: unknown;
      direction?: unknown;
      protocol?: unknown;
    };
    if (fields.protocol !== "Tcp") continue;
    const vnet = fields.sourceAddressPrefix === "VirtualNetwork" || fields.destinationAddressPrefix === "VirtualNetwork";
    const where = vnet ? "Source and destination Virtual network." : fields.direction === "Outbound" ? "Destination Internet." : "Source Internet.";
    if (fields.direction === "Inbound" || fields.direction === "Outbound") {
      lines.push(`${fields.direction} TCP ${String(fields.destinationPortRange)} ${String(fields.access)}, priority ${String(fields.priority)}. ${where}`);
    }
  }
  return lines;
}

function StateBadge({ label, tone }: { label: string; tone: "healthy" | "failed" | "neutral" }) {
  if (tone === "failed") return <Badge variant="destructive">{label}</Badge>;
  if (tone === "healthy") return <Badge variant="outline" className={healthyBadge}>{label}</Badge>;
  return <Badge variant="secondary">{label}</Badge>;
}

function provisioningTone(state: string): "healthy" | "failed" | "neutral" {
  if (state === "Succeeded") return "healthy";
  if (state === "Failed" || state === "Canceled") return "failed";
  return "neutral";
}

function CheckForm({
  label,
  note,
  result,
  onSubmit,
}: {
  label: string;
  note: string;
  result?: InboundCheck & { details: string[] };
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="grid gap-2" onSubmit={onSubmit}>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className="grid min-w-0 gap-1 text-sm">
          {label}
          <Input name="port" type="number" defaultValue={443} />
        </label>
        <Button type="submit" size="sm">Check</Button>
      </div>
      <p className="text-xs text-muted-foreground">{note}</p>
      {result && (
        <div className="rounded-lg border p-3 text-sm">
          <p className={result.allowed ? "text-emerald-800 dark:text-emerald-300" : undefined}>{result.summary}</p>
          <ul className="mt-2 grid gap-1 text-xs text-muted-foreground">
            {result.details.map((line) => (
              <li key={line} className="min-w-0 [overflow-wrap:anywhere]">{line}</li>
            ))}
          </ul>
          <a href={result.learnUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-primary underline-offset-4 hover:underline">
            Microsoft Learn
          </a>
        </div>
      )}
    </form>
  );
}

function powerText(state: string): string {
  if (state === "Stopped") return "Stopped (Allocated)";
  if (state === "Deallocated") return "Stopped (Deallocated)";
  return state;
}

export function EnvironmentView() {
  const session = useSandbox();
  const [error, setError] = useState<EngineError | null>(null);
  const [checks, setChecks] = useState<Record<string, InboundCheck & { details: string[] }>>({});
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

  async function run(op: Parameters<typeof session.apply>[0]) {
    setError(await session.apply(op));
    setPendingDelete(null);
  }

  async function removeGroup(id: string) {
    await run((engine, current) => engine.deleteResourceGroup(current, id));
  }

  async function removeResource(id: string) {
    await run((engine, current) => engine.deleteResource(current, id));
  }

  async function changePower(id: string, action: "start" | "stop" | "deallocate") {
    await run((engine, current) => engine.setPower(current, id, action));
  }

  function attachNic(vmId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nicId = String(new FormData(event.currentTarget).get("nic") ?? "");
    if (!nicId) return;
    void run((engine, current) => engine.attachNetworkInterface(current, vmId, nicId));
  }

  function attachPip(nicId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const publicIpId = String(new FormData(event.currentTarget).get("pip") ?? "");
    if (!publicIpId) return;
    void run((engine, current) => engine.attachPublicIp(current, nicId, publicIpId));
  }

  function associateNicNsg(nicId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nsgId = String(new FormData(event.currentTarget).get("nsg") ?? "");
    if (!nsgId) return;
    void run((engine, current) => engine.associateNicSecurityGroup(current, nicId, nsgId));
  }

  function addRule(nsgId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const direction = data.get("direction") === "Inbound" ? "Inbound" : "Outbound";
    void run((engine, current) => engine.addSecurityRule(current, nsgId, {
      direction,
      scope: data.get("scope") === "internet" ? "internet" : "vnet",
      port: Number(data.get("port")),
      priority: Number(data.get("priority")),
      access: data.get("access") === "Deny" ? "Deny" : "Allow",
    }));
  }

  function associateNsg(subnetId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const nsgId = String(data.get("nsg") ?? "");
    if (!nsgId) return;
    void run((engine, current) => engine.addInboundRule(current, subnetId, nsgId, {
      port: Number(data.get("port")),
      priority: Number(data.get("priority")),
      access: data.get("access") === "Deny" ? "Deny" : "Allow",
    }));
  }

  function addSubnetRoute(subnetId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const nextHop = data.get("nextHop") === "Internet" ? "Internet" : "None";
    void run((engine, current) => engine.addInternetRoute(current, subnetId, {
      tableName: String(data.get("tableName") ?? ""),
      routeName: String(data.get("routeName") ?? ""),
      nextHop,
    }));
  }

    function checkTraffic(vmId: string, direction: "in" | "out", event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session.engine || !session.world) return;
    const port = Number(new FormData(event.currentTarget).get("port"));
    const result = direction === "in"
      ? session.engine.checkInboundInternet(session.world, vmId, port)
      : session.engine.checkOutboundInternet(session.world, vmId, port);
    if (!result.ok || !result.value) {
      setError(result.error ?? { code: "Failed", message: "The check could not run.", step: "validate" });
      return;
    }
    setError(null);
    setChecks((current) => ({
      ...current,
      [`${vmId}:${direction}`]: {
        ...result.value!,
        details: result.trace.flatMap((line) => line.detail ? [line.detail] : []),
      },
    }));
  }

  function checkVnet(vmId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session.engine || !session.world) return;
    const data = new FormData(event.currentTarget);
    const result = session.engine.checkSameVirtualNetwork(session.world, vmId, String(data.get("address") ?? ""), Number(data.get("port")));
    if (!result.ok || !result.value) {
      setError(result.error ?? { code: "Failed", message: "The check could not run.", step: "validate" });
      return;
    }
    setError(null);
    setChecks((current) => ({
      ...current,
      [`${vmId}:vnet`]: {
        ...result.value!,
        details: result.trace.flatMap((line) => line.detail ? [line.detail] : []),
      },
    }));
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
          <Button type="button" variant="outline" onClick={() => { setError(null); setChecks({}); setPendingReset(false); session.reset(); }}>
            Confirm reset
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={() => setPendingReset(true)}>
            Reset subscription
          </Button>
        )}
      </div>
      {error && (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm min-w-0 [overflow-wrap:anywhere]">
          <p>{error.message}</p>
          {error.next && <p className="mt-1">Next: {error.next}</p>}
          <p className="mt-1 text-muted-foreground">Stopped at {error.step} ({error.code}).</p>
          {error.learnUrl && (
            <a href={error.learnUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-primary underline-offset-4 hover:underline">
              Microsoft Learn
            </a>
          )}
        </div>
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
                    <StateBadge label={group.provisioningState} tone={provisioningTone(group.provisioningState)} />
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
                      const isVm = typeIs(resource, "microsoft.compute/virtualmachines");
                      const isNic = typeIs(resource, "microsoft.network/networkinterfaces");
                      const isSubnet = typeIs(resource, "microsoft.network/virtualnetworks/subnets");
                      const isNsg = typeIs(resource, "microsoft.network/networksecuritygroups");
                      const canPower = provisioning === "Succeeded";
                      const links = linkLines(resource, resources, world);
                      const nics = inside.filter((item) => typeIs(item, "microsoft.network/networkinterfaces"));
                      const publicIps = inside.filter((item) => typeIs(item, "microsoft.network/publicipaddresses"));
                      const nsgs = inside.filter((item) => typeIs(item, "microsoft.network/networksecuritygroups"));
                      return (
                        <li key={resource.id} className="rounded-lg border p-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-medium [overflow-wrap:anywhere]">{resource.name}</p>
                              <p className="font-mono text-[11px] text-muted-foreground [overflow-wrap:anywhere]">{resource.type}</p>
                              <p className="text-xs text-muted-foreground">{resource.location}</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {provisioning && <StateBadge label={provisioning} tone={provisioningTone(provisioning)} />}
                              {powerState && <StateBadge label={powerText(powerState)} tone={powerState === "Running" ? "healthy" : "neutral"} />}
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
                          {links.length > 0 && (
                            <ul className="mt-3 grid gap-1 text-sm text-muted-foreground">
                              {links.map((line) => <li key={line} className="min-w-0 [overflow-wrap:anywhere]">{line}</li>)}
                            </ul>
                          )}
                          {isVm && (
                            nics.length === 0 ? (
                              <p className="mt-3 text-sm text-muted-foreground">Create a network interface in this group to attach one.</p>
                            ) : (
                              <form className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end" onSubmit={(event) => attachNic(resource.id, event)}>
                                <label className="grid min-w-0 gap-1 text-sm">
                                  Network interface
                                  <select name="nic" className={selectClass} defaultValue={chosen(nics, firstId(resource.properties.nicIds))}>
                                    {nics.map((nic) => <option key={nic.id} value={nic.id}>{nic.name} · {nic.location}</option>)}
                                  </select>
                                </label>
                                <Button type="submit" size="sm">Attach</Button>
                              </form>
                            )
                          )}
                          {isVm && (
                            <div className="mt-3 grid gap-4">
                              <CheckForm
                                label="Inbound from the internet, destination port"
                                note="A new TCP connection to the public IP. The subnet network security group is checked first. Routes, peering, and DNS are not part of this check."
                                result={checks[`${resource.id}:in`]}
                                onSubmit={(event) => checkTraffic(resource.id, "in", event)}
                              />
                              <CheckForm
                                label="Outbound to the internet, destination port"
                                note="A new TCP connection from the virtual machine to the internet. The network interface is checked first. An inbound rule does not decide this. A 0.0.0.0/0 route on the subnet is used after the security groups allow the traffic. Peering and DNS are not part of this check."
                                result={checks[`${resource.id}:out`]}
                                onSubmit={(event) => checkTraffic(resource.id, "out", event)}
                              />
                              <form className="grid gap-2" onSubmit={(event) => checkVnet(resource.id, event)}>
                                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_auto] sm:items-end">
                                  <label className="grid min-w-0 gap-1 text-sm">
                                    To an address in this virtual network
                                    <Input name="address" defaultValue="10.0.1.4" autoComplete="off" />
                                  </label>
                                  <label className="grid min-w-0 gap-1 text-sm">
                                    Destination port
                                    <Input name="port" type="number" defaultValue={443} />
                                  </label>
                                  <Button type="submit" size="sm">Check</Button>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  A new TCP connection to an address inside this virtual network. The way out is checked first, then the destination subnet, then the network interface that has that address. A 0.0.0.0/0 route does not decide this. Peering, DNS, and power state are not part of this check.
                                </p>
                                {checks[`${resource.id}:vnet`] && (
                                  <div className="rounded-lg border p-3 text-sm">
                                    <p className={checks[`${resource.id}:vnet`].allowed ? "text-emerald-800 dark:text-emerald-300" : undefined}>{checks[`${resource.id}:vnet`].summary}</p>
                                    <ul className="mt-2 grid gap-1 text-xs text-muted-foreground">
                                      {checks[`${resource.id}:vnet`].details.map((line, index) => (
                                        <li key={`${index}-${line}`} className="min-w-0 [overflow-wrap:anywhere]">{line}</li>
                                      ))}
                                    </ul>
                                    <a href={checks[`${resource.id}:vnet`].learnUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-primary underline-offset-4 hover:underline">
                                      Microsoft Learn
                                    </a>
                                  </div>
                                )}
                              </form>
                            </div>
                          )}
                          {isNic && (
                            <div className="mt-3 grid gap-4">
                              {publicIps.length === 0 ? (
                                <p className="text-sm text-muted-foreground">Create a public IP address in this group to attach one.</p>
                              ) : (
                                <form className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end" onSubmit={(event) => attachPip(resource.id, event)}>
                                  <label className="grid min-w-0 gap-1 text-sm">
                                    Public IP address
                                    <select name="pip" className={selectClass} defaultValue={chosen(publicIps, firstId(resource.properties.publicIpAddressId))}>
                                      {publicIps.map((pip) => <option key={pip.id} value={pip.id}>{pip.name} · {pip.location}</option>)}
                                    </select>
                                  </label>
                                  <Button type="submit" size="sm">Attach</Button>
                                </form>
                              )}
                              {nsgs.length === 0 ? (
                                <p className="text-sm text-muted-foreground">Create a network security group in this group to associate one.</p>
                              ) : (
                                <form className="grid gap-2" onSubmit={(event) => associateNicNsg(resource.id, event)}>
                                  <label className="grid min-w-0 gap-1 text-sm">
                                    Network security group
                                    <select name="nsg" className={selectClass} defaultValue={chosen(nsgs, firstId(resource.properties.networkSecurityGroupId))}>
                                      {nsgs.map((nsg) => <option key={nsg.id} value={nsg.id}>{nsg.name} · {nsg.location}</option>)}
                                    </select>
                                  </label>
                                  <p className="text-xs text-muted-foreground">
                                    Associates the group only. It does not add a rule. Inbound checks use it after the subnet group. Outbound checks use it first.
                                  </p>
                                  <Button type="submit" size="sm" className="w-fit">Associate</Button>
                                </form>
                              )}
                            </div>
                          )}
                          {isNsg && (
                            <form className="mt-3 grid gap-2" onSubmit={(event) => addRule(resource.id, event)}>
                              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                                <label className="grid min-w-0 gap-1 text-sm">
                                  Traffic
                                  <select name="scope" className={selectClass} defaultValue="vnet">
                                    <option value="vnet">Virtual network</option>
                                    <option value="internet">Internet</option>
                                  </select>
                                </label>
                                <label className="grid min-w-0 gap-1 text-sm">
                                  Direction
                                  <select name="direction" className={selectClass} defaultValue="Outbound">
                                    <option value="Outbound">Outbound</option>
                                    <option value="Inbound">Inbound</option>
                                  </select>
                                </label>
                                <label className="grid min-w-0 gap-1 text-sm">
                                  Destination port
                                  <Input name="port" type="number" defaultValue={443} />
                                </label>
                                <label className="grid min-w-0 gap-1 text-sm">
                                  Priority
                                  <Input name="priority" type="number" defaultValue={200} />
                                </label>
                                <label className="grid min-w-0 gap-1 text-sm">
                                  Action
                                  <select name="access" className={selectClass} defaultValue="Deny">
                                    <option value="Allow">Allow</option>
                                    <option value="Deny">Deny</option>
                                  </select>
                                </label>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                One TCP rule. Virtual network uses source and destination VirtualNetwork. Internet inbound is from Internet. Internet outbound is to Internet. Any source port. The same priority can be used once in each direction. This does not change which subnet or network interface uses the group.
                              </p>
                              <Button type="submit" size="sm" className="w-fit">Add rule</Button>
                            </form>
                          )}
                          {isSubnet && (
                            <>
                            {nsgs.length === 0 ? (
                              <p className="mt-3 text-sm text-muted-foreground">Create a network security group in this group to associate one.</p>
                            ) : (
                              <form className="mt-3 grid gap-2" onSubmit={(event) => associateNsg(resource.id, event)}>
                                <label className="grid min-w-0 gap-1 text-sm">
                                  Network security group
                                  <select name="nsg" className={selectClass} defaultValue={chosen(nsgs, firstId(resource.properties.networkSecurityGroupId))}>
                                    {nsgs.map((nsg) => <option key={nsg.id} value={nsg.id}>{nsg.name} · {nsg.location}</option>)}
                                  </select>
                                </label>
                                <div className="grid gap-2 sm:grid-cols-3">
                                  <label className="grid min-w-0 gap-1 text-sm">
                                    Destination port
                                    <Input name="port" type="number" defaultValue={443} />
                                  </label>
                                  <label className="grid min-w-0 gap-1 text-sm">
                                    Priority
                                    <Input name="priority" type="number" defaultValue={100} />
                                  </label>
                                  <label className="grid min-w-0 gap-1 text-sm">
                                    Action
                                    <select name="access" className={selectClass} defaultValue="Allow">
                                      <option value="Allow">Allow</option>
                                      <option value="Deny">Deny</option>
                                    </select>
                                  </label>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  Inbound TCP from Internet, any source port, any destination address. This records the rule. The virtual machine has the inbound check.
                                </p>
                                <Button type="submit" size="sm" className="w-fit">Associate and add rule</Button>
                              </form>
                            )}
                            <form className="mt-3 grid gap-2" onSubmit={(event) => addSubnetRoute(resource.id, event)}>
                              <div className="grid gap-2 sm:grid-cols-3">
                                <label className="grid min-w-0 gap-1 text-sm">
                                  Route table
                                  <Input name="tableName" defaultValue="rt-app" />
                                </label>
                                <label className="grid min-w-0 gap-1 text-sm">
                                  Route name
                                  <Input name="routeName" defaultValue="to-internet" />
                                </label>
                                <label className="grid min-w-0 gap-1 text-sm">
                                  Next hop
                                  <select name="nextHop" className={selectClass} defaultValue="None">
                                    <option value="None">None</option>
                                    <option value="Internet">Internet</option>
                                  </select>
                                </label>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                One route for 0.0.0.0/0. None drops outbound internet traffic after the security groups allow it. Internet sends that traffic to the internet. An address inside the virtual network keeps the longer system route. A subnet can have one route table, and this prefix can be used once.
                              </p>
                              <Button type="submit" size="sm" className="w-fit">Add route</Button>
                            </form>
                            </>
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
            <Link href={slug === "network-interface" ? sandboxCreatePath(slug) : resourcePath(slug)} className="underline-offset-4 hover:underline">{slug}</Link>
          </span>
        ))}
        . Other catalog entries stay documentation until their forms are added.
      </p>
    </div>
  );
}
