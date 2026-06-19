/**
 * "Find N adjacent seats" helper (plan 09, Phase 4).
 *
 * Adjacency is defined explicitly as **same row, consecutive seats** in the
 * row's left-to-right order — the exact ordering keyboard navigation already
 * uses (`Row.seatIds`), so this does not fork the data model. It returns the
 * first contiguous run of `n` currently-available seats, scanning rows in
 * `rowOrder` (top-to-bottom) then left-to-right within each row.
 *
 * Selection itself still happens through the store's single `toggleSeat` path;
 * this module only *finds* the seats.
 */
import type { LiveStatus } from "../state/seating-store";
import { effectiveStatus } from "../state/seating-store";
import type { NormalizedVenue, SeatId } from "../model/seat-types";
import { MAX_SELECTION } from "../model/seat-types";

/**
 * Find `n` contiguous available seats in a single row.
 *
 * @returns the seat ids (left-to-right) or `undefined` if no run exists. `n` is
 * clamped to `[1, MAX_SELECTION]`.
 */
export function findAdjacentSeats(
  venue: NormalizedVenue,
  liveStatus: LiveStatus,
  n: number,
): SeatId[] | undefined {
  const need = Math.min(Math.max(Math.trunc(n), 1), MAX_SELECTION);

  for (const rowId of venue.rowOrder) {
    const row = venue.rowsById.get(rowId);
    if (!row) continue;

    let run: SeatId[] = [];
    for (const seatId of row.seatIds) {
      if (effectiveStatus(venue, liveStatus, seatId) === "available") {
        run.push(seatId);
        if (run.length === need) return run;
      } else {
        run = [];
      }
    }
  }
  return undefined;
}
