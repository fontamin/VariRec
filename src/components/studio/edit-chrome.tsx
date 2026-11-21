"use client";

/**
 * Direct-manipulation chrome for the preview stage (v1.1).
 *
 * Every baked overlay element — the text block, the slider panel and the
 * CSS code line — gets a Figma-style frame:
 *
 * - a dashed outline sized to the element itself (the text frame hugs the
 *   measured text box, not the full canvas width). The whole frame BODY is a
 *   drag surface and the edge strips are extra grips — grab the element
 *   anywhere inside or on its border to move it. A motionless tap on the
 *   text body starts in-place editing at the tap point (onTapText).
 *   Double-click reset lives on the strips and the body of the panel and
 *   CSS frames (the text body's first click already edits). The three
 *   elements move INDEPENDENTLY: the text (textOffsetX/Y), the slider
 *   panel (panelOffsetX/Y) and the CSS line (cssOffsetX/Y) each carry
 *   their own offsets, so dragging one never moves another,
 * - resize handles: the text frame's corner scales the font size and its
 *   bottom-center handle changes the line height; the slider frame's corner
 *   scales the panel and its right-edge handle resizes the track length,
 * - gap handles sitting exactly in the gaps: between two slider rows (whose
 *   ceiling is the canvas height itself) and between the axis name and its
 *   track,
 * - magnetic snap: with "snap to width centre" enabled (magnet button above
 *   the preview), dragging snaps the element's centre to the canvas width
 *   centre and reports it via onSnap so the stage can draw a guide line.
 *
 * All of this is DOM-only chrome — nothing here is baked into the exported
 * frames, which are rendered by the SVG renderer from the store alone. The
 * keyboard-accessible path for the same values stays in the preview toolbar.
 */

import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { useStudio } from "@/lib/studio-store";
import {
  computeTextBlock,
  type OverlayMetrics,
} from "@/lib/renderer";
import { FONT_SIZE_MAX, FONT_SIZE_MIN } from "@/lib/studio-store-types";

// Round to 1 decimal — em-based gap values are stored with 0.1 steps.
const r1 = (n: number) => Math.round(n * 10) / 10;

// Measured bounding box of the preview text, in canvas px. The text frame
// hugs exactly this box instead of spanning the full canvas width.
export interface TextBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface DragCtx {
  k: number; // screen px per canvas px
  width: number; // canvas px
  height: number; // canvas px
  onSnap: (snapped: boolean) => void;
  // Motionless-tap hook for surfaces that both drag and do something else
  // (the text body starts editing). When given, dragText engages a 4 screen
  // px slop and reports a motionless press as a tap with the pointerdown
  // client coordinates. Surfaces without it keep the zero-slop behaviour.
  onTap?: (clientX: number, clientY: number) => void;
}

// Horizontal snap distance (canvas px) for the width-centre magnet.
const snapThreshold = (width: number): number => Math.max(4, width * 0.01);

/**
 * Starts a pointer drag on the element that received the pointerdown. dx/dy
 * handed to `onMove` are relative to the initial pointer position, in SCREEN
 * pixels (divide by the preview scale `k` to convert to canvas px). The
 * listeners live on the element itself via setPointerCapture, so they keep
 * working while React re-renders mid-drag, and they work for touch too.
 *
 * `slop` (default 0 = engage on the first real movement, the historical
 * behaviour) holds `onMove` back until the pointer travels more than that
 * many screen px — used by tap-aware surfaces. `onEnd` receives `moved`:
 * false means the pointer never crossed the slop (a motionless tap); a
 * pointercancel is NEVER reported as a tap (moved=true), so tap logic can't
 * run for an interrupted gesture.
 */
export function beginPointerDrag(
  e: ReactPointerEvent<HTMLElement>,
  onMove: (dx: number, dy: number, ev: PointerEvent) => void,
  onEnd?: (moved: boolean) => void,
  slop = 0
): void {
  const el = e.currentTarget;
  const startX = e.clientX;
  const startY = e.clientY;
  let moved = false;
  const move = (ev: PointerEvent) => {
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    if (Math.hypot(dx, dy) <= slop) return;
    moved = true;
    onMove(dx, dy, ev);
  };
  const cleanup = () => {
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", up);
    el.removeEventListener("pointercancel", cancel);
  };
  const up = () => {
    cleanup();
    onEnd?.(moved);
  };
  const cancel = () => {
    cleanup();
    onEnd?.(true);
  };
  try {
    el.setPointerCapture(e.pointerId);
  } catch {
    // Capture is best-effort; without it the drag still works while the
    // pointer stays over the element.
  }
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", cancel);
}

// ─── Drag behaviours (shared with the panel/css elements in preview-stage) ──

// Move the text block: offsets are deltas on top of the automatic layout
// (vAlign/align). UNCLAMPED by design — the text may travel anywhere,
// fully or partially outside the canvas (the stage and the export clip it
// at the canvas boundary). With the width-centre snap enabled, the text box
// centre magnetises to the canvas centre while dragging.
export function dragText(
  e: ReactPointerEvent<HTMLElement>,
  ctx: DragCtx & { box: TextBox }
): void {
  const s = useStudio.getState();
  const snap = s.snapCenterEnabled;
  const base = computeTextBlock(
    s.canvasHeight,
    s.fontSize,
    s.lineHeight,
    Math.max(1, s.text.split("\n").length),
    s.vAlign
  );
  const anchorAuto =
    s.align === "center"
      ? ctx.width / 2
      : s.align === "right"
        ? ctx.width - 24
        : 24;
  const { textOffsetX, textOffsetY } = s;
  // Constant during the drag: distance from the drag anchor to the text box
  // left edge, so the box centre can be derived from the anchor position.
  const deltaL = ctx.box.left - (anchorAuto + textOffsetX);
  const threshold = snapThreshold(ctx.width);
  let snapped = false;
  const report = (v: boolean) => {
    if (v !== snapped) {
      snapped = v;
      ctx.onSnap(v);
    }
  };
  beginPointerDrag(
    e,
    (dx, dy) => {
      const top = base.top + textOffsetY + dy / ctx.k;
      let ax = anchorAuto + textOffsetX + dx / ctx.k;
      if (snap) {
        const cx = ax + deltaL + ctx.box.width / 2;
        if (Math.abs(cx - ctx.width / 2) <= threshold) {
          report(true);
          ax = ctx.width / 2 - deltaL - ctx.box.width / 2;
        } else {
          report(false);
        }
      }
      useStudio.getState().setTextOffset(ax - anchorAuto, top - base.top);
    },
    (moved) => {
      report(false);
      // A motionless press on a tap-aware surface is a tap, not a drag:
      // hand the click coordinates to the surface's onTap (the stage starts
      // in-place editing there).
      if (!moved) ctx.onTap?.(e.clientX, e.clientY);
    },
    // Tap-aware surfaces only engage the drag after 4 screen px of real
    // movement; surfaces without onTap keep the zero-slop behaviour.
    ctx.onTap ? 4 : 0
  );
}

// Move the slider panel: same delta model, clamped so the panel itself
// stays inside the canvas. The CSS line below it moves independently (see
// dragCss), so the panel never drags it along. Snaps its centre to the
// canvas width centre when the magnet is enabled.
export function dragPanel(
  e: ReactPointerEvent<HTMLElement>,
  ctx: DragCtx & { m: OverlayMetrics }
): void {
  const s = useStudio.getState();
  const snap = s.snapCenterEnabled;
  const { panelOffsetX, panelOffsetY } = s;
  const baseX = ctx.m.panelX - panelOffsetX;
  const baseY = ctx.m.panelY - panelOffsetY;
  const threshold = snapThreshold(ctx.width);
  let snapped = false;
  const report = (v: boolean) => {
    if (v !== snapped) {
      snapped = v;
      ctx.onSnap(v);
    }
  };
  beginPointerDrag(
    e,
    (dx, dy) => {
      let x = Math.min(
        Math.max(0, baseX + panelOffsetX + dx / ctx.k),
        Math.max(0, ctx.width - ctx.m.panelW)
      );
      if (snap) {
        const cx = x + ctx.m.panelW / 2;
        if (Math.abs(cx - ctx.width / 2) <= threshold) {
          report(true);
          x = Math.min(
            Math.max(0, ctx.width / 2 - ctx.m.panelW / 2),
            Math.max(0, ctx.width - ctx.m.panelW)
          );
        } else {
          report(false);
        }
      }
      const y = Math.min(
        Math.max(0, baseY + panelOffsetY + dy / ctx.k),
        Math.max(0, ctx.height - ctx.m.panelH)
      );
      useStudio
        .getState()
        .setPanelOffset(Math.round(x - baseX), Math.round(y - baseY));
    },
    () => report(false)
  );
}

// Move the CSS code line: the same delta model as the panel, but driven by
// the CSS line's OWN offsets (cssOffsetX/Y) so it can travel anywhere on
// the canvas independently of the slider panel.
export function dragCss(
  e: ReactPointerEvent<HTMLElement>,
  ctx: DragCtx & { m: OverlayMetrics }
): void {
  const s = useStudio.getState();
  const snap = s.snapCenterEnabled;
  const { cssOffsetX, cssOffsetY } = s;
  const baseX = ctx.m.cssBarX - cssOffsetX;
  const baseY = ctx.m.cssBarY - cssOffsetY;
  const threshold = snapThreshold(ctx.width);
  let snapped = false;
  const report = (v: boolean) => {
    if (v !== snapped) {
      snapped = v;
      ctx.onSnap(v);
    }
  };
  beginPointerDrag(
    e,
    (dx, dy) => {
      let x = Math.min(
        Math.max(0, baseX + cssOffsetX + dx / ctx.k),
        Math.max(0, ctx.width - ctx.m.cssBarW)
      );
      if (snap) {
        const cx = x + ctx.m.cssBarW / 2;
        if (Math.abs(cx - ctx.width / 2) <= threshold) {
          report(true);
          x = Math.min(
            Math.max(0, ctx.width / 2 - ctx.m.cssBarW / 2),
            Math.max(0, ctx.width - ctx.m.cssBarW)
          );
        } else {
          report(false);
        }
      }
      const y = Math.min(
        Math.max(0, baseY + cssOffsetY + dy / ctx.k),
        Math.max(0, ctx.height - ctx.m.cssBarH)
      );
      useStudio
        .getState()
        .setCssOffset(Math.round(x - baseX), Math.round(y - baseY));
    },
    () => report(false)
  );
}

// Move the glyph-outline layer: the same delta model and snap logic as the
// text block, but driven by the outline layer's OWN offsets
// (outlineOffsetX/Y) so it can be positioned independently of the text —
// also UNCLAMPED, it may travel anywhere including outside the canvas.
export function dragOutline(
  e: ReactPointerEvent<HTMLElement>,
  ctx: DragCtx & { box: TextBox }
): void {
  const s = useStudio.getState();
  const snap = s.snapCenterEnabled;
  const base = computeTextBlock(
    s.canvasHeight,
    s.fontSize,
    s.lineHeight,
    Math.max(1, s.text.split("\n").length),
    s.vAlign
  );
  const anchorAuto =
    s.align === "center"
      ? ctx.width / 2
      : s.align === "right"
        ? ctx.width - 24
        : 24;
  const { outlineOffsetX, outlineOffsetY } = s;
  const deltaL = ctx.box.left - (anchorAuto + outlineOffsetX);
  const threshold = snapThreshold(ctx.width);
  let snapped = false;
  const report = (v: boolean) => {
    if (v !== snapped) {
      snapped = v;
      ctx.onSnap(v);
    }
  };
  beginPointerDrag(
    e,
    (dx, dy) => {
      const top = base.top + outlineOffsetY + dy / ctx.k;
      let ax = anchorAuto + outlineOffsetX + dx / ctx.k;
      if (snap) {
        const cx = ax + deltaL + ctx.box.width / 2;
        if (Math.abs(cx - ctx.width / 2) <= threshold) {
          report(true);
          ax = ctx.width / 2 - deltaL - ctx.box.width / 2;
        } else {
          report(false);
        }
      }
      useStudio
        .getState()
        .setOutlineOffset(ax - anchorAuto, top - base.top);
    },
    (moved) => {
      report(false);
      // A motionless press on a tap-aware surface is a tap, not a drag —
      // with the text layer hidden this is HOW the invisible text gets
      // edited (the stage starts in-place editing at the tap point).
      if (!moved) ctx.onTap?.(e.clientX, e.clientY);
    },
    // Tap-aware surfaces only engage the drag after 4 screen px of real
    // movement; surfaces without onTap keep the zero-slop behaviour.
    ctx.onTap ? 4 : 0
  );
}

// ─── Chrome layer ────────────────────────────────────────────────────────

interface HandleProps {
  className?: string;
  style: React.CSSProperties;
  title: string;
  ariaLabel: string;
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onDoubleClick?: () => void;
}

function Handle({ className, style, title, ariaLabel, onPointerDown, onDoubleClick }: HandleProps) {
  return (
    <div
      role="button"
      aria-label={ariaLabel}
      title={title}
      className={`pointer-events-auto absolute z-10 size-3 rounded-[3px] border border-foreground/40 bg-background shadow-sm touch-none hover:bg-foreground/25 ${className ?? ""}`}
      style={style}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
    />
  );
}

const STRIP =
  "pointer-events-auto absolute cursor-grab active:cursor-grabbing touch-none transition-colors hover:bg-foreground/15";

export function EditChrome({
  box,
  m,
  k,
  width,
  height,
  showPanel,
  showCss,
  axesCount,
  lineCount,
  showOutline,
  outlineBox,
  textLayerVisible,
  onSnap,
  onTapText,
}: {
  box: TextBox; // measured text box (canvas px) — the frame hugs it
  m: OverlayMetrics;
  k: number; // screen px per canvas px
  width: number; // canvas px
  height: number; // canvas px
  showPanel: boolean;
  showCss: boolean;
  axesCount: number;
  lineCount: number;
  showOutline: boolean; // glyph-outline layer enabled
  outlineBox: TextBox | null; // outline ink box (canvas px), null = no glyphs
  textLayerVisible: boolean; // editable text layer currently shown
  onSnap: (snapped: boolean) => void;
  // Starts in-place editing with the caret at the tap point (client px).
  // Invoked when a motionless tap lands on the text body surface.
  onTapText?: (clientX: number, clientY: number) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  // Client-space anchor for ratio-based scale handles.
  const clientAnchor = (cx: number, cy: number) => {
    const rect = rootRef.current?.getBoundingClientRect();
    return {
      x: (rect?.left ?? 0) + cx * k,
      y: (rect?.top ?? 0) + cy * k,
    };
  };

  const scaleRatioDrag = (
    e: ReactPointerEvent<HTMLDivElement>,
    anchor: { x: number; y: number },
    apply: (ratio: number) => void
  ) => {
    const startDist = Math.max(
      8,
      Math.hypot(e.clientX - anchor.x, e.clientY - anchor.y)
    );
    beginPointerDrag(e, (_dx, _dy, ev) => {
      const d = Math.hypot(ev.clientX - anchor.x, ev.clientY - anchor.y);
      apply(d / startDist);
    });
  };

  // ── Text frame — hugs the measured text box ─────────────────────────────
  // When the glyph-outline layer is on AND the text layer is hidden, the
  // text frame becomes the outline's chrome: its geometry hugs the outline
  // ink box and dragging moves the outline (the visible layer), while a
  // motionless tap STILL starts editing the invisible text.
  const outlineActive = showOutline && outlineBox !== null;
  const frameIsOutline = outlineActive && !textLayerVisible;
  const frameBox = frameIsOutline ? outlineBox! : box;
  const resetOutline = () => useStudio.getState().setOutlineOffset(0, 0);
  const resetText = () => useStudio.getState().setTextOffset(0, 0);
  const frameDrag = frameIsOutline ? dragOutline : dragText;
  const resetFrame = frameIsOutline ? resetOutline : resetText;
  const frameTitle = frameIsOutline
    ? "Drag to move the glyph outline · double-click strips to reset"
    : "Drag to move the text · double-click to reset";
  const fx = frameBox.left * k;
  const fw = frameBox.width * k;
  const fy = frameBox.top * k;
  const fh = frameBox.height * k;
  const textTitle = "Drag to move the text · double-click to reset";

  // Separate outline-layer frame (only while BOTH layers are visible): it
  // renders BEFORE the text frame so overlapping areas keep the text
  // interactions; the outline can be grabbed where the two frames do not
  // overlap, or via its strips/grabber. Double-click resets the outline
  // offsets only.
  const outlineChrome = outlineActive && textLayerVisible && (
    <>
      <div
        className="absolute rounded-md border border-dashed border-foreground/20"
        style={{
          left: outlineBox!.left * k,
          top: outlineBox!.top * k,
          width: outlineBox!.width * k,
          height: outlineBox!.height * k,
        }}
      />
      <div
        className="pointer-events-auto absolute cursor-grab touch-none active:cursor-grabbing"
        style={{
          left: outlineBox!.left * k,
          top: outlineBox!.top * k,
          width: outlineBox!.width * k,
          height: outlineBox!.height * k,
        }}
        onPointerDown={(e) =>
          dragOutline(e, { k, width, height, box: outlineBox!, onSnap })
        }
        title="Drag to move the glyph outline (independent of the text)"
      />
      <div
        className={STRIP}
        style={{
          left: outlineBox!.left * k,
          top: outlineBox!.top * k - 4,
          width: outlineBox!.width * k,
          height: 8,
        }}
        onPointerDown={(e) =>
          dragOutline(e, { k, width, height, box: outlineBox!, onSnap })
        }
        onDoubleClick={resetOutline}
        title="Drag to move the glyph outline · double-click to reset"
      />
      <div
        className={STRIP}
        style={{
          left: outlineBox!.left * k,
          top: (outlineBox!.top + outlineBox!.height) * k - 4,
          width: outlineBox!.width * k,
          height: 8,
        }}
        onPointerDown={(e) =>
          dragOutline(e, { k, width, height, box: outlineBox!, onSnap })
        }
        onDoubleClick={resetOutline}
        title="Drag to move the glyph outline · double-click to reset"
      />
      <div
        className={STRIP}
        style={{
          left: outlineBox!.left * k - 4,
          top: outlineBox!.top * k,
          width: 8,
          height: outlineBox!.height * k,
        }}
        onPointerDown={(e) =>
          dragOutline(e, { k, width, height, box: outlineBox!, onSnap })
        }
        onDoubleClick={resetOutline}
        title="Drag to move the glyph outline · double-click to reset"
      />
      <div
        className={STRIP}
        style={{
          left: (outlineBox!.left + outlineBox!.width) * k - 4,
          top: outlineBox!.top * k,
          width: 8,
          height: outlineBox!.height * k,
        }}
        onPointerDown={(e) =>
          dragOutline(e, { k, width, height, box: outlineBox!, onSnap })
        }
        onDoubleClick={resetOutline}
        title="Drag to move the glyph outline · double-click to reset"
      />
    </>
  );

  // ── Slider panel frame (the CSS line gets its own frame below) ──────────
  const panelOn = showPanel && m.panelH > 0;
  const px = m.panelX * k;
  const py = m.panelY * k;
  const pw = m.panelW * k;
  const ph = m.panelH * k;
  const resetPanel = () => useStudio.getState().setPanelOffset(0, 0);
  const resetCss = () => useStudio.getState().setCssOffset(0, 0);
  const panelTitle = "Drag to move the sliders · double-click to reset";
  const cssTitle = "Drag to move the CSS line · double-click to reset";

  // Row-gap ceiling in em — the canvas height itself: the gap may grow until
  // the panel (plus the CSS line) exactly fills the vertical space between
  // the canvas margins. Mirrors the clamp inside computeOverlayMetrics.
  const rowGapMaxEm = Math.max(0.2, m.axisGapMaxPx / m.fontPx);

  return (
    <div
      ref={rootRef}
      className="pointer-events-none absolute inset-0 z-10 select-none"
      aria-hidden={false}
    >
      {/* Glyph-outline frame (both layers visible) — rendered BEFORE the
          text frame so the text keeps its interactions where they overlap;
          the outline is grabbable wherever the two frames don't overlap,
          plus via its strips and grabber. */}
      {outlineChrome}

      {/* Text frame */}
      <div
        className="absolute rounded-md border border-dashed border-foreground/30"
        style={{ left: fx, top: fy, width: fw, height: fh }}
      />
      {/* Text body drag surface — grab ANYWHERE inside the frame to move the
          text (or the outline, when the text layer is hidden); a motionless
          tap starts in-place editing at the tap point. Rendered BEFORE the
          strips and handles so they stack on top. No double-click reset
          here: the first click already starts editing. */}
      <div
        className="pointer-events-auto absolute cursor-grab touch-none active:cursor-grabbing"
        style={{ left: fx, top: fy, width: fw, height: fh }}
        onPointerDown={(e) =>
          frameDrag(e, {
            k,
            width,
            height,
            box: frameBox,
            onSnap,
            onTap: onTapText,
          })
        }
        title={
          frameIsOutline
            ? "Drag to move the glyph outline · click to edit text"
            : "Drag to move the text · click to edit"
        }
      />
      {/* Text frame edge strips (move) */}
      <div
        className={STRIP}
        style={{ left: fx, top: fy - 4, width: fw, height: 8 }}
        onPointerDown={(e) =>
          frameDrag(e, { k, width, height, box: frameBox, onSnap })
        }
        onDoubleClick={resetFrame}
        title={frameTitle}
      />
      <div
        className={STRIP}
        style={{ left: fx, top: fy + fh - 4, width: fw, height: 8 }}
        onPointerDown={(e) =>
          frameDrag(e, { k, width, height, box: frameBox, onSnap })
        }
        onDoubleClick={resetFrame}
        title={frameTitle}
      />
      <div
        className={STRIP}
        style={{ left: fx - 4, top: fy, width: 8, height: fh }}
        onPointerDown={(e) =>
          frameDrag(e, { k, width, height, box: frameBox, onSnap })
        }
        onDoubleClick={resetFrame}
        title={frameTitle}
      />
      <div
        className={STRIP}
        style={{ left: fx + fw - 4, top: fy, width: 8, height: fh }}
        onPointerDown={(e) =>
          frameDrag(e, { k, width, height, box: frameBox, onSnap })
        }
        onDoubleClick={resetFrame}
        title={frameTitle}
      />
      {/* Font-size handle (bottom-right corner) */}
      <Handle
        className="cursor-nwse-resize"
        style={{ left: fx + fw - 6, top: fy + fh - 6 }}
        title="Drag to resize the text (font size)"
        ariaLabel="Resize text font size"
        onPointerDown={(e) => {
          const anchor = clientAnchor(frameBox.left, frameBox.top);
          const start = useStudio.getState().fontSize;
          scaleRatioDrag(e, anchor, (ratio) => {
            useStudio
              .getState()
              .setFontSize(
                Math.round(
                  Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, start * ratio))
                )
              );
          });
        }}
      />
      {/* Line-height handle (bottom-center) — only meaningful with more
          than one line: a single line has nothing to space apart, so the
          handle stays hidden until the text grows a second line. */}
      {lineCount > 1 && (
        <Handle
          className="cursor-ns-resize rounded-full"
          style={{ left: fx + fw / 2 - 6, top: fy + fh - 6 }}
          title="Drag to change the line height"
          ariaLabel="Change line height"
          onPointerDown={(e) => {
            const startLh = useStudio.getState().lineHeight;
            const fs = useStudio.getState().fontSize;
            beginPointerDrag(e, (_dx, dy) => {
              const delta = dy / k / (fs * lineCount);
              useStudio
                .getState()
                .setLineHeight(
                  Math.min(2, Math.max(0.8, Math.round((startLh + delta) * 20) / 20))
                );
            });
          }}
          onDoubleClick={() => useStudio.getState().setLineHeight(1.15)}
        />
      )}

      {/* Slider panel frame + handles */}
      {panelOn && (
        <>
          <div
            className="absolute rounded-md border border-dashed border-foreground/30"
            style={{ left: px, top: py, width: pw, height: ph }}
          />
          {/* Panel body drag surface — grab anywhere inside the panel to
              move it. Rendered before the strips and handles so they stay
              on top; double-click resets the panel offset. */}
          <div
            className="pointer-events-auto absolute cursor-grab touch-none active:cursor-grabbing"
            style={{ left: px, top: py, width: pw, height: ph }}
            onPointerDown={(e) =>
              dragPanel(e, { k, width, height, m, onSnap })
            }
            onDoubleClick={resetPanel}
            title={panelTitle}
          />
          <div
            className={STRIP}
            style={{ left: px, top: py - 4, width: pw, height: 8 }}
            onPointerDown={(e) =>
              dragPanel(e, { k, width, height, m, onSnap })
            }
            onDoubleClick={resetPanel}
            title={panelTitle}
          />
          <div
            className={STRIP}
            style={{ left: px, top: py + ph - 4, width: pw, height: 8 }}
            onPointerDown={(e) =>
              dragPanel(e, { k, width, height, m, onSnap })
            }
            onDoubleClick={resetPanel}
            title={panelTitle}
          />
          <div
            className={STRIP}
            style={{ left: px - 4, top: py, width: 8, height: ph }}
            onPointerDown={(e) =>
              dragPanel(e, { k, width, height, m, onSnap })
            }
            onDoubleClick={resetPanel}
            title={panelTitle}
          />
          <div
            className={STRIP}
            style={{ left: px + pw - 4, top: py, width: 8, height: ph }}
            onPointerDown={(e) =>
              dragPanel(e, { k, width, height, m, onSnap })
            }
            onDoubleClick={resetPanel}
            title={panelTitle}
          />

          {/* Panel scale handle (panel bottom-right corner) */}
          <Handle
            className="cursor-nwse-resize"
            style={{
              left: (m.panelX + m.panelW) * k - 6,
              top: (m.panelY + m.panelH) * k - 6,
            }}
            title="Drag to resize the slider panel"
            ariaLabel="Resize slider panel"
            onPointerDown={(e) => {
              const anchor = clientAnchor(m.panelX, m.panelY);
              const start = useStudio.getState().overlay.scale;
              scaleRatioDrag(e, anchor, (ratio) => {
                useStudio
                  .getState()
                  .setOverlay({
                    scale: Math.min(
                      2,
                      Math.max(0.6, Math.round(start * ratio * 20) / 20)
                    ),
                  });
              });
            }}
          />

          {/* Track length handle (panel right edge, mid height) */}
          <Handle
            className="cursor-ew-resize"
            style={{
              left: (m.panelX + m.panelW) * k - 6,
              top: (m.panelY + m.panelH / 2) * k - 6,
            }}
            title="Drag to change the track length"
            ariaLabel="Change slider track length"
            onPointerDown={(e) => {
              const start = useStudio.getState().overlay.trackLenPct;
              const scale = useStudio.getState().overlay.scale;
              beginPointerDrag(e, (dx) => {
                const delta = (dx / k / (width * scale)) * 100;
                useStudio
                  .getState()
                  .setOverlay({
                    trackLenPct: Math.round(
                      Math.min(100, Math.max(20, start + delta))
                    ),
                  });
              });
            }}
            onDoubleClick={() =>
              useStudio.getState().setOverlay({ trackLenPct: 30 })
            }
          />
        </>
      )}

      {/* CSS code line frame — its own independent drag surface (dragCss),
          separate from the slider panel above. */}
      {showCss && m.cssBarH > 0 && (
        <>
          <div
            className="absolute rounded-md border border-dashed border-foreground/20"
            style={{
              left: m.cssBarX * k,
              top: m.cssBarY * k,
              width: m.cssBarW * k,
              height: m.cssBarH * k,
            }}
          />
          <div
            className="pointer-events-auto absolute cursor-grab touch-none active:cursor-grabbing"
            style={{
              left: m.cssBarX * k,
              top: m.cssBarY * k,
              width: m.cssBarW * k,
              height: m.cssBarH * k,
            }}
            onPointerDown={(e) => dragCss(e, { k, width, height, m, onSnap })}
            onDoubleClick={resetCss}
            title={cssTitle}
          />
          <div
            className={STRIP}
            style={{
              left: m.cssBarX * k,
              top: m.cssBarY * k - 4,
              width: m.cssBarW * k,
              height: 8,
            }}
            onPointerDown={(e) => dragCss(e, { k, width, height, m, onSnap })}
            onDoubleClick={resetCss}
            title={cssTitle}
          />
          <div
            className={STRIP}
            style={{
              left: m.cssBarX * k,
              top: (m.cssBarY + m.cssBarH) * k - 4,
              width: m.cssBarW * k,
              height: 8,
            }}
            onPointerDown={(e) => dragCss(e, { k, width, height, m, onSnap })}
            onDoubleClick={resetCss}
            title={cssTitle}
          />
          <div
            className={STRIP}
            style={{
              left: m.cssBarX * k - 4,
              top: m.cssBarY * k,
              width: 8,
              height: m.cssBarH * k,
            }}
            onPointerDown={(e) => dragCss(e, { k, width, height, m, onSnap })}
            onDoubleClick={resetCss}
            title={cssTitle}
          />
          <div
            className={STRIP}
            style={{
              left: (m.cssBarX + m.cssBarW) * k - 4,
              top: m.cssBarY * k,
              width: 8,
              height: m.cssBarH * k,
            }}
            onPointerDown={(e) => dragCss(e, { k, width, height, m, onSnap })}
            onDoubleClick={resetCss}
            title={cssTitle}
          />
        </>
      )}

      {/* Gap: between the first two slider rows */}
      {panelOn && axesCount >= 2 && (
        <Handle
          className="cursor-ns-resize rounded-full"
          style={{
            left: (m.panelX + m.panelW - 16) * k - 6,
            top:
              (m.panelY + m.innerPad + m.trackRowH + m.axisGap / 2) * k - 6,
          }}
          title="Drag to change the vertical gap between sliders"
          ariaLabel="Change vertical gap between sliders"
          onPointerDown={(e) => {
            const start = useStudio.getState().overlay.axisGapEm;
            const fontPx = m.fontPx;
            beginPointerDrag(e, (_dx, dy) => {
              const delta = dy / k / fontPx;
              useStudio
                .getState()
                .setOverlay({
                  axisGapEm: r1(
                    Math.min(rowGapMaxEm, Math.max(0.2, start + delta))
                  ),
                });
            });
          }}
          onDoubleClick={() =>
            useStudio.getState().setOverlay({ axisGapEm: 1.2 })
          }
        />
      )}

      {/* Gap: axis name ↔ track (horizontal, first row) */}
      {panelOn && m.nameW > 0 && (
        <Handle
          className="cursor-ew-resize rounded-full"
          style={{
            left:
              (m.panelX + m.innerPad + m.pillBuffer + m.nameW + m.nameGapPx / 2) *
                k -
              6,
            top: (m.panelY + m.innerPad + m.trackRowH / 2) * k - 6,
          }}
          title="Drag to change the gap between the axis name and its track"
          ariaLabel="Change axis name and track gap"
          onPointerDown={(e) => {
            const start = useStudio.getState().overlay.nameGap;
            const fontPx = m.fontPx;
            beginPointerDrag(e, (dx) => {
              const delta = dx / k / fontPx;
              useStudio
                .getState()
                .setOverlay({
                  nameGap: r1(Math.min(3, Math.max(0.2, start + delta))),
                });
            });
          }}
          onDoubleClick={() =>
            useStudio.getState().setOverlay({ nameGap: 0.9 })
          }
        />
      )}
    </div>
  );
}
