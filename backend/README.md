# Backend — User-data API

Single-process, in-memory Express + TypeScript API that demonstrates advanced
caching, concurrent-request handling, dual-window rate limiting, and in-process
asynchronous write processing. No external infrastructure (Redis, a database, or
a job runner) is required.

## Run

```bash
pnpm install                 # from the repo root
pnpm --filter backend dev    # tsx watch on http://localhost:3001
pnpm --filter backend test   # vitest
pnpm --filter backend typecheck
pnpm --filter backend build  # tsc -> dist/, then `pnpm --filter backend start`
```

Configuration is environment-driven (see `src/config.ts`): `PORT`, `LOG_LEVEL`,
`REPO_READ_DELAY_MS`, `CACHE_TTL_MS`, `CACHE_SWEEP_INTERVAL_MS`, and the
`RATE_*` knobs. Tests shorten timings through these rather than weakening
behavior.

## Endpoints

| Method & path       | Behavior                                                                   |
| ------------------- | -------------------------------------------------------------------------- |
| `GET /users/:id`    | Cached read. `X-Cache: HIT\|MISS` header. `404` when the user is unknown.  |
| `POST /users`       | Validated, queued write. `202 Accepted` with `{ id, queuedAt, position }`. |
| `DELETE /cache`     | Drops cached entries; returns the post-clear status snapshot.              |
| `GET /cache-status` | Observability snapshot (see below).                                        |
| `GET /health`       | Liveness check.                                                            |

`GET /cache-status` returns `size`, `hits`, `misses`, `hitRate`,
`averageResponseTimeMs`, `stalePurges`, `clears`, `inFlight`, and `queue`.

## Architecture

Request handlers stay thin; all coordination lives in services.

```
routes → controllers → UserService ─┬─ CacheService      (LRU + TTL + metrics)
                                     ├─ RequestDeduper    (concurrent GET sharing)
                                     ├─ UserWriteQueue    (p-queue, async writes)
                                     └─ MockUserRepository (seeded Map, 200ms reads)
```

Middleware order (`src/app.ts`): `helmet` → `cors` → `json` → `pino-http` →
rate limit → routes → 404 → error handler.

### Cache strategy

- `lru-cache` with a 60s TTL. Only successful lookups are cached; missing users
  are **not** cached, so a later `POST` becomes visible without waiting for a TTL.
- All counters (hits, misses, timings, purges, clears) live in `CacheService` —
  controllers never compute metrics.
- **TTL / stale eviction:** `lru-cache` evicts expired entries lazily on access,
  so a background sweeper actively calls `purgeStale()` every ~7s and records the
  number of entries removed in `stalePurges`.

### Concurrent request deduplication

`RequestDeduper` keys in-flight repository fetches by user id via
`Map<string, Promise<User | null>>`. Concurrent cache-miss reads for the same id
share a single underlying 200ms fetch; the entry is always removed in `finally`
so the map never leaks promises. Proven by
[`tests/users.api.test.ts`](tests/users.api.test.ts) (one repository call for two
concurrent requests).

### Rate limiting

Two coordinated `rate-limiter-flexible` windows, both keyed by client IP; a
request must satisfy both:

- **burst:** 5 requests / 10s
- **sustained:** 10 requests / 60s

A rejected request gets a `429` with `{ error, retryAfterMs }` and a `Retry-After`
header.

### Async write queue

`POST /users` validates the body, synchronously assigns an id, and enqueues the
create on a `p-queue` (concurrency 1). It returns **`202 Accepted`** immediately
with queue metadata so the asynchronous contract is observable; the queue only
controls _when_ the write runs, while the repository owns _how_ it is stored.

## Resolved decision gates

- **POST semantics → `202 Accepted`** with `{ id, queuedAt, position }`, so a
  reviewer can poll `GET /users/:id`.
- **Cache-write after POST → priming.** When the queued task runs it primes the
  cache with the new user, so the first subsequent read is a `HIT` (visible
  evidence that the queue completed). Misses are not cached, so no stale
  "not found" state can shadow a freshly created user.
- **Average response time → cumulative average** over every read served by
  `UserService` (hits and misses). As the hit rate climbs the average falls,
  which is exactly the metric's purpose.
- **`DELETE /cache` → clears entries only, preserves counters.** The lifetime
  hit-rate history survives a manual flush; only `clears` is incremented.

## Single-process limitations

State (cache, queue, rate-limit counters, mock users) lives in process memory.
Restarting loses it, and the design does not scale horizontally — multiple
instances would each keep independent caches, queues, and limiter state. This is
intentional for the assignment; a production version would move the cache and
rate limiter to a shared store (e.g. Redis) and the queue to a durable broker.

## Tests

16 tests across 4 files: `cache.service` (hit rate, cumulative timing, active
stale purge, counter-preserving clear), `request-deduper` (single in-flight
share, cleanup on rejection), `users.api` (cache HIT/MISS, 404, concurrent
dedupe, queued POST round-trip, validation, cache-status, clear), and
`rate-limit.api` (burst limit + `429` metadata).
