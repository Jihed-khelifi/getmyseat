/**
 * Venue domain types for the backend (plan 07, pillar 1).
 *
 * Phase 2 splits the two concerns that used to live together in `venue.json`:
 *  - **Geometry + price tiers** stay defined by the venue document (the contract).
 *  - **Live seat status** becomes backend-owned (a mutable map seeded from the
 *    document on boot).
 *
 * These types mirror the on-disk venue contract the frontend already validates
 * in `frontend/src/features/seating/model/seat-types.ts`. They are duplicated
 * here deliberately: the backend owns a server-side copy of the contract and
 * must not depend on the frontend package (additive, not a rewrite).
 */

/** Stable, self-documenting id aliases (string at runtime). */
export type VenueId = string;
export type SectionId = string;
export type RowId = string;
export type SeatId = string;
export type PriceTierId = string;

/**
 * Persisted, non-selectable seat status. `available`/`held`/`sold` are the live
 * states phase 2 broadcasts; `reserved` is a seed-only state from the contract.
 */
export type SeatStatus = "available" | "reserved" | "sold" | "held";

/** A price band shared by many seats. Amounts are integer minor units (cents). */
export interface PriceTier {
  id: PriceTierId;
  label: string;
  priceCents: number;
  color?: string;
}

/** World-space dimensions of the seating map. */
export interface VenueMap {
  width: number;
  height: number;
}

export interface RawSeat {
  id: SeatId;
  label: string;
  x: number;
  y: number;
  status: SeatStatus;
  priceTierId: PriceTierId;
}

export interface RawRow {
  id: RowId;
  label: string;
  seats: RawSeat[];
}

export interface RawSection {
  id: SectionId;
  label: string;
  rows: RawRow[];
}

/** The full venue document — the server-owned copy of the geometry/price contract. */
export interface VenueDocument {
  venueId: VenueId;
  name: string;
  currency: string;
  map: VenueMap;
  priceTiers: PriceTier[];
  sections: RawSection[];
}

/** Flat seat-status snapshot returned by `GET /seats/status`. */
export type SeatStatusSnapshot = Record<SeatId, SeatStatus>;
