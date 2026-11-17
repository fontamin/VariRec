"use client";

import { useMemo } from "react";
import { RotateCcw, ArrowRight, Binary, Equal } from "lucide-react";
import { useStudio } from "@/lib/studio-store";
import type { AxisState } from "@/lib/studio-store";
import type { AxisMoveMode } from "@/lib/studio-store-types";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

function stepFor(min: number, max: number): number {
  const range = Math.abs(max - min);
  if (range < 5) return 0.01;
  if (range < 50) return 0.1;
  return 1;
}

function fmt(n: number, step: number): string {
  const decimals = step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0;
  return n.toFixed(decimals);
}

// "000" → "001" → … sequence for small bit counts, shown as a hint.
function binaryPattern(n: number): string {
  if (n <= 0) return "";
  const total = 1 << n;
  if (n > 3) return `${total} states (000… → 111…)`;
  const seq: string[] = [];
  for (let s = 0; s < total; s++) seq.push(s.toString(2).padStart(n, "0"));
  return `${seq.join(" → ")} → ${seq[0]}`;
}

/**
 * How animated axes move through time:
 * - Binary (default): animated axes count through a binary sequence — the
 *   topmost animated axis is the least significant bit; N axes cycle through
 *   2^N states (2 axes: 00 → 01 → 10 → 11 → 00).
 * - Sync: all animated axes move together on one shared timeline.
 */
export function AxisMoveModeControl() {
  const mode = useStudio((s) => s.axisMoveMode);
  const setMode = useStudio((s) => s.setAxisMoveMode);
  const axes = useStudio((s) => s.axes);
  const animatedCount = useMemo(
    () => axes.reduce((n, a) => (a.animate ? n + 1 : n), 0),
    [axes]
  );

  return (
    <div className="space-y-1.5 border-b px-2.5 pb-2.5 pt-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="flex items-center gap-1.5 text-[11px]">
          <Binary className="size-3 text-muted-foreground" />
          Movement
        </Label>
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(v) => v && setMode(v as AxisMoveMode)}
          className="h-7"
        >
          <ToggleGroupItem
            value="binary"
            aria-label="Binary movement"
            className="gap-1 px-2.5 text-[11px]"
          >
            <Binary className="size-3" />
            Binary
          </ToggleGroupItem>
          <ToggleGroupItem
            value="sync"
            aria-label="Sync movement"
            className="gap-1 px-2.5 text-[11px]"
          >
            <Equal className="size-3" />
            Sync
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <p className="text-[10px] leading-snug text-muted-foreground">
        {mode === "sync"
          ? "All animated axes move together on one shared timeline."
          : animatedCount === 0
            ? "Animate axes to include them in the binary count — each animated axis is one bit, the top axis being the least significant."
            : animatedCount === 1
              ? "One animated axis sweeps out and back each cycle. Animate more axes to build a binary pattern (top axis = least significant bit)."
              : `Animated axes count in binary — the top axis is the least significant bit. ${binaryPattern(animatedCount)}`}
      </p>
    </div>
  );
}

export function AxisControl({ axis }: { axis: AxisState }) {
  const setAxisCurrent = useStudio((s) => s.setAxisCurrent);
  const setAxisAnim = useStudio((s) => s.setAxisAnim);
  const toggleAnimate = useStudio((s) => s.toggleAxisAnimate);
  const resetAxis = useStudio((s) => s.resetAxisToDefault);

  const step = useMemo(() => stepFor(axis.min, axis.max), [axis.min, axis.max]);
  const decimals = step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0;

  return (
    <Card className="gap-0 p-0 py-0">
      <div className="flex items-center justify-between gap-2 border-b px-2.5 py-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="rounded bg-foreground px-1 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-background">
            {axis.tag}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium leading-tight">
              {axis.name}
            </p>
            <p className="text-[10px] leading-tight text-muted-foreground">
              {fmt(axis.min, step)}–{fmt(axis.max, step)}
              <span className="opacity-60"> · def {fmt(axis.default, step)}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Switch
            checked={axis.animate}
            onCheckedChange={() => toggleAnimate(axis.tag)}
            aria-label={`Animate ${axis.name}`}
            className="scale-90"
          />
        </div>
      </div>

      <div className="space-y-1.5 px-2.5 py-2">
        {axis.animate ? (
          <>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Animate
              </span>
              <div className="flex items-center gap-1">
                <span className="rounded bg-orange-100 px-1 py-0.5 font-mono text-[10px] font-semibold text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">
                  {fmt(axis.animFrom, step)}
                </span>
                <ArrowRight className="size-2.5 text-muted-foreground" aria-hidden />
                <span className="rounded bg-orange-100 px-1 py-0.5 font-mono text-[10px] font-semibold text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">
                  {fmt(axis.animTo, step)}
                </span>
              </div>
            </div>
            <Slider
              value={[axis.animFrom, axis.animTo]}
              min={axis.min}
              max={axis.max}
              step={step}
              onValueChange={(v) =>
                setAxisAnim(axis.tag, v[0] ?? axis.min, v[1] ?? axis.max)
              }
            />
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <button
                className="hover:text-foreground"
                onClick={() => setAxisAnim(axis.tag, axis.min, axis.animTo)}
              >
                min
              </button>
              <button
                className="rounded px-1 hover:bg-muted hover:text-foreground"
                onClick={() =>
                  setAxisAnim(axis.tag, axis.animTo, axis.animFrom)
                }
                title="Swap direction"
              >
                swap
              </button>
              <button
                className="hover:text-foreground"
                onClick={() => setAxisAnim(axis.tag, axis.animFrom, axis.max)}
              >
                max
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Live value
              </span>
              <span className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] font-semibold">
                {fmt(axis.current, step)}
              </span>
            </div>
            <Slider
              value={[axis.current]}
              min={axis.min}
              max={axis.max}
              step={step}
              onValueChange={(v) => setAxisCurrent(axis.tag, v[0] ?? axis.default)}
            />
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <button
                className="hover:text-foreground"
                onClick={() => setAxisCurrent(axis.tag, axis.min)}
              >
                {fmt(axis.min, step)}
              </button>
              <button
                className={cn(
                  "rounded px-1 hover:bg-muted hover:text-foreground"
                )}
                onClick={() => resetAxis(axis.tag)}
                title="Reset to default"
              >
                <RotateCcw className="mx-auto size-2.5" />
              </button>
              <button
                className="hover:text-foreground"
                onClick={() => setAxisCurrent(axis.tag, axis.max)}
              >
                {fmt(axis.max, step)}
              </button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
