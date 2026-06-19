/**
 * WCAG contrast helpers (plan 09, Phase 6 dark-mode verification).
 *
 * Small, dependency-free colour math so the theme palettes can be contrast-
 * checked in a unit test rather than only by eye. Supports the two formats the
 * design tokens use: `#rrggbb` hex and `hsl(H S% L%)`.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Parse `#rrggbb` or `hsl(H S% L%)` into 0–255 RGB. */
export function parseColor(input: string): Rgb {
  const value = input.trim();
  if (value.startsWith("#")) return parseHex(value);
  if (value.startsWith("hsl")) return parseHsl(value);
  throw new Error(`Unsupported color: ${input}`);
}

function parseHex(hex: string): Rgb {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function parseHsl(input: string): Rgb {
  const match = input.match(
    /hsl\(\s*([\d.]+)[, ]+([\d.]+)%[, ]+([\d.]+)%\s*\)/i,
  );
  if (!match) throw new Error(`Unsupported hsl color: ${input}`);
  const h = Number(match[1]);
  const s = Number(match[2]) / 100;
  const l = Number(match[3]) / 100;
  return hslToRgb(h, s, l);
}

export function hslToRgb(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

/** WCAG relative luminance of an sRGB colour. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const lin = (channel: number) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two colours (1–21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(parseColor(a));
  const lb = relativeLuminance(parseColor(b));
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}
