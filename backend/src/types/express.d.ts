/**
 * Express request augmentation (plan 08, Phase 3).
 *
 * The visitor-id middleware attaches an opaque per-browser handle to every
 * selection request; downstream handlers read it as `req.visitorId`.
 */
import "express";

declare global {
  namespace Express {
    interface Request {
      /** Opaque visitor handle resolved by the visitor-id middleware (gate G1). */
      visitorId?: string;
    }
  }
}

export {};
