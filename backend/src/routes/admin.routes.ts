import { Router } from "express";

import {
  createAdminController,
  eventInputSchema,
  loginSchema,
  type AdminControllerDeps,
} from "../controllers/admin.controller.js";
import { validate } from "../middleware/validate.js";
import {
  adminLoginRateLimit,
  requireAdmin,
} from "../middleware/require-admin.js";

/**
 * Admin routes (plan 10, Phases 2–4). `POST /admin/login` is public but
 * rate-limited; every other route is guarded by the single `requireAdmin`
 * middleware (the credential/token check lives in exactly one place).
 */
export function createAdminRoutes(deps: AdminControllerDeps): Router {
  const router = Router();
  const controller = createAdminController(deps);

  router.post(
    "/login",
    adminLoginRateLimit,
    validate({ body: loginSchema }),
    controller.login,
  );

  // Everything below requires a valid bearer token.
  router.use(requireAdmin(deps.auth));

  router.get("/overview", controller.overview);
  router.get("/metrics", controller.metrics);
  router.get("/logs", controller.logs);
  router.put(
    "/event",
    validate({ body: eventInputSchema }),
    controller.updateEvent,
  );

  return router;
}
