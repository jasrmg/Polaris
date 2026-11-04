"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { regions } from "@/content/regions";
import { resourcePath } from "@/lib/resource-path";
import { sandboxHomePath, type TrySlug } from "@/lib/sandbox-path";
import { SandboxBanner } from "./sandbox-banner";
import { useSandbox } from "./use-sandbox";
import type { EngineError } from "@/engine/azure";

const fieldClass = "grid gap-1 text-sm";
const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const COPY: Record<TrySlug, { title: string; lead: string }> = {
  "resource-group": {
    title: "Create a resource group",
    lead: "The portal asks for a subscription, a resource group name, and a region. The region is where the group's metadata is stored.",
  },
  "virtual-network": {
    title: "Create a virtual network",
    lead: "The portal asks for a resource group, a name, a region, and an address space.",
  },
  subnet: {
    title: "Create a subnet",
    lead: "The portal asks for a name, a starting address, and a size. Enter them here as one prefix, such as 10.0.1.0/24.",
  },
  "virtual-machine": {
    title: "Create a virtual machine",
    lead: "The portal asks for a resource group, a name, a region, and an image. This slice records the VM and its power state. It does not create a network interface, a disk, or an administrator key.",
  },
  "storage-account": {
    title: "Create a storage account",
    lead: "The portal asks for a name, a resource group, a region, and a redundancy option. This slice records Standard LRS. It does not copy data to another region.",
  },
};

export function CreateView({ slug }: { slug: TrySlug }) {
  const session = useSandbox();
  const router = useRouter();
  const copy = COPY[slug];
  const [error, setError] = useState<EngineError | null>(null);
  const [pending, setPending] = useState(false);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("southeastasia");
  const [group, setGroup] = useState("");
  const [address, setAddress] = useState(slug === "subnet" ? "10.0.1.0/24" : "10.0.0.0/16");
  const [os, setOs] = useState<"Linux" | "Windows">("Linux");

  const groups = useMemo(
    () => (session.world ? Object.values(session.world.resourceGroups).sort((a, b) => a.name.localeCompare(b.name)) : []),
    [session.world],
  );
  const selectedGroup = group || groups[0]?.name || "";
  const vnets = useMemo(() => {
    if (!session.world) return [];
    return Object.values(session.world.resources).filter(
      (resource) =>
        resource.type.toLowerCase() === "microsoft.network/virtualnetworks" &&
        resource.resourceGroup.toLowerCase() === selectedGroup.toLowerCase(),
    );
  }, [session.world, selectedGroup]);
  const [vnet, setVnet] = useState("");
  const selectedVnet = vnet || vnets[0]?.name || "";

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

  const needsGroup = slug !== "resource-group";
  const missingGroup = needsGroup && groups.length === 0;
  const missingVnet = slug === "subnet" && vnets.length === 0;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const failure = await session.apply((engine, world) => {
      if (slug === "resource-group") {
        return engine.createResourceGroup(world, { name: name.trim(), location });
      }
      if (slug === "virtual-network") {
        return engine.createResource(world, {
          armType: "Microsoft.Network/virtualNetworks",
          name: name.trim(),
          resourceGroup: selectedGroup,
          location,
          properties: { addressSpace: { addressPrefixes: [address.trim()] } },
        });
      }
      if (slug === "subnet") {
        const parent = vnets.find((item) => item.name === selectedVnet);
        return engine.createResource(world, {
          armType: "Microsoft.Network/virtualNetworks/subnets",
          name: name.trim(),
          resourceGroup: selectedGroup,
          parentName: selectedVnet,
          location: parent?.location ?? location,
          properties: { addressPrefix: address.trim() },
        });
      }
      if (slug === "virtual-machine") {
        return engine.createResource(world, {
          armType: "Microsoft.Compute/virtualMachines",
          name: name.trim(),
          resourceGroup: selectedGroup,
          location,
          osType: os,
          properties: { osType: os },
        });
      }
      return engine.createResource(world, {
        armType: "Microsoft.Storage/storageAccounts",
        name: name.trim(),
        resourceGroup: selectedGroup,
        location,
        kind: "StorageV2",
        sku: { name: "Standard_LRS" },
      });
    });
    setPending(false);
    if (failure) {
      setError(failure);
      return;
    }
    router.push(sandboxHomePath());
  }

  return (
    <div className="grid gap-6">
      <SandboxBanner />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{copy.lead}</p>
        <p className="mt-2 text-sm">
          <Link href={resourcePath(slug)} className="text-primary underline-offset-4 hover:underline">
            Read the catalog entry
          </Link>
          {" · "}
          <Link href={sandboxHomePath()} className="text-primary underline-offset-4 hover:underline">
            My Environment
          </Link>
        </p>
      </div>
      <form onSubmit={onSubmit} className="grid max-w-lg gap-4">
        <label className={fieldClass}>
          Subscription
          <Input value={session.subscriptionName} disabled />
        </label>
        {needsGroup && (
          <label className={fieldClass}>
            Resource group
            {groups.length === 0 ? (
              <span className="text-muted-foreground">
                Create a <Link href="/sandbox/resource-group/" className="text-primary underline-offset-4 hover:underline">resource group</Link> first.
              </span>
            ) : (
              <select className={selectClass} value={selectedGroup} onChange={(event) => { setGroup(event.target.value); setVnet(""); }}>
                {groups.map((item) => (
                  <option key={item.id} value={item.name}>{item.name}</option>
                ))}
              </select>
            )}
          </label>
        )}
        {slug === "subnet" && (
          <label className={fieldClass}>
            Virtual network
            {vnets.length === 0 ? (
              <span className="text-muted-foreground">
                Create a <Link href="/sandbox/virtual-network/" className="text-primary underline-offset-4 hover:underline">virtual network</Link> in this resource group first.
              </span>
            ) : (
              <select className={selectClass} value={selectedVnet} onChange={(event) => setVnet(event.target.value)}>
                {vnets.map((item) => (
                  <option key={item.id} value={item.name}>{item.name}</option>
                ))}
              </select>
            )}
          </label>
        )}
        <label className={fieldClass}>
          {slug === "resource-group" ? "Resource group name" : slug === "virtual-machine" ? "Virtual machine name" : "Name"}
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            autoComplete="off"
            placeholder={slug === "storage-account" ? "stpolarisdemo001" : slug === "virtual-machine" ? "vm-web-01" : ""}
          />
        </label>
        {slug !== "subnet" && (
          <label className={fieldClass}>
            Region
            <select className={selectClass} value={location} onChange={(event) => setLocation(event.target.value)}>
              {regions.map((region) => (
                <option key={region.id} value={region.id}>{region.name} ({region.city})</option>
              ))}
            </select>
          </label>
        )}
        {(slug === "virtual-network" || slug === "subnet") && (
          <label className={fieldClass}>
            {slug === "subnet" ? "Address prefix" : "Address space"}
            <Input value={address} onChange={(event) => setAddress(event.target.value)} required autoComplete="off" />
          </label>
        )}
        {slug === "virtual-machine" && (
          <label className={fieldClass}>
            Image
            <select className={selectClass} value={os} onChange={(event) => setOs(event.target.value === "Windows" ? "Windows" : "Linux")}>
              <option value="Linux">Linux</option>
              <option value="Windows">Windows</option>
            </select>
          </label>
        )}
        {slug === "storage-account" && (
          <p className="text-sm text-muted-foreground">Performance Standard, redundancy LRS. Recorded only.</p>
        )}
        {error && (
          <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <p className="min-w-0 [overflow-wrap:anywhere]">{error.message}</p>
            <p className="mt-1 text-muted-foreground">Stopped at {error.step} ({error.code}).</p>
            {error.learnUrl && (
              <a href={error.learnUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-primary underline-offset-4 hover:underline">
                Microsoft Learn
              </a>
            )}
          </div>
        )}
        <Button type="submit" disabled={pending || missingGroup || missingVnet || !name.trim()}>
          {pending ? "Creating…" : "Create"}
        </Button>
      </form>
    </div>
  );
}
