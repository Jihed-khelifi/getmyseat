/**
 * Event repository (plan 10, Phase 4 — the "mock DB" for event/arena metadata).
 *
 * Keeps the single event record in memory and persists it through
 * {@link JsonFileStore} (gate G2 = file-backed JSON) so operator edits survive a
 * backend restart. A separate file from the selection store keeps the two
 * concerns independent; the durability mechanics stay hidden behind this
 * repository so the service never knows the storage is file-backed.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import type { EventInfo } from "../types/event.js";
import { JsonFileStore } from "./json-file-store.js";

const eventInfoSchema = z.object({
  name: z.string(),
  date: z.string(),
  description: z.string(),
  arenaLocation: z.string(),
  updates: z.array(z.string()),
  updatedAt: z.string().min(1),
});

/** Top-level persisted shape; versioned for safe future migrations. */
const eventFileSchema = z.object({
  version: z.literal(1),
  event: eventInfoSchema,
});

type EventFile = z.infer<typeof eventFileSchema>;

const moduleDir = dirname(fileURLToPath(import.meta.url));

/** Default file-backed event path, overridable via env (used by tests). */
function defaultEventPath(): string {
  return (
    process.env.GETMYSEAT_EVENT_FILE ??
    resolve(moduleDir, "../../.data/event.json")
  );
}

/** Seed event shown before an operator makes the first edit. */
function seedEvent(): EventInfo {
  return {
    name: "Rome Arena Event",
    date: "TBC",
    description:
      "Come see the gladiators battle it out in the grand arena of Rome! This is a once-in-a-lifetime experience you won't want to miss.",
    arenaLocation: "Main Arena",
    updates: [],
    updatedAt: new Date(0).toISOString(),
  };
}

export class EventRepository {
  private current: EventInfo;
  private readonly store: JsonFileStore<EventFile>;

  /** @param filePath Override the persisted file location (tests). */
  constructor(filePath: string = defaultEventPath()) {
    this.store = new JsonFileStore<EventFile>(
      filePath,
      eventFileSchema,
      () => ({
        version: 1,
        event: this.current,
      }),
    );
    const seed: EventFile = { version: 1, event: seedEvent() };
    this.current = this.store.load(seed).event;
  }

  /** The current event metadata. */
  get(): EventInfo {
    return { ...this.current, updates: [...this.current.updates] };
  }

  /** Replace the event metadata and schedule a persist. */
  save(event: EventInfo): EventInfo {
    this.current = { ...event, updates: [...event.updates] };
    this.store.scheduleSave();
    return this.get();
  }

  /** Force any pending write to disk (shutdown / tests). */
  flush(): void {
    this.store.flush();
  }
}
