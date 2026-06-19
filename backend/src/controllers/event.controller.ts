import type { Request, Response } from "express";

import type { EventService } from "../services/event.service.js";

/**
 * Public event endpoint (plan 10, Phase 4). Exposes only display fields — no
 * operational data — for the user-facing header/banner.
 */
export function createEventController(eventService: EventService) {
  return {
    /** `GET /event` — current event/arena metadata for the user-facing UI. */
    getEvent(_req: Request, res: Response): void {
      res.status(200).json(eventService.getEvent());
    },
  };
}
