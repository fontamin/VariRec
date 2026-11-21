# Changelog

All notable changes to **VariRec** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.3] — 2026-11-21

A layout release: the center column becomes a fixed "flexible Stage", the
export moves to the header, and the fit logic goes fully CSS so nothing can
jump or scroll.

### Changed

- **Flexible Stage** — the center column is now a Stage that always fills
  the space between header and footer; its size no longer depends on the
  canvas aspect ratio. The canvas itself contain-fits inside with pure CSS
  (`aspect-ratio` + `max-width`/`max-height`, sized through container-query
  units): portrait canvases fill the stage height, landscape ones fill the
  width, and every ratio (9:16, 1:1, 16:9, 4:5, …) lands fully visible with
  no overflow and no inner scroll box. The stage backdrop gets a neutral
  dotted finish so the empty space reads as workspace.
- **Export in the header** — the Record & Export card leaves the center
  column. A primary "Export" button in the header opens a dropdown with the
  GIF / MP4 / WebM actions, the recording progress (with cancel) and the
  last-export preview. The GIF fps note (frame delays are stored in 1/100 s
  steps) moved into a tooltip on the GIF entry.
- **Compact transport bar** — Play/Pause, Stop, step and the timeline sit in
  one fixed 44 px row pinned below the stage. It no longer hugs the canvas
  edge and does not move when the canvas ratio changes.
- **Stage zoom control** — the Fit / 100% zoom pill now lives in the stage's
  top-left corner (pinned above the scrollable canvas area, so an explicit
  zoom never scrolls it away).
- **Shorter side panels** — the long helper texts moved into tooltips: the
  Repeat math and the in-preview editing note in the Animation panel, the
  direction note in the Typography tool, and the reorder hint in the
  Variation Axes panel.

### Fixed

- **Fit never jumps** — Fit is resolved entirely in CSS (see Flexible
  Stage), so the JS measure loop that could oscillate the preview size (the
  "jump" seen when maximising the window, amplified by classic desktop
  scrollbars turning the stage into a scroll container) is gone. Explicit
  zooms (0.2×–2×, custom) still overflow and scroll on purpose.

### Removed

- **Header fonts link** — the "Find open-source variable fonts" icon in
  the header is gone; the header keeps only the client-side badge.
- **Record & Export card** — replaced by the header Export dropdown.

## [1.2.2] — 2026-11-21

The headline of this release is a **calmer, app-like studio**: the canvas
size control moves into the preview header, the curve palette collapses to
a single color, and the desktop layout keeps every panel on screen.

### Changed

- **Canvas size in the preview header** — the resolution readout above the
  preview ("960 × 540") is now the size control: clicking it opens the
  width/height entry and the preset chips. The canvas-size tool is gone
  from the floating style toolbar. Three HD presets join the list:
  **1080×1080**, **1080×1920** and **1920×1080** (alongside the existing
  16:9, 1:1, 4:3, 9:16 and 21:9 chips).
- **One-color curve palette** — the glyph-outline tool shows a single
  **Curve color**: the outline stroke and the anchor fill take the pick,
  both borders use its contrast counterpart (same hue, muted, opposite
  lightness), the control fill gets a shade in between and the handle
  lines a muted tone. A **More…** button reveals the six per-color
  pickers (outline, handle, anchor fill/border, control fill/border) for
  manual fine-tuning — manual tweaks stick until the curve color is
  picked again, which re-derives them all. The text and page colors keep
  their separate pickers and swap button, unchanged.
- **App-shell layout (desktop)** — on large screens the page no longer
  scrolls: the header, the preview area, the playback controls, the export
  panel and the footer all fit the viewport, and the side panels scroll
  internally when they need to. **Fit H** now scales the canvas into the
  preview area between the header and the Play panel, so a tall preview
  never pushes the playback/export controls below the fold. Zoomed-in
  views scroll inside the preview area instead of the page. Below the
  desktop breakpoint the page keeps its normal scrolling flow.

## [1.2.1] — 2026-11-21

### Added

- **Preview zoom** — a zoom control between the snap toggle and the canvas
  size indicator scales the preview without touching the export resolution.
  Options: **Fit W** (fit to width — fills the preview column, the default
  view), **Fit H** (fit to height — fills the remaining screen height),
  0.2×, 0.5×, 1×, 2× and a custom ratio (accepts `0.75` or `75`). Explicit
  zooms render the canvas at exactly that multiple of its natural pixel
  size. There is no inner scroll box: zoomed-out views centre the card in
  the available space, zoomed-in views let the card itself grow in the page
  flow. Zoom is preview-only — exports always render at the full canvas
  resolution.
- **fontamin branding** — the footer credits line now ends with an
  "A fontamin product" mark (theme-aware SVG wordmark) linking to the
  project repository at github.com/fontamin/VariRec.

## [1.2.0] — 2026-11-21

The headline of this release is a **full free-placement editor**: every layer
moves freely (even off-canvas), the text frame hugs the actual ink of the
glyphs, and the layer stack itself is now reorderable.

### Added

- **Layer order (z-index)** — the four canvas layers (text, glyph outline,
  sliders, CSS code) can be reordered relative to each other by dragging the
  six-dot grip in the Layers tool (the same drag-to-reorder pattern as the
  axes panel). The live preview and the exported animation both follow the
  stack; the top of the list paints in front. The export previously baked the
  outline underneath the text with a fixed order — the stacking is now
  user-controlled and identical in preview and export.
- **Per-axis preview visibility** — an eye toggle next to each axis's on/off
  switch hides that axis's slider row from the baked overlay (its block dims
  in the axes panel). Hidden axes keep animating and stay in the CSS code
  line.
- **Glyph-outline scale** — the outline layer has a Scale slider (0.1×–10×)
  relative to the main text and can be dragged anywhere independently.
- **Axis drag & drop** — the axes panel rows are reorderable via a drag
  grip; the order drives the preview slider stack and the binary bit
  assignment.
- **Versioned export filenames** — downloads are named
  `variable-font-<timestamp>-VariRec-v<version>.<ext>` (for example
  `variable-font-2026-11-21T10-00-00-VariRec-v1.2.0.gif`), so the exported
  animation always identifies the app and the exact release that produced
  it.

### Changed

- **Ink-true text frame** — the text's bounding frame hugs the glyphs' real
  visual bounds (fontkit-shaped, variation-aware) instead of the
  ascender/descender line box.
- **Free placement** — the text, the glyph-outline layer, the slider panel
  and the CSS code line each move freely and can travel partially or fully
  outside the canvas (clipped in preview and export alike). The slider panel
  and the CSS line are anchored to the canvas edges, not the text block:
  moving, resizing or re-aligning the text never moves the overlay.
- **Ink-exact edit zone** — click-to-edit works exactly on the text's visual
  space (the dashed ink frame, re-measured live while typing, resizing or
  dragging): taps inside the frame start or keep editing, clicks outside it
  leave edit mode, and clearing the text shrinks the zone back to the caret
  frame.
- **Line-height handle only for multi-line text** — the bottom-center handle
  appears once the text has more than one line and stays hidden for a single
  line, where it has nothing to adjust.
- **Color pickers redesigned** — a circular swatch plus an editable hex
  field replace the plain inputs.
- **Cleaner canvas** — the floating grabber pills are gone (grab the frames
  directly), the "Gap to text" setting is removed, the slider↔CSS gap setting
  is removed (a fixed automatic gap remains), the alignment tool is removed
  (text direction moved into the Text tool), and axis min/max
  limits are rounded to at most one decimal.

### Fixed

- Preview/export stacking parity for the glyph-outline layer (see Layer
  order above).
- **The dashed text frame now follows horizontal drags** — its left/right
  edges previously stayed behind when the text was moved sideways (the ink
  measurement only applied the vertical drag offset); the frame now tracks
  the text in both axes.
- **The glyph-outline engine survives a failed load** — the lazily imported
  fontkit/bidi modules retry with a short backoff and re-arm for a later
  attempt instead of caching the failure forever. A transient network hiccup
  (or a restarting dev server) previously left the outline layer — and the
  ink-true text frame — degraded until a full page reload, with an
  unhandled-rejection error surfacing in the UI.

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

[1.2.3]: https://github.com/fontamin/VariRec/releases/tag/v1.2.3
[1.2.2]: https://github.com/fontamin/VariRec/releases/tag/v1.2.2
[1.2.1]: https://github.com/fontamin/VariRec/releases/tag/v1.2.1
[1.2.0]: https://github.com/fontamin/VariRec/releases/tag/v1.2.0
[1.1.0]: https://github.com/fontamin/VariRec/releases/tag/v1.1.0
[1.0.0]: https://github.com/fontamin/VariRec/releases/tag/v1.0.0
