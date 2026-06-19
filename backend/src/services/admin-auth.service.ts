/**
 * Admin authentication (plan 10, Phase 2 — gate G5: demo-grade auth).
 *
 * A single operator credential pair (from env) is exchanged for an **opaque,
 * in-memory bearer token**. There is deliberately no user store, no refresh
 * token, and no RBAC — this is demonstration auth, documented loudly as such in
 * the README. Credentials and tokens are never logged.
 *
 * Security choices:
 *  - The credential comparison is constant-time (`crypto.timingSafeEqual`) so a
 *    failed login leaks no timing signal about which field was wrong.
 *  - Tokens are 256 bits of CSPRNG output and expire after a configured TTL.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";

export interface AdminCredentials {
  email: string;
  password: string;
  /** Issued-token lifetime (ms). */
  tokenTtlMs: number;
}

export interface AdminLoginResult {
  token: string;
  /** ISO-8601 expiry timestamp. */
  expiresAt: string;
}

/** Constant-time string equality that does not short-circuit on length. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) {
    // Still run a comparison to keep timing uniform, then fail.
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

export class AdminAuthService {
  /** token → expiry epoch ms. */
  private readonly tokens = new Map<string, number>();

  constructor(
    private readonly creds: AdminCredentials,
    private readonly now: () => number = Date.now,
  ) {}

  /** Validate credentials; returns a fresh token on success, `null` otherwise. */
  login(email: string, password: string): AdminLoginResult | null {
    const ok =
      safeEqual(email, this.creds.email) &&
      safeEqual(password, this.creds.password);
    if (!ok) return null;

    const token = randomBytes(32).toString("hex");
    const expiry = this.now() + this.creds.tokenTtlMs;
    this.tokens.set(token, expiry);
    return { token, expiresAt: new Date(expiry).toISOString() };
  }

  /** Whether a bearer token is currently valid (and prune it if expired). */
  verify(token: string | undefined): boolean {
    if (!token) return false;
    const expiry = this.tokens.get(token);
    if (expiry === undefined) return false;
    if (this.now() >= expiry) {
      this.tokens.delete(token);
      return false;
    }
    return true;
  }

  /** Invalidate a token (logout). */
  revoke(token: string): void {
    this.tokens.delete(token);
  }
}
