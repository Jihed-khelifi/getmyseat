# 02. Frontend Architecture

## Goal

Define the frontend technical architecture for a high-performance, accessible seating map that can scale toward 15,000 seats or more.

## Prerequisites

- Workspace foundation is established or at least planned consistently.
- The frontend remains a greenfield Vite React application.
- Performance and accessibility are both treated as first-class requirements.

## Inputs

- Seating-map assignment requirements
- Example `venue.json` structure and seat-status rules
- Chosen frontend stack documented in the plan index

## Outputs

- A fixed frontend architecture that another agent can implement without re-deciding core patterns
- A clear rendering model, state model, accessibility model, and file layout
- A short list of packages with purpose-specific justification

## Core choices

- Scaffold with Vite + React + TypeScript.
- Use `shadcn/ui` for controls and semantic UI primitives.
- Use `react-zoom-pan-pinch` for pan, zoom, and touch gestures.
- Use `zustand` for selection, viewport, and persistence-aware state.
- Use `zod` for runtime validation of `public/venue.json`.
- Use `d3-quadtree` or `rbush` for spatial indexing and hit-testing.

## Why Vite over Next.js 14

- No SSR or SEO requirement exists.
- The app is heavily client-interactive.
- Local storage, canvas rendering, and event handling are simpler without app-router boundaries.
- Vite reduces setup and review overhead for a take-home.

## Rendering strategy

Use a hybrid stage:

- Canvas for the seat population
- React/shadcn overlays for controls, details, summaries, legends, and focus-related UI

This avoids rendering thousands of interactive seat DOM nodes while preserving semantic UI around the map.

## Agent-specific architecture rules

- Do not render one React component per seat for the main map layer.
- Keep canvas drawing logic outside React reconciliation as much as possible.
- Centralize world-to-screen and screen-to-world transforms in one viewport utility.
- Keep keyboard navigation logic separate from pointer hit-testing logic, even if both consume shared spatial data.
- Treat the detail panel and selection summary as semantic accessibility surfaces, not just visual UI.

## Data model

Define strict types for:

- `Venue`
- `VenueMap`
- `Section`
- `Row`
- `Seat`
- `SeatStatus`
- `PriceTier`
- `SelectionSummary`
- `ViewportTransform`
- `PersistedSelectionState`

## Data loading approach

1. Load `public/venue.json` on startup.
2. Validate it with Zod.
3. Normalize seat data into lookup maps and arrays.
4. Derive metadata needed for rendering and keyboard navigation.
5. Store persisted selection under a key that includes `venueId`.

## Data normalization requirements

Agents implementing this file should normalize seat data into at least these structures:

- seat-by-id lookup
- ordered seat array for rendering
- section metadata lookup
- row-grouped seat collections for navigation and adjacency logic
- optional spatial index for pointer hit-testing

## Decision gates

1. Spatial index package:
   Choose one of `d3-quadtree` or `rbush` and keep the choice consistent across hit-testing and any stretch adjacency work.
2. Overlay strategy:
   Use React/shadcn overlays for details and controls. Avoid mixing multiple overlay patterns unless mobile behavior demands a dedicated bottom sheet.
3. Label rendering:
   Do not render detailed seat labels by default at low zoom. Add zoom-threshold rules if seat labels are needed.

## Suggested folder structure

```text
frontend/
  public/
    venue.json
  src/
    main.tsx
    App.tsx
    components/
      seat-map/
        SeatMap.tsx
        SeatDetailsSheet.tsx
        SeatLegend.tsx
        SeatToolbar.tsx
    features/
      seating/
        model/
          seat-types.ts
          seat-validation.ts
        state/
          seating-store.ts
          persistence.ts
        render/
          draw-seats.ts
          hit-testing.ts
          viewport.ts
        a11y/
          keyboard-nav.ts
          announcements.ts
    lib/
      storage.ts
```

## Accessibility model

- Make the map itself keyboard focusable.
- Implement directional navigation instead of one tab stop per seat.
- Use `Enter` and `Space` for selection.
- Show details on focus or click.
- Add `aria-live` announcements for selection and invalid actions.
- Keep a semantic summary panel for selected seats.

## Accessibility implementation constraints

- The map must expose at least one clear tab stop.
- Seat selection must be possible without a mouse.
- Invalid actions such as selecting a ninth seat must produce perceivable feedback.
- Focus should never disappear into the canvas layer without a corresponding visible indicator.
- Any seat detail available on hover must also be available on focus or activation.

## Mobile model

- Support pinch-zoom and pan.
- Add explicit zoom controls as fallback.
- Use a bottom sheet for seat details on small screens.
- Keep the summary visible without obscuring the map.

## Suggested file ownership

- `seat-types.ts`: domain types only
- `seat-validation.ts`: runtime parsing and validation
- `seating-store.ts`: app state and mutations
- `draw-seats.ts`: rendering primitives and batching
- `hit-testing.ts`: spatial lookup and coordinate conversion entry points
- `keyboard-nav.ts`: directional focus and selection behavior
- `SeatMap.tsx`: composition of canvas, overlays, and interaction wiring

## Frontend package recommendations

- `shadcn/ui`
- `tailwindcss`
- `react-zoom-pan-pinch`
- `zustand`
- `zod`
- `d3-quadtree` or `rbush`
- `lucide-react`
- `clsx`
- `tailwind-merge`

## Hurdles

- Rendering seats as React nodes will likely hurt performance.
- Pan and zoom math can drift if coordinate conversion is duplicated.
- Canvas interaction makes accessibility harder unless semantic overlays are designed early.
- Touch selection and pinch gestures can conflict on mobile.

## Exit criteria

- The rendering architecture is fixed before implementation starts.
- The data model covers required seat details and selection state.
- The accessibility and mobile interaction model is defined early.

## Definition of done for an agent

- Another agent can implement the frontend without reopening the Vite vs Next.js question, the canvas vs seat-node question, or the state-management choice.
- The architecture names the main files and their responsibilities.
- Core interaction behavior is explicit enough to test before polish work starts.

## Decisions made during implementation

This plan is implemented. The decision gates above are resolved as follows:

1. **Spatial index — `d3-quadtree`.** Seats are points, so `quadtree.find(x, y, radius)`
   gives exact radius-bounded nearest lookups. Used consistently in
   `features/seating/render/hit-testing.ts` and available for the stretch
   adjacent-seat finder.
2. **Overlay strategy — React/shadcn overlays.** Desktop side panel plus a
   stacked details surface on small screens (`SeatDetailsSheet`). No competing
   overlay patterns; a dedicated bottom sheet is deferred to plan 03 Phase 5.
3. **Label rendering — zoom-gated.** Labels are not drawn below
   `LABEL_ZOOM_THRESHOLD` in `render/draw-seats.ts`.

Established invariants (verified by `tsc --noEmit` and Vitest):

- Single selection mutation path (`state/seating-store.ts#toggleSeat`) enforces the
  8-seat cap and "available-only" guard once.
- All world ⇄ screen math lives in `render/viewport.ts`.
- Persisted selection is `venueId`-scoped, Zod-validated, and reconciled against
  the live venue on restore (`state/persistence.ts`).

Tooling note: the package set required `vitest@^3` (not `^2`) so Vitest and Vite 6
share a single Vite version; this is the only deviation from the suggested stack.
See [`frontend/README.md`](../frontend/README.md) for the full file map and the
list of items intentionally deferred to plan 03.
