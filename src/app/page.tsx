"use client";

import {
  Boxes,
  Info,
  Sparkles,
  Waves,
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
} from "@dnd-kit/sortable";
import { useStudio } from "@/lib/studio-store";
import { APP_VERSION } from "@/lib/version";
import { FontaminLogo } from "@/components/fontamin-logo";
import { PlaybackEngine } from "@/components/studio/playback-engine";
import { DropZone } from "@/components/studio/drop-zone";
import { PreviewStage } from "@/components/studio/preview-stage";
import { AnimationPanel } from "@/components/studio/animation-panel";
import { PlaybackControls } from "@/components/studio/playback-controls";
import { ExportMenu } from "@/components/studio/export-menu";
import { AxisControl, AxisMoveModeControl } from "@/components/studio/axis-control";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function Home() {
  const axes = useStudio((s) => s.axes);
  const fontLoaded = useStudio((s) => s.fontLoaded);
  const reorderAxes = useStudio((s) => s.reorderAxes);

  // Only the grip handle starts a drag (listeners live on the handle), but the
  // distance constraint still keeps tiny touch jitters from becoming drags.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (over && active.id !== over.id) {
      reorderAxes(String(active.id), String(over.id));
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-background to-muted/30 lg:h-screen lg:overflow-hidden">
      <PlaybackEngine />

      {/* Header */}
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-2 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-foreground text-background">
              <Waves className="size-4" />
            </div>
            <div className="leading-tight">
              <h1 className="flex items-center gap-1.5 text-sm font-bold tracking-tight">
                VariRec
                <span className="rounded-full border bg-muted/60 px-1.5 py-px text-[9px] font-medium leading-none text-muted-foreground">
                  v{APP_VERSION}
                </span>
              </h1>
              <p className="hidden text-[11px] text-muted-foreground sm:block">
                Drag &amp; drop a variable font · animate its axes · export GIF /
                MP4 / WebM
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border bg-muted/50 px-2.5 py-0.5 text-[11px] text-muted-foreground md:flex">
              <Sparkles className="size-2.5" />
              100% client-side
            </span>
            <ExportMenu />
          </div>
        </div>
      </header>

      {/* Main — the desktop (lg+) shell gives every column the full remaining
          height: side panels scroll internally and the center column is a
          fixed Stage (preview + transport) without page scrolling. */}
      <main className="mx-auto grid w-full max-w-[1500px] flex-1 grid-cols-1 gap-3 px-4 py-3 sm:px-6 lg:min-h-0 lg:grid-cols-12 lg:grid-rows-[minmax(0,1fr)]">
        {/* Left column — source & animation */}
        <aside className="space-y-3 [scrollbar-width:thin] lg:col-span-3 lg:min-h-0 lg:overflow-y-auto lg:pr-0.5">
          <DropZone />
          <AnimationPanel />
        </aside>

        {/* Center column — the flexible Stage + transport bar. The stage
            always fills the space between header and footer; the canvas
            contain-fits inside it (CSS aspect-ratio), so the layout never
            depends on the canvas ratio. */}
        <section className="flex flex-col gap-2 lg:col-span-6 lg:min-h-0">
          <PreviewStage />
          <PlaybackControls />
        </section>

        {/* Right column — axes */}
        <aside className="space-y-3 [scrollbar-width:thin] lg:col-span-3 lg:min-h-0 lg:overflow-y-auto lg:pr-0.5">
          <Card className="gap-0 py-0">
            <CardHeader className="border-b px-3 py-2.5">
              <CardTitle className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2">
                  <Boxes className="size-3.5 text-muted-foreground" />
                  Variation Axes
                </span>
                <span className="flex items-center gap-1.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="About the axes panel"
                        className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <Info className="size-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-60 text-balance">
                      Drag the grip to reorder the axes — the preview sliders
                      follow the same order. Toggle the switch to include an
                      axis in the animation.
                    </TooltipContent>
                  </Tooltip>
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {axes.length}
                  </span>
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="py-0">
              {fontLoaded ? (
                axes.length > 0 ? (
                  <>
                    <AxisMoveModeControl />
                    <div className="max-h-[calc(100vh-10.5rem)] space-y-2 overflow-y-auto py-2.5 pr-1 [scrollbar-width:thin]">
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                      >
                        <SortableContext
                          items={axes.map((a) => a.tag)}
                          strategy={verticalListSortingStrategy}
                        >
                          {axes.map((axis) => (
                            <AxisControl key={axis.tag} axis={axis} />
                          ))}
                        </SortableContext>
                      </DndContext>
                    </div>
                  </>
                ) : (
                  <div className="space-y-1 py-6 text-center">
                    <p className="text-xs font-medium">No axes found</p>
                    <p className="px-6 text-[11px] text-muted-foreground">
                      This font is not a variable font. Load a .ttf / .otf /
                      .woff / .woff2 with variation axes to animate.
                    </p>
                  </div>
                )
              ) : (
                <div className="space-y-1 py-6 text-center">
                  <p className="text-xs font-medium">Axes will appear here</p>
                  <p className="px-6 text-[11px] text-muted-foreground">
                    Drop a variable font file to discover its controllable axes.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </aside>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t bg-background/80">
        <div className="mx-auto flex max-w-[1500px] flex-col items-center justify-between gap-1.5 px-4 py-2.5 text-[11px] text-muted-foreground sm:flex-row sm:px-6">
          <p>
            VariRec v{APP_VERSION} · MIT License · fonts are parsed and rendered
            entirely in your browser — nothing is uploaded.
          </p>
          <p className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1">
            <Sparkles className="size-2.5" />
            <span>Built with Z.ai · Powered by WebCodecs &amp; gifenc</span>
            <span aria-hidden className="text-border">
              ·
            </span>
            <a
              href="https://github.com/fontamin/VariRec"
              target="_blank"
              rel="noreferrer"
              title="fontamin on GitHub — github.com/fontamin/VariRec"
              className="flex items-center gap-1.5 font-medium text-foreground/75 transition-colors hover:text-foreground"
            >
              <FontaminLogo className="size-3.5" />
              A fontamin product
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
