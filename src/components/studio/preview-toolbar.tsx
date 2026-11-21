"use client";

/**
 * Floating in-preview editor. Every styling control lives inside the preview
 * itself (Figma-style): font size, line height, letter spacing, alignment,
 * direction, colors, canvas size and the axis-slider overlay appearance.
 *
 * The spatial stuff (positions, sizes, gaps) is handled by DIRECT
 * MANIPULATION on the preview itself (see edit-chrome.tsx) — there is no
 * text-input tool here anymore: click the text on the canvas to edit it.
 *
 * The toolbar is DOM-only chrome — it is never baked into the exported
 * frames, which are rendered by the SVG renderer from the store alone.
 * When the baked overlay sits at the bottom of the canvas the toolbar flips
 * to the top so it never covers it, and vice versa.
 */

import { useMemo, useState, type ComponentType, type ReactNode } from "react";
import {
  Type,
  Palette,
  SlidersHorizontal,
  ArrowLeftRight,
  ArrowUpToLine,
  ArrowDownToLine,
  Layers,
  Spline,
  Code,
  GripVertical,
  ChevronDown,
} from "lucide-react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useStudio } from "@/lib/studio-store";
import { useShallow } from "zustand/react/shallow";
import { computeOverlayMetrics } from "@/lib/renderer";
import { overlayCfgFrom } from "@/lib/studio-metrics";
import type {
  LayerId,
  OverlayPosition,
  ThumbShape,
  TextDirection,
} from "@/lib/studio-store-types";
import {
  THUMB_SHAPES,
  OVERLAY_FONTS,
  FONT_SIZE_MAX,
} from "@/lib/studio-store-types";
import { Button } from "@/components/ui/button";
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
import { deriveCurveColors } from "@/lib/theme-color";
import { ColorRow } from "./color-field";

export function PreviewToolbar({ placeTop }: { placeTop: boolean }) {
  // Grouped store subscriptions (useShallow) instead of ~70 individual
  // useStudio calls. The overlay settings live in ONE object — it only ever
  // changes when setOverlay replaces it, so a plain selector is exact.
  const overlay = useStudio((s) => s.overlay);
  // Glyph-outline layer settings + the text layer visibility (Layers tool).
  const outline = useStudio((s) => s.outline);
  const showTextLayer = useStudio((s) => s.showTextLayer);
  // Axes: only subscribed as a dependency of the row-gap memo below.
  const axes = useStudio((s) => s.axes);
  const {
    fontSize,
    lineHeight,
    letterSpacing,
    textDirection,
    textColor,
    bgColor,
  } = useStudio(
    useShallow((s) => ({
      fontSize: s.fontSize,
      lineHeight: s.lineHeight,
      letterSpacing: s.letterSpacing,
      textDirection: s.textDirection,
      textColor: s.textColor,
      bgColor: s.bgColor,
    }))
  );
  const { canvasWidth, canvasHeight } = useStudio(
    useShallow((s) => ({
      canvasWidth: s.canvasWidth,
      canvasHeight: s.canvasHeight,
    }))
  );
  const {
    setOverlay,
    setOutline,
    setShowTextLayer,
    setFontSize,
    setLineHeight,
    setLetterSpacing,
    setTextDirection,
    setTextColor,
    setBgColor,
  } = useStudio(
    useShallow((s) => ({
      setOverlay: s.setOverlay,
      setOutline: s.setOutline,
      setShowTextLayer: s.setShowTextLayer,
      setFontSize: s.setFontSize,
      setLineHeight: s.setLineHeight,
      setLetterSpacing: s.setLetterSpacing,
      setTextDirection: s.setTextDirection,
      setTextColor: s.setTextColor,
      setBgColor: s.setBgColor,
    }))
  );

  // The glyph-outline curve palette is driven by ONE accent color: the
  // outline stroke and anchor fill take the pick, the borders take its
  // opposite, the control fill gets a shade and the handles a muted tone
  // (see deriveCurveColors). "More…" reveals the per-color pickers for
  // manual fine-tuning. Text and page colors stay independent.
  const [curveAccent, setCurveAccent] = useState(() => outline.strokeColor);
  const [moreCurveColors, setMoreCurveColors] = useState(false);
  const applyCurveTheme = (v: string) => {
    setCurveAccent(v);
    setOutline(deriveCurveColors(v));
  };

  // Overlay metrics mirror the renderer exactly, so the Row gap ceiling
  // follows the canvas height: the gap may grow until the slider stack
  // (plus the CSS line) fills the vertical space between the margins.
  // The ceiling depends only on the canvas size, the axes (count & range)
  // and the overlay geometry knobs — memoized so unrelated re-renders
  // (colors, toggles, popovers opening) don't recompute the metrics.
  const rowGapMaxEm = useMemo(() => {
    const s = useStudio.getState();
    const m = computeOverlayMetrics(canvasWidth, canvasHeight, overlayCfgFrom(s));
    return Math.max(
      0.2,
      Math.round((m.axisGapMaxPx / m.fontPx) * 10) / 10
    );
  }, [canvasWidth, canvasHeight, overlay, axes]);

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
        <Tool
          icon={Type}
          title="Font size · line height · spacing · direction"
        >
          <SlideRow
            label="Font size"
            value={fontSize}
            min={12}
            max={FONT_SIZE_MAX}
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
              Base direction of the text, baked into the export too. Align
              everything by dragging directly in the preview.
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

        <Tool icon={Layers} title="Layers · glyph outline" contentClassName="w-72" scrollable>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1">
            <CheckRow
              label="Text layer"
              checked={showTextLayer}
              onChange={setShowTextLayer}
            />
            <CheckRow
              label="Glyph outline"
              checked={outline.enabled}
              onChange={(v) => setOutline({ enabled: v })}
            />
          </div>
          <p className="text-[10px] leading-snug text-muted-foreground">
            Any combination works. With the text layer off the text stays
            editable — a transparent fill with a visible caret.
          </p>

          {/* Layer stack (z-index): frontmost first, reorder by dragging the
              six-dot grip — the same pattern as the axes panel. Both the
              preview and the export follow this order. */}
          <div className="space-y-1 border-t pt-2">
            <Label className="text-[11px] text-muted-foreground">
              Layer order (z-index)
            </Label>
            <LayerStackList />
            <p className="text-[10px] leading-snug text-muted-foreground">
              Top of the list paints in front of the layers below it — in the
              preview and in the export.
            </p>
          </div>

          {outline.enabled && (
            <>
              <p className="text-[10px] leading-snug text-muted-foreground">
                Display-only wireframe of the glyphs — follows the text, the
                axes and every frame of the animation, and is baked into the
                export. Drag it in the preview to move it independently.
              </p>
              <SlideRow
                label="Scale"
                value={outline.scale}
                min={0.1}
                max={10}
                step={0.05}
                onChange={(v) => setOutline({ scale: v })}
                display={`${outline.scale.toFixed(2)}x`}
              />
              <div className="grid grid-cols-2 gap-x-3">
                <SlideRow
                  label="Stroke width"
                  value={outline.strokeWidth}
                  min={0.5}
                  max={20}
                  step={0.5}
                  onChange={(v) => setOutline({ strokeWidth: v })}
                  display={`${outline.strokeWidth}px`}
                />
                <SlideRow
                  label="Node size"
                  value={outline.nodeSize}
                  min={2}
                  max={24}
                  step={1}
                  onChange={(v) => setOutline({ nodeSize: v })}
                  display={`${outline.nodeSize}px`}
                />
              </div>
              <ShapePicker
                label="Node shape"
                value={outline.nodeShape}
                onChange={(v) => setOutline({ nodeShape: v })}
              />
              {/* One curve accent drives the six curve colors (see
                  deriveCurveColors): outline + anchor fill take the pick,
                  borders take its opposite, the control fill a shade and the
                  handles a muted tone. "More…" opens the per-color pickers. */}
              <div className="flex items-end gap-2 border-t pt-2">
                <div className="min-w-0 flex-1">
                  <ColorRow
                    label="Curve color"
                    value={curveAccent}
                    onChange={applyCurveTheme}
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 gap-1 px-2 text-[11px]"
                  aria-expanded={moreCurveColors}
                  onClick={() => setMoreCurveColors((v) => !v)}
                >
                  <ChevronDown
                    className={cn(
                      "size-3 transition-transform",
                      moreCurveColors && "rotate-180"
                    )}
                  />
                  More…
                </Button>
              </div>
              <p className="text-[10px] leading-snug text-muted-foreground">
                One color drives the whole curve palette — outline, anchors,
                control points and handles derive from this pick.
              </p>

              {moreCurveColors && (
                <div className="space-y-2 border-t pt-2">
                  <div className="grid grid-cols-2 gap-2">
                    <ColorRow
                      label="Outline color"
                      value={outline.strokeColor}
                      onChange={(v) => setOutline({ strokeColor: v })}
                    />
                    <ColorRow
                      label="Handle color"
                      value={outline.handleColor}
                      onChange={(v) => setOutline({ handleColor: v })}
                    />
                    <ColorRow
                      label="Anchor fill"
                      value={outline.anchorFill}
                      onChange={(v) => setOutline({ anchorFill: v })}
                    />
                    <ColorRow
                      label="Anchor border"
                      value={outline.anchorStroke}
                      onChange={(v) => setOutline({ anchorStroke: v })}
                    />
                    <ColorRow
                      label="Control fill"
                      value={outline.ctrlFill}
                      onChange={(v) => setOutline({ ctrlFill: v })}
                    />
                    <ColorRow
                      label="Control border"
                      value={outline.ctrlStroke}
                      onChange={(v) => setOutline({ ctrlStroke: v })}
                    />
                  </div>
                  <p className="text-[10px] leading-snug text-muted-foreground">
                    Manual tweaks stick until the next pick of the curve
                    color, which re-derives them all.
                  </p>
                </div>
              )}
              <SlideRow
                label="Handle width"
                value={outline.handleWidth}
                min={0}
                max={10}
                step={0.5}
                onChange={(v) => setOutline({ handleWidth: v })}
                display={`${outline.handleWidth}px`}
              />
            </>
          )}
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
              checked={overlay.enabled}
              onCheckedChange={(v) => setOverlay({ enabled: v })}
              className="scale-90"
              aria-label="Show axes as sliders"
            />
          </div>

          {overlay.enabled && (
            <>
              <ShapePicker
                value={overlay.thumbShape}
                onChange={(v) => setOverlay({ thumbShape: v })}
              />
              <SlideRow
                label="Thumb size"
                value={overlay.thumbScale}
                min={0.5}
                max={2.5}
                step={0.1}
                onChange={(v) => setOverlay({ thumbScale: v })}
                display={`${Math.round(overlay.thumbScale * 100)}%`}
              />

              <div className="flex items-center justify-between">
                <Label className="text-[11px] text-muted-foreground">
                  Position
                </Label>
                <ToggleGroup
                  type="single"
                  value={overlay.position}
                  onValueChange={(v) =>
                    v && setOverlay({ position: v as OverlayPosition })
                  }
                  className="h-7"
                >
                  <ToggleGroupItem
                    value="top"
                    className="gap-1 px-2.5 text-[11px]"
                    title="Anchor the slider stack to the canvas top edge"
                  >
                    <ArrowUpToLine className="size-3" />
                    Top
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="bottom"
                    className="gap-1 px-2.5 text-[11px]"
                    title="Anchor the slider stack to the canvas bottom edge"
                  >
                    <ArrowDownToLine className="size-3" />
                    Bottom
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>

              <div className="grid grid-cols-2 gap-x-3">
                <SlideRow
                  label="Panel size"
                  value={overlay.scale}
                  min={0.6}
                  max={2}
                  step={0.1}
                  onChange={(v) => setOverlay({ scale: v })}
                  display={`${Math.round(overlay.scale * 100)}%`}
                />
                <SlideRow
                  label="Name gap"
                  value={overlay.nameGap}
                  min={0.2}
                  max={3}
                  step={0.1}
                  onChange={(v) => setOverlay({ nameGap: v })}
                  display={`${overlay.nameGap.toFixed(1)}em`}
                />
                <SlideRow
                  label="Text size"
                  value={overlay.fontScale}
                  min={0.6}
                  max={2.5}
                  step={0.05}
                  onChange={(v) => setOverlay({ fontScale: v })}
                  display={`${Math.round(overlay.fontScale * 100)}%`}
                />
                <SlideRow
                  label="Track length"
                  value={overlay.trackLenPct}
                  min={20}
                  max={100}
                  step={1}
                  onChange={(v) => setOverlay({ trackLenPct: v })}
                  display={`${overlay.trackLenPct}%`}
                />
                <SlideRow
                  label="Row gap"
                  value={overlay.axisGapEm}
                  min={0.2}
                  max={rowGapMaxEm}
                  step={0.1}
                  onChange={(v) => setOverlay({ axisGapEm: v })}
                  display={`${overlay.axisGapEm.toFixed(1)}em`}
                />
              </div>

              <div className="grid grid-cols-3 gap-x-2 gap-y-1 border-t pt-2">
                <CheckRow
                  label="Slider"
                  checked={overlay.showSliders}
                  onChange={(v) => setOverlay({ showSliders: v })}
                />
                <CheckRow
                  label="Name"
                  checked={overlay.showName}
                  onChange={(v) => setOverlay({ showName: v })}
                />
                <CheckRow
                  label="Tag"
                  checked={overlay.showTag}
                  onChange={(v) => setOverlay({ showTag: v })}
                />
                <CheckRow
                  label="Min–max"
                  checked={overlay.showMinMax}
                  onChange={(v) => setOverlay({ showMinMax: v })}
                />
                <CheckRow
                  label="Value"
                  checked={overlay.showLiveValue}
                  onChange={(v) => setOverlay({ showLiveValue: v })}
                />
                <CheckRow
                  label="CSS"
                  checked={overlay.showCss}
                  onChange={(v) => setOverlay({ showCss: v })}
                />
                <CheckRow
                  label="Center"
                  checked={overlay.centered}
                  onChange={(v) => setOverlay({ centered: v })}
                />
                <CheckRow
                  label="Bold"
                  checked={overlay.bold}
                  onChange={(v) => setOverlay({ bold: v })}
                />
              </div>

              {(overlay.showLiveValue || overlay.showCss) && (
                <SlideRow
                  label="Value decimals"
                  value={overlay.valueDecimals}
                  min={0}
                  max={3}
                  step={1}
                  onChange={(v) => setOverlay({ valueDecimals: v })}
                  display={String(overlay.valueDecimals)}
                />
              )}

              <div className="space-y-1 border-t pt-2">
                <Label className="text-[11px] text-muted-foreground">Font</Label>
                <Select
                  value={overlay.font}
                  onValueChange={(v) => v && setOverlay({ font: v })}
                >
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
                  value={overlay.color}
                  onChange={(v) => setOverlay({ color: v })}
                />
                <ColorRow
                  label="Panel bg"
                  value={overlay.bgColor}
                  onChange={(v) => setOverlay({ bgColor: v })}
                />
              </div>
              <SlideRow
                label="Panel opacity"
                value={overlay.bgOpacity}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => setOverlay({ bgOpacity: v })}
                display={`${Math.round(overlay.bgOpacity * 100)}%`}
              />
            </>
          )}
        </Tool>
      </div>
    </div>
  );
}

// ─── Building blocks ───────────────────────────────────────────────────────

// Meta for the four stackable canvas layers (Layers tool list).
const LAYER_META: Record<
  LayerId,
  { label: string; icon: ComponentType<{ className?: string }> }
> = {
  text: { label: "Text", icon: Type },
  outline: { label: "Glyph outline", icon: Spline },
  sliders: { label: "Sliders", icon: SlidersHorizontal },
  css: { label: "CSS code", icon: Code },
};

// The layer-stack list with drag & drop reordering — the same pattern as
// the axes panel: only the six-dot grip starts a drag (4 px activation
// distance), everything else stays clickable. The list runs FRONT first,
// so dragging a row upward brings that layer toward the front.
function LayerStackList() {
  const layerOrder = useStudio((s) => s.layerOrder);
  const reorderLayers = useStudio((s) => s.reorderLayers);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  // Frontmost first: reverse the store's bottom → top array for display.
  const display = [...layerOrder].reverse();
  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (over && active.id !== over.id) {
      reorderLayers(String(active.id) as LayerId, String(over.id) as LayerId);
    }
  };
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={display} strategy={verticalListSortingStrategy}>
        <div className="space-y-1">
          {display.map((id) => (
            <LayerStackRow key={id} id={id} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

// One row of the layer-stack list: six-dot grip, icon and label. Drag the
// grip to restack the layers; the keyboard path (Space to pick up, arrows
// to move, Space to drop) works through the same grip.
function LayerStackRow({ id }: { id: LayerId }) {
  const meta = LAYER_META[id];
  const Icon = meta.icon;
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      className={cn(
        "flex items-center gap-1.5 rounded-md border bg-background px-2 py-1",
        isDragging && "z-10 shadow-md ring-1 ring-foreground/20"
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${meta.label} layer`}
        title="Drag to reorder layers"
        className="-ml-0.5 flex size-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing"
      >
        <GripVertical className="size-3" />
      </button>
      <Icon className="size-3 shrink-0 text-muted-foreground" />
      <span className="flex-1 truncate text-[11px]">{meta.label}</span>
    </div>
  );
}

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

function ShapePicker({
  value,
  onChange,
  label = "Thumb shape",
}: {
  value: ThumbShape;
  onChange: (s: ThumbShape) => void;
  label?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px]">{label}</Label>
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
