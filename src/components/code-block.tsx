"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function CodeBlock({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // Clipboard can be blocked (insecure context, permissions). The code
      // stays selectable, so the user can still copy it by hand.
    }
  }

  return (
    <div className="relative rounded-lg border bg-muted/50">
      <Button
        variant="ghost"
        size="xs"
        onClick={copy}
        aria-label={`Copy ${label} example`}
        className="absolute right-2 top-2"
      >
        {copied ? <Check /> : <Copy />}
        {copied ? "Copied" : "Copy"}
      </Button>
      <pre className="overflow-x-auto p-4 pr-20 font-mono text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}
