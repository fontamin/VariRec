// Frame-accurate recording utilities.
//  - GIF via `gifenc` (pure JS, runs on the main thread, yields between frames)
//  - MP4  via `mp4-muxer`  + WebCodecs VideoEncoder (H.264/AVC)
//  - WebM via `webm-muxer` + WebCodecs VideoEncoder (VP9)
//
// Rendering is incremental: each frame is drawn to a shared offscreen canvas,
// encoded, then discarded — so memory stays flat regardless of duration.
//
// Loop-mode handling:
//  - once: render a single forward pass (0→1).
//  - loop: GIF → forward pass + infinite-loop flag (small file).
//          MP4/WebM → ping-pong pass (0→1→0) so the video loops seamlessly in
//          any player; duration doubles as requested.
//  - pingpong: GIF → 0→1→0 + infinite-loop flag. (MP4/WebM disable this mode.)

import { GIFEncoder, quantize, applyPalette } from "gifenc";
import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from "mp4-muxer";
import { Muxer as WebMMuxer, ArrayBufferTarget as WebMTarget } from "webm-muxer";
import { renderFrameToCanvas, type RenderConfig } from "./renderer";
import type { LoopMode } from "./studio-store-types";

export type VideoFormat = "gif" | "mp4" | "webm";

export interface RecorderOptions {
  width: number;
  height: number;
  fps: number;
  duration: number; // seconds (one forward pass)
  repeat: number; // how many cycles are tiled into the exported clip (1 = single cycle)
  loopMode: LoopMode;
  onProgress: (p: number) => void;
  getRenderConfig: (progress: number) => RenderConfig;
  cancelled: () => boolean;
}

export function isWebCodecsSupported(): boolean {
  return typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined";
}

// A format supports ping-pong in the output only for GIF. For MP4/WebM the
// "loop" mode already produces a seamless ping-pong-style video, so the
// explicit ping-pong mode is disabled there.
export function formatSupportsLoopMode(
  format: VideoFormat,
  loopMode: LoopMode
): boolean {
  if (loopMode === "pingpong") return format === "gif";
  return true;
}

// GIF stores each frame's delay in whole centiseconds (1/100 s steps), and
// browsers ignore delays below 2cs by snapping them to 100 ms. The closest
// legal delay therefore defines the ACTUAL playback rate, which can differ
// from the requested fps (e.g. 60 fps → 20 ms → 50 fps). The recorder uses
// this to keep the clip's wall-clock duration exact, and the UI surfaces the
// real rate so the user is never misled.
export function gifTiming(fps: number): {
  delayCs: number;
  actualFps: number;
} {
  const safe = Math.max(1, fps);
  const delayCs = Math.max(2, Math.round(100 / safe));
  return { delayCs, actualFps: 100 / delayCs };
}

function makeEven(n: number): number {
  return n % 2 === 0 ? n : n + 1;
}

function yieldToUi(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

// Build the normalised-progress sequence (0..1) for each frame, taking the
// loop mode, output format and repeat count into account. `repeat` tiles the
// single-cycle sequence that many times, so MP4/WebM length becomes
// Duration × Repeat (× 2 again in Loop mode, whose cycle is a seamless
// ping-pong). GIF repeats natively via its loop flag, so there `repeat`
// only applies in "once" mode (the GIF plays the cycle N times, then stops) —
// tiling identical cycles into an already-looping GIF would just bloat it.
export function computeProgressSequence(
  loopMode: LoopMode,
  format: VideoFormat,
  fps: number,
  duration: number,
  repeat = 1
): number[] {
  const n = Math.max(1, Math.round(duration * fps));
  const fwd = n === 1 ? [0] : Array.from({ length: n }, (_, i) => i / (n - 1));
  const pingpong = [...fwd, ...fwd.slice().reverse().slice(1)];

  let base: number[];
  if (loopMode === "once") {
    base = fwd;
  } else if (format === "gif") {
    // GIF: "loop" = single forward pass (GIF native loop flag makes it repeat).
    // "pingpong" = 0→1→0 so the looping GIF bounces back and forth seamlessly.
    base = loopMode === "loop" ? fwd : pingpong;
  } else {
    // MP4 / WebM: "loop" = ping-pong (0→1→0) for a seamless looping video.
    // Duration doubles because we render forward + backward.
    base = pingpong;
  }

  const reps =
    format === "gif" && loopMode !== "once"
      ? 1
      : Math.max(1, Math.round(repeat));
  const sequence: number[] = [];
  for (let i = 0; i < reps; i++) sequence.push(...base);
  return sequence;
}

async function pickAvcCodec(
  width: number,
  height: number,
  fps: number,
  bitrate: number
): Promise<VideoEncoderConfig> {
  const candidates = [
    { codec: "avc1.4d0028", profile: "main" },
    { codec: "avc1.42001f", profile: "baseline" },
    { codec: "avc1.640028", profile: "high" },
    { codec: "avc1.42e01f", profile: "baseline" },
  ];
  for (const c of candidates) {
    try {
      const cfg: VideoEncoderConfig = {
        codec: c.codec,
        width,
        height,
        bitrate,
        framerate: fps,
        latencyMode: "quality",
      };
      const support = await VideoEncoder.isConfigSupported(cfg);
      if (support.supported) return cfg;
    } catch {
      // try next
    }
  }
  return { codec: "avc1.42001f", width, height, bitrate, framerate: fps };
}

async function pickVp9Codec(
  width: number,
  height: number,
  fps: number,
  bitrate: number
): Promise<VideoEncoderConfig> {
  const candidates = [
    "vp09.00.10.08",
    "vp09.00.20.08",
    "vp09.01.10.08",
    "vp09.02.10.10",
  ];
  for (const codec of candidates) {
    try {
      const cfg: VideoEncoderConfig = {
        codec,
        width,
        height,
        bitrate,
        framerate: fps,
        latencyMode: "quality",
      };
      const support = await VideoEncoder.isConfigSupported(cfg);
      if (support.supported) return cfg;
    } catch {
      // try next
    }
  }
  return { codec: "vp09.00.10.08", width, height, bitrate, framerate: fps };
}

export async function encodeGif(opts: RecorderOptions): Promise<Blob> {
  const width = makeEven(opts.width);
  const height = makeEven(opts.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const gif = GIFEncoder();
  // Frame delay must be a legal GIF value (whole centiseconds, ≥ 2cs so no
  // browser snaps it to 100 ms). gifenc takes milliseconds and stores
  // round(ms/10) centiseconds. The frame count is derived from the ACTUAL
  // rate, so the exported clip lasts exactly the designed duration even
  // though the playback rate is quantized (60 fps → 50 fps → 150 frames for
  // a 3 s clip, not 180 frames stretched to 3.6 s).
  const { delayCs, actualFps } = gifTiming(opts.fps);
  const delay = delayCs * 10;
  const sequence = computeProgressSequence(
    opts.loopMode,
    "gif",
    actualFps,
    opts.duration,
    opts.repeat
  );
  const total = sequence.length;

  // repeat: 0 = infinite (loop/pingpong), -1 = no looping (once).
  const repeat = opts.loopMode === "once" ? -1 : 0;

  for (let i = 0; i < total; i++) {
    if (opts.cancelled()) throw new Error("Recording cancelled.");
    const cfg = opts.getRenderConfig(sequence[i]);
    await renderFrameToCanvas(canvas, cfg);
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const { data } = ctx.getImageData(0, 0, width, height);
    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);
    gif.writeFrame(index, width, height, {
      palette,
      delay,
      repeat: i === 0 ? repeat : undefined,
    });
    opts.onProgress((i + 1) / total);
    await yieldToUi();
  }
  gif.finish();
  return new Blob([gif.bytes()], { type: "image/gif" });
}

async function encodeWebCodecs(
  opts: RecorderOptions,
  kind: "mp4" | "webm"
): Promise<Blob> {
  if (!isWebCodecsSupported()) {
    throw new Error(
      "WebCodecs VideoEncoder is not available in this browser. Try Chrome/Edge."
    );
  }
  const width = makeEven(opts.width);
  const height = makeEven(opts.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  // Slightly above-average bitrate keeps small high-contrast details (the
  // live value numbers, thin track marks) from smearing on delta frames,
  // which can read as them blinking on and off between keyframes.
  const bitrate = Math.round(width * height * opts.fps * 0.2);
  const frameDurationUs = 1_000_000 / opts.fps;
  const format: VideoFormat = kind === "mp4" ? "mp4" : "webm";
  const sequence = computeProgressSequence(
    opts.loopMode,
    format,
    opts.fps,
    opts.duration,
    opts.repeat
  );
  const total = sequence.length;

  // mp4-muxer and webm-muxer ship two independent `Muxer` classes whose
  // option types don't form a compatible union (each brand-checks its own
  // Target), so the target + muxer pair is built per format explicitly.
  let target: Mp4Target | WebMTarget;
  let muxer: Mp4Muxer<Mp4Target> | WebMMuxer<WebMTarget>;
  if (kind === "mp4") {
    const mp4Target = new Mp4Target();
    muxer = new Mp4Muxer({
      target: mp4Target,
      video: {
        codec: "avc",
        width,
        height,
        frameRate: opts.fps,
      },
      fastStart: "in-memory",
    });
    target = mp4Target;
  } else {
    const webmTarget = new WebMTarget();
    // webm-muxer has no `fastStart` option; it buffers the file in memory
    // regardless, so runtime behaviour is unchanged.
    muxer = new WebMMuxer({
      target: webmTarget,
      video: {
        codec: "V_VP9",
        width,
        height,
        frameRate: opts.fps,
      },
    });
    target = webmTarget;
  }

  const codecCfg =
    kind === "mp4"
      ? await pickAvcCodec(width, height, opts.fps, bitrate)
      : await pickVp9Codec(width, height, opts.fps, bitrate);

  let encoderError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encoderError = e;
    },
  });
  encoder.configure(codecCfg);

  for (let i = 0; i < total; i++) {
    if (opts.cancelled()) {
      encoder.close();
      throw new Error("Recording cancelled.");
    }
    const cfg = opts.getRenderConfig(sequence[i]);
    await renderFrameToCanvas(canvas, cfg);
    const frame = new VideoFrame(canvas, {
      timestamp: Math.round(i * frameDurationUs),
      duration: Math.round(frameDurationUs),
    });
    // Keyframe every 15 frames: small overlay text stays crisp instead of
    // pulsing between a sharp keyframe and softened delta frames.
    encoder.encode(frame, { keyFrame: i % 15 === 0 });
    frame.close();
    while (encoder.encodeQueueSize > 6) {
      await yieldToUi();
    }
    if (encoderError) throw encoderError;
    opts.onProgress((i + 1) / total);
    await yieldToUi();
  }

  await encoder.flush();
  encoder.close();
  if (encoderError) throw encoderError;
  muxer.finalize();
  // Both ArrayBufferTargets expose the finalized file as `buffer: ArrayBuffer`.
  const buffer = target.buffer;
  const type = kind === "mp4" ? "video/mp4" : "video/webm";
  return new Blob([buffer], { type });
}

export function encodeMp4(opts: RecorderOptions): Promise<Blob> {
  return encodeWebCodecs(opts, "mp4");
}

export function encodeWebm(opts: RecorderOptions): Promise<Blob> {
  return encodeWebCodecs(opts, "webm");
}

export async function record(
  format: VideoFormat,
  opts: RecorderOptions
): Promise<Blob> {
  if (format === "gif") return encodeGif(opts);
  if (format === "mp4") return encodeMp4(opts);
  return encodeWebm(opts);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
