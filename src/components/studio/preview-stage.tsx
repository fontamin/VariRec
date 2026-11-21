"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Type, Maximize2, Pencil, EyeOff, Settings2, Magnet } from "lucide-react";
import {
  REGISTERED_FAMILY,
  selectCurrentVariation,
  selectCurrentCssVariation,
  selectCurrentAxesInfo,
  useStudio,
} from "@/lib/studio-store";
import { useShallow } from "zustand/react/shallow";
import {
  computeAxisValues,
  computeOverlayMetrics,
  computeTextBlock,
  hexToRgba,
  formatValue,
  pillRadius,
  resolveTextDirection,
  type OverlayMetrics,
  type TextBlock,
} from "@/lib/renderer";
import {
  buildOutlineFrame,
  ensureOutlineEngine,
  measureTextInkBox,
  outlineEngineReady,
} from "@/lib/outline";
import type { LayerId, ThumbShape, VAlign } from "@/lib/studio-store-types";
import { overlayCfgFrom, textBlockFor } from "@/lib/studio-metrics";
import { PreviewToolbar } from "@/components/studio/preview-toolbar";
import {
  EditChrome,
  dragCss,
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
  const outlineSvgRef = useRef<SVGSVGElement>(null);
  // Cached browser line metrics (fontBoundingBox*) for the loaded font —
  // the preview outline layer aligns with the REAL DOM baseline via these.
  const fontMetricsRef = useRef<{
    key: string;
    ascent: number;
    descent: number;
  } | null>(null);
  const rowRefs = useRef(new Map<string, SliderRefs>());
  const [previewW, setPreviewW] = useState(800);
  const [editing, setEditing] = useState(false);
  const [toolbarVisible, setToolbarVisible] = useState(true);
  // Measured VISUAL (ink) bounding box of the text (canvas px) — the edit
  // frame hugs the glyphs themselves instead of the ascender/descender line
  // box.
  const [textBox, setTextBox] = useState<TextBox | null>(null);
  // Ref mirror of the measured ink box — hit-testing (enter/exit edit) must
  // always see the LATEST box, not the one from the last React render.
  const textBoxRef = useRef<TextBox | null>(null);
  // Real ink box of the glyph-outline layer, reported by applyStyles after
  // each frame build (scale-aware — the chrome hugs the wireframe itself).
  const [outlineBox, setOutlineBox] = useState<TextBox | null>(null);
  const [snapGuide, setSnapGuide] = useState(false);
  const measureRaf = useRef(0);
  const wasEditingRef = useRef(false);
  // Lazily-created detached canvas used for ink measurement.
  const inkCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const lastOutlineInkRef = useRef<TextBox | null>(null);

  // Grouped store subscriptions (useShallow) instead of ~35 individual
  // useStudio calls. The overlay settings live in ONE object — a plain
  // selector is exact because setOverlay always replaces the object.
  const overlay = useStudio((s) => s.overlay);
  // Glyph-outline layer settings (Layers tool) — a plain selector is exact
  // because setOutline always replaces the object.
  const outline = useStudio((s) => s.outline);
  // Z-order of the baked layers (bottom → top). The array only changes
  // identity when moveLayer swaps entries, so a plain selector is exact.
  const layerOrder = useStudio((s) => s.layerOrder);
  const axes = useStudio((s) => s.axes);
  const {
    fontLoaded,
    canvasWidth,
    canvasHeight,
    text,
    bgColor,
    fontSize,
    lineHeight,
    vAlign,
    textDirection,
    align,
    snapCenterEnabled,
    showTextLayer,
    fontSfnt,
  } = useStudio(
    useShallow((s) => ({
      fontLoaded: s.fontLoaded,
      canvasWidth: s.canvasWidth,
      canvasHeight: s.canvasHeight,
      text: s.text,
      bgColor: s.bgColor,
      fontSize: s.fontSize,
      lineHeight: s.lineHeight,
      vAlign: s.vAlign,
      textDirection: s.textDirection,
      align: s.align,
      snapCenterEnabled: s.snapCenterEnabled,
      showTextLayer: s.showTextLayer,
      fontSfnt: s.fontSfnt,
    }))
  );
  // Drag offsets — subscribed so dragging the frames re-renders live.
  const {
    textOffsetX,
    textOffsetY,
    outlineOffsetX,
    outlineOffsetY,
    panelOffsetX,
    panelOffsetY,
    cssOffsetX,
    cssOffsetY,
  } = useStudio(
    useShallow((s) => ({
      textOffsetX: s.textOffsetX,
      textOffsetY: s.textOffsetY,
      outlineOffsetX: s.outlineOffsetX,
      outlineOffsetY: s.outlineOffsetY,
      panelOffsetX: s.panelOffsetX,
      panelOffsetY: s.panelOffsetY,
      cssOffsetX: s.cssOffsetX,
      cssOffsetY: s.cssOffsetY,
    }))
  );
  const { setText, setSnapCenterEnabled } = useStudio(
    useShallow((s) => ({
      setText: s.setText,
      setSnapCenterEnabled: s.setSnapCenterEnabled,
    }))
  );

  const registerRow = useCallback((tag: string, refs: SliderRefs) => {
    rowRefs.current.set(tag, refs);
  }, []);
  const unregisterRow = useCallback((tag: string) => {
    rowRefs.current.delete(tag);
  }, []);

  // Detached 8×8 canvas + 2D context for text metrics (ink box + line
  // metrics). It never needs layout — only measureText.
  const getInkCtx = useCallback(() => {
    if (!inkCtxRef.current) {
      const c = document.createElement("canvas");
      c.width = 8;
      c.height = 8;
      inkCtxRef.current = c.getContext("2d");
    }
    return inkCtxRef.current;
  }, []);

  // Cached browser line metrics (fontBoundingBox*) for the loaded font —
  // shared by the ink measurement (baseline positions) and the outline
  // layer's DOM baseline, so both agree with the real DOM line boxes.
  const ensureFontMetrics = useCallback(
    (s: { fontBase64: string; fontSize: number }) => {
      const mKey = `${s.fontBase64}|${s.fontSize}`;
      if (fontMetricsRef.current?.key === mKey) return fontMetricsRef.current;
      const c = document.createElement("canvas");
      c.width = 8;
      c.height = 8;
      const cctx = c.getContext("2d");
      let ascent = s.fontSize * 0.8;
      let descent = s.fontSize * 0.2;
      if (cctx) {
        cctx.font = `${s.fontSize}px "${REGISTERED_FAMILY}"`;
        const tm = cctx.measureText("ا");
        // fontBoundingBox* reflects the ascent/descent the browser uses
        // for inline line layout (hhea for Vazirmatn-class fonts).
        if (tm.fontBoundingBoxAscent > 0) ascent = tm.fontBoundingBoxAscent;
        if (tm.fontBoundingBoxDescent > 0) descent = tm.fontBoundingBoxDescent;
      }
      const fm = { key: mKey, ascent, descent };
      fontMetricsRef.current = fm;
      return fm;
    },
    []
  );

  // Measure the VISUAL ink rectangle of the rendered text (canvas px) so
  // the edit frame hugs the glyphs themselves — NOT the font's
  // ascender/descender line box. Primary path: fontkit shaping (the same
  // engine as the outline layer) — exact for every variation instance.
  // Fallback: canvas measureText with actualBoundingBox* (tight, but stuck
  // on the default instance since canvas cannot style variable axes).
  // Multi-line text unions the per-line ink.
  const measureTextBox = useCallback(() => {
    const s = useStudio.getState();
    if (!s.fontLoaded) {
      textBoxRef.current = null;
      setTextBox(null);
      return;
    }
    const lines = s.text.length ? s.text.split("\n") : [""];
    const fm = ensureFontMetrics(s);
    const lineH = s.fontSize * s.lineHeight;
    // The browser's real line-box baseline: half-leading + ascent (the
    // same formula the outline layer's DOM mode uses — validated).
    const baselineTerm = (lineH - (fm.ascent + fm.descent)) / 2 + fm.ascent;
    const blockTopAuto = computeTextBlock(
      s.canvasHeight,
      s.fontSize,
      s.lineHeight,
      Math.max(1, lines.length),
      s.vAlign
    ).top;
    const anchorX =
      (s.align === "center"
        ? s.canvasWidth / 2
        : s.align === "right"
          ? s.canvasWidth - 24
          : 24) + s.textOffsetX;
    let ink: { left: number; top: number; width: number; height: number } | null =
      null;
    // 1 — exact, variation-aware: fontkit ink of the laid-out glyphs.
    if (s.fontSfnt && outlineEngineReady()) {
      ink = measureTextInkBox({
        sfnt: s.fontSfnt,
        text: s.text,
        variation: computeAxisValues(
          s.axes,
          s.currentTime,
          s.easing,
          s.axisMoveMode
        ),
        fontSize: s.fontSize,
        letterSpacing: s.letterSpacing,
        lineHeight: s.lineHeight,
        align: s.align,
        direction: resolveTextDirection(s.text, s.textDirection),
        // anchorX carries the horizontal drag offset and blockTop the
        // vertical one, so the frame follows the text in BOTH axes while
        // it is dragged.
        anchorX,
        blockTop: blockTopAuto + s.textOffsetY,
        ascent: fm.ascent,
        descent: fm.descent,
      });
    }
    // 2 — fallback: canvas ink metrics (default instance). Also covers the
    // no-engine / no-ink cases of the fontkit path.
    if (!ink) {
      const ctx = getInkCtx();
      if (ctx) {
        ctx.font = `${s.fontSize}px "${REGISTERED_FAMILY}", system-ui, sans-serif`;
        // Canvas letter-spacing (Chromium) mirrors the CSS letter-spacing
        // of the preview text, trailing spacing included.
        const spaced = ctx as CanvasRenderingContext2D & {
          letterSpacing?: string;
        };
        if (typeof spaced.letterSpacing === "string") {
          spaced.letterSpacing = `${s.letterSpacing}px`;
        }
        ctx.direction = resolveTextDirection(s.text, s.textDirection);
        ctx.textAlign = s.align;
        ctx.textBaseline = "alphabetic";
        let l = Infinity;
        let t = Infinity;
        let r = -Infinity;
        let b = -Infinity;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (!line) continue;
          const mtr = ctx.measureText(line);
          const asc = mtr.actualBoundingBoxAscent;
          const desc = mtr.actualBoundingBoxDescent;
          const leftD = mtr.actualBoundingBoxLeft;
          const rightD = mtr.actualBoundingBoxRight;
          // Whitespace-only lines carry no ink — skip them.
          if (asc === 0 && desc === 0 && leftD === 0 && rightD === 0) continue;
          const by = blockTopAuto + s.textOffsetY + i * lineH + baselineTerm;
          l = Math.min(l, anchorX - leftD);
          r = Math.max(r, anchorX + rightD);
          t = Math.min(t, by - asc);
          b = Math.max(b, by + desc);
        }
        if (l !== Infinity) {
          ink = { left: l, top: t, width: r - l, height: b - t };
        }
      }
    }
    if (!ink) {
      // No ink anywhere (empty / whitespace text, no engine yet) — fall
      // back to the caret-sized box at the alignment anchor.
      textBoxRef.current = null;
      setTextBox(null);
      return;
    }
    const box: TextBox = {
      left: ink.left,
      top: ink.top,
      width: Math.max(8, ink.width),
      height: Math.max(8, ink.height),
    };
    if (
      ![box.left, box.top, box.width, box.height].every((v) =>
        Number.isFinite(v)
      )
    ) {
      return;
    }
    textBoxRef.current = box;
    setTextBox((prev) => {
      const same =
        prev &&
        Math.abs(prev.left - box.left) < 0.75 &&
        Math.abs(prev.top - box.top) < 0.75 &&
        Math.abs(prev.width - box.width) < 0.75 &&
        Math.abs(prev.height - box.height) < 0.75;
      return same ? prev : box;
    });
  }, [getInkCtx, ensureFontMetrics]);

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
    // The text layer can be hidden independently of the outline layer: a
    // transparent fill keeps the text editable (caret visible, hit-testing
    // intact) while the glyphs themselves disappear.
    el.style.color = s.showTextLayer ? s.textColor : "transparent";
    el.style.caretColor = s.textColor;
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
    wrap.style.alignItems = alignItemsFor(s.vAlign);
    wrap.style.paddingTop = `${24 * k}px`;
    wrap.style.paddingBottom = `${24 * k}px`;

    // Slider dynamics (per frame).
    const m = computeOverlayMetrics(
      s.canvasWidth,
      s.canvasHeight,
      overlayCfgFrom(s)
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
          s.overlay.valueDecimals
        );
      }
    }

    // CSS code line.
    if (cssEl) {
      cssEl.textContent = `font-variation-settings: ${selectCurrentCssVariation(s)};`;
    }

    // Glyph-outline layer — rebuilt every frame from the CURRENT variation
    // values so it stays in lockstep with the text (axes, size, spacing,
    // line height, align, direction). Baseline uses the browser's real line
    // metrics so the wireframe sits exactly on the DOM glyph baselines.
    const outlineEl = outlineSvgRef.current;
    if (outlineEl) {
      if (s.fontLoaded && s.outline.enabled && s.fontSfnt) {
        const fm = ensureFontMetrics(s);
        const frame = buildOutlineFrame({
          sfnt: s.fontSfnt,
          text: s.text,
          variation: computeAxisValues(
            s.axes,
            s.currentTime,
            s.easing,
            s.axisMoveMode
          ),
          fontSize: s.fontSize,
          letterSpacing: s.letterSpacing,
          lineHeight: s.lineHeight,
          align: s.align,
          direction: resolveTextDirection(s.text, s.textDirection),
          width: s.canvasWidth,
          height: s.canvasHeight,
          offsetX: s.outlineOffsetX,
          offsetY: s.outlineOffsetY,
          settings: s.outline,
          baseline: { mode: "dom", ascent: fm.ascent, descent: fm.descent },
          blockTop: computeTextBlock(
            s.canvasHeight,
            s.fontSize,
            s.lineHeight,
            Math.max(1, s.text.split("\n").length),
            s.vAlign
          ).top,
        });
        if (outlineEl.innerHTML !== frame.svg) {
          outlineEl.innerHTML = frame.svg;
        }
        // Report the outline's REAL ink box (scale-aware) so the edit chrome
        // hugs the wireframe itself. Skipped while playing — the chrome
        // refreshes on the next applyStyles after playback stops.
        if (!s.isPlaying) {
          const ib = frame.inkBox;
          const prev = lastOutlineInkRef.current;
          const same =
            ib === null
              ? prev === null
              : prev !== null &&
                Math.abs(prev.left - ib.left) < 0.75 &&
                Math.abs(prev.top - ib.top) < 0.75 &&
                Math.abs(prev.width - ib.width) < 0.75 &&
                Math.abs(prev.height - ib.height) < 0.75;
          if (!same) {
            const next = ib
              ? {
                  left: ib.left,
                  top: ib.top,
                  width: ib.width,
                  height: ib.height,
                }
              : null;
            lastOutlineInkRef.current = next;
            setOutlineBox(next);
          }
        }
      } else {
        if (outlineEl.innerHTML !== "") {
          outlineEl.innerHTML = "";
        }
        if (lastOutlineInkRef.current !== null) {
          lastOutlineInkRef.current = null;
          setOutlineBox(null);
        }
      }
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

  // The shaping engine (fontkit + bidi-js) powers BOTH the glyph-outline
  // layer and the variation-aware ink measurement of the text frame — load
  // it as soon as a font is in, then re-apply styles so the layer and the
  // corrected frame appear without a store change.
  useEffect(() => {
    if (!fontSfnt) return;
    let alive = true;
    // ensureOutlineEngine never rejects (failures resolve after retries are
    // exhausted), but the catch keeps any unexpected error from surfacing
    // as an unhandled-rejection toast.
    ensureOutlineEngine()
      .then(() => {
        if (alive) applyStyles();
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [fontSfnt, applyStyles]);

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

  // Enter in-place editing and drop the caret where the user tapped. Called
  // from the text body drag surface (EditChrome onTap) with client px. Focus
  // first so the caret is visible at all, then on the next animation frame
  // place it at the point via the caret-from-point APIs —
  // caretPositionFromPoint (standard) with caretRangeFromPoint (Chrome/
  // Safari legacy) as the fallback. Either can miss (tap over padding or
  // between lines): then the caret goes to the start of the text.
  const startEditAt = useCallback(
    (clientX: number, clientY: number) => {
      const el = textRef.current;
      if (!el || !fontLoaded) return;
      el.focus({ preventScroll: true });
      requestAnimationFrame(() => {
        if (document.activeElement !== el) return;
        const doc = document as Document & {
          caretPositionFromPoint?: (
            x: number,
            y: number
          ) => { offsetNode: Node; offset: number } | null;
        };
        let range: Range | null = null;
        if (typeof doc.caretPositionFromPoint === "function") {
          const pos = doc.caretPositionFromPoint(clientX, clientY);
          if (pos && el.contains(pos.offsetNode)) {
            range = document.createRange();
            range.setStart(pos.offsetNode, pos.offset);
            range.collapse(true);
          }
        } else if (typeof document.caretRangeFromPoint === "function") {
          const hit = document.caretRangeFromPoint(clientX, clientY);
          if (hit && el.contains(hit.startContainer)) range = hit;
        }
        if (!range) {
          range = document.createRange();
          range.selectNodeContents(el);
          range.collapse(true);
        }
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      });
    },
    [fontLoaded]
  );

  // Does the client point land on the text's VISUAL space — the ink box the
  // dashed edit frame hugs? The box is re-measured on every store change
  // (typing, font size, line height, drag…), so the hit zone always tracks
  // what is actually on screen: growing the text grows the zone, clearing
  // the text shrinks it back to the caret-sized frame. Empty / whitespace
  // text has no ink, so the caret-sized fallback frame is the hit zone. A
  // 2 screen px tolerance keeps taps right on the dashed edge inside.
  const pointHitsText = useCallback(
    (cx: number, cy: number): boolean => {
      const wrap = wrapperRef.current;
      if (!wrap) return false;
      const s = useStudio.getState();
      const k = previewW / s.canvasWidth;
      const box =
        textBoxRef.current ??
        fallbackTextBox(
          s.align,
          s.textOffsetX,
          s.canvasWidth,
          s.fontSize,
          textBlockFor(s)
        );
      const rect = wrap.getBoundingClientRect();
      const left = rect.left + box.left * k;
      const top = rect.top + box.top * k;
      const pad = 2;
      return (
        cx >= left - pad &&
        cx <= left + box.width * k + pad &&
        cy >= top - pad &&
        cy <= top + box.height * k + pad
      );
    },
    [previewW]
  );

  const handleTextMouseDown = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      // The editable element itself spans the full canvas width, so it
      // would otherwise grab presses far outside the glyphs. Hit-test the
      // VISUAL text space (the dashed frame) instead:
      // - outside the frame while editing → leave edit mode,
      // - outside the frame while NOT editing → do nothing (the press must
      //   not silently start a session away from the glyphs).
      // Presses inside the frame keep the native caret handling.
      if (!editing) {
        if (!pointHitsText(e.clientX, e.clientY)) e.preventDefault();
        return;
      }
      if (pointHitsText(e.clientX, e.clientY)) return;
      e.preventDefault();
      exitEdit();
    },
    [editing, pointHitsText, exitEdit]
  );

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

  // Z-index of each baked layer, derived from the bottom → top order array
  // (index 0 = backmost). Starts at 1 so the dedicated background layer
  // (z 0) always stays at the very back, and the edit chrome (z 10) and the
  // toolbar (z 20) always stay above every baked layer.
  const zOf = (id: LayerId) =>
    Math.max(1, layerOrder.indexOf(id) + 1);

  const tb = textBlockFor(useStudio.getState());
  const m = computeOverlayMetrics(
    canvasWidth,
    canvasHeight,
    overlayCfgFrom(useStudio.getState())
  );
  const effBox =
    textBox ?? fallbackTextBox(align, textOffsetX, canvasWidth, fontSize, tb);
  // Per-axis preview visibility: hidden axes (eye off) lose their slider row
  // but keep animating and stay in the CSS code line.
  const visibleAxes = axes.filter((a) => a.visible);
  // The outline chrome hugs the outline layer's REAL ink box (reported by
  // applyStyles from the frame build — scale-aware). Until the first report
  // lands (engine loading / no ink yet) fall back to the text ink box
  // shifted by the outline layer's own offset delta.
  const outlineChromeBox = outline.enabled
    ? outlineBox ?? {
        left: effBox.left + (outlineOffsetX - textOffsetX),
        top: effBox.top + (outlineOffsetY - textOffsetY),
        width: effBox.width,
        height: effBox.height,
      }
    : null;
  const showSliders =
    overlay.enabled && overlay.showSliders && visibleAxes.length > 0;
  const showCssBar = overlay.enabled && overlay.showCss;
  const panelBg =
    overlay.bgOpacity > 0
      ? hexToRgba(overlay.bgColor, overlay.bgOpacity)
      : undefined;
  const wrapperAlignItems = alignItemsFor(vAlign);

  // Where should the floating toolbar sit? Pick the side (top/bottom) with
  // more free vertical room, avoiding the text block and BOTH baked overlay
  // elements — the slider panel and the CSS line move independently, so
  // each contributes its own band. Only force the toolbar to the top when
  // the bottom is too tight.
  const hasStack = showSliders || showCssBar;
  const stackTops: number[] = [];
  const stackBottoms: number[] = [];
  if (showSliders) {
    stackTops.push(m.panelY);
    stackBottoms.push(m.panelY + m.panelH);
  }
  if (showCssBar) {
    stackTops.push(m.cssBarY);
    stackBottoms.push(m.cssBarY + m.cssBarH);
  }
  const stackTop = stackTops.length ? Math.min(...stackTops) : Number.POSITIVE_INFINITY;
  const stackBottom = stackBottoms.length ? Math.max(...stackBottoms) : 0;
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
        {/* Canvas background — its own bottom-most layer (z 0) so the text
            layer can be z-raised above the outline/overlays without its
            (formerly attached) opaque fill covering them. */}
        <div
          className="absolute inset-0"
          style={{ background: bgColor, zIndex: 0 }}
          aria-hidden
        />
        <div
          ref={wrapperRef}
          className="absolute inset-0 flex cursor-text justify-center"
          style={{
            alignItems: wrapperAlignItems,
            paddingTop: 24 * k,
            paddingBottom: 24 * k,
            zIndex: zOf("text"),
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
              // Clicking the canvas OUTSIDE the text's visual space ends
              // the session. Outside a session a canvas click does nothing
              // — editing starts only from the text frame itself.
              wasEditingRef.current = false;
              exitEdit();
            }
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
              onMouseDown={handleTextMouseDown}
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

        {/* Glyph-outline layer — wireframe of the glyphs (paths, anchor
            nodes, bezier handles). Its z-position follows the Layers tool's
            layer stack (zIndex on this svg). Rebuilt imperatively every
            frame in applyStyles; pointer-events stay off so all interaction
            goes through the EditChrome drag surfaces. */}
        <svg
          ref={outlineSvgRef}
          className="pointer-events-none absolute inset-0 h-full w-full"
          style={{ zIndex: zOf("outline") }}
          viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
          preserveAspectRatio="none"
          aria-hidden
        />

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
              zIndex: zOf("sliders"),
            }}
          >
            {visibleAxes.map((axis, i) => (
              <AxisSliderRow
                key={axis.tag}
                tag={axis.tag}
                name={axis.name}
                min={axis.min}
                max={axis.max}
                current={axis.current}
                index={i}
                count={visibleAxes.length}
                showName={overlay.showName}
                showTag={overlay.showTag}
                decimals={overlay.valueDecimals}
                color={overlay.color}
                font={overlay.font}
                bold={overlay.bold}
                shape={overlay.thumbShape}
                m={m}
                k={k}
                register={registerRow}
                unregister={unregisterRow}
              />
            ))}
          </div>
        )}

        {/* CSS code line — draggable independently of the slider panel */}
        {showCssBar && (
          <div
            ref={cssRef}
            className="absolute cursor-grab touch-none select-none overflow-hidden whitespace-nowrap active:cursor-grabbing"
            title="Drag to move the CSS line · double-click to reset"
            onPointerDown={(e) =>
              dragCss(e, {
                k,
                width: canvasWidth,
                height: canvasHeight,
                m,
                onSnap: setSnapGuide,
              })
            }
            onDoubleClick={() =>
              useStudio.getState().setCssOffset(0, 0)
            }
            style={{
              left: m.cssBarX * k,
              top: m.cssBarY * k,
              width: m.cssBarW * k,
              height: m.cssBarH * k,
              borderRadius: m.panelRx * k,
              background: panelBg,
              fontFamily: overlay.font,
              fontWeight: overlay.bold ? 700 : 400,
              color: overlay.color,
              fontSize: m.cssFontPx * k,
              lineHeight: `${m.cssBarH * k}px`,
              textAlign: overlay.centered ? "center" : "left",
              paddingLeft: overlay.centered ? 0 : m.innerPad * k,
              paddingRight: overlay.centered ? 0 : m.innerPad * k,
              zIndex: zOf("css"),
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
            axesCount={visibleAxes.length}
            lineCount={Math.max(1, text.split("\n").length)}
            showOutline={outline.enabled}
            outlineBox={outlineChromeBox}
            textLayerVisible={showTextLayer}
            onSnap={setSnapGuide}
            onTapText={startEditAt}
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
