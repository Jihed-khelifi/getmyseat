/**
 * Centralized runtime configuration with environment overrides.
 *
 * Timing-sensitive values (cache TTL, sweep interval) are configurable so
 * tests can shorten them without weakening the documented behavior.
 */

function num(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  port: num(process.env.PORT, 3001),
  logLevel: process.env.LOG_LEVEL ?? "info",

  /** Artificial repository read latency (ms) to make caching observable. */
  repoReadDelayMs: num(process.env.REPO_READ_DELAY_MS, 200),

  /** How long an optimistic seat hold survives before auto-release (gate G4). */
  holdTtlMs: num(process.env.HOLD_TTL_MS, 120_000),

  /**
   * Demo-grade admin auth (plan 10, gate G5). A single operator credential pair
   * is exchanged for an opaque in-memory bearer token. This is intentionally NOT
   * production auth — no user store, no refresh tokens, no RBAC.
   */
  admin: {
    email: process.env.ADMIN_EMAIL ?? "admin@getmyseat.local",
    password: process.env.ADMIN_PASSWORD ?? "change-me",
    /** Bearer-token lifetime (ms). */
    tokenTtlMs: num(process.env.ADMIN_TOKEN_TTL_MS, 60 * 60 * 1000),
  },

  /** Time-bucketed performance metrics (plan 10, gate G6). */
  metrics: {
    /** Bucket width (ms); default one minute. */
    bucketMs: num(process.env.METRICS_BUCKET_MS, 60_000),
    /** Number of buckets retained (ring buffer); default ~3 hours of minutes. */
    retainBuckets: num(process.env.METRICS_RETAIN_BUCKETS, 180),
  },

  cache: {
    /** Max number of cached users. */
    max: num(process.env.CACHE_MAX, 1000),
    /** Entry TTL (ms). */
    ttlMs: num(process.env.CACHE_TTL_MS, 60_000),
    /** Background stale-sweep interval (ms). */
    sweepIntervalMs: num(process.env.CACHE_SWEEP_INTERVAL_MS, 7_000),
  },

  rateLimit: {
    /** Burst window: points per duration (seconds). */
    burst: {
      points: num(process.env.RATE_BURST_POINTS, 150),
      duration: num(process.env.RATE_BURST_DURATION, 10),
    },
    /** Sustained window: points per duration (seconds). */
    sustained: {
      points: num(process.env.RATE_SUSTAINED_POINTS, 300),
      duration: num(process.env.RATE_SUSTAINED_DURATION, 60),
    },
    /**
     * Dedicated, stricter limiter for `POST /admin/login` (plan 10, Phase 2).
     * Independent from the global windows so brute-forcing the credential pair
     * is throttled without affecting normal traffic.
     */
    adminLogin: {
      points: num(process.env.RATE_ADMIN_LOGIN_POINTS, 120),
      duration: num(process.env.RATE_ADMIN_LOGIN_DURATION, 600),
    },
  },
} as const;
