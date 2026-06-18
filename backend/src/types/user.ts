/** Core domain type for a user record. */
export interface User {
  id: string;
  name: string;
  email: string;
}

/** Validated input accepted by the write path before an id is assigned. */
export interface CreateUserInput {
  id?: string;
  name: string;
  email: string;
}

/** Metadata returned to the client when a write is queued (202 Accepted). */
export interface QueuedWrite {
  id: string;
  queuedAt: string;
  /** Number of tasks ahead of this one when it was enqueued. */
  position: number;
}
