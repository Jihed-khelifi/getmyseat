# 10. Observability, Admin & Event Management (Phase 2)

## Goal

Add a lightweight **API performance observability layer** (response times, error
rates, cache performance over time) and a minimal **`/admin`** surface — protected
by simple credentials — that lets an operator inspect operational data and edit
**event/arena metadata** that the user-facing frontend then displays (event name,
date, description, arena location, and updates).

> Planning document only — do not implement here. Build additively on plans
> 04/05 (logging, `CacheService` metrics) and plan 07 (admin/metrics models).
> Resolve gates **G5 (admin auth)** and **G6 (metrics store)** first.

## Prerequisites

- [Plan 07](./07-integration-architecture.md) admin + observability pillars
  accepted; gates **G5** and **G6** resolved.
- Existing `pino`/`pino-http` logging and `CacheService` counters are in place.
- [Plan 08](./08-persistent-selections.md) selection store exists (admin reads
  selection counts from it).

## Inputs

- Existing structured logs and cache metrics.
- Admin credential pair from env (`ADMIN_EMAIL`, `ADMIN_PASSWORD`).
- Event/arena domain (new): name, date, description, arena location, updates list.

## Outputs

- A time-bucketed metrics recorder for request count, error count, average
  response time, and cache hit rate.
- Admin auth (login → bearer token) and protected admin endpoints.
- An admin UI page in the frontend to view stats/logs/metrics and edit event info.
- A public `GET /event` consumed by the user-facing header/banner.
- Targeted tests for metrics aggregation, auth, and event propagation.

## Backend work

### Phase 1: Performance metrics recorder (logging mechanism)

1. Add a metrics middleware/hook that records, per request: duration, status class
   (2xx/4xx/5xx), route, and cache outcome (HIT/MISS) where applicable.
2. Aggregate into time buckets per gate **G6** (recommended in-process per-minute
   ring buffer over the last N hours), exposing rollups: requests, error rate,
   average/percentile response time, cache hit rate.
3. Optionally flush buckets to the file-backed store (gate G2) so history survives
   a restart.

#### Agent notes

- Build on the existing `pino-http` request lifecycle and `CacheService`
  counters; do not create a parallel timing system.
- Keep the recorder O(1) per request and bounded in memory (ring buffer).
- Track errors from the central error handler so error rate is accurate.

### Phase 2: Admin auth

1. `POST /admin/login` validates the env credential pair and returns a bearer
   token (signed or opaque, held in memory) per gate **G5**.
2. Add one `requireAdmin` middleware that checks `Authorization: Bearer <token>`;
   apply it to all `/admin/*` routes.

#### Agent notes

- Keep the credential check in exactly one middleware; never in controllers.
- Document loudly that this is **demo-grade** auth (single operator, no user store,
  no refresh/RBAC). Do not log credentials or tokens.
- Constant-time compare the credentials; rate-limit the login route.

### Phase 3: Admin read endpoints

1. `GET /admin/overview` — selected-seat count, seats by status, cache performance
   (hits/misses/hitRate/avg time/stale purges/clears), and current error rate.
2. `GET /admin/metrics` — the time-bucketed series from Phase 1.
3. `GET /admin/logs` — recent structured logs and a recent-errors list (bounded).

#### Agent notes

- Reuse existing `GET /cache-status` data rather than recomputing it.
- Bound log/error history (ring buffer) so memory stays flat.

### Phase 4: Event/arena management

1. Add an `EventRepository` (mock DB, file-backed via gate G2) holding event name,
   date, description, arena location, and an `updates[]` list.
2. `PUT /admin/event` (admin-only) updates it and broadcasts an `event-updated`
   WebSocket message (plan 09 channel).
3. `GET /event` (public) returns the current event metadata for the user-facing UI.

#### Agent notes

- Validate the event payload with Zod; persist through the repository layer.
- The public endpoint exposes only display fields — no operational data.

## Frontend work

### Phase 5: Admin UI

1. Add an `/admin` route (gated by a token kept in memory/session) with a login
   form, then a dashboard showing overview stats, the metrics series (simple
   charts or tables), and recent logs/errors.
2. Add an event editor form (name, date, description, arena location, updates).

#### Agent notes

- Keep admin views isolated from the seat-map bundle where practical (lazy route).
- Reuse the plan-08 API client; attach the admin bearer token for `/admin/*`.
- Admin is operator-facing; it does not need the canvas performance budget but must
  still meet AA contrast (plan 09 dark mode applies).

### Phase 6: User-facing event surface

1. Consume `GET /event` to render the event name, date, description, arena
   location, and updates in the user-facing header/banner.
2. Update live when an `event-updated` WebSocket message arrives.

#### Agent notes

- This is the visible payoff of admin edits — verify an admin change appears in the
  user app without a manual reload (via the WebSocket signal or a refetch).

## Testing plan

### Backend

- Metrics recorder buckets requests and computes error rate + cache hit rate.
- `POST /admin/login` succeeds with correct creds, `401` otherwise; login route is
  rate-limited.
- `requireAdmin` blocks missing/invalid tokens on every `/admin/*` route.
- `PUT /admin/event` persists and `GET /event` reflects the change; an
  `event-updated` message is broadcast.

### Frontend

- Admin login flow stores the token and unlocks the dashboard.
- Event editor submits and the user-facing banner reflects the new data.
- Metrics/overview render from mocked admin responses.

## Decision gates

1. **Token format** — opaque random vs signed (HMAC) — recommend opaque in-memory
   for simplicity; document expiry behavior.
2. **Metrics granularity/retention** — bucket size and window (recommend 1-minute
   buckets, a few hours retained). Document.
3. **Charts vs tables** — recommend simple tables/sparklines to avoid a heavy chart
   dependency unless one is already justified.

## Hurdles

- Metrics must stay bounded in memory; an unbounded log/series list will leak.
- Demo-grade auth can be mistaken for production — document the limitation.
- Event updates must reach the user app to be meaningful (WebSocket or refetch).
- Admin bundle weight should not regress the seat-map performance budget.

## Exit criteria

- Performance metrics (response times, error rates, cache performance) are recorded
  over time and visible in `/admin`.
- `/admin` is protected by email-password → bearer token and exposes selection
  counts, seat stats, cache performance, logs, and error rates.
- An operator can edit event name/date/description, arena location, and updates,
  and the changes appear in the user-facing frontend.

## Definition of done for an agent

- A reviewer can log into `/admin`, see live operational metrics and logs, edit the
  event, and watch the user-facing app reflect that edit — all without touching the
  existing user/cache endpoints' behavior.
- Observability is built on the existing logging + cache metrics, not a parallel
  system, and the auth limitation is documented.

## Implementation status — DONE

Implemented additively on plans 07–09; all existing endpoints unchanged.

Backend (62 tests pass, `tsc` clean):

- Observability: `services/metrics.service.ts` (time-bucketed ring buffer, per-minute
  request/error/response-time/cache-hit series, bounded memory) + `services/log-buffer.ts`
  (bounded recent-requests/recent-errors buffers) + `middleware/metrics.ts` (records on
  response `finish`, reads `X-Cache` for cache outcome). Errors are also captured via
  `createErrorHandler(logBuffer)`.
- Admin auth (demo-grade, **gate G5**): `services/admin-auth.service.ts` exchanges a single
  env credential pair (`ADMIN_EMAIL`/`ADMIN_PASSWORD`) for an opaque in-memory bearer token
  (constant-time compare via `crypto.timingSafeEqual`, TTL `ADMIN_TOKEN_TTL_MS`). Login is
  rate-limited (`middleware/require-admin.ts` → `adminLoginRateLimit`). **Not production auth.**
- Events (**gate G2**): file-backed `repositories/event.repository.ts` (override `GETMYSEAT_EVENT_FILE`)
  - `services/event.service.ts`. `PUT /admin/event` persists and broadcasts `event-updated`
    over the existing WebSocket (`realtime.service.ts#broadcastEvent`).
- Routes: `POST /admin/login`, then auth-gated `GET /admin/overview|/metrics|/logs`,
  `PUT /admin/event`, plus public `GET /event`.
- **Breaking refactor:** `createApp` now takes a single `AppDeps` object instead of
  positional args; `server.ts` and all API/WS tests updated.

Frontend (63 tests pass, `tsc` clean):

- `lib/api.ts` admin/event client functions. `/admin` route via lazy path-based router in
  `main.tsx`; `features/admin/` (login, dashboard, event editor) with tab-scoped session token.
- `components/seat-map/EventBanner.tsx` shows the event and updates live via the WS
  `event-updated` message (`state/seat-status-sync.ts` `onEvent` hook).
- Admin UI uses real **shadcn/ui** primitives (`src/components/ui/{button,input,label,card,textarea,table}.tsx`,
  new-york style) backed by `radix-ui` + `class-variance-authority`.
