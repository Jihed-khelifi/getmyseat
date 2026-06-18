import { LRUCache } from "lru-cache";

/** Snapshot of cache behavior exposed by `GET /cache-status`. */
export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  /** hits / (hits + misses), 0 when there has been no traffic. */
  hitRate: number;
  /**
   * Cumulative average wall-clock time (ms) to serve a read through the user
   * service, across both cache hits and misses. As the hit rate climbs this
   * value falls, which is the metric's purpose: demonstrating cache value.
   */
  averageResponseTimeMs: number;
  /** Entries removed by the background stale sweeper over the process lifetime. */
  stalePurges: number;
  /** Number of times `DELETE /cache` has been invoked. */
  clears: number;
}

export interface CacheServiceOptions {
  max: number;
  ttlMs: number;
  sweepIntervalMs: number;
}

/**
 * LRU + TTL cache wrapper that owns all cache metrics.
 *
 * Counters live here (not in controllers) so the metric definitions stay in a
 * single place. A background sweeper actively purges stale entries, because
 * `lru-cache` otherwise evicts expired entries lazily on access.
 */
export class CacheService {
  private readonly cache: LRUCache<string, object>;
  private hits = 0;
  private misses = 0;
  private stalePurges = 0;
  private clears = 0;
  private totalResponseTimeMs = 0;
  private responseCount = 0;
  private sweeper: ReturnType<typeof setInterval> | undefined;

  constructor(options: CacheServiceOptions) {
    this.cache = new LRUCache<string, object>({
      max: options.max,
      ttl: options.ttlMs,
    });
    this.startSweeper(options.sweepIntervalMs);
  }

  get<T extends object>(key: string): T | undefined {
    return this.cache.get(key) as T | undefined;
  }

  set<T extends object>(key: string, value: T): void {
    this.cache.set(key, value);
  }

  recordHit(): void {
    this.hits += 1;
  }

  recordMiss(): void {
    this.misses += 1;
  }

  recordResponseTime(ms: number): void {
    this.totalResponseTimeMs += ms;
    this.responseCount += 1;
  }

  /**
   * Clear cached entries. Counters are intentionally preserved so the
   * lifetime hit-rate history survives a manual flush; only `clears` is bumped.
   */
  clear(): void {
    this.cache.clear();
    this.clears += 1;
  }

  stats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total === 0 ? 0 : this.hits / total,
      averageResponseTimeMs:
        this.responseCount === 0
          ? 0
          : this.totalResponseTimeMs / this.responseCount,
      stalePurges: this.stalePurges,
      clears: this.clears,
    };
  }

  /** Purge stale entries now and return how many were removed. */
  purgeStale(): number {
    const before = this.cache.size;
    this.cache.purgeStale();
    const purged = before - this.cache.size;
    if (purged > 0) this.stalePurges += purged;
    return purged;
  }

  /** Stop the background sweeper (used by tests and graceful shutdown). */
  stop(): void {
    if (this.sweeper) {
      clearInterval(this.sweeper);
      this.sweeper = undefined;
    }
  }

  private startSweeper(intervalMs: number): void {
    this.sweeper = setInterval(() => this.purgeStale(), intervalMs);
    // Do not keep the process alive solely for the sweeper.
    this.sweeper.unref?.();
  }
}
