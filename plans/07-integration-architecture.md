# 07. Integration Architecture (Phase 2)

## Goal

Define the architecture that turns the two currently independent apps into a
**real, integrated product**: the backend becomes the source of truth for seat
status and saved selections, and the frontend reads/writes live data over HTTP +
WebSocket. This file fixes the cross-cutting decisions for everything in plans
08–11 so later agents do not re-open them.

> This is a planning document only. Nothing here is implemented yet. Plans 01–06
> (the original two-app deliverable) remain done and unchanged; phase 2 builds
> **on top of** them without rewriting the existing canvas/store/cache code.

## Prerequisites

- Plans 01–06 are complete: frontend hybrid-canvas seat map + Zustand store, and
  the Express user-data API with `lru-cache`, deduper, queue, and rate limiting.
- The existing decisions in [plan 06](./06-verification-risks-and-decisions.md)
  ("decisions that must be recorded in docs if changed") still hold unless this
  file explicitly extends them.

## Inputs

- The current frontend data pipeline: static `public/venue.json` → Zod validate →
  normalize → Zustand store, with selection persisted to `localStorage`.
- The current backend: in-memory `MockUserRepository`, `CacheService` metrics,
  `pino` logging, dual-window rate limiting.
- Phase 2 feature list: server-saved selections + view-later, live seat status
  over WebSocket, heat-map, adjacent-seat finder, mobile gestures, dark mode,
  Playwright/Cypress E2E, API performance metrics over time, and an `/admin`
  surface that also feeds event info into the user-facing app.

## Outputs

- A fixed integration architecture: identity model, persistence model, seat-status
  source of truth, API + WebSocket contracts, admin/auth model, and observability
  model — each implementable without re-deciding core patterns.
- A set of decision gates resolved (or explicitly deferred) for plans 08–11.

## What stays the same (non-negotiable invariants)

These existing invariants must survive phase 2; do not regress them:

- **Hybrid canvas render** — one canvas for seats, React/shadcn overlays for UI.
  Never one React node per seat.
- **One coordinate transform** — all world ⇄ screen math stays in
  `frontend/src/features/seating/render/viewport.ts`.
- **One selection mutation path** — all selection changes still flow through
  `state/seating-store.ts#toggleSeat` (8-seat cap + available-only guard). Server
  sync wraps this path; it does not bypass it.
- **Thin backend handlers** — coordination stays in services; controllers stay thin.
- **`venue.json` is the geometry/price contract** — section/row/seat layout and
  price tiers continue to come from the validated venue document.

## New architectural pillars

### 1. Seat status becomes backend-owned

Today seat `status` ships inside `venue.json` and is static. Phase 2 splits the
two concerns:

- **Geometry + price tiers**: still defined by the venue document (the contract).
- **Live seat status** (`available` / `held` / `sold`): owned by the backend as a
  mutable `Map<seatId, SeatStatus>` seeded from the venue document on boot.

The frontend stops trusting `venue.json` for status: on load it fetches the
current status snapshot from the backend and then receives deltas over WebSocket.
The canvas still colours seats; only the **source** of the status changes.

### 2. Visitor identity without login

"View their selection later (no login required)" needs a stable per-visitor key.

- The backend issues an opaque `visitorId` (UUID) and the frontend keeps it so the
  same browser can retrieve its selection later.
- Selections are stored server-side keyed by `visitorId` — not by an authenticated
  user — so there is no account system.

Decision gate **G1 (identity transport)** is resolved below.

### 3. Selections persisted in the mock DB

Saved selections live in the **mock database** (the in-memory repository layer),
alongside users. A selection record is roughly:

```text
SelectionRecord {
  visitorId: string
  venueId: string
  seatIds: string[]      // ≤ 8, validated against the live venue + status
  updatedAt: ISO string
}
```

`localStorage` remains a fast client-side cache and offline fallback, but the
**backend is now authoritative** for "view later", so a visitor can return on the
same browser and re-hydrate from the server.

### 4. Real-time channel

A WebSocket endpoint broadcasts seat-status deltas (and, optionally, an admin
"event updated" signal) to all connected clients so seat changes animate live.

### 5. Admin + observability plane

A minimal `/admin` API (and UI) protected by simple credentials exposes operational
data (selection counts, seat stats, cache performance, logs, error rates,
performance metrics over time) and lets an operator edit event/arena metadata that
the **user-facing** frontend then displays.

## Decision gates

Resolve each before implementing the dependent plan. Record the chosen option in
the relevant README when implemented.

### G1 — Visitor identity transport

Options:

1. **Server-issued `httpOnly` cookie** (`visitorId`) set on first request.
2. **Client-generated UUID** stored in `localStorage`, sent via `X-Visitor-Id`.

Recommendation: **client-generated UUID in `localStorage` + `X-Visitor-Id` header**
for the SPA — it is simplest, needs no cookie/CSRF handling, and matches the
existing localStorage persistence. Document the trade-off (clearing storage loses
the handle; this is acceptable with no login).

### G2 — Mock-DB durability ("view later" across restarts)

Options:

1. **Pure in-memory** — selections vanish on backend restart.
2. **File-backed JSON snapshot** — the mock repository persists to a local JSON
   file (e.g. `backend/.data/state.json`) and reloads on boot.

Recommendation: **file-backed JSON** so "view later" survives a dev restart while
staying a _mock_ store (no Redis, no SQL engine — honors the no-real-DB principle).
Keep it behind the repository interface so it is swappable.

### G3 — WebSocket library

Options: `ws` (minimal) vs `socket.io` (rooms, reconnection, fallbacks).

Recommendation: **`ws`** — smallest dependency that satisfies seat-delta broadcast;
add a thin client reconnect/backoff in the frontend rather than pulling in
`socket.io`. Revisit only if rooms/namespaces become necessary.

### G4 — Seat-status mutation model (hold vs commit)

Decide how a user selection affects shared status:

1. **Optimistic hold** — selecting a seat marks it `held` server-side and
   broadcasts, with a TTL so abandoned holds auto-release.
2. **Local-only until checkout** — selection stays local; only an explicit
   "confirm" flips status.

Recommendation: **optimistic hold with a short TTL** (e.g. 2 minutes) so the
live-update feature is demonstrable and conflicting selections are visible.
Releasing a held seat (deselect or TTL expiry) broadcasts the revert.

### G5 — Admin auth strength

Keep it **simple and demo-grade**: a single operator credential pair from env
(`ADMIN_EMAIL` / `ADMIN_PASSWORD`) exchanged for a signed/opaque **bearer token**
held in memory. Document explicitly that this is not production auth (no user
store, no refresh tokens, no RBAC).

### G6 — Metrics-over-time storage

Options: reuse pino logs only vs a dedicated time-bucketed metrics store.

Recommendation: a small **in-process, time-bucketed ring buffer** (e.g. per-minute
buckets for the last N hours) that records request count, error count, average
response time, and cache hit rate, optionally flushed to the same file-backed JSON
as G2. No external metrics backend (no Prometheus/Grafana) for this scope.

## API surface (additions only)

These extend the existing API; existing endpoints are unchanged.

| Method & path           | Purpose                                                           |
| ----------------------- | ----------------------------------------------------------------- |
| `GET /venue`            | Venue geometry + price tiers (server-owned copy of the contract). |
| `GET /seats/status`     | Current seat-status snapshot `{ seatId: status }`.                |
| `GET /selections/me`    | This visitor's saved selection (by `visitorId`).                  |
| `PUT /selections/me`    | Replace this visitor's selection (validated, ≤ 8).                |
| `DELETE /selections/me` | Clear this visitor's selection.                                   |
| `GET /event`            | Public event/arena metadata for the user-facing header.           |
| `POST /admin/login`     | Exchange credentials for a bearer token.                          |
| `GET /admin/overview`   | Selection counts, seat stats, cache perf, error rates.            |
| `GET /admin/metrics`    | Time-bucketed performance metrics.                                |
| `GET /admin/logs`       | Recent structured logs + error list.                              |
| `PUT /admin/event`      | Update event name/date/description, arena location, updates.      |
| `WS /ws`                | Seat-status deltas + event-updated signals.                       |

WebSocket message shapes (draft, finalize in plan 09):

```text
→ server: { type: "subscribe", venueId }
← server: { type: "seat-delta", seatId, status, at }
← server: { type: "event-updated", event }
```

## Cross-cutting agent rules

- **Additive, not rewrite.** New backend modules (selections, seat-status,
  realtime, metrics, admin, event) are added alongside existing services; do not
  refactor the working user/cache stack to fit them.
- **Reuse the cache + metrics plumbing.** Performance metrics build on the existing
  `CacheService` counters and `pino` logs, not a parallel system.
- **Validate every boundary with Zod.** New request bodies, the seat-status
  snapshot, and persisted mock-DB JSON are all validated on the way in.
- **Frontend keeps one status source.** Once integrated, the canvas reads status
  from the store, which is fed by the server snapshot + WebSocket deltas — not from
  `venue.json`.
- **Security note for admin.** Bearer-token check lives in one middleware; never
  scatter credential checks through controllers.

## Risks introduced by integration

1. Two status sources (venue.json vs server) drifting — mitigated by making the
   server authoritative and treating `venue.json` status as seed-only.
2. WebSocket reconnect storms or stale deltas after reconnect — require a
   re-snapshot on (re)connect, then apply deltas.
3. Hold TTLs leaking or never releasing — centralize TTL handling like the existing
   cache sweeper.
4. File-backed mock DB corruption — validate on load and fall back to seed on parse
   failure.
5. Over-architecture — the assignment is still a take-home; keep `ws`, file JSON,
   and admin auth deliberately minimal (see the gates).
6. Admin auth being mistaken for production-grade — document the limitation loudly.

## Exit criteria

- The identity, persistence, seat-status, realtime, admin, and metrics models are
  fixed and consistent with the existing invariants.
- Every decision gate G1–G6 has a recommended resolution.
- The additive API + WebSocket surface is enumerated.

## Definition of done for an agent

- Plans 08–11 can be implemented without re-deciding identity, durability, the
  WebSocket library, the hold model, admin auth, or the metrics store.
- No existing plan-01–06 invariant is contradicted; where status ownership moves
  to the backend, the change is explicit and documented here.

## Implementation status

The cross-cutting **decisions** (gates G1–G7) are fixed and recorded in
[`plans/README.md`](./README.md) and the backend README. The **foundational code**
this plan introduces — pillar 1, "seat status becomes backend-owned" — is now
implemented; the remaining pillars are delivered by their owning plans (identity +
durability in plan 08, realtime in plan 09, admin + metrics in plan 10, E2E in
plan 11), each plugging into this foundation without a rewrite.

Implemented in this plan (pillar 1):

- **Server-owned venue contract** at `backend/src/data/venue.json` (a copy of the
  frontend contract), Zod-validated on boot in
  `backend/src/services/venue.service.ts` (with referential-integrity checks for
  unique seat ids and known price tiers).
- **Backend-owned live seat status** — a mutable `Map<seatId, SeatStatus>` seeded
  from the venue document in `backend/src/services/seat-status.service.ts`. It is
  deliberately broadcast-/TTL-agnostic so plan 09 (gates G3/G4) wraps
  `setStatus` rather than rewriting it.
- **`GET /venue`** and **`GET /seats/status`** (the two read endpoints from the
  API table not owned by a later phase), wired through thin
  `venue.controller.ts` / `venue.routes.ts` and the existing composition root
  (`container.ts` → `app.ts`).
- Targeted tests: `backend/tests/venue.api.test.ts` and
  `backend/tests/seat-status.service.test.ts` (backend suite now 23 tests, all
  passing; `tsc --noEmit` clean). Live smoke: `GET /venue` returns the contract
  and `GET /seats/status` returns 632 seeded statuses.

Not implemented here (owned by later plans, per the cross-cutting rule "additive,
not rewrite"): file-backed durability + visitor identity + selection endpoints
(plan 08), the `WS /ws` channel + hold TTL + frontend status consumption
(plan 09), admin auth + metrics + event CRUD (plan 10), and Playwright E2E
(plan 11).
