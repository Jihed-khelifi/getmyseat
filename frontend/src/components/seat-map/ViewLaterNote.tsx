import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { getVisitorId } from "@/lib/api";

/**
 * "View my selection later" affordance (plan 08, Phase 6 — no login).
 *
 * Selections are saved server-side keyed by an opaque visitor handle. This note
 * reassures the visitor their picks persist on this browser and exposes the
 * copyable handle so they can confirm/keep it. There is no account system; the
 * handle is the only key (documented trade-off: clearing storage loses it).
 */
export function ViewLaterNote({ className }: { className?: string }) {
  const visitorId = getVisitorId();
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(visitorId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be unavailable (e.g. insecure context); ignore silently.
    }
  }

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3 text-sm text-muted-foreground",
        className,
      )}
    >
      <p className="font-medium text-foreground">Saved for later</p>
      <p className="mt-1">
        Your selection is saved automatically. Return on this browser to pick up
        where you left off — no login needed.
      </p>
      <button
        type="button"
        onClick={copy}
        className="mt-2 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-xs hover:bg-accent"
        aria-label="Copy your visitor handle"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <Copy className="h-3.5 w-3.5" aria-hidden />
        )}
        <span className="max-w-48 truncate">{visitorId}</span>
      </button>
    </div>
  );
}
