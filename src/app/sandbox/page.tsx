import type { Metadata } from "next";
import { EnvironmentView } from "@/components/sandbox/environment-view";

export const metadata: Metadata = {
  title: "My Environment",
  description: "The simulated Azure subscription. Nothing here touches real Azure.",
};

export default function SandboxPage() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-3xl px-4 py-10 outline-none sm:px-6">
      <p className="text-sm font-medium text-primary">Sandbox</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">My Environment</h1>
      <div className="mt-6">
        <EnvironmentView />
      </div>
    </main>
  );
}
