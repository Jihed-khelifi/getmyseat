/**
 * Live seat-status sync over WebSocket (plan 09, Phase 2 — gate G3: `ws`).
 *
 * Connects to `WS /ws`, applies the snapshot the server sends on (re)connect,
 * then streams `seat-delta` messages into the store. A thin reconnect/backoff
 * loop is implemented here rather than pulling in `socket.io`. Re-snapshotting on
 * every (re)connect means a client that missed deltas while disconnected always
 * converges — stale deltas can never accumulate.
 *
 * The transport is injectable (`createSocket`) so the message handling and
 * reconnect logic can be unit-tested without a real socket.
 */
import type { SeatStatus } from "../model/seat-types";
import { markPulse } from "../render/pulse-registry";
import type { EventInfo } from "@/lib/api";

/** Server → client messages (mirror of the backend `ServerMessage`). */
export type ServerMessage =
  | { type: "snapshot"; statuses: Record<string, string>; at?: string }
  | { type: "seat-delta"; seatId: string; status: string; at?: string }
  | { type: "event-updated"; event: EventInfo; at?: string };

/** Minimal store surface this module needs. */
export interface SeatStatusStore {
  getState(): {
    applyStatusSnapshot: (snapshot: Record<string, SeatStatus>) => void;
    applyStatusDelta: (seatId: string, status: SeatStatus) => void;
  };
}

/** The subset of the browser `WebSocket` API used here (keeps tests simple). */
export interface SocketLike {
  onopen: ((ev?: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev?: unknown) => void) | null;
  onerror: ((ev?: unknown) => void) | null;
  close(): void;
}

export interface SeatStatusSyncDeps {
  url?: string;
  createSocket?: (url: string) => SocketLike;
  /** Reconnect backoff bounds (ms). */
  minBackoffMs?: number;
  maxBackoffMs?: number;
  onError?: (err: unknown) => void;
  /** Called when the server broadcasts updated event metadata (plan 10). */
  onEvent?: (event: EventInfo) => void;
}

const VALID_STATUSES: ReadonlySet<string> = new Set([
  "available",
  "reserved",
  "sold",
  "held",
]);

/** Resolve the WebSocket URL: explicit env override, else same-origin `/ws`. */
function defaultWsUrl(): string {
  const env = import.meta.env.VITE_WS_URL as string | undefined;
  if (env) return env;
  if (typeof location === "undefined") return "ws://localhost:3001/ws";
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws`;
}

/**
 * Apply one parsed server message to the store. Exported for unit testing the
 * snapshot-then-delta behavior without a socket. Unknown statuses are ignored.
 * Event-updated messages are routed to the optional `onEvent` callback (plan 10).
 */
export function applyServerMessage(
  store: SeatStatusStore,
  message: ServerMessage,
  onEvent?: (event: EventInfo) => void,
): void {
  const state = store.getState();
  if (message.type === "snapshot") {
    const clean: Record<string, SeatStatus> = {};
    for (const [seatId, status] of Object.entries(message.statuses)) {
      if (VALID_STATUSES.has(status)) clean[seatId] = status as SeatStatus;
    }
    state.applyStatusSnapshot(clean);
    return;
  }
  if (message.type === "event-updated") {
    onEvent?.(message.event);
    return;
  }
  if (message.type === "seat-delta" && VALID_STATUSES.has(message.status)) {
    markPulse(message.seatId); // brief canvas pulse for the change
    state.applyStatusDelta(message.seatId, message.status as SeatStatus);
  }
}

/**
 * Start the live status sync. Returns a stop function that closes the socket and
 * cancels any pending reconnect.
 */
export function startSeatStatusSync(
  store: SeatStatusStore,
  deps: SeatStatusSyncDeps = {},
): () => void {
  const url = deps.url ?? defaultWsUrl();
  const createSocket =
    deps.createSocket ??
    ((u: string) => new WebSocket(u) as unknown as SocketLike);
  const minBackoff = deps.minBackoffMs ?? 500;
  const maxBackoff = deps.maxBackoffMs ?? 10_000;

  let socket: SocketLike | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let backoff = minBackoff;
  let stopped = false;

  const connect = () => {
    if (stopped) return;
    let s: SocketLike;
    try {
      s = createSocket(url);
    } catch (err) {
      deps.onError?.(err);
      scheduleReconnect();
      return;
    }
    socket = s;

    s.onopen = () => {
      backoff = minBackoff; // reset after a successful connection
    };
    s.onmessage = (ev) => {
      try {
        const message = JSON.parse(String(ev.data)) as ServerMessage;
        applyServerMessage(store, message, deps.onEvent);
      } catch (err) {
        deps.onError?.(err);
      }
    };
    s.onerror = (err) => deps.onError?.(err);
    s.onclose = () => {
      if (!stopped) scheduleReconnect();
    };
  };

  const scheduleReconnect = () => {
    if (stopped) return;
    reconnectTimer = setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, maxBackoff);
  };

  connect();

  return () => {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    try {
      socket?.close();
    } catch {
      // ignore close errors during teardown
    }
  };
}
