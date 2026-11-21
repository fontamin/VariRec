// Glyph-outline layer (display-only) — the "wireframe" second text layer.
//
// Extracts glyph contours with fontkit (lazy dynamic import, so the default
// bundle never pays for it), instantiates the variable font with
// `getVariation`, and lays the text out glyph-by-glyph so outlines, anchor
// nodes and bezier handles can be drawn as SVG on top of (or instead of) the
// normal text layer — in the live preview AND in the exported frames.
//
// Layout fidelity (measured in the Round-23 alignment probe):
// - fontkit's Arabic/Latin shaping and advances match the browser
//   pixel-perfectly for the DEFAULT instance (0 px width diff, ink bbox
//   identical, ≤2.3% anti-aliasing residual);
// - fontkit's built-in bidi MIS-ORDERS LTR runs inside RTL paragraphs
//   (Latin words and Persian digits come out reversed), so this module does
//   its own bidi run splitting with `bidi-js` and shapes each run with an
//   explicit direction. After that, mixed text matches too (1.6% residual).
// - advance widths also match for non-default instances (wght 100/900: 0 px
//   diff against a DOM span with font-variation-settings).
//
// Baselines: the preview overlay uses the browser's real line-box metrics
// (measured ascent/descent, passed in by the caller); the export overlay uses
// the exact same baseline formula as the SVG <text> renderer (0.78 em), so
// outline and text stay aligned in BOTH worlds.
//
// NOT editable by design: the layer renders SVG only and forwards no pointer
// events; moving it happens through the drag chrome (independent
// outlineOffsetX/Y) and styling through the toolbar's Layers tool.

import type { OutlineSettings, ThumbShape } from "./studio-store-types";

// ─── Minimal structural types for the lazily loaded libraries ──────────────

// fontkit v3 stores path commands as { command, args: [x1,y1,x2,y2,…] }.
export interface FontkitGlyphPath {
  commands: { command: string; args?: number[] }[];
  toSVG: () => string;
}

interface FontkitGlyph {
  id: number;
  path: FontkitGlyphPath;
}

interface FontkitPosition {
  xAdvance?: number;
  yAdvance?: number;
  xOffset?: number;
  yOffset?: number;
}

interface FontkitGlyphRun {
  glyphs: FontkitGlyph[];
  positions: FontkitPosition[];
  advanceWidth: number;
}

export interface FontkitVariationFont {
  layout: (
    s: string,
    features?: unknown,
    script?: unknown,
    language?: unknown,
    direction?: string
  ) => FontkitGlyphRun;
}

interface FontkitFont {
  unitsPerEm: number;
  getVariation: (axes: Record<string, number>) => FontkitVariationFont;
}

interface BidiLevels {
  levels: ArrayLike<number>;
}

interface BidiService {
  getEmbeddingLevels: (text: string, base?: string) => BidiLevels;
  getReorderedIndices: (text: string, lv: BidiLevels) => number[];
}

// ─── Lazy engine (fontkit + bidi-js, loaded only when the layer is used) ───

let enginePromise: Promise<void> | null = null;
let fontkitCreate: ((buf: Uint8Array) => FontkitFont) | null = null;
let bidiService: BidiService | null = null;

export function ensureOutlineEngine(): Promise<void> {
  if (!enginePromise) {
    enginePromise = (async () => {
      // The two libraries are loaded at RUNTIME from static files in
      // /public/vendor (built by `bun run build:outline-vendor` from the
      // npm packages). webpackIgnore/turbopackIgnore keep the bundler from
      // resolving these imports, so the engine is downloaded ONLY when the
      // outline layer is first used and the default bundle never grows.
      // (A plain dynamic import() of the npm package would still split the
      // chunk, but Turbopack's static export emits it as an eager <script>
      // in the prerendered HTML — the vendor file avoids that entirely.)
      const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
      const fkUrl = `${base}/vendor/fontkit.esm.js`;
      const bidiUrl = `${base}/vendor/bidi.esm.js`;
      // Up to three attempts with a short backoff: a momentary server
      // restart or proxy hiccup must not permanently break the outline
      // layer (and the ink-true text frame) until a page reload. On total
      // failure the cached attempt is discarded so any later call — a font
      // reload or an export — starts fresh, and the promise still RESOLVES
      // (nothing rejects, so no unhandled-rejection error surfaces);
      // consumers check outlineEngineReady() and degrade gracefully.
      const maxAttempts = 3;
      let mods: [
        { create?: (buf: Uint8Array) => FontkitFont },
        { default?: new () => BidiService },
      ] | null = null;
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          mods = (await Promise.all([
            import(
              /* webpackIgnore: true */ /* turbopackIgnore: true */ fkUrl
            ),
            import(
              /* webpackIgnore: true */ /* turbopackIgnore: true */ bidiUrl
            ),
          ])) as unknown as [
            { create?: (buf: Uint8Array) => FontkitFont },
            { default?: new () => BidiService },
          ];
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          if (attempt < maxAttempts - 1) {
            await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
          }
        }
      }
      if (!mods) {
        console.warn("outline engine failed to load:", lastErr);
        enginePromise = null; // re-arm: the next call retries from scratch
        return;
      }
      const [fkMod, bidiMod] = mods;
      fontkitCreate = fkMod.create ?? null;
      const BidiCtor =
        bidiMod.default ?? (bidiMod as unknown as new () => BidiService);
      bidiService = new BidiCtor();
    })();
  }
  return enginePromise;
}

export function outlineEngineReady(): boolean {
  return fontkitCreate !== null && bidiService !== null;
}

// One fontkit font per loaded SFNT buffer (identity-keyed — the store keeps a
// single ArrayBuffer per font load, so cache hits are guaranteed).
const fontCache = new WeakMap<ArrayBuffer, FontkitFont>();

function getFont(sfnt: ArrayBuffer): FontkitFont | null {
  if (!fontkitCreate) return null;
  let f = fontCache.get(sfnt) ?? null;
  if (!f) {
    f = fontkitCreate(new Uint8Array(sfnt));
    fontCache.set(sfnt, f);
  }
  return f;
}

// Instanced fonts are expensive-ish to build (~0.4 ms) — keep the last one.
let cachedVariationKey = "";
let cachedVariationFont: FontkitVariationFont | null = null;

function getVariationFont(
  font: FontkitFont,
  variation: { tag: string; value: number }[]
): FontkitVariationFont {
  const key = variation.map((a) => `${a.tag}=${a.value}`).join(",");
  if (key !== cachedVariationKey || !cachedVariationFont) {
    const axes: Record<string, number> = {};
    for (const a of variation) axes[a.tag] = a.value;
    cachedVariationFont = font.getVariation(axes);
    cachedVariationKey = key;
  }
  return cachedVariationFont;
}

// ─── Bidi-aware run shaping (validated by the Round-23 probe) ──────────────

interface ShapedGlyph {
  glyph: FontkitGlyph;
  // Canvas-px advance INCLUDING letter-spacing (CSS applies spacing after
  // every character unit, so it is baked in per glyph — pixel-identical for
  // LTR text at spacing = 0, the validated default).
  xAdvance: number;
  xOffset: number;
  yOffset: number;
}

interface ShapedLine {
  glyphs: ShapedGlyph[];
  width: number; // total advance incl. letter-spacing, canvas px
}

function shapeLine(
  vf: FontkitVariationFont,
  line: string,
  baseDir: "ltr" | "rtl",
  scale: number,
  letterSpacingPx: number
): ShapedLine {
  const bs = bidiService;
  if (!bs) return { glyphs: [], width: 0 };
  const chars = Array.from(line);
  if (chars.length === 0) return { glyphs: [], width: 0 };

  const lv = bs.getEmbeddingLevels(line, baseDir);
  const levels: number[] = Array.from(lv.levels);

  // Maximal same-embedding-level runs (logical order).
  const ranges: { start: number; end: number; level: number }[] = [];
  for (let i = 0; i < chars.length; i++) {
    const last = ranges[ranges.length - 1];
    if (last && last.level === levels[i]) last.end = i;
    else ranges.push({ start: i, end: i, level: levels[i] });
  }

  // Shape each run with an explicit direction — fontkit's own bidi handling
  // mis-orders LTR segments inside RTL paragraphs, so the paragraph-level
  // reordering is done HERE, not inside fontkit.
  const shaped = ranges.map((r) => {
    const runText = chars.slice(r.start, r.end + 1).join("");
    const run = vf.layout(
      runText,
      undefined,
      undefined,
      undefined,
      r.level & 1 ? "rtl" : "ltr"
    );
    const glyphs: ShapedGlyph[] = run.glyphs.map((g, i) => ({
      glyph: g,
      xAdvance: (run.positions[i]?.xAdvance ?? 0) * scale + letterSpacingPx,
      xOffset: (run.positions[i]?.xOffset ?? 0) * scale,
      yOffset: (run.positions[i]?.yOffset ?? 0) * scale,
    }));
    return { range: r, glyphs };
  });

  // Visual (left→right) order of the runs from bidi-js character indices.
  const visual = bs.getReorderedIndices(line, lv);
  const runOrder: number[] = [];
  for (const vi of visual) {
    const ri = shaped.findIndex(
      (s) => vi >= s.range.start && vi <= s.range.end
    );
    if (ri >= 0 && !runOrder.includes(ri)) runOrder.push(ri);
  }

  const glyphs: ShapedGlyph[] = [];
  let width = 0;
  for (const ri of runOrder) {
    for (const g of shaped[ri].glyphs) {
      glyphs.push(g);
      width += g.xAdvance;
    }
  }
  return { glyphs, width };
}

// ─── SVG building blocks ───────────────────────────────────────────────────

function r2(n: number): string {
  return String(Math.round(n * 100) / 100);
}

// Node marker in the shared ThumbShape vocabulary, drawn centered on (cx,cy)
// with a fill + border. Mirrors the overlay thumb geometry (same corner
// radii) so both pickers feel like the same design system.
function nodeSvg(
  shape: ThumbShape,
  cx: number,
  cy: number,
  r: number,
  fill: string,
  stroke: string,
  sw: number
): string {
  const d = r * 2;
  const x = r2(cx - r);
  const y = r2(cy - r);
  const common = `fill="${fill}" stroke="${stroke}" stroke-width="${r2(sw)}"`;
  switch (shape) {
    case "square":
      return `<rect x="${x}" y="${y}" width="${r2(d)}" height="${r2(d)}" ${common}/>`;
    case "rounded":
      return `<rect x="${x}" y="${y}" width="${r2(d)}" height="${r2(d)}" rx="${r2(r * 0.42)}" ${common}/>`;
    case "diamond":
      return `<rect x="${x}" y="${y}" width="${r2(d)}" height="${r2(d)}" rx="${r2(r * 0.18)}" ${common} transform="rotate(45 ${r2(cx)} ${r2(cy)})"/>`;
    default:
      return `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r)}" ${common}/>`;
  }
}

interface Pt {
  x: number;
  y: number;
}

// Extract anchor points, control points and handle segments (font units)
// from a glyph's path commands. On-curve points are segment endpoints;
// quad/cubic control points attach to the segment's start/end anchors.
// fontkit v3 stores each command as { command, args: [x1,y1,x2,y2,…] }.
function extractPoints(
  commands: { command: string; args?: number[] }[]
): {
  anchors: Pt[];
  ctrls: Pt[];
  handles: [Pt, Pt][];
  box: { minX: number; minY: number; maxX: number; maxY: number } | null;
} {
  const anchors: Pt[] = [];
  const ctrls: Pt[] = [];
  const handles: [Pt, Pt][] = [];
  let cur: Pt | null = null;
  let box: { minX: number; minY: number; maxX: number; maxY: number } | null =
    null;
  const mark = (p: Pt) => {
    if (!box) box = { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y };
    else {
      if (p.x < box.minX) box.minX = p.x;
      if (p.y < box.minY) box.minY = p.y;
      if (p.x > box.maxX) box.maxX = p.x;
      if (p.y > box.maxY) box.maxY = p.y;
    }
  };
  for (const cmd of commands) {
    const a = cmd.args ?? [];
    switch (cmd.command) {
      case "moveTo":
      case "lineTo": {
        if (a.length >= 2) {
          const p = { x: a[0], y: a[1] };
          anchors.push(p);
          mark(p);
          cur = p;
        }
        break;
      }
      case "quadraticCurveTo": {
        if (a.length >= 4) {
          const c = { x: a[0], y: a[1] };
          const end = { x: a[2], y: a[3] };
          if (cur) handles.push([cur, c]);
          handles.push([c, end]);
          ctrls.push(c);
          anchors.push(end);
          mark(c);
          mark(end);
          cur = end;
        }
        break;
      }
      case "bezierCurveTo": {
        if (a.length >= 6) {
          const c1 = { x: a[0], y: a[1] };
          const c2 = { x: a[2], y: a[3] };
          const end = { x: a[4], y: a[5] };
          if (cur) handles.push([cur, c1]);
          handles.push([c2, end]);
          ctrls.push(c1, c2);
          anchors.push(end);
          mark(c1);
          mark(c2);
          mark(end);
          cur = end;
        }
        break;
      }
      default:
        break; // closePath — no geometry
    }
  }
  return { anchors, ctrls, handles, box };
}

// ─── Frame builder ─────────────────────────────────────────────────────────

export interface OutlineFrameInput {
  // Decoded SFNT bytes (store: fontSfnt). Null → no outline.
  sfnt: ArrayBuffer | null;
  text: string;
  variation: { tag: string; value: number }[];
  fontSize: number;
  letterSpacing: number;
  lineHeight: number;
  align: "left" | "center" | "right";
  direction: "ltr" | "rtl"; // resolved base direction (same rule as text)
  width: number;
  height: number;
  // Outline layer drag offsets (canvas px) — independent of the text offsets.
  offsetX: number;
  offsetY: number;
  settings: OutlineSettings;
  // Baseline model:
  // - "svg": the export <text> renderer's formula (top + i·lh·fs + 0.78·fs);
  // - "dom": the browser's real line-box baseline for the live preview,
  //   computed from the measured font ascent/descent passed by the caller.
  baseline: { mode: "svg" } | { mode: "dom"; ascent: number; descent: number };
  // Base auto-layout text block top (vAlign applied, NO drag offsets) — the
  // same value the text layer uses, so both layers share one layout origin.
  blockTop: number;
}

export interface OutlineFrameResult {
  // SVG group content in absolute canvas coordinates (0..width × 0..height).
  // Preview: injected into an <svg viewBox>; export: embedded in the frame.
  svg: string;
  // Union glyph-ink box in canvas px (offsets applied), or null when empty.
  inkBox: { left: number; top: number; width: number; height: number } | null;
}

const MARGIN = 24; // matches the SVG renderer / DOM preview side margins

export function buildOutlineFrame(input: OutlineFrameInput): OutlineFrameResult {
  const empty: OutlineFrameResult = { svg: "", inkBox: null };
  try {
    const { sfnt, settings: st } = input;
    if (!sfnt || !st.enabled || !outlineEngineReady()) return empty;
    const font = getFont(sfnt);
    if (!font) return empty;
    const vf = getVariationFont(font, input.variation);
    if (!vf) return empty;

    const lines = input.text.length ? input.text.split("\n") : [];
    if (lines.length === 0) return empty;

    const scale = input.fontSize / font.unitsPerEm;
    const sp = Math.max(0, input.letterSpacing);
    // Outline layer scale (0.1–10, default 1): the wireframe glyphs scale
    // RELATIVE TO THE MAIN TEXT around each line's alignment anchor and
    // baseline — lines keep the text's line positions and every baseline
    // stays pinned to the text's own baseline, so the layer grows/shrinks
    // out of the shared layout instead of drifting away from it.
    const outScale = Math.min(10, Math.max(0.1, st.scale ?? 1));
    const glyphScale = outScale * scale;
    const lineH = input.fontSize * input.lineHeight;
    const baselineTerm =
      input.baseline.mode === "svg"
        ? input.fontSize * 0.78
        : (lineH - (input.baseline.ascent + input.baseline.descent)) / 2 +
          input.baseline.ascent;

    const anchorXBase =
      input.align === "center"
        ? input.width / 2
        : input.align === "right"
          ? input.width - MARGIN
          : MARGIN;

    const out: string[] = [];
    const paths: string[] = [];
    const handleLines: string[] = [];
    const nodeShapes: string[] = [];
    const box = { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity };
    let anyInk = false;
    const markBox = (l: number, t: number, r: number, b: number) => {
      anyInk = true;
      if (l < box.l) box.l = l;
      if (t < box.t) box.t = t;
      if (r > box.r) box.r = r;
      if (b > box.b) box.b = b;
    };

    const nodeR = Math.max(1, st.nodeSize / 2);
    const nodeStrokeW = Math.max(0.75, Math.min(2.5, st.nodeSize * 0.22));
    const ctrlR = Math.max(0.75, nodeR * 0.62);
    // Bezier handle widths live in font units inside the transformed glyph
    // group; outline paths too (stroke-width is scaled by the transform).
    // Dividing by the glyph scale keeps the stroke at the user's px width no
    // matter how large the layer is scaled.
    const outlineStrokeUnits = Math.max(
      0.1,
      st.strokeWidth / glyphScale
    );

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const shaped = shapeLine(
        vf,
        line,
        input.direction,
        glyphScale,
        sp * outScale
      );
      if (shaped.glyphs.length === 0) continue;
      const baseY =
        input.blockTop +
        input.offsetY +
        i * lineH +
        baselineTerm;
      const left =
        anchorXBase +
        input.offsetX -
        (input.align === "center"
          ? shaped.width / 2
          : input.align === "right"
            ? shaped.width
            : 0);

      let pen = 0;
      for (const g of shaped.glyphs) {
        const gx = left + pen + g.xOffset;
        const gy = baseY - g.yOffset;
        // .notdef / space glyphs carry no contours — advance only.
        if (g.glyph.path.commands.length > 0) {
          // Outline path — transform applies the instance scale + Y flip.
          paths.push(
            `<path d="${g.glyph.path.toSVG()}" transform="translate(${r2(gx)} ${r2(gy)}) scale(${glyphScale} -${glyphScale})" fill="none" stroke="${st.strokeColor}" stroke-width="${r2(outlineStrokeUnits)}"/>`
          );

          const pts = extractPoints(g.glyph.path.commands);
          const tx = (p: Pt) => ({ x: gx + p.x * glyphScale, y: gy - p.y * glyphScale });
          if (pts.box) {
            markBox(
              gx + pts.box.minX * glyphScale,
              gy - pts.box.maxY * glyphScale,
              gx + pts.box.maxX * glyphScale,
              gy - pts.box.minY * glyphScale
            );
          }
          if (st.handleWidth > 0 && pts.handles.length > 0) {
            for (const [a, b] of pts.handles) {
              const a2 = tx(a);
              const b2 = tx(b);
              handleLines.push(
                `<line x1="${r2(a2.x)}" y1="${r2(a2.y)}" x2="${r2(b2.x)}" y2="${r2(b2.y)}" stroke="${st.handleColor}" stroke-width="${r2(st.handleWidth)}"/>`
              );
            }
          }
          for (const p of pts.anchors) {
            const a2 = tx(p);
            nodeShapes.push(
              nodeSvg(st.nodeShape, a2.x, a2.y, nodeR, st.anchorFill, st.anchorStroke, nodeStrokeW)
            );
          }
          for (const p of pts.ctrls) {
            const c2 = tx(p);
            nodeShapes.push(
              nodeSvg(st.nodeShape, c2.x, c2.y, ctrlR, st.ctrlFill, st.ctrlStroke, nodeStrokeW)
            );
          }
        }
        pen += g.xAdvance;
      }
    }

    if (paths.length === 0) return empty;

    // Paint order: outlines → handles → nodes (editor-style stacking).
    out.push(...paths, ...handleLines, ...nodeShapes);

    const inkBox = anyInk
      ? {
          left: box.l,
          top: box.t,
          width: Math.max(1, box.r - box.l),
          height: Math.max(1, box.b - box.t),
        }
      : null;
    return { svg: out.join(""), inkBox };
  } catch (e) {
    // The outline layer must never break the studio (or an export) — degrade
    // to "nothing drawn".
    console.warn("outline layer failed to build:", e);
    return empty;
  }
}

// ─── Text ink measurement ──────────────────────────────────────────────────
// Tight VISUAL rectangle of the laid-out text (canvas px). Position comes
// entirely from the caller: anchorX (horizontal, drag offset included) and
// blockTop (vertical, drag offset included). Powered by the same fontkit
// shaping as the outline layer, so the numbers are exact for EVERY
// variation instance and stay consistent with the wireframe. (Canvas
// measureText cannot style variable axes — its ink numbers are stuck on the
// default instance — which is why this function exists.)
export interface InkMeasureInput {
  sfnt: ArrayBuffer;
  text: string;
  variation: { tag: string; value: number }[];
  fontSize: number;
  letterSpacing: number;
  lineHeight: number;
  align: "left" | "center" | "right";
  direction: "ltr" | "rtl";
  // Horizontal text anchor INCLUDING the caller's horizontal drag offset —
  // the x position (canvas px) every line is laid out from, per `align`.
  anchorX: number;
  // Top of the text block INCLUDING the caller's vertical drag offset —
  // baselines are derived from it with the browser's real line-box metrics.
  blockTop: number;
  ascent: number; // browser fontBoundingBox ascent, canvas px
  descent: number; // browser fontBoundingBox descent, canvas px
}

export interface InkBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function measureTextInkBox(input: InkMeasureInput): InkBox | null {
  try {
    if (!outlineEngineReady()) return null;
    const font = getFont(input.sfnt);
    if (!font) return null;
    const vf = getVariationFont(font, input.variation);
    if (!vf) return null;
    const lines = input.text.length ? input.text.split("\n") : [];
    if (lines.length === 0) return null;

    const scale = input.fontSize / font.unitsPerEm;
    const sp = Math.max(0, input.letterSpacing);
    const lineH = input.fontSize * input.lineHeight;
    const baselineTerm =
      (lineH - (input.ascent + input.descent)) / 2 + input.ascent;

    const box = { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity };
    let any = false;
    const mark = (l: number, t: number, r: number, b: number) => {
      any = true;
      if (l < box.l) box.l = l;
      if (t < box.t) box.t = t;
      if (r > box.r) box.r = r;
      if (b > box.b) box.b = b;
    };

    for (let i = 0; i < lines.length; i++) {
      const shaped = shapeLine(vf, lines[i], input.direction, scale, sp);
      if (shaped.glyphs.length === 0) continue;
      const baseY = input.blockTop + i * lineH + baselineTerm;
      const left =
        input.anchorX -
        (input.align === "center"
          ? shaped.width / 2
          : input.align === "right"
            ? shaped.width
            : 0);
      let pen = 0;
      for (const g of shaped.glyphs) {
        // .notdef / space glyphs carry no contours — advance only.
        if (g.glyph.path.commands.length > 0) {
          const pts = extractPoints(g.glyph.path.commands);
          if (pts.box) {
            mark(
              left + pen + g.xOffset + pts.box.minX * scale,
              baseY - g.yOffset - pts.box.maxY * scale,
              left + pen + g.xOffset + pts.box.maxX * scale,
              baseY - g.yOffset - pts.box.minY * scale
            );
          }
        }
        pen += g.xAdvance;
      }
    }
    return any
      ? {
          left: box.l,
          top: box.t,
          width: Math.max(1, box.r - box.l),
          height: Math.max(1, box.b - box.t),
        }
      : null;
  } catch {
    // Measurement must never break the studio — the caller falls back to
    // the canvas-metrics path.
    return null;
  }
}
