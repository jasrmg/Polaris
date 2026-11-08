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

function nameLabel(slug: TrySlug): string {
  if (slug === "resource-group") return "Resource group name";
  if (slug === "virtual-machine") return "Virtual machine name";
  if (slug === "network-interface") return "Network interface name";
  return "Name";
}

function subnetOptionLabel(id: string, name: string): string {
  const parts = id.split("/");
  const vnet = parts[parts.indexOf("virtualNetworks") + 1];
  return vnet ? `${vnet} / ${name}` : name;
}

const NAME_PLACEHOLDER: Record<TrySlug, string> = {
  "resource-group": "rg-polaris-demo",
  "virtual-network": "vnet-sea",
  subnet: "snet-app",
  "public-ip-address": "pip-web-01",
  "network-security-group": "nsg-web",
  "network-interface": "nic-web-01",
  "virtual-machine": "vm-web-01",
  "storage-account": "stpolarisdemo001",
};

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
  "public-ip-address": {
    title: "Create a public IP address",
    lead: "The portal asks for a resource group, a region, a name, and the Standard SKU. This form records Standard and Static. Attach it to a network interface from My Environment.",
  },
  "network-security-group": {
    title: "Create a network security group",
    lead: "The portal's create page asks for a resource group, a name, and a region. Associate it with a subnet and record one inbound rule from My Environment.",
  },
  "network-interface": {
    title: "Create a network interface",
    lead: "The portal creates this with the virtual machine. Here it is recorded on its own, in the subnet you pick, with a dynamic private address. Attach it to a virtual machine, or a public IP, from My Environment.",
  },
  "virtual-machine": {
    title: "Create a virtual machine",
    lead: "The portal asks for a resource group, a name, a region, and an image. This form records the VM and its power state. Attach a network interface from My Environment. A disk and an administrator key are not recorded.",
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
  const [dnsLabel, setDnsLabel] = useState("");
  const [subnetId, setSubnetId] = useState("");

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
  const subnets = useMemo(() => {
    if (!session.world) return [];
    return Object.values(session.world.resources).filter(
      (resource) =>
        resource.type.toLowerCase() === "microsoft.network/virtualnetworks/subnets" &&
        resource.resourceGroup.toLowerCase() === selectedGroup.toLowerCase(),
    );
  }, [session.world, selectedGroup]);
  const selectedSubnet = subnets.find((item) => item.id === subnetId) ?? subnets[0];

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
  const missingSubnet = slug === "network-interface" && subnets.length === 0;

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
      if (slug === "public-ip-address") {
        const label = dnsLabel.trim();
        return engine.createResource(world, {
          armType: "Microsoft.Network/publicIPAddresses",
          name: name.trim(),
          resourceGroup: selectedGroup,
          location,
          sku: { name: "Standard" },
          properties: {
            publicIPAllocationMethod: "Static",
            publicIPAddressVersion: "IPv4",
            ...(label ? { dnsSettings: { domainNameLabel: label } } : {}),
          },
        });
      }
      if (slug === "network-security-group") {
        return engine.createResource(world, {
          armType: "Microsoft.Network/networkSecurityGroups",
          name: name.trim(),
          resourceGroup: selectedGroup,
          location,
        });
      }
      if (slug === "network-interface") {
        if (!selectedSubnet) {
          return {
            ok: false,
            trace: [],
            error: { code: "SubnetRequired", message: "Choose a subnet first.", step: "validate" },
          };
        }
        return engine.createResource(world, {
          armType: "Microsoft.Network/networkInterfaces",
          name: name.trim(),
          resourceGroup: selectedGroup,
          location: selectedSubnet.location,
          properties: {
            subnetId: selectedSubnet.id,
            ipConfigurations: [
              {
                name: "ipconfig1",
                properties: {
                  privateIPAllocationMethod: "Dynamic",
                  subnet: { id: selectedSubnet.id },
                },
              },
            ],
          },
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
          <Link href={resourcePath(slug === "network-interface" ? "virtual-machine" : slug)} className="text-primary underline-offset-4 hover:underline">
            {slug === "network-interface" ? "Read the virtual machine entry" : "Read the catalog entry"}
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
              <select className={selectClass} value={selectedGroup} onChange={(event) => { setGroup(event.target.value); setVnet(""); setSubnetId(""); }}>
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
        {slug === "network-interface" && (
          <label className={fieldClass}>
            Subnet
            {subnets.length === 0 ? (
              <span className="text-muted-foreground">
                Create a <Link href="/sandbox/subnet/" className="text-primary underline-offset-4 hover:underline">subnet</Link> in this resource group first.
              </span>
            ) : (
              <select
                className={selectClass}
                value={selectedSubnet?.id ?? ""}
                onChange={(event) => setSubnetId(event.target.value)}
              >
                {subnets.map((item) => (
                  <option key={item.id} value={item.id}>{subnetOptionLabel(item.id, item.name)}</option>
                ))}
              </select>
            )}
          </label>
        )}
        <label className={fieldClass}>
          {nameLabel(slug)}
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            autoComplete="off"
            placeholder={NAME_PLACEHOLDER[slug]}
          />
        </label>
        {slug !== "subnet" && slug !== "network-interface" && (
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
        {slug === "public-ip-address" && (
          <label className={fieldClass}>
            DNS name label
            <Input value={dnsLabel} onChange={(event) => setDnsLabel(event.target.value)} autoComplete="off" placeholder="polaris-web-01" />
            <span className="text-muted-foreground">Optional. The sandbox only checks that the label is free in this region.</span>
          </label>
        )}
        {slug === "public-ip-address" && (
          <p className="text-sm text-muted-foreground">SKU Standard, assignment Static. Recorded only. The portal also asks for a tier and an availability zone.</p>
        )}
        {slug === "storage-account" && (
          <p className="text-sm text-muted-foreground">Performance Standard, redundancy LRS. Recorded only.</p>
        )}
        {error && (
          <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <p className="min-w-0 [overflow-wrap:anywhere]">{error.message}</p>
            {error.next && <p className="mt-1 min-w-0 [overflow-wrap:anywhere]">Next: {error.next}</p>}
            <p className="mt-1 text-muted-foreground">Stopped at {error.step} ({error.code}).</p>
            {error.learnUrl && (
              <a href={error.learnUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-primary underline-offset-4 hover:underline">
                Microsoft Learn
              </a>
            )}
          </div>
        )}
        <Button type="submit" disabled={pending || missingGroup || missingVnet || missingSubnet || !name.trim() || (slug === "network-interface" && !selectedSubnet)}>
          {pending ? "Creating…" : "Create"}
        </Button>
      </form>
    </div>
  );
}
