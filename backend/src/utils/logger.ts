import { pino } from "pino";

import { config } from "../config.js";

/** Shared structured logger. */
export const logger = pino({
  level: config.logLevel,
  // Pretty transport is intentionally omitted to keep the dependency set
  // small; pipe through `pino-pretty` in a shell during development if needed.
});
