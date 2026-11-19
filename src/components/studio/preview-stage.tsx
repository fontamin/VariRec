"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
} from "react";
import { Type, Maximize2, Pencil, EyeOff, Settings2, Magnet } from "lucide-react";
import {
  REGISTERED_FAMILY,
  selectCurrentVariation,
  selectCurrentCssVariation,
  selectCurrentAxesInfo,
  useStudio,
} from "@/lib/studio-store";
import {
  computeOverlayMetrics,
  hexToRgba,
  formatValue,
  pillRadius,
  type OverlayMetrics,
  type TextBlock,
} from "@/lib/renderer";
import type { ThumbShape, VAlign } from "@/lib/studio-store-types";
import { resolveTextDirection } from "@/lib/renderer";
import { overlayCfgFrom, textBlockFor } from "@/lib/studio-metrics";
import { PreviewToolbar } from "@/components/studio/preview-toolbar";
import {
  EditChrome,
  dragPanel,
  type TextBox,
} from "@/components/studio/edit-chrome";
import { cn } from "@/lib/utils";

interface SliderRefs {
  fill: HTMLDivElement;
  thumb: HTMLDivElement | null; // plain shape thumb (pill mode: null)
  pill: HTMLDivElement | null; // value pill riding on the thumb
  pillText: HTMLElement | null; // the number inside the pill
}

// When there is no measurable text (e.g. the canvas text is empty), fall
// back to a caret-sized box at the alignment anchor so the text frame and
// its handles still have a sensible target.
function fallbackTextBox(
  align: "left" | "center" | "right",
  textOffsetX: number,
  width: number,
  fontSize: number,
  tb: TextBlock
): TextBox {
  const anchor =
    (align === "center" ? width / 2 : align === "right" ? width - 24 : 24) +
    textOffsetX;
  const w = Math.max(24, Math.min(fontSize * 1.5, width));
  const left = Math.min(Math.max(0, anchor - w / 2), Math.max(0, width - w));
  return { left, top: tb.top, width: w, height: tb.height };
}

function alignItemsFor(v: VAlign): string {
  return v === "top" ? "flex-start" : v === "bottom" ? "flex-end" : "center";
}

/**
 * Live, real-time preview of the variable font. The text is rendered with a
 * DOM element (not a canvas) so the browser animates `font-variation-settings`
 * smoothly at display refresh rate. The text is contentEditable — click it to
 * edit in place, edits sync straight into the store.
 *
 * A floating toolbar inside the preview exposes every styling control
 * (typography, alignment, colors, canvas size, slider overlay appearance).
 *
 * The text div intentionally has NO overflow clipping — glyphs with negative
 * side bearings (e.g. Persian «ر») overhang their line box, and the stage
 * container (which represents the export canvas bounds) is the only clip
 * boundary, matching the SVG frame renderer exactly.
 */
export function PreviewStage() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const cssRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, SliderRefs>());
  const [previewW, setPreviewW] = useState(800);
  const [editing, setEditing] = useState(false);
  const [toolbarVisible, setToolbarVisible] = useState(true);
  // Measured bounding box of the text (canvas px) — the edit frame hugs the
  // text itself instead of spanning the full canvas width.
  const [textBox, setTextBox] = useState<TextBox | null>(null);
  const [snapGuide, setSnapGuide] = useState(false);
  const measureRaf = useRef(0);
  const wasEditingRef = useRef(false);

  const fontLoaded = useStudio((s) => s.fontLoaded);
  const canvasWidth = useStudio((s) => s.canvasWidth);
  const canvasHeight = useStudio((s) => s.canvasHeight);
  const text = useStudio((s) => s.text);
  const bgColor = useStudio((s) => s.bgColor);
  const fontSize = useStudio((s) => s.fontSize);
  const lineHeight = useStudio((s) => s.lineHeight);
  const vAlign = useStudio((s) => s.vAlign);
  const textDirection = useStudio((s) => s.textDirection);
  const axes = useStudio((s) => s.axes);
  const setText = useStudio((s) => s.setText);
  const align = useStudio((s) => s.align);
  const snapCenterEnabled = useStudio((s) => s.snapCenterEnabled);
  const setSnapCenterEnabled = useStudio((s) => s.setSnapCenterEnabled);

  const overlayEnabled = useStudio((s) => s.overlayEnabled);
  const overlayShowSliders = useStudio((s) => s.overlayShowSliders);
  const overlayShowName = useStudio((s) => s.overlayShowName);
  const overlayShowTag = useStudio((s) => s.overlayShowTag);
  const overlayShowMinMax = useStudio((s) => s.overlayShowMinMax);
  const overlayShowLiveValue = useStudio((s) => s.overlayShowLiveValue);
  const overlayValueDecimals = useStudio((s) => s.overlayValueDecimals);
  const overlayShowCss = useStudio((s) => s.overlayShowCss);
  const overlayCentered = useStudio((s) => s.overlayCentered);
  const overlayFont = useStudio((s) => s.overlayFont);
  const overlayBold = useStudio((s) => s.overlayBold);
  const overlayFontScale = useStudio((s) => s.overlayFontScale);
  const overlayTrackLen = useStudio((s) => s.overlayTrackLen);
  const overlayNameGap = useStudio((s) => s.overlayNameGap);
  const overlayCssGap = useStudio((s) => s.overlayCssGap);
  const overlayColor = useStudio((s) => s.overlayColor);
  const overlayBgColor = useStudio((s) => s.overlayBgColor);
  const overlayBgOpacity = useStudio((s) => s.overlayBgOpacity);
  const overlayScale = useStudio((s) => s.overlayScale);
  const overlayPosition = useStudio((s) => s.overlayPosition);
  const overlayTextGap = useStudio((s) => s.overlayTextGap);
  const overlayThumbScale = useStudio((s) => s.overlayThumbScale);
  const overlayThumbShape = useStudio((s) => s.overlayThumbShape);
  const overlayAxisGap = useStudio((s) => s.overlayAxisGap);
  // Drag offsets — subscribed so dragging the frames re-renders live.
  const textOffsetX = useStudio((s) => s.textOffsetX);
  const textOffsetY = useStudio((s) => s.textOffsetY);
  const panelOffsetX = useStudio((s) => s.panelOffsetX);
  const panelOffsetY = useStudio((s) => s.panelOffsetY);

  const registerRow = useCallback((tag: string, refs: SliderRefs) => {
    rowRefs.current.set(tag, refs);
  }, []);
  const unregisterRow = useCallback((tag: string) => {
    rowRefs.current.delete(tag);
  }, []);

  // Measure the rendered text and store its canvas-px bounding box so the
  // edit frame hugs the text itself. Uses a DOM Range over the editable
  // element — the same glyphs, direction and letter-spacing the export uses.
  const measureTextBox = useCallback(() => {
    const el = textRef.current;
    const wrap = wrapperRef.current;
    if (!el || !wrap) return;
    const s = useStudio.getState();
    if (!s.fontLoaded) {
      setTextBox(null);
      return;
    }
    const kw = previewW / s.canvasWidth;
    if (!(kw > 0) || !Number.isFinite(kw)) return;
    const wrapRect = wrap.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = Array.from(range.getClientRects()).filter(
      (r) => r.width >= 0.5 && r.height >= 0.5
    );
    let box: TextBox;
    if (rects.length > 0) {
      const left = Math.min(...rects.map((r) => r.left));
      const top = Math.min(...rects.map((r) => r.top));
      const right = Math.max(...rects.map((r) => r.right));
      const bottom = Math.max(...rects.map((r) => r.bottom));
      box = {
        left: (left - wrapRect.left) / kw,
        top: (top - wrapRect.top) / kw,
        width: (right - left) / kw,
        height: (bottom - top) / kw,
      };
    } else {
      box = fallbackTextBox(
        s.align,
        s.textOffsetX,
        s.canvasWidth,
        s.fontSize,
        textBlockFor(s)
      );
    }
    if (
      ![box.left, box.top, box.width, box.height].every((v) =>
        Number.isFinite(v)
      )
    ) {
      return;
    }
    box.width = Math.max(8, box.width);
    box.height = Math.max(8, box.height);
    setTextBox((prev) => {
      const same =
        prev &&
        Math.abs(prev.left - box.left) < 0.75 &&
        Math.abs(prev.top - box.top) < 0.75 &&
        Math.abs(prev.width - box.width) < 0.75 &&
        Math.abs(prev.height - box.height) < 0.75;
      return same ? prev : box;
    });
  }, [previewW]);

  // Throttled to one measurement per animation frame and skipped while the
  // animation is playing, so the per-frame style applier never triggers
  // React re-renders.
  const scheduleMeasure = useCallback(() => {
    if (useStudio.getState().isPlaying) return;
    if (measureRaf.current) return;
    measureRaf.current = requestAnimationFrame(() => {
      measureRaf.current = 0;
      measureTextBox();
    });
  }, [measureTextBox]);

  useEffect(() => {
    return () => {
      if (measureRaf.current) cancelAnimationFrame(measureRaf.current);
    };
  }, []);

  const applyStyles = useCallback(() => {
    const s = useStudio.getState();
    const el = textRef.current;
    const wrap = wrapperRef.current;
    const cssEl = cssRef.current;
    if (!el || !wrap) return;
    const k = previewW / s.canvasWidth;
    el.style.fontFamily = `"${REGISTERED_FAMILY}", system-ui, sans-serif`;
    el.style.fontVariationSettings = selectCurrentVariation(s);
    el.style.fontSize = `${Math.max(1, s.fontSize * k)}px`;
    el.style.color = s.textColor;
    el.style.letterSpacing = `${s.letterSpacing * k}px`;
    el.style.lineHeight = String(s.lineHeight);
    el.style.textAlign = s.align;
    // "pre" (not pre-wrap): the SVG export renderer never wraps lines and
    // preserves every space (xml:space="preserve"), so the preview must not
    // wrap or collapse whitespace either — this is what keeps the export
    // pixel-faithful to the preview.
    el.style.whiteSpace = "pre";
    // Direct-manipulation drag offset (v1.1), mirrored by the SVG renderer.
    el.style.transform = `translate(${s.textOffsetX * k}px, ${s.textOffsetY * k}px)`;
    // Base text direction. "auto" clears the inline style so the dir=auto
    // attribute decides (first-strong rule); explicit values are forced.
    // Resolved with the same rule as the SVG export so both always match.
    el.style.direction =
      s.textDirection === "auto" ? "" : resolveTextDirection(s.text, s.textDirection);
    // Keep an empty editable line tall enough to click & show the caret.
    el.style.minHeight = `${Math.max(1, s.fontSize * k * s.lineHeight)}px`;
    // Match the SVG renderer's 24px side margins.
    el.style.paddingLeft = `${24 * k}px`;
    el.style.paddingRight = `${24 * k}px`;
    wrap.style.background = s.bgColor;
    // Vertical alignment of the text block (mirrors the SVG renderer).
    wrap.style.alignItems = alignItemsFor(s.vAlign);
    wrap.style.paddingTop = `${24 * k}px`;
    wrap.style.paddingBottom = `${24 * k}px`;

    // Slider dynamics (per frame).
    const m = computeOverlayMetrics(
      s.canvasWidth,
      s.canvasHeight,
      overlayCfgFrom(s),
      textBlockFor(s)
    );
    for (const a of selectCurrentAxesInfo(s)) {
      const refs = rowRefs.current.get(a.tag);
      if (!refs) continue;
      const t = Math.min(
        1,
        Math.max(0, (a.value - a.min) / (a.max - a.min || 1))
      );
      const pct = `${t * 100}%`;
      refs.fill.style.width = pct;
      if (refs.thumb) refs.thumb.style.left = pct;
      if (refs.pill && refs.pillText) {
        // Pill centre follows the value across the FULL track — no
        // end-clamping — so the thumb is always moving whenever the number
        // changes. It may overhang the track ends; the row reserves pill
        // room for that (m.pillBuffer), matching the SVG export renderer.
        refs.pill.style.left = `${t * m.trackW * k}px`;
        refs.pillText.textContent = formatValue(
          a.value,
          s.overlayValueDecimals
        );
      }
    }

    // CSS code line.
    if (cssEl) {
      cssEl.textContent = `font-variation-settings: ${selectCurrentCssVariation(s)};`;
    }

    // The text frame hugs the text, so re-measure whenever anything that
    // affects glyph advances changed (variation, size, spacing, text…).
    scheduleMeasure();
  }, [previewW, scheduleMeasure]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) setPreviewW(w);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    applyStyles();
  });

  useEffect(() => {
    const unsub = useStudio.subscribe(applyStyles);
    return unsub;
  }, [applyStyles]);

  // Keep store text → DOM in sync, but never clobber the DOM while the user
  // is editing in place (that would reset the caret).
  useEffect(() => {
    const el = textRef.current;
    if (!el || !fontLoaded) return;
    if (document.activeElement === el) return;
    if (el.innerText !== text) el.innerText = text;
  }, [text, fontLoaded]);

  const handleInput = useCallback(
    (e: FormEvent<HTMLDivElement>) => {
      // Strip trailing newlines contenteditable tends to accumulate.
      setText(e.currentTarget.innerText.replace(/\n+$/, ""));
    },
    [setText]
  );

  const handleBlur = useCallback(() => {
    setEditing(false);
    const el = textRef.current;
    if (!el) return;
    const clean = el.innerText.replace(/\n+$/, "");
    if (el.innerText !== clean) el.innerText = clean;
    if (clean !== useStudio.getState().text) setText(clean);
  }, [setText]);

  const exitEdit = useCallback(() => {
    // Blur runs handleBlur: trailing-newline cleanup + editing=false.
    textRef.current?.blur();
  }, []);

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLDivElement>) => {
      e.preventDefault();
      const t = e.clipboardData.getData("text/plain");
      document.execCommand("insertText", false, t);
    },
    []
  );

  const aspect = canvasWidth / canvasHeight;
  const k = previewW / canvasWidth; // px scale preview↔canvas

  const tb = textBlockFor(useStudio.getState());
  const m = computeOverlayMetrics(
    canvasWidth,
    canvasHeight,
    overlayCfgFrom(useStudio.getState()),
    tb
  );
  const effBox =
    textBox ?? fallbackTextBox(align, textOffsetX, canvasWidth, fontSize, tb);
  const showSliders =
    overlayEnabled && overlayShowSliders && axes.length > 0;
  const showCssBar = overlayEnabled && overlayShowCss;
  const panelBg =
    overlayBgOpacity > 0 ? hexToRgba(overlayBgColor, overlayBgOpacity) : undefined;
  const wrapperAlignItems = alignItemsFor(vAlign);

  // Where should the floating toolbar sit? Pick the side (top/bottom) with
  // more free vertical room, avoiding both the text block and the baked
  // overlay stack. Only force it to the top when the bottom is too tight.
  const hasStack = showSliders || showCssBar;
  const stackTop = showSliders
    ? m.panelY
    : showCssBar
      ? m.cssBarY
      : Number.POSITIVE_INFINITY;
  const stackBottom = showSliders
    ? m.cssOn
      ? m.cssBarY + m.cssBarH
      : m.panelY + m.panelH
    : showCssBar
      ? m.cssBarY + m.cssBarH
      : 0;
  const hasText = text.length > 0;
  const scoreTop = Math.min(
    hasStack ? stackTop : Number.POSITIVE_INFINITY,
    hasText ? tb.top : Number.POSITIVE_INFINITY
  );
  const scoreBottom =
    canvasHeight -
    Math.max(hasStack ? stackBottom : 0, hasText ? tb.bottom : 0);
  const toolbarBand = 52 / k; // toolbar height in canvas px, with margin
  const placeTop =
    scoreBottom < toolbarBand ? scoreTop > scoreBottom : false;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium">
          <Type className="size-3.5 text-muted-foreground" />
          Preview
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="hidden items-center gap-1 border-r pr-1.5 sm:flex">
            <Pencil className="size-2.5" />
            click text to edit
          </span>
          <button
            type="button"
            title="Snap to width center while dragging"
            aria-label="Snap to width center"
            aria-pressed={snapCenterEnabled}
            onClick={() => setSnapCenterEnabled(!snapCenterEnabled)}
            className={cn(
              "flex size-6 items-center justify-center rounded-md border transition-colors",
              snapCenterEnabled
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-background text-muted-foreground hover:bg-muted"
            )}
          >
            <Magnet className="size-3" />
          </button>
          <Maximize2 className="size-3" />
          {canvasWidth} × {canvasHeight}
        </div>
      </div>

      <div
        className={cn(
          "relative w-full overflow-hidden rounded-lg border bg-muted/40 ring-1 ring-inset ring-black/[0.03]",
          fontLoaded ? "shadow-sm" : ""
        )}
        style={{ aspectRatio: String(aspect) }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(45deg,#00000008 25%,transparent 25%),linear-gradient(-45deg,#00000008 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#00000008 75%),linear-gradient(-45deg,transparent 75%,#00000008 75%)",
            backgroundSize: "20px 20px",
            backgroundPosition: "0 0,0 10px,10px -10px,-10px 0",
          }}
        />
        <div
          ref={wrapperRef}
          className="absolute inset-0 flex cursor-text justify-center"
          style={{
            background: bgColor,
            alignItems: wrapperAlignItems,
            paddingTop: 24 * k,
            paddingBottom: 24 * k,
          }}
          onPointerDownCapture={() => {
            // Record the edit state BEFORE the native mousedown blur, so the
            // click handler below can tell "exit edit" from "start edit".
            wasEditingRef.current = editing;
          }}
          onClick={(e) => {
            if (!fontLoaded) return;
            // Clicks on the text itself are native caret handling.
            if (
              textRef.current &&
              e.target instanceof Node &&
              textRef.current.contains(e.target)
            ) {
              return;
            }
            if (wasEditingRef.current) {
              // Clicking elsewhere inside the preview exits edit mode.
              wasEditingRef.current = false;
              exitEdit();
              return;
            }
            textRef.current?.focus();
          }}
        >
          {fontLoaded ? (
            <div
              ref={textRef}
              className="w-full outline-none"
              contentEditable={fontLoaded}
              suppressContentEditableWarning
              spellCheck={false}
              dir={textDirection}
              style={{
                fontSize: Math.max(1, fontSize * k),
              }}
              onInput={handleInput}
              onBlur={handleBlur}
              onFocus={() => setEditing(true)}
              onPaste={handlePaste}
              onKeyDown={(e) => {
                // Esc leaves in-place editing (blur runs the same cleanup).
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  exitEdit();
                }
              }}
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-center text-muted-foreground">
              <Type className="size-7 opacity-40" />
              <p className="text-xs">Load a variable font to begin</p>
              <p className="text-[11px] opacity-70">
                Drag &amp; drop a .ttf / .otf / .woff / .woff2 file on the left
              </p>
            </div>
          )}
        </div>

        {/* Placeholder when the editable text is empty */}
        {fontLoaded && !text && !editing && (
          <div
            className="pointer-events-none absolute inset-0 flex justify-center"
            style={{
              alignItems: wrapperAlignItems,
              paddingTop: 24 * k,
              paddingBottom: 24 * k,
            }}
          >
            <span
              className="text-muted-foreground/50"
              style={{ fontSize: Math.max(10, 16 * k) }}
            >
              Type something…
            </span>
          </div>
        )}

        {/* Axis slider overlay — mirrors the baked SVG geometry. The panel
            body is directly draggable (v1.1); the drag delta is stored as a
            canvas-px offset that the SVG export renderer applies too. */}
        {showSliders && (
          <div
            className="absolute cursor-grab touch-none select-none active:cursor-grabbing"
            title="Drag to move the sliders · double-click to reset"
            onPointerDown={(e) =>
              dragPanel(e, {
                k,
                width: canvasWidth,
                height: canvasHeight,
                m,
                onSnap: setSnapGuide,
              })
            }
            onDoubleClick={() =>
              useStudio.getState().setPanelOffset(0, 0)
            }
            style={{
              left: m.panelX * k,
              top: m.panelY * k,
              width: m.panelW * k,
              padding: m.innerPad * k,
              borderRadius: m.panelRx * k,
              background: panelBg,
            }}
          >
            {axes.map((axis, i) => (
              <AxisSliderRow
                key={axis.tag}
                tag={axis.tag}
                name={axis.name}
                min={axis.min}
                max={axis.max}
                current={axis.current}
                index={i}
                count={axes.length}
                showName={overlayShowName}
                showTag={overlayShowTag}
                decimals={overlayValueDecimals}
                color={overlayColor}
                font={overlayFont}
                bold={overlayBold}
                shape={overlayThumbShape}
                m={m}
                k={k}
                register={registerRow}
                unregister={unregisterRow}
              />
            ))}
          </div>
        )}

        {/* CSS code line — draggable like the slider panel */}
        {showCssBar && (
          <div
            ref={cssRef}
            className="absolute cursor-grab touch-none select-none overflow-hidden whitespace-nowrap active:cursor-grabbing"
            title="Drag to move the CSS line · double-click to reset"
            onPointerDown={(e) =>
              dragPanel(e, {
                k,
                width: canvasWidth,
                height: canvasHeight,
                m,
                onSnap: setSnapGuide,
              })
            }
            onDoubleClick={() =>
              useStudio.getState().setPanelOffset(0, 0)
            }
            style={{
              left: m.cssBarX * k,
              top: m.cssBarY * k,
              width: m.cssBarW * k,
              height: m.cssBarH * k,
              borderRadius: m.panelRx * k,
              background: panelBg,
              fontFamily: overlayFont,
              fontWeight: overlayBold ? 700 : 400,
              color: overlayColor,
              fontSize: m.cssFontPx * k,
              lineHeight: `${m.cssBarH * k}px`,
              textAlign: overlayCentered ? "center" : "left",
              paddingLeft: overlayCentered ? 0 : m.innerPad * k,
              paddingRight: overlayCentered ? 0 : m.innerPad * k,
            }}
          />
        )}

        {/* Direct-manipulation frames & handles (v1.1) — hidden while the
            text is being edited so the caret interactions stay untouched,
            and when the toolbar is hidden for a clean preview. */}
        {fontLoaded && toolbarVisible && !editing && (
          <EditChrome
            box={effBox}
            m={m}
            k={k}
            width={canvasWidth}
            height={canvasHeight}
            showPanel={showSliders}
            showCss={showCssBar}
            axesCount={axes.length}
            lineCount={Math.max(1, text.split("\n").length)}
            onSnap={setSnapGuide}
          />
        )}

        {/* Snap guide — vertical dashed line at the canvas width centre,
            shown while a dragged element is magnetised to it. */}
        {snapGuide && (
          <div
            className="pointer-events-none absolute inset-y-0 z-10 w-px"
            style={{
              left: `${(canvasWidth / 2) * k}px`,
              backgroundImage:
                "linear-gradient(to bottom, rgba(125,125,125,0.95) 50%, rgba(255,255,255,0.9) 50%)",
              backgroundSize: "1px 7px",
            }}
            aria-hidden
          />
        )}

        {/* Toolbar show/hide toggle */}
        {fontLoaded && (
          <button
            type="button"
            className="absolute right-2 top-2 z-20 flex size-7 items-center justify-center rounded-lg border bg-background/85 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-muted hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              setToolbarVisible((v) => !v);
            }}
            title={toolbarVisible ? "Hide style toolbar" : "Show style toolbar"}
            aria-label={toolbarVisible ? "Hide style toolbar" : "Show style toolbar"}
            aria-pressed={toolbarVisible}
          >
            {toolbarVisible ? (
              <EyeOff className="size-3.5" />
            ) : (
              <Settings2 className="size-3.5" />
            )}
          </button>
        )}

        {/* Floating in-preview style editor */}
        {fontLoaded && toolbarVisible && <PreviewToolbar placeTop={placeTop} />}
      </div>
    </div>
  );
}

function AxisSliderRow({
  tag,
  name,
  min,
  max,
  current,
  index,
  count,
  showName,
  showTag,
  decimals,
  color,
  font,
  bold,
  shape,
  m,
  k,
  register,
  unregister,
}: {
  tag: string;
  name: string;
  min: number;
  max: number;
  current: number;
  index: number;
  count: number;
  showName: boolean;
  showTag: boolean;
  decimals: number;
  color: string;
  font: string;
  bold: boolean;
  shape: ThumbShape;
  m: OverlayMetrics;
  k: number;
  register: (tag: string, refs: SliderRefs) => void;
  unregister: (tag: string) => void;
}) {
  const fillRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const pillTextRef = useRef<HTMLSpanElement>(null);
  const hasValue = m.pillOn; // value pill rides ON the thumb (replaces it)

  // Register in a layout effect so refs exist before the parent's
  // layout-effect style applier runs on the same commit.
  useLayoutEffect(() => {
    if (fillRef.current) {
      register(tag, {
        fill: fillRef.current,
        thumb: hasValue ? null : thumbRef.current,
        pill: hasValue ? pillRef.current : null,
        pillText: hasValue ? pillTextRef.current : null,
      });
    }
    return () => unregister(tag);
  }, [tag, hasValue, register, unregister]);

  const label = [showName ? name : "", showTag ? `(${tag})` : ""]
    .filter(Boolean)
    .join(" ");
  const trackW = m.trackW * k;
  const trackH = m.trackH * k;
  const thumbSize = m.thumbD * k;
  const thumbRadius =
    shape === "circle"
      ? thumbSize / 2
      : shape === "rounded"
        ? thumbSize * 0.42
        : shape === "diamond"
          ? thumbSize * 0.18
          : 0;
  const thumbTransform =
    shape === "diamond"
      ? "translate(-50%,-50%) rotate(45deg)"
      : "translate(-50%,-50%)";
  const init = thumbInitial(current, min, max);
  const pillInit = pillInitial(current, min, max, m) * k;
  const pillRadiusPx = pillRadius(shape, Math.min(m.pillW, m.pillH)) * k;

  // One compact row: [name] [min] — track — [max]. The name sits inline
  // BEFORE the track, so the row height never depends on the name toggle;
  // the value pill rides ON the thumb, so it never depends on it either.
  return (
    <div style={{ marginBottom: index < count - 1 ? m.axisGap * k : 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: m.trackRowH * k,
          // Room for the value pill to overhang the track ends (mirrors the
          // SVG export renderer's pillBuffer).
          paddingLeft: m.pillBuffer * k,
          paddingRight: m.pillBuffer * k,
        }}
      >
        {m.nameW > 0 && (
          <span
            style={{
              width: m.nameW * k,
              marginRight: m.nameGapPx * k,
              fontSize: m.fontPx * k,
              color,
              fontFamily: font,
              fontWeight: bold ? 700 : 400,
              lineHeight: 1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              flexShrink: 0,
              // Right-aligned inside the fixed slot, so every axis name ends
              // at the SAME distance from the start of its own track
              // (mirrors text-anchor="end" in the SVG export renderer).
              textAlign: "right",
              direction: "ltr",
            }}
          >
            {label}
          </span>
        )}
        {m.minMaxLabelW > 0 && (
          <span
            style={{
              width: m.minMaxLabelW * k,
              marginRight: m.flankGap * k,
              fontSize: m.minMaxFont * k,
              color,
              opacity: 0.75,
              fontFamily: font,
              fontWeight: bold ? 700 : 400,
              textAlign: "right",
              lineHeight: 1,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {min}
          </span>
        )}
        <div
          style={{
            position: "relative",
            width: trackW,
            height: trackH,
            background: hexToRgba(color, 0.22),
            borderRadius: trackH / 2,
            flexShrink: 0,
          }}
        >
          <div
            ref={fillRef}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              height: "100%",
              width: init,
              background: hexToRgba(color, 0.7),
              borderRadius: trackH / 2,
            }}
          />
          {!hasValue && (
            <div
              ref={thumbRef}
              style={{
                position: "absolute",
                top: "50%",
                left: init,
                width: thumbSize,
                height: thumbSize,
                borderRadius: thumbRadius,
                background: color,
                transform: thumbTransform,
              }}
            />
          )}
          {hasValue && (
            <div
              ref={pillRef}
              style={{
                position: "absolute",
                top: "50%",
                left: pillInit,
                width: m.pillW * k,
                height: m.pillH * k,
                borderRadius: pillRadiusPx,
                background: color,
                transform: "translate(-50%,-50%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span
                ref={pillTextRef}
                style={{
                  fontSize: m.pillFont * k,
                  lineHeight: 1,
                  color: m.pillTextFill,
                  fontFamily: font,
                  fontWeight: bold ? 700 : 400,
                  whiteSpace: "nowrap",
                }}
              >
                {formatValue(current, decimals)}
              </span>
            </div>
          )}
        </div>
        {m.minMaxLabelW > 0 && (
          <span
            style={{
              width: m.minMaxLabelW * k,
              marginLeft: m.flankGap * k,
              fontSize: m.minMaxFont * k,
              color,
              opacity: 0.75,
              fontFamily: font,
              fontWeight: bold ? 700 : 400,
              textAlign: "left",
              lineHeight: 1,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {max}
          </span>
        )}
      </div>
    </div>
  );
}

function thumbInitial(value: number, min: number, max: number): string {
  const t = Math.min(1, Math.max(0, (value - min) / (max - min || 1)));
  return `${t * 100}%`;
}

// Pill centre offset (canvas px, track-local). Follows the value across the
// FULL track with no end-clamping, matching the SVG renderer exactly.
function pillInitial(
  value: number,
  min: number,
  max: number,
  m: OverlayMetrics
): number {
  const t = Math.min(1, Math.max(0, (value - min) / (max - min || 1)));
  return t * m.trackW;
}
