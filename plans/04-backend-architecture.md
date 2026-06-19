# 04. Backend Architecture

## Goal

Define a small but explicit Express + TypeScript backend architecture that demonstrates advanced caching, concurrent-request handling, rate limiting, and asynchronous processing.

## Prerequisites

- Workspace foundation is established or at least planned consistently.
- The backend remains intentionally single-process and in-memory.
- The assignment does not require external infrastructure such as Redis or a real database.

## Inputs

- Backend assignment requirements
- Mock user data contract
- Workspace-level package-manager and TypeScript decisions

## Outputs

- A backend architecture with clear boundaries for cache, queue, repository, and HTTP handling
- A documented rate-limit model and response-shape strategy
- A file layout that another agent can implement directly

## Core choices

- `express` for the HTTP layer
- `typescript` + `tsx` for development
- `zod` for params and body validation
- `pino` + `pino-http` for structured logging
- `lru-cache` for LRU + TTL behavior
- `rate-limiter-flexible` for burst-aware rate limiting
- `p-queue` for in-process asynchronous write handling

## Why this stack

- It matches the assignment requirements directly.
- It avoids infrastructure-heavy dependencies like Redis or BullMQ.
- It keeps the design readable for a take-home review.

## Proposed structure

```text
backend/
  src/
    app.ts
    server.ts
    routes/
      users.routes.ts
      cache.routes.ts
    controllers/
      users.controller.ts
      cache.controller.ts
    middleware/
      error-handler.ts
      rate-limit.ts
      validate.ts
    repositories/
      mock-user.repository.ts
    services/
      cache.service.ts
      request-deduper.ts
      user-write-queue.ts
      user.service.ts
    types/
      user.ts
    utils/
      logger.ts
```

## Core abstractions

### Mock user repository

- Seed with the three required users.
- Use an in-memory `Map`.
- Simulate reads with a 200ms delay.

### Cache service

- Wrap `lru-cache`.
- Apply a 60-second TTL.
- Track hits, misses, size, and response-time metrics.
- Expose clear and stats methods.

### Request deduper

- Use `Map<string, Promise<User | null>>`.
- Share in-flight fetches by user id.
- Always remove entries in `finally`.

### Write queue

- Use `p-queue` for asynchronous POST processing.
- Keep behavior in-process and well documented.

## Agent-specific architecture rules

- Keep request handlers thin; business logic belongs in services.
- Keep cache metrics inside the cache layer or a closely related service, not scattered through controllers.
- Do not mix queue semantics with repository semantics; the queue should orchestrate when work runs, not how users are stored.
- Keep route validation explicit with Zod or equivalent typed parsing.

## API targets

- `GET /users/:id`
- `POST /users`
- `DELETE /cache`
- `GET /cache-status`

## Expected response-shape guidance

- Success responses should be predictable JSON objects or JSON resources, not ad hoc strings.
- Error responses should include a stable message field and appropriate HTTP status code.
- `GET /cache-status` should expose enough metrics to demonstrate cache behavior during review.
- `POST /users` should make queue behavior observable in its response body if `202 Accepted` is used.

## Rate-limiting model

Use two coordinated windows:

- 5 requests per 10 seconds
- 10 requests per 60 seconds

This is simple to explain and test while still matching the burst requirement.

## Decision gates

1. POST response semantics:
   Prefer `202 Accepted` with queued metadata. Only switch to `201 Created` if validation or reviewer expectations make the asynchronous contract too confusing.
2. Cache-write behavior after POST:
   Choose either cache priming or targeted invalidation and document the reason. Do not leave the behavior implicit.
3. Average response time metric:
   Choose a simple rolling aggregate or cumulative average and keep the definition stable in code and docs.

## Backend package recommendations

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

## Hurdles

- TTL eviction in `lru-cache` can be lazy unless stale entries are actively purged.
- In-flight promise cleanup mistakes can leak memory.
- Async POST semantics need to be explained clearly if `202 Accepted` is used.
- Rate-limit tests can become flaky without controlled timing.

## Exit criteria

- The service boundaries are defined before coding.
- Endpoint behavior and metrics shape are agreed up front.
- The queue and cache responsibilities are separated cleanly.

## Definition of done for an agent

- Another agent can implement the backend without revisiting the choice of cache package, queue package, or rate-limiting model.
- The main service boundaries and response semantics are explicit.
- The architecture calls out the most failure-prone behaviors before coding begins.

## Decisions made during implementation

This plan is implemented (it also delivers plan 05). The decision gates above
are resolved as follows:

1. **POST response semantics — `202 Accepted`.** The body is
   `{ status: 'queued', id, queuedAt, position }`, so a reviewer can poll
   `GET /users/:id`. The id is assigned synchronously before enqueueing.
2. **Cache-write after POST — priming.** When the queued task runs it primes the
   cache with the new user (`services/user.service.ts#queueCreateUser`), so the
   first subsequent read is a `HIT`. Missing users are deliberately _not_ cached,
   so a fresh create is never shadowed by a stale "not found".
3. **Average response time — cumulative average.** `CacheService` keeps a running
   total and count over every read served by `UserService` (hits and misses);
   `averageResponseTimeMs = total / count`. Defined once and reused in code,
   tests, and the README.

Additional choices (plan 05 decision gates):

- **`DELETE /cache` clears entries only, preserves counters** (lifetime hit-rate
  history survives a flush; only `clears` increments).
- **Express 4** (not 5) so `validate` can reassign `req.params`/`req.body` and
  middleware typings stay simple.

Established boundaries (verified by `tsc --noEmit` and 16 Vitest tests):

- Handlers are thin; all coordination lives in `services/user.service.ts`.
- All cache metrics live in `services/cache.service.ts`; an active background
  sweeper purges stale TTL entries (`lru-cache` evicts lazily otherwise).
- Concurrent cache-miss reads share one repository fetch via
  `services/request-deduper.ts`, cleaned up in `finally`.
- The write queue (`services/user-write-queue.ts`) orchestrates _when_ writes
  run; the repository owns _how_ users are stored.
- Composition root is `container.ts`; `app.ts` only wires middleware and routes.

See [`backend/README.md`](../backend/README.md) for the full endpoint table,
metrics shape, and single-process limitations.
