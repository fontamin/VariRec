# Changelog

All notable changes to **VariRec** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] — 2026-11-19

Everything since v1.0.0, through the latest round of refinements. The headline
of this release is **direct manipulation on the canvas** (Figma-style), plus a
set of export and editing fixes discovered while using it.

### Added

- **Direct manipulation on the canvas** — every overlay element (text block,
  slider stack, CSS line and all gaps) lives in a grabbable frame:
  - drag the frame or its edge strips to move the element;
  - scale the font size from the frame's corner handle, change the line height
    from its bottom-center handle, scale the panel from its corner and resize
    the track from its right-edge handle;
  - dedicated gap handles sitting exactly between text↔sliders, panel↔CSS
    line, between slider rows, and between an axis name and its track;
  - double-click any frame to snap the element back to its automatic position.
- **Snap to width center** — a magnet button above the preview toggles
  center-snapping; while dragging, the element's centre magnetises to the
  canvas width centre and a dashed guide line appears.
- **Repeat option** (Animation panel) — tiles the animation cycle into the
  export. Video length = **Duration × Repeat** (doubled again in Loop mode,
  whose video cycle is a seamless ping-pong). GIF loops natively via its loop
  flag, so Repeat applies to GIF only in *Once* mode. The *Once* playback mode
  previews the same number of cycles.
- **Automatic text direction** — the preview and the export pick LTR/RTL from
  the first strong character (same rule as HTML `dir="auto"`): text starting
  with an Arabic, Persian or Hebrew letter is rendered RTL automatically. Can
  be forced to LTR or RTL from the toolbar.

### Changed

- **Font size can now go up to 2000 px** (previously capped at 400 px). The new
  ceiling applies everywhere — the preview toolbar slider, the side panel
  slider and the frame's corner resize handle — through one shared,
  store-enforced clamp.
- **Slider row gap ceiling follows the canvas height** — the vertical gap
  between slider rows (and above/below them) can now grow until the stack
  fills the canvas, instead of a small fixed maximum.
- **Text frame hugs the text** — the bounding box around the text is now sized
  to the text's actual measured footprint rather than a larger fixed region.
- The side typography panel was folded into a floating **preview toolbar**;
  all styling controls stay reachable without leaving the canvas.

### Fixed

- **Leaving text edit mode** — pressing `Esc` or clicking anywhere outside the
  text box (including elsewhere inside the preview) now exits editing; before,
  only a click outside the preview frame did.
- **Space characters are preserved** — runs of spaces and leading/trailing
  spaces render exactly as typed in both the preview and the export (previously
  collapsed or dropped by the text pipeline).
- **GitHub Pages deploy workflow** — the TypeScript build errors that broke the
  `next build` type-check on CI are resolved; the site builds and deploys
  cleanly again.

## [1.0.0] — initial public release

- Drag & drop variable fonts (TTF / OTF / WOFF / WOFF2) parsed entirely in the
  browser (`fvar` / `name` tables, WOFF zlib, WOFF2 brotli).
- Per-axis animation with Sync and Binary motion engines and 8 easing curves.
- Playback modes (Once / Loop / Ping-pong) with duration and FPS control.
- Baked-in, fully customizable axis-slider overlay (thumb shapes, track length,
  labels, live values with fixed decimals, CSS `font-variation-settings`
  snippet, colors, background, scale, position).
- Export to GIF (`gifenc`), MP4 and WebM (WebCodecs via `mp4-muxer` /
  `webm-muxer`) at up to 60 fps, with the GIF's *actual* frame rate reported.
- FOIT-safe SVG frame rendering (settle-poll + ink backstop).
- 100% client-side — nothing is ever uploaded.

[1.1.0]: https://github.com/fontamin/VariRec/releases/tag/v1.1.0
[1.0.0]: https://github.com/fontamin/VariRec/releases/tag/v1.0.0
