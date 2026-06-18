/**
 * Shares in-flight async work keyed by a string so that concurrent callers for
 * the same key trigger the underlying operation exactly once.
 *
 * The in-flight entry is always removed in `finally`, which prevents the map
 * from leaking promises after success or failure.
 */
export class RequestDeduper<T> {
  private readonly inFlight = new Map<string, Promise<T>>();

  run(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const promise = fn().finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, promise);
    return promise;
  }

  /** Number of distinct keys currently being fetched. */
  get inFlightCount(): number {
    return this.inFlight.size;
  }
}
