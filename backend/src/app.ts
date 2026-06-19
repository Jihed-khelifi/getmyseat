import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";

import type { Container } from "./container.js";
import { createErrorHandler, notFound } from "./middleware/error-handler.js";
import { createMetricsMiddleware } from "./middleware/metrics.js";
import { rateLimit } from "./middleware/rate-limit.js";
import { createAdminRoutes } from "./routes/admin.routes.js";
import { createCacheRoutes } from "./routes/cache.routes.js";
import { createEventRoutes } from "./routes/event.routes.js";
import { createSelectionsRoutes } from "./routes/selections.routes.js";
import { createUsersRoutes } from "./routes/users.routes.js";
import { createVenueRoutes } from "./routes/venue.routes.js";
import { logger } from "./utils/logger.js";

/** The subset of the {@link Container} the HTTP layer needs. */
export type AppDeps = Pick<
  Container,
  | "userService"
  | "venueService"
  | "seatStatus"
  | "selectionService"
  | "cache"
  | "selectionRepo"
  | "metrics"
  | "logBuffer"
  | "adminAuth"
  | "eventService"
  | "broadcaster"
>;

/**
 * Build the Express application. Middleware order is explicit so the request
 * flow is easy to inspect: security → parsing → logging → metrics → rate limit
 * → routes → 404 → error handler. The metrics middleware sits before the rate
 * limiter so even 429 responses are measured.
 */
export function createApp(deps: AppDeps): Express {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(pinoHttp({ logger }));

  // Plan 10: record per-request timing/outcome before any route can short-circuit.
  app.use(createMetricsMiddleware(deps.metrics, deps.logBuffer));

  // Rate limiting guards every route below it.
  app.use(rateLimit);

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.use("/users", createUsersRoutes(deps.userService));
  app.use("/", createCacheRoutes(deps.userService));
  app.use("/", createVenueRoutes(deps.venueService, deps.seatStatus));
  app.use("/selections", createSelectionsRoutes(deps.selectionService));
  app.use("/", createEventRoutes(deps.eventService));
  app.use(
    "/admin",
    createAdminRoutes({
      auth: deps.adminAuth,
      metrics: deps.metrics,
      logBuffer: deps.logBuffer,
      cache: deps.cache,
      seatStatus: deps.seatStatus,
      selectionRepo: deps.selectionRepo,
      eventService: deps.eventService,
      broadcaster: deps.broadcaster,
    }),
  );

  app.use(notFound);
  app.use(createErrorHandler(deps.logBuffer));

  return app;
}
