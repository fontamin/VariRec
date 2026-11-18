import { create } from "zustand";
import { parseVariableFont, type FontAxis } from "./font-parser";
import { type EasingType } from "./easing";
import {
  computeAxisValues,
  buildVariationString,
  buildCssFontVariationSettings,
  resolveTextDirection,
  type RenderConfig,
  type AxisValue,
  type AxisDisplayInfo,
  type OverlayConfig,
} from "./renderer";
import {
  record as recordBlob,
  downloadBlob,
  formatSupportsLoopMode,
  type VideoFormat,
} from "./encoders";
import type {
  LoopMode,
  AlignMode,
  VAlign,
  OverlayPosition,
  ThumbShape,
  AxisMoveMode,
  TextDirection,
} from "./studio-store-types";
import { DEFAULT_OVERLAY_FONT } from "./studio-store-types";

export const REGISTERED_FAMILY = "VFStudioFont";

export interface AxisState extends FontAxis {
  current: number;
  animFrom: number;
  animTo: number;
  animate: boolean;
}

export interface StudioState {
  // Font
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

  // Canvas
  canvasWidth: number;
  canvasHeight: number;

  // Animation
  duration: number;
  fps: number;
  easing: EasingType;
  loopMode: LoopMode;
  axisMoveMode: AxisMoveMode; // binary bit-stepping or sync (all together)

  // Overlay (axis sliders + CSS code baked into preview + export)
  overlayEnabled: boolean;
  overlayShowSliders: boolean; // the slider block itself (track + thumb)
  overlayShowName: boolean;
  overlayShowTag: boolean;
  overlayShowMinMax: boolean; // axis min & max labels at track ends
  overlayShowLiveValue: boolean; // instantaneous value number on the slider
  overlayValueDecimals: number; // decimal places of the live value number
  overlayShowCss: boolean;
  overlayCentered: boolean; // center the slider stack horizontally
  overlayNameGap: number; // horizontal gap: inline axis name → track, em
  overlayCssGap: number; // slider ↔ CSS line gap, em of overlay font size
  overlayTextGap: number; // overlay stack ↔ text block gap, em of overlay font size
  overlayThumbScale: number; // thumb size multiplier
  overlayThumbShape: ThumbShape;
  overlayFont: string;
  overlayFontScale: number; // overlay TEXT size multiplier (1 = default)
  overlayBold: boolean; // draw overlay text bold
  overlayTrackLen: number; // slider track length as % of canvas width (20..100)
  overlayColor: string;
  overlayBgColor: string;
  overlayBgOpacity: number;
  overlayScale: number;
  overlayPosition: OverlayPosition;

  // Playback
  isPlaying: boolean;
  currentTime: number;

  // Recording
  isRecording: boolean;
  recordProgress: number;
  lastExportUrl: string | null;
  lastExportName: string | null;
  lastExportFormat: VideoFormat | null;

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

  setOverlayEnabled: (b: boolean) => void;
  setOverlayShowSliders: (b: boolean) => void;
  setOverlayShowName: (b: boolean) => void;
  setOverlayShowTag: (b: boolean) => void;
  setOverlayShowMinMax: (b: boolean) => void;
  setOverlayShowLiveValue: (b: boolean) => void;
  setOverlayValueDecimals: (n: number) => void;
  setOverlayShowCss: (b: boolean) => void;
  setOverlayCentered: (b: boolean) => void;
  setOverlayNameGap: (n: number) => void;
  setOverlayCssGap: (n: number) => void;
  setOverlayTextGap: (n: number) => void;
  setOverlayThumbScale: (n: number) => void;
  setOverlayThumbShape: (s: ThumbShape) => void;
  setOverlayFont: (f: string) => void;
  setOverlayFontScale: (n: number) => void;
  setOverlayBold: (b: boolean) => void;
  setOverlayTrackLen: (n: number) => void;
  setOverlayColor: (c: string) => void;
  setOverlayBgColor: (c: string) => void;
  setOverlayBgOpacity: (n: number) => void;
  setOverlayScale: (n: number) => void;
  setOverlayPosition: (p: OverlayPosition) => void;

  setAxisCurrent: (tag: string, value: number) => void;
  setAxisAnim: (tag: string, from: number, to: number) => void;
  toggleAxisAnimate: (tag: string) => void;
  resetAxisToDefault: (tag: string) => void;

  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (t: number) => void;
  setCurrentTime: (t: number) => void;

  record: (format: VideoFormat) => Promise<void>;
  cancelRecording: () => void;
  clearExport: () => void;
}

let cancelToken = { cancelled: false };

function buildAxes(parsed: FontAxis[]): AxisState[] {
  const preferredIndex = parsed.findIndex((a) => a.tag === "wght");
  const defaultIdx = preferredIndex >= 0 ? preferredIndex : 0;
  return parsed.map((a, i) => ({
    ...a,
    current: a.default,
    animFrom: a.min,
    animTo: a.max,
    animate: i === defaultIdx,
  }));
}

function valuesForProgress(
  axes: AxisState[],
  progress: number,
  easing: EasingType,
  mode: AxisMoveMode
): AxisValue[] {
  return computeAxisValues(axes, progress, easing, mode);
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

  canvasWidth: 960,
  canvasHeight: 540,

  duration: 3,
  fps: 60,
  easing: "easeInOut",
  loopMode: "pingpong",
  axisMoveMode: "binary",

  overlayEnabled: true,
  overlayShowSliders: true,
  overlayShowName: false,
  overlayShowTag: false,
  overlayShowMinMax: false,
  overlayShowLiveValue: false,
  overlayValueDecimals: 1,
  overlayShowCss: false,
  overlayCentered: true,
  overlayNameGap: 0.9,
  overlayCssGap: 1.1,
  overlayTextGap: 0.9,
  overlayThumbScale: 1,
  overlayThumbShape: "circle",
  overlayFont: DEFAULT_OVERLAY_FONT,
  overlayFontScale: 1,
  overlayBold: false,
  overlayTrackLen: 30,
  overlayColor: "#000000",
  overlayBgColor: "#ffffff",
  overlayBgOpacity: 0,
  overlayScale: 1,
  overlayPosition: "bottom",

  isPlaying: false,
  currentTime: 0,

  isRecording: false,
  recordProgress: 0,
  lastExportUrl: null,
  lastExportName: null,
  lastExportFormat: null,

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
  setFontSize: (fontSize) => set({ fontSize }),
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

  setOverlayEnabled: (overlayEnabled) => set({ overlayEnabled }),
  setOverlayShowSliders: (overlayShowSliders) => set({ overlayShowSliders }),
  setOverlayShowName: (overlayShowName) => set({ overlayShowName }),
  setOverlayShowTag: (overlayShowTag) => set({ overlayShowTag }),
  setOverlayShowMinMax: (overlayShowMinMax) => set({ overlayShowMinMax }),
  setOverlayShowLiveValue: (overlayShowLiveValue) =>
    set({ overlayShowLiveValue }),
  setOverlayValueDecimals: (overlayValueDecimals) =>
    set({ overlayValueDecimals }),
  setOverlayShowCss: (overlayShowCss) => set({ overlayShowCss }),
  setOverlayCentered: (overlayCentered) => set({ overlayCentered }),
  setOverlayNameGap: (overlayNameGap) => set({ overlayNameGap }),
  setOverlayCssGap: (overlayCssGap) => set({ overlayCssGap }),
  setOverlayTextGap: (overlayTextGap) => set({ overlayTextGap }),
  setOverlayThumbScale: (overlayThumbScale) => set({ overlayThumbScale }),
  setOverlayThumbShape: (overlayThumbShape) => set({ overlayThumbShape }),
  setOverlayFont: (overlayFont) => set({ overlayFont }),
  setOverlayFontScale: (overlayFontScale) => set({ overlayFontScale }),
  setOverlayBold: (overlayBold) => set({ overlayBold }),
  setOverlayTrackLen: (overlayTrackLen) => set({ overlayTrackLen }),
  setOverlayColor: (overlayColor) => set({ overlayColor }),
  setOverlayBgColor: (overlayBgColor) => set({ overlayBgColor }),
  setOverlayBgOpacity: (overlayBgOpacity) => set({ overlayBgOpacity }),
  setOverlayScale: (overlayScale) => set({ overlayScale }),
  setOverlayPosition: (overlayPosition) => set({ overlayPosition }),

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

  record: async (format) => {
    const s = get();
    if (!s.fontLoaded) return;
    if (s.isRecording) return;
    if (!formatSupportsLoopMode(format, s.loopMode)) {
      throw new Error(
        "Ping-pong mode is only supported for GIF export. Switch to once or loop for video formats."
      );
    }
    // Video "loop" renders the timeline forward then backward so the clip
    // loops seamlessly. With binary movement and multiple animated axes
    // that backward pass would replay the binary count in REVERSE, so this
    // combination is GIF-only (GIF loops one full forward cycle natively).
    if (
      format !== "gif" &&
      s.loopMode === "loop" &&
      s.axisMoveMode === "binary" &&
      s.axes.filter((a) => a.animate).length > 1
    ) {
      throw new Error(
        "Binary movement with multiple animated axes is GIF-only in Loop mode. Use Sync movement or animate a single axis for MP4/WebM."
      );
    }
    cancelToken = { cancelled: false };
    set({
      isRecording: true,
      recordProgress: 0,
      isPlaying: false,
      lastExportUrl: null,
      lastExportName: null,
      lastExportFormat: null,
    });
    try {
      const state = get();
      const blob = await recordBlob(format, {
        width: state.canvasWidth,
        height: state.canvasHeight,
        fps: state.fps,
        duration: state.duration,
        loopMode: state.loopMode,
        cancelled: () => cancelToken.cancelled,
        onProgress: (p) => set({ recordProgress: p }),
        getRenderConfig: (progress) => {
          const cur = get();
          const values = valuesForProgress(
            cur.axes,
            progress,
            cur.easing,
            cur.axisMoveMode
          );
          const overlay: OverlayConfig | null =
            cur.overlayEnabled &&
            ((cur.overlayShowSliders && cur.axes.length > 0) ||
              cur.overlayShowCss)
              ? {
                  showSliders: cur.overlayShowSliders,
                  showName: cur.overlayShowName,
                  showTag: cur.overlayShowTag,
                  showMinMax: cur.overlayShowMinMax,
                  showLiveValue: cur.overlayShowLiveValue,
                  valueDecimals: cur.overlayValueDecimals,
                  showCss: cur.overlayShowCss,
                  centered: cur.overlayCentered,
                  nameGap: cur.overlayNameGap,
                  cssGap: cur.overlayCssGap,
                  textGap: cur.overlayTextGap,
                  thumbScale: cur.overlayThumbScale,
                  thumbShape: cur.overlayThumbShape,
                  font: cur.overlayFont,
                  bold: cur.overlayBold,
                  fontScale: cur.overlayFontScale,
                  trackLenPct: cur.overlayTrackLen,
                  color: cur.overlayColor,
                  bgColor: cur.overlayBgColor,
                  bgOpacity: cur.overlayBgOpacity,
                  scale: cur.overlayScale,
                  position: cur.overlayPosition,
                  axes: cur.axes.map((a, i) => ({
                    tag: a.tag,
                    name: a.name,
                    value: values[i]?.value ?? a.current,
                    min: a.min,
                    max: a.max,
                  })),
                }
              : null;
          const cfg: RenderConfig = {
            text: cur.text,
            fontBase64: cur.fontBase64,
            fontCssFormat: cur.fontCssFormat,
            fontMime: cur.fontMime,
            variation: values,
            fontSize: cur.fontSize,
            textColor: cur.textColor,
            bgColor: cur.bgColor,
            width: cur.canvasWidth,
            height: cur.canvasHeight,
            letterSpacing: cur.letterSpacing,
            lineHeight: cur.lineHeight,
            align: cur.align,
            vAlign: cur.vAlign,
            direction: resolveTextDirection(cur.text, cur.textDirection),
            overlay,
          };
          return cfg;
        },
      });
      const url = URL.createObjectURL(blob);
      const stamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);
      const ext =
        format === "gif" ? "gif" : format === "mp4" ? "mp4" : "webm";
      const name = `variable-font-${stamp}.${ext}`;
      set({
        lastExportUrl: url,
        lastExportName: name,
        lastExportFormat: format,
        isRecording: false,
        recordProgress: 1,
      });
      downloadBlob(blob, name);
    } catch (e) {
      set({ isRecording: false, recordProgress: 0 });
      throw e;
    }
  },

  cancelRecording: () => {
    cancelToken.cancelled = true;
  },

  clearExport: () => {
    const { lastExportUrl } = get();
    if (lastExportUrl) URL.revokeObjectURL(lastExportUrl);
    set({ lastExportUrl: null, lastExportName: null, lastExportFormat: null });
  },
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
  return buildCssFontVariationSettings(values, s.overlayValueDecimals);
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
  }));
}

// Debug/testing handle — lets browser tooling inspect and drive the store
// (harmless in production: only adds a window reference in the client).
if (typeof window !== "undefined") {
  (window as unknown as { __studio?: typeof useStudio }).__studio = useStudio;
}
