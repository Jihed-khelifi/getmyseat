/**
 * Seating store (Zustand) — the single source of truth for selection, viewport,
 * and loaded venue data.
 *
 * Ownership (plan 02/03): ALL seat selection flows through `toggleSeat` here.
 * Mouse, touch, keyboard, and persistence rehydration share this one mutation
 * path, so the 8-seat cap and status guard are enforced in exactly one place
 * (plan 03, Phase 4). Pure helpers (`computeSummary`, `canSelectSeat`) are
 * exported separately so they can be unit-tested without React.
 */
import { create } from "zustand";
import {
  MAX_SELECTION,
  SELECTABLE_STATUSES,
  type NormalizedVenue,
  type SeatId,
  type SelectionSummary,
  type ViewportTransform,
} from "../model/seat-types";
import { IDENTITY_TRANSFORM } from "../render/viewport";
import { loadPersistedSelection, savePersistedSelection } from "./persistence";

export type SelectionRejection =
  | { ok: true }
  | { ok: false; reason: "not-selectable" | "limit-reached" | "unknown-seat" };

/** Pure guard: may this seat be added to the current selection? */
export function canSelectSeat(
  venue: NormalizedVenue,
  selected: ReadonlySet<SeatId>,
  seatId: SeatId,
): SelectionRejection {
  const seat = venue.seatsById.get(seatId);
  if (!seat) return { ok: false, reason: "unknown-seat" };
  if (selected.has(seatId)) return { ok: true }; // deselect is always allowed
  if (!SELECTABLE_STATUSES.includes(seat.status)) {
    return { ok: false, reason: "not-selectable" };
  }
  if (selected.size >= MAX_SELECTION)
    return { ok: false, reason: "limit-reached" };
  return { ok: true };
}

/** Pure: aggregate the current selection into a summary (count, subtotal, tiers). */
export function computeSummary(
  venue: NormalizedVenue,
  selected: ReadonlySet<SeatId>,
): SelectionSummary {
  const tierBuckets = new Map<
    string,
    { count: number; subtotalCents: number }
  >();
  let subtotalCents = 0;
  const seatIds: SeatId[] = [];

  for (const id of selected) {
    const seat = venue.seatsById.get(id);
    if (!seat) continue;
    const tier = venue.priceTiersById.get(seat.priceTierId);
    if (!tier) continue;
    seatIds.push(id);
    subtotalCents += tier.priceCents;
    const bucket = tierBuckets.get(tier.id) ?? { count: 0, subtotalCents: 0 };
    bucket.count += 1;
    bucket.subtotalCents += tier.priceCents;
    tierBuckets.set(tier.id, bucket);
  }

  const byTier = [...tierBuckets.entries()]
    .map(([tierId, b]) => ({
      tier: venue.priceTiersById.get(tierId)!,
      count: b.count,
      subtotalCents: b.subtotalCents,
    }))
    .sort((a, b) => b.subtotalCents - a.subtotalCents);

  return {
    seatIds,
    count: seatIds.length,
    subtotalCents,
    currency: venue.currency,
    byTier,
  };
}

/** Keep only persisted ids that still exist and are still selectable. */
function reconcilePersisted(
  venue: NormalizedVenue,
  ids: SeatId[],
): Set<SeatId> {
  const next = new Set<SeatId>();
  for (const id of ids) {
    if (next.size >= MAX_SELECTION) break;
    const seat = venue.seatsById.get(id);
    if (seat && SELECTABLE_STATUSES.includes(seat.status)) next.add(id);
  }
  return next;
}

export interface SeatingState {
  venue: NormalizedVenue | undefined;
  selectedSeatIds: Set<SeatId>;
  transform: ViewportTransform;
  focusedSeatId: SeatId | undefined;
  /** Last rejected action, surfaced to aria-live for accessible feedback. */
  lastRejection: (SelectionRejection & { ok: false }) | undefined;

  /** Load a venue and rehydrate any persisted, still-valid selection. */
  setVenue: (venue: NormalizedVenue) => void;
  /** The one selection mutation path (select if absent, deselect if present). */
  toggleSeat: (seatId: SeatId) => void;
  clearSelection: () => void;
  setTransform: (transform: ViewportTransform) => void;
  setFocusedSeat: (seatId: SeatId | undefined) => void;
  acknowledgeRejection: () => void;
}

export const useSeatingStore = create<SeatingState>((set, get) => ({
  venue: undefined,
  selectedSeatIds: new Set(),
  transform: IDENTITY_TRANSFORM,
  focusedSeatId: undefined,
  lastRejection: undefined,

  setVenue: (venue) => {
    const persisted = loadPersistedSelection(venue.venueId);
    const selectedSeatIds = persisted
      ? reconcilePersisted(venue, persisted.selectedSeatIds)
      : new Set<SeatId>();
    set({
      venue,
      selectedSeatIds,
      focusedSeatId: undefined,
      lastRejection: undefined,
    });
  },

  toggleSeat: (seatId) => {
    const { venue, selectedSeatIds } = get();
    if (!venue) return;
    const next = new Set(selectedSeatIds);

    if (next.has(seatId)) {
      next.delete(seatId);
    } else {
      const verdict = canSelectSeat(venue, next, seatId);
      if (!verdict.ok) {
        set({ lastRejection: verdict });
        return;
      }
      next.add(seatId);
    }

    set({ selectedSeatIds: next, lastRejection: undefined });
    savePersistedSelection({
      version: 1,
      venueId: venue.venueId,
      selectedSeatIds: [...next],
    });
  },

  clearSelection: () => {
    const { venue } = get();
    set({ selectedSeatIds: new Set(), lastRejection: undefined });
    if (venue) {
      savePersistedSelection({
        version: 1,
        venueId: venue.venueId,
        selectedSeatIds: [],
      });
    }
  },

  setTransform: (transform) => set({ transform }),
  setFocusedSeat: (focusedSeatId) => set({ focusedSeatId }),
  acknowledgeRejection: () => set({ lastRejection: undefined }),
}));
