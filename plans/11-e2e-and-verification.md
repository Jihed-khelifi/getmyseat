# 11. End-to-End Testing & Phase 2 Verification

## Goal

Add **browser end-to-end tests (Playwright or Cypress)** covering the integrated
flows from plans 07–10, and define the verification gate for phase 2 the way
[plan 06](./06-verification-risks-and-decisions.md) did for the original scope.

> Planning document only — do not implement here. This file extends, and does not
> replace, the plan-06 verification gate (which still covers the original 01–05
> deliverable).

## Prerequisites

- Plans 08–10 implemented (or each verified as its own slice).
- Both apps run together via `pnpm dev`; backend owns seat status, selections,
  metrics, admin, and event data.

## Inputs

- The phase-2 feature list and the API + WebSocket surface from
  [plan 07](./07-integration-architecture.md).
- Existing Vitest unit/component suites (frontend 32, backend 16) — kept as the
  fast inner loop; E2E covers cross-app flows they cannot.

## Outputs

- A configured E2E runner (Playwright recommended) with a small, high-signal suite.
- A scripted way to boot both apps for E2E (and seed deterministic state).
- An updated verification checklist + evidence section for phase 2.

## Decision gate

**G7 — E2E framework.** Playwright vs Cypress.

Recommendation: **Playwright** — first-class multi-context (two browser contexts to
prove live WebSocket updates between clients), built-in trace viewer, and it was
already the deferred choice in plans 02/03. Choose one and do not mix.

## Test environment

1. Add a root script that starts backend + frontend in a test mode with fixed
   ports and a seeded/ephemeral mock-DB file (so runs are deterministic and do not
   pollute dev state).
2. Provide a reset hook (e.g. a test-only endpoint or a fresh `.data` file per run)
   so each spec starts clean.

#### Agent notes

- Keep E2E deterministic: seed event/seat data, pin ports, and isolate the
  persistence file from the developer's `.data`.
- Do not weaken production code to make tests pass; add test-mode config instead.

## E2E coverage (high-signal flows)

1. **Select + persist + view later** — select seats, reload, confirm the same
   selection restores from the backend (not just localStorage).
2. **Live update across clients** — two browser contexts; a hold in one appears
   live (and animated) in the other.
3. **Heat-map + dark mode** — toggles apply and the legend/contrast hold.
4. **Adjacent-seat finder** — request N seats, confirm a contiguous available run
   is selected and the cap is respected.
5. **Mobile gestures** — emulated touch: pinch-zoom and pan work; tap still selects.
6. **Admin flow** — log in with credentials, view metrics/logs, edit the event,
   and confirm the user-facing app reflects the change (ideally live).
7. **Keyboard-only selection** — focus the map, navigate, select with Enter/Space
   (regression of the existing a11y guarantee end-to-end).

## Verification checklist (phase 2)

Mark phase 2 done only when these have executable evidence:

### Integration

1. A selection is stored in the mock DB and retrievable later with no login.
2. Seat-status changes broadcast over WebSocket and animate for other clients.
3. Heat-map toggle colours seats by price tier.
4. "Find N adjacent seats" selects a contiguous available run within the cap.
5. Mobile pinch-zoom + pan work (emulated touch) and tap still selects.
6. Dark mode meets WCAG 2.1 AA contrast across map, overlays, and admin.

### Platform

7. API performance metrics (response time, error rate, cache performance) are
   recorded over time and visible in `/admin`.
8. `/admin` is protected by email-password → bearer token.
9. Admin edits to event name/date/description, arena location, and updates appear
   in the user-facing frontend.

## Verification protocol

1. Keep Vitest as the fast inner loop; use E2E only for cross-app flows.
2. Capture at least one executable check per phase-2 feature (automated where
   possible; record any manual-only checks as a limitation, as plan 06 does).
3. Verify no plan-01–06 invariant regressed: hybrid canvas, single viewport
   transform, single selection path, thin handlers, cache/read semantics.
4. Do not report a deferred/stretch item as a passing required check.

## Risks specific to E2E

- WebSocket timing makes naive assertions flaky — wait on observable UI state, not
  fixed sleeps.
- Shared persistence between runs causes order-dependent failures — isolate the
  `.data` file per run.
- Two-context tests are heavier — keep the suite small and focused on the riskiest
  cross-app flows.

## Exit criteria

- An E2E runner is configured and a focused suite covers the phase-2 flows above.
- The phase-2 verification checklist has evidence (automated or explicitly
  noted-as-manual).
- The READMEs explain how to run the E2E suite and any deliberately deferred items.

## Definition of done for an agent

- A reviewer can run one documented command to exercise the integrated flows end to
  end, and the phase-2 checklist is backed by evidence.
- Phase-2 results are reported separately from, and without contradicting, the
  plan-06 gate for the original scope.
