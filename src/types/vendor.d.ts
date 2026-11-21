// Minimal ambient declarations for the two untyped libraries used by the
// glyph-outline layer (lib/outline.ts). Only the surface we actually use is
// declared — everything else stays behind structural casts.

declare module "fontkit" {
  export interface FontkitGlyph {
    id: number;
    path: {
      commands: { command: string; args?: number[] }[];
      toSVG(): string;
    };
  }
  export interface FontkitGlyphRun {
    glyphs: FontkitGlyph[];
    positions: {
      xAdvance?: number;
      yAdvance?: number;
      xOffset?: number;
      yOffset?: number;
    }[];
    advanceWidth: number;
  }
  export interface FontkitFont {
    unitsPerEm: number;
    ascent: number;
    descent: number;
    getVariation(axes: Record<string, number>): {
      layout(
        s: string,
        features?: unknown,
        script?: unknown,
        language?: unknown,
        direction?: string
      ): FontkitGlyphRun;
    };
  }
  export function create(source: Uint8Array): FontkitFont;
}

declare module "bidi-js" {
  export interface BidiEmbeddingLevels {
    levels: Uint8Array;
    paragraphs: { start: number; end: number; level: number }[];
  }
  const Bidi: new () => {
    getEmbeddingLevels(text: string, baseDir?: string): BidiEmbeddingLevels;
    getReorderSegments(
      text: string,
      lv: BidiEmbeddingLevels,
      start?: number,
      end?: number
    ): [number, number][];
    getReorderedIndices(text: string, lv: BidiEmbeddingLevels): number[];
    getReorderedString(text: string, lv: BidiEmbeddingLevels): string;
  };
  export default Bidi;
}
