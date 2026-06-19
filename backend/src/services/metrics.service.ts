/**
 * Performance metrics recorder (plan 10, Phase 1 — gate G6).
 *
 * An in-process, time-bucketed ring buffer that records, per request: duration,
 * status class (2xx/4xx/5xx), and cache outcome (HIT/MISS) where applicable.
 * It builds on the existing `pino-http` request lifecycle (the metrics
 * middleware records on response `finish`) and the `CacheService` `X-Cache`
 * header rather than creating a parallel timing system.
 *
 * Memory stays bounded: at most {@link MetricsServiceOptions.retainBuckets}
 * buckets are kept, each `O(1)` to update. No external metrics backend.
 */

/** Cache outcome for a single request, when the route participates in caching. */
export type CacheOutcome = "HIT" | "MISS" | undefined;

/** What the metrics middleware reports for one completed request. */
export interface RequestSample {
  /** Wall-clock duration (ms) from request receipt to response finish. */
  durationMs: number;
  /** Final HTTP status code. */
  statusCode: number;
  /** `X-Cache` outcome, if the route set one. */
  cacheOutcome?: CacheOutcome;
}

/** A single time bucket's rolled-up counters. */
interface Bucket {
  /** Bucket start (epoch ms, aligned to `bucketMs`). */
  start: number;
  requests: number;
  errors: number; // 5xx
  clientErrors: number; // 4xx
  totalDurationMs: number;
  maxDurationMs: number;
  cacheHits: number;
  cacheMisses: number;
}

/** A bucket as exposed to admin consumers (`GET /admin/metrics`). */
export interface MetricsBucket {
  /** ISO-8601 bucket start time. */
  at: string;
  requests: number;
  errors: number;
  clientErrors: number;
  /** errors / requests (0 when no traffic). */
  errorRate: number;
  averageResponseTimeMs: number;
  maxResponseTimeMs: number;
  cacheHits: number;
  cacheMisses: number;
  /** hits / (hits + misses) (0 when the bucket saw no cacheable traffic). */
  cacheHitRate: number;
}

/** Process-lifetime rollup across all retained buckets. */
export interface MetricsSummary {
  requests: number;
  errors: number;
  errorRate: number;
  averageResponseTimeMs: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;
}

export interface MetricsServiceOptions {
  /** Bucket width (ms). */
  bucketMs: number;
  /** Max buckets retained (ring buffer). */
  retainBuckets: number;
  /** Injectable clock for deterministic tests. */
  now?: () => number;
}

export class MetricsService {
  private readonly bucketMs: number;
  private readonly retainBuckets: number;
  private readonly now: () => number;
  /** Ordered oldest → newest; pruned to `retainBuckets`. */
  private readonly buckets: Bucket[] = [];

  constructor(options: MetricsServiceOptions) {
    this.bucketMs = Math.max(1, options.bucketMs);
    this.retainBuckets = Math.max(1, options.retainBuckets);
    this.now = options.now ?? Date.now;
  }

  /** Record one completed request into its time bucket. */
  record(sample: RequestSample): void {
    const bucket = this.currentBucket();
    bucket.requests += 1;
    bucket.totalDurationMs += sample.durationMs;
    if (sample.durationMs > bucket.maxDurationMs) {
      bucket.maxDurationMs = sample.durationMs;
    }
    if (sample.statusCode >= 500) bucket.errors += 1;
    else if (sample.statusCode >= 400) bucket.clientErrors += 1;
    if (sample.cacheOutcome === "HIT") bucket.cacheHits += 1;
    else if (sample.cacheOutcome === "MISS") bucket.cacheMisses += 1;
  }

  /** The time-bucketed series, oldest → newest. */
  getSeries(): MetricsBucket[] {
    return this.buckets.map((b) => this.project(b));
  }

  /** Lifetime rollup across all retained buckets (used by the admin overview). */
  getSummary(): MetricsSummary {
    let requests = 0;
    let errors = 0;
    let totalDuration = 0;
    let cacheHits = 0;
    let cacheMisses = 0;
    for (const b of this.buckets) {
      requests += b.requests;
      errors += b.errors;
      totalDuration += b.totalDurationMs;
      cacheHits += b.cacheHits;
      cacheMisses += b.cacheMisses;
    }
    const cacheTotal = cacheHits + cacheMisses;
    return {
      requests,
      errors,
      errorRate: requests === 0 ? 0 : errors / requests,
      averageResponseTimeMs: requests === 0 ? 0 : totalDuration / requests,
      cacheHits,
      cacheMisses,
      cacheHitRate: cacheTotal === 0 ? 0 : cacheHits / cacheTotal,
    };
  }

  /** Resolve (creating if needed) the bucket for the current time. */
  private currentBucket(): Bucket {
    const start = Math.floor(this.now() / this.bucketMs) * this.bucketMs;
    const last = this.buckets[this.buckets.length - 1];
    if (last && last.start === start) return last;
    const bucket: Bucket = {
      start,
      requests: 0,
      errors: 0,
      clientErrors: 0,
      totalDurationMs: 0,
      maxDurationMs: 0,
      cacheHits: 0,
      cacheMisses: 0,
    };
    this.buckets.push(bucket);
    while (this.buckets.length > this.retainBuckets) this.buckets.shift();
    return bucket;
  }

  private project(b: Bucket): MetricsBucket {
    const cacheTotal = b.cacheHits + b.cacheMisses;
    return {
      at: new Date(b.start).toISOString(),
      requests: b.requests,
      errors: b.errors,
      clientErrors: b.clientErrors,
      errorRate: b.requests === 0 ? 0 : b.errors / b.requests,
      averageResponseTimeMs:
        b.requests === 0 ? 0 : b.totalDurationMs / b.requests,
      maxResponseTimeMs: b.maxDurationMs,
      cacheHits: b.cacheHits,
      cacheMisses: b.cacheMisses,
      cacheHitRate: cacheTotal === 0 ? 0 : b.cacheHits / cacheTotal,
    };
  }
}
