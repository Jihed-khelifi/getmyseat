/**
 * Tiny, safe localStorage wrapper.
 *
 * Ownership (plan 02): the only module that touches `window.localStorage`.
 * Reads never throw — a corrupt or unavailable store yields `undefined` so the
 * app degrades gracefully (e.g. private mode, quota errors).
 */

export function readJson<T>(key: string): T | undefined {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return undefined;
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota/availability errors; persistence is best-effort.
  }
}

export function removeKey(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // no-op
  }
}
