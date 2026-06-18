/**
 * Domain types for the seating map.
 *
 * Ownership (plan 02): this file holds **domain types only** — no runtime logic,
 * no Zod, no React. Runtime parsing lives in `seat-validation.ts`.
 *
 * Two shapes are modeled:
 *  - "Raw" types mirror the on-disk `public/venue.json` (nested sections → rows → seats).
 *  - "Normalized" types are the flattened, lookup-friendly structures the app renders
 *    from. Normalization happens once (see `seat-validation.ts#normalizeVenue`).
 */

/** Stable identifier aliases — string at runtime, but self-documenting in signatures. */
export type VenueId = string;
export type SectionId = string;
export type RowId = string;
export type SeatId = string;
export type PriceTierId = string;

/**
 * Persisted, non-selectable seat status as it appears in venue data.
 * `selected` is intentionally NOT here: selection is UI state derived from the
 * selection set, not a property of the seat data.
 */
export type SeatStatus = "available" | "reserved" | "sold" | "held";

/** Statuses a user is allowed to select. Enforced centrally (plan 03, Phase 4). */
export const SELECTABLE_STATUSES: readonly SeatStatus[] = ["available"];

/** A price band shared by many seats. Amounts are integer minor units (e.g. cents). */
export interface PriceTier {
  id: PriceTierId;
  label: string;
  /** Price in the venue currency's minor units (cents) for deterministic math. */
  priceCents: number;
  /** Optional override color for heat-map / legend (plan 03, Phase 6 stretch). */
  color?: string;
}

/** World-space dimensions of the seating map (the canvas coordinate system). */
export interface VenueMap {
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Raw (venue.json) shape
// ---------------------------------------------------------------------------

export interface RawSeat {
  id: SeatId;
  /** Human-facing seat label, e.g. "12". */
  label: string;
  /** World-space coordinates inside `VenueMap`. */
  x: number;
  y: number;
  status: SeatStatus;
  priceTierId: PriceTierId;
}

export interface RawRow {
  id: RowId;
  /** Human-facing row label, e.g. "A". */
  label: string;
  seats: RawSeat[];
}

export interface RawSection {
  id: SectionId;
  label: string;
  rows: RawRow[];
}

export interface RawVenue {
  venueId: VenueId;
  name: string;
  /** ISO 4217 currency code, e.g. "USD". */
  currency: string;
  map: VenueMap;
  priceTiers: PriceTier[];
  sections: RawSection[];
}

// ---------------------------------------------------------------------------
// Normalized shape
// ---------------------------------------------------------------------------

/** A seat enriched with denormalized parent references and a stable render index. */
export interface Seat {
  id: SeatId;
  label: string;
  x: number;
  y: number;
  status: SeatStatus;
  priceTierId: PriceTierId;
  sectionId: SectionId;
  rowId: RowId;
  /** Position within its row, ordered left-to-right (used for keyboard nav & adjacency). */
  colIndex: number;
}

export interface Section {
  id: SectionId;
  label: string;
  rowIds: RowId[];
}

export interface Row {
  id: RowId;
  label: string;
  sectionId: SectionId;
  /** Seat ids ordered by ascending x (deterministic left/right navigation). */
  seatIds: SeatId[];
}

/**
 * The fully normalized venue. Built once at load time; the render, state, and
 * a11y layers all read from these lookups rather than re-deriving them.
 */
export interface NormalizedVenue {
  venueId: VenueId;
  name: string;
  currency: string;
  map: VenueMap;

  /** Ordered list used by the canvas renderer. */
  seatOrder: Seat[];

  seatsById: ReadonlyMap<SeatId, Seat>;
  sectionsById: ReadonlyMap<SectionId, Section>;
  rowsById: ReadonlyMap<RowId, Row>;
  priceTiersById: ReadonlyMap<PriceTierId, PriceTier>;

  /** Ordered row ids, top-to-bottom, for deterministic vertical navigation. */
  rowOrder: RowId[];
}

// ---------------------------------------------------------------------------
// Selection & viewport state
// ---------------------------------------------------------------------------

/** Aggregated view of the current selection, recomputed from the selected ids. */
export interface SelectionSummary {
  seatIds: SeatId[];
  count: number;
  /** Subtotal across selected seats in minor units. */
  subtotalCents: number;
  currency: string;
  /** Per-price-tier breakdown for the summary panel. */
  byTier: Array<{ tier: PriceTier; count: number; subtotalCents: number }>;
}

/**
 * Affine viewport transform mapping world coordinates → screen coordinates.
 * screen = world * scale + offset. Centralized in `render/viewport.ts`.
 */
export interface ViewportTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/** Maximum seats a user may hold at once (required deliverable). */
export const MAX_SELECTION = 8 as const;

/**
 * Persisted selection state. Scoped/validated by `venueId` so a stale selection
 * for a different venue is never re-applied (plan 06 risk note).
 */
export interface PersistedSelectionState {
  /** Schema version to allow safe future migrations. */
  version: 1;
  venueId: VenueId;
  selectedSeatIds: SeatId[];
}
