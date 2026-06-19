import { Router } from "express";

import { createEventController } from "../controllers/event.controller.js";
import type { EventService } from "../services/event.service.js";

/** Public event route (plan 10, Phase 4). Mounted at the app root as `GET /event`. */
export function createEventRoutes(eventService: EventService): Router {
  const router = Router();
  const controller = createEventController(eventService);

  router.get("/event", controller.getEvent);

  return router;
}
