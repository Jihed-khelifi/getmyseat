import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodSchema } from "zod";

interface ValidationSchemas {
  params?: ZodSchema;
  body?: ZodSchema;
}

/**
 * Typed request validation. Parsed values replace the originals so handlers
 * consume strongly-shaped, trimmed data. Validation failures short-circuit with
 * a stable `400` envelope.
 */
export function validate(schemas: ValidationSchemas) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params);
      if (schemas.body) req.body = schemas.body.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        res
          .status(400)
          .json({ error: "Validation failed", details: err.flatten() });
        return;
      }
      next(err);
    }
  };
}
