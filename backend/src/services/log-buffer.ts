/**
 * Bounded log/error ring buffers (plan 10, Phase 3).
 *
 * The admin surface exposes "recent structured logs and a recent-errors list".
 * Rather than re-reading `pino`'s output, the request-completion middleware and
 * the central error handler push compact records here. Both lists are bounded
 * (ring buffers) so memory stays flat regardless of uptime — an unbounded list
 * would leak (plan 10 hurdle).
 */

/** A compact request-completion log line. */
export interface RequestLogEntry {
  at: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  cacheOutcome?: "HIT" | "MISS";
}

/** A compact recorded error. */
export interface ErrorLogEntry {
  at: string;
  method?: string;
  path?: string;
  message: string;
}

export interface LogBufferOptions {
  /** Max request log lines retained. */
  maxRequests?: number;
  /** Max errors retained. */
  maxErrors?: number;
}

export class LogBuffer {
  private readonly requests: RequestLogEntry[] = [];
  private readonly errors: ErrorLogEntry[] = [];
  private readonly maxRequests: number;
  private readonly maxErrors: number;

  constructor(options: LogBufferOptions = {}) {
    this.maxRequests = Math.max(1, options.maxRequests ?? 200);
    this.maxErrors = Math.max(1, options.maxErrors ?? 100);
  }

  recordRequest(entry: RequestLogEntry): void {
    this.requests.push(entry);
    if (this.requests.length > this.maxRequests) this.requests.shift();
  }

  recordError(entry: ErrorLogEntry): void {
    this.errors.push(entry);
    if (this.errors.length > this.maxErrors) this.errors.shift();
  }

  /** Most-recent-first request log lines (bounded by `limit`). */
  recentRequests(limit = 50): RequestLogEntry[] {
    return this.requests.slice(-limit).reverse();
  }

  /** Most-recent-first errors (bounded by `limit`). */
  recentErrors(limit = 50): ErrorLogEntry[] {
    return this.errors.slice(-limit).reverse();
  }
}
