# Implementation Plans

This folder splits the main delivery plan into ordered execution documents.

## Suggested order

### Phase 1 — original two-app deliverable (implemented)

1. [01-workspace-foundation.md](./01-workspace-foundation.md)
2. [02-frontend-architecture.md](./02-frontend-architecture.md)
3. [03-frontend-delivery.md](./03-frontend-delivery.md)
4. [04-backend-architecture.md](./04-backend-architecture.md)
5. [05-backend-delivery.md](./05-backend-delivery.md)
6. [06-verification-risks-and-decisions.md](./06-verification-risks-and-decisions.md)

### Phase 2 — real backend integration (07–09 implemented; 10–11 planned)

These build **on top of** phase 1 without rewriting it. Read 07 first; it fixes
the cross-cutting decisions the rest depend on.

7. [07-integration-architecture.md](./07-integration-architecture.md) — implemented
8. [08-persistent-selections.md](./08-persistent-selections.md) — implemented
9. [09-live-updates-and-seat-interactions.md](./09-live-updates-and-seat-interactions.md) — implemented
10. [10-observability-admin-and-events.md](./10-observability-admin-and-events.md)
11. [11-e2e-and-verification.md](./11-e2e-and-verification.md)

## Scope

The plan covers a two-app workspace:

- `frontend`: Vite + React + TypeScript interactive seating map.
- `backend`: Express + TypeScript user data API with caching and rate limiting.

**Phase 2** turns the two independent apps into one integrated product: the
backend becomes the source of truth for seat status and saved selections; the
frontend reads/writes live data over HTTP + WebSocket; selections persist in the
mock DB and are viewable later with no login; and a minimal `/admin` plane exposes
observability metrics and edits event/arena info shown in the user-facing app.

## Recommended stack summary

### Frontend

- `vite`
- `react`
- `typescript`
- `shadcn/ui`
- `tailwindcss`
- `react-zoom-pan-pinch`
- `zustand`
- `zod`
- `d3-quadtree` or `rbush`
- `vitest`
- `@testing-library/react`
- `playwright`

### Backend

- `express`
- `typescript`
- `tsx`
- `zod`
- `pino`
- `pino-http`
- `lru-cache`
- `rate-limiter-flexible`
- `p-queue`
- `cors`
- `helmet`
- `vitest`
- `supertest`

### Phase 2 additions (additive, kept minimal)

- `ws` (backend WebSocket broadcast; see gate G3)
- File-backed JSON snapshot for the mock DB — no Redis/SQL engine (gate G2)
- `playwright` (E2E; gate G7) — already listed for the frontend
- Demo-grade admin auth via env credentials + bearer token (gate G5); no new auth
  framework

## Key principles

- Keep both apps intentionally small and explicit.
- Favor correctness, accessibility, and performance over extra features.
- Avoid unnecessary infrastructure such as SSR, Redis, BullMQ, or a real database.
- Keep optional features clearly separated from required deliverables.

## How an AI agent should use these plans

1. Read this file first, then execute the numbered plan files in order.
2. Treat each file as a bounded work package with its own prerequisites, outputs, and exit criteria.
3. Do not start a later file until the earlier file's exit criteria are satisfied or explicitly waived.
4. When a file contains a decision gate, record the chosen option in the relevant README or implementation note before continuing.
5. Prefer the smallest working implementation that satisfies the required deliverables; defer stretch items until the required verification passes.

## Agent operating rules

- Preserve the chosen stack unless a later validation proves the choice is blocking.
- Validate each step as soon as a narrow command exists.
- Do not replace a documented architectural decision without updating the matching plan file and README.
- Keep all generated code TypeScript-strict and consistent with the file targets named in the plans.
- Treat performance, accessibility, and testability as required qualities, not cleanup tasks.

## Cross-cutting deliverables

- Root workspace wiring that supports `pnpm install` and `pnpm dev`
- A complete frontend deliverable matching the seating-map task
- A complete backend deliverable matching the user-data API task
- Focused READMEs for root, frontend, and backend
- Tests that demonstrate the most important required behaviors

## Global decision log to maintain during execution

Agents should keep these choices stable unless evidence forces a change:

- Frontend scaffold: Vite + React + TypeScript
- Frontend rendering: hybrid canvas + overlay
- Frontend state: Zustand
- Frontend validation: Zod for venue and persisted data
- Backend cache: `lru-cache`
- Backend rate limiting: `rate-limiter-flexible` with two coordinated windows
- Backend async processing: in-process `p-queue`

### Phase 2 decisions (see plan 07 gates G1–G7)

- Visitor identity: client UUID + `X-Visitor-Id`, no login (G1)
- Mock-DB durability: file-backed JSON snapshot (G2)
- Real-time channel: `ws`, snapshot-then-deltas with reconnect re-snapshot (G3) — implemented (plan 09)
- Seat-status model: backend-owned status + optimistic hold with TTL (G4) — implemented (plan 09)
- Admin auth: env credentials → in-memory bearer token, demo-grade only (G5) — implemented (plan 10)
- Metrics: in-process time-bucketed ring buffer over existing logs/cache counters (G6) — implemented (plan 10)
- E2E: Playwright (G7)

## Minimum evidence expected before marking the overall plan complete

1. Root workspace installs successfully.
2. Frontend required flows work and have at least targeted automated coverage.
3. Backend required endpoints work and have at least targeted automated coverage.
4. The final READMEs explain trade-offs and any deliberately incomplete stretch work.

### Phase 2 (when those plans are executed)

5. A selection persists in the mock DB and is viewable later with no login.
6. Seat-status changes broadcast live over WebSocket and animate. — implemented (plan 09)
7. `/admin` is protected and exposes metrics/logs; event edits appear in the user app. — implemented (plan 10)
8. An E2E suite (Playwright) covers the integrated cross-app flows.
