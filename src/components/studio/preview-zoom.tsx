"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Preview zoom mode: the two Fit modes auto-scale the stage into the
// available space (column width / available height); a number
// renders the canvas at exactly that multiple of its natural pixel size.
// Preview-only — the export always renders at the full canvas resolution.
export type ZoomMode = "fit-width" | "fit-height" | number;

const PRESETS = [0.2, 0.5, 1, 2] as const;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 8;

const isPreset = (m: ZoomMode) =>
  typeof m === "number" && PRESETS.some((p) => Math.abs(p - m) < 1e-9);

// Accept "0.75", "75%" and bare "75" (read as 75% since no multiplier goes
// above 8×). Returns a clamped multiplier or null when unparseable.
function parseZoom(raw: string): number | null {
  const s = raw.trim().replace(/%\s*$/, "");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  const mult = n > MAX_ZOOM ? n / 100 : n;
  if (mult < MIN_ZOOM || mult > MAX_ZOOM) return null;
  return mult;
}

export function PreviewZoomControl({
  mode,
  effective,
  onChange,
}: {
  mode: ZoomMode;
  effective: number;
  onChange: (mode: ZoomMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const parsed = useMemo(() => parseZoom(custom), [custom]);

  // Pre-fill the custom field with the active ratio when opening on a
  // non-preset zoom (event-handler prefill, not an effect).
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next && typeof mode === "number" && !isPreset(mode)) {
      setCustom(String(Number(mode.toFixed(3))));
    }
  };

  const label =
    mode === "fit-width"
      ? "Fit W"
      : mode === "fit-height"
        ? "Fit H"
        : `${Math.round(effective * 100)}%`;

  const applyCustom = () => {
    if (parsed == null) return;
    onChange(parsed);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Preview zoom — scales the preview only, never the export"
          aria-label="Preview zoom"
          className="flex h-6 min-w-[3.6rem] items-center justify-center gap-0.5 rounded-md border bg-background px-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <span>{label}</span>
          <ChevronsUpDown className="size-2.5 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        collisionPadding={12}
        className="w-52 p-1.5"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div role="listbox" aria-label="Preview zoom">
          <ZoomOption
            active={mode === "fit-width"}
            label="Fit W"
            hint="fills the column"
            onClick={() => {
              onChange("fit-width");
              setOpen(false);
            }}
          />
          <ZoomOption
            active={mode === "fit-height"}
            label="Fit H"
            hint="fills the height"
            onClick={() => {
              onChange("fit-height");
              setOpen(false);
            }}
          />
          {PRESETS.map((p) => (
            <ZoomOption
              key={p}
              active={isPreset(mode) && Math.abs((mode as number) - p) < 1e-9}
              label={`${p}×`}
              hint={`${Math.round(p * 100)}%`}
              onClick={() => {
                onChange(p);
                setOpen(false);
              }}
            />
          ))}
          <ZoomOption
            active={typeof mode === "number" && !isPreset(mode)}
            label="Custom…"
            hint=""
            onClick={() => {
              // Keep the popover open so the ratio field can be used.
            }}
          />
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 border-t px-1 pt-2">
          <Input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyCustom();
              }
            }}
            inputMode="decimal"
            placeholder="e.g. 0.75 or 75%"
            aria-label="Custom zoom ratio"
            className={cn(
              "h-7 flex-1 border-0 bg-muted/60 text-[11px] shadow-none focus-visible:ring-1",
              custom && parsed == null &&
                "text-destructive focus-visible:ring-destructive"
            )}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[11px]"
            disabled={parsed == null}
            onClick={applyCustom}
          >
            Set
          </Button>
        </div>
        <p className="px-2 pb-0.5 pt-1.5 text-[10px] leading-snug text-muted-foreground">
          Preview zoom only — exports always keep the full canvas resolution.
        </p>
      </PopoverContent>
    </Popover>
  );
}

function ZoomOption({
  active,
  label,
  hint,
  onClick,
}: {
  active: boolean;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs transition-colors",
        active
          ? "bg-muted font-medium text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      )}
    >
      <span className="flex items-center gap-1.5">
        <Check
          className={cn("size-3", active ? "opacity-100" : "opacity-0")}
        />
        {label}
      </span>
      {hint && <span className="text-[10px] opacity-60">{hint}</span>}
    </button>
  );
}
