import { Badge } from "@/components/ui/badge";
import { resources } from "@/content";
import { categoryLabels, scopeLabels } from "@/content/schema";

// Temporary page: proves the content pipeline works end to end.
// Replaced by the hierarchy map and catalog in a later checkpoint.
export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <p className="text-sm font-medium text-primary">Polaris</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">
        Azure Resource Atlas
      </h1>
      <p className="mt-3 text-muted-foreground">
        {resources.length} resources loaded from typed content.
      </p>

      <ul className="mt-10 grid gap-4">
        {resources.map((r) => (
          <li key={r.slug} className="rounded-xl border bg-card p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-medium">{r.name}</h2>
              <Badge>{categoryLabels[r.category]}</Badge>
              <Badge variant="outline">{scopeLabels[r.scope]}</Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{r.tagline}</p>
            <p className="mt-3 text-xs text-muted-foreground">
              {r.prerequisites.length} prerequisites
            </p>
          </li>
        ))}
      </ul>
    </main>
  );
}
