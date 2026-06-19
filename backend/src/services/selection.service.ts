/**
 * Selection service (plan 08, Phase 2).
 *
 * The server-side mirror of the frontend's `toggleSeat` guards: a selection is
 * only stored if every seat exists, is currently selectable (`available`), there
 * are no duplicates, and the count is within {@link MAX_SELECTION}. Keeping the
 * rules identical to the client means the two never disagree.
 *
 * The `visitorId` is treated as opaque — it only addresses a record; no trust is
 * derived from it.
 */
import type { SeatStatusService } from "./seat-status.service.js";
import type { VenueService } from "./venue.service.js";
import type { HoldService } from "./hold.service.js";
import {
  MAX_SELECTION,
  type SelectionInput,
  type SelectionRecord,
  type VisitorId,
} from "../types/selection.js";
import type { SelectionRepository } from "../repositories/selection.repository.js";
import type { SeatId } from "../types/venue.js";

/** Statuses a visitor is allowed to hold — mirrors the frontend contract. */
const SELECTABLE_STATUSES = new Set(["available"]);

const EMPTY_HELD: ReadonlySet<SeatId> = new Set();

/** Thrown when a selection fails server-side validation; mapped to a 400. */
export class SelectionValidationError extends Error {
  constructor(
    message: string,
    readonly issues: string[],
  ) {
    super(message);
    this.name = "SelectionValidationError";
  }
}

export class SelectionService {
  constructor(
    private readonly repo: SelectionRepository,
    private readonly venueService: VenueService,
    private readonly seatStatus: SeatStatusService,
    /**
     * Optional optimistic-hold coordinator (gate G4). When present, saving a
     * selection holds its seats (broadcast live) and clearing releases them;
     * when absent the service behaves exactly as in plan 08.
     */
    private readonly holds?: HoldService,
  ) {}

  /** This visitor's saved selection (or `undefined`). */
  getSelection(visitorId: VisitorId): SelectionRecord | undefined {
    return this.repo.get(visitorId);
  }

  /**
   * Validate and persist a visitor's selection. Throws
   * {@link SelectionValidationError} when the input violates the shared rules.
   */
  saveSelection(visitorId: VisitorId, input: SelectionInput): SelectionRecord {
    const issues: string[] = [];

    const venueId = this.venueService.getDocument().venueId;
    if (input.venueId !== venueId) {
      issues.push(`Unknown venue "${input.venueId}" (expected "${venueId}").`);
    }

    // Seats this visitor already holds count as selectable for them, so adding a
    // seat to an existing selection does not trip the "held" guard (gate G4).
    const heldBySelf = this.holds?.heldByVisitor(visitorId) ?? EMPTY_HELD;

    const seen = new Set<string>();
    const seatIds: string[] = [];
    for (const seatId of input.seatIds) {
      if (seen.has(seatId)) continue; // dedupe silently
      seen.add(seatId);
      seatIds.push(seatId);

      const status = this.seatStatus.getStatus(seatId);
      if (status === undefined) {
        issues.push(`Unknown seat "${seatId}".`);
      } else if (!SELECTABLE_STATUSES.has(status) && !heldBySelf.has(seatId)) {
        issues.push(`Seat "${seatId}" is not selectable (status: ${status}).`);
      }
    }

    if (seatIds.length > MAX_SELECTION) {
      issues.push(`Too many seats: ${seatIds.length} (max ${MAX_SELECTION}).`);
    }

    if (issues.length > 0) {
      throw new SelectionValidationError("Selection rejected", issues);
    }

    const record = this.repo.save({
      visitorId,
      venueId,
      seatIds,
      updatedAt: new Date().toISOString(),
    });

    // Optimistic hold: mark added seats held + broadcast, release removed ones.
    this.holds?.syncHolds(visitorId, seatIds);

    return record;
  }

  /** Clear a visitor's selection (and release any seats they were holding). */
  clearSelection(visitorId: VisitorId): void {
    this.holds?.releaseVisitor(visitorId);
    this.repo.delete(visitorId);
  }
}
