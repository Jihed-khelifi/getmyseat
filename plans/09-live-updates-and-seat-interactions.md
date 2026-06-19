# 09. Live Updates & Seat Interactions (Phase 2)

## Goal

Deliver the interactive seat-map feature set on top of the integrated backend:
**live seat-status updates over WebSocket with animation**, a **price-tier
heat-map toggle**, a **"find N adjacent seats" helper**, confirmed **mobile
pinch-zoom + pan**, and a **WCAG 2.1 AA dark-mode toggle**.

> Planning document only — do not implement here. Build additively on plans 02/03
> (canvas render, viewport, store, gestures) and plan 08 (server-backed selection).
> Resolve gates **G3 (WebSocket lib)** and **G4 (hold model)** from
> [plan 07](./07-integration-architecture.md) first.

## Prerequisites

- [Plan 07](./07-integration-architecture.md) accepted; [plan 08](./08-persistent-selections.md)
  selection sync in place (the store is already fed by the server).
- Existing frontend invariants intact: hybrid canvas, single `viewport.ts`
  transform, single `toggleSeat` path, zoom-gated labels.
- Existing native-Pointer-Events gestures (drag-pan + two-finger pinch) from plan
  03 are present.

## Inputs

- Backend seat-status source of truth + `WS /ws` channel (plan 07 pillar 1 & 4).
- Existing `render/draw-seats.ts`, `render/viewport.ts`, `render/hit-testing.ts`.
- Existing dark palette tokens already present in `frontend/src/index.css`.
- Row-grouped seat collections already normalized for keyboard nav (reused by the
  adjacent-seat finder).

## Outputs

- Live status deltas applied to the canvas with smooth animation.
- A heat-map mode colouring seats by price tier.
- An "adjacent seats" finder that selects N contiguous available seats.
- Verified mobile gestures with explicit zoom controls (already shipped) + E2E
  coverage hooks.
- A dark-mode toggle with verified AA contrast.
- Targeted tests for each behavior.

## Feature work

### Phase 1: Backend seat-status channel

1. Add a seat-status store seeded from the venue document (plan 07 pillar 1).
2. Implement `WS /ws` per gate **G3** (recommended `ws`): on connect, send a
   status snapshot, then stream `seat-delta` messages.
3. Wire selection holds per gate **G4** (recommended optimistic hold + TTL): a
   `PUT /selections/me` that adds a seat marks it `held` and broadcasts; deselect
   or TTL expiry broadcasts the revert. Centralize TTL handling like the existing
   cache sweeper.

#### Agent notes

- Keep the broadcaster a single module; services emit status changes to it.
- Re-snapshot on every (re)connect so a client that missed deltas converges.
- Do not let WebSocket concerns leak into the user/cache services.

### Phase 2: Frontend live status

1. Add a WebSocket client with reconnect/backoff; on (re)connect, re-fetch the
   status snapshot then apply deltas.
2. Feed status changes into the store so the canvas re-renders; **status source is
   now the store**, not `venue.json`.
3. Animate transitions (e.g. colour tween / brief pulse) in the canvas draw path
   without dropping below the performance target.

#### Agent notes

- Animation lives in the canvas draw loop, not per-seat React state.
- Throttle/batch deltas so a burst does not thrash rendering.
- A seat the local user holds vs a seat held by someone else must be visually
  distinguishable.

### Phase 3: Heat-map toggle

1. Add a toolbar toggle that recolours seats by price tier instead of status.
2. Keep the legend in sync (status legend vs price-tier legend).

#### Agent notes

- Colour mapping is a draw-time concern in `draw-seats.ts`; do not duplicate seat
  geometry.
- Ensure heat-map colours also meet contrast expectations and remain distinct in
  dark mode.

### Phase 4: Find N adjacent seats

1. Add a control to request N contiguous available seats (N ≤ 8).
2. Use the existing row-grouped data to find a contiguous available run within a
   row; on success, select them through `toggleSeat`; on failure, announce no
   match via the existing `aria-live` region.

#### Agent notes

- Reuse row grouping and seat ordering already built for keyboard navigation; do
  not invent a parallel adjacency model.
- Respect the 8-seat cap and available-only guard — selection still goes through
  the one mutation path.
- Define "adjacent" explicitly (same row, consecutive column) and document it.

### Phase 5: Mobile gestures (confirm + polish)

1. Verify the existing drag-pan + two-finger pinch still works after live updates
   and overlays are added.
2. Keep explicit zoom controls as the documented fallback (already present).

#### Agent notes

- This is largely **already implemented** (plan 03, native Pointer Events). Treat
  this phase as verification + regression coverage, not a rewrite. Do not
  reintroduce `react-zoom-pan-pinch`.
- Ensure tap-vs-drag threshold still separates selection from panning when live
  deltas are animating.

### Phase 6: Dark mode (WCAG 2.1 AA)

1. Add a theme toggle (persisted; respect `prefers-color-scheme` on first load).
2. Use the existing dark tokens in `index.css`; extend canvas seat colours for the
   dark theme.
3. Verify **AA contrast (≥ 4.5:1 text, ≥ 3:1 large text / UI)** for text, controls,
   seat-status colours, and heat-map colours.

#### Agent notes

- Honor the plan-03 "no half-finished theme" gate: ship only if contrast is
  verified across map, overlays, legend, and admin/event surfaces.
- Canvas colours are not covered by CSS variables automatically — drive them from
  a theme-aware palette module.

## Testing plan

### Unit / component

- WebSocket client: applies snapshot then deltas; reconnect re-snapshots.
- Heat-map colour mapping by price tier.
- Adjacent-seat finder: finds a contiguous run, respects the cap, announces no
  match, and only selects available seats.
- Theme toggle persistence and token application.
- Contrast checks for the status + heat-map palettes (assert ratios).

### Backend

- `WS /ws` sends a snapshot on connect and a delta after a status change.
- Hold TTL releases a seat and broadcasts the revert.

## Decision gates

1. **Animation style** — colour tween vs pulse vs fade. Keep it cheap; decide and
   keep consistent.
2. **Adjacency scope** — same-row only (recommended) vs cross-row wrap. Document.
3. **Theme default** — follow OS vs default light. Recommend follow OS, allow
   override, persist the override.

## Hurdles

- Live animation must stay inside the canvas loop or it will reintroduce per-seat
  React work and miss the performance target.
- Reconnect handling can apply stale deltas without a fresh snapshot.
- Dark mode + heat-map together multiply the contrast surface to verify.
- Adjacency logic can drift from keyboard-nav ordering if it forks the data model.

## Exit criteria

- Seat-status changes broadcast live and animate smoothly for all clients.
- Heat-map and adjacent-seat finder work and respect existing selection rules.
- Mobile gestures verified; dark mode shipped with verified AA contrast.
- Targeted tests cover live updates, heat-map, adjacency, and theming.

## Definition of done for an agent

- A reviewer sees another client's selection update live, can toggle a heat-map and
  dark mode, find adjacent seats, and pan/zoom on touch — all without regressing
  performance, the single transform, or the single selection path.
- No status now comes from `venue.json`; the store is the only status source on the
  client.

## Implementation status (implemented)

Phases 1–6 are implemented additively on plans 01–08; all suites pass (backend
40, frontend 63) with both packages typechecking clean.

Decision gates resolved:

- **G3 live channel** — `ws` (no `socket.io`). Backend serves `WS /ws`; the
  client applies a snapshot on every (re)connect, then streams `seat-delta`
  messages, so a reconnect always re-converges and stale deltas cannot
  accumulate.
- **G4 seat-status model** — backend-owned status with an optimistic hold that
  carries a TTL (`HOLD_TTL_MS`, default 120s). Saving a selection holds the
  seats; clearing or TTL expiry reverts them to `available`. Holds-by-self are
  selectable even when not `available`.
- **Animation** — a cheap fading ring pulse (600ms) drawn inside the single
  canvas RAF loop; no per-seat React nodes are introduced.
- **Adjacency** — same-row consecutive available seats, clamped to the 8-seat
  cap, honouring live status over the venue seed.
- **Theme** — follow the OS preference on first load, allow an override, persist
  it via the `.dark` class that drives every CSS-variable palette (map,
  overlays, legend, controls re-theme together).

Backend additions: `realtime.service.ts` (`RealtimeBroadcaster`),
`hold.service.ts` (`HoldService` TTL), `seat-status.service.ts` change
listeners, wired in `container.ts` / `server.ts`.

Frontend additions: store `liveStatus` as the sole status source
(`canSelectSeat(venue, liveStatus, selected, seatId)`), `seat-status-sync.ts`
(WS + reconnect/backoff), `adjacency.ts`, `pulse-registry.ts`, heat-map mode in
`draw-seats.ts`, `theme.ts` + `ThemeToggle`, `AdjacentSeatsControl`, and a `/ws`
dev proxy in `vite.config.ts`.

Accessibility: seat status is conveyed redundantly (legend + aria + details
panel), never by colour alone (WCAG 1.4.1). Text/UI token pairs meet AA and dark
seat fills meet the 3:1 UI-component contrast against the dark map; verified by
`lib/contrast.test.ts`.
