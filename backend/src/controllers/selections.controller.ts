import type { Request, Response } from "express";
import { z } from "zod";

import {
  SelectionService,
  SelectionValidationError,
} from "../services/selection.service.js";
import { MAX_SELECTION } from "../types/selection.js";

/**
 * `PUT /selections/me` body schema. Shape-only validation lives here; the
 * semantic rules (seat existence, selectable status, the 8-seat cap) are
 * enforced in {@link SelectionService} so client and server share one source of
 * truth. The array bound is generous (cap is re-checked server-side after dedupe).
 */
export const saveSelectionSchema = z.object({
  venueId: z.string().min(1, "venueId is required"),
  seatIds: z.array(z.string().min(1)).max(MAX_SELECTION * 4),
});

export function createSelectionsController(selectionService: SelectionService) {
  return {
    /** `GET /selections/me` — this visitor's saved selection (or an empty one). */
    getMine(req: Request, res: Response): void {
      const visitorId = req.visitorId!;
      const record = selectionService.getSelection(visitorId);
      if (record) {
        res.status(200).json(record);
        return;
      }
      // No stored record yet: return an empty selection (updatedAt: null) so the
      // client can distinguish "never saved" from "saved but empty".
      res
        .status(200)
        .json({ visitorId, venueId: null, seatIds: [], updatedAt: null });
    },

    /** `PUT /selections/me` — validate + replace this visitor's selection. */
    putMine(req: Request, res: Response): void {
      const visitorId = req.visitorId!;
      const body = req.body as z.infer<typeof saveSelectionSchema>;
      try {
        const record = selectionService.saveSelection(visitorId, body);
        res.status(200).json(record);
      } catch (err) {
        if (err instanceof SelectionValidationError) {
          res
            .status(400)
            .json({ error: err.message, details: { issues: err.issues } });
          return;
        }
        throw err;
      }
    },

    /** `DELETE /selections/me` — clear this visitor's selection. */
    deleteMine(req: Request, res: Response): void {
      selectionService.clearSelection(req.visitorId!);
      res.status(204).end();
    },
  };
}
