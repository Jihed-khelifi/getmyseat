import { Router } from "express";

import {
  createUserSchema,
  createUsersController,
  userParamsSchema,
} from "../controllers/users.controller.js";
import { validate } from "../middleware/validate.js";
import type { UserService } from "../services/user.service.js";

export function createUsersRoutes(userService: UserService): Router {
  const router = Router();
  const controller = createUsersController(userService);

  router.get(
    "/:id",
    validate({ params: userParamsSchema }),
    controller.getUser,
  );
  router.post("/", validate({ body: createUserSchema }), controller.createUser);

  return router;
}
