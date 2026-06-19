import { config } from "./config.js";
import { EventRepository } from "./repositories/event.repository.js";
import { MockUserRepository } from "./repositories/mock-user.repository.js";
import { SelectionRepository } from "./repositories/selection.repository.js";
import { AdminAuthService } from "./services/admin-auth.service.js";
import { CacheService } from "./services/cache.service.js";
import { EventService } from "./services/event.service.js";
import { HoldService } from "./services/hold.service.js";
import { LogBuffer } from "./services/log-buffer.js";
import { MetricsService } from "./services/metrics.service.js";
import { RealtimeBroadcaster } from "./services/realtime.service.js";
import { RequestDeduper } from "./services/request-deduper.js";
import { SeatStatusService } from "./services/seat-status.service.js";
import { SelectionService } from "./services/selection.service.js";
import { UserWriteQueue } from "./services/user-write-queue.js";
import { UserService } from "./services/user.service.js";
import { VenueService } from "./services/venue.service.js";
import type { User } from "./types/user.js";

export interface Container {
  repo: MockUserRepository;
  cache: CacheService;
  deduper: RequestDeduper<User | null>;
  queue: UserWriteQueue;
  userService: UserService;
  /** Server-owned venue contract (geometry + price tiers). */
  venueService: VenueService;
  /** Backend-owned live seat status, seeded from the venue document. */
  seatStatus: SeatStatusService;
  /** File-backed mock DB of saved visitor selections (plan 08). */
  selectionRepo: SelectionRepository;
  /** Validates + persists visitor selections (plan 08). */
  selectionService: SelectionService;
  /** Optimistic seat-hold coordinator with auto-release TTL (plan 09, G4). */
  holds: HoldService;
  /** WebSocket broadcaster for live seat-status deltas (plan 09, G3). */
  broadcaster: RealtimeBroadcaster;
  /** Time-bucketed performance metrics recorder (plan 10, G6). */
  metrics: MetricsService;
  /** Bounded request-log + error ring buffers for `/admin/logs` (plan 10). */
  logBuffer: LogBuffer;
  /** Demo-grade admin auth: env creds → bearer token (plan 10, G5). */
  adminAuth: AdminAuthService;
  /** File-backed mock DB of event/arena metadata (plan 10, Phase 4). */
  eventRepo: EventRepository;
  /** Reads/writes event metadata + notifies subscribers (plan 10, Phase 4). */
  eventService: EventService;
  /** Release timers/resources (cache sweeper). Call on shutdown and in tests. */
  shutdown(): Promise<void>;
}

/** Composition root: instantiate and wire every singleton service. */
export function buildContainer(): Container {
  const repo = new MockUserRepository();
  const cache = new CacheService(config.cache);
  const deduper = new RequestDeduper<User | null>();
  const queue = new UserWriteQueue();
  const userService = new UserService(repo, cache, deduper, queue);

  // Plan 07 pillar 1: the venue document seeds the backend-owned seat status.
  const venueService = new VenueService();
  const seatStatus = new SeatStatusService(venueService.seedStatuses());

  // Plan 09: realtime channel + optimistic holds. The broadcaster subscribes to
  // seat-status change events, so any status mutation (holds now, admin later)
  // streams live without the mutating service knowing about WebSockets.
  const broadcaster = new RealtimeBroadcaster(() => seatStatus.getSnapshot());
  seatStatus.onChange((seatId, status) =>
    broadcaster.broadcastSeatDelta(seatId, status),
  );
  const holds = new HoldService(seatStatus, config.holdTtlMs);

  // Plan 08: file-backed selection store + validation service (now hold-aware).
  const selectionRepo = new SelectionRepository();
  const selectionService = new SelectionService(
    selectionRepo,
    venueService,
    seatStatus,
    holds,
  );

  // Plan 10: observability + admin + event management. The metrics recorder and
  // log buffer are fed by middleware/the error handler; event changes stream to
  // user-facing clients via the same broadcaster (no parallel channel).
  const metrics = new MetricsService(config.metrics);
  const logBuffer = new LogBuffer();
  const adminAuth = new AdminAuthService(config.admin);
  const eventRepo = new EventRepository();
  const eventService = new EventService(eventRepo);
  eventService.onChange((event) => broadcaster.broadcastEvent(event));

  return {
    repo,
    cache,
    deduper,
    queue,
    userService,
    venueService,
    seatStatus,
    selectionRepo,
    selectionService,
    holds,
    broadcaster,
    metrics,
    logBuffer,
    adminAuth,
    eventRepo,
    eventService,
    async shutdown(): Promise<void> {
      await queue.onIdle();
      holds.stop();
      broadcaster.close();
      selectionRepo.flush();
      eventRepo.flush();
      cache.stop();
    },
  };
}
