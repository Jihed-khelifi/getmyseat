# 01. Workspace Foundation

## Goal

Create a pnpm-based monorepo structure that supports both frontend and backend with a single install flow and strict TypeScript defaults.

## Deliverables

- Root `package.json`
- Root `pnpm-workspace.yaml`
- Shared `tsconfig.base.json`
- Root `README.md`
- Separate `frontend` and `backend` package boundaries

## Prerequisites

- The repository is still effectively greenfield.
- `frontend` and `backend` directories exist and are intended to remain separate packages.
- `pnpm` is the package manager of record for the whole repository.

## Inputs

- Existing repository folders: `frontend/`, `backend/`
- The frontend and backend assignment requirements
- The package and architectural decisions documented in the other plan files

## Outputs

- A root workspace that can install and orchestrate both apps
- Shared TypeScript defaults without forcing unnecessary coupling
- A root README that tells a reviewer how to get started quickly

## Steps

1. Create a root workspace using `pnpm`.
2. Add `frontend` and `backend` as workspace packages.
3. Add a shared TypeScript base config with `strict: true`.
4. Keep app-specific TS settings in local `tsconfig.json` files.
5. Add root-level scripts that delegate to each app for development and testing.
6. Add minimal linting/formatting only if it does not slow down delivery.

## Recommended decisions

- Use one root `tsconfig.base.json` and app-specific overrides.
- Keep the workspace shallow and easy to review.
- Avoid introducing Nx, Turborepo, or custom build orchestration because the assignment does not require them.

## Root file targets

- `package.json`: workspace scripts and shared package manager entry points
- `pnpm-workspace.yaml`: package registration
- `tsconfig.base.json`: shared compiler defaults
- `README.md`: top-level usage and layout summary

## Proposed scripts

- `pnpm dev`: run frontend and backend dev scripts
- `pnpm test`: run both app test suites
- `pnpm test:frontend`: frontend tests only
- `pnpm test:backend`: backend tests only

## Implementation notes for agents

- Keep root orchestration thin. The root should dispatch into app-level scripts, not absorb app-specific logic.
- Put strict TypeScript defaults in the base config and reserve environment-specific compiler settings for each package.
- Prefer a minimal root README that points to frontend and backend READMEs instead of duplicating all app details.
- If a concurrency helper is needed for `pnpm dev`, prefer a lightweight script approach over introducing a heavy task runner.

## Decision gates

1. Root TypeScript layout:
   Choose shared `tsconfig.base.json` plus local `tsconfig.json` files unless a concrete app-level incompatibility appears.
2. Root dev orchestration:
   Choose the smallest stable option that can start both apps together. Do not add monorepo tooling unless simple scripts fail to meet the requirement.
3. Linting and formatting:
   Add only if setup time remains reasonable and the config will not overshadow the assignment itself.

## Validation commands

- `pnpm install`
- `pnpm -r test` once app-level tests exist
- `pnpm dev` once app-level dev scripts exist

## Hurdles

- Over-configuring the repo too early adds noise and slows the implementation.
- Shared TS settings can become too opinionated if frontend and backend needs diverge.
- Root dev orchestration should stay simple enough that reviewers can run it without reading extra docs.

## Blockers that require a deliberate choice

- If one app needs a TypeScript compiler option that conflicts with the shared base config, keep the base minimal and move the conflicting option into the app-specific config.
- If a single-command dev flow becomes unreliable, document the alternative explicitly in the root README rather than hiding complexity in shell glue.

## Exit criteria

- `pnpm install` works from the repo root.
- Each app has its own `package.json` and `tsconfig.json`.
- TypeScript strict mode is enabled for both apps.
- Root docs tell the reviewer how to start both apps.

## Definition of done for an agent

- A fresh reviewer can clone the repo, run the root install command, and discover the app entry points from the root README alone.
- Root files do not contain app-specific business logic.
- The workspace setup does not force later architectural changes in frontend or backend.
