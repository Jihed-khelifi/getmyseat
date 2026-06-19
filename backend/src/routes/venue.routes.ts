import { Router } from "express";

import { createVenueController } from "../controllers/venue.controller.js";
import type { SeatStatusService } from "../services/seat-status.service.js";
import type { VenueService } from "../services/venue.service.js";

/**
 * Venue + seat-status routes (plan 07). Mounted at the app root so the paths
 * read as `GET /venue` and `GET /seats/status`.
 */
export function createVenueRoutes(
  venueService: VenueService,
  seatStatus: SeatStatusService,
): Router {
  const router = Router();
  const controller = createVenueController(venueService, seatStatus);

  router.get("/venue", controller.getVenue);
  router.get("/seats/status", controller.getSeatStatus);

  return router;
}
