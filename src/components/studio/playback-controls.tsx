"use client";

import { Play, Pause, Square, SkipBack, SkipForward } from "lucide-react";
import { useStudio } from "@/lib/studio-store";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

/**
 * Compact transport bar — one fixed 44px row pinned BELOW the stage (not
 * glued to the canvas edge), so it stays in place whatever the canvas
 * aspect ratio is.
 */
export function PlaybackControls() {
  const isPlaying = useStudio((s) => s.isPlaying);
  const currentTime = useStudio((s) => s.currentTime);
  const duration = useStudio((s) => s.duration);
  const fontLoaded = useStudio((s) => s.fontLoaded);

  const play = useStudio((s) => s.play);
  const pause = useStudio((s) => s.pause);
  const stop = useStudio((s) => s.stop);
  const seek = useStudio((s) => s.seek);

  const elapsed = currentTime * duration;

  return (
    <div
      className="flex h-11 shrink-0 items-center gap-1.5 rounded-lg border bg-card px-2 shadow-sm"
      role="group"
      aria-label="Playback controls"
    >
      <Button
        variant="outline"
        size="icon"
        className="size-7"
        onClick={() => seek(0)}
        disabled={!fontLoaded}
        aria-label="Go to start"
        title="Go to start"
      >
        <SkipBack className="size-3.5" />
      </Button>
      {isPlaying ? (
        <Button
          className="h-7 gap-1.5 bg-emerald-600 px-2.5 text-xs text-white hover:bg-emerald-700"
          onClick={pause}
          disabled={!fontLoaded}
        >
          <Pause className="size-3.5" /> Pause
        </Button>
      ) : (
        <Button
          className="h-7 gap-1.5 bg-emerald-600 px-2.5 text-xs text-white hover:bg-emerald-700"
          onClick={play}
          disabled={!fontLoaded}
        >
          <Play className="size-3.5" /> Play
        </Button>
      )}
      <Button
        variant="outline"
        size="icon"
        className="size-7"
        onClick={stop}
        disabled={!fontLoaded}
        aria-label="Stop"
        title="Stop"
      >
        <Square className="size-3.5" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="size-7"
        onClick={() => seek(1)}
        disabled={!fontLoaded}
        aria-label="Go to end"
        title="Go to end"
      >
        <SkipForward className="size-3.5" />
      </Button>
      <Slider
        value={[currentTime]}
        min={0}
        max={1}
        step={0.001}
        onValueChange={(v) => seek(v[0] ?? 0)}
        className="min-w-4 flex-1"
        aria-label="Playback position"
      />
      <span className="w-16 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
        {elapsed.toFixed(1)}/{duration.toFixed(1)}s
      </span>
    </div>
  );
}
