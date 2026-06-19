/**
 * Seat-hold service (plan 09, Phase 1 — gate G4: optimistic hold + TTL).
 *
 * When a visitor saves a selection, the seats they add are marked `held` in the
 * seat-status store (which broadcasts the delta); deselecting a seat, clearing
 * the selection, or a TTL expiry reverts the seat to `available` (also
 * broadcast). Hold expiry is centralized here, mirroring the cache sweeper:
 * every held seat carries a single auto-release timer.
 *
 * The service only ever holds seats that were `available`, so the revert target
 * is always `available`. A seat is held by at most one visitor; a second
 * visitor selecting it is rejected upstream in `SelectionService`.
 */
import type { SeatStatusService } from "./seat-status.service.js";
import type { SeatId } from "../types/venue.js";
import type { VisitorId } from "../types/selection.js";

const EMPTY: ReadonlySet<SeatId> = new Set();

export class HoldService {
  private readonly holdsByVisitor = new Map<VisitorId, Set<SeatId>>();
  private readonly seatOwner = new Map<SeatId, VisitorId>();
  private readonly timers = new Map<SeatId, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly seatStatus: SeatStatusService,
    private readonly ttlMs: number,
  ) {}

  /** Seats currently held by this visitor (treated as selectable for them). */
  heldByVisitor(visitorId: VisitorId): ReadonlySet<SeatId> {
    return this.holdsByVisitor.get(visitorId) ?? EMPTY;
  }

  /**
   * Reconcile a visitor's holds to exactly `seatIds`: newly added seats are
   * held + broadcast, removed seats are released, and kept seats have their TTL
   * refreshed. Call this only after the selection has passed validation.
   */
  syncHolds(visitorId: VisitorId, seatIds: readonly SeatId[]): void {
    const desired = new Set(seatIds);
    const previous = this.holdsByVisitor.get(visitorId) ?? new Set<SeatId>();

    for (const seatId of previous) {
      if (!desired.has(seatId)) this.release(seatId);
    }

    for (const seatId of desired) {
      if (!previous.has(seatId)) {
        this.seatOwner.set(seatId, visitorId);
        this.seatStatus.setStatus(seatId, "held");
      }
      this.armExpiry(seatId);
    }

    if (desired.size > 0) this.holdsByVisitor.set(visitorId, desired);
    else this.holdsByVisitor.delete(visitorId);
  }

  /** Release every seat this visitor holds (used on DELETE /selections/me). */
  releaseVisitor(visitorId: VisitorId): void {
    const held = this.holdsByVisitor.get(visitorId);
    if (!held) return;
    for (const seatId of [...held]) this.release(seatId);
    this.holdsByVisitor.delete(visitorId);
  }

  /** Clear all timers (shutdown / tests) so no handles keep the process alive. */
  stop(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  /** Fully release one seat: clear its timer, drop ownership, revert to available. */
  private release(seatId: SeatId): void {
    const timer = this.timers.get(seatId);
    if (timer) clearTimeout(timer);
    this.timers.delete(seatId);

    const owner = this.seatOwner.get(seatId);
    if (owner) {
      const held = this.holdsByVisitor.get(owner);
      held?.delete(seatId);
      if (held && held.size === 0) this.holdsByVisitor.delete(owner);
    }
    this.seatOwner.delete(seatId);
    this.seatStatus.setStatus(seatId, "available");
  }

  /** (Re)arm the auto-release timer for a held seat. */
  private armExpiry(seatId: SeatId): void {
    const existing = this.timers.get(seatId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => this.release(seatId), this.ttlMs);
    timer.unref?.();
    this.timers.set(seatId, timer);
  }
}
