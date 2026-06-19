import { useEffect, useState } from "react";
import { SeatMap } from "@/components/seat-map/SeatMap";
import { SeatLegend } from "@/components/seat-map/SeatLegend";
import { SeatDetailsSheet } from "@/components/seat-map/SeatDetailsSheet";
import { AnnouncementRegion } from "@/components/seat-map/AnnouncementRegion";
import { ViewLaterNote } from "@/components/seat-map/ViewLaterNote";
import { ThemeToggle } from "@/components/seat-map/ThemeToggle";
import { AdjacentSeatsControl } from "@/components/seat-map/AdjacentSeatsControl";
import { EventBanner } from "@/components/seat-map/EventBanner";
import { loadVenue } from "@/features/seating/model/seat-validation";
import { useSeatingStore } from "@/features/seating/state/seating-store";
import {
  hydrateSelection,
  startSelectionSync,
} from "@/features/seating/state/selection-sync";
import {
  applyServerMessage,
  startSeatStatusSync,
} from "@/features/seating/state/seat-status-sync";
import { getSeatStatus, type EventInfo } from "@/lib/api";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready" };

/**
 * App shell — owns the venue.json load → validate → normalize pipeline (plan 02
 * data-loading approach) and lays out the map, legend, and details surfaces.
 * All seating state lives in the Zustand store; this component only orchestrates
 * loading and composition.
 */
export default function App() {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [liveEvent, setLiveEvent] = useState<EventInfo | null>(null);
  const setVenue = useSeatingStore((s) => s.setVenue);
  const venue = useSeatingStore((s) => s.venue);

  useEffect(() => {
    let cancelled = false;
    let stopSync: (() => void) | undefined;
    let stopStatusSync: (() => void) | undefined;
    (async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}venue.json`);
        if (!res.ok)
          throw new Error(`Failed to load venue.json (${res.status})`);
        const json: unknown = await res.json();
        const normalized = loadVenue(json);
        if (cancelled) return;
        setVenue(normalized);
        setLoad({ status: "ready" });

        // Plan 09: backend owns live seat status. Pull the snapshot, then open
        // the WebSocket for deltas (which also re-snapshots on every reconnect).
        const store = useSeatingStore;
        try {
          const snapshot = await getSeatStatus();
          if (cancelled) return;
          applyServerMessage(store, { type: "snapshot", statuses: snapshot });
        } catch {
          // No backend yet: fall back to the venue.json-seeded status.
        }
        stopStatusSync = startSeatStatusSync(store, {
          onEvent: (event) => setLiveEvent(event),
        });

        // Plan 08: server is authoritative on load, then mirror local changes.
        await hydrateSelection(store);
        if (cancelled) return;
        stopSync = startSelectionSync(store);
      } catch (err) {
        if (cancelled) return;
        setLoad({
          status: "error",
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    })();
    return () => {
      cancelled = true;
      stopSync?.();
      stopStatusSync?.();
    };
  }, [setVenue]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold">GetMySeat</h1>
          <p className="text-sm text-muted-foreground">
            {venue ? venue.name : "Loading venue…"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SeatLegend className="hidden md:flex" />
          <ThemeToggle />
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-4 p-4 lg:flex-row">
        <div className="relative min-h-80 flex-1">
          {load.status === "loading" && (
            <p className="absolute inset-0 grid place-items-center text-muted-foreground">
              Loading seating map…
            </p>
          )}
          {load.status === "error" && (
            <p
              role="alert"
              className="absolute inset-0 grid place-items-center px-6 text-center text-destructive"
            >
              Could not load the seating map: {load.message}
            </p>
          )}
          {load.status === "ready" && <SeatMap />}
        </div>

        {/* Desktop: persistent side panel. */}
        <div className="hidden flex-col gap-4 lg:flex lg:w-80">
          <EventBanner live={liveEvent} />
          <SeatDetailsSheet className="lg:flex-1" />
          {load.status === "ready" && (
            <AdjacentSeatsControl className="rounded-lg border bg-card p-4" />
          )}
          {load.status === "ready" && <ViewLaterNote />}
        </div>
      </main>

      {/* Mobile: bottom sheet that keeps the summary reachable without hover. */}
      {load.status === "ready" && (
        <div
          className="fixed inset-x-0 bottom-0 z-20 max-h-[55vh] overflow-y-auto rounded-t-2xl border-t bg-card shadow-2xl lg:hidden"
          aria-label="Seat details"
        >
          <div className="sticky top-0 flex justify-center bg-card pt-2">
            <span
              aria-hidden
              className="h-1.5 w-10 rounded-full bg-muted-foreground/30"
            />
          </div>
          <div className="space-y-4 p-4 pt-3">
            <SeatLegend className="flex md:hidden" />
            <EventBanner live={liveEvent} />
            <SeatDetailsSheet bare />
            <AdjacentSeatsControl />
          </div>
        </div>
      )}

      {venue && <AnnouncementRegion venue={venue} />}
    </div>
  );
}
