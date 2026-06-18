import type { Request, Response } from "express";
import { z } from "zod";

import type { UserService } from "../services/user.service.js";

/** `GET /users/:id` route-param schema. */
export const userParamsSchema = z.object({
  id: z.string().min(1, "id is required"),
});

/** `POST /users` body schema. Strict enough to keep the mock store clean. */
export const createUserSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1, "name is required"),
  email: z.string().trim().email("valid email is required"),
});

export function createUsersController(userService: UserService) {
  return {
    async getUser(req: Request, res: Response): Promise<void> {
      const { id } = req.params as z.infer<typeof userParamsSchema>;
      const { user, cacheHit } = await userService.getUser(id);

      if (!user) {
        res.status(404).json({ error: `User '${id}' not found` });
        return;
      }

      res.set("X-Cache", cacheHit ? "HIT" : "MISS");
      res.status(200).json(user);
    },

    createUser(req: Request, res: Response): void {
      const body = req.body as z.infer<typeof createUserSchema>;
      const queued = userService.queueCreateUser(body);

      // 202 Accepted: the write is queued, not yet persisted. The returned
      // metadata lets a reviewer confirm the asynchronous contract and poll
      // `GET /users/:id` for the resolved id.
      res.status(202).json({ status: "queued", ...queued });
    },
  };
}
