"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { useStudio } from "@/lib/studio-store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const MIN_SIZE = 64;
const MAX_SIZE = 2560;

/**
 * Canvas width/height entry that does NOT touch the store while typing.
 *
 * Typed numbers go into local draft state; the new size is committed only
 * when the user presses "Apply size" (or Enter inside either field). This
 * keeps the preview stable mid-edit — previously every keystroke resized
 * the canvas instantly (with clamping rewriting the field, e.g. typing "1"
 * snapping to 64), which made everything jump around.
 *
 * Preset chips elsewhere still apply instantly (one deliberate click), and
 * this component re-syncs its drafts whenever the stored size changes.
 */
export function CanvasSizeInput({ compact = false }: { compact?: boolean }) {
  const canvasWidth = useStudio((s) => s.canvasWidth);
  const canvasHeight = useStudio((s) => s.canvasHeight);
  const setCanvasSize = useStudio((s) => s.setCanvasSize);

  const [wDraft, setWDraft] = useState(String(canvasWidth));
  const [hDraft, setHDraft] = useState(String(canvasHeight));

  // If the stored size changed elsewhere (preset chips, …), show it here.
  useEffect(() => {
    setWDraft(String(canvasWidth));
  }, [canvasWidth]);
  useEffect(() => {
    setHDraft(String(canvasHeight));
  }, [canvasHeight]);

  const w = parseInt(wDraft, 10);
  const h = parseInt(hDraft, 10);
  const valid = !Number.isNaN(w) && !Number.isNaN(h);
  const pendingW = valid ? Math.min(MAX_SIZE, Math.max(MIN_SIZE, w)) : null;
  const pendingH = valid ? Math.min(MAX_SIZE, Math.max(MIN_SIZE, h)) : null;
  const dirty =
    pendingW !== null &&
    pendingH !== null &&
    (pendingW !== canvasWidth || pendingH !== canvasHeight);

  const apply = () => {
    if (pendingW === null || pendingH === null || !dirty) return;
    setCanvasSize(pendingW, pendingH);
  };

  const inputCls = compact
    ? "h-6 flex-1 px-1.5 text-[11px]"
    : "h-7 flex-1 px-1.5 text-xs";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          min={MIN_SIZE}
          max={MAX_SIZE}
          step={2}
          value={wDraft}
          onChange={(e) => setWDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply();
          }}
          className={inputCls}
          aria-label="Canvas width"
        />
        <span className="text-[11px] text-muted-foreground">×</span>
        <Input
          type="number"
          min={MIN_SIZE}
          max={MAX_SIZE}
          step={2}
          value={hDraft}
          onChange={(e) => setHDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply();
          }}
          className={inputCls}
          aria-label="Canvas height"
        />
      </div>
      <Button
        type="button"
        size="sm"
        className={compact ? "h-6 w-full text-[11px]" : "h-7 w-full text-xs"}
        disabled={!dirty}
        onClick={apply}
        title="Apply the new canvas size (Enter)"
      >
        <Check className="size-3" />
        Apply size
      </Button>
    </div>
  );
}
