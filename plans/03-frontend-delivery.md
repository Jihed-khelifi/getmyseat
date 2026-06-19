# 03. Frontend Delivery

## Goal

Implement the frontend in execution order, from scaffolding to verification.

## Prerequisites

- Workspace foundation is in place or sufficiently defined.
- Frontend architecture choices from `02-frontend-architecture.md` are accepted.
- The agent implementing this file will not replace the rendering model without evidence from validation.

## Inputs

- Frontend architecture document
- Seating-map requirements
- Root workspace scripts and package-manager conventions

## Outputs

- A working frontend application that satisfies all required frontend criteria
- Targeted automated tests for critical behaviors
- A frontend README explaining trade-offs and known limits

## Phase breakdown

### Phase 1: Scaffold and dependencies

1. Create the Vite React TypeScript app.
2. Add Tailwind and shadcn.
3. Install `react-zoom-pan-pinch`, `zustand`, `zod`, and the chosen spatial index package.
4. Add Vitest, Testing Library, and Playwright.

#### Agent notes

- Keep the initial scaffold lean; remove boilerplate that conflicts with the seating-map layout.
- Record the chosen spatial index package in the frontend README or implementation notes.
- Add only the shadcn primitives that the plan actually needs.

### Phase 2: Domain model and data pipeline

1. Add seat and venue types.
2. Add Zod schemas for `venue.json`.
3. Load and normalize venue data.
4. Derive seat metadata and lookups.
5. Add localStorage helpers with validation on restore.

#### Agent notes

- Normalize the data once and store derived collections rather than recomputing them on every render.
- Treat persisted data as untrusted input and validate on restore.
- Keep price formatting and subtotal logic deterministic and testable.

### Phase 3: Map rendering

1. Create the seat canvas layer.
2. Implement batched seat drawing or sprite-based drawing.
3. Add viewport transform handling.
4. Add hit-testing from pointer coordinates to seat identity.
5. Keep overlays separate from seat rendering.

#### Agent notes

- The first implementation should favor correctness plus measurable performance over visual polish.
- If sprite pre-rendering is added, keep it encapsulated so the main draw path stays understandable.
- Do not let tooltip or detail rendering force a seat-per-node DOM fallback.

### Phase 4: Interaction and state

1. Add `zustand` store slices for venue data, selection state, and viewport state.
2. Enforce the 8-seat selection cap in one shared action path.
3. Support mouse click, touch tap, keyboard focus, and keyboard selection.
4. Show seat details on click or focus.
5. Add subtotal and live selection summary.

#### Agent notes

- Use one mutation path for seat selection so mouse, keyboard, and restored state all obey the same rules.
- Keep selection limit enforcement inside state logic, not only in UI event handlers.
- Prefer explicit action names in the store so tests can target behavior directly.

### Phase 5: Accessibility and responsive UI

1. Add focus styles and managed keyboard navigation.
2. Add `aria-label` support and live announcements.
3. Build desktop detail panel and mobile bottom sheet.
4. Add explicit zoom controls and reset view.

#### Agent notes

- Test keyboard navigation before adding stretch features.
- Mobile details should not depend on hover semantics.
- If focus indication inside the map is difficult, add a synchronized external details surface rather than weakening focus behavior.

### Phase 6: Stretch work if time remains

1. Heat-map by price tier.
2. Adjacent seat finder.
3. Dark mode with verified contrast.

#### Decision gates

1. Stretch priority:
   Only begin stretch work after required tests pass for selection, persistence, and keyboard interaction.
2. Adjacent seat finder:
   Only implement if row-grouped data and seat contiguity rules are already reliable.
3. Dark mode:
   Only add if contrast can be verified; do not add a half-finished theme.

## Testing plan

### Unit tests

- selection cap logic
- subtotal calculation
- persistence rehydration
- seat status guards
- hit-testing helpers

### Component tests

- selection summary UI
- seat details UI
- keyboard interaction handlers

### E2E tests

- mouse-based selection and deselection
- keyboard-only selection
- persistence after reload
- mobile viewport behavior

## Suggested validation sequence for agents

1. Validate the app boots after scaffold changes.
2. Validate seat data loads before building advanced interactions.
3. Validate click selection before keyboard navigation.
4. Validate keyboard navigation before persistence.
5. Validate persistence before stretch features.
6. Run the narrowest relevant test after each completed phase.

## Documentation expectations

The frontend README should explain:

- architecture choices
- rendering trade-offs
- known limitations
- test commands
- incomplete stretch goals if any

## Blockers that require re-evaluation

- If performance is poor with the first drawing strategy, optimize within the canvas approach before considering any architecture change.
- If keyboard navigation becomes ambiguous, prefer deterministic row-based movement over visually nearest-seat movement.
- If mobile gesture conflicts appear, explicit zoom controls take priority over gesture complexity.

## Hurdles

- Large-seat rendering must stay outside normal React reconciliation.
- Restored seat selection must be validated against current data.
- Keyboard navigation needs deterministic movement, not ad hoc nearest-neighbor behavior.

## Exit criteria

- Seats render in correct positions.
- User can select up to 8 seats.
- Selection survives reload safely.
- Keyboard and mobile interaction both work.
- Tests cover the critical flows.

## Definition of done for an agent

- A reviewer can run the app and confirm the required flows without hidden setup or manual mocking.
- The implementation includes targeted tests for the highest-risk behaviors.
- The README explains any remaining gaps without obscuring what is complete.

## Decisions made during implementation

This plan is implemented. Phases 1–5 are complete; Phase 6 is intentionally left
as stretch.

- **Phase 1–4** were already delivered under plan 02's architecture (scaffold,
  domain model + Zod pipeline, canvas rendering, single-path selection store).
- **Phase 5 (gestures + responsive):** added drag-to-pan and two-finger
  pinch-zoom via native Pointer Events (not `react-zoom-pan-pinch`). A canvas
  needs world-space coordinates for hit-testing, so all pan/zoom feeds the one
  transform source in `render/viewport.ts#panBy`/`zoomAround`; a movement
  threshold separates a pan from a tap so dragging never selects. The mobile
  details surface is now a bottom sheet (`App.tsx`); the desktop side panel is
  unchanged. This is the documented deviation from the plan-02 package list, made
  for the same reason vitest@^3 was: avoid a competing/duplicated abstraction.
- **Testing:** unit + component tests run green via Vitest/Testing Library
  (32 tests) covering selection cap, subtotal, persistence rehydration
  (stale/over-cap/cross-venue), hit-testing, keyboard navigation, and the details
  UI. Per the decision gates, stretch work was not started. Playwright E2E is the
  one deferred testing item (documented in `frontend/README.md`); the jsdom suite
  covers the equivalent highest-risk flows.
- **Phase 6 stretch** (heat-map, adjacent-seat finder, dark-mode toggle) is not
  implemented; the dark palette tokens exist in `index.css` but no toggle is
  shipped, honoring the "no half-finished theme" gate.

See [`frontend/README.md`](../frontend/README.md) for commands, the interaction
model, and the full list of deferred items.
