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
  type SeatStatus,
  type SelectionSummary,
  type ViewportTransform,
} from "../model/seat-types";
import { IDENTITY_TRANSFORM } from "../render/viewport";
import { loadPersistedSelection, savePersistedSelection } from "./persistence";

export type SelectionRejection =
  | { ok: true }
  | { ok: false; reason: "not-selectable" | "limit-reached" | "unknown-seat" };

/** A seat's live status: the server-fed value wins over the venue.json seed. */
export type LiveStatus = ReadonlyMap<SeatId, SeatStatus>;

/**
 * Effective status for a seat (plan 09): once the backend snapshot/deltas arrive
 * the store's `liveStatus` is authoritative; before then it falls back to the
 * `venue.json` seed so behavior is unchanged on first paint.
 */
export function effectiveStatus(
  venue: NormalizedVenue,
  liveStatus: LiveStatus,
  seatId: SeatId,
): SeatStatus | undefined {
  return liveStatus.get(seatId) ?? venue.seatsById.get(seatId)?.status;
}

/** Pure guard: may this seat be added to the current selection? */
export function canSelectSeat(
  venue: NormalizedVenue,
  liveStatus: LiveStatus,
  selected: ReadonlySet<SeatId>,
  seatId: SeatId,
): SelectionRejection {
  const seat = venue.seatsById.get(seatId);
  if (!seat) return { ok: false, reason: "unknown-seat" };
  if (selected.has(seatId)) return { ok: true }; // deselect is always allowed
  const status = effectiveStatus(venue, liveStatus, seatId);
  if (status === undefined || !SELECTABLE_STATUSES.includes(status)) {
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

/**
 * Keep only persisted ids that still exist and are still selectable. Seats the
 * visitor already holds come back from the server as `held`, so `held` is also
 * accepted here (otherwise a restored selection would be dropped on reconnect).
 */
function reconcilePersisted(
  venue: NormalizedVenue,
  liveStatus: LiveStatus,
  ids: SeatId[],
): Set<SeatId> {
  const next = new Set<SeatId>();
  for (const id of ids) {
    if (next.size >= MAX_SELECTION) break;
    if (!venue.seatsById.has(id)) continue;
    const status = effectiveStatus(venue, liveStatus, id);
    if (status === "available" || status === "held") next.add(id);
  }
  return next;
}

export interface SeatingState {
  venue: NormalizedVenue | undefined;
  selectedSeatIds: Set<SeatId>;
  /**
   * Live seat status (plan 09). Seeded from the venue on load, then replaced by
   * the backend snapshot and updated by WebSocket deltas — the single status
   * source the canvas and guards read from (no longer `venue.json`).
   */
  liveStatus: LiveStatus;
  transform: ViewportTransform;
  focusedSeatId: SeatId | undefined;
  /** Last rejected action, surfaced to aria-live for accessible feedback. */
  lastRejection: (SelectionRejection & { ok: false }) | undefined;
  /** Heat-map mode: colour seats by price tier instead of status (plan 09). */
  heatmap: boolean;

  /** Load a venue and rehydrate any persisted, still-valid selection. */
  setVenue: (venue: NormalizedVenue) => void;
  /** Replace the whole live-status map from a backend snapshot (plan 09). */
  applyStatusSnapshot: (snapshot: Record<SeatId, SeatStatus>) => void;
  /** Apply a single live status delta from the WebSocket channel (plan 09). */
  applyStatusDelta: (seatId: SeatId, status: SeatStatus) => void;
  /**
   * Replace the current selection from a server-authoritative set (plan 08).
   * Bulk restore path — reconciled against the live venue + status — kept
   * separate from the per-seat `toggleSeat` mutation, exactly like the
   * localStorage rehydration in `setVenue`.
   */
  rehydrateSelection: (seatIds: SeatId[]) => void;
  /** The one selection mutation path (select if absent, deselect if present). */
  toggleSeat: (seatId: SeatId) => void;
  clearSelection: () => void;
  setTransform: (transform: ViewportTransform) => void;
  setFocusedSeat: (seatId: SeatId | undefined) => void;
  acknowledgeRejection: () => void;
  /** Toggle the price-tier heat-map overlay (plan 09, Phase 3). */
  toggleHeatmap: () => void;
}

export const useSeatingStore = create<SeatingState>((set, get) => ({
  venue: undefined,
  selectedSeatIds: new Set(),
  liveStatus: new Map(),
  transform: IDENTITY_TRANSFORM,
  focusedSeatId: undefined,
  lastRejection: undefined,
  heatmap: false,

  setVenue: (venue) => {
    // Seed live status from the venue document so the map renders correctly
    // before the backend snapshot arrives; the snapshot then takes over.
    const liveStatus = new Map<SeatId, SeatStatus>(
      venue.seatOrder.map((seat) => [seat.id, seat.status]),
    );
    const persisted = loadPersistedSelection(venue.venueId);
    const selectedSeatIds = persisted
      ? reconcilePersisted(venue, liveStatus, persisted.selectedSeatIds)
      : new Set<SeatId>();
    set({
      venue,
      liveStatus,
      selectedSeatIds,
      focusedSeatId: undefined,
      lastRejection: undefined,
    });
  },

  applyStatusSnapshot: (snapshot) => {
    const { venue } = get();
    const next = new Map<SeatId, SeatStatus>();
    // Keep only seats the venue knows about; ignore stray ids defensively.
    for (const [seatId, status] of Object.entries(snapshot)) {
      if (!venue || venue.seatsById.has(seatId)) next.set(seatId, status);
    }
    set({ liveStatus: next });
  },

  applyStatusDelta: (seatId, status) => {
    const { venue, liveStatus } = get();
    if (venue && !venue.seatsById.has(seatId)) return;
    if (liveStatus.get(seatId) === status) return;
    const next = new Map(liveStatus);
    next.set(seatId, status);
    set({ liveStatus: next });
  },

  rehydrateSelection: (seatIds) => {
    const { venue, liveStatus } = get();
    if (!venue) return;
    const next = reconcilePersisted(venue, liveStatus, seatIds);
    set({ selectedSeatIds: next, lastRejection: undefined });
    // Keep the localStorage cache in step with the restored server state.
    savePersistedSelection({
      version: 1,
      venueId: venue.venueId,
      selectedSeatIds: [...next],
    });
  },

  toggleSeat: (seatId) => {
    const { venue, liveStatus, selectedSeatIds } = get();
    if (!venue) return;
    const next = new Set(selectedSeatIds);

    if (next.has(seatId)) {
      next.delete(seatId);
    } else {
      const verdict = canSelectSeat(venue, liveStatus, next, seatId);
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
  toggleHeatmap: () => set((s) => ({ heatmap: !s.heatmap })),
}));
