import { useEffect, useState } from "react";
import { getEvent, type EventInfo } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * User-facing event banner (plan 10, Phase 6).
 *
 * Renders the operator-edited event/arena metadata (name, date, description,
 * location, updates). It fetches `GET /event` on mount and accepts a `live`
 * prop so a parent that owns the WebSocket can push an `event-updated` payload
 * in without a manual reload — the visible payoff of an admin edit.
 */
export function EventBanner({
  live,
  className,
}: {
  live?: EventInfo | null;
  className?: string;
}) {
  const [event, setEvent] = useState<EventInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    getEvent()
      .then((e) => {
        if (!cancelled) setEvent(e);
      })
      .catch(() => {
        // No backend / no event yet: the banner simply stays hidden.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // A live WebSocket update always wins over the initial fetch.
  const current = live ?? event;
  if (!current) return null;

  return (
    <section
      aria-label="Event information"
      className={cn(
        "rounded-lg border bg-card p-3 text-sm text-card-foreground",
        className,
      )}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h2 className="text-base font-semibold">{current.name}</h2>
        {current.date && (
          <span className="text-muted-foreground">· {current.date}</span>
        )}
        {current.arenaLocation && (
          <span className="text-muted-foreground">
            · {current.arenaLocation}
          </span>
        )}
      </div>
      {current.description && (
        <p className="mt-1 text-muted-foreground">{current.description}</p>
      )}
      {current.updates.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5">
          {current.updates.map((update, i) => (
            <li key={i}>{update}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
