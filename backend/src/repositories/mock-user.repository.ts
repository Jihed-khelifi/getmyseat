import { config } from "../config.js";
import type { CreateUserInput, User } from "../types/user.js";

const SEED_USERS: readonly User[] = [
  { id: "1", name: "Ada Lovelace", email: "ada@example.com" },
  { id: "2", name: "Alan Turing", email: "alan@example.com" },
  { id: "3", name: "Grace Hopper", email: "grace@example.com" },
];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * In-memory mock user store.
 *
 * Reads are intentionally slowed by {@link config.repoReadDelayMs} so that the
 * cache layer's effect is observable. Writes are synchronous to the Map; the
 * asynchronous orchestration lives in the write-queue service, not here.
 */
export class MockUserRepository {
  private readonly users = new Map<string, User>();

  constructor(seed: readonly User[] = SEED_USERS) {
    for (const user of seed) {
      this.users.set(user.id, { ...user });
    }
  }

  /** Simulated slow read. Returns `null` when the user does not exist. */
  async findById(id: string): Promise<User | null> {
    await delay(config.repoReadDelayMs);
    const user = this.users.get(id);
    return user ? { ...user } : null;
  }

  /** Persist a user. The id is assigned by the caller before queuing. */
  async create(
    input: Required<Pick<CreateUserInput, "id">> & CreateUserInput,
  ): Promise<User> {
    const user: User = { id: input.id, name: input.name, email: input.email };
    this.users.set(user.id, user);
    return { ...user };
  }
}
