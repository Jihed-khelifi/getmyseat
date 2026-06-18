import type { Request, Response } from "express";

import type { UserService } from "../services/user.service.js";

export function createCacheController(userService: UserService) {
  return {
    /**
     * `DELETE /cache` — drops cached entries but preserves lifetime counters
     * (hits/misses/timings) so the hit-rate history survives a manual flush.
     */
    clearCache(_req: Request, res: Response): void {
      userService.clearCache();
      res
        .status(200)
        .json({ status: "cleared", ...userService.observability() });
    },

    /** `GET /cache-status` — full observability snapshot. */
    getStatus(_req: Request, res: Response): void {
      res.status(200).json(userService.observability());
    },
  };
}
