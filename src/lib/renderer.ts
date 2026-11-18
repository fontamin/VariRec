// Renders a single animation frame to a <canvas> by composing an inline SVG
// that embeds the variable font (base64) and applies `font-variation-settings`.
// SVG <text> supports variable-font axes through CSS, and keeping the font
// embedded as a data URI means the canvas never gets tainted, so we can call
// getImageData() and create VideoFrames from it during recording.
//
// The optional overlay draws each variation axis as a single compact row:
// the axis name sits inline BEFORE the track (so toggling it never changes
// the stack height), min/max labels flank the track, and an optional
// Material-style value pill rides ON the thumb (also height-neutral). An
// optional CSS `font-variation-settings` code line can be appended. The
// overlay stack is positioned relative to the text block (with a
// configurable gap), so it follows the text wherever vertical alignment
// places it. Identical geometry is reused by the DOM live preview so preview
// and export look the same.

import { applyEasing, type EasingType } from "./easing";
import type {
  AxisMoveMode,
  TextDirection,
  ThumbShape,
  VAlign,
} from "./studio-store-types";

// Characters from RTL scripts (Hebrew, Arabic, Syriac, Thaana, …) — used by
// the "auto" text-direction rule (first strong character, like dir=auto).
const RTL_CHAR_RE = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

// Resolve the base text direction for rendering. "auto" follows the standard
// first-strong rule: scan for the first character with a strong direction —
// an RTL-script letter wins, otherwise the first regular letter means LTR
// (digits and punctuation are neutral and skipped). Export and preview use
// the same rule so both always agree.
export function resolveTextDirection(
  text: string,
  setting: TextDirection
): "ltr" | "rtl" {
  if (setting !== "auto") return setting;
  for (const ch of text) {
    if (RTL_CHAR_RE.test(ch)) return "rtl";
    if (/\p{L}/u.test(ch)) return "ltr";
  }
  return "ltr";
}

export interface AxisValue {
  tag: string;
  value: number;
}

export interface AxisDisplayInfo {
  tag: string;
  name: string;
  value: number;
  min: number;
  max: number;
}

export interface OverlayConfig {
  showSliders: boolean; // the slider block itself (track + thumb + panel)
  showName: boolean;
  showTag: boolean;
  showMinMax: boolean; // axis min & max labels at the two ends of the track
  showLiveValue: boolean; // instantaneous value number riding above the thumb
  showCss: boolean;
  valueDecimals: number; // decimal places shown for the live value number
  centered: boolean; // center the slider stack horizontally
  nameGap: number; // gap between axis name and slider, in em of overlay font
  cssGap: number; // gap between slider panel and CSS line, in em
  textGap: number; // gap between the overlay stack and the text block, in em
  font: string; // css font-family stack for overlay text
  bold: boolean; // draw overlay text in bold (700)
  fontScale: number; // overlay TEXT size multiplier (1 = default)
  trackLenPct: number; // slider track length as % of canvas width (20..100)
  color: string; // overlay text/fill color
  bgColor: string; // panel background color
  bgOpacity: number; // 0..1 (0 = transparent panel)
  scale: number; // size multiplier
  position: "top" | "bottom"; // slider stack relative to the text block
  thumbScale: number; // thumb size multiplier
  thumbShape: ThumbShape;
  axes: AxisDisplayInfo[];
}

export interface RenderConfig {
  text: string;
  fontBase64: string;
  fontCssFormat: string; // 'truetype' | 'opentype' | 'woff' | 'woff2'
  fontMime: string; // 'font/ttf' | 'font/otf' | 'font/woff' | 'font/woff2'
  variation: AxisValue[];
  fontSize: number;
  textColor: string;
  bgColor: string;
  width: number;
  height: number;
  letterSpacing: number;
  lineHeight: number;
  align: "left" | "center" | "right";
  vAlign: VAlign;
  direction: "ltr" | "rtl"; // resolved base direction of the text block
  overlay?: OverlayConfig | null;
}

export function buildVariationString(variation: AxisValue[]): string {
  if (variation.length === 0) return "normal";
  return variation
    .map((a) => `'${a.tag}' ${roundForCss(a.value)}`)
    .join(", ");
}

export function buildCssFontVariationSettings(
  variation: AxisValue[],
  decimals = 2
): string {
  if (variation.length === 0) return "normal";
  return variation
    .map((a) => `"${a.tag}" ${formatValue(a.value, decimals)}`)
    .join(", ");
}

function roundForCss(n: number): string {
  return parseFloat(n.toFixed(2)).toString();
}

export function fmtNum(n: number): string {
  return parseFloat(n.toFixed(1)).toString();
}

// Fixed-decimal formatting for the live value number riding on the thumb.
export function formatValue(n: number, decimals: number): string {
  const d = Math.min(4, Math.max(0, Math.round(decimals)));
  return n.toFixed(d);
}

export function hexToRgba(hex: string, alpha: number): string {
  let h = hex.replace("#", "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}

// Pick black or white for text drawn on top of a filled shape (the value
// pill on the thumb) so the number stays readable on any slider color.
export function contrastFor(hex: string): string {
  let h = hex.replace("#", "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#000000" : "#ffffff";
}

// Corner radius (px) for the value pill, echoing the chosen thumb shape.
export function pillRadius(shape: ThumbShape, minDim: number): number {
  switch (shape) {
    case "square":
      return 0;
    case "rounded":
      return Math.round(minDim * 0.42);
    case "diamond":
      return Math.round(minDim * 0.18);
    default:
      return Math.round(minDim / 2); // circle → stadium
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function round2(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

// ─── Text block ────────────────────────────────────────────────────────────
// Shared estimate of where the text block sits inside the canvas. Used by the
// SVG frame renderer (for vertical alignment) and by the overlay geometry
// (for the "distance from text" positioning). Mirrors the 24px side margins.

export interface TextBlock {
  top: number;
  bottom: number;
  height: number;
}

export function computeTextBlock(
  height: number,
  fontSize: number,
  lineHeight: number,
  lineCount: number,
  vAlign: VAlign
): TextBlock {
  const h = Math.max(1, lineCount) * fontSize * lineHeight;
  const margin = 24;
  if (vAlign === "top") return { top: margin, bottom: margin + h, height: h };
  if (vAlign === "bottom")
    return { top: height - margin - h, bottom: height - margin, height: h };
  const top = (height - h) / 2;
  return { top, bottom: top + h, height: h };
}

export interface OverlayMetrics {
  pad: number;
  innerPad: number;
  panelRx: number;
  fontPx: number;
  minMaxFont: number;
  nameW: number; // inline axis-name width (0 when the name is hidden)
  nameGapPx: number; // horizontal gap: inline name → min label / track
  textGapPx: number;
  pillOn: boolean; // value-pill mode (number rides ON the thumb)
  pillFont: number;
  pillPadX: number;
  pillPadY: number;
  pillW: number;
  pillH: number;
  pillTextFill: string; // auto-contrast color for the number inside the pill
  trackRowH: number;
  trackH: number;
  thumbR: number;
  thumbD: number;
  trackW: number;
  flankGap: number;
  minMaxLabelW: number;
  blockW: number; // content width of one axis block (panel inner width)
  pillBuffer: number; // extra horizontal room (px) so the value pill can overhang the track ends without leaving the panel
  panelW: number;
  panelH: number;
  panelX: number;
  panelY: number;
  axisGap: number;
  trackLeft: number; // track x inside the block content (after name + min)
  cssOn: boolean;
  cssFontPx: number;
  cssBarX: number;
  cssBarY: number;
  cssBarW: number;
  cssBarH: number;
  cssGapPx: number;
  stackH: number; // total height of the overlay stack (panel + css line)
}

function cssCodeText(o: OverlayConfig): string {
  // Fixed decimals (same setting as the slider's live value) so the string
  // keeps a constant width across frames — a centred code line would
  // otherwise jitter left/right every time the integer-part length changed.
  return `font-variation-settings: ${buildCssFontVariationSettings(
    o.axes.map((a) => ({ tag: a.tag, value: a.value })),
    o.valueDecimals
  )};`;
}

// The widest the CSS code string can get for the current axes. The rendered
// value strings vary in length from frame to frame — measuring against the
// widest variant keeps the CSS line's font size and bar geometry CONSTANT
// across frames (otherwise the bar visibly pulses while the animation runs).
function cssCodeWidestText(o: OverlayConfig): string {
  const dec = o.valueDecimals;
  const parts = o.axes.map((a) => {
    const widest = [a.min, a.max]
      .map((v) => formatValue(v, dec))
      .reduce((p, c) => (c.length > p.length ? c : p), "");
    return `"${a.tag}" ${widest}`;
  });
  return `font-variation-settings: ${parts.join(", ")};`;
}

function minMaxChars(o: OverlayConfig): number {
  let chars = 0;
  for (const a of o.axes) {
    const len = Math.max(fmtNum(a.min).length, fmtNum(a.max).length);
    if (len > chars) chars = len;
  }
  return Math.max(chars, 3);
}

// Shared geometry for the overlay — used by both the SVG frame renderer and
// the DOM live preview so both look identical. All values are in canvas px.
export function computeOverlayMetrics(
  width: number,
  height: number,
  o: OverlayConfig,
  textBlock: TextBlock
): OverlayMetrics {
  const s = o.scale;
  // The slider block only exists when the "slider" toggle is on; the name,
  // min–max labels and the value pill are decorations that live inside it.
  const slidersOn = o.showSliders && o.axes.length > 0;
  // Overlay TEXT size multiplier (independent of the panel/thumb scale so the
  // font can be grown without moving every other piece of geometry).
  const fs = Math.min(3, Math.max(0.5, o.fontScale || 1));
  const fontPx = Math.max(9, Math.round(width * 0.016 * s * fs));
  const pad = Math.max(8, Math.round(width * 0.014 * s));
  const innerPad = Math.max(6, Math.round(pad * 0.85));
  const panelRx = Math.max(6, Math.round(innerPad * 0.9));
  const trackH = Math.max(3, Math.round(fontPx * 0.3));
  const thumbR = Math.max(
    3,
    Math.round(fontPx * 0.48 * Math.min(3, Math.max(0.4, o.thumbScale)))
  );
  const thumbD = thumbR * 2;
  const minMaxFont = Math.max(8, Math.round(fontPx * 0.78));

  // Inline axis name — drawn BEFORE the track on the same row, so toggling
  // the name never changes the height of the slider stack.
  const hasName = slidersOn && (o.showName || o.showTag) && o.axes.length > 0;
  let nameChars = 0;
  if (hasName) {
    for (const a of o.axes) {
      let len = 0;
      if (o.showName) len += a.name.length;
      if (o.showTag) len += a.tag.length + 2;
      if (len > nameChars) nameChars = len;
    }
  }
  const nameW = hasName ? Math.ceil(nameChars * 0.62 * fontPx) : 0;
  // Horizontal gap between the inline name and the min label / track.
  const nameGapPx = Math.round(
    Math.min(Math.max(o.nameGap, 0), 4) * fontPx
  );
  const textGapPx = Math.round(
    Math.min(Math.max(o.textGap, 0), 12) * fontPx
  );

  // Value pill riding ON the thumb (Material-style label). It replaces the
  // thumb and adds NO extra row, so the stack height stays identical whether
  // the value number is on or off. Width uses the widest value string the
  // axis can ever show (min/max at the chosen decimals) so the pill geometry
  // is frame-stable — no pulsing mid-animation.
  const pillOn = slidersOn && o.showLiveValue;
  const pillFont = Math.max(8, Math.round(fontPx * 0.8));
  const pillPadX = Math.max(6, Math.round(pillFont * 0.55));
  const pillPadY = Math.max(3, Math.round(pillFont * 0.3));
  let valueChars = 3;
  for (const a of o.axes) {
    const len = Math.max(
      formatValue(a.min, o.valueDecimals).length,
      formatValue(a.max, o.valueDecimals).length
    );
    if (len > valueChars) valueChars = len;
  }
  const pillTextW = Math.ceil(valueChars * 0.62 * pillFont);
  const pillH = Math.max(thumbD, Math.round(pillFont * 1.5) + pillPadY * 2);
  const pillW = Math.max(
    thumbD + Math.round(thumbD * 0.4),
    pillTextW + pillPadX * 2
  );
  const pillTextFill = contrastFor(o.color);
  // The value pill rides ON the thumb and its centre follows the value across
  // the FULL track (no end-clamping), so it overhangs the track ends by up to
  // half its width. Reserve that much room on both ends of the row so the
  // pill always stays inside the panel while the thumb keeps moving.
  const pillBuffer = pillOn ? Math.ceil(pillW / 2) : 0;

  const minMaxLabelW =
    slidersOn && o.showMinMax
      ? Math.ceil(minMaxChars(o) * 0.62 * minMaxFont)
      : 0;
  // Base flank gap. When the value pill rides ON the thumb AND min/max labels
  // are shown, the pill overhangs the track ends by half its width — reserve
  // that much room (plus a breath) so the pill never lands on the numbers at
  // the extremes. The extra flank room comes out of the track width, which is
  // exactly the "make the sliders a bit smaller" behaviour we want here.
  const baseFlankGap = Math.max(4, Math.round(fontPx * 0.5));
  const pillFlankGap = pillOn
    ? Math.ceil(pillW / 2 + fontPx * 0.35)
    : baseFlankGap;
  const flankGap =
    minMaxLabelW > 0 ? Math.max(baseFlankGap, pillFlankGap) : baseFlankGap;
  const trackRowH = Math.max(
    Math.round(thumbD * 1.25),
    Math.round(minMaxFont * 1.35)
  );

  const nameSpan = nameW + (hasName ? nameGapPx : 0);
  const trackFlank = minMaxLabelW > 0 ? minMaxLabelW * 2 + flankGap * 2 : 0;
  const availForTrack =
    width - pad * 2 - innerPad * 2 - nameSpan - trackFlank - pillBuffer * 2;
  // Track length as a percentage of the canvas width (20..100). The default
  // of 30 reproduces the previous fixed width*0.3 behaviour; the clamp to
  // availForTrack keeps the row inside the panel no matter what.
  const lenPct = Math.min(100, Math.max(20, o.trackLenPct || 30)) / 100;
  const trackW = Math.max(
    fontPx * 6,
    Math.min(
      Math.round(width * lenPct * s),
      Math.max(availForTrack, fontPx * 6)
    )
  );

  const trackRowW = pillBuffer * 2 + nameSpan + trackFlank + trackW;
  const maxBlock = Math.max(fontPx * 6, width - pad * 2 - innerPad * 2);
  const blockW = Math.min(maxBlock, trackRowW);
  const panelW = blockW + innerPad * 2;

  const axisGap = Math.round(fontPx * 1.2);
  const rowStack = trackRowH; // one compact row per axis
  const n = o.axes.length;
  const panelH =
    slidersOn && n > 0 ? innerPad * 2 + rowStack * n + axisGap * (n - 1) : 0;

  // CSS code line — auto-shrink font if the string is longer than the bar.
  // The width estimate uses the widest possible value strings so the font
  // size (and therefore the bar geometry) stays constant across frames.
  const cssText = cssCodeText(o);
  const cssWidest = cssCodeWidestText(o);
  const availCss = Math.max(40, width - pad * 2 - innerPad * 2);
  const cssEst = 0.62 * fontPx * Math.max(1, cssWidest.length);
  const cssFontPx =
    cssEst > availCss
      ? Math.max(
          8,
          Math.floor(availCss / (0.62 * Math.max(1, cssWidest.length)))
        )
      : fontPx;
  const cssTextW = Math.ceil(cssWidest.length * 0.62 * cssFontPx);
  const cssBarH = o.showCss ? Math.round(cssFontPx * 1.5 + innerPad * 1.1) : 0;
  const cssGapPx = Math.round(
    Math.min(Math.max(o.cssGap, 0), 4) * fontPx
  );
  const cssOn = o.showCss && cssBarH > 0;
  const cssBarW = cssOn
    ? Math.min(
        width - pad * 2,
        o.centered ? cssTextW + innerPad * 2 : width - pad * 2
      )
    : 0;

  // ── Vertical placement ────────────────────────────────────────────────
  // The whole stack (slider panel + CSS line) hugs the text block with
  // textGapPx between them, clamped so it never leaves the canvas.
  const stackH = panelH + (slidersOn && cssOn ? cssGapPx + cssBarH : cssOn ? cssBarH : 0);
  const minTop = pad;
  const maxTop = Math.max(minTop, height - pad - stackH);
  let panelY = 0;
  if (o.position === "top") {
    panelY = Math.round(
      Math.min(maxTop, Math.max(minTop, textBlock.top - textGapPx - stackH))
    );
  } else {
    panelY = Math.round(
      Math.min(maxTop, Math.max(minTop, textBlock.bottom + textGapPx))
    );
  }
  const cssBarY = cssOn
    ? Math.round(
        Math.min(
          height - pad - cssBarH,
          Math.max(
            pad,
            slidersOn ? panelY + panelH + cssGapPx : panelY
          )
        )
      )
    : 0;

  const panelX = o.centered
    ? Math.max(pad, Math.round((width - panelW) / 2))
    : pad;
  const cssBarX = cssOn
    ? o.centered
      ? Math.max(pad, Math.round((width - cssBarW) / 2))
      : pad
    : 0;

  const trackLeft =
    pillBuffer + nameSpan + (minMaxLabelW > 0 ? minMaxLabelW + flankGap : 0);

  return {
    pad,
    innerPad,
    panelRx,
    fontPx,
    minMaxFont,
    nameW,
    nameGapPx,
    textGapPx,
    pillOn,
    pillFont,
    pillPadX,
    pillPadY,
    pillW,
    pillH,
    pillTextFill,
    trackRowH,
    trackH,
    thumbR,
    thumbD,
    trackW,
    flankGap,
    minMaxLabelW,
    blockW,
    pillBuffer,
    panelW,
    panelH,
    panelX,
    panelY,
    axisGap,
    trackLeft,
    cssOn,
    cssFontPx,
    cssBarX,
    cssBarY,
    cssBarW,
    cssBarH,
    cssGapPx,
    stackH,
  };
}

// Thumb marker in every supported shape, drawn centered on (cx, cy).
function thumbSvg(
  shape: ThumbShape,
  cx: number,
  cy: number,
  r: number,
  fill: string
): string {
  const d = r * 2;
  const x = round2(cx - r);
  const y = round2(cy - r);
  switch (shape) {
    case "square":
      return `<rect x="${x}" y="${y}" width="${d}" height="${d}" fill="${fill}"/>`;
    case "rounded":
      return `<rect x="${x}" y="${y}" width="${d}" height="${d}" rx="${round2(r * 0.42)}" fill="${fill}"/>`;
    case "diamond":
      return `<rect x="${x}" y="${y}" width="${d}" height="${d}" rx="${round2(r * 0.18)}" fill="${fill}" transform="rotate(45 ${round2(cx)} ${round2(cy)})"/>`;
    default:
      return `<circle cx="${round2(cx)}" cy="${round2(cy)}" r="${r}" fill="${fill}"/>`;
  }
}

function buildOverlaySvg(
  o: OverlayConfig,
  width: number,
  height: number,
  textBlock: TextBlock
): string {
  const m = computeOverlayMetrics(width, height, o, textBlock);
  const parts: string[] = [];
  const fontAttr = `font-family="${escapeAttr(o.font)}"`;
  const weightAttr = o.bold ? ' font-weight="700"' : "";
  const fill = escapeAttr(o.color);
  if (o.showSliders && m.panelH > 0) {
    if (o.bgOpacity > 0) {
      parts.push(
        `<rect x="${m.panelX}" y="${m.panelY}" width="${m.panelW}" height="${m.panelH}" rx="${m.panelRx}" fill="${escapeAttr(o.bgColor)}" fill-opacity="${round2(o.bgOpacity)}"/>`
      );
    }
    const contentX = m.panelX + m.innerPad;

    o.axes.forEach((a, i) => {
      const y = m.panelY + m.innerPad + i * (m.trackRowH + m.axisGap);
      const cy = y + m.trackRowH / 2;
      const t = clamp01((a.value - a.min) / (a.max - a.min || 1));
      const trackX = contentX + m.trackLeft;
      const fillW = t * m.trackW;
      const thumbCx = trackX + fillW;

      // Inline axis name, BEFORE the track (same row → constant stack height).
      // Right-aligned inside its fixed-width slot, so every name ends at the
      // SAME distance from the start of its own track.
      if (m.nameW > 0) {
        const label = [
          o.showName ? escapeXml(a.name) : "",
          o.showTag ? `(${escapeXml(a.tag)})` : "",
        ]
          .filter(Boolean)
          .join(" ");
        parts.push(
          `<text x="${round2(contentX + m.pillBuffer + m.nameW)}" y="${round2(cy + m.fontPx * 0.35)}" text-anchor="end" fill="${fill}" ${fontAttr}${weightAttr} font-size="${m.fontPx}">${label}</text>`
        );
      }

      // Min–max labels flanking the track.
      if (m.minMaxLabelW > 0) {
        const lb = cy + m.minMaxFont * 0.35;
        parts.push(
          `<text x="${round2(trackX - m.flankGap)}" y="${round2(lb)}" text-anchor="end" fill="${fill}" fill-opacity="0.75" ${fontAttr}${weightAttr} font-size="${m.minMaxFont}">${fmtNum(a.min)}</text>`
        );
        parts.push(
          `<text x="${round2(trackX + m.trackW + m.flankGap)}" y="${round2(lb)}" text-anchor="start" fill="${fill}" fill-opacity="0.75" ${fontAttr}${weightAttr} font-size="${m.minMaxFont}">${fmtNum(a.max)}</text>`
        );
      }

      parts.push(
        `<rect x="${trackX}" y="${round2(cy - m.trackH / 2)}" width="${m.trackW}" height="${m.trackH}" rx="${m.trackH / 2}" fill="${fill}" fill-opacity="0.22"/>`
      );
      if (fillW > 0) {
        parts.push(
          `<rect x="${trackX}" y="${round2(cy - m.trackH / 2)}" width="${round2(fillW)}" height="${m.trackH}" rx="${m.trackH / 2}" fill="${fill}" fill-opacity="0.7"/>`
        );
      }

      // Value pill riding ON the thumb (replaces it). The pill centre follows
      // the value across the FULL track — no end-clamping — so the thumb is
      // always moving whenever the number changes. It may overhang the track
      // ends; the row's pillBuffer reserves room for that inside the panel.
      // The centre is snapped to whole canvas pixels so it rasterises
      // identically frame-to-frame instead of shimmering sub-pixel.
      if (m.pillOn) {
        const pcx = Math.round(thumbCx);
        const prx = pillRadius(o.thumbShape, Math.min(m.pillW, m.pillH));
        parts.push(
          `<rect x="${round2(pcx - m.pillW / 2)}" y="${round2(cy - m.pillH / 2)}" width="${round2(m.pillW)}" height="${round2(m.pillH)}" rx="${round2(prx)}" fill="${fill}"/>`
        );
        parts.push(
          `<text x="${pcx}" y="${round2(cy + m.pillFont * 0.35)}" text-anchor="middle" fill="${m.pillTextFill}" ${fontAttr}${weightAttr} font-size="${m.pillFont}">${formatValue(a.value, o.valueDecimals)}</text>`
        );
      } else {
        parts.push(thumbSvg(o.thumbShape, thumbCx, cy, m.thumbR, fill));
      }
    });
  }

  if (m.cssOn) {
    const cssText = cssCodeText(o);
    if (o.bgOpacity > 0) {
      parts.push(
        `<rect x="${m.cssBarX}" y="${m.cssBarY}" width="${m.cssBarW}" height="${m.cssBarH}" rx="${m.panelRx}" fill="${escapeAttr(o.bgColor)}" fill-opacity="${round2(o.bgOpacity)}"/>`
      );
    }
    const anchor = o.centered ? "middle" : "start";
    const tx = o.centered
      ? m.cssBarX + m.cssBarW / 2
      : m.cssBarX + m.innerPad;
    parts.push(
      `<text x="${round2(tx)}" y="${round2(m.cssBarY + m.cssBarH / 2 + m.cssFontPx * 0.36)}" text-anchor="${anchor}" fill="${fill}" ${fontAttr}${weightAttr} font-size="${m.cssFontPx}" xml:space="preserve">${escapeXml(cssText)}</text>`
    );
  }

  return parts.join("");
}

export function buildSvgString(cfg: RenderConfig): string {
  const {
    text,
    fontBase64,
    fontCssFormat,
    fontMime,
    variation,
    fontSize,
    textColor,
    bgColor,
    width,
    height,
    letterSpacing,
    lineHeight,
    align,
    vAlign,
    direction,
    overlay,
  } = cfg;

  const lines = text.length ? text.split("\n") : [" "];
  const textBlock = computeTextBlock(
    height,
    fontSize,
    lineHeight,
    lines.length,
    vAlign
  );
  const top = textBlock.top;
  // Horizontal alignment is PHYSICAL (left/center/right stay where they are
  // on screen regardless of text direction). SVG text-anchor is LOGICAL —
  // with an RTL base direction start/end swap sides — so map the physical
  // alignment onto the matching logical anchor. anchorX stays physical.
  const anchorX =
    align === "center" ? width / 2 : align === "right" ? width - 24 : 24;
  const physAnchor =
    align === "center" ? "middle" : align === "right" ? "end" : "start";
  const anchor =
    direction === "rtl" && physAnchor === "start"
      ? "end"
      : direction === "rtl" && physAnchor === "end"
        ? "start"
        : physAnchor;
  // Establish the RTL base direction on the text element. Per SVG 1.1 the
  // direction property needs unicode-bidi to open an embedding. LTR needs no
  // style — it is the SVG default.
  const dirStyle =
    direction === "rtl"
      ? " direction: rtl; unicode-bidi: embed;"
      : "";

  const tspans = lines
    .map((line, i) => {
      const y = top + i * fontSize * lineHeight + fontSize * 0.78;
      return `<tspan x="${anchorX}" y="${round2(y)}">${escapeXml(line) || "&#8203;"}</tspan>`;
    })
    .join("");

  const variationCss = buildVariationString(variation);
  const letterSpacingCss =
    letterSpacing !== 0 ? `letter-spacing: ${letterSpacing}px;` : "";

  const overlaySvg =
    overlay &&
    ((overlay.showSliders && overlay.axes.length > 0) || overlay.showCss)
      ? buildOverlaySvg(overlay, width, height, textBlock)
      : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs>
<style>
@font-face { font-family: 'VFStudio'; src: url(data:${escapeAttr(fontMime)};base64,${fontBase64}) format('${escapeAttr(fontCssFormat)}'); }
.vftxt { font-family: 'VFStudio', system-ui, sans-serif; font-size: ${fontSize}px; fill: ${escapeAttr(textColor)}; font-variation-settings: ${variationCss}; ${letterSpacingCss} }
</style>
</defs>
<rect x="0" y="0" width="${width}" height="${height}" fill="${escapeAttr(bgColor)}"/>
<text class="vftxt" text-anchor="${anchor}"${dirStyle ? ` style="${dirStyle}"` : ""}>${tspans}</text>
${overlaySvg}</svg>`;
}

// Loads an SVG string into an Image element and resolves when the image
// itself has loaded. NOTE: neither `onload` nor `decode()` guarantees that
// web fonts INSIDE the SVG document are ready — Blink parses/sanitises
// @font-face data off the main thread and, with the default font-display
// behaviour, paints the text INVISIBLE (FOIT) until that work lands. That
// race is what made exported frames lose their text on some frames.
async function loadSvgImage(
  svg: string,
  width: number,
  height: number
): Promise<HTMLImageElement> {
  const img = new Image(width, height);
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to render SVG frame."));
  });
  if (typeof img.decode === "function") {
    try {
      await img.decode();
    } catch {
      // Already loaded via onload — safe to continue with what we have.
    }
  }
  return img;
}

// ─── Frame rasterisation ───────────────────────────────────────────────────
// Every exported frame is a brand-new SVG document, so the browser re-runs
// the embedded font's asynchronous load for EVERY frame. Capturing a frame
// while that load is still in flight bakes a text-less frame into the
// export. renderFrameToCanvas therefore settles each image before capture:
//
//  1. Settle poll — draw the image into a tiny probe canvas repeatedly and
//     compare snapshots. A frame is accepted only after at least
//     MIN_SETTLE_TICKS event-loop yields AND the probe stopped changing,
//     i.e. any pending font/raster work inside the SVG document has landed.
//  2. Ink backstop — when the frame should contain visible text, the text
//     band is sampled: if it is still uniformly the background colour, the
//     glyphs have not painted yet; keep yielding (bounded) until ink shows
//     up. This catches slow font loads the poll window could miss.

const SETTLE_PROBE_W = 96;
const MIN_SETTLE_TICKS = 2;
const MAX_SETTLE_POLLS = 24;
const MAX_TEXT_RETRIES = 12;
const INK_THRESHOLD = 10;

// Tiny reusable offscreen canvases keyed by size — the probes are cleared
// and redrawn per use, so sharing one per size keeps rasterisation cheap.
const probeCtxs = new Map<string, CanvasRenderingContext2D>();

function getProbeCtx(w: number, h: number): CanvasRenderingContext2D | null {
  const key = `${w}x${h}`;
  let ctx = probeCtxs.get(key);
  if (!ctx) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    ctx = c.getContext("2d", { willReadFrequently: true });
    if (ctx) probeCtxs.set(key, ctx);
  }
  return ctx ?? null;
}

function yieldTick(): Promise<void> {
  // A macrotask boundary: lets the browser run pending font-loading work
  // for the SVG image document before we rasterise again.
  return new Promise((r) => setTimeout(r, 0));
}

function probeSnapshot(
  img: HTMLImageElement,
  cfgW: number,
  cfgH: number
): Uint8ClampedArray | null {
  if (!(cfgW > 0) || !(cfgH > 0)) return null;
  const h = Math.max(1, Math.round((SETTLE_PROBE_W * cfgH) / cfgW));
  const ctx = getProbeCtx(SETTLE_PROBE_W, h);
  if (!ctx) return null;
  ctx.clearRect(0, 0, SETTLE_PROBE_W, h);
  ctx.drawImage(img, 0, 0, SETTLE_PROBE_W, h);
  try {
    return ctx.getImageData(0, 0, SETTLE_PROBE_W, h).data;
  } catch {
    return null;
  }
}

function samePixels(
  a: Uint8ClampedArray | null,
  b: Uint8ClampedArray | null
): boolean {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function parseHexColor(hex: string): Rgb | null {
  let h = hex.trim().replace("#", "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

// True when the given band of the rasterised frame contains any pixel that
// deviates from the background colour — i.e. the glyphs (or anything
// overlapping that band) actually painted.
function bandHasInk(
  img: HTMLImageElement,
  cfg: RenderConfig,
  band: TextBlock
): boolean {
  const bg = parseHexColor(cfg.bgColor);
  const fg = parseHexColor(cfg.textColor);
  // Unparseable colours, or text that is invisible by design — nothing to
  // verify, assume painted.
  if (!bg || !fg) return true;
  const maxDelta = Math.max(
    Math.abs(bg.r - fg.r),
    Math.abs(bg.g - fg.g),
    Math.abs(bg.b - fg.b)
  );
  if (maxDelta <= INK_THRESHOLD) return true;

  const top = Math.max(0, Math.floor(band.top));
  const bottom = Math.min(cfg.height, Math.ceil(band.bottom));
  const bh = bottom - top;
  if (bh <= 0 || !(cfg.width > 0)) return true;

  const bw = Math.min(384, cfg.width);
  const ph = Math.max(1, Math.round((bh * bw) / cfg.width));
  const ctx = getProbeCtx(bw, ph);
  if (!ctx) return true;
  ctx.clearRect(0, 0, bw, ph);
  ctx.drawImage(img, 0, top, cfg.width, bh, 0, 0, bw, ph);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, bw, ph).data;
  } catch {
    return true;
  }
  for (let i = 0; i < data.length; i += 4) {
    if (
      Math.abs(data[i] - bg.r) > INK_THRESHOLD ||
      Math.abs(data[i + 1] - bg.g) > INK_THRESHOLD ||
      Math.abs(data[i + 2] - bg.b) > INK_THRESHOLD
    ) {
      return true;
    }
  }
  return false;
}

export async function renderFrameToCanvas(
  canvas: HTMLCanvasElement,
  cfg: RenderConfig
): Promise<void> {
  const svg = buildSvgString(cfg);
  const img = await loadSvgImage(svg, cfg.width, cfg.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D context unavailable.");

  // 1 — settle: probe the image until its rasterisation stops changing (and
  // at least MIN_SETTLE_TICKS yields have passed). The first probe draw is
  // what kicks off any pending @font-face work inside this SVG document.
  let prev: Uint8ClampedArray | null = probeSnapshot(
    img,
    cfg.width,
    cfg.height
  );
  for (let i = 0; i < MAX_SETTLE_POLLS; i++) {
    await yieldTick();
    const cur = probeSnapshot(img, cfg.width, cfg.height);
    const comparable = prev !== null && cur !== null;
    if (
      i + 1 >= MIN_SETTLE_TICKS &&
      (!comparable || samePixels(prev, cur))
    ) {
      break;
    }
    prev = cur;
  }

  // 2 — ink backstop: a frame whose text band is still uniformly background
  // coloured has not received its glyphs yet; give the font more chances.
  if (cfg.text.trim().length > 0) {
    const lines = cfg.text.split("\n").length;
    const band = computeTextBlock(
      cfg.height,
      cfg.fontSize,
      cfg.lineHeight,
      lines,
      cfg.vAlign
    );
    for (let i = 0; i < MAX_TEXT_RETRIES && !bandHasInk(img, cfg, band); i++) {
      await yieldTick();
    }
  }

  // 3 — capture: draw the settled image into the export canvas exactly once.
  ctx.clearRect(0, 0, cfg.width, cfg.height);
  ctx.drawImage(img, 0, 0, cfg.width, cfg.height);
}

// Compute the axis values for a normalised progress (0..1).
//
// mode = "sync": every animated axis shares one timeline — its value eases
// from animFrom to animTo as progress runs 0→1.
//
// mode = "binary": the animated axes count through a binary sequence. Each
// animated axis is one bit, ordered from the LEAST significant (the topmost
// animated axis) to the most significant (the bottom one). N animated axes
// cycle through 2^N states (e.g. 2 axes: 00 → 01 → 10 → 11 → 00). The whole
// timeline divides into 2^N equal segments; during segment k every axis eases
// from its value in state k to its value in state k+1 (the last segment wraps
// back to state 0, so the cycle always closes seamlessly at progress = 1).
// Bit 0 → animFrom, bit 1 → animTo of that axis. Pure function of progress,
// so preview and frame-by-frame export stay perfectly deterministic.
export function computeAxisValues(
  axes: {
    tag: string;
    min: number;
    max: number;
    animFrom: number;
    animTo: number;
    animate: boolean;
    current: number;
  }[],
  progress: number,
  easing: EasingType,
  mode: AxisMoveMode
): AxisValue[] {
  // Bit order: animated axes in display order (top → bottom); the topmost
  // animated axis is the least significant bit.
  const animIdx: number[] = [];
  axes.forEach((a, i) => {
    if (a.animate) animIdx.push(i);
  });
  const n = animIdx.length;
  const states = n > 0 ? 1 << n : 1;
  const p = clamp01(progress);

  return axes.map((a, i) => {
    if (!a.animate) return { tag: a.tag, value: a.current };
    let value: number;
    if (mode === "binary" && n > 0) {
      const bit = animIdx.indexOf(i);
      const at = (s: number) => ((s >> bit) & 1 ? a.animTo : a.animFrom);
      const total = p * states;
      const seg = Math.min(states - 1, Math.floor(total));
      const local = clamp01(total - seg);
      const eased = applyEasing(local, easing);
      const from = at(seg);
      const to = at((seg + 1) % states);
      value = from + (to - from) * eased;
    } else {
      const eased = applyEasing(p, easing);
      value = a.animFrom + (a.animTo - a.animFrom) * eased;
    }
    return { tag: a.tag, value: clamp(value, a.min, a.max) };
  });
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
