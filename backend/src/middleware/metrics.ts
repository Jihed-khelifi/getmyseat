/**
 * Performance-metrics middleware (plan 10, Phase 1).
 *
 * Records per-request timing into the {@link MetricsService} and a compact line
 * into the {@link LogBuffer} when the response finishes. It is mounted early
 * (before rate limiting) so even rejected (429) requests are measured, and it
 * reads the `X-Cache` header the user controller already sets rather than
 * introducing a parallel cache-timing path.
 */
import type { NextFunction, Request, Response } from "express";

import type { LogBuffer } from "../services/log-buffer.js";
import type {
  CacheOutcome,
  MetricsService,
} from "../services/metrics.service.js";

function readCacheOutcome(res: Response): CacheOutcome {
  const header = res.getHeader("X-Cache");
  if (header === "HIT" || header === "MISS") return header;
  return undefined;
}

export function createMetricsMiddleware(
  metrics: MetricsService,
  logBuffer: LogBuffer,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const start = process.hrtime.bigint();
    res.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      const cacheOutcome = readCacheOutcome(res);
      metrics.record({
        durationMs,
        statusCode: res.statusCode,
        cacheOutcome,
      });
      logBuffer.recordRequest({
        at: new Date().toISOString(),
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs,
        cacheOutcome,
      });
    });
    next();
  };
}
