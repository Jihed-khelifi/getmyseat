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
    render/
      viewport.ts             # the ONLY world ⇄ screen transform math
      hit-testing.ts          # d3-quadtree spatial index (pointer → seat)
      draw-seats.ts           # canvas drawing + batching primitives
    a11y/
      keyboard-nav.ts         # deterministic row-based directional navigation
      announcements.ts        # pure aria-live message builders
  lib/
    storage.ts                # safe localStorage wrapper
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

Run with `pnpm --filter frontend test` (Vitest + Testing Library, 32 tests).

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

## Known limitations / deferred

- End-to-end tests (Playwright) are not wired; the Vitest unit + component suite
  covers the highest-risk flows (selection cap, persistence rehydration, keyboard
  nav, hit-testing) in jsdom.
- **Manually verified (no automated check):** clean dev startup, mobile
  zoom/details usability, and smooth rendering near ~15,000 seats. Exercise them
  with `pnpm --filter frontend dev`; the hybrid canvas render and zoom-gated
  labels are the architectural guard for large-map performance. See
  [plan 06](../plans/06-verification-risks-and-decisions.md#verification-run-results).
- shadcn UI primitives are configured (`components.json`) but only the components
  needed so far are hand-written; add more via the shadcn CLI as needed.
- Sprite/atlas seat batching, heat-map by price tier, adjacent-seat finder, and a
  full dark-mode toggle are stretch items (plan 03, Phase 6).
- `public/venue.json` is a generated sample; swap in the official dataset when
  available (the schema is the contract).
