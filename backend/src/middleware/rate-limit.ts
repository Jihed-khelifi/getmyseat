import type { NextFunction, Request, Response } from "express";
import { RateLimiterMemory, type RateLimiterRes } from "rate-limiter-flexible";

import { config } from "../config.js";

/**
 * Two coordinated fixed windows, both keyed by client IP:
 *   - burst:     15 requests / 10s
 *   - sustained: 30 requests / 60s
 *
 * A request must satisfy both windows. The configuration lives in one place
 * ({@link config.rateLimit}) so the model is easy to explain and adjust.
 */
const limiters = [
  new RateLimiterMemory({
    keyPrefix: "burst",
    points: config.rateLimit.burst.points,
    duration: config.rateLimit.burst.duration,
  }),
  new RateLimiterMemory({
    keyPrefix: "sustained",
    points: config.rateLimit.sustained.points,
    duration: config.rateLimit.sustained.duration,
  }),
];

function isRateLimiterRes(value: unknown): value is RateLimiterRes {
  return typeof value === "object" && value !== null && "msBeforeNext" in value;
}

export function rateLimit(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const key = req.ip ?? "unknown";

  Promise.all(limiters.map((limiter) => limiter.consume(key)))
    .then(() => next())
    .catch((rejection: unknown) => {
      const retryMs = isRateLimiterRes(rejection)
        ? rejection.msBeforeNext
        : 1_000;
      res.set("Retry-After", String(Math.ceil(retryMs / 1_000)));
      res
        .status(429)
        .json({ error: "Too many requests", retryAfterMs: retryMs });
    });
}
