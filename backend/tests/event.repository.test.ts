import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { EventRepository } from "../src/repositories/event.repository.js";

let dataDir: string;
let eventFile: string;

beforeAll(() => {
  dataDir = mkdtempSync(join(tmpdir(), "getmyseat-event-"));
  eventFile = join(dataDir, "event.json");
});

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe("EventRepository", () => {
  it("returns a seed event before any edit", () => {
    const repo = new EventRepository(eventFile);
    const event = repo.get();
    expect(typeof event.name).toBe("string");
    expect(Array.isArray(event.updates)).toBe(true);
  });

  it("persists an edit across a restart (gate G2)", () => {
    const first = new EventRepository(eventFile);
    first.save({
      name: "Persisted Event",
      date: "2026-08-01",
      description: "Survives restart.",
      arenaLocation: "East Arena",
      updates: ["First update"],
      updatedAt: new Date().toISOString(),
    });
    first.flush();

    // A fresh repository (simulating a restart) reloads from the same file.
    const second = new EventRepository(eventFile);
    const reloaded = second.get();
    expect(reloaded.name).toBe("Persisted Event");
    expect(reloaded.arenaLocation).toBe("East Arena");
    expect(reloaded.updates).toEqual(["First update"]);
  });
});
