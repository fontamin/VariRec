// Record/export slice of the studio store (zustand slice pattern).
//
// Holds the async frame-by-frame recorder, its cancellation token and the
// last-export bookkeeping. Lives apart from studio-store.ts so the store file
// stays declarative; the slice receives zustand's set/get and imports only
// TYPES from the store, so there is no runtime import cycle.
import {
  computeAxisValues,
  resolveTextDirection,
  type AxisValue,
  type OverlayConfig,
  type RenderConfig,
} from "./renderer";
import { ensureOutlineEngine } from "./outline";
import { APP_VERSION } from "./version";
import {
  record as recordBlob,
  downloadBlob,
  formatSupportsLoopMode,
  type VideoFormat,
} from "./encoders";
import type { EasingType } from "./easing";
import type { AxisMoveMode } from "./studio-store-types";
import type { AxisState, StudioState } from "./studio-store";

// State fields owned by this slice.
export interface RecordSliceState {
  isRecording: boolean;
  recordProgress: number;
  lastExportUrl: string | null;
  lastExportName: string | null;
  lastExportFormat: VideoFormat | null;
}

// Actions owned by this slice.
export interface RecordSliceActions {
  record: (format: VideoFormat) => Promise<void>;
  cancelRecording: () => void;
  clearExport: () => void;
}

let cancelToken = { cancelled: false };

function valuesForProgress(
  axes: AxisState[],
  progress: number,
  easing: EasingType,
  mode: AxisMoveMode
): AxisValue[] {
  return computeAxisValues(axes, progress, easing, mode);
}

export function createRecordSlice(
  set: (partial: Partial<StudioState>) => void,
  get: () => StudioState
): RecordSliceState & RecordSliceActions {
  return {
    isRecording: false,
    recordProgress: 0,
    lastExportUrl: null,
    lastExportName: null,
    lastExportFormat: null,

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
      // The outline layer lazily loads fontkit + bidi-js on first use; make
      // sure they are ready BEFORE the frame loop so no frame misses them.
      if (get().outline.enabled) {
        await ensureOutlineEngine();
      }
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
          repeat: state.repeat,
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
            // The baked overlay = the user's overlay settings group plus the
            // per-frame axis values, the panel drag offsets and the CSS
            // line's own drag offsets (it moves independently). It is drawn
            // only when the master switch is on and there is something to
            // draw (slider block on a loaded font, or the CSS code line).
            const { enabled, ...overlaySettings } = cur.overlay;
            const overlay: OverlayConfig | null =
              enabled &&
              ((overlaySettings.showSliders &&
                cur.axes.some((a) => a.visible)) ||
                overlaySettings.showCss)
                ? {
                    ...overlaySettings,
                    offsetX: cur.panelOffsetX,
                    offsetY: cur.panelOffsetY,
                    cssOffsetX: cur.cssOffsetX,
                    cssOffsetY: cur.cssOffsetY,
                    axes: cur.axes.map((a, i) => ({
                      tag: a.tag,
                      name: a.name,
                      value: values[i]?.value ?? a.current,
                      min: a.min,
                      max: a.max,
                      visible: a.visible,
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
              textOffsetX: cur.textOffsetX,
              textOffsetY: cur.textOffsetY,
              overlay,
              outline: cur.outline.enabled
                ? {
                    settings: cur.outline,
                    offsetX: cur.outlineOffsetX,
                    offsetY: cur.outlineOffsetY,
                    sfnt: cur.fontSfnt,
                  }
                : null,
              textVisible: cur.showTextLayer,
              layerOrder: cur.layerOrder,
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
        // VariRec + the app version ride at the END of the filename, so an
        // exported animation always identifies the tool (and the exact
        // release) that produced it: variable-font-<stamp>-VariRec-v1.2.0.gif
        const name = `variable-font-${stamp}-VariRec-v${APP_VERSION}.${ext}`;
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
  };
}
