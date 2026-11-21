/**
 * One-color theming for the glyph-outline curve palette. The outline tool
 * exposes a SINGLE accent color; the six curve colors (outline stroke,
 * handle lines, anchor fill/border, control fill/border) are DERIVED from
 * it, so one pick re-themes the whole wireframe.
 *
 * Derivation rule: keep the base hue. The "opposite" is the same hue with
 * muted saturation pushed to the opposite lightness extreme — a dark base
 * gets light borders, a light base gets dark ones. Shades stay in the same
 * hue family between the base and its opposite, and the handle lines get a
 * clearly muted mid tone.
 */

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  let s = hex.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(s)) {
    s = s
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
  };
}

/** Perceived lightness (Rec.601 luma, 0..1) — enough to separate dark from light picks. */
export function colorLuma(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  return (
    (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255
  );
}

export function isLightColor(hex: string): boolean {
  return colorLuma(hex) >= 0.5;
}

function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function rgbToHsl(hex: string): { h: number; s: number; l: number } | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = 60 * (((g - b) / d) % 6);
  else if (max === g) h = 60 * ((b - r) / d + 2);
  else h = 60 * ((r - g) / d + 4);
  if (h < 0) h += 360;
  return { h, s, l };
}

/**
 * The derived counterpart of a base color: same hue family, saturation
 * heavily muted, lightness pushed to the far end the base is NOT in.
 * Returns the input unchanged when it cannot be parsed.
 */
export function deriveBgColor(base: string): string {
  const hsl = rgbToHsl(base);
  if (!hsl) return base;
  const dark = isLightColor(base);
  const s = Math.min(0.22, hsl.s * 0.45);
  return hslToHex(hsl.h, s, dark ? 0.08 : 0.965);
}

/** The six curve colors of the glyph-outline layer, derived from one accent. */
export interface CurveColors {
  strokeColor: string;
  handleColor: string;
  anchorFill: string;
  anchorStroke: string;
  ctrlFill: string;
  ctrlStroke: string;
}

/**
 * Curve palette from ONE accent color (see the file header). The outline
 * stroke and the anchor fill show the accent itself; both borders use the
 * opposite (guaranteed contrast against the fills); the control fill is a
 * shade between the accent and its opposite; the handle lines are a muted
 * mid tone. Returns the accent in every slot when it cannot be parsed.
 */
export function deriveCurveColors(base: string): CurveColors {
  const hsl = rgbToHsl(base);
  if (!hsl) {
    return {
      strokeColor: base,
      handleColor: base,
      anchorFill: base,
      anchorStroke: base,
      ctrlFill: base,
      ctrlStroke: base,
    };
  }
  const light = isLightColor(base);
  const opposite = deriveBgColor(base);
  const mid = hslToHex(
    hsl.h,
    Math.min(0.6, hsl.s * 0.75),
    light ? Math.max(0.18, hsl.l - 0.28) : Math.min(0.82, hsl.l + 0.28)
  );
  const handle = hslToHex(hsl.h, Math.min(0.35, hsl.s * 0.4), light ? 0.45 : 0.58);
  return {
    strokeColor: base,
    handleColor: handle,
    anchorFill: base,
    anchorStroke: opposite,
    ctrlFill: mid,
    ctrlStroke: opposite,
  };
}
