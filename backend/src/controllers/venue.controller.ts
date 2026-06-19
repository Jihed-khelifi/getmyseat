import type { Request, Response } from "express";

import type { SeatStatusService } from "../services/seat-status.service.js";
import type { VenueService } from "../services/venue.service.js";

/**
 * Read-only venue endpoints (plan 07 API surface). Thin handlers: all data comes
 * from the venue + seat-status services (coordination stays in services).
 */
export function createVenueController(
  venueService: VenueService,
  seatStatus: SeatStatusService,
) {
  return {
    /** `GET /venue` — server-owned geometry + price-tier contract. */
    getVenue(_req: Request, res: Response): void {
      res.status(200).json(venueService.getDocument());
    },

    /** `GET /seats/status` — current live seat-status snapshot `{ seatId: status }`. */
    getSeatStatus(_req: Request, res: Response): void {
      res.status(200).json(seatStatus.getSnapshot());
    },
  };
}
