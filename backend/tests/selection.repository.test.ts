import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SelectionRepository } from "../src/repositories/selection.repository.js";
import type { SelectionRecord } from "../src/types/selection.js";

let dataDir: string;
let stateFile: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "getmyseat-repo-"));
  stateFile = join(dataDir, "state.json");
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

function record(visitorId: string, seatIds: string[]): SelectionRecord {
  return {
    visitorId,
    venueId: "getmyseat-arena",
    seatIds,
    updatedAt: new Date().toISOString(),
  };
}

describe("SelectionRepository durability (gate G2)", () => {
  it("survives a simulated restart via the file-backed store", () => {
    const repo = new SelectionRepository(stateFile);
    repo.save(record("v1", ["seat-1", "seat-2"]));
    repo.flush();

    // A fresh repository instance models a backend restart.
    const reloaded = new SelectionRepository(stateFile);
    expect(reloaded.get("v1")?.seatIds).toEqual(["seat-1", "seat-2"]);
  });

  it("isolates records by visitor id after reload", () => {
    const repo = new SelectionRepository(stateFile);
    repo.save(record("v1", ["seat-1"]));
    repo.save(record("v2", ["seat-9"]));
    repo.flush();

    const reloaded = new SelectionRepository(stateFile);
    expect(reloaded.get("v1")?.seatIds).toEqual(["seat-1"]);
    expect(reloaded.get("v2")?.seatIds).toEqual(["seat-9"]);
  });

  it("drops a record after delete + reload", () => {
    const repo = new SelectionRepository(stateFile);
    repo.save(record("v1", ["seat-1"]));
    repo.flush();
    repo.delete("v1");
    repo.flush();

    const reloaded = new SelectionRepository(stateFile);
    expect(reloaded.get("v1")).toBeUndefined();
  });

  it("falls back to an empty seed when the state file is corrupt", () => {
    writeFileSync(stateFile, "{ not valid json", "utf8");
    const repo = new SelectionRepository(stateFile);
    expect(repo.get("anyone")).toBeUndefined();
    // Still usable: a fresh save works on top of the seed.
    repo.save(record("v1", ["seat-1"]));
    repo.flush();
    const reloaded = new SelectionRepository(stateFile);
    expect(reloaded.get("v1")?.seatIds).toEqual(["seat-1"]);
  });
});
