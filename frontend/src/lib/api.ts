/**
 * Typed backend API client (plan 08, Phase 5).
 *
 * The single place the frontend talks to the backend. It is framework-agnostic
 * (no React) so it can be unit-tested directly, and it owns two cross-cutting
 * concerns:
 *  - the opaque visitor handle (gate G1: a client-generated UUID kept in
 *    `localStorage` and sent on every request as `X-Visitor-Id`), and
 *  - error normalization (non-2xx responses throw an {@link ApiError}).
 *
 * Base URL comes from `VITE_API_URL`; in dev it falls back to `/api`, which the
 * Vite dev server proxies to the backend (see `vite.config.ts`).
 */
import { readJson, writeJson } from "./storage";

const VISITOR_ID_KEY = "getmyseat:visitorId";
const VISITOR_HEADER = "X-Visitor-Id";

const BASE_URL = (import.meta.env.VITE_API_URL ?? "/api").replace(/\/$/, "");

/** Server-stored selection record (mirror of the backend `SelectionRecord`). */
export interface SelectionRecord {
  visitorId: string;
  /** `null` when the visitor has no stored record yet. */
  venueId: string | null;
  seatIds: string[];
  /** `null` when no record exists; otherwise an ISO timestamp. */
  updatedAt: string | null;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** A pluggable UUID source so tests stay deterministic. */
function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID.
  return `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** The stable per-browser visitor handle, generated + persisted on first use. */
export function getVisitorId(): string {
  const existing = readJson<string>(VISITOR_ID_KEY);
  if (typeof existing === "string" && existing.length > 0) return existing;
  const fresh = uuid();
  writeJson(VISITOR_ID_KEY, fresh);
  return fresh;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      [VISITOR_HEADER]: getVisitorId(),
      ...init?.headers,
    },
  });

  // Persist a server-minted handle if one comes back (first-time visitors).
  const returned = res.headers.get(VISITOR_HEADER);
  if (returned) writeJson(VISITOR_ID_KEY, returned);

  if (res.status === 204) return undefined as T;

  const body: unknown = await res.json().catch(() => undefined);
  if (!res.ok) {
    const message =
      (body as { error?: string } | undefined)?.error ??
      `Request failed (${res.status})`;
    throw new ApiError(res.status, message, body);
  }
  return body as T;
}

/** `GET /selections/me` — this visitor's saved selection. */
export function getSelection(): Promise<SelectionRecord> {
  return request<SelectionRecord>("/selections/me");
}

/** `PUT /selections/me` — replace this visitor's selection. */
export function saveSelection(
  venueId: string,
  seatIds: string[],
): Promise<SelectionRecord> {
  return request<SelectionRecord>("/selections/me", {
    method: "PUT",
    body: JSON.stringify({ venueId, seatIds }),
  });
}

/** `DELETE /selections/me` — clear this visitor's selection. */
export function clearSelection(): Promise<void> {
  return request<void>("/selections/me", { method: "DELETE" });
}

/** Live seat-status snapshot keyed by seat id (mirror of the backend type). */
export type SeatStatusSnapshot = Record<string, string>;

/** `GET /seats/status` — current backend-owned seat-status snapshot (plan 09). */
export function getSeatStatus(): Promise<SeatStatusSnapshot> {
  return request<SeatStatusSnapshot>("/seats/status");
}

/** Public event/arena metadata (mirror of the backend `EventInfo`, plan 10). */
export interface EventInfo {
  name: string;
  date: string;
  description: string;
  arenaLocation: string;
  updates: string[];
  updatedAt: string;
}

/** Editable subset of {@link EventInfo} accepted by `PUT /admin/event`. */
export type EventInput = Omit<EventInfo, "updatedAt">;

/** `GET /event` — public event metadata for the user-facing header (plan 10). */
export function getEvent(): Promise<EventInfo> {
  return request<EventInfo>("/event");
}

/** Result of a successful admin login (mirror of the backend shape). */
export interface AdminLoginResult {
  token: string;
  expiresAt: string;
}

export interface AdminOverview {
  selections: { visitors: number; totalSeats: number };
  seats: Record<string, number>;
  cache: {
    size: number;
    hits: number;
    misses: number;
    hitRate: number;
    averageResponseTimeMs: number;
    stalePurges: number;
    clears: number;
  };
  traffic: {
    requests: number;
    errors: number;
    errorRate: number;
    averageResponseTimeMs: number;
  };
  realtimeClients: number;
}

export interface MetricsBucket {
  at: string;
  requests: number;
  errors: number;
  clientErrors: number;
  errorRate: number;
  averageResponseTimeMs: number;
  maxResponseTimeMs: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;
}

export interface AdminMetrics {
  bucketSeries: MetricsBucket[];
  summary: {
    requests: number;
    errors: number;
    errorRate: number;
    averageResponseTimeMs: number;
    cacheHits: number;
    cacheMisses: number;
    cacheHitRate: number;
  };
}

export interface AdminLogs {
  requests: Array<{
    at: string;
    method: string;
    path: string;
    statusCode: number;
    durationMs: number;
    cacheOutcome?: "HIT" | "MISS";
  }>;
  errors: Array<{
    at: string;
    method?: string;
    path?: string;
    message: string;
  }>;
}

/** `POST /admin/login` — exchange credentials for a bearer token (plan 10). */
export function adminLogin(
  email: string,
  password: string,
): Promise<AdminLoginResult> {
  return request<AdminLoginResult>("/admin/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

/** Authorization header for an admin bearer token. */
function adminHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/** `GET /admin/overview` — operational stats (admin-only). */
export function getAdminOverview(token: string): Promise<AdminOverview> {
  return request<AdminOverview>("/admin/overview", {
    headers: adminHeaders(token),
  });
}

/** `GET /admin/metrics` — time-bucketed performance series (admin-only). */
export function getAdminMetrics(token: string): Promise<AdminMetrics> {
  return request<AdminMetrics>("/admin/metrics", {
    headers: adminHeaders(token),
  });
}

/** `GET /admin/logs` — recent logs + errors (admin-only). */
export function getAdminLogs(token: string): Promise<AdminLogs> {
  return request<AdminLogs>("/admin/logs", { headers: adminHeaders(token) });
}

/** `PUT /admin/event` — update event metadata (admin-only). */
export function updateEvent(
  token: string,
  input: EventInput,
): Promise<EventInfo> {
  return request<EventInfo>("/admin/event", {
    method: "PUT",
    headers: adminHeaders(token),
    body: JSON.stringify(input),
  });
}
