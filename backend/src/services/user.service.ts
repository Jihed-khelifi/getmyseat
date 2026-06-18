import { randomUUID } from "node:crypto";

import type { MockUserRepository } from "../repositories/mock-user.repository.js";
import type { CreateUserInput, QueuedWrite, User } from "../types/user.js";
import { logger } from "../utils/logger.js";
import type { CacheService, CacheStats } from "./cache.service.js";
import type { RequestDeduper } from "./request-deduper.js";
import type { QueueStats, UserWriteQueue } from "./user-write-queue.js";

export interface GetUserResult {
  user: User | null;
  cacheHit: boolean;
}

export interface Observability extends CacheStats {
  /** Distinct user ids currently being fetched from the repository. */
  inFlight: number;
  queue: QueueStats;
}

/**
 * Orchestrates the read and write paths.
 *
 * Read: cache → (on miss) deduped repository fetch → cache prime. Write:
 * synchronously assign an id, enqueue the create, and prime the cache when the
 * task runs. Request handlers stay thin; all of this coordination lives here.
 */
export class UserService {
  constructor(
    private readonly repo: MockUserRepository,
    private readonly cache: CacheService,
    private readonly deduper: RequestDeduper<User | null>,
    private readonly queue: UserWriteQueue,
  ) {}

  async getUser(id: string): Promise<GetUserResult> {
    const start = performance.now();

    const cached = this.cache.get<User>(id);
    if (cached) {
      this.cache.recordHit();
      this.cache.recordResponseTime(performance.now() - start);
      return { user: cached, cacheHit: true };
    }

    this.cache.recordMiss();
    // Concurrent misses for the same id share a single repository fetch.
    const user = await this.deduper.run(id, () => this.repo.findById(id));

    // Only successful lookups are cached; missing users are not cached so a
    // later create becomes visible without waiting for a TTL to expire.
    if (user) this.cache.set(id, user);

    this.cache.recordResponseTime(performance.now() - start);
    return { user, cacheHit: false };
  }

  /**
   * Validate-and-queue a user creation. Returns immediately with the assigned
   * id and queue position; the actual write runs asynchronously.
   *
   * Cache behavior: on completion the new user is *primed* into the cache so the
   * first subsequent read is a hit, making queue completion observable.
   */
  queueCreateUser(input: CreateUserInput): QueuedWrite {
    const id = input.id ?? randomUUID();
    const user: User = { id, name: input.name, email: input.email };

    const { position } = this.queue.enqueue(async () => {
      await this.repo.create(user);
      this.cache.set(id, user);
      logger.info({ id }, "Queued user created and cache primed");
    });

    return { id, queuedAt: new Date().toISOString(), position };
  }

  clearCache(): void {
    this.cache.clear();
  }

  observability(): Observability {
    return {
      ...this.cache.stats(),
      inFlight: this.deduper.inFlightCount,
      queue: this.queue.stats(),
    };
  }
}
