import { describe, expect, it } from "vitest";

import { MetricsService } from "../src/services/metrics.service.js";

/**
 * Plan 10, Phase 1: the time-bucketed metrics recorder. A controllable clock
 * lets us assert bucketing, error rate, cache hit rate, and ring-buffer
 * retention deterministically.
 */
describe("MetricsService", () => {
  it("buckets requests and computes error + cache hit rates", () => {
    let now = 0;
    const metrics = new MetricsService({
      bucketMs: 1000,
      retainBuckets: 10,
      now: () => now,
    });

    metrics.record({ durationMs: 10, statusCode: 200, cacheOutcome: "MISS" });
    metrics.record({ durationMs: 2, statusCode: 200, cacheOutcome: "HIT" });
    metrics.record({ durationMs: 5, statusCode: 500 });
    metrics.record({ durationMs: 3, statusCode: 404 });

    const series = metrics.getSeries();
    expect(series).toHaveLength(1);
    const bucket = series[0]!;
    expect(bucket.requests).toBe(4);
    expect(bucket.errors).toBe(1);
    expect(bucket.clientErrors).toBe(1);
    expect(bucket.errorRate).toBeCloseTo(0.25);
    expect(bucket.cacheHits).toBe(1);
    expect(bucket.cacheMisses).toBe(1);
    expect(bucket.cacheHitRate).toBeCloseTo(0.5);
    expect(bucket.averageResponseTimeMs).toBeCloseTo((10 + 2 + 5 + 3) / 4);
    expect(bucket.maxResponseTimeMs).toBe(10);
  });

  it("opens a new bucket when the clock advances past the bucket width", () => {
    let now = 0;
    const metrics = new MetricsService({
      bucketMs: 1000,
      retainBuckets: 10,
      now: () => now,
    });

    metrics.record({ durationMs: 10, statusCode: 200 });
    now = 1500; // next bucket
    metrics.record({ durationMs: 20, statusCode: 200 });

    const series = metrics.getSeries();
    expect(series).toHaveLength(2);
    expect(series[0]!.requests).toBe(1);
    expect(series[1]!.requests).toBe(1);
  });

  it("retains at most `retainBuckets` buckets (ring buffer)", () => {
    let now = 0;
    const metrics = new MetricsService({
      bucketMs: 1000,
      retainBuckets: 2,
      now: () => now,
    });

    for (let i = 0; i < 5; i += 1) {
      now = i * 1000;
      metrics.record({ durationMs: 1, statusCode: 200 });
    }

    expect(metrics.getSeries()).toHaveLength(2);
  });

  it("summarizes lifetime totals across buckets", () => {
    let now = 0;
    const metrics = new MetricsService({
      bucketMs: 1000,
      retainBuckets: 10,
      now: () => now,
    });

    metrics.record({ durationMs: 10, statusCode: 200, cacheOutcome: "HIT" });
    now = 2000;
    metrics.record({ durationMs: 30, statusCode: 500, cacheOutcome: "MISS" });

    const summary = metrics.getSummary();
    expect(summary.requests).toBe(2);
    expect(summary.errors).toBe(1);
    expect(summary.errorRate).toBeCloseTo(0.5);
    expect(summary.averageResponseTimeMs).toBeCloseTo(20);
    expect(summary.cacheHitRate).toBeCloseTo(0.5);
  });
});
