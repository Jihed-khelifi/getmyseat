/**
 * Admin guard + login rate limiter (plan 10, Phase 2).
 *
 * The bearer-token check lives in exactly one middleware (never scattered
 * through controllers, per the plan-07 security rule). A dedicated, stricter
 * rate limiter throttles `POST /admin/login` so the single credential pair
 * cannot be brute-forced, independent of the global request limiter.
 */
import type { NextFunction, Request, Response } from "express";
import { RateLimiterMemory, type RateLimiterRes } from "rate-limiter-flexible";

import { config } from "../config.js";
import type { AdminAuthService } from "../services/admin-auth.service.js";

/** Extract a bearer token from the `Authorization` header. */
function bearerToken(req: Request): string | undefined {
  const header = req.header("Authorization");
  if (!header) return undefined;
  const [scheme, value] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !value) return undefined;
  return value.trim();
}

/** Guard applied to every `/admin/*` route except login. */
export function requireAdmin(auth: AdminAuthService) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (auth.verify(bearerToken(req))) {
      next();
      return;
    }
    res.status(401).json({ error: "Unauthorized" });
  };
}

const loginLimiter = new RateLimiterMemory({
  keyPrefix: "admin-login",
  points: config.rateLimit.adminLogin.points,
  duration: config.rateLimit.adminLogin.duration,
});

function isRateLimiterRes(value: unknown): value is RateLimiterRes {
  return typeof value === "object" && value !== null && "msBeforeNext" in value;
}

/** Stricter rate limit for the login route only. */
export function adminLoginRateLimit(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const key = req.ip ?? "unknown";
  loginLimiter
    .consume(key)
    .then(() => next())
    .catch((rejection: unknown) => {
      const retryMs = isRateLimiterRes(rejection)
        ? rejection.msBeforeNext
        : 1_000;
      res.set("Retry-After", String(Math.ceil(retryMs / 1_000)));
      res
        .status(429)
        .json({ error: "Too many login attempts", retryAfterMs: retryMs });
    });
}
