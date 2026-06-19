import { beforeEach, describe, expect, it } from "vitest";
import { applyTheme, initialTheme, setTheme, storedTheme } from "./theme";

const THEME_KEY = "getmyseat:theme";

describe("theme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("returns no stored override by default", () => {
    expect(storedTheme()).toBeUndefined();
  });

  it("persists and reflects an explicit choice", () => {
    setTheme("dark");
    expect(storedTheme()).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    setTheme("light");
    expect(storedTheme()).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("prefers a stored override over the OS preference", () => {
    localStorage.setItem(THEME_KEY, JSON.stringify("dark"));
    expect(initialTheme()).toBe("dark");
  });

  it("ignores a corrupt stored value", () => {
    localStorage.setItem(THEME_KEY, JSON.stringify("rainbow"));
    expect(storedTheme()).toBeUndefined();
  });

  it("applyTheme toggles the dark class without persisting", () => {
    applyTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(storedTheme()).toBeUndefined();
  });
});
