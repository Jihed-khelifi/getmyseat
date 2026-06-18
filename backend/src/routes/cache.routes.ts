import { Router } from "express";

import { createCacheController } from "../controllers/cache.controller.js";
import type { UserService } from "../services/user.service.js";

/**
 * Cache admin routes. Mounted at the app root so the paths read as
 * `DELETE /cache` and `GET /cache-status`.
 */
export function createCacheRoutes(userService: UserService): Router {
  const router = Router();
  const controller = createCacheController(userService);

  router.delete("/cache", controller.clearCache);
  router.get("/cache-status", controller.getStatus);

  return router;
}
