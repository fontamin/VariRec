"use client";

/**
 * Direct-manipulation chrome for the preview stage (v1.1).
 *
 * Every baked overlay element — the text block, the slider stack (panel +
 * CSS code line) and the gaps between them — gets a Figma-style frame:
 *
 * - a dashed outline sized to the element itself (the text frame hugs the
 *   measured text box, not the full canvas width) with edge strips you can
 *   grab to MOVE the element,
 * - a grabber pill above the frame for discoverability (double-click it to
 *   reset the element back to its automatic position),
 * - resize handles: the text frame's corner scales the font size and its
 *   bottom-center handle changes the line height; the slider frame's corner
 *   scales the panel and its right-edge handle resizes the track length,
 * - gap handles sitting exactly in the gaps: text↔stack, panel↔CSS line,
 *   between two slider rows (whose ceiling is the canvas height itself),
 *   and between the axis name and its track,
 * - magnetic snap: with "snap to width centre" enabled (magnet button above
 *   the preview), dragging snaps the element's centre to the canvas width
 *   centre and reports it via onSnap so the stage can draw a guide line.
 *
 * All of this is DOM-only chrome — nothing here is baked into the exported
 * frames, which are rendered by the SVG renderer from the store alone. The
 * keyboard-accessible path for the same values stays in the preview toolbar.
 */

import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { GripVertical } from "lucide-react";
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
}

// Horizontal snap distance (canvas px) for the width-centre magnet.
const snapThreshold = (width: number): number => Math.max(4, width * 0.01);

/**
 * Starts a pointer drag on the element that received the pointerdown. dx/dy
 * handed to `onMove` are relative to the initial pointer position, in SCREEN
 * pixels (divide by the preview scale `k` to convert to canvas px). The
 * listeners live on the element itself via setPointerCapture, so they keep
 * working while React re-renders mid-drag, and they work for touch too.
 */
export function beginPointerDrag(
  e: ReactPointerEvent<HTMLElement>,
  onMove: (dx: number, dy: number, ev: PointerEvent) => void,
  onEnd?: () => void
): void {
  const el = e.currentTarget;
  const startX = e.clientX;
  const startY = e.clientY;
  const move = (ev: PointerEvent) =>
    onMove(ev.clientX - startX, ev.clientY - startY, ev);
  const up = () => {
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", up);
    el.removeEventListener("pointercancel", up);
    onEnd?.();
  };
  try {
    el.setPointerCapture(e.pointerId);
  } catch {
    // Capture is best-effort; without it the drag still works while the
    // pointer stays over the element.
  }
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
}

// ─── Drag behaviours (shared with the panel/css elements in preview-stage) ──

// Move the text block: offsets are deltas on top of the automatic layout
// (vAlign/align), clamped so the block can never leave the canvas. With the
// width-centre snap enabled, the text box centre magnetises to the canvas
// centre while dragging.
export function dragText(
  e: ReactPointerEvent<HTMLElement>,
  ctx: DragCtx & { box: TextBox }
): void {
  const s = useStudio.getState();
  const snap = s.snapCenterEnabled;
  const lineCount = Math.max(1, s.text.split("\n").length);
  const base = computeTextBlock(
    s.canvasHeight,
    s.fontSize,
    s.lineHeight,
    lineCount,
    s.vAlign
  );
  const anchorAuto =
    s.align === "center"
      ? ctx.width / 2
      : s.align === "right"
        ? ctx.width - 24
        : 24;
  const { textOffsetX, textOffsetY } = s;
  const blockH = lineCount * s.fontSize * s.lineHeight;
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
      const top = Math.min(
        Math.max(0, base.top + textOffsetY + dy / ctx.k),
        Math.max(0, ctx.height - blockH)
      );
      let ax = Math.min(
        Math.max(0, anchorAuto + textOffsetX + dx / ctx.k),
        ctx.width
      );
      if (snap) {
        const cx = ax + deltaL + ctx.box.width / 2;
        if (Math.abs(cx - ctx.width / 2) <= threshold) {
          report(true);
          ax = Math.min(
            Math.max(0, ctx.width / 2 - deltaL - ctx.box.width / 2),
            ctx.width
          );
        } else {
          report(false);
        }
      }
      useStudio.getState().setTextOffset(ax - anchorAuto, top - base.top);
    },
    () => report(false)
  );
}

// Move the slider stack (panel + CSS line): same delta model, clamped so the
// whole stack stays inside the canvas. Snaps its centre to the canvas width
// centre when the magnet is enabled.
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
        Math.max(0, ctx.height - ctx.m.stackH)
      );
      useStudio
        .getState()
        .setPanelOffset(Math.round(x - baseX), Math.round(y - baseY));
    },
    () => report(false)
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
  onSnap,
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
  onSnap: (snapped: boolean) => void;
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
  const fx = box.left * k;
  const fw = box.width * k;
  const fy = box.top * k;
  const fh = box.height * k;
  const resetText = () => useStudio.getState().setTextOffset(0, 0);
  const textTitle = "Drag to move the text · double-click to reset";

  // ── Slider stack frame (union of panel + CSS line boxes) ────────────────
  const boxes: { x: number; y: number; w: number; h: number }[] = [];
  if (showPanel && m.panelH > 0)
    boxes.push({ x: m.panelX, y: m.panelY, w: m.panelW, h: m.panelH });
  if (showCss && m.cssBarH > 0)
    boxes.push({ x: m.cssBarX, y: m.cssBarY, w: m.cssBarW, h: m.cssBarH });
  const ux = boxes.length ? Math.min(...boxes.map((b) => b.x)) : 0;
  const uy = boxes.length ? Math.min(...boxes.map((b) => b.y)) : 0;
  const ur =
    boxes.length
      ? Math.max(...boxes.map((b) => b.x + b.w))
      : 0;
  const ub =
    boxes.length
      ? Math.max(...boxes.map((b) => b.y + b.h))
      : 0;
  const uw = Math.max(0, ur - ux);
  const uh = Math.max(0, ub - uy);
  const resetPanel = () => useStudio.getState().setPanelOffset(0, 0);
  const panelTitle = "Drag to move the sliders · double-click to reset";

  // Gap handle between the text block and the slider stack.
  const boxBottom = box.top + box.height;
  let textGapHandle: React.ReactNode = null;
  if (boxes.length) {
    const below = uy >= boxBottom - 1;
    const above = ub <= box.top + 1;
    if (below || above) {
      const gy = below ? (boxBottom + uy) / 2 : (ub + box.top) / 2;
      const sign = below ? 1 : -1;
      textGapHandle = (
        <Handle
          className="cursor-ns-resize rounded-full"
          style={{ left: (ux + uw / 2) * k - 6, top: gy * k - 6 }}
          title="Drag to change the gap between text and sliders"
          ariaLabel="Change text and sliders gap"
          onPointerDown={(e) => {
            const start = useStudio.getState().overlayTextGap;
            const fontPx = m.fontPx;
            beginPointerDrag(e, (_dx, dy) => {
              const delta = (dy / k / fontPx) * sign;
              useStudio
                .getState()
                .setOverlayTextGap(
                  r1(Math.min(12, Math.max(0, start + delta)))
                );
            });
          }}
          onDoubleClick={() =>
            useStudio.getState().setOverlayTextGap(0.9)
          }
        />
      );
    }
  }

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
      {/* Text frame */}
      <div
        className="absolute rounded-md border border-dashed border-foreground/30"
        style={{ left: fx, top: fy, width: fw, height: fh }}
      />
      {/* Text frame edge strips (move) */}
      <div
        className={STRIP}
        style={{ left: fx, top: fy - 4, width: fw, height: 8 }}
        onPointerDown={(e) => dragText(e, { k, width, height, box, onSnap })}
        onDoubleClick={resetText}
        title={textTitle}
      />
      <div
        className={STRIP}
        style={{ left: fx, top: fy + fh - 4, width: fw, height: 8 }}
        onPointerDown={(e) => dragText(e, { k, width, height, box, onSnap })}
        onDoubleClick={resetText}
        title={textTitle}
      />
      <div
        className={STRIP}
        style={{ left: fx - 4, top: fy, width: 8, height: fh }}
        onPointerDown={(e) => dragText(e, { k, width, height, box, onSnap })}
        onDoubleClick={resetText}
        title={textTitle}
      />
      <div
        className={STRIP}
        style={{ left: fx + fw - 4, top: fy, width: 8, height: fh }}
        onPointerDown={(e) => dragText(e, { k, width, height, box, onSnap })}
        onDoubleClick={resetText}
        title={textTitle}
      />
      {/* Text grabber pill */}
      <div
        className="pointer-events-auto absolute flex h-6 w-8 cursor-grab items-center justify-center rounded-full border bg-background shadow-sm touch-none active:cursor-grabbing hover:bg-muted"
        style={{ left: fx + fw / 2 - 16, top: Math.max(2, fy - 26) }}
        onPointerDown={(e) => dragText(e, { k, width, height, box, onSnap })}
        onDoubleClick={resetText}
        title={textTitle}
      >
        <GripVertical className="size-3 text-muted-foreground" />
      </div>
      {/* Font-size handle (bottom-right corner) */}
      <Handle
        className="cursor-nwse-resize"
        style={{ left: fx + fw - 6, top: fy + fh - 6 }}
        title="Drag to resize the text (font size)"
        ariaLabel="Resize text font size"
        onPointerDown={(e) => {
          const anchor = clientAnchor(box.left, box.top);
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
      {/* Line-height handle (bottom-center) */}
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

      {/* Slider stack frame + handles */}
      {boxes.length > 0 && (
        <>
          <div
            className="absolute rounded-md border border-dashed border-foreground/30"
            style={{ left: ux * k, top: uy * k, width: uw * k, height: uh * k }}
          />
          <div
            className={STRIP}
            style={{ left: ux * k, top: uy * k - 4, width: uw * k, height: 8 }}
            onPointerDown={(e) =>
              dragPanel(e, { k, width, height, m, onSnap })
            }
            onDoubleClick={resetPanel}
            title={panelTitle}
          />
          <div
            className={STRIP}
            style={{ left: ux * k, top: ub * k - 4, width: uw * k, height: 8 }}
            onPointerDown={(e) =>
              dragPanel(e, { k, width, height, m, onSnap })
            }
            onDoubleClick={resetPanel}
            title={panelTitle}
          />
          <div
            className={STRIP}
            style={{ left: ux * k - 4, top: uy * k, width: 8, height: uh * k }}
            onPointerDown={(e) =>
              dragPanel(e, { k, width, height, m, onSnap })
            }
            onDoubleClick={resetPanel}
            title={panelTitle}
          />
          <div
            className={STRIP}
            style={{ left: ur * k - 4, top: uy * k, width: 8, height: uh * k }}
            onPointerDown={(e) =>
              dragPanel(e, { k, width, height, m, onSnap })
            }
            onDoubleClick={resetPanel}
            title={panelTitle}
          />
          <div
            className="pointer-events-auto absolute flex h-6 w-8 cursor-grab items-center justify-center rounded-full border bg-background shadow-sm touch-none active:cursor-grabbing hover:bg-muted"
            style={{ left: (ux + uw / 2) * k - 16, top: Math.max(2, uy * k - 26) }}
            onPointerDown={(e) =>
              dragPanel(e, { k, width, height, m, onSnap })
            }
            onDoubleClick={resetPanel}
            title={panelTitle}
          >
            <GripVertical className="size-3 text-muted-foreground" />
          </div>

          {/* Panel scale handle (panel bottom-right corner) */}
          {showPanel && m.panelH > 0 && (
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
                const start = useStudio.getState().overlayScale;
                scaleRatioDrag(e, anchor, (ratio) => {
                  useStudio
                    .getState()
                    .setOverlayScale(
                      Math.min(
                        2,
                        Math.max(0.6, Math.round(start * ratio * 20) / 20)
                      )
                    );
                });
              }}
            />
          )}

          {/* Track length handle (panel right edge, mid height) */}
          {showPanel && m.panelH > 0 && (
            <Handle
              className="cursor-ew-resize"
              style={{
                left: (m.panelX + m.panelW) * k - 6,
                top: (m.panelY + m.panelH / 2) * k - 6,
              }}
              title="Drag to change the track length"
              ariaLabel="Change slider track length"
              onPointerDown={(e) => {
                const start = useStudio.getState().overlayTrackLen;
                const scale = useStudio.getState().overlayScale;
                beginPointerDrag(e, (dx) => {
                  const delta = (dx / k / (width * scale)) * 100;
                  useStudio
                    .getState()
                    .setOverlayTrackLen(
                      Math.round(Math.min(100, Math.max(20, start + delta)))
                    );
                });
              }}
              onDoubleClick={() => useStudio.getState().setOverlayTrackLen(30)}
            />
          )}

          {/* Gap: text ↔ slider stack */}
          {textGapHandle}

          {/* Gap: panel ↔ CSS line */}
          {showPanel && showCss && m.cssBarH > 0 && m.panelH > 0 && (
            <Handle
              className="cursor-ns-resize rounded-full"
              style={{
                left: (m.cssBarX + m.cssBarW / 2) * k - 6,
                top: ((m.panelY + m.panelH + m.cssBarY) / 2) * k - 6,
              }}
              title="Drag to change the gap between sliders and the CSS line"
              ariaLabel="Change sliders and CSS line gap"
              onPointerDown={(e) => {
                const start = useStudio.getState().overlayCssGap;
                const fontPx = m.fontPx;
                beginPointerDrag(e, (_dx, dy) => {
                  const delta = dy / k / fontPx;
                  useStudio
                    .getState()
                    .setOverlayCssGap(
                      r1(Math.min(3, Math.max(0.2, start + delta)))
                    );
                });
              }}
              onDoubleClick={() => useStudio.getState().setOverlayCssGap(1.1)}
            />
          )}

          {/* Gap: between the first two slider rows */}
          {showPanel && axesCount >= 2 && (
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
                const start = useStudio.getState().overlayAxisGap;
                const fontPx = m.fontPx;
                beginPointerDrag(e, (_dx, dy) => {
                  const delta = dy / k / fontPx;
                  useStudio
                    .getState()
                    .setOverlayAxisGap(
                      r1(Math.min(rowGapMaxEm, Math.max(0.2, start + delta)))
                    );
                });
              }}
              onDoubleClick={() => useStudio.getState().setOverlayAxisGap(1.2)}
            />
          )}

          {/* Gap: axis name ↔ track (horizontal, first row) */}
          {showPanel && m.nameW > 0 && (
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
                const start = useStudio.getState().overlayNameGap;
                const fontPx = m.fontPx;
                beginPointerDrag(e, (dx) => {
                  const delta = dx / k / fontPx;
                  useStudio
                    .getState()
                    .setOverlayNameGap(
                      r1(Math.min(3, Math.max(0.2, start + delta)))
                    );
                });
              }}
              onDoubleClick={() => useStudio.getState().setOverlayNameGap(0.9)}
            />
          )}
        </>
      )}
    </div>
  );
}
