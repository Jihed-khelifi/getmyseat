import { afterEach, describe, expect, it, vi } from "vitest";

import { HoldService } from "../src/services/hold.service.js";
import { SeatStatusService } from "../src/services/seat-status.service.js";

function makeStatus() {
  return new SeatStatusService([
    ["a", "available"],
    ["b", "available"],
    ["c", "sold"],
  ]);
}

describe("HoldService", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("holds added seats and releases removed ones", () => {
    const seatStatus = makeStatus();
    const holds = new HoldService(seatStatus, 1000);

    holds.syncHolds("v1", ["a", "b"]);
    expect(seatStatus.getStatus("a")).toBe("held");
    expect(seatStatus.getStatus("b")).toBe("held");
    expect([...holds.heldByVisitor("v1")].sort()).toEqual(["a", "b"]);

    holds.syncHolds("v1", ["a"]);
    expect(seatStatus.getStatus("a")).toBe("held");
    expect(seatStatus.getStatus("b")).toBe("available");

    holds.stop();
  });

  it("auto-releases a held seat after the TTL and reverts to available", () => {
    vi.useFakeTimers();
    const seatStatus = makeStatus();
    const reverts: string[] = [];
    seatStatus.onChange((id, status) => {
      if (status === "available") reverts.push(id);
    });

    const holds = new HoldService(seatStatus, 100);
    holds.syncHolds("v1", ["a"]);
    expect(seatStatus.getStatus("a")).toBe("held");

    vi.advanceTimersByTime(101);

    expect(seatStatus.getStatus("a")).toBe("available");
    expect(reverts).toContain("a");
    expect(holds.heldByVisitor("v1").size).toBe(0);
    holds.stop();
  });

  it("releaseVisitor frees every seat the visitor held", () => {
    const seatStatus = makeStatus();
    const holds = new HoldService(seatStatus, 1000);

    holds.syncHolds("v1", ["a", "b"]);
    holds.releaseVisitor("v1");

    expect(seatStatus.getStatus("a")).toBe("available");
    expect(seatStatus.getStatus("b")).toBe("available");
    expect(holds.heldByVisitor("v1").size).toBe(0);
    holds.stop();
  });
});
