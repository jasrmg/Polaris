import { Explorer } from "@/components/explorer";
import { resources } from "@/content";
import { toSummary } from "@/content/summary";

export default function Home() {
  const summaries = resources.map(toSummary);

  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16 outline-none">
      <section className="max-w-2xl">
        <p className="text-sm font-medium text-primary">Azure Resource Atlas</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">
          Learn what every Azure resource is for.
        </h1>
        <p className="mt-4 text-base text-muted-foreground sm:text-lg">
          Plain-English definitions, what you need before you create each one,
          and example configuration. No Azure account required.
        </p>
      </section>

      <div className="mt-14">
        <Explorer resources={summaries} />
      </div>
    </main>
  );
}
