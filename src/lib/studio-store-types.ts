// Shared types & option lists for the studio — kept separate from the zustand
// store to avoid circular imports (encoders.ts needs LoopMode, studio-store.ts
// imports encoders).

export type LoopMode = "once" | "loop" | "pingpong";
export type AlignMode = "left" | "center" | "right";
export type VAlign = "top" | "middle" | "bottom";
export type OverlayPosition = "top" | "bottom";
export type ThumbShape = "circle" | "square" | "rounded" | "diamond";
// Base direction of the preview/exported text. "auto" picks the direction of
// the first strong character (same rule as HTML dir="auto").
export type TextDirection = "auto" | "ltr" | "rtl";

// Text font size range (px). Shared by every size control — the preview
// toolbar slider, the side-panel slider and the frame's corner resize handle —
// and by the store clamp, so they can never drift apart.
export const FONT_SIZE_MIN = 12;
export const FONT_SIZE_MAX = 2000;

// How animated axes move through time:
// - "binary": animated axes count through a binary sequence — the topmost
//   animated axis is the least significant bit; N axes cycle through 2^N
//   states (00 → 01 → 10 → 11 → 00 …).
// - "sync": every animated axis moves together on one shared timeline.
export type AxisMoveMode = "binary" | "sync";

// Thumb shape options with a tiny CSS preview recipe used by the pickers.
export const THUMB_SHAPES: { label: string; value: ThumbShape }[] = [
  { label: "Circle", value: "circle" },
  { label: "Square", value: "square" },
  { label: "Rounded", value: "rounded" },
  { label: "Diamond", value: "diamond" },
];

// Monospace font stacks offered for the axis-display overlay. Each entry lists
// fallbacks so the stack still resolves when the first choice is missing.
export const OVERLAY_FONTS: { label: string; value: string }[] = [
  {
    label: "System Mono",
    value:
      "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
  { label: "Menlo", value: "Menlo, monospace" },
  { label: "SF Mono", value: "'SF Mono', Menlo, Consolas, monospace" },
  { label: "Consolas", value: "Consolas, 'Courier New', monospace" },
  { label: "Courier New", value: "'Courier New', monospace" },
  { label: "JetBrains Mono", value: "'JetBrains Mono', ui-monospace, monospace" },
  { label: "IBM Plex Mono", value: "'IBM Plex Mono', ui-monospace, monospace" },
  { label: "DejaVu Sans Mono", value: "'DejaVu Sans Mono', monospace" },
];

export const DEFAULT_OVERLAY_FONT = OVERLAY_FONTS[0].value;

// ─── Glyph outline layer settings ──────────────────────────────────────────
// The display-only "wireframe" second text layer: glyph outlines with anchor
// nodes and bezier handles, extracted with fontkit (see lib/outline.ts). One
// settings group like the overlay above, patched with setOutline.
export interface OutlineSettings {
  enabled: boolean; // outline layer on/off (default off)
  scale: number; // outline size relative to the main text (0.1–10, 1 = same)
  strokeWidth: number; // outline stroke width, canvas px
  strokeColor: string;
  nodeSize: number; // anchor/control node size, canvas px
  nodeShape: ThumbShape;
  anchorFill: string; // anchor node fill
  anchorStroke: string; // anchor node border
  ctrlFill: string; // control-point node fill (separate style)
  ctrlStroke: string; // control-point node border
  handleColor: string; // control-point handle lines
  handleWidth: number; // handle line width, canvas px
}

export const DEFAULT_OUTLINE_SETTINGS: OutlineSettings = {
  enabled: false,
  scale: 1,
  strokeWidth: 2,
  strokeColor: "#171717",
  nodeSize: 8,
  nodeShape: "circle",
  anchorFill: "#ffffff",
  anchorStroke: "#171717",
  ctrlFill: "#171717",
  ctrlStroke: "#171717",
  handleColor: "#737373",
  handleWidth: 1,
};

// ─── Layer stack (z-order) ─────────────────────────────────────────────────
// The four baked canvas layers can be reordered relative to each other
// (z-index). The array runs BOTTOM → TOP: index 0 paints first (backmost),
// the last entry paints last (frontmost). Both the live preview and the SVG
// export renderer follow this stack.
export type LayerId = "text" | "outline" | "sliders" | "css";

export const LAYER_IDS: LayerId[] = ["text", "outline", "sliders", "css"];

// Factory default = the historical stack: text at the back, then the glyph
// outline wireframe, then the slider panel, with the CSS code line in front.
export const DEFAULT_LAYER_ORDER: LayerId[] = [...LAYER_IDS];

// Coerce an arbitrary value into a valid, COMPLETE layer order: unknown ids
// are dropped, missing ids are appended at the top (front). Keeps a stored /
// imported order resilient to schema drift.
export function normalizeLayerOrder(order: unknown): LayerId[] {
  const clean = Array.isArray(order)
    ? order.filter((id): id is LayerId =>
        LAYER_IDS.includes(id as LayerId)
      )
    : [];
  return [...clean, ...LAYER_IDS.filter((id) => !clean.includes(id))];
}

// ─── Overlay settings group ────────────────────────────────────────────────
// Every knob of the baked-in axis-slider / CSS-code overlay lives in ONE
// store object (`overlay: OverlaySettings`) instead of 24 flat `overlay*`
// fields, so a single `setOverlay(patch)` replaces 24 setters. The renderer's
// per-frame `OverlayConfig` (renderer.ts) extends this group with the data
// that is NOT part of the settings: the axis values to draw (axes) and the
// drag offsets (offsetX/offsetY for the slider panel and cssOffsetX/Y for
// the CSS code line, stored as panelOffsetX/Y and cssOffsetX/Y in the store).
export interface OverlaySettings {
  enabled: boolean; // master switch: bake the overlay into preview + export
  showSliders: boolean; // the slider block itself (track + thumb)
  showName: boolean;
  showTag: boolean;
  showMinMax: boolean; // axis min & max labels at track ends
  showLiveValue: boolean; // instantaneous value number on the slider
  valueDecimals: number; // decimal places of the live value number
  showCss: boolean;
  centered: boolean; // center the slider stack horizontally
  nameGap: number; // horizontal gap: inline axis name → track, em
  thumbScale: number; // thumb size multiplier
  thumbShape: ThumbShape;
  font: string;
  fontScale: number; // overlay TEXT size multiplier (1 = default)
  bold: boolean; // draw overlay text bold
  trackLenPct: number; // slider track length as % of canvas width (20..100)
  color: string;
  bgColor: string;
  bgOpacity: number;
  scale: number;
  position: OverlayPosition;
  axisGapEm: number; // vertical gap between slider rows, em of overlay font
}

// Factory defaults for the overlay group — the single source both for the
// store's initial state and for the double-click "reset" values used by the
// direct-manipulation handles.
export const DEFAULT_OVERLAY_SETTINGS: OverlaySettings = {
  enabled: true,
  showSliders: true,
  showName: false,
  showTag: false,
  showMinMax: false,
  showLiveValue: false,
  valueDecimals: 1,
  showCss: false,
  centered: true,
  nameGap: 0.9,
  thumbScale: 1,
  thumbShape: "circle",
  font: DEFAULT_OVERLAY_FONT,
  fontScale: 1,
  bold: false,
  trackLenPct: 30,
  color: "#000000",
  bgColor: "#ffffff",
  bgOpacity: 0,
  scale: 1,
  position: "bottom",
  axisGapEm: 1.2,
};
