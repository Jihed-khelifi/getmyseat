/**
 * Realtime broadcaster (plan 09, Phase 1 — gate G3: `ws`).
 *
 * A single module that owns the `WS /ws` channel. On connect it sends the
 * current seat-status snapshot so a (re)connecting client converges, then
 * streams `seat-delta` messages as statuses change. It subscribes to the
 * seat-status store's change events (see `container.ts`) rather than being
 * called from the user/cache services, so WebSocket concerns never leak into
 * those layers.
 */
import type { Server } from "node:http";

import { WebSocketServer, type WebSocket } from "ws";

import type { EventInfo } from "../types/event.js";
import type { SeatId, SeatStatus, SeatStatusSnapshot } from "../types/venue.js";
import { logger } from "../utils/logger.js";

/** Server → client message shapes (see plan 07 / plan 09 / plan 10). */
export type ServerMessage =
  | { type: "snapshot"; statuses: SeatStatusSnapshot; at: string }
  | { type: "seat-delta"; seatId: SeatId; status: SeatStatus; at: string }
  | { type: "event-updated"; event: EventInfo; at: string };

export class RealtimeBroadcaster {
  private wss: WebSocketServer | undefined;
  private readonly clients = new Set<WebSocket>();

  /** @param getSnapshot Returns the current full seat-status snapshot. */
  constructor(private readonly getSnapshot: () => SeatStatusSnapshot) {}

  /** Attach the WebSocket server to a running HTTP server at `/ws`. */
  attach(server: Server): void {
    const wss = new WebSocketServer({ server, path: "/ws" });
    this.wss = wss;

    wss.on("connection", (socket) => {
      this.clients.add(socket);
      this.send(socket, {
        type: "snapshot",
        statuses: this.getSnapshot(),
        at: new Date().toISOString(),
      });
      // A `{ type: "subscribe", venueId }` message is accepted but ignored:
      // this deployment serves a single venue, so every client gets every delta.
      socket.on("message", () => {});
      socket.on("close", () => this.clients.delete(socket));
      socket.on("error", () => this.clients.delete(socket));
    });

    wss.on("error", (err) => logger.error({ err }, "WebSocket server error"));
  }

  /** Broadcast a single seat-status change to every connected client. */
  broadcastSeatDelta(seatId: SeatId, status: SeatStatus): void {
    this.broadcast({
      type: "seat-delta",
      seatId,
      status,
      at: new Date().toISOString(),
    });
  }

  /** Broadcast updated event/arena metadata to every connected client (plan 10). */
  broadcastEvent(event: EventInfo): void {
    this.broadcast({
      type: "event-updated",
      event,
      at: new Date().toISOString(),
    });
  }

  /** Send a message to every open client. */
  private broadcast(message: ServerMessage): void {
    const payload = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === client.OPEN) client.send(payload);
    }
  }

  /** Number of connected clients (used by the admin overview later / tests). */
  get clientCount(): number {
    return this.clients.size;
  }

  /** Close every connection and the server (shutdown / tests). */
  close(): void {
    for (const client of this.clients) client.close();
    this.clients.clear();
    this.wss?.close();
    this.wss = undefined;
  }

  private send(socket: WebSocket, message: ServerMessage): void {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }
}
