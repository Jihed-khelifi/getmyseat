# Frontend — Interactive Seating Map

Vite + React + TypeScript app that renders an interactive, high-performance
seating map. This package implements the architecture fixed in
[plan 02](../plans/02-frontend-architecture.md); feature delivery continues in
[plan 03](../plans/03-frontend-delivery.md).

## Commands

Run from the repo root (`pnpm --filter frontend run <script>`) or from this folder:

| Command           | Description                           |
| ----------------- | ------------------------------------- |
| `pnpm dev`        | Start the Vite dev server.            |
| `pnpm build`      | Type-check then build for production. |
| `pnpm preview`    | Preview the production build.         |
| `pnpm typecheck`  | Strict `tsc --noEmit`.                |
| `pnpm test`       | Run Vitest once.                      |
| `pnpm test:watch` | Run Vitest in watch mode.             |

Regenerate the sample dataset with `node scripts/generate-sample-venue.mjs`
(writes `public/venue.json`).

## Architecture

Rendering is **hybrid**: a single `<canvas>` draws the seat population outside
React reconciliation, while React/shadcn overlays own controls, details, the
legend, and accessibility surfaces. There is never one React node per seat.

```text
src/
  App.tsx                     # venue load → validate → normalize; layout composition
  main.tsx                    # React entry
  components/seat-map/
    SeatMap.tsx               # canvas + overlay composition, pointer/keyboard/wheel wiring
    SeatToolbar.tsx           # zoom in/out + reset view
    SeatLegend.tsx            # semantic status legend (colors shared with canvas)
    SeatDetailsSheet.tsx      # focused-seat details + live selection summary
    AnnouncementRegion.tsx    # visually-hidden aria-live announcements
  features/seating/
    model/
      seat-types.ts           # domain types only
      seat-validation.ts      # Zod schemas + normalizeVenue()
    state/
      seating-store.ts        # Zustand store; single toggleSeat() mutation path
      persistence.ts          # venueId-scoped, validated localStorage selection
      selection-sync.ts       # server-backed sync: hydrate + debounced PUT (plan 08)
    render/
      viewport.ts             # the ONLY world ⇄ screen transform math
      hit-testing.ts          # d3-quadtree spatial index (pointer → seat)
      draw-seats.ts           # canvas drawing + batching primitives
    a11y/
      keyboard-nav.ts         # deterministic row-based directional navigation
      announcements.ts        # pure aria-live message builders
  lib/
    storage.ts                # safe localStorage wrapper
    api.ts                    # typed backend client + visitor handle (plan 08)
    utils.ts                  # cn() class merge helper
```

## Resolved decision gates (plan 02)

- **Spatial index — `d3-quadtree`.** Seats are points; `quadtree.find(x, y, r)`
  gives exact radius-bounded nearest lookups for hit-testing and is a foundation
  for the optional adjacent-seat finder. Used consistently in `hit-testing.ts`.
- **Overlay strategy — React/shadcn overlays.** A desktop side panel and (on
  small screens) a stacked details surface; no competing overlay patterns.
- **Label rendering — zoom-gated.** Seat labels are not drawn below
  `LABEL_ZOOM_THRESHOLD` (`draw-seats.ts`) so large maps stay fast and legible.

## Key invariants

- **One selection path.** Mouse, touch, keyboard, and persistence rehydration all
  go through `seating-store.ts#toggleSeat`, so the 8-seat cap and "available-only"
  guard live in exactly one place (`canSelectSeat`).
- **One coordinate transform.** All world ⇄ screen math is in `viewport.ts`;
  duplicating it elsewhere is the documented cause of pan/zoom drift.
- **Untrusted persisted state.** Restored selections are validated with Zod and
  reconciled against the freshly loaded venue (existence + status) before use, and
  are scoped by `venueId`.

## Server-backed selections (plan 08)

Selections persist server-side so a visitor can return on the **same browser**
and pick up where they left off — **no login**:

- **Visitor handle (gate G1).** `lib/api.ts` generates an opaque UUID, keeps it in
  `localStorage`, and sends it as `X-Visitor-Id` on every request. The API client
  is the single place the frontend talks to the backend (centralized fetch + error
  normalization), framework-agnostic so it unit-tests without React.
- **Sync without a second mutation path.** `state/selection-sync.ts` only
  _observes_ the store: on load it hydrates from `GET /selections/me` (server wins
  when a record exists; otherwise a local selection is pushed up), then a
  subscription debounces a `PUT` on every change. `toggleSeat` stays the one
  mutation path; `localStorage` remains an instant optimistic cache + offline
  fallback, and a failed network call never corrupts local state.
- **"View later" affordance.** `ViewLaterNote` shows the copyable visitor handle
  and explains that selections persist on this browser. Trade-off: clearing
  storage loses the handle (the cost of no accounts).
- **Base URL.** `VITE_API_URL` (defaults to `/api`, proxied to the backend by the
  Vite dev server — see `vite.config.ts`). The 8-seat cap (`MAX_SELECTION`) is
  mirrored server-side so the two never disagree.

## Admin, events & observability (plan 10)

- **Routing.** A minimal path-based router in `main.tsx` lazy-loads the `/admin`
  page so the operator UI never weighs down the seat-map bundle; every other path
  renders the seat map.
- **Admin console (`features/admin/`).** `AdminLogin` exchanges the operator
  credentials for a bearer token (kept in tab-scoped `sessionStorage`), and
  `AdminDashboard` polls `GET /admin/overview|/metrics|/logs` to show live
  selection/seat/cache/traffic stats, a per-bucket performance table, and recent
  request/error logs. `EventEditor` saves the event via `PUT /admin/event`. A
  `401` from any call returns the operator to the login form. The auth is
  **demo-grade** (single shared credential) — see the backend README.
- **Live event banner.** `EventBanner` fetches `GET /event` on mount and also
  accepts a `live` prop; `App` feeds it `event-updated` messages from the existing
  WebSocket (`state/seat-status-sync.ts` `onEvent` hook), so an admin edit appears
  for users without a reload.
- **shadcn/ui.** The admin UI is built from real shadcn primitives in
  `src/components/ui/` (`button`, `input`, `label`, `card`, `textarea`, `table`),
  backed by `radix-ui` and `class-variance-authority`.

## Interaction & gestures

All viewport changes flow through the single transform math in `viewport.ts`:

- **Drag to pan** (mouse or one finger). A small movement threshold separates a
  pan from a tap, so dragging never accidentally selects a seat.
- **Pinch to zoom** (two fingers) zooms around the finger midpoint and pans with
  it; **wheel/trackpad** zooms toward the cursor; **toolbar buttons** zoom around
  the viewport center and reset-to-fit.
- **Tap/click** selects or deselects the seat under the pointer.
- **Keyboard** moves focus deterministically by row/column; `Enter`/`Space` select.

Gestures use native Pointer Events rather than `react-zoom-pan-pinch`: the canvas
needs world-space coordinates for hit-testing, so feeding one transform source
(`viewport.ts`) avoids a competing DOM-transform layer and the pan/zoom drift that
duplication causes.

## Accessibility

- The canvas is a single focusable tab stop (`role="application"`, `tabIndex=0`)
  with a visible focus ring.
- Arrow keys move focus deterministically by row/column; `Enter`/`Space` select.
- Focus, selection changes, and rejected actions are announced via an
  `aria-live` region (`AnnouncementRegion`).
- Every detail available on hover is also available on focus/selection in the
  details panel.
- On small screens the details panel becomes a bottom sheet so the selection
  summary stays reachable without depending on hover.

## Data contract

`public/venue.json` is validated by `rawVenueSchema` in `seat-validation.ts`
(nested sections → rows → seats; price tiers referenced by id) and normalized
once into lookup maps and ordered collections.

## Tested behaviors

Run with `pnpm --filter frontend test` (Vitest + Testing Library, 63 tests).

- `viewport.test.ts` — world/screen round-trip, fit-to-viewport, focal-point zoom.
- `seating-store.test.ts` — status guard, 8-seat cap, deselect-always-allowed,
  subtotal aggregation.
- `persistence.test.ts` — save/load round-trip, `venueId` scoping, invalid-payload
  rejection, and store rehydration that drops stale/non-selectable/over-cap ids.
- `hit-testing.test.ts` — radius hit-testing, nearest snapping, rectangle queries.
- `keyboard-nav.test.ts` — deterministic row/column movement, edge stops, column
  clamping across uneven rows, key mapping.
- `SeatDetailsSheet.test.tsx` — focused-seat details, select/remove flow, subtotal,
  sold-seat guard, and clear-selection.
- `api.test.ts` — visitor-handle generation/persistence, header attachment,
  success parsing, `ApiError` on non-2xx, and server-minted handle capture.
- `selection-sync.test.ts` — debounced `PUT` driven only by `toggleSeat`,
  unsubscribe stops syncing, server-wins hydration (dropping stale ids), local
  push-up when no server record, and graceful degrade on a failed load.

## Known limitations / deferred

- End-to-end tests (Playwright) are not wired; the Vitest unit + component suite
  covers the highest-risk flows (selection cap, persistence rehydration, keyboard
  nav, hit-testing) in jsdom.
- **Manually verified (no automated check):** clean dev startup, mobile
  zoom/details usability, and smooth rendering near ~15,000 seats. Exercise them
  with `pnpm --filter frontend dev`; the hybrid canvas render and zoom-gated
  labels are the architectural guard for large-map performance. See
  [plan 06](../plans/06-verification-risks-and-decisions.md#verification-run-results).
- shadcn UI primitives live in `src/components/ui/` (`components.json` configured,
  new-york style); the set needed so far (`button`, `input`, `label`, `card`,
  `textarea`, `table`) is present — add more via the shadcn CLI as needed.
- Sprite/atlas seat batching, heat-map by price tier, adjacent-seat finder, and a
  full dark-mode toggle are stretch items (plan 03, Phase 6).
- `public/venue.json` is a generated sample; swap in the official dataset when
  available (the schema is the contract).
