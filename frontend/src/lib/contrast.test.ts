import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";

/**
 * Mirror of the design tokens in `index.css`. Kept in sync by hand so the
 * palette can be contrast-checked without a real browser/computed styles.
 */
const light = {
  background: "hsl(0 0% 100%)",
  foreground: "hsl(222 47% 11%)",
  card: "hsl(0 0% 100%)",
  cardForeground: "hsl(222 47% 11%)",
  ring: "hsl(221 83% 53%)",
  mutedForeground: "hsl(215 16% 47%)",
  seat: {
    available: "hsl(142 71% 45%)",
    selected: "hsl(221 83% 53%)",
    reserved: "hsl(38 92% 50%)",
    sold: "hsl(215 16% 65%)",
    held: "hsl(280 65% 60%)",
  },
};

const dark = {
  background: "hsl(222 47% 7%)",
  foreground: "hsl(210 40% 98%)",
  card: "hsl(222 47% 9%)",
  cardForeground: "hsl(210 40% 98%)",
  ring: "hsl(217 91% 60%)",
  mutedForeground: "hsl(215 20% 65%)",
  seat: {
    available: "hsl(142 64% 42%)",
    selected: "hsl(217 91% 60%)",
    reserved: "hsl(38 92% 50%)",
    sold: "hsl(215 16% 40%)",
    held: "hsl(280 60% 55%)",
  },
};

describe("theme contrast (WCAG)", () => {
  for (const [name, t] of [
    ["light", light],
    ["dark", dark],
  ] as const) {
    it(`${name}: body text meets AA (>= 4.5:1)`, () => {
      expect(contrastRatio(t.foreground, t.background)).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(contrastRatio(t.cardForeground, t.card)).toBeGreaterThanOrEqual(
        4.5,
      );
    });

    it(`${name}: muted text meets AA (>= 4.5:1)`, () => {
      expect(
        contrastRatio(t.mutedForeground, t.background),
      ).toBeGreaterThanOrEqual(4.5);
    });

    it(`${name}: focus ring is a visible UI component (>= 3:1)`, () => {
      expect(contrastRatio(t.ring, t.background)).toBeGreaterThanOrEqual(3);
    });

    it(`${name}: seat-status colours are all distinct`, () => {
      const colors = Object.values(t.seat);
      // Status is never conveyed by colour alone (legend + aria + details
      // panel). Two fills may share luminance yet differ by hue, so we only
      // guard against accidental duplicate tokens here.
      expect(new Set(colors).size).toBe(colors.length);
    });
  }

  it("dark: seat fills stay visible against the dark map (>= 3:1)", () => {
    for (const color of Object.values(dark.seat)) {
      expect(contrastRatio(color, dark.card)).toBeGreaterThanOrEqual(3);
    }
  });
});
