# GetMySeat

A pnpm-based monorepo with two independent apps:

- **`frontend/`** — an interactive, high-performance seating map (Vite + React + TypeScript).
- **`backend/`** — a user-data API with caching, rate limiting, and async processing (Express + TypeScript).

> Implementation follows the ordered plans in [`plans/`](./plans/README.md). This workspace foundation corresponds to [plan 01](./plans/01-workspace-foundation.md).

## Layout

```text
.
├── frontend/          # seating-map app (its own package + tsconfig)
├── backend/           # user-data API (its own package + tsconfig)
├── plans/             # ordered implementation plans
├── package.json       # root workspace scripts
├── pnpm-workspace.yaml
└── tsconfig.base.json # shared strict TypeScript defaults
```

## Prerequisites

- **Node.js** `>= 20`
- **pnpm** `>= 9` (managed via Corepack, which ships with Node)

Enable pnpm once:

```bash
corepack enable pnpm
```

If your global bin directory is not writable, install the shim into a user path instead:

```bash
corepack enable --install-directory "$HOME/.local/bin" pnpm
export PATH="$HOME/.local/bin:$PATH"
```

## Getting started

```bash
pnpm install   # install all workspace dependencies
pnpm dev       # run frontend and backend dev servers together
```

## Scripts

| Command              | Description                                             |
| -------------------- | ------------------------------------------------------- |
| `pnpm dev`           | Run every app's `dev` script in parallel.               |
| `pnpm dev:frontend`  | Run only the frontend dev server.                       |
| `pnpm dev:backend`   | Run only the backend dev server.                        |
| `pnpm build`         | Build every app that defines a `build` script.          |
| `pnpm test`          | Run every app's test suite.                             |
| `pnpm test:frontend` | Run only the frontend tests.                            |
| `pnpm test:backend`  | Run only the backend tests.                             |
| `pnpm typecheck`     | Type-check every app that defines a `typecheck` script. |

Root scripts only delegate into each app, so `pnpm dev`/`pnpm test`/`pnpm typecheck`
are safe to run at any stage — they no-op for apps that have not defined a given
script yet (via `--if-present`). App-specific scripts come online as each app is
implemented in its own plan.

## TypeScript

[`tsconfig.base.json`](./tsconfig.base.json) holds shared **strict** defaults. Each
app keeps environment-specific settings (DOM vs. Node, module resolution, JSX) in
its own `tsconfig.json` that extends the base, so the apps can evolve independently.

## Foundation decisions

These resolve the decision gates in [plan 01](./plans/01-workspace-foundation.md):

- **TypeScript layout** — one shared `tsconfig.base.json` plus per-app `tsconfig.json`
  overrides. No app-level incompatibility required splitting the base.
- **Dev orchestration** — pnpm's built-in recursive/parallel script execution
  (`pnpm -r --parallel`). No extra task runner (Nx, Turborepo, `concurrently`) is added.
- **Linting / formatting** — intentionally deferred to keep the foundation thin;
  added per-app only if it proves worthwhile during delivery.
