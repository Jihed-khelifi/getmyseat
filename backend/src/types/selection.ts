/**
 * Selection domain types (plan 08 — persistent selections & visitor sessions).
 *
 * A selection is stored server-side keyed by an opaque `visitorId` (no login,
 * gate G1). The record mirrors plan 07's `SelectionRecord` sketch.
 */

/** Opaque per-browser visitor handle (gate G1: client UUID + `X-Visitor-Id`). */
export type VisitorId = string;

/**
 * Maximum seats a visitor may hold at once. This is the **server-side mirror**
 * of the frontend's `MAX_SELECTION` (plan 02). The number is intentionally
 * duplicated and documented in both READMEs so client and server never disagree
 * (plan 08, Phase 2 agent note).
 */
export const MAX_SELECTION = 8 as const;

/** A visitor's saved selection, persisted in the file-backed mock DB. */
export interface SelectionRecord {
  visitorId: VisitorId;
  venueId: string;
  /** Selected seat ids (≤ {@link MAX_SELECTION}, validated against live status). */
  seatIds: string[];
  /** ISO-8601 timestamp of the last write. */
  updatedAt: string;
}

/** Validated input accepted by `PUT /selections/me`. */
export interface SelectionInput {
  venueId: string;
  seatIds: string[];
}
