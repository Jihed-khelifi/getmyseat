import type { NextFunction, Request, Response } from "express";

import type { LogBuffer } from "../services/log-buffer.js";
import { logger } from "../utils/logger.js";

/** 404 handler for unmatched routes. Registered after all real routes. */
export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: "Not found" });
}

/**
 * Terminal error handler. Produces a stable JSON envelope so clients never
 * receive an HTML stack trace, logs the underlying error for diagnosis, and
 * (when provided) records a bounded entry in the admin log buffer so error
 * rates surface in `/admin` (plan 10).
 */
export function createErrorHandler(logBuffer?: LogBuffer) {
  return (
    err: unknown,
    req: Request,
    res: Response,
    _next: NextFunction,
  ): void => {
    (req.log ?? logger).error({ err }, "Unhandled request error");
    logBuffer?.recordError({
      at: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl,
      message: err instanceof Error ? err.message : "Unknown error",
    });
    if (res.headersSent) return;
    res.status(500).json({ error: "Internal server error" });
  };
}

/** Default error handler with no log buffer (backwards-compatible export). */
export const errorHandler = createErrorHandler();
