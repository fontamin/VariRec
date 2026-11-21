# VariRec

**VariRec** is a variable-font animation studio that runs entirely in your
browser. Drop in any variable font, animate its axes, and record the result as
**GIF**, **MP4** or **WebM** — no server, no upload, no install.

![Version](https://img.shields.io/badge/version-1.2.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Built with Z.ai](https://img.shields.io/badge/built_with-Z.ai-blueviolet)

Persian guide: [README.fa.md](README.fa.md)

---

## Why VariRec?

Most variable-font tools show a static preview. VariRec is built for *recording*:
it turns every axis of your font into an animatable channel and exports a
ready-to-publish animation. Everything — font parsing, rendering, encoding —
happens locally in your browser, so your fonts never leave your device.

## Features

- **Drag & drop variable fonts** — TTF, OTF, WOFF and WOFF2 are parsed right in
  the browser (`fvar` / `name` tables), including registered and custom axes.
- **Two motion engines**
  - *Sync* — all animated axes move together on one shared timeline.
  - *Binary* — axes count through a binary sequence (00 → 01 → 10 → 11 …).
- **8 easing curves** — Linear, Ease In-Out, Ease In, Ease Out, Sine,
  Exponential, Bounce, Elastic.
- **Playback modes** — Once, Loop and Ping-pong, with duration, FPS and a
  **Repeat** count that tiles the cycle into the export (video length =
  Duration × Repeat).
- **Baked-in axis-slider overlay** (fully customizable, rendered into the export):
  - thumb shape (circle / square / rounded / diamond), thumb size and
    track length (20–100% of the canvas width);
  - font family, text size, bold, slider color, panel background + opacity;
  - axis name & tag labels, min–max labels, live value with a fixed number of
    decimals (0–3) so centered text never jitters;
  - a live CSS `font-variation-settings` snippet with the current values;
  - position above/below the text, panel scale, and a "gap to text" of up to 12 em.
- **Direct manipulation on the canvas** — every overlay element lives in a
  frame you can grab: drag the text block or the slider stack to reposition
  them, scale the font size from the frame's corner handle, tune the line
  height from its bottom handle, resize the panel and track from its handles,
  and drag the dedicated gap handles sitting exactly between the text and the
  sliders, between slider rows, between a row's name and its track, and
  between the sliders and the CSS line. Double-click a frame to snap it back
  to its automatic position. A magnet button above the preview toggles **snap
  to width centre**, so a dragged frame's centre clings to the canvas's
  horizontal midline.
- **WYSIWYG text fidelity** — runs of spaces and leading/trailing spaces are
  preserved exactly as typed in both the preview and the export, and the
  preview never wraps lines the export wouldn't.
- **Text styling** — size (12–2000 px), line height, letter spacing,
  horizontal/vertical alignment, text & background colors, and a base direction
  of LTR / RTL / auto — *auto* picks RTL the moment your text starts with an
  Arabic, Persian or Hebrew letter, in both the preview and the export.
- **Canvas control** — presets (16:9, 1:1, 4:3, 9:16, 21:9) or any custom size
  between 64 and 2560 px, applied through a confirm button so the layout never
  jumps while you type.
- **Export** — GIF (`gifenc`), MP4 and WebM (`WebCodecs` via `mp4-muxer` /
  `webm-muxer`) at up to 60 fps. The GIF button always shows the *actual*
  frame rate, because GIF frame delays are quantized to 1/100 s.
- **FOIT-safe rendering** — every frame is a freshly built SVG (with the font
  embedded as a data URI) painted to canvas, using a settle-poll and an
  ink backstop so glyphs never flash invisible.

## Getting started

```bash
# with Bun
bun install
bun run dev

# or with npm
npm install
npm run dev
```

Then open <http://localhost:3000>.

No variable font at hand? `public/test-vf.woff2` is a bundled copy of the
Vazirmatn variable font with a `wght` axis (100–900) — it covers both Latin
and Persian, so it doubles as a demo for RTL text and the glyph-outline
layer. Drag it onto the drop zone to try it.

## Usage guide

1. **Load a font** — drag & drop a `.ttf` / `.otf` / `.woff` / `.woff2` file
   onto the drop zone (or click it). Its variation axes appear in the right
   panel.
2. **Type your text** — click the text directly on the canvas and just type;
   the direction switches to RTL automatically when you write Persian or
   Arabic.
3. **Arrange by hand** — drag the frames on the canvas to move the text and
   the sliders; use the handles to change font size, line height, panel size,
   track length and every gap. Double-click a frame to reset it.
4. **Pick axes** — toggle the switch on each axis to include it in the
   animation; use the live slider of an axis to keep it at a fixed value.
5. **Choose the motion** — pick *Sync* or *Binary* mode, an easing curve, a
   playback mode (Once / Loop / Ping-pong), the duration and the frame rate.
6. **Style the overlay** — open the sliders tool (SlidersHorizontal icon) in
   the preview toolbar to configure thumbs, labels, decimals, the CSS snippet,
   fonts, colors, gaps and track length — or just drag the handles on the
   canvas.
7. **Fine-tune the canvas** — resize the canvas via presets or the custom size
   input (press *Apply size* to confirm).
8. **Export** — open the record panel and render a GIF, MP4 or WebM. Some
   combinations are intentionally GIF-only (ping-pong and multi-axis Binary
   loops) — the UI tells you why and offers the switch.

## Deploying to GitHub Pages

VariRec ships with a ready-made workflow:
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). It builds the
project with `next build` (`output: "export"`), which produces a fully static
site in **`out/`** — the folder that contains the main **`index.html`** — and
deploys exactly that folder to GitHub Pages.

To go live at **https://fontamin.github.io/VariRec/**:

1. Push this repository to the **`fontamin`** account on GitHub under the name
   **`VariRec`** (`github.com/fontamin/VariRec`).
2. Push to `main` — or run the workflow manually from the **Actions** tab
   (**Run workflow**). The first run enables GitHub Pages automatically.

The workflow will:

1. check out the code and set up Bun,
2. enable GitHub Pages (if not enabled yet) and resolve the base path
   (`/VariRec`) from the Pages configuration,
3. run `bun install` and `bun run build` — the static site lands in `out/`,
4. upload the `out/` artifact (the folder holding `index.html`) and publish it.

Your site will be available at:

```
https://fontamin.github.io/VariRec/
```

The base path is picked up automatically from the repository name, so the same
code builds without a prefix locally and with `/VariRec` on GitHub Pages — no
manual configuration needed. If the repository is ever renamed, the deployed
URL follows automatically.

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router, static export) + TypeScript
- Tailwind CSS 4 + shadcn/ui + zustand
- Hand-written OpenType parser (`fvar`, `name`, WOFF zlib, WOFF2 brotli via
  `wawoff2`)
- `gifenc` for GIF encoding, `mp4-muxer` / `webm-muxer` over WebCodecs for
  MP4/WebM

## Privacy

VariRec is 100% client-side. Fonts are parsed, rendered and encoded locally —
nothing is ever uploaded to a server.

## License

Released under the [MIT License](LICENSE). Release history lives in
[CHANGELOG.md](CHANGELOG.md).

## Acknowledgements

Built with [Z.ai](https://z.ai).
