"use client";

import { useCallback, useRef, useState } from "react";
import { UploadCloud, FileText, Loader2 } from "lucide-react";
import { useStudio } from "@/lib/studio-store";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export function DropZone() {
  const fontLoaded = useStudio((s) => s.fontLoaded);
  const isLoadingFont = useStudio((s) => s.isLoadingFont);
  const familyName = useStudio((s) => s.familyName);
  const axes = useStudio((s) => s.axes);
  const loadFont = useStudio((s) => s.loadFont);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      const name = file.name.toLowerCase();
      const ok =
        name.endsWith(".ttf") ||
        name.endsWith(".otf") ||
        name.endsWith(".woff") ||
        name.endsWith(".woff2") ||
        file.type.startsWith("font/") ||
        file.type === "application/octet-stream";
      if (!ok) {
        toast({
          title: "Unsupported file",
          description: "Please drop a .ttf, .otf, .woff or .woff2 variable font.",
          variant: "destructive",
        });
        return;
      }
      try {
        await loadFont(file);
        const st = useStudio.getState();
        if (st.axes.length === 0) {
          toast({
            title: "Static font loaded",
            description: `${st.familyName} has no variation axes. Load a variable font to animate.`,
          });
        } else {
          toast({
            title: "Variable font loaded",
            description: `${st.familyName} — ${st.axes.length} axis${st.axes.length > 1 ? "es" : ""} detected.`,
          });
        }
      } catch (e) {
        toast({
          title: "Could not load font",
          description: e instanceof Error ? e.message : "Unknown error.",
          variant: "destructive",
        });
      }
    },
    [loadFont]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div
      className="relative"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {/* Kept out of the button so no interactive content nests inside it.
          Its own click is stopped from bubbling: the picker button calls
          input.click() programmatically, and the resulting event must never
          re-enter the button's handler (double-open / flaky pickers on some
          browsers). */}
      <input
        ref={inputRef}
        type="file"
        accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />

      {/* ONE real button covers the whole box, so every click or tap — icon,
          label, edge, corner — opens the file picker. `touch-manipulation`
          removes the double-tap-zoom delay so taps respond instantly, and
          `select-none` stops accidental text selection on fast taps. */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={cn(
          "group flex w-full cursor-pointer select-none touch-manipulation flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-4 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
          dragging
            ? "border-orange-500 bg-orange-50 dark:bg-orange-950/20"
            : "border-border hover:border-orange-400 hover:bg-muted/50"
        )}
      >
        {isLoadingFont ? (
          <>
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Parsing font…</p>
          </>
        ) : fontLoaded ? (
          <div className="flex w-full items-center gap-2.5 text-left">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
              <FileText className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p
                className="line-clamp-1 text-sm font-medium leading-tight"
                title={familyName}
              >
                {familyName}
              </p>
              <p className="text-[11px] leading-tight text-muted-foreground">
                {axes.length} axis{axes.length !== 1 ? "es" : ""} · click to
                replace
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors group-hover:text-orange-500">
              <UploadCloud className="size-5" />
            </div>
            <div className="space-y-0.5">
              <p className="text-xs font-medium">
                Drop a variable font here
              </p>
              <p className="text-[11px] text-muted-foreground">
                .ttf · .otf · .woff · .woff2
              </p>
            </div>
          </>
        )}
      </button>
    </div>
  );
}
