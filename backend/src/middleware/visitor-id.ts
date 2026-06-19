/**
 * Visitor identity middleware (plan 08, Phase 3 — gate G1).
 *
 * Resolves an opaque per-browser handle: it trusts a well-formed `X-Visitor-Id`
 * header when present, otherwise mints a fresh UUID. The resolved id is attached
 * as `req.visitorId` and echoed back in the response header so a first-time
 * client can persist the minted handle.
 *
 * The id is treated as opaque (it only addresses a stored record); the format
 * check exists purely to reject obviously malformed/oversized values before they
 * become a map key.
 */
import { randomUUID } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

const VISITOR_HEADER = "X-Visitor-Id";

/** Accept UUID-like or url-safe tokens of a sane length; reject anything else. */
const VISITOR_ID_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;

export function visitorId(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const provided = req.header(VISITOR_HEADER);
  const id =
    provided && VISITOR_ID_PATTERN.test(provided) ? provided : randomUUID();

  req.visitorId = id;
  res.set(VISITOR_HEADER, id);
  next();
}
