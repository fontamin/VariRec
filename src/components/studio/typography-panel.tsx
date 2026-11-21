"use client";

import { Type, Square } from "lucide-react";
import { useStudio } from "@/lib/studio-store";
import type { AlignMode } from "@/lib/studio-store-types";
import { FONT_SIZE_MAX } from "@/lib/studio-store-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";
import { CanvasSizeInput } from "./canvas-size-input";
import { ColorField } from "./color-field";

const CANVAS_PRESETS: { label: string; w: number; h: number }[] = [
  { label: "16:9", w: 960, h: 540 },
  { label: "1:1", w: 720, h: 720 },
  { label: "4:3", w: 960, h: 720 },
  { label: "9:16", w: 432, h: 768 },
  { label: "21:9", w: 1050, h: 450 },
];

export function TypographyPanel() {
  const fontLoaded = useStudio((s) => s.fontLoaded);
  const text = useStudio((s) => s.text);
  const fontSize = useStudio((s) => s.fontSize);
  const textColor = useStudio((s) => s.textColor);
  const bgColor = useStudio((s) => s.bgColor);
  const letterSpacing = useStudio((s) => s.letterSpacing);
  const lineHeight = useStudio((s) => s.lineHeight);
  const align = useStudio((s) => s.align);
  const canvasWidth = useStudio((s) => s.canvasWidth);
  const canvasHeight = useStudio((s) => s.canvasHeight);

  const setText = useStudio((s) => s.setText);
  const setFontSize = useStudio((s) => s.setFontSize);
  const setTextColor = useStudio((s) => s.setTextColor);
  const setBgColor = useStudio((s) => s.setBgColor);
  const setLetterSpacing = useStudio((s) => s.setLetterSpacing);
  const setLineHeight = useStudio((s) => s.setLineHeight);
  const setAlign = useStudio((s) => s.setAlign);
  const setCanvasSize = useStudio((s) => s.setCanvasSize);

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b px-3 py-2.5">
        <CardTitle className="flex items-center gap-2 text-xs">
          <Type className="size-3.5 text-muted-foreground" />
          Typography
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-3 py-3">
        <div className="space-y-1">
          <Label htmlFor="vf-text" className="text-[11px]">
            Text
          </Label>
          <Textarea
            id="vf-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={fontLoaded ? "Type your text…" : "Load a font first"}
            rows={2}
            className="resize-none text-sm"
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-[11px]">Font size</Label>
            <span className="font-mono text-[11px] text-muted-foreground">
              {fontSize}px
            </span>
          </div>
          <Slider
            value={[fontSize]}
            min={12}
            max={FONT_SIZE_MAX}
            step={1}
            onValueChange={(v) => setFontSize(v[0] ?? 100)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0 space-y-1">
            <Label className="text-[11px]">Text color</Label>
            <ColorField
              value={textColor}
              onChange={setTextColor}
              label="Text color"
            />
          </div>
          <div className="min-w-0 space-y-1">
            <Label className="text-[11px]">Background</Label>
            <ColorField
              value={bgColor}
              onChange={setBgColor}
              label="Background color"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Letter spacing</Label>
              <span className="font-mono text-[11px] text-muted-foreground">
                {letterSpacing}
              </span>
            </div>
            <Slider
              value={[letterSpacing]}
              min={-20}
              max={40}
              step={0.5}
              onValueChange={(v) => setLetterSpacing(v[0] ?? 0)}
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Line height</Label>
              <span className="font-mono text-[11px] text-muted-foreground">
                {lineHeight.toFixed(2)}
              </span>
            </div>
            <Slider
              value={[lineHeight]}
              min={0.8}
              max={2}
              step={0.05}
              onValueChange={(v) => setLineHeight(v[0] ?? 1.15)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-[11px]">Alignment</Label>
            <ToggleGroup
              type="single"
              value={align}
              onValueChange={(v) => v && setAlign(v as AlignMode)}
              className="w-full"
            >
              <ToggleGroupItem value="left" className="flex-1">
                <AlignLeft className="size-3.5" />
              </ToggleGroupItem>
              <ToggleGroupItem value="center" className="flex-1">
                <AlignCenter className="size-3.5" />
              </ToggleGroupItem>
              <ToggleGroupItem value="right" className="flex-1">
                <AlignRight className="size-3.5" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="space-y-1">
            <Label className="flex items-center gap-1 text-[11px]">
              <Square className="size-3 text-muted-foreground" />
              Canvas
            </Label>
            <div className="flex flex-wrap gap-1">
              {CANVAS_PRESETS.map((p) => {
                const active = p.w === canvasWidth && p.h === canvasHeight;
                return (
                  <button
                    key={p.label}
                    onClick={() => setCanvasSize(p.w, p.h)}
                    className={
                      "rounded border px-1.5 py-0.5 text-[11px] transition-colors " +
                      (active
                        ? "border-foreground bg-foreground text-background"
                        : "border-border hover:bg-muted")
                    }
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            {/* Typed sizes commit only on "Apply size" (or Enter) — see
                CanvasSizeInput. Preset chips above stay one-click instant. */}
            <CanvasSizeInput compact />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
