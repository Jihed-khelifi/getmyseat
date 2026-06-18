import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";

import { errorHandler, notFound } from "./middleware/error-handler.js";
import { rateLimit } from "./middleware/rate-limit.js";
import { createCacheRoutes } from "./routes/cache.routes.js";
import { createUsersRoutes } from "./routes/users.routes.js";
import type { UserService } from "./services/user.service.js";
import { logger } from "./utils/logger.js";

/**
 * Build the Express application. Middleware order is explicit so the request
 * flow is easy to inspect: security → parsing → logging → rate limit → routes
 * → 404 → error handler.
 */
export function createApp(userService: UserService): Express {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(pinoHttp({ logger }));

  // Rate limiting guards every route below it.
  app.use(rateLimit);

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.use("/users", createUsersRoutes(userService));
  app.use("/", createCacheRoutes(userService));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
