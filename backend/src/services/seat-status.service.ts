/**
 * Seat-status store (plan 07, pillar 1 — backend-owned live seat status).
 *
 * Holds the mutable `Map<seatId, SeatStatus>` seeded from the venue document on
 * boot. This is the **single source of truth** for live status; `venue.json`
 * status is seed-only from here on.
 *
 * Scope note: this foundation only seeds and exposes status. The realtime
 * broadcast + optimistic-hold TTL model (gates G3/G4) is added on top in plan
 * 09 — this store is intentionally free of WebSocket/TTL concerns so those plans
 * plug into it without a rewrite.
 */
import type { SeatId, SeatStatus, SeatStatusSnapshot } from "../types/venue.js";

/** Notified whenever a seat's status actually changes. */
export type SeatStatusListener = (
  seatId: SeatId,
  status: SeatStatus,
  previous: SeatStatus,
) => void;

export class SeatStatusService {
  private readonly statuses = new Map<SeatId, SeatStatus>();
  private readonly listeners = new Set<SeatStatusListener>();

  /** @param seed Ordered `[seatId, status]` pairs from the venue document. */
  constructor(seed: Iterable<readonly [SeatId, SeatStatus]>) {
    for (const [seatId, status] of seed) {
      this.statuses.set(seatId, status);
    }
  }

  /**
   * Subscribe to status changes. Returns an unsubscribe function. This is how
   * the realtime broadcaster (plan 09) learns about deltas without the store
   * holding any WebSocket knowledge — the store only emits change events.
   */
  onChange(listener: SeatStatusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Whether a seat id exists in the venue. */
  has(seatId: SeatId): boolean {
    return this.statuses.has(seatId);
  }

  /** Current status for a single seat (or `undefined` if unknown). */
  getStatus(seatId: SeatId): SeatStatus | undefined {
    return this.statuses.get(seatId);
  }

  /**
   * Set a seat's status. Returns `true` if the value changed, `false` if the
   * seat is unknown or the status was already current. Later plans wrap this to
   * also broadcast deltas; the store itself stays broadcast-agnostic.
   */
  setStatus(seatId: SeatId, status: SeatStatus): boolean {
    const previous = this.statuses.get(seatId);
    if (previous === undefined) return false;
    if (previous === status) return false;
    this.statuses.set(seatId, status);
    for (const listener of this.listeners) {
      listener(seatId, status, previous);
    }
    return true;
  }

  /** Full point-in-time snapshot for `GET /seats/status`. */
  getSnapshot(): SeatStatusSnapshot {
    const snapshot: SeatStatusSnapshot = {};
    for (const [seatId, status] of this.statuses) {
      snapshot[seatId] = status;
    }
    return snapshot;
  }

  /** Number of seats tracked (seeded from the venue document). */
  get size(): number {
    return this.statuses.size;
  }

  /** Seat counts grouped by status (admin overview, plan 10). */
  countByStatus(): Record<SeatStatus, number> {
    const counts: Record<SeatStatus, number> = {
      available: 0,
      reserved: 0,
      sold: 0,
      held: 0,
    };
    for (const status of this.statuses.values()) counts[status] += 1;
    return counts;
  }
}
