import type { NextFunction, Request, Response } from "express";

import { logger } from "../utils/logger.js";

/** 404 handler for unmatched routes. Registered after all real routes. */
export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: "Not found" });
}

/**
 * Terminal error handler. Produces a stable JSON envelope so clients never
 * receive an HTML stack trace, and logs the underlying error for diagnosis.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  (req.log ?? logger).error({ err }, "Unhandled request error");
  if (res.headersSent) return;
  res.status(500).json({ error: "Internal server error" });
}
