// Variable font axis parser.
// Reads the OpenType `fvar` table to discover variation axes and the `name`
// table to resolve human-readable labels. Supports raw SFNT (TTF/OTF) as well
// as WOFF (zlib-compressed tables) and WOFF2 (brotli + table transformations).
// All integers are big-endian.

export interface FontAxis {
  tag: string;
  name: string;
  min: number;
  max: number;
  default: number;
}

export type FontFormat = "truetype" | "opentype" | "woff" | "woff2";

export interface ParsedFont {
  familyName: string;
  axes: FontAxis[];
  base64: string; // of the ORIGINAL bytes, used for SVG @font-face embedding
  format: FontFormat;
  cssFormat: string; // CSS @font-face format() string
  mime: string;
  buffer: ArrayBuffer; // original bytes
  sfnt: ArrayBuffer; // decoded SFNT bytes (TTF/OTF). Identical to `buffer`
  // for raw fonts; for WOFF/WOFF2 it is the reconstructed/decompressed font,
  // handed to fontkit for glyph-outline extraction (see lib/outline.ts).
}

const KNOWN_AXIS_NAMES: Record<string, string> = {
  wght: "Weight",
  wdth: "Width",
  slnt: "Slant",
  ital: "Italic",
  opsz: "Optical Size",
  GRAD: "Grade",
  XTRA: "X Tra",
  XOPQ: "X Opque",
  YOPQ: "Y Opque",
  YTLC: "Y Lowercase",
  YTUC: "Y Uppercase",
  YTAS: "Y Ascender",
  YTDE: "Y Descender",
  YTFI: "Y Fig Height",
  WONK: "Wonky",
  INJK: "Inject",
  ASBL: "Ascent",
  WGH2: "Weight 2",
  SCHK: "Stretch",
  RGSP: "Region",
  XTRA2: "X Tra 2",
  RMWN: "Rem Width",
};

function readTag(view: DataView, offset: number): string {
  let s = "";
  for (let i = 0; i < 4; i++) {
    s += String.fromCharCode(view.getUint8(offset + i));
  }
  return s;
}

// 16.16 signed fixed point
function readFixed(view: DataView, offset: number): number {
  return view.getInt32(offset, false) / 65536.0;
}

// Parse a standalone `name` table (the bytes of just the name table) into a
// nameID → string map.
function parseNameTableData(data: Uint8Array): Map<number, string> {
  const names = new Map<number, string>();
  const view = new DataView(
    data.buffer,
    data.byteOffset,
    data.byteLength
  );
  if (view.byteLength < 6) return names;
  const count = view.getUint16(2, false);
  const stringOffset = view.getUint16(4, false);
  for (let i = 0; i < count; i++) {
    const rec = 6 + i * 12;
    if (rec + 12 > view.byteLength) break;
    const platformID = view.getUint16(rec, false);
    const encodingID = view.getUint16(rec + 2, false);
    const languageID = view.getUint16(rec + 4, false);
    const nameID = view.getUint16(rec + 6, false);
    const length = view.getUint16(rec + 8, false);
    const offset = view.getUint16(rec + 10, false);
    const strStart = stringOffset + offset;
    if (strStart + length > view.byteLength) continue;

    let str = "";
    if (platformID === 3 || platformID === 0) {
      let s = "";
      for (let j = 0; j + 1 < length; j += 2) {
        s += String.fromCharCode(view.getUint16(strStart + j, false));
      }
      str = s;
    } else if (platformID === 1 && encodingID === 0) {
      let s = "";
      for (let j = 0; j < length; j++) {
        s += String.fromCharCode(view.getUint8(strStart + j));
      }
      str = s;
    }
    if (!str) continue;
    const existing = names.get(nameID);
    const prefer = platformID === 3 && languageID === 0x0409;
    if (!existing || prefer) names.set(nameID, str);
  }
  return names;
}

// Parse a standalone `fvar` table into axes, resolving names from the given
// nameID → string map.
// fvar stores limits as 16.16 Fixed, so real fonts often carry noisy values
// like 55.749903. The studio only needs one decimal: round at the single
// parse point so the axes panel, the sliders, the overlay labels and the
// export all share the same clean bounds.
function roundAxisLimit(v: number): number {
  return Math.round(v * 10) / 10;
}

function parseFvarTableData(
  data: Uint8Array,
  names: Map<number, string>
): FontAxis[] {
  const axes: FontAxis[] = [];
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (view.byteLength < 12) return axes;
  const axesArrayOffset = view.getUint16(4, false);
  const axisCount = view.getUint16(8, false);
  const axisSize = view.getUint16(10, false) || 20;
  const arrStart = axesArrayOffset;
  for (let i = 0; i < axisCount; i++) {
    const o = arrStart + i * axisSize;
    if (o + 20 > view.byteLength) break;
    const tag = readTag(view, o);
    const minRaw = readFixed(view, o + 4);
    const defRaw = readFixed(view, o + 8);
    const maxRaw = readFixed(view, o + 12);
    const nameID = view.getUint16(o + 18, false);
    const name = names.get(nameID) || KNOWN_AXIS_NAMES[tag] || tag;
    // Rounding may collapse a hair-thin range (e.g. 0.04 → 0–0); in that
    // pathological case keep the raw values instead of breaking the slider.
    let min = roundAxisLimit(minRaw);
    let max = roundAxisLimit(maxRaw);
    let def = roundAxisLimit(defRaw);
    if (minRaw < maxRaw && min === max) {
      min = minRaw;
      max = maxRaw;
    }
    if (max < min) max = min;
    def = Math.min(max, Math.max(min, def));
    axes.push({ tag, name, min, max, default: def });
  }
  return axes;
}

// Parse a raw SFNT (TTF/OTF) buffer: find the `fvar` and `name` tables in the
// table directory and extract family name + axes.
function parseSfnt(buffer: ArrayBuffer): {
  familyName: string;
  axes: FontAxis[];
} {
  const view = new DataView(buffer);
  if (view.byteLength < 12) {
    throw new Error("Buffer too small to be a valid font.");
  }
  const numTables = view.getUint16(4, false);

  let fvarOffset = -1;
  let fvarLength = 0;
  let nameOffset = -1;
  let nameLength = 0;
  const dir = 12;
  for (let i = 0; i < numTables; i++) {
    const rec = dir + i * 16;
    if (rec + 16 > view.byteLength) break;
    const tag = readTag(view, rec);
    const offset = view.getUint32(rec + 8, false);
    const length = view.getUint32(rec + 12, false);
    if (tag === "fvar") {
      fvarOffset = offset;
      fvarLength = length;
    } else if (tag === "name") {
      nameOffset = offset;
      nameLength = length;
    }
  }

  let names = new Map<number, string>();
  if (nameOffset >= 0 && nameOffset + nameLength <= view.byteLength) {
    const nameData = new Uint8Array(buffer, nameOffset, nameLength);
    names = parseNameTableData(nameData);
  }

  let axes: FontAxis[] = [];
  if (fvarOffset >= 0 && fvarOffset + fvarLength <= view.byteLength) {
    const fvarData = new Uint8Array(buffer, fvarOffset, fvarLength);
    axes = parseFvarTableData(fvarData, names);
  }

  const familyName =
    names.get(16) || names.get(1) || names.get(4) || "Variable Font";
  return { familyName, axes };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, Math.min(i + chunk, bytes.length));
    binary += String.fromCharCode.apply(null, slice as unknown as number[]);
  }
  return btoa(binary);
}

function detectFormat(buffer: ArrayBuffer): FontFormat {
  const view = new DataView(buffer);
  if (view.byteLength < 4) return "truetype";
  const sig = readTag(view, 0);
  if (sig === "wOF2") return "woff2";
  if (sig === "wOFF") return "woff";
  if (sig === "OTTO") return "opentype";
  // 0x00010000 = TrueType, 'true' = TrueType, 'ttcf' = collection
  return "truetype";
}

// Decompress zlib data (RFC 1950) using the browser-native DecompressionStream.
// `Uint8Array<ArrayBuffer>` (not the default `Uint8Array<ArrayBufferLike>`) so
// the value is directly assignable to the DOM's `BufferSource` on write().
async function zlibInflate(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate");
  const writer = ds.writable.getWriter();
  writer.write(data);
  writer.close();
  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

// Reconstruct a raw SFNT buffer from a WOFF1 file by extracting + decompressing
// each table. We only need the `fvar` and `name` tables for axis parsing, so we
// could optimise — but reconstructing the full SFNT lets us reuse parseSfnt().
// and keeps the code path uniform.
async function reconstructSfntFromWoff(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const view = new DataView(buffer);
  if (view.byteLength < 44) throw new Error("Invalid WOFF file (header too small).");
  const numTables = view.getUint16(12, false);
  const totalSfntSize = view.getUint32(16, false);

  interface TableEntry {
    tag: string;
    data: Uint8Array;
  }
  const entries: TableEntry[] = [];
  const dirOffset = 44;
  for (let i = 0; i < numTables; i++) {
    const rec = dirOffset + i * 20;
    if (rec + 20 > view.byteLength) break;
    const tag = readTag(view, rec);
    const tblOffset = view.getUint32(rec + 4, false);
    const compLength = view.getUint32(rec + 8, false);
    const origLength = view.getUint32(rec + 12, false);
    if (tblOffset + compLength > view.byteLength) continue;
    const raw = new Uint8Array(buffer, tblOffset, compLength);
    let data: Uint8Array;
    if (compLength < origLength) {
      // zlib-compressed table
      data = await zlibInflate(raw);
    } else {
      data = raw.slice();
    }
    entries.push({ tag, data });
  }

  // Rebuild an SFNT with a proper header + table directory + table data.
  const sfnt = new Uint8Array(totalSfntSize || entries.reduce((s, e) => s + e.data.length + 16, 12));
  const sfntView = new DataView(sfnt.buffer);
  // sfVersion: use the WOFF flavor (0x00010000 for TTF, 'OTTO' for CFF)
  const flavor = view.getUint32(4, false);
  sfntView.setUint32(0, flavor, false);
  sfntView.setUint16(4, numTables, false);
  // searchRange, entrySelector, rangeShift (best-effort, not critical for parsing)
  let searchRange = 1;
  let entrySelector = 0;
  while (searchRange * 2 <= numTables) {
    searchRange *= 2;
    entrySelector++;
  }
  searchRange *= 16;
  const rangeShift = numTables * 16 - searchRange;
  sfntView.setUint16(6, searchRange, false);
  sfntView.setUint16(8, entrySelector, false);
  sfntView.setUint16(10, rangeShift, false);

  let dataOffset = 12 + numTables * 16;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const dirRec = 12 + i * 16;
    // tag
    for (let j = 0; j < 4; j++)
      sfntView.setUint8(dirRec + j, e.tag.charCodeAt(j));
    // checksum (0 — not validated)
    sfntView.setUint32(dirRec + 4, 0, false);
    sfntView.setUint32(dirRec + 8, dataOffset, false);
    sfntView.setUint32(dirRec + 12, e.data.length, false);
    sfnt.set(e.data, dataOffset);
    // pad to 4-byte boundary
    dataOffset += e.data.length;
    while (dataOffset % 4 !== 0) dataOffset++;
  }
  return sfnt.buffer.slice(0, dataOffset);
}

// Decode WOFF2 → raw SFNT (TTF) using the `wawoff2` Emscripten port of Google's
// reference woff2 decoder. The Emscripten module can't be bundled by Turbopack,
// so we ship it as a static asset in /public and load it via a <script> tag at
// runtime. The module exposes `Module.decompress(buffer)` once initialised.
let woff2Promise: Promise<(buf: Uint8Array) => Uint8Array | false> | null = null;

function loadWoff2Decoder(): Promise<
  (buf: Uint8Array) => Uint8Array | false
> {
  if (woff2Promise) return woff2Promise;
  woff2Promise = new Promise((resolve, reject) => {
    const w = window as unknown as {
      Module?: {
        decompress?: (b: Uint8Array) => Uint8Array | false;
        // Emscripten bootstrap hook — fires once the WASM decoder is ready.
        onRuntimeInitialized?: () => void;
      };
    };
    // Pre-seed Module so the Emscripten bootstrapper picks up our callback.
    w.Module = {
      ...(w.Module || {}),
      onRuntimeInitialized: () => {
        const mod = w.Module;
        if (mod && typeof mod.decompress === "function") {
          resolve(mod.decompress);
        } else {
          reject(new Error("wawoff2 module loaded without decompress()"));
        }
      },
    };
    const script = document.createElement("script");
    // Respect the build-time base path (GitHub Pages project sites are served
    // from /<repo>/ — see next.config.ts). Empty locally, "/fontamin" on Pages.
    script.src = `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/wawoff2-decompress.js`;
    script.async = true;
    script.onerror = () =>
      reject(new Error("Failed to load the WOFF2 decoder script."));
    document.head.appendChild(script);
  });
  return woff2Promise;
}

async function decodeWoff2(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const decompress = await loadWoff2Decoder();
  const ttf = decompress(new Uint8Array(buffer));
  if (!ttf) throw new Error("WOFF2 decompression failed (invalid file).");
  const copy = new Uint8Array(ttf.length);
  copy.set(ttf);
  return copy.buffer;
}

export async function parseVariableFont(
  buffer: ArrayBuffer
): Promise<ParsedFont> {
  const format = detectFormat(buffer);

  let parseBuffer: ArrayBuffer;
  let cssFormat: string;
  let mime: string;

  if (format === "woff2") {
    parseBuffer = await decodeWoff2(buffer);
    cssFormat = "woff2";
    mime = "font/woff2";
  } else if (format === "woff") {
    parseBuffer = await reconstructSfntFromWoff(buffer);
    cssFormat = "woff";
    mime = "font/woff";
  } else {
    parseBuffer = buffer;
    cssFormat = format === "opentype" ? "opentype" : "truetype";
    mime = format === "opentype" ? "font/otf" : "font/ttf";
  }

  const { familyName, axes } = parseSfnt(parseBuffer);
  const base64 = arrayBufferToBase64(buffer);

  return {
    familyName,
    axes,
    base64,
    format,
    cssFormat,
    mime,
    buffer,
    sfnt: parseBuffer,
  };
}
