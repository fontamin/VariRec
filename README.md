# VariRec

**VariRec** is a variable-font animation studio that runs entirely in your
browser. Drop in any variable font, animate its axes, and record the result as
**GIF**, **MP4** or **WebM** — no server, no upload, no install.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
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
- **Playback modes** — Once, Loop and Ping-pong, with duration and FPS control.
- **Baked-in axis-slider overlay** (fully customizable, rendered into the export):
  - thumb shape (circle / square / rounded / diamond), thumb size and
    track length (20–100% of the canvas width);
  - font family, text size, bold, slider color, panel background + opacity;
  - axis name & tag labels, min–max labels, live value with a fixed number of
    decimals (0–3) so centered text never jitters;
  - a live CSS `font-variation-settings` snippet with the current values;
  - position above/below the text, panel scale, and a "gap to text" of up to 12 em.
- **Text styling** — size, line height, letter spacing, horizontal/vertical
  alignment, LTR / RTL / auto direction, text & background colors.
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

No variable font at hand? `public/test-vf.ttf` is a tiny sample font with
`wght` (100–900) and `wdth` (25–200) axes you can play with.

## Usage guide

1. **Load a font** — drag & drop a `.ttf` / `.otf` / `.woff` / `.woff2` file
   onto the drop zone (or click it). Its variation axes appear in the right
   panel.
2. **Type your text** — in the *Text* tool of the preview toolbar, or click the
   text directly on the canvas.
3. **Pick axes** — toggle the switch on each axis to include it in the
   animation; use the live slider of an axis to keep it at a fixed value.
4. **Choose the motion** — pick *Sync* or *Binary* mode, an easing curve, a
   playback mode (Once / Loop / Ping-pong), the duration and the frame rate.
5. **Style the overlay** — open the sliders tool (SlidersHorizontal icon) in
   the preview toolbar to configure thumbs, labels, decimals, the CSS snippet,
   fonts, colors, gaps and track length.
6. **Fine-tune the canvas** — resize the canvas via presets or the custom size
   input (press *Apply size* to confirm).
7. **Export** — open the record panel and render a GIF, MP4 or WebM. Some
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

Released under the [MIT License](LICENSE).

## Acknowledgements

Built with [Z.ai](https://z.ai).
