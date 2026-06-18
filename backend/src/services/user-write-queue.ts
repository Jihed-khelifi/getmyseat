import PQueue from "p-queue";

import { logger } from "../utils/logger.js";

export interface QueueStats {
  /** Tasks waiting to run. */
  size: number;
  /** Tasks currently running. */
  pending: number;
}

/**
 * Thin wrapper around `p-queue` for in-process asynchronous write handling.
 *
 * The queue only orchestrates *when* a write runs (serialized, one at a time);
 * *how* the user is stored remains the repository's concern.
 */
export class UserWriteQueue {
  private readonly queue = new PQueue({ concurrency: 1 });

  /**
   * Enqueue a task and return its position at enqueue time. Failures are logged
   * rather than thrown, because the HTTP request has already returned `202`.
   */
  enqueue(task: () => Promise<void>): { position: number } {
    const position = this.queue.size + this.queue.pending;
    void this.queue.add(task).catch((err: unknown) => {
      logger.error({ err }, "Queued write task failed");
    });
    return { position };
  }

  stats(): QueueStats {
    return { size: this.queue.size, pending: this.queue.pending };
  }

  /** Resolve once the queue has drained (used by tests). */
  onIdle(): Promise<void> {
    return this.queue.onIdle();
  }
}
