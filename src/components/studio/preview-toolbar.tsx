"use client";

/**
 * Floating in-preview editor. Every styling control lives inside the preview
 * itself (Figma-style): text, font size, line height, letter spacing,
 * horizontal/vertical alignment, colors, canvas size and the axis-slider
 * overlay appearance (thumb size & shape, gap to the text block, …).
 *
 * The toolbar is DOM-only chrome — it is never baked into the exported
 * frames, which are rendered by the SVG renderer from the store alone.
 * When the baked overlay sits at the bottom of the canvas the toolbar flips
 * to the top so it never covers it, and vice versa.
 */

import { type ComponentType, type ReactNode } from "react";
import {
  Type,
  LetterText,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Palette,
  Maximize2,
  SlidersHorizontal,
  ArrowLeftRight,
  ArrowUpToLine,
  ArrowDownToLine,
  AlignVerticalJustifyCenter,
} from "lucide-react";
import { useStudio } from "@/lib/studio-store";
import type {
  AlignMode,
  VAlign,
  OverlayPosition,
  ThumbShape,
  TextDirection,
} from "@/lib/studio-store-types";
import { THUMB_SHAPES, OVERLAY_FONTS } from "@/lib/studio-store-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { cn } from "@/lib/utils";

const CANVAS_PRESETS: { label: string; w: number; h: number }[] = [
  { label: "16:9", w: 960, h: 540 },
  { label: "1:1", w: 720, h: 720 },
  { label: "4:3", w: 960, h: 720 },
  { label: "9:16", w: 432, h: 768 },
  { label: "21:9", w: 1050, h: 450 },
];

export function PreviewToolbar({ placeTop }: { placeTop: boolean }) {
  const text = useStudio((s) => s.text);
  const setText = useStudio((s) => s.setText);
  const fontSize = useStudio((s) => s.fontSize);
  const setFontSize = useStudio((s) => s.setFontSize);
  const lineHeight = useStudio((s) => s.lineHeight);
  const setLineHeight = useStudio((s) => s.setLineHeight);
  const letterSpacing = useStudio((s) => s.letterSpacing);
  const setLetterSpacing = useStudio((s) => s.setLetterSpacing);
  const align = useStudio((s) => s.align);
  const setAlign = useStudio((s) => s.setAlign);
  const vAlign = useStudio((s) => s.vAlign);
  const setVAlign = useStudio((s) => s.setVAlign);
  const textDirection = useStudio((s) => s.textDirection);
  const setTextDirection = useStudio((s) => s.setTextDirection);
  const textColor = useStudio((s) => s.textColor);
  const setTextColor = useStudio((s) => s.setTextColor);
  const bgColor = useStudio((s) => s.bgColor);
  const setBgColor = useStudio((s) => s.setBgColor);
  const canvasWidth = useStudio((s) => s.canvasWidth);
  const canvasHeight = useStudio((s) => s.canvasHeight);
  const setCanvasSize = useStudio((s) => s.setCanvasSize);

  const overlayEnabled = useStudio((s) => s.overlayEnabled);
  const setOverlayEnabled = useStudio((s) => s.setOverlayEnabled);
  const overlayShowSliders = useStudio((s) => s.overlayShowSliders);
  const setOverlayShowSliders = useStudio((s) => s.setOverlayShowSliders);
  const overlayShowName = useStudio((s) => s.overlayShowName);
  const setOverlayShowName = useStudio((s) => s.setOverlayShowName);
  const overlayShowTag = useStudio((s) => s.overlayShowTag);
  const setOverlayShowTag = useStudio((s) => s.setOverlayShowTag);
  const overlayShowMinMax = useStudio((s) => s.overlayShowMinMax);
  const setOverlayShowMinMax = useStudio((s) => s.setOverlayShowMinMax);
  const overlayShowLiveValue = useStudio((s) => s.overlayShowLiveValue);
  const setOverlayShowLiveValue = useStudio((s) => s.setOverlayShowLiveValue);
  const overlayValueDecimals = useStudio((s) => s.overlayValueDecimals);
  const setOverlayValueDecimals = useStudio((s) => s.setOverlayValueDecimals);
  const overlayShowCss = useStudio((s) => s.overlayShowCss);
  const setOverlayShowCss = useStudio((s) => s.setOverlayShowCss);
  const overlayCentered = useStudio((s) => s.overlayCentered);
  const setOverlayCentered = useStudio((s) => s.setOverlayCentered);
  const overlayNameGap = useStudio((s) => s.overlayNameGap);
  const setOverlayNameGap = useStudio((s) => s.setOverlayNameGap);
  const overlayCssGap = useStudio((s) => s.overlayCssGap);
  const setOverlayCssGap = useStudio((s) => s.setOverlayCssGap);
  const overlayTextGap = useStudio((s) => s.overlayTextGap);
  const setOverlayTextGap = useStudio((s) => s.setOverlayTextGap);
  const overlayThumbScale = useStudio((s) => s.overlayThumbScale);
  const setOverlayThumbScale = useStudio((s) => s.setOverlayThumbScale);
  const overlayThumbShape = useStudio((s) => s.overlayThumbShape);
  const setOverlayThumbShape = useStudio((s) => s.setOverlayThumbShape);
  const overlayFont = useStudio((s) => s.overlayFont);
  const setOverlayFont = useStudio((s) => s.setOverlayFont);
  const overlayColor = useStudio((s) => s.overlayColor);
  const setOverlayColor = useStudio((s) => s.setOverlayColor);
  const overlayBgColor = useStudio((s) => s.overlayBgColor);
  const setOverlayBgColor = useStudio((s) => s.setOverlayBgColor);
  const overlayBgOpacity = useStudio((s) => s.overlayBgOpacity);
  const setOverlayBgOpacity = useStudio((s) => s.setOverlayBgOpacity);
  const overlayScale = useStudio((s) => s.overlayScale);
  const setOverlayScale = useStudio((s) => s.setOverlayScale);
  const overlayPosition = useStudio((s) => s.overlayPosition);
  const setOverlayPosition = useStudio((s) => s.setOverlayPosition);

  // `placeTop` is computed by the preview stage (which knows the exact
  // text-block and overlay-stack geometry) and passed in as a prop.

  return (
    <div
      className={cn(
        "absolute left-1/2 z-20 -translate-x-1/2",
        placeTop ? "top-2" : "bottom-2"
      )}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      role="toolbar"
      aria-label="Preview style editor"
    >
      <div className="flex items-center gap-0.5 rounded-xl border bg-background/90 p-1 shadow-lg backdrop-blur-md">
        <Tool icon={LetterText} title="Text">
          <Label className="text-[11px] text-muted-foreground">
            Preview text
          </Label>
          <textarea
            value={text}
            onChange={(e) =>
              setText(e.target.value.replace(/\n+$/, ""))
            }
            rows={3}
            spellCheck={false}
            dir="auto"
            className="w-full resize-none rounded-md border bg-transparent px-2 py-1.5 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
            placeholder="Type your text…"
          />
          <p className="text-[10px] leading-snug text-muted-foreground">
            Tip: the text is editable directly on the canvas too — just click
            it.
          </p>
        </Tool>

        <Tool icon={Type} title="Font size · line height · spacing">
          <SlideRow
            label="Font size"
            value={fontSize}
            min={12}
            max={400}
            step={1}
            onChange={setFontSize}
            display={`${fontSize}px`}
          />
          <SlideRow
            label="Line height"
            value={lineHeight}
            min={0.8}
            max={2}
            step={0.05}
            onChange={setLineHeight}
            display={lineHeight.toFixed(2)}
          />
          <SlideRow
            label="Letter spacing"
            value={letterSpacing}
            min={-20}
            max={40}
            step={0.5}
            onChange={setLetterSpacing}
            display={`${letterSpacing}`}
          />
        </Tool>

        <Tool icon={align === "center" ? AlignCenter : AlignLeft} title="Alignment">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">
              Horizontal
            </Label>
            <ToggleGroup
              type="single"
              value={align}
              onValueChange={(v) => v && setAlign(v as AlignMode)}
              className="w-full"
            >
              <ToggleGroupItem value="left" className="flex-1" aria-label="Align left">
                <AlignLeft className="size-3.5" />
              </ToggleGroupItem>
              <ToggleGroupItem value="center" className="flex-1" aria-label="Align center">
                <AlignCenter className="size-3.5" />
              </ToggleGroupItem>
              <ToggleGroupItem value="right" className="flex-1" aria-label="Align right">
                <AlignRight className="size-3.5" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Vertical</Label>
            <ToggleGroup
              type="single"
              value={vAlign}
              onValueChange={(v) => v && setVAlign(v as VAlign)}
              className="w-full"
            >
              <ToggleGroupItem value="top" className="flex-1 gap-1 text-[11px]" aria-label="Align top">
                <ArrowUpToLine className="size-3" />
                Top
              </ToggleGroupItem>
              <ToggleGroupItem value="middle" className="flex-1 gap-1 text-[11px]" aria-label="Align middle">
                <AlignVerticalJustifyCenter className="size-3" />
                Mid
              </ToggleGroupItem>
              <ToggleGroupItem value="bottom" className="flex-1 gap-1 text-[11px]" aria-label="Align bottom">
                <ArrowDownToLine className="size-3" />
                Bot
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Direction</Label>
            <ToggleGroup
              type="single"
              value={textDirection}
              onValueChange={(v) => v && setTextDirection(v as TextDirection)}
              className="w-full"
            >
              <ToggleGroupItem
                value="auto"
                className="flex-1 text-[11px]"
                aria-label="Auto direction"
                title="Pick the direction of the first strong character"
              >
                Auto
              </ToggleGroupItem>
              <ToggleGroupItem
                value="ltr"
                className="flex-1 text-[11px]"
                aria-label="Left to right"
                title="Force left-to-right base direction"
              >
                LTR
              </ToggleGroupItem>
              <ToggleGroupItem
                value="rtl"
                className="flex-1 text-[11px]"
                aria-label="Right to left"
                title="Force right-to-left base direction"
              >
                RTL
              </ToggleGroupItem>
            </ToggleGroup>
            <p className="text-[10px] leading-snug text-muted-foreground">
              Base direction of the text, baked into the export too.
            </p>
          </div>
        </Tool>

        <Tool icon={Palette} title="Colors">
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <ColorRow label="Text" value={textColor} onChange={setTextColor} />
            </div>
            <div className="min-w-0 flex-1">
              <ColorRow label="Background" value={bgColor} onChange={setBgColor} />
            </div>
            <Button
              variant="outline"
              size="icon"
              className="size-7 shrink-0"
              title="Swap colors"
              aria-label="Swap text and background colors"
              onClick={() => {
                setTextColor(bgColor);
                setBgColor(textColor);
              }}
            >
              <ArrowLeftRight className="size-3" />
            </Button>
          </div>
          <p className="text-[10px] leading-snug text-muted-foreground">
            These colors are baked into the exported animation.
          </p>
        </Tool>

        <Tool icon={Maximize2} title="Canvas size" contentClassName="w-72">
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              min={64}
              max={2560}
              step={2}
              value={canvasWidth}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v))
                  setCanvasSize(Math.min(2560, Math.max(64, v)), canvasHeight);
              }}
              className="h-7 flex-1 px-1.5 text-xs"
              aria-label="Canvas width"
            />
            <span className="text-[11px] text-muted-foreground">×</span>
            <Input
              type="number"
              min={64}
              max={2560}
              step={2}
              value={canvasHeight}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v))
                  setCanvasSize(canvasWidth, Math.min(2560, Math.max(64, v)));
              }}
              className="h-7 flex-1 px-1.5 text-xs"
              aria-label="Canvas height"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {CANVAS_PRESETS.map((p) => {
              const active = p.w === canvasWidth && p.h === canvasHeight;
              return (
                <button
                  key={p.label}
                  onClick={() => setCanvasSize(p.w, p.h)}
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
        </Tool>

        <Tool
          icon={SlidersHorizontal}
          title="Axis sliders · thumb · gaps"
          contentClassName="w-72"
          scrollable
        >
          <div className="flex items-center justify-between">
            <Label className="text-[11px] font-medium">
              Show axes as sliders
            </Label>
            <Switch
              checked={overlayEnabled}
              onCheckedChange={setOverlayEnabled}
              className="scale-90"
              aria-label="Show axes as sliders"
            />
          </div>

          {overlayEnabled && (
            <>
              <ShapePicker
                value={overlayThumbShape}
                onChange={setOverlayThumbShape}
              />
              <SlideRow
                label="Thumb size"
                value={overlayThumbScale}
                min={0.5}
                max={2.5}
                step={0.1}
                onChange={setOverlayThumbScale}
                display={`${Math.round(overlayThumbScale * 100)}%`}
              />
              <SlideRow
                label="Gap to text"
                value={overlayTextGap}
                min={0}
                max={3}
                step={0.1}
                onChange={setOverlayTextGap}
                display={`${overlayTextGap.toFixed(1)}em`}
              />

              <div className="flex items-center justify-between">
                <Label className="text-[11px] text-muted-foreground">
                  Position
                </Label>
                <ToggleGroup
                  type="single"
                  value={overlayPosition}
                  onValueChange={(v) => v && setOverlayPosition(v as OverlayPosition)}
                  className="h-7"
                >
                  <ToggleGroupItem value="top" className="gap-1 px-2.5 text-[11px]">
                    <ArrowUpToLine className="size-3" />
                    Above
                  </ToggleGroupItem>
                  <ToggleGroupItem value="bottom" className="gap-1 px-2.5 text-[11px]">
                    <ArrowDownToLine className="size-3" />
                    Below
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>

              <div className="grid grid-cols-2 gap-x-3">
                <SlideRow
                  label="Panel size"
                  value={overlayScale}
                  min={0.6}
                  max={2}
                  step={0.1}
                  onChange={setOverlayScale}
                  display={`${Math.round(overlayScale * 100)}%`}
                />
                <SlideRow
                  label="Name gap"
                  value={overlayNameGap}
                  min={0.2}
                  max={3}
                  step={0.1}
                  onChange={setOverlayNameGap}
                  display={`${overlayNameGap.toFixed(1)}em`}
                />
              </div>

              <SlideRow
                label="CSS line gap"
                value={overlayCssGap}
                min={0.2}
                max={3}
                step={0.1}
                onChange={setOverlayCssGap}
                display={`${overlayCssGap.toFixed(1)}em`}
              />

              <div className="grid grid-cols-3 gap-x-2 gap-y-1 border-t pt-2">
                <CheckRow
                  label="Slider"
                  checked={overlayShowSliders}
                  onChange={setOverlayShowSliders}
                />
                <CheckRow
                  label="Name"
                  checked={overlayShowName}
                  onChange={setOverlayShowName}
                />
                <CheckRow
                  label="Tag"
                  checked={overlayShowTag}
                  onChange={setOverlayShowTag}
                />
                <CheckRow
                  label="Min–max"
                  checked={overlayShowMinMax}
                  onChange={setOverlayShowMinMax}
                />
                <CheckRow
                  label="Value"
                  checked={overlayShowLiveValue}
                  onChange={setOverlayShowLiveValue}
                />
                <CheckRow
                  label="CSS"
                  checked={overlayShowCss}
                  onChange={setOverlayShowCss}
                />
                <CheckRow
                  label="Center"
                  checked={overlayCentered}
                  onChange={setOverlayCentered}
                />
              </div>

              {overlayShowLiveValue && (
                <SlideRow
                  label="Value decimals"
                  value={overlayValueDecimals}
                  min={0}
                  max={3}
                  step={1}
                  onChange={setOverlayValueDecimals}
                  display={String(overlayValueDecimals)}
                />
              )}

              <div className="space-y-1 border-t pt-2">
                <Label className="text-[11px] text-muted-foreground">Font</Label>
                <Select value={overlayFont} onValueChange={setOverlayFont}>
                  <SelectTrigger className="h-7 w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OVERLAY_FONTS.map((f) => (
                      <SelectItem
                        key={f.label}
                        value={f.value}
                        className="text-xs"
                      >
                        <span style={{ fontFamily: f.value }}>{f.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2 border-t pt-2">
                <ColorRow
                  label="Slider color"
                  value={overlayColor}
                  onChange={setOverlayColor}
                />
                <ColorRow
                  label="Panel bg"
                  value={overlayBgColor}
                  onChange={setOverlayBgColor}
                />
              </div>
              <SlideRow
                label="Panel opacity"
                value={overlayBgOpacity}
                min={0}
                max={1}
                step={0.05}
                onChange={setOverlayBgOpacity}
                display={`${Math.round(overlayBgOpacity * 100)}%`}
              />
            </>
          )}
        </Tool>
      </div>
    </div>
  );
}

// ─── Building blocks ───────────────────────────────────────────────────────

function Tool({
  icon: Icon,
  title,
  children,
  contentClassName,
  scrollable,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  children: ReactNode;
  contentClassName?: string;
  scrollable?: boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title={title}
          aria-label={title}
        >
          <Icon className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        collisionPadding={12}
        className={cn("w-64 p-3", contentClassName)}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div
          className={cn(
            "space-y-2.5",
            scrollable &&
              "max-h-[min(440px,68vh)] overflow-y-auto pr-1 [scrollbar-width:thin]"
          )}
        >
          {children}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SlideRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
  display: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-[11px]">{label}</Label>
        <span className="font-mono text-[10px] text-muted-foreground">
          {display}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0] ?? min)}
        aria-label={label}
      />
    </div>
  );
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px]">{label}</Label>
      <div className="flex items-center gap-1.5 rounded border px-1.5 py-0.5">
        <span
          className="size-4 shrink-0 rounded-sm border"
          style={{ background: value }}
        />
        <Input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-5 flex-1 cursor-pointer border-0 bg-transparent p-0"
          aria-label={label}
        />
      </div>
    </div>
  );
}

function ShapePicker({
  value,
  onChange,
}: {
  value: ThumbShape;
  onChange: (s: ThumbShape) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px]">Thumb shape</Label>
      <div className="grid grid-cols-4 gap-1">
        {THUMB_SHAPES.map((s) => (
          <button
            key={s.value}
            type="button"
            title={s.label}
            aria-label={`Thumb shape: ${s.label}`}
            aria-pressed={value === s.value}
            onClick={() => onChange(s.value)}
            className={cn(
              "flex h-8 items-center justify-center rounded-md border transition-colors",
              value === s.value
                ? "border-foreground bg-foreground/10"
                : "border-border hover:bg-muted"
            )}
          >
            <ShapeGlyph shape={s.value} />
          </button>
        ))}
      </div>
    </div>
  );
}

function ShapeGlyph({ shape }: { shape: ThumbShape }) {
  const base = "block size-3 bg-foreground";
  switch (shape) {
    case "square":
      return <span className={base} />;
    case "rounded":
      return <span className={cn(base, "rounded-[4px]")} />;
    case "diamond":
      return <span className={cn(base, "rotate-45 rounded-[2px]")} />;
    default:
      return <span className={cn(base, "rounded-full")} />;
  }
}

function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (b: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-[11px]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-3 accent-foreground"
      />
      {label}
    </label>
  );
}
