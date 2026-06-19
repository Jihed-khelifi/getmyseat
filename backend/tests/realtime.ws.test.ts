import { mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Express } from "express";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";

// Relax limits and isolate the file-backed state before any module loads.
process.env.LOG_LEVEL = "silent";
process.env.RATE_BURST_POINTS = "10000";
process.env.RATE_SUSTAINED_POINTS = "10000";

const dataDir = mkdtempSync(join(tmpdir(), "getmyseat-ws-"));
process.env.GETMYSEAT_STATE_FILE = join(dataDir, "state.json");

const { createApp } = await import("../src/app.js");
const { buildContainer } = await import("../src/container.js");

let container: ReturnType<typeof buildContainer>;
let server: Server;
let port: number;

type Json = Record<string, unknown>;

/**
 * A WebSocket wrapper that buffers every message from the moment it connects, so
 * tests never race the server's immediate snapshot or fast deltas.
 */
class Client {
  private readonly buffer: Json[] = [];
  private waiter: ((msg: Json) => void) | undefined;
  constructor(readonly socket: WebSocket) {
    socket.on("message", (data) => {
      const msg = JSON.parse(data.toString()) as Json;
      if (this.waiter) {
        const w = this.waiter;
        this.waiter = undefined;
        w(msg);
      } else {
        this.buffer.push(msg);
      }
    });
  }
  next(): Promise<Json> {
    const queued = this.buffer.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise((resolve) => {
      this.waiter = resolve;
    });
  }
  close(): void {
    this.socket.close();
  }
}

function open(): Promise<Client> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  return new Promise((resolve) =>
    socket.once("open", () => resolve(new Client(socket))),
  );
}

beforeEach(async () => {
  container = buildContainer();
  const app: Express = createApp(container);
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  container.broadcaster.attach(server);
  port = (server.address() as AddressInfo).port;
});

afterEach(async () => {
  await new Promise((r) => server.close(r));
  await container.shutdown();
});

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe("WS /ws", () => {
  it("sends a status snapshot on connect", async () => {
    const client = await open();
    const msg = await client.next();
    expect(msg.type).toBe("snapshot");
    expect(Object.keys(msg.statuses as object).length).toBe(
      container.venueService.listSeats().length,
    );
    client.close();
  });

  it("broadcasts a seat-delta after a status change", async () => {
    const client = await open();
    await client.next(); // discard the snapshot

    const seat = container.venueService
      .listSeats()
      .find((s) => s.status === "available")!;

    const deltaPromise = client.next();
    container.seatStatus.setStatus(seat.id, "sold");
    const delta = await deltaPromise;

    expect(delta).toMatchObject({
      type: "seat-delta",
      seatId: seat.id,
      status: "sold",
    });
    client.close();
  });

  it("broadcasts a held delta when a visitor selection holds a seat", async () => {
    const client = await open();
    await client.next(); // discard the snapshot

    const seat = container.venueService
      .listSeats()
      .find((s) => s.status === "available")!;
    const venueId = container.venueService.getDocument().venueId;

    const deltaPromise = client.next();
    container.selectionService.saveSelection("ws-visitor", {
      venueId,
      seatIds: [seat.id],
    });
    const delta = await deltaPromise;

    expect(delta).toMatchObject({
      type: "seat-delta",
      seatId: seat.id,
      status: "held",
    });
    client.close();
  });

  it("broadcasts an event-updated signal when the event changes (plan 10)", async () => {
    const client = await open();
    await client.next(); // discard the snapshot

    const updatePromise = client.next();
    container.eventService.updateEvent({
      name: "Live Event",
      date: "2026-07-01",
      description: "Updated via admin.",
      arenaLocation: "Main Arena",
      updates: ["Now on sale"],
    });
    const message = await updatePromise;

    expect(message).toMatchObject({ type: "event-updated" });
    expect((message.event as { name: string }).name).toBe("Live Event");
    client.close();
  });
});
