/**
 * Keyboard navigation — deterministic, row-based directional movement.
 *
 * Ownership (plan 02): this module is kept separate from pointer hit-testing.
 * Movement is intentionally deterministic (by row order and column index) rather
 * than "visually nearest seat", per plan 03's blocker guidance. Selection itself
 * is NOT performed here — the map component routes Enter/Space to the store's
 * single `toggleSeat` path.
 */
import type { NormalizedVenue, Seat, SeatId } from "../model/seat-types";

export type NavDirection = "left" | "right" | "up" | "down";

function seatAt(
  venue: NormalizedVenue,
  rowId: SeatId,
  colIndex: number,
): Seat | undefined {
  const row = venue.rowsById.get(rowId);
  if (!row) return undefined;
  const id = row.seatIds[colIndex];
  return id ? venue.seatsById.get(id) : undefined;
}

/**
 * Given the currently focused seat, return the seat that should receive focus
 * after pressing an arrow key — or `undefined` if movement is blocked at an edge.
 *
 *  - left/right move within the row by column index.
 *  - up/down move to the adjacent row (by `rowOrder`) and pick the seat whose
 *    column index is closest to the current one, clamped to that row's width.
 */
export function nextSeat(
  venue: NormalizedVenue,
  current: Seat,
  direction: NavDirection,
): Seat | undefined {
  if (direction === "left")
    return seatAt(venue, current.rowId, current.colIndex - 1);
  if (direction === "right")
    return seatAt(venue, current.rowId, current.colIndex + 1);

  const rowIdx = venue.rowOrder.indexOf(current.rowId);
  if (rowIdx === -1) return undefined;
  const targetRowId =
    venue.rowOrder[direction === "up" ? rowIdx - 1 : rowIdx + 1];
  if (!targetRowId) return undefined;

  const targetRow = venue.rowsById.get(targetRowId);
  if (!targetRow || targetRow.seatIds.length === 0) return undefined;
  const clampedCol = Math.min(current.colIndex, targetRow.seatIds.length - 1);
  return seatAt(venue, targetRowId, clampedCol);
}

/** The first seat to focus when the map gains focus (top-left-most). */
export function initialFocusSeat(venue: NormalizedVenue): Seat | undefined {
  const firstRowId = venue.rowOrder[0];
  if (!firstRowId) return undefined;
  return seatAt(venue, firstRowId, 0);
}

const ARROW_MAP: Record<string, NavDirection> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};

/** Map a keyboard event key to a navigation direction, if it is an arrow key. */
export function directionFromKey(key: string): NavDirection | undefined {
  return ARROW_MAP[key];
}

/** Keys that activate (select/deselect) the focused seat. */
export function isActivationKey(key: string): boolean {
  return key === "Enter" || key === " " || key === "Spacebar";
}
