/**
 * File-backed JSON persistence substrate (plan 08, gate G2).
 *
 * A tiny, reusable durability layer that sits **behind** a repository: the
 * repository owns its in-memory data and asks this store to load it on boot and
 * persist it on change. Services never see it — persistence stays a repository
 * concern (plan 08, Phase 1 agent note).
 *
 * Durability guarantees:
 *  - **Validated on load.** The on-disk payload is parsed with a Zod schema; a
 *    missing or corrupt file falls back to the caller's seed and logs a warning
 *    (never crashes the boot path).
 *  - **Atomic writes.** Each write goes to a unique temp file then `rename`s over
 *    the target, so a crash mid-write can never leave a half-written JSON file.
 *  - **Debounced.** Frequent mutations coalesce into one write; {@link flush}
 *    forces any pending write immediately (used on shutdown and in tests).
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

import type { ZodSchema } from "zod";

import { logger } from "../utils/logger.js";

export class JsonFileStore<T> {
  private pending: ReturnType<typeof setTimeout> | undefined;

  /**
   * @param filePath   Absolute path to the JSON file to persist.
   * @param schema     Zod schema validating the persisted payload on load.
   * @param serialize  Returns the current in-memory state to write.
   * @param debounceMs Write coalescing window (ms).
   */
  constructor(
    private readonly filePath: string,
    private readonly schema: ZodSchema<T>,
    private readonly serialize: () => T,
    private readonly debounceMs = 50,
  ) {}

  /** Load + validate the persisted state, or return `seed` if absent/corrupt. */
  load(seed: T): T {
    if (!existsSync(this.filePath)) return seed;
    try {
      const raw = JSON.parse(readFileSync(this.filePath, "utf8")) as unknown;
      return this.schema.parse(raw);
    } catch (err) {
      logger.warn(
        { err, filePath: this.filePath },
        "Corrupt persisted state; falling back to seed",
      );
      return seed;
    }
  }

  /** Schedule a debounced atomic write of the current serialized state. */
  scheduleSave(): void {
    if (this.pending) clearTimeout(this.pending);
    this.pending = setTimeout(() => {
      this.pending = undefined;
      this.writeNow();
    }, this.debounceMs);
    // Do not keep the event loop alive purely for a pending flush.
    this.pending.unref?.();
  }

  /** Force any pending write to complete now (shutdown / tests). */
  flush(): void {
    if (this.pending) {
      clearTimeout(this.pending);
      this.pending = undefined;
    }
    this.writeNow();
  }

  private writeNow(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.${randomUUID()}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.serialize(), null, 2), "utf8");
      renameSync(tmp, this.filePath);
    } catch (err) {
      logger.warn(
        { err, filePath: this.filePath },
        "Failed to persist state file",
      );
    }
  }
}
