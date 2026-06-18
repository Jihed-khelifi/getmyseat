import { config } from "./config.js";
import { MockUserRepository } from "./repositories/mock-user.repository.js";
import { CacheService } from "./services/cache.service.js";
import { RequestDeduper } from "./services/request-deduper.js";
import { UserWriteQueue } from "./services/user-write-queue.js";
import { UserService } from "./services/user.service.js";
import type { User } from "./types/user.js";

export interface Container {
  repo: MockUserRepository;
  cache: CacheService;
  deduper: RequestDeduper<User | null>;
  queue: UserWriteQueue;
  userService: UserService;
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

  return {
    repo,
    cache,
    deduper,
    queue,
    userService,
    async shutdown(): Promise<void> {
      await queue.onIdle();
      cache.stop();
    },
  };
}
