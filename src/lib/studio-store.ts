import { create } from "zustand";
import { parseVariableFont, type FontAxis } from "./font-parser";
import { type EasingType } from "./easing";
import {
  computeAxisValues,
  buildVariationString,
  buildCssFontVariationSettings,
  type AxisDisplayInfo,
} from "./renderer";
import type { VideoFormat } from "./encoders";
import {
  DEFAULT_LAYER_ORDER,
  DEFAULT_OUTLINE_SETTINGS,
  DEFAULT_OVERLAY_SETTINGS,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  type AlignMode,
  type AxisMoveMode,
  type LayerId,
  type LoopMode,
  type OutlineSettings,
  type OverlaySettings,
  type TextDirection,
  type VAlign,
} from "./studio-store-types";
import {
  createRecordSlice,
  type RecordSliceActions,
  type RecordSliceState,
} from "./studio-record-slice";

export const REGISTERED_FAMILY = "VFStudioFont";

export interface AxisState extends FontAxis {
  current: number;
  animFrom: number;
  animTo: number;
  animate: boolean;
  // Preview visibility of the axis's slider row (the eye toggle in the axes
  // panel). Hidden axes keep animating and stay in the CSS code line — only
  // their slider row disappears from the baked overlay.
  visible: boolean;
}

// Recording/export state + actions live in studio-record-slice.ts; the store
// simply re-exports them through this interface.
export interface StudioState
  extends RecordSliceState,
    RecordSliceActions {
  fontLoaded: boolean;
  isLoadingFont: boolean;
  familyName: string;
  fontBase64: string;
  fontCssFormat: string;
  fontMime: string;
  axes: AxisState[];

  // Text & typography
  text: string;
  fontSize: number;
  textColor: string;
  bgColor: string;
  letterSpacing: number;
  lineHeight: number;
  align: AlignMode;
  vAlign: VAlign;
  textDirection: TextDirection; // base direction of the preview/exported text

  // Layers: the editable text layer and the display-only glyph-outline layer
  // (see lib/outline.ts) can be toggled independently — any combination is
  // valid. When the text layer is hidden the text stays editable (transparent
  // fill, visible caret) and still drives the outline.
  showTextLayer: boolean;
  outline: OutlineSettings;
  // Z-order of the four baked layers (text / outline / sliders / css), as a
  // BOTTOM → TOP array. Reorderable from the Layers tool; both the preview
  // and the export renderer stack the layers in this order.
  layerOrder: LayerId[];
  // Decoded SFNT bytes of the loaded font — handed to fontkit for outline
  // extraction. Null until a font is loaded; identity-keyed by the outline
  // engine's font cache, so keep ONE instance per loaded font.
  fontSfnt: ArrayBuffer | null;

  // Canvas
  canvasWidth: number;
  canvasHeight: number;

  // Animation
  duration: number;
  fps: number;
  easing: EasingType;
  loopMode: LoopMode;
  axisMoveMode: AxisMoveMode; // binary bit-stepping or sync (all together)
  repeat: number; // how many cycles the export tiles back to back (1 = single cycle)

  // Overlay (axis sliders + CSS code baked into preview + export) — ONE
  // settings group instead of 24 flat fields; patch it with setOverlay.
  overlay: OverlaySettings;

  // v1.1 direct-manipulation layout offsets (canvas px), set by dragging the
  // preview frames. 0,0 = auto layout (vAlign/align + overlay position).
  textOffsetX: number;
  textOffsetY: number;
  outlineOffsetX: number; // outline layer drag offset (independent of text)
  outlineOffsetY: number;
  panelOffsetX: number;
  panelOffsetY: number;
  cssOffsetX: number; // CSS code line drag offset (independent of the panel)
  cssOffsetY: number;
  snapCenterEnabled: boolean; // magnet-snap dragged elements to the canvas width centre

  // Playback
  isPlaying: boolean;
  currentTime: number;

  // Actions
  loadFont: (file: File) => Promise<void>;
  setText: (text: string) => void;
  setFontSize: (n: number) => void;
  setTextColor: (c: string) => void;
  setBgColor: (c: string) => void;
  setLetterSpacing: (n: number) => void;
  setLineHeight: (n: number) => void;
  setAlign: (a: AlignMode) => void;
  setVAlign: (v: VAlign) => void;
  setTextDirection: (d: TextDirection) => void;
  setCanvasSize: (w: number, h: number) => void;

  setDuration: (n: number) => void;
  setFps: (n: number) => void;
  setEasing: (e: EasingType) => void;
  setLoopMode: (m: LoopMode) => void;
  setAxisMoveMode: (m: AxisMoveMode) => void;
  setRepeat: (n: number) => void;

  setOverlay: (patch: Partial<OverlaySettings>) => void;
  setOutline: (patch: Partial<OutlineSettings>) => void;
  setShowTextLayer: (b: boolean) => void;
  // Move the dragged layer next to the drop target (dnd-kit sortable drag
  // in the Layers tool). No-op when the ids match or either id is missing.
  // The order array runs bottom → top.
  reorderLayers: (fromId: LayerId, toId: LayerId) => void;

  // Direct manipulation (drag in the preview)
  setTextOffset: (x: number, y: number) => void;
  setOutlineOffset: (x: number, y: number) => void;
  setPanelOffset: (x: number, y: number) => void;
  setCssOffset: (x: number, y: number) => void;
  setSnapCenterEnabled: (b: boolean) => void;
  resetLayout: () => void;

  setAxisCurrent: (tag: string, value: number) => void;
  setAxisAnim: (tag: string, from: number, to: number) => void;
  toggleAxisAnimate: (tag: string) => void;
  resetAxisToDefault: (tag: string) => void;
  // Show/hide the axis's slider row in the baked overlay (eye toggle). The
  // axis keeps animating and stays in the CSS code line either way.
  setAxisVisible: (tag: string, visible: boolean) => void;
  // Reorder the axis list by drag & drop (tags are unique per font). The
  // order drives the axes panel, the preview overlay slider stack and the
  // binary bit assignment (top axis = least significant bit).
  reorderAxes: (fromTag: string, toTag: string) => void;

  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (t: number) => void;
  setCurrentTime: (t: number) => void;
}

function buildAxes(parsed: FontAxis[]): AxisState[] {
  const preferredIndex = parsed.findIndex((a) => a.tag === "wght");
  const defaultIdx = preferredIndex >= 0 ? preferredIndex : 0;
  return parsed.map((a, i) => ({
    ...a,
    current: a.default,
    animFrom: a.min,
    animTo: a.max,
    animate: i === defaultIdx,
    visible: true,
  }));
}

export const useStudio = create<StudioState>((set, get) => ({
  fontLoaded: false,
  isLoadingFont: false,
  familyName: "",
  fontBase64: "",
  fontCssFormat: "truetype",
  fontMime: "font/ttf",
  axes: [],

  text: "Variable",
  fontSize: 160,
  textColor: "#0a0a0a",
  bgColor: "#f5f5f4",
  letterSpacing: 0,
  lineHeight: 1.15,
  align: "center",
  vAlign: "middle",
  textDirection: "auto",

  showTextLayer: true,
  outline: { ...DEFAULT_OUTLINE_SETTINGS },
  layerOrder: [...DEFAULT_LAYER_ORDER],
  fontSfnt: null,

  canvasWidth: 960,
  canvasHeight: 540,

  duration: 3,
  fps: 60,
  easing: "easeInOut",
  loopMode: "pingpong",
  axisMoveMode: "binary",
  repeat: 1,

  overlay: { ...DEFAULT_OVERLAY_SETTINGS },

  textOffsetX: 0,
  textOffsetY: 0,
  outlineOffsetX: 0,
  outlineOffsetY: 0,
  panelOffsetX: 0,
  panelOffsetY: 0,
  cssOffsetX: 0,
  cssOffsetY: 0,
  snapCenterEnabled: true,

  isPlaying: false,
  currentTime: 0,

  loadFont: async (file) => {
    set({ isLoadingFont: true });
    try {
      const buf = await file.arrayBuffer();
      const parsed = await parseVariableFont(buf);
      document.fonts.forEach((f) => {
        if (f.family === REGISTERED_FAMILY) document.fonts.delete(f);
      });
      const face = new FontFace(
        REGISTERED_FAMILY,
        `url(data:${parsed.mime};base64,${parsed.base64})`
      );
      await face.load();
      document.fonts.add(face);
      const axes = buildAxes(parsed.axes);
      set({
        fontLoaded: true,
        isLoadingFont: false,
        familyName: parsed.familyName,
        fontBase64: parsed.base64,
        fontCssFormat: parsed.cssFormat,
        fontMime: parsed.mime,
        fontSfnt: parsed.sfnt,
        axes,
        // Sensible loop default: a single axis reads best sweeping out and
        // back (ping-pong); multiple axes read best as a continuous loop.
        loopMode: axes.length === 1 ? "pingpong" : "loop",
        isPlaying: false,
        currentTime: 0,
      });
    } catch (e) {
      set({ isLoadingFont: false });
      throw e;
    }
  },

  setText: (text) => set({ text }),
  // Single source of truth for the size range: every entry point (sliders,
  // corner handle, persisted-state hydration) funnels through this clamp.
  setFontSize: (fontSize) =>
    set({
      fontSize: Math.min(
        FONT_SIZE_MAX,
        Math.max(FONT_SIZE_MIN, Math.round(fontSize))
      ),
    }),
  setTextColor: (textColor) => set({ textColor }),
  setBgColor: (bgColor) => set({ bgColor }),
  setLetterSpacing: (letterSpacing) => set({ letterSpacing }),
  setLineHeight: (lineHeight) => set({ lineHeight }),
  setAlign: (align) => set({ align }),
  setVAlign: (vAlign) => set({ vAlign }),
  setTextDirection: (textDirection) => set({ textDirection }),
  setCanvasSize: (canvasWidth, canvasHeight) =>
    set({ canvasWidth, canvasHeight }),

  setDuration: (duration) => set({ duration }),
  setFps: (fps) => set({ fps }),
  setEasing: (easing) => set({ easing }),
  setLoopMode: (loopMode) => set({ loopMode }),
  setAxisMoveMode: (axisMoveMode) => set({ axisMoveMode }),
  setRepeat: (repeat) => set({ repeat: Math.max(1, Math.round(repeat)) }),

  // One patch-in setter replaces the 24 former per-field overlay setters.
  setOverlay: (patch) =>
    set((s) => ({ overlay: { ...s.overlay, ...patch } })),

  setOutline: (patch) =>
    set((s) => ({ outline: { ...s.outline, ...patch } })),
  setShowTextLayer: (showTextLayer) => set({ showTextLayer }),

  // Move the dragged layer next to the drop target. The order array runs
  // bottom → top, so dropping a row onto another re-stacks the layers —
  // both the preview and the export renderer follow the new order.
  reorderLayers: (fromId, toId) =>
    set((s) => {
      if (fromId === toId) return s;
      const from = s.layerOrder.indexOf(fromId);
      const to = s.layerOrder.indexOf(toId);
      if (from < 0 || to < 0) return s;
      const layerOrder = [...s.layerOrder];
      const [moved] = layerOrder.splice(from, 1);
      layerOrder.splice(to, 0, moved);
      return { layerOrder };
    }),

  setTextOffset: (textOffsetX, textOffsetY) =>
    set({ textOffsetX, textOffsetY }),
  setOutlineOffset: (outlineOffsetX, outlineOffsetY) =>
    set({ outlineOffsetX, outlineOffsetY }),
  setPanelOffset: (panelOffsetX, panelOffsetY) =>
    set({ panelOffsetX, panelOffsetY }),
  setCssOffset: (cssOffsetX, cssOffsetY) => set({ cssOffsetX, cssOffsetY }),
  setSnapCenterEnabled: (snapCenterEnabled) => set({ snapCenterEnabled }),
  resetLayout: () =>
    set({
      textOffsetX: 0,
      textOffsetY: 0,
      outlineOffsetX: 0,
      outlineOffsetY: 0,
      panelOffsetX: 0,
      panelOffsetY: 0,
      cssOffsetX: 0,
      cssOffsetY: 0,
    }),

  setAxisCurrent: (tag, value) =>
    set((s) => ({
      axes: s.axes.map((a) =>
        a.tag === tag
          ? { ...a, current: Math.min(a.max, Math.max(a.min, value)) }
          : a
      ),
    })),
  setAxisAnim: (tag, from, to) =>
    set((s) => ({
      axes: s.axes.map((a) =>
        a.tag === tag
          ? {
              ...a,
              animFrom: Math.min(a.max, Math.max(a.min, from)),
              animTo: Math.min(a.max, Math.max(a.min, to)),
            }
          : a
      ),
    })),
  toggleAxisAnimate: (tag) =>
    set((s) => ({
      axes: s.axes.map((a) =>
        a.tag === tag ? { ...a, animate: !a.animate } : a
      ),
    })),
  setAxisVisible: (tag, visible) =>
    set((s) => ({
      axes: s.axes.map((a) => (a.tag === tag ? { ...a, visible } : a)),
    })),
  resetAxisToDefault: (tag) =>
    set((s) => ({
      axes: s.axes.map((a) =>
        a.tag === tag
          ? {
              ...a,
              current: a.default,
              animFrom: a.default,
              animTo: a.default,
              animate: false,
            }
          : a
      ),
    })),

  // Move the dragged axis next to the drop target (dnd-kit sortable). No-op
  // when the ids match or the drop target is missing.
  reorderAxes: (fromTag, toTag) =>
    set((s) => {
      if (fromTag === toTag) return s;
      const from = s.axes.findIndex((a) => a.tag === fromTag);
      const to = s.axes.findIndex((a) => a.tag === toTag);
      if (from < 0 || to < 0) return s;
      const axes = [...s.axes];
      const [moved] = axes.splice(from, 1);
      axes.splice(to, 0, moved);
      return { axes };
    }),

  play: () => {
    const { currentTime, loopMode } = get();
    if (loopMode === "once" && currentTime >= 1) {
      set({ currentTime: 0 });
    }
    set({ isPlaying: true });
  },
  pause: () => set({ isPlaying: false }),
  stop: () => set({ isPlaying: false, currentTime: 0 }),
  seek: (t) => set({ isPlaying: false, currentTime: Math.min(1, Math.max(0, t)) }),
  setCurrentTime: (t) => set({ currentTime: Math.min(1, Math.max(0, t)) }),

  // Record/export actions come from the record slice (see studio-record-slice.ts).
  ...createRecordSlice(set, get),
}));

// Build the CSS font-variation-settings string for the current frame.
export function selectCurrentVariation(s: StudioState): string {
  const values = computeAxisValues(
    s.axes,
    s.currentTime,
    s.easing,
    s.axisMoveMode
  );
  return buildVariationString(values);
}

// Build the CSS font-variation-settings string (quoted-tag form) for the
// current frame — used by the preview overlay's code display. Fixed decimals
// (same setting as the slider's live value) so a centred code line does not
// jitter left/right as the values change.
export function selectCurrentCssVariation(s: StudioState): string {
  const values = computeAxisValues(
    s.axes,
    s.currentTime,
    s.easing,
    s.axisMoveMode
  );
  return buildCssFontVariationSettings(values, s.overlay.valueDecimals);
}

// Build the axis display info for the current frame — used by the preview overlay.
export function selectCurrentAxesInfo(s: StudioState): AxisDisplayInfo[] {
  const values = computeAxisValues(
    s.axes,
    s.currentTime,
    s.easing,
    s.axisMoveMode
  );
  return s.axes.map((a, i) => ({
    tag: a.tag,
    name: a.name,
    value: values[i]?.value ?? a.current,
    min: a.min,
    max: a.max,
    visible: a.visible,
  }));
}

// Debug/testing handle — lets browser tooling inspect and drive the store
// (harmless in production: only adds a window reference in the client).
if (typeof window !== "undefined") {
  (window as unknown as { __studio?: typeof useStudio }).__studio = useStudio;
}
