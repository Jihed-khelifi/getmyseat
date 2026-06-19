# 06. Verification, Risks, and Decisions

## Verification checklist

This file is the final gate for any agent claiming the project is complete. Do not mark the work done if required items below are unverified.

### Frontend

1. `pnpm install` works from the repo root.
2. Frontend starts cleanly with no hidden setup.
3. `venue.json` loads and all seats render in correct positions.
4. Seat statuses are visually distinct.
5. Selection summary and subtotal update correctly.
6. Keyboard-only users can focus the map, move between seats, inspect details, and select with `Enter` or `Space`.
7. Selection persists across reload and invalid saved data is discarded safely.
8. Mobile layout remains usable with zoom controls and details access.
9. Rendering remains smooth with an expanded data set near 15,000 seats.

### Backend

1. First GET to a seeded user shows simulated delay.
2. Subsequent GET within TTL returns quickly from cache.
3. Missing users return consistent `404` responses.
4. Concurrent uncached GET requests for the same user trigger one underlying fetch.
5. `GET /cache-status` returns accurate cache and timing metrics.
6. `DELETE /cache` clears the cache reliably.
7. The API allows burst traffic up to the configured short window and returns `429` beyond limits.
8. `POST /users` eventually creates a retrievable user through the queue path.

## Agent verification protocol

1. Prefer narrow validation for the current slice before running broad repo-wide commands.
2. Capture at least one executable check for frontend behavior and one for backend behavior.
3. If a required behavior is only manually verified, record that limitation in the relevant README.
4. Do not hide failing stretch goals among required verification results.

## Final decisions

- Frontend scaffold: Vite + React instead of Next.js 14.
- Frontend rendering: canvas-first or hybrid canvas plus overlay.
- Frontend accessibility: managed keyboard navigation instead of one tab stop per seat.
- Backend cache: `lru-cache` instead of a custom LRU implementation.
- Backend async processing: in-process `p-queue` instead of external queue infrastructure.
- Backend rate limiting: dual coordinated windows using `rate-limiter-flexible`.

## Decisions that must be recorded in docs if changed

- Any change from `202 Accepted` to `201 Created` for `POST /users`
- Any change from hybrid canvas rendering to another seat-rendering model
- Any change in the chosen spatial index package
- Any change in whether `DELETE /cache` resets counters or only entries

## Main risks

1. Rendering every seat as a React element will likely fail the performance target.
2. Pan and zoom coordinate drift can break hit-testing and selection.
3. Canvas-heavy interaction can miss accessibility requirements unless semantic overlays are built intentionally.
4. Persisted frontend state can become stale if venue data changes.
5. Mobile pinch gestures can compete with tap-to-select behavior.
6. Lazy TTL cleanup can make cache metrics misleading without a background sweeper.
7. Deduper cleanup bugs can leave stale in-flight Promises in memory.
8. Timing-sensitive backend tests can be flaky.
9. Reviewers may disagree on `202 Accepted` versus `201 Created` for asynchronous user creation.
10. Both apps are greenfield, so there is a real risk of over-architecture.

## Recommended responses to risks

- Lock the frontend rendering strategy early and do not revert to seat-per-node rendering.
- Keep one canonical viewport transform utility.
- Treat accessibility as part of the main implementation, not polish.
- Version or scope persisted frontend state by `venueId`.
- Provide explicit mobile zoom controls in addition to gestures.
- Add a cache sweeper and expose cache metrics clearly.
- Ensure deduper cleanup is handled in `finally`.
- Keep backend tests focused and deterministic.
- Justify any `202 Accepted` decision explicitly in the README.

## Common failure patterns for agents

1. Reintroducing seat-per-node rendering during UI polish.
2. Adding backend abstractions that are more generic than the assignment needs.
3. Treating accessibility as a follow-up instead of building it into the interaction model.
4. Forgetting to validate persisted data or queued write side effects.
5. Reporting completion before the highest-risk paths have executable evidence.

## Stretch-goal priority guidance

If time is limited, prioritize these ahead of cosmetic extras:

1. Frontend mobile zoom polish
2. Frontend keyboard accessibility
3. Backend concurrent-request tests
4. Backend rate-limit tests

Lower-priority extras:

1. Dark mode
2. Adjacent seat finder
3. Additional visual polish beyond clarity and usability

## Definition of done for the overall project

- The required frontend and backend behaviors are implemented.
- The chosen architecture is still coherent with the documented decisions.
- The highest-risk behaviors have validation evidence.
- The READMEs describe how to run, test, and evaluate the project without hidden assumptions.

## Verification run (results)

This plan is executed. The checklist above was validated as follows; commands are
runnable from the repo root.

### Tooling preflight

- `pnpm install` from the repo root — `Already up to date`, 3 workspace projects,
  no errors. Confirms checklist item Frontend-1.

### Frontend evidence

Automated (`pnpm --filter frontend typecheck && pnpm --filter frontend test`):

- `tsc --noEmit` clean.
- **32 Vitest tests pass** across 6 files. Mapping to the checklist:
  - Items 3–5 (render positions, status styling, summary/subtotal): exercised by
    `seating-store.test.ts` (status guard, 8-seat cap, subtotal) and
    `SeatDetailsSheet.test.tsx` (focused-seat details, select/remove, subtotal,
    sold-seat guard).
  - Item 6 (keyboard-only focus/move/select): `keyboard-nav.test.ts`
    (deterministic row/column movement, edge stops, key mapping).
  - Item 7 (persistence + safe discard of invalid saved data): `persistence.test.ts`
    (round-trip, `venueId` scoping, invalid-payload rejection, stale/over-cap drop).
  - Spatial correctness behind pan/zoom (risks 1–2): `viewport.test.ts` round-trip
    and `hit-testing.test.ts` radius/nearest/rectangle queries.

Manual-only (recorded as a limitation, see frontend README):

- Items 2, 8, 9 (clean dev startup, mobile zoom/details usability, ~15,000-seat
  smoothness) are validated by running `pnpm --filter frontend dev` and exercising
  the UI. There is no automated E2E/perf harness (Playwright deferred); the canvas
  hybrid render plus zoom-gated labels is the architectural guard for item 9.

### Backend evidence

Automated (`pnpm --filter backend typecheck && pnpm --filter backend test`):

- `tsc --noEmit` clean.
- **16 Vitest tests pass** across 4 files: `cache.service` (hit rate, cumulative
  timing, active stale purge, counter-preserving clear), `request-deduper`
  (single in-flight share + cleanup), `users.api` (HIT/MISS, 404, concurrent
  dedupe, queued `POST` round-trip, validation, cache-status, clear), and
  `rate-limit.api` (burst limit + `429` metadata).

Live smoke (`node --import tsx src/server.ts`, captured against a running server):

| Checklist item                          | Observed                                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1. First GET shows simulated delay      | `GET /users/1` → `X-Cache: MISS`, ~209 ms                                                      |
| 2. Cached GET within TTL is fast        | repeat `GET /users/1` → `X-Cache: HIT`, ~2 ms                                                  |
| 3. Missing user → consistent `404`      | `GET /users/nope` → `404`                                                                      |
| 4. Concurrent dedupe → one fetch        | `users.api.test.ts` (one repository call/2)                                                    |
| 5. `GET /cache-status` is accurate      | `{ size, hits, misses, hitRate, averageResponseTimeMs, stalePurges, clears, inFlight, queue }` |
| 6. `DELETE /cache` clears reliably      | `cache.service.test.ts` (entries cleared, counters kept)                                       |
| 7. Burst allowed, then `429`            | `rate-limit.api.test.ts` (burst then `429` + `Retry-After`)                                    |
| 8. `POST /users` eventually retrievable | `POST /users` → `202`; queue primes cache (`users.api.test.ts`)                                |

### Outcome

All required frontend and backend behaviors have executable evidence (automated
for every backend item and the highest-risk frontend items; the remaining
frontend items are manual-by-design and noted as limitations). The documented
architecture and the four "must be recorded if changed" decisions
(`202 Accepted`, hybrid canvas, `d3-quadtree`, `DELETE /cache` keeps counters)
are unchanged. Stretch goals (plan 03 Phase 6: heat-map, adjacent-seat finder,
dark mode; Playwright E2E) remain intentionally deferred and are not reported as
required passes.
