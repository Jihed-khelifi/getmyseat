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
`REPO_READ_DELAY_MS`, `CACHE_TTL_MS`, `CACHE_SWEEP_INTERVAL_MS`, the `RATE_*`
knobs, and the Phase 2 plan-10 settings `ADMIN_EMAIL`, `ADMIN_PASSWORD`,
`ADMIN_TOKEN_TTL_MS`, `METRICS_BUCKET_MS`, `METRICS_RETAIN_BUCKETS`, and
`GETMYSEAT_EVENT_FILE`. Tests shorten timings through these rather than weakening
behavior.

## Endpoints

| Method & path           | Behavior                                                                     |
| ----------------------- | ---------------------------------------------------------------------------- |
| `GET /users/:id`        | Cached read. `X-Cache: HIT\|MISS` header. `404` when the user is unknown.    |
| `POST /users`           | Validated, queued write. `202 Accepted` with `{ id, queuedAt, position }`.   |
| `DELETE /cache`         | Drops cached entries; returns the post-clear status snapshot.                |
| `GET /cache-status`     | Observability snapshot (see below).                                          |
| `GET /venue`            | Server-owned venue contract (geometry + price tiers). _Phase 2, plan 07._    |
| `GET /seats/status`     | Live seat-status snapshot `{ seatId: status }`. _Phase 2, plan 07._          |
| `GET /selections/me`    | This visitor's saved selection (by `X-Visitor-Id`). _Phase 2, plan 08._      |
| `PUT /selections/me`    | Validate + replace this visitor's selection (≤ 8). _Phase 2, plan 08._       |
| `DELETE /selections/me` | Clear this visitor's selection (`204`). _Phase 2, plan 08._                  |
| `GET /event`            | Public event/arena metadata for the banner. _Phase 2, plan 10._              |
| `POST /admin/login`     | Exchange admin credentials for a bearer token (rate-limited). _Plan 10._     |
| `GET /admin/overview`   | Auth-gated operational overview (selections/seats/cache/traffic). _Plan 10._ |
| `GET /admin/metrics`    | Auth-gated time-bucketed performance series. _Plan 10._                      |
| `GET /admin/logs`       | Auth-gated recent requests + errors. _Plan 10._                              |
| `PUT /admin/event`      | Auth-gated event edit; broadcasts `event-updated` over WS. _Plan 10._        |
| `GET /health`           | Liveness check.                                                              |

`GET /cache-status` returns `size`, `hits`, `misses`, `hitRate`,
`averageResponseTimeMs`, `stalePurges`, `clears`, `inFlight`, and `queue`.

### Phase 2 — backend-owned seat status (plan 07, pillar 1)

Phase 2 splits the two concerns that used to ship together in `venue.json`:

- **Geometry + price tiers** stay defined by the venue document (the contract),
  now owned server-side at [`src/data/venue.json`](src/data/venue.json) and served
  by `GET /venue`. It is Zod-validated on boot (`services/venue.service.ts`).
- **Live seat status** (`available` / `reserved` / `sold` / `held`) becomes a
  mutable in-memory map seeded from that document
  (`services/seat-status.service.ts`) and served by `GET /seats/status`.

The store is deliberately broadcast- and TTL-agnostic: the WebSocket channel and
optimistic-hold model (gates G3/G4) plug into `SeatStatusService.setStatus` in
plan 09 without a rewrite. From here on the backend is the source of truth for
status; `venue.json` status is seed-only.

### Phase 3 — persistent selections & visitor sessions (plan 08)

A visitor's seat selection is saved server-side and retrievable later from the
same browser **with no login**:

- **Visitor identity (gate G1).** A `visitor-id` middleware
  (`middleware/visitor-id.ts`, scoped to `/selections`) reads an opaque
  `X-Visitor-Id` header, minting a UUID when absent and echoing it back so a
  first-time client can keep it. The id only addresses a record — no trust is
  derived from it. Trade-off: clearing browser storage loses the handle (the
  documented cost of having no accounts).
- **Durability (gate G2).** Selections live in `SelectionRepository`
  (`repositories/selection.repository.ts`), a mock DB backed by a versioned,
  Zod-validated JSON file (`backend/.data/state.json`, override via
  `GETMYSEAT_STATE_FILE`). Writes are debounced and atomic (temp file → rename);
  a corrupt file falls back to the seed and logs a warning. Persistence stays a
  repository concern via the reusable `JsonFileStore` — services never know
  whether storage is memory- or file-backed.
- **Validation mirrors the client.** `SelectionService` re-checks every seat id
  against the live venue + current status (reject unknown, non-`available`, or
  > 8 seats) so the server-side rules never disagree with the frontend's
  > `toggleSeat` guards. `MAX_SELECTION = 8` is duplicated in both READMEs by
  > design.
- **Rate limiting (decision gate 3).** The selection endpoints stay under the
  existing shared limiter; the frontend debounces `PUT`s so frequent toggles
  coalesce well within the burst window.

### Phase 2 — observability, admin & events (plan 10)

Built additively on the existing logging and cache metrics — not a parallel
system — and mounted so it never alters the user/cache endpoints' behavior.

- **Metrics (gate G6).** `MetricsService` (`services/metrics.service.ts`) keeps a
  time-bucketed ring buffer (one bucket per `METRICS_BUCKET_MS`, retained for
  `METRICS_RETAIN_BUCKETS`) with request count, 4xx/5xx counts, average/max
  response time, and cache hit rate. A `metrics` middleware records each response
  on `finish` using `process.hrtime`, reading the `X-Cache` header for the cache
  outcome. Memory stays bounded by construction.
- **Logs.** `LogBuffer` (`services/log-buffer.ts`) holds bounded recent-request
  and recent-error rings; errors are also captured by
  `createErrorHandler(logBuffer)`.
- **Admin auth (gate G5) — demo-grade, _not_ production.** `AdminAuthService`
  exchanges a single env credential pair (`ADMIN_EMAIL` / `ADMIN_PASSWORD`,
  defaults `admin@getmyseat.local` / `change-me`) for an opaque in-memory bearer
  token using a constant-time compare (`crypto.timingSafeEqual`). Tokens expire
  after `ADMIN_TOKEN_TTL_MS`. Login is rate-limited by a dedicated limiter
  (`middleware/require-admin.ts`). There are no user accounts, password hashing,
  refresh tokens, or persistence — a production version would replace this with a
  real identity provider.
- **Events (gate G2).** `EventRepository` persists the event/arena metadata to a
  versioned JSON file (override `GETMYSEAT_EVENT_FILE`). `PUT /admin/event`
  updates it and broadcasts an `event-updated` message over the existing
  WebSocket, so the public banner updates without a reload.

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

62 tests cover the user/cache core (`cache.service`, `request-deduper`,
`users.api`, `rate-limit.api`) plus the Phase 2 work: `seat-status.service`,
`venue.api`, `selections.api` + `selection.repository` (plan 08), `hold.service`

- `realtime.ws` (plan 09), and `metrics.service`, `admin-auth.service`,
  `admin.api`, `event.repository` (plan 10 — login/overview/metrics/logs, event
  persistence and restart durability, and the `event-updated` WebSocket
  broadcast).
