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
      points: num(process.env.RATE_BURST_POINTS, 5),
      duration: num(process.env.RATE_BURST_DURATION, 10),
    },
    /** Sustained window: points per duration (seconds). */
    sustained: {
      points: num(process.env.RATE_SUSTAINED_POINTS, 10),
      duration: num(process.env.RATE_SUSTAINED_DURATION, 60),
    },
  },
} as const;
