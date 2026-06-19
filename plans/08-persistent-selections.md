# 08. Persistent Selections & Visitor Sessions (Phase 2)

## Goal

Make a user's seat selection **persist server-side in the mock DB** and be
retrievable later from the same browser **without any login**. This delivers the
core integration: the frontend stops being a static-data app and starts reading
and writing real selection state through the backend.

> Planning document only — do not implement here. Build additively on plans
> 01–06. Resolve the decision gates from
> [plan 07](./07-integration-architecture.md) before coding.

## Prerequisites

- [Plan 07](./07-integration-architecture.md) integration architecture accepted,
  specifically gates **G1 (identity)** and **G2 (mock-DB durability)**.
- Existing backend repository/cache/service layers and frontend Zustand store are
  in place and untouched in their current responsibilities.

## Inputs

- Visitor identity model (recommended: client UUID + `X-Visitor-Id`).
- Mock-DB durability decision (recommended: file-backed JSON).
- Existing `state/seating-store.ts#toggleSeat` single selection path.
- Existing `state/persistence.ts` (localStorage, venueId-scoped, Zod-validated).

## Outputs

- Backend selection store + endpoints persisting `{ visitorId, venueId, seatIds }`.
- Frontend API client that saves on selection change and restores on load.
- A "view my selection later" experience that survives reload and (with G2 =
  file-backed) a backend restart.
- Targeted tests for save/restore, validation, and visitor scoping.

## Backend work

### Phase 1: Persistence substrate (mock DB durability)

1. Introduce a durable backing for the mock repository per gate **G2**
   (recommended: file-backed JSON at `backend/.data/state.json`), kept behind the
   existing repository interface.
2. Validate the persisted file with Zod on load; on parse failure, fall back to
   the seed data and log a warning.
3. Keep writes debounced/atomic (write-to-temp then rename) so concurrent updates
   do not corrupt the file.

#### Agent notes

- Do not change the user-read path semantics (200 ms simulated delay, cache
  behavior) — only add durability underneath.
- Persisting is a repository concern; services should not know whether storage is
  memory or file-backed.

### Phase 2: Selection repository + service

1. Add a `SelectionRepository` (mock DB) keyed by `visitorId` → `SelectionRecord`.
2. Add a `SelectionService` that validates incoming seat ids against the **live
   venue + current seat status** (reject unknown, non-`available`, or > 8 seats).
3. Reuse the existing 8-seat cap rule — define it once and share it with the
   frontend contract conceptually (same number, documented in both READMEs).

#### Agent notes

- The selection service is the server-side mirror of `toggleSeat`'s guards; keep
  the rules identical so client and server never disagree.
- Treat the `visitorId` as opaque; never derive trust from it beyond addressing a
  record.

### Phase 3: Visitor identity middleware

1. Add middleware that reads the visitor handle per gate **G1** (recommended:
   `X-Visitor-Id` header; mint one server-side if absent and return it).
2. Attach `req.visitorId` for downstream handlers.

#### Agent notes

- Keep identity resolution in one middleware; controllers just read `req.visitorId`.
- No session table beyond the selection record itself is required.

### Phase 4: Selection endpoints

1. `GET /selections/me` → this visitor's saved selection (or empty).
2. `PUT /selections/me` → validate body (`{ venueId, seatIds }`), persist, return
   the stored record.
3. `DELETE /selections/me` → clear the visitor's selection.

#### Agent notes

- Validate bodies with Zod; return stable JSON error shapes consistent with the
  existing error handler.
- These endpoints are subject to the existing rate limiter; confirm limits are
  sane for frequent selection updates (consider a separate, looser limiter key if
  needed and document it).

## Frontend work

### Phase 5: API client + visitor handle

1. Add a small typed API client (`frontend/src/lib/api.ts`) with base URL from
   `import.meta.env.VITE_API_URL` and a Vite dev proxy fallback.
2. Generate/persist a `visitorId` (per gate G1) and attach it to every request.

#### Agent notes

- Centralize fetch + error handling; do not scatter `fetch` calls across
  components.
- Keep the client framework-agnostic so it is unit-testable without React.

### Phase 6: Server-backed selection sync

1. On venue load, fetch `GET /selections/me` and rehydrate through the existing
   store path (still reconciled against the live venue + status).
2. On selection change, debounce a `PUT /selections/me`. Keep `localStorage` as an
   instant optimistic cache and offline fallback.
3. Add a "view my selection later" affordance (e.g. a shareable note that the same
   browser restores automatically, or a copyable visitor handle) — no login.

#### Agent notes

- Reuse `toggleSeat`; the sync layer **subscribes** to store changes, it does not
  add a second mutation path.
- Resolve server vs local conflicts deterministically (server wins on load; local
  optimistic update reconciled on the next successful `PUT`).
- Never let a failed network call corrupt local selection state — degrade to the
  existing localStorage behavior and surface a non-blocking notice.

## Testing plan

### Backend

- `PUT` then `GET /selections/me` round-trips for the same `visitorId`.
- Selections are isolated per `visitorId` (no cross-visitor leakage).
- Validation rejects unknown seat ids, non-available seats, and > 8 seats.
- With G2 file-backed: a record survives a simulated reload (re-read of the store).
- Corrupt persisted file falls back to seed without crashing.

### Frontend

- API client attaches the visitor handle and parses success/error shapes.
- Store rehydrates from a mocked `GET /selections/me` and still drops stale /
  non-selectable ids.
- A selection change triggers a debounced `PUT` (mocked) without bypassing
  `toggleSeat`.

## Decision gates

1. **Conflict resolution** — server-authoritative on load; document the rule.
2. **Sync trigger** — debounced PUT on change vs explicit "save" button. Recommend
   debounced auto-save for a seamless UX; expose a manual save only if needed.
3. **Rate-limit interaction** — keep the shared limiter or add a looser selection
   key; decide and document.

## Hurdles

- Double source of truth (local vs server) can drift; the load-time reconcile and
  single mutation path are the guard.
- Frequent PUTs can hit the rate limiter; debounce and consider the limiter key.
- File-backed persistence needs atomic writes to avoid corruption.

## Exit criteria

- A selection made in the browser is stored in the mock DB and retrievable later
  from the same browser with no login.
- Server-side validation mirrors the 8-seat / available-only rules.
- Targeted backend and frontend tests cover save/restore, scoping, and validation.

## Definition of done for an agent

- A reviewer can select seats, reload (and, with G2, restart the backend), and see
  the same selection restored — driven by the backend, not just localStorage.
- The existing selection mutation path and cache/read semantics are unchanged.
- READMEs document the identity model, durability choice, and the no-login
  trade-offs.

## Implementation status

**Implemented.** Both decision gates from plan 07 (G1 identity, G2 durability) and
the three local gates (conflict resolution, sync trigger, rate-limit interaction)
are resolved as recommended.

### Backend (Phases 1–4)

- **Phase 1 — durability substrate.** `repositories/json-file-store.ts` is a
  reusable, validated, atomic (temp → rename), debounced JSON store. Corrupt files
  fall back to seed and log a warning. The user read path is untouched.
- **Phase 2 — selection repository + service.**
  `repositories/selection.repository.ts` (file-backed mock DB, override path via
  `GETMYSEAT_STATE_FILE`) + `services/selection.service.ts`, whose validation
  mirrors `toggleSeat` exactly (unknown / non-`available` / > 8 rejected against
  the live venue + status). `MAX_SELECTION = 8` is duplicated in both READMEs by
  design.
- **Phase 3 — visitor identity.** `middleware/visitor-id.ts` (gate G1) reads
  `X-Visitor-Id`, mints a UUID when absent, echoes it back, and attaches
  `req.visitorId`. Scoped to `/selections`; controllers stay thin.
- **Phase 4 — endpoints.** `GET/PUT/DELETE /selections/me` via thin
  `controllers/selections.controller.ts` + `routes/selections.routes.ts`, wired
  through `container.ts` → `app.ts` (and `server.ts`). Bodies validated with Zod;
  error shapes match the existing handler.

### Frontend (Phases 5–6)

- **Phase 5 — API client + handle.** `lib/api.ts` centralizes fetch + error
  normalization (`ApiError`), owns the localStorage visitor UUID, and reads the
  base URL from `VITE_API_URL` (defaults to `/api`, proxied in `vite.config.ts`).
- **Phase 6 — server-backed sync.** `state/selection-sync.ts` hydrates from the
  server (server wins on load; local pushed up when no record) and debounces a
  `PUT` on change by **subscribing** to the store — never bypassing `toggleSeat`.
  A new `rehydrateSelection` bulk action reconciles a server set against the live
  venue (same reconcile as localStorage restore). `ViewLaterNote` surfaces the
  copyable handle. Failed calls degrade to the existing localStorage behavior.

### Resolved local decision gates

1. **Conflict resolution — server-authoritative on load**, local optimistic
   afterward, reconciled on the next successful `PUT`.
2. **Sync trigger — debounced auto-save** (no manual save button).
3. **Rate-limit interaction — shared limiter kept**; the client debounces so
   toggles coalesce within the burst window.

### Verification

- Backend: `tsc --noEmit` clean; **34 tests pass** (was 23) including
  `tests/selections.api.test.ts` (round-trip, per-visitor isolation, validation
  rejections, mint-on-missing) and `tests/selection.repository.test.ts`
  (restart durability, corrupt-file fallback).
- Frontend: `tsc --noEmit` clean; **42 tests pass** (was 32) including
  `lib/api.test.ts` and `state/selection-sync.test.ts`.
- Live smoke: `PUT` then `GET /selections/me` round-trips for a visitor; an unknown
  seat is rejected `400`; `DELETE` returns `204`; a missing `X-Visitor-Id` mints
  and echoes one. The file-backed store survives a process restart.

Not implemented here (owned by later plans): the `WS /ws` channel + hold TTL +
frontend live-status consumption (plan 09), admin + metrics + event CRUD
(plan 10), and Playwright E2E (plan 11).
