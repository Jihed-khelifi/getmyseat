/**
 * Theme (dark-mode) controller (plan 09, Phase 6).
 *
 * Decision gate: follow the OS preference on first load, allow an explicit
 * override, and persist that override. The `.dark` class on <html> drives every
 * CSS-variable palette in `index.css`; the canvas reads those same variables, so
 * one toggle re-themes the map, overlays, legend, and controls together.
 */
import { readJson, writeJson } from "./storage";

export type Theme = "light" | "dark";

const THEME_KEY = "getmyseat:theme";

/** The persisted override, or `undefined` when the user has not chosen one. */
export function storedTheme(): Theme | undefined {
  const value = readJson<string>(THEME_KEY);
  return value === "light" || value === "dark" ? value : undefined;
}

/** OS preference (`prefers-color-scheme`), defaulting to light. */
export function systemTheme(): Theme {
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return "light";
}

/** The theme to use on load: stored override wins, else the OS preference. */
export function initialTheme(): Theme {
  return storedTheme() ?? systemTheme();
}

/** Reflect a theme onto <html> (adds/removes the `.dark` class). */
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
}

/** Persist + apply an explicit theme choice. */
export function setTheme(theme: Theme): void {
  writeJson(THEME_KEY, theme);
  applyTheme(theme);
}
