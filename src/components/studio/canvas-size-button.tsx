"use client";

/**
 * Canvas-size control living in the preview header: the resolution readout
 * ("960 × 540") IS the trigger — clicking it opens a popover with the exact
 * width/height entry plus one-click preset chips. This replaces the old
 * canvas-size tool inside the floating style toolbar.
 */

import { useState } from "react";
import { Maximize2 } from "lucide-react";
import { useStudio } from "@/lib/studio-store";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CanvasSizeInput } from "./canvas-size-input";
import { cn } from "@/lib/utils";

export const CANVAS_PRESETS: { label: string; w: number; h: number }[] = [
  { label: "16:9", w: 960, h: 540 },
  { label: "1:1", w: 720, h: 720 },
  { label: "4:3", w: 960, h: 720 },
  { label: "9:16", w: 432, h: 768 },
  { label: "21:9", w: 1050, h: 450 },
  { label: "1:1 HD", w: 1080, h: 1080 },
  { label: "9:16 HD", w: 1080, h: 1920 },
  { label: "16:9 HD", w: 1920, h: 1080 },
];

export function CanvasSizeButton() {
  const canvasWidth = useStudio((s) => s.canvasWidth);
  const canvasHeight = useStudio((s) => s.canvasHeight);
  const setCanvasSize = useStudio((s) => s.setCanvasSize);
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Canvas size — click to change the export resolution"
          aria-label="Canvas size"
          className="flex h-6 items-center gap-1 rounded-md border bg-background px-1.5 text-[11px] font-medium tabular-nums text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Maximize2 className="size-3" />
          <span>
            {canvasWidth} × {canvasHeight}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        collisionPadding={12}
        className="w-72 p-3"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* Typed sizes commit only on "Apply size" (or Enter) — see
            CanvasSizeInput. Preset chips below stay one-click instant. */}
        <CanvasSizeInput />
        <div className="mt-2 flex flex-wrap gap-1">
          {CANVAS_PRESETS.map((p) => {
            const active = p.w === canvasWidth && p.h === canvasHeight;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => setCanvasSize(p.w, p.h)}
                aria-pressed={active}
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[11px] transition-colors",
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border hover:bg-muted"
                )}
              >
                {p.label}
                <span className="ml-1 opacity-60">
                  {p.w}×{p.h}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
          The canvas is the export resolution — the preview zoom never
          changes it.
        </p>
      </PopoverContent>
    </Popover>
  );
}
