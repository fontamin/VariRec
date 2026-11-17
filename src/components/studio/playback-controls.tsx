"use client";

import { Play, Pause, Square, SkipBack, SkipForward } from "lucide-react";
import { useStudio } from "@/lib/studio-store";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

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
    <div className="flex items-center gap-2 rounded-lg border bg-card p-2 shadow-sm">
      <Button
        variant="outline"
        size="icon"
        className="size-8"
        onClick={() => seek(0)}
        disabled={!fontLoaded}
        aria-label="Go to start"
      >
        <SkipBack className="size-3.5" />
      </Button>
      {isPlaying ? (
        <Button
          className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700 h-8"
          onClick={pause}
          disabled={!fontLoaded}
        >
          <Pause className="size-3.5" /> Pause
        </Button>
      ) : (
        <Button
          className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700 h-8"
          onClick={play}
          disabled={!fontLoaded}
        >
          <Play className="size-3.5" /> Play
        </Button>
      )}
      <Button
        variant="outline"
        size="icon"
        className="size-8"
        onClick={stop}
        disabled={!fontLoaded}
        aria-label="Stop"
      >
        <Square className="size-3.5" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="size-8"
        onClick={() => seek(1)}
        disabled={!fontLoaded}
        aria-label="Go to end"
      >
        <SkipForward className="size-3.5" />
      </Button>
      <Slider
        value={[currentTime]}
        min={0}
        max={1}
        step={0.001}
        onValueChange={(v) => seek(v[0] ?? 0)}
        className="flex-1"
      />
      <span className="w-16 text-right font-mono text-[11px] text-muted-foreground">
        {elapsed.toFixed(1)}/{duration.toFixed(1)}s
      </span>
    </div>
  );
}
