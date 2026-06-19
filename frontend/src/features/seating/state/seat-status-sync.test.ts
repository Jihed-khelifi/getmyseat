import { describe, expect, it, vi } from "vitest";
import type { SeatStatus } from "../model/seat-types";
import {
  applyServerMessage,
  startSeatStatusSync,
  type SeatStatusStore,
  type SocketLike,
} from "./seat-status-sync";

function makeStore() {
  const snapshots: Array<Record<string, SeatStatus>> = [];
  const deltas: Array<[string, SeatStatus]> = [];
  const store: SeatStatusStore = {
    getState: () => ({
      applyStatusSnapshot: (s) => snapshots.push(s),
      applyStatusDelta: (id, status) => deltas.push([id, status]),
    }),
  };
  return { store, snapshots, deltas };
}

describe("applyServerMessage", () => {
  it("applies a snapshot then deltas", () => {
    const { store, snapshots, deltas } = makeStore();
    applyServerMessage(store, {
      type: "snapshot",
      statuses: { a: "available", b: "sold" },
    });
    applyServerMessage(store, {
      type: "seat-delta",
      seatId: "a",
      status: "held",
    });

    expect(snapshots).toEqual([{ a: "available", b: "sold" }]);
    expect(deltas).toEqual([["a", "held"]]);
  });

  it("ignores unknown statuses defensively", () => {
    const { store, snapshots, deltas } = makeStore();
    applyServerMessage(store, {
      type: "snapshot",
      statuses: { a: "available", bogus: "nope" },
    });
    applyServerMessage(store, {
      type: "seat-delta",
      seatId: "a",
      status: "nope",
    });
    expect(snapshots).toEqual([{ a: "available" }]);
    expect(deltas).toEqual([]);
  });
});

/** Minimal scriptable socket for the reconnect test. */
class FakeSocket implements SocketLike {
  onopen: ((ev?: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev?: unknown) => void) | null = null;
  onerror: ((ev?: unknown) => void) | null = null;
  closed = false;
  close() {
    this.closed = true;
  }
  emitMessage(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

describe("startSeatStatusSync", () => {
  it("re-snapshots on reconnect after a close", () => {
    vi.useFakeTimers();
    const { store, snapshots } = makeStore();
    const sockets: FakeSocket[] = [];
    const stop = startSeatStatusSync(store, {
      url: "ws://test/ws",
      minBackoffMs: 10,
      createSocket: () => {
        const s = new FakeSocket();
        sockets.push(s);
        return s;
      },
    });

    // First connection: open + snapshot.
    sockets[0]!.onopen?.();
    sockets[0]!.emitMessage({ type: "snapshot", statuses: { a: "available" } });
    expect(snapshots).toHaveLength(1);

    // Drop the connection; a reconnect should be scheduled.
    sockets[0]!.onclose?.();
    vi.advanceTimersByTime(20);
    expect(sockets).toHaveLength(2);

    // Reconnect re-snapshots so a client that missed deltas converges.
    sockets[1]!.emitMessage({ type: "snapshot", statuses: { a: "sold" } });
    expect(snapshots).toHaveLength(2);
    expect(snapshots[1]).toEqual({ a: "sold" });

    stop();
    expect(sockets[1]!.closed).toBe(true);
    vi.useRealTimers();
  });
});
