/**
 * Admin session token (plan 10, Phase 5).
 *
 * The bearer token is kept in `sessionStorage` so it is scoped to the tab and
 * cleared when the tab closes — appropriate for demo-grade operator auth. The
 * storage wrapper never throws (mirrors `lib/storage.ts`).
 */
const ADMIN_TOKEN_KEY = "getmyseat:adminToken";

export function getAdminToken(): string | null {
  try {
    return window.sessionStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAdminToken(token: string): void {
  try {
    window.sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
  } catch {
    // ignore storage errors; the in-memory token still works for this session
  }
}

export function clearAdminToken(): void {
  try {
    window.sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    // no-op
  }
}
