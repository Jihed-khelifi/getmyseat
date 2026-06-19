import { Router } from "express";

import {
  createSelectionsController,
  saveSelectionSchema,
} from "../controllers/selections.controller.js";
import { validate } from "../middleware/validate.js";
import { visitorId } from "../middleware/visitor-id.js";
import type { SelectionService } from "../services/selection.service.js";

/**
 * Visitor-scoped selection routes (plan 08, Phase 4). The visitor-id middleware
 * is scoped here so `req.visitorId` is resolved for exactly these endpoints and
 * controllers stay thin (they just read the handle).
 */
export function createSelectionsRoutes(
  selectionService: SelectionService,
): Router {
  const router = Router();
  const controller = createSelectionsController(selectionService);

  router.use(visitorId);

  router.get("/me", controller.getMine);
  router.put(
    "/me",
    validate({ body: saveSelectionSchema }),
    controller.putMine,
  );
  router.delete("/me", controller.deleteMine);

  return router;
}
