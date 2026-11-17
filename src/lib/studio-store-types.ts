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
