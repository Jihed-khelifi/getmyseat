# 05. Backend Delivery

## Goal

Implement the backend in execution order, from app setup to test coverage.

## Prerequisites

- Workspace foundation is in place or sufficiently defined.
- Backend architecture choices from `04-backend-architecture.md` are accepted.
- The service is intentionally single-process and in-memory.

## Inputs

- Backend architecture document
- API assignment requirements
- Seed user data requirements

## Outputs

- A working Express API that satisfies the required backend criteria
- Observable cache and rate-limit behavior
- Targeted tests and backend documentation

## Phase breakdown

### Phase 1: Scaffold and middleware

1. Create the Express TypeScript app.
2. Add request parsing, CORS, and optional Helmet.
3. Add request logging and error handling.
4. Add request validation helpers.

#### Agent notes

- Keep middleware registration explicit in `app.ts` so request flow is easy to inspect.
- Add error handling early so later failures produce stable JSON responses.

### Phase 2: Repository, cache, and service layer

1. Implement the seeded mock repository.
2. Add 200ms artificial delay to reads.
3. Implement `CacheService` with LRU and 60s TTL.
4. Add cache counters and response timing aggregation.
5. Add `RequestDeduper` for concurrent GET sharing.

#### Agent notes

- Keep cache counters in one place and expose them through a dedicated method.
- Keep the artificial 200ms latency in the repository layer so tests can isolate cache effects cleanly.
- Make the deduper generic enough to be testable on its own if helpful, but do not overgeneralize it.

### Phase 3: Read endpoint

1. Implement `GET /users/:id`.
2. Validate the route param.
3. Check cache before repository access.
4. Share concurrent cache-miss fetches through the deduper.
5. Return a meaningful `404` when the user does not exist.

#### Agent notes

- Do not cache thrown errors or missing-user responses unless that choice is made deliberately and documented.
- Ensure the in-flight promise map is cleaned up in `finally`.
- Capture timing around the whole request or the relevant service call consistently; do not mix definitions later.

### Phase 4: Async write path

1. Implement a write queue using `p-queue`.
2. Implement `POST /users` with body validation.
3. Recommended response semantics: `202 Accepted` with queued metadata.
4. Add the new user to the mock repository when the queued task runs.
5. Decide whether to prime or invalidate cache for the new user and document it.

#### Agent notes

- If using `202 Accepted`, return enough metadata for a reviewer to understand that work was queued.
- Keep POST validation strict enough to avoid malformed users entering the mock repository.
- Resist adding extra job endpoints unless validation proves they are necessary.

### Phase 5: Rate limiting and cache maintenance

1. Add dual-window rate limiting middleware.
2. Return structured `429` responses.
3. Add a background cache sweeper that purges stale entries every 5 to 10 seconds.
4. Track stale purges or evictions in cache stats.

#### Agent notes

- Keep rate-limiter configuration centralized.
- Make the sweeper interval configurable so tests can shorten it if needed.
- Ensure `GET /cache-status` reflects the effect of sweeps clearly.

### Phase 6: Admin endpoints and observability

1. Implement `DELETE /cache`.
2. Implement `GET /cache-status`.
3. Return size, hits, misses, hit rate, average response time, and in-flight count.
4. Log cache hits, misses, queue behavior, and request duration.

#### Agent notes

- Avoid overbuilding observability. Structured logs plus explicit cache metrics are enough for this assignment.
- Admin endpoints should remain simple and deterministic.

## Suggested validation sequence for agents

1. Validate the app boots after scaffold changes.
2. Validate seeded user retrieval before adding cache metrics.
3. Validate cache hit behavior before deduplication tests.
4. Validate concurrent request deduplication before adding queue behavior.
5. Validate POST queue behavior before rate limiting.
6. Validate rate limiting before final documentation cleanup.

## Decision gates

1. POST response contract:
   Keep `202 Accepted` unless there is a concrete reason to switch.
2. Cache stats reset behavior:
   Decide whether `DELETE /cache` clears only entries or also resets counters; document the choice and test it.
3. Timing metrics:
   Keep one definition of average response time and use it consistently in code, tests, and README.

## Testing plan

### Integration tests

- cached vs uncached GET behavior
- consistent 404 responses
- cache clear endpoint
- cache-status metrics
- rate limiting across both windows

### Concurrency tests

- concurrent GET requests for the same user should trigger one underlying fetch

### Async queue tests

- queued POST eventually creates a retrievable user

### Time-based tests

- cache expiration and stale sweep behavior

## Documentation expectations

The backend README should explain:

- cache strategy
- TTL and stale eviction behavior
- concurrent request deduplication
- rate-limiting approach
- async queue trade-offs
- single-process limitations

## Blockers that require re-evaluation

- If timing-sensitive tests are flaky, simplify the metric or expose configurable intervals rather than weakening the required behavior.
- If queue semantics make the reviewer story worse, consider a smaller asynchronous contract but document the trade-off explicitly.
- If the rate-limit library cannot express the intended two-window behavior clearly, keep the implementation simple and explain the approximation.

## Hurdles

- A queued POST may surprise reviewers expecting `201 Created`.
- Timing-based tests need careful control.
- It is easy to overcomplicate the queue for a task that only needs in-process behavior.

## Exit criteria

- All required endpoints exist and behave consistently.
- Cache stats are observable.
- Concurrent GET deduplication is proven by tests.
- Rate limiting and queue behavior are both documented.

## Definition of done for an agent

- The backend can be run and exercised by a reviewer using documented commands only.
- The highest-risk behaviors have automated evidence.
- The chosen semantics for caching, rate limiting, and POST queuing are explicit and stable.
