// Shared bridges between the studio store and the renderer geometry helpers.
// Lives outside preview-stage so the floating toolbar (and any other
// component) can compute the exact same metrics without circular imports.
import type { StudioState } from "./studio-store";
import {
  applyTextOffset,
  computeTextBlock,
  type OverlayConfig,
  type TextBlock,
} from "./renderer";

// Build the overlay config used by both the JSX layout and the per-frame
// style applier, so they always agree on geometry. The user's overlay
// settings group carries almost everything; the per-frame config adds the
// panel + CSS-line drag offsets and the axis values to draw.
export function overlayCfgFrom(s: StudioState): OverlayConfig {
  const { enabled: _enabled, ...settings } = s.overlay;
  return {
    ...settings,
    offsetX: s.panelOffsetX,
    offsetY: s.panelOffsetY,
    cssOffsetX: s.cssOffsetX,
    cssOffsetY: s.cssOffsetY,
    axes: s.axes.map((a) => ({
      tag: a.tag,
      name: a.name,
      value: a.current,
      min: a.min,
      max: a.max,
      visible: a.visible,
    })),
  };
}

// Auto placement (vAlign) plus the direct-manipulation drag offsets,
// clamped — the same computation the SVG export renderer applies.
export function textBlockFor(s: StudioState): TextBlock {
  return applyTextOffset(
    computeTextBlock(
      s.canvasHeight,
      s.fontSize,
      s.lineHeight,
      Math.max(1, s.text.split("\n").length),
      s.vAlign
    ),
    s.textOffsetX,
    s.textOffsetY
  );
}
