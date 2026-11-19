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
// style applier, so they always agree on geometry.
export function overlayCfgFrom(s: StudioState): OverlayConfig {
  return {
    showSliders: s.overlayShowSliders,
    showName: s.overlayShowName,
    showTag: s.overlayShowTag,
    showMinMax: s.overlayShowMinMax,
    showLiveValue: s.overlayShowLiveValue,
    valueDecimals: s.overlayValueDecimals,
    showCss: s.overlayShowCss,
    centered: s.overlayCentered,
    nameGap: s.overlayNameGap,
    cssGap: s.overlayCssGap,
    textGap: s.overlayTextGap,
    thumbScale: s.overlayThumbScale,
    thumbShape: s.overlayThumbShape,
    font: s.overlayFont,
    bold: s.overlayBold,
    fontScale: s.overlayFontScale,
    trackLenPct: s.overlayTrackLen,
    color: s.overlayColor,
    bgColor: s.overlayBgColor,
    bgOpacity: s.overlayBgOpacity,
    scale: s.overlayScale,
    position: s.overlayPosition,
    axisGapEm: s.overlayAxisGap,
    offsetX: s.panelOffsetX,
    offsetY: s.panelOffsetY,
    axes: s.axes.map((a) => ({
      tag: a.tag,
      name: a.name,
      value: a.current,
      min: a.min,
      max: a.max,
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
    s.textOffsetY,
    s.canvasHeight
  );
}
