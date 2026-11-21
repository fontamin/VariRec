"use client";

import { useSyncExternalStore, useState } from "react";
import {
  ChevronDown,
  Circle,
  Download,
  Film,
  FileImage,
  FileVideo,
  Info,
  Loader2,
  X,
} from "lucide-react";
import { useStudio } from "@/lib/studio-store";
import {
  isWebCodecsSupported,
  gifTiming,
  downloadBlob,
  type VideoFormat,
} from "@/lib/encoders";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import { APP_VERSION } from "@/lib/version";
import { cn } from "@/lib/utils";

interface FormatOption {
  value: VideoFormat;
  label: string;
  desc: string;
  icon: typeof Film;
  available: boolean;
}

/**
 * Header export control — replaces the old center-column "Record & Export"
 * card. A primary Export button opens a dropdown with the GIF / MP4 / WebM
 * actions, the recording progress and the last export preview, so the stage
 * stays clean. The GIF fps quirk (1/100 s delay steps) lives in a tooltip.
 */
export function ExportMenu() {
  const [open, setOpen] = useState(false);
  const fontLoaded = useStudio((s) => s.fontLoaded);
  const isRecording = useStudio((s) => s.isRecording);
  const recordProgress = useStudio((s) => s.recordProgress);
  const lastExportUrl = useStudio((s) => s.lastExportUrl);
  const lastExportName = useStudio((s) => s.lastExportName);
  const lastExportFormat = useStudio((s) => s.lastExportFormat);
  const loopMode = useStudio((s) => s.loopMode);
  const axisMoveMode = useStudio((s) => s.axisMoveMode);
  const duration = useStudio((s) => s.duration);
  const repeat = useStudio((s) => s.repeat);
  const record = useStudio((s) => s.record);
  const cancelRecording = useStudio((s) => s.cancelRecording);
  const clearExport = useStudio((s) => s.clearExport);
  const axes = useStudio((s) => s.axes);
  const fps = useStudio((s) => s.fps);

  const wcSupported = useSyncExternalStore(
    () => () => {},
    () => isWebCodecsSupported(),
    () => false
  );

  const animatingCount = axes.filter((a) => a.animate).length;
  const hasMotion = animatingCount > 0;
  const pingpong = loopMode === "pingpong";
  const reps = Math.max(1, Math.round(repeat));

  // GIF delays are stored in 1/100 s steps (and nothing below 2cs survives
  // the browser), so the exported GIF can play at a different rate than the
  // requested fps. Always tell the user the real rate on the GIF button.
  const { actualFps: gifActualFps } = gifTiming(fps);
  const gifFpsLabel = parseFloat(gifActualFps.toFixed(1)).toString();
  const gifFpsDiffers = Math.abs(gifActualFps - fps) > 0.05;

  // Video "loop" renders forward + backward so the clip loops seamlessly.
  // With binary movement and more than one animated axis that backward pass
  // would replay the binary count in reverse — GIF (one forward cycle with a
  // native loop flag) is the only seamless option there.
  const binaryMultiLoop =
    loopMode === "loop" && axisMoveMode === "binary" && animatingCount > 1;
  const videoOk = wcSupported && !pingpong && !binaryMultiLoop;

  // Video formats (MP4/WebM) double the duration in loop mode (ping-pong
  // render) and tile the cycle `repeat` times.
  const videoDurationMult = loopMode === "loop" ? 2 : 1;
  const videoDuration = (duration * videoDurationMult * reps).toFixed(1);

  const videoDesc = !wcSupported
    ? "Needs Chrome"
    : pingpong
      ? "Not supported"
      : binaryMultiLoop
        ? "GIF only"
        : `${videoDuration}s`;

  const formats: FormatOption[] = [
    {
      value: "gif",
      label: "GIF",
      desc: [
        pingpong
          ? "Ping-pong loop"
          : loopMode === "loop"
            ? "Loop"
            : "Single",
        loopMode === "once" && reps > 1 ? `${reps}×` : null,
        `${gifFpsLabel} fps`,
      ]
        .filter(Boolean)
        .join(" · "),
      icon: FileImage,
      available: true,
    },
    {
      value: "mp4",
      label: "MP4",
      desc: videoDesc,
      icon: FileVideo,
      available: videoOk,
    },
    {
      value: "webm",
      label: "WebM",
      desc: videoDesc,
      icon: Film,
      available: videoOk,
    },
  ];

  const handleRecord = async (format: VideoFormat) => {
    setOpen(false);
    try {
      await record(format);
      toast({
        title: "Export ready",
        description: "Your animation has been rendered and downloaded.",
      });
    } catch (e) {
      if (e instanceof Error && e.message.includes("cancelled")) {
        toast({ title: "Recording cancelled" });
      } else {
        toast({
          title: "Recording failed",
          description: e instanceof Error ? e.message : "Unknown error",
          variant: "destructive",
        });
      }
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          className="h-8 gap-1.5 pl-2.5 pr-1.5 text-xs"
          aria-expanded={open}
          aria-label="Export animation"
        >
          {isRecording ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              {Math.round(recordProgress * 100)}%
            </>
          ) : (
            <>
              <Download className="size-3.5" />
              Export
            </>
          )}
          <ChevronDown className="size-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" collisionPadding={12} className="w-72 p-0">
        <div className="border-b px-3 py-2 text-xs font-semibold">
          Export animation
        </div>

        <div className="space-y-2.5 px-3 py-2.5">
          {!fontLoaded ? (
            <p className="rounded-md bg-muted/60 px-3 py-4 text-center text-[11px] text-muted-foreground">
              Load a variable font to enable recording.
            </p>
          ) : (
            <>
              <div className="space-y-0.5">
                {formats.map((f) => {
                  const Icon = f.icon;
                  const disabled = isRecording || !f.available;
                  const row = (
                    <button
                      key={f.value}
                      onClick={() => handleRecord(f.value)}
                      disabled={disabled}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors",
                        disabled
                          ? "cursor-not-allowed opacity-50"
                          : "hover:bg-muted/70"
                      )}
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="text-xs font-semibold">{f.label}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {f.desc}
                      </span>
                    </button>
                  );
                  if (f.value !== "gif") return row;
                  // The GIF fps explanation lives in a tooltip (the frame
                  // delay quantum can shift the real playback rate).
                  return (
                    <Tooltip key={f.value}>
                      <TooltipTrigger asChild>{row}</TooltipTrigger>
                      <TooltipContent
                        side="left"
                        className="max-w-56 text-balance"
                      >
                        <span className="flex items-start gap-1.5">
                          <Info className="mt-0.5 size-3 shrink-0 opacity-70" />
                          <span>
                            {gifFpsDiffers
                              ? `GIF frame delays are stored in 1/100 s steps — ${fps} fps exports at ${gifFpsLabel} fps. Clip duration stays exact.`
                              : "GIF frame delays are stored in 1/100 s steps; this frame rate exports 1:1."}
                          </span>
                        </span>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>

              {pingpong && (
                <p className="rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
                  Ping-pong is GIF-only. Switch to Once or Loop for video
                  formats.
                </p>
              )}

              {binaryMultiLoop && (
                <p className="rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
                  Binary Loop with multiple animated axes is GIF-only. Switch
                  to Sync or animate a single axis for MP4/WebM.
                </p>
              )}

              {!hasMotion && !isRecording && (
                <p className="rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
                  No axes animated — the export will be a still frame.
                </p>
              )}

              {isRecording && (
                <div className="space-y-1.5 rounded-lg bg-muted/50 p-2.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1.5 font-medium">
                      <Circle className="size-2 animate-pulse fill-red-600 text-red-600" />
                      Rendering…
                    </span>
                    <span className="font-mono text-muted-foreground">
                      {Math.round(recordProgress * 100)}%
                    </span>
                  </div>
                  <Progress value={recordProgress * 100} className="h-1" />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 w-full text-xs"
                    onClick={cancelRecording}
                  >
                    <X className="size-3" /> Cancel
                  </Button>
                </div>
              )}

              {lastExportUrl && lastExportFormat && (
                <div className="space-y-1.5 rounded-lg border p-1.5">
                  <div className="overflow-hidden rounded-md bg-muted/40">
                    {lastExportFormat === "gif" ? (
                      <img
                        src={lastExportUrl}
                        alt="Exported animation"
                        className="mx-auto max-h-28 w-auto"
                      />
                    ) : (
                      <video
                        src={lastExportUrl}
                        controls
                        autoPlay
                        loop
                        muted
                        className="mx-auto max-h-28 w-auto"
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="flex-1 truncate font-mono text-[11px] text-muted-foreground">
                      {lastExportName}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      onClick={() =>
                        fetch(lastExportUrl)
                          .then((r) => r.blob())
                          .then((b) =>
                            downloadBlob(
                              b,
                              lastExportName ?? `VariRec-v${APP_VERSION}.export`
                            )
                          )
                      }
                    >
                      <Download className="size-3" /> Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={clearExport}
                      aria-label="Dismiss"
                    >
                      <X className="size-3" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
