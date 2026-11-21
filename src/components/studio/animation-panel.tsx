"use client";

import { Clapperboard, Repeat } from "lucide-react";
import { useStudio } from "@/lib/studio-store";
import type { LoopMode } from "@/lib/studio-store-types";
import { EASING_OPTIONS } from "@/lib/easing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";

const FPS_OPTIONS = [12, 15, 24, 30, 60];

export function AnimationPanel() {
  const duration = useStudio((s) => s.duration);
  const fps = useStudio((s) => s.fps);
  const easing = useStudio((s) => s.easing);
  const loopMode = useStudio((s) => s.loopMode);
  const repeat = useStudio((s) => s.repeat);

  const setDuration = useStudio((s) => s.setDuration);
  const setFps = useStudio((s) => s.setFps);
  const setEasing = useStudio((s) => s.setEasing);
  const setLoopMode = useStudio((s) => s.setLoopMode);
  const setRepeat = useStudio((s) => s.setRepeat);

  const reps = Math.max(1, Math.round(repeat));
  // MP4/WebM tile the cycle `repeat` times (and Loop mode renders a seamless
  // ping-pong, doubling the length) — the same math the encoders apply.
  const videoTotal = duration * (loopMode === "loop" ? 2 : 1) * reps;

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b px-3 py-2.5">
        <CardTitle className="flex items-center gap-2 text-xs">
          <Clapperboard className="size-3.5 text-muted-foreground" />
          Animation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-3 py-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Duration</Label>
              <span className="font-mono text-[11px] text-muted-foreground">
                {duration.toFixed(1)}s
              </span>
            </div>
            <Slider
              value={[duration]}
              min={0.5}
              max={15}
              step={0.5}
              onValueChange={(v) => setDuration(v[0] ?? 3)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Easing</Label>
            <Select
              value={easing}
              onValueChange={(v) => setEasing(v as typeof easing)}
            >
              <SelectTrigger className="h-7 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EASING_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-[11px]">Frame rate</Label>
            <div className="flex gap-1">
              {FPS_OPTIONS.map((f) => (
                <button
                  key={f}
                  onClick={() => setFps(f)}
                  className={
                    "flex-1 rounded border py-0.5 text-[11px] transition-colors " +
                    (f === fps
                      ? "border-foreground bg-foreground text-background"
                      : "border-border hover:bg-muted")
                  }
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="flex items-center gap-1 text-[11px]">
              <Repeat className="size-3 text-muted-foreground" />
              Loop
            </Label>
            <ToggleGroup
              type="single"
              value={loopMode}
              onValueChange={(v) => v && setLoopMode(v as LoopMode)}
              className="w-full"
            >
              <ToggleGroupItem value="once" className="flex-1 text-[11px]">
                Once
              </ToggleGroupItem>
              <ToggleGroupItem value="loop" className="flex-1 text-[11px]">
                Loop
              </ToggleGroupItem>
              <ToggleGroupItem value="pingpong" className="flex-1 text-[11px]">
                Ping
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Repeat</Label>
              <span className="font-mono text-[11px] text-muted-foreground">
                {reps}×
              </span>
            </div>
            <Slider
              value={[reps]}
              min={1}
              max={20}
              step={1}
              onValueChange={(v) => setRepeat(Math.round(v[0] ?? 1))}
              aria-label="Repeat count"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Video length</Label>
            <div
              className="flex h-7 items-center rounded-md border bg-muted/40 px-2 font-mono text-[11px] text-muted-foreground"
              aria-live="polite"
            >
              {videoTotal.toFixed(1)}s
            </div>
          </div>
        </div>

        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Repeat tiles the animation cycle into the export: video length =
          Duration × Repeat (doubled again in Loop mode for a seamless
          ping-pong). GIF loops natively, so Repeat applies to it only in Once
          mode.
        </p>

        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Typography, colors, canvas size and the axis-slider overlay are
          edited directly inside the preview — use the floating toolbar at the
          bottom of the canvas.
        </p>
      </CardContent>
    </Card>
  );
}
