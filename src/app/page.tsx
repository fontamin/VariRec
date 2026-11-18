"use client";

import { Boxes, Github, Sparkles, Waves } from "lucide-react";
import { useStudio } from "@/lib/studio-store";
import { PlaybackEngine } from "@/components/studio/playback-engine";
import { DropZone } from "@/components/studio/drop-zone";
import { PreviewStage } from "@/components/studio/preview-stage";
import { AnimationPanel } from "@/components/studio/animation-panel";
import { PlaybackControls } from "@/components/studio/playback-controls";
import { RecordPanel } from "@/components/studio/record-panel";
import { AxisControl, AxisMoveModeControl } from "@/components/studio/axis-control";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  const axes = useStudio((s) => s.axes);
  const fontLoaded = useStudio((s) => s.fontLoaded);

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-background to-muted/30">
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
                  v1.0
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
            <a
              href="https://github.com/google/fonts/tree/main/ofl"
              target="_blank"
              rel="noreferrer"
              className="flex size-8 items-center justify-center rounded-lg border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Find variable fonts"
              title="Find open-source variable fonts"
            >
              <Github className="size-3.5" />
            </a>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto grid w-full max-w-[1500px] flex-1 grid-cols-1 gap-3 px-4 py-3 sm:px-6 lg:grid-cols-12">
        {/* Left column — source & animation */}
        <aside className="space-y-3 lg:col-span-3">
          <DropZone />
          <AnimationPanel />
        </aside>

        {/* Center column — preview & transport */}
        <section className="space-y-3 lg:col-span-6">
          <PreviewStage />
          <PlaybackControls />
          <RecordPanel />
        </section>

        {/* Right column — axes */}
        <aside className="space-y-3 lg:col-span-3">
          <Card className="gap-0 py-0">
            <CardHeader className="border-b px-3 py-2.5">
              <CardTitle className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2">
                  <Boxes className="size-3.5 text-muted-foreground" />
                  Variation Axes
                </span>
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {axes.length}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="py-0">
              {fontLoaded ? (
                axes.length > 0 ? (
                  <>
                    <AxisMoveModeControl />
                    <div className="max-h-[calc(100vh-10.5rem)] space-y-2 overflow-y-auto py-2.5 pr-1 [scrollbar-width:thin]">
                      {axes.map((axis) => (
                        <AxisControl key={axis.tag} axis={axis} />
                      ))}
                      <p className="px-1 pt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                        Toggle the switch on each axis to include it in the
                        animation. Use the <em>live value</em> slider for axes
                        you want to keep static.
                      </p>
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
            VariRec v1.0 · MIT License · fonts are parsed and rendered entirely
            in your browser — nothing is uploaded.
          </p>
          <p className="flex items-center gap-1.5">
            <Sparkles className="size-2.5" />
            Built with Z.ai · Powered by WebCodecs &amp; gifenc
          </p>
        </div>
      </footer>
    </div>
  );
}
