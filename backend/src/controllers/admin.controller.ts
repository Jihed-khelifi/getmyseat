import type { Request, Response } from "express";
import { z } from "zod";

import type { CacheService } from "../services/cache.service.js";
import type { AdminAuthService } from "../services/admin-auth.service.js";
import type { EventService } from "../services/event.service.js";
import type { LogBuffer } from "../services/log-buffer.js";
import type { MetricsService } from "../services/metrics.service.js";
import type { RealtimeBroadcaster } from "../services/realtime.service.js";
import type { SeatStatusService } from "../services/seat-status.service.js";
import type { SelectionRepository } from "../repositories/selection.repository.js";

/** `POST /admin/login` body. */
export const loginSchema = z.object({
  email: z.string().min(1, "email is required"),
  password: z.string().min(1, "password is required"),
});

/** `PUT /admin/event` body — display fields only (no operational data). */
export const eventInputSchema = z.object({
  name: z.string().min(1, "name is required").max(200),
  date: z.string().max(200),
  description: z.string().max(2000),
  arenaLocation: z.string().max(200),
  updates: z.array(z.string().max(500)).max(50),
});

export interface AdminControllerDeps {
  auth: AdminAuthService;
  metrics: MetricsService;
  logBuffer: LogBuffer;
  cache: CacheService;
  seatStatus: SeatStatusService;
  selectionRepo: SelectionRepository;
  eventService: EventService;
  broadcaster: RealtimeBroadcaster;
}

/**
 * Admin controllers (plan 10, Phases 2–4). Thin handlers: every figure is read
 * from an existing service (cache metrics, seat status, the metrics recorder,
 * the log buffer) rather than recomputed, so `/admin` reflects the same numbers
 * the rest of the system reports.
 */
export function createAdminController(deps: AdminControllerDeps) {
  return {
    /** `POST /admin/login` — exchange credentials for a bearer token. */
    login(req: Request, res: Response): void {
      const { email, password } = req.body as z.infer<typeof loginSchema>;
      const result = deps.auth.login(email, password);
      if (!result) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }
      res.status(200).json(result);
    },

    /** `GET /admin/overview` — selection counts, seat stats, cache perf, errors. */
    overview(_req: Request, res: Response): void {
      const summary = deps.metrics.getSummary();
      res.status(200).json({
        selections: {
          visitors: deps.selectionRepo.count(),
          totalSeats: deps.selectionRepo.totalSelectedSeats(),
        },
        seats: deps.seatStatus.countByStatus(),
        cache: deps.cache.stats(),
        traffic: {
          requests: summary.requests,
          errors: summary.errors,
          errorRate: summary.errorRate,
          averageResponseTimeMs: summary.averageResponseTimeMs,
        },
        realtimeClients: deps.broadcaster.clientCount,
      });
    },

    /** `GET /admin/metrics` — the time-bucketed performance series. */
    metrics(_req: Request, res: Response): void {
      res.status(200).json({
        bucketSeries: deps.metrics.getSeries(),
        summary: deps.metrics.getSummary(),
      });
    },

    /** `GET /admin/logs` — recent structured logs + recent errors (bounded). */
    logs(_req: Request, res: Response): void {
      res.status(200).json({
        requests: deps.logBuffer.recentRequests(),
        errors: deps.logBuffer.recentErrors(),
      });
    },

    /** `PUT /admin/event` — update event metadata + broadcast `event-updated`. */
    updateEvent(req: Request, res: Response): void {
      const input = req.body as z.infer<typeof eventInputSchema>;
      const event = deps.eventService.updateEvent(input);
      res.status(200).json(event);
    },
  };
}
