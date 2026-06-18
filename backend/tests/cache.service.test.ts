import { describe, expect, it } from "vitest";

import { CacheService } from "../src/services/cache.service.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("CacheService", () => {
  it("reports hit rate from recorded hits and misses", () => {
    const cache = new CacheService({
      max: 10,
      ttlMs: 1_000,
      sweepIntervalMs: 60_000,
    });
    cache.recordHit();
    cache.recordMiss();
    cache.recordMiss();

    const stats = cache.stats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(2);
    expect(stats.hitRate).toBeCloseTo(1 / 3);

    cache.stop();
  });

  it("tracks a cumulative average response time", () => {
    const cache = new CacheService({
      max: 10,
      ttlMs: 1_000,
      sweepIntervalMs: 60_000,
    });
    cache.recordResponseTime(10);
    cache.recordResponseTime(30);

    expect(cache.stats().averageResponseTimeMs).toBe(20);
    cache.stop();
  });

  it("actively purges stale entries and counts them", async () => {
    const cache = new CacheService({
      max: 10,
      ttlMs: 30,
      sweepIntervalMs: 60_000,
    });
    cache.set("a", { id: "a" });
    cache.set("b", { id: "b" });

    await sleep(50);
    const purged = cache.purgeStale();

    expect(purged).toBe(2);
    expect(cache.stats().size).toBe(0);
    expect(cache.stats().stalePurges).toBe(2);
    cache.stop();
  });

  it("clears entries but preserves lifetime counters", () => {
    const cache = new CacheService({
      max: 10,
      ttlMs: 1_000,
      sweepIntervalMs: 60_000,
    });
    cache.recordHit();
    cache.recordMiss();
    cache.set("a", { id: "a" });

    cache.clear();

    const stats = cache.stats();
    expect(stats.size).toBe(0);
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.clears).toBe(1);
    cache.stop();
  });
});
