import { useState } from "react";
import { Users } from "lucide-react";
import { useSeatingStore } from "@/features/seating/state/seating-store";
import { findAdjacentSeats } from "@/features/seating/state/adjacency";
import { MAX_SELECTION } from "@/features/seating/model/seat-types";
import { cn } from "@/lib/utils";

/**
 * "Find N adjacent seats" control (plan 09, Phase 4).
 *
 * Adjacency = same row, consecutive seats (see `adjacency.ts`). On success the
 * found run replaces the current selection through the store's single
 * `toggleSeat` path (so the 8-seat cap and available-only guard still hold); on
 * failure it announces "no match" via its own assertive aria-live region.
 */
export function AdjacentSeatsControl({ className }: { className?: string }) {
  const venue = useSeatingStore((s) => s.venue);
  const liveStatus = useSeatingStore((s) => s.liveStatus);
  const toggleSeat = useSeatingStore((s) => s.toggleSeat);
  const clearSelection = useSeatingStore((s) => s.clearSelection);
  const [count, setCount] = useState(2);
  const [message, setMessage] = useState("");

  if (!venue) return null;

  const find = () => {
    const seatIds = findAdjacentSeats(venue, liveStatus, count);
    if (!seatIds) {
      setMessage(`No ${count} adjacent available seats were found.`);
      return;
    }
    clearSelection();
    for (const id of seatIds) toggleSeat(id);
    const first = venue.seatsById.get(seatIds[0]!);
    const rowLabel = first ? venue.rowsById.get(first.rowId)?.label : "";
    setMessage(`Selected ${seatIds.length} adjacent seats in row ${rowLabel}.`);
  };

  return (
    <section
      className={cn("space-y-2", className)}
      aria-label="Find adjacent seats"
    >
      <h2 className="text-sm font-semibold text-muted-foreground">
        Find adjacent seats
      </h2>
      <div className="flex items-center gap-2">
        <label htmlFor="adjacent-count" className="sr-only">
          Number of adjacent seats
        </label>
        <select
          id="adjacent-count"
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          className="h-9 rounded-md border bg-card px-2 text-sm"
        >
          {Array.from({ length: MAX_SELECTION }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={find}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
        >
          <Users className="size-4" aria-hidden />
          Find seats
        </button>
      </div>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
      <p className="sr-only" aria-live="assertive">
        {message}
      </p>
    </section>
  );
}
