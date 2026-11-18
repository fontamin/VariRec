"use client";

import { useEffect } from "react";
import { useStudio } from "@/lib/studio-store";

/**
 * Invisible component that drives the live preview timeline.
 * Runs a requestAnimationFrame loop whenever playback is active and writes the
 * normalised progress (0..1) back into the store so the PreviewStage (which
 * subscribes transiently) and the scrubber stay in sync.
 */
export function PlaybackEngine() {
  const isPlaying = useStudio((s) => s.isPlaying);

  useEffect(() => {
    if (!isPlaying) return;
    const state = useStudio.getState();
    const durMs = state.duration * 1000;
    const startWall = performance.now();
    // Account for resuming from a non-zero position.
    const startTime = startWall - state.currentTime * durMs;

    let raf = 0;
    const tick = (now: number) => {
      const s = useStudio.getState();
      const d = s.duration * 1000;
      const elapsed = now - startTime;

      if (s.loopMode === "pingpong") {
        const cycleDur = d * 2;
        const cycle = (elapsed % cycleDur) / cycleDur;
        const t = cycle < 0.5 ? cycle * 2 : 2 - cycle * 2;
        s.setCurrentTime(t);
        raf = requestAnimationFrame(tick);
        return;
      }

      const t = (elapsed % d) / d;
      s.setCurrentTime(t);

      if (s.loopMode === "once" && elapsed >= d) {
        s.setCurrentTime(1);
        s.pause();
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);

  return null;
}
