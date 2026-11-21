"use client";

/**
 * Shared color control: a circular swatch that shows the current color and
 * opens the native picker when clicked (an invisible <input type="color">
 * stretched over the circle), next to an editable hex field. The hex field
 * accepts 3- or 6-digit codes with or without the leading `#` and commits on
 * Enter or blur — invalid input reverts to the current value.
 *
 * Used by the Typography panel (text + background) and every ColorRow in the
 * preview toolbar (text, background, overlay and glyph-outline colors).
 */

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// Accept `abc`, `#abc`, `aabbcc`, `#AABBCC` → normalized `#aabbcc`; null when
// the input isn't a valid 3/6-digit hex color.
export function normalizeHexColor(raw: string): string | null {
  let s = raw.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(s)) {
    s = s
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return `#${s.toLowerCase()}`;
}

export function ColorSwatch({
  value,
  onChange,
  label,
  className,
}: {
  value: string;
  onChange: (c: string) => void;
  label: string;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "relative block size-6 shrink-0 cursor-pointer rounded-full",
        className
      )}
      title={label}
    >
      <span
        aria-hidden
        className="absolute inset-0 rounded-full border border-black/15 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.25)]"
        style={{ background: value }}
      />
      {/* Invisible native picker covering the circle — clicking the swatch
          opens it, and its value always mirrors the committed color. */}
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`${label} (color picker)`}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        tabIndex={-1}
      />
    </label>
  );
}

export function ColorField({
  value,
  onChange,
  label,
  className,
}: {
  value: string;
  onChange: (c: string) => void;
  label: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);

  // Follow external changes (color picker, swap, presets, hydration) but
  // never clobber the field while the user is typing.
  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => {
    const next = normalizeHexColor(draft);
    if (next && next !== value) {
      onChange(next);
      setDraft(next);
    } else {
      setDraft(value);
    }
  };

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <ColorSwatch value={value} onChange={onChange} label={label} />
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        spellCheck={false}
        aria-label={`${label} hex code`}
        className="h-6 min-w-0 flex-1 rounded-md px-1.5 font-mono text-[10px] uppercase"
      />
    </div>
  );
}

// Toolbar/panel row: label above, swatch + hex field below.
export function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <Label className="block truncate text-[11px]">{label}</Label>
      <ColorField value={value} onChange={onChange} label={label} />
    </div>
  );
}
