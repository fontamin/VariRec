/// <reference types="bun-types" />
// Unit tests for computeOverlayMetrics — the PURE geometry function shared by
// the SVG export renderer and the DOM live preview. Written before the store
// boilerplate refactor as a safety net: the function must behave identically
// before and after the refactor.
//
// Run with: bun test
import { describe, test, expect } from "bun:test";
import {
  computeOverlayMetrics,
  type AxisDisplayInfo,
  type OverlayConfig,
} from "../src/lib/renderer";

const AXES: AxisDisplayInfo[] = [
  { tag: "wght", name: "Weight", value: 400, min: 100, max: 900 },
  { tag: "wdth", name: "Width", value: 100, min: 50, max: 150 },
];

// A representative overlay config with the store's factory defaults.
const cfg = (over: Partial<OverlayConfig> = {}): OverlayConfig => ({
  showSliders: true,
  showName: false,
  showTag: false,
  showMinMax: false,
  showLiveValue: false,
  valueDecimals: 1,
  showCss: false,
  centered: true,
  nameGap: 0.9,
  thumbScale: 1,
  thumbShape: "circle",
  font: "monospace",
  bold: false,
  fontScale: 1,
  trackLenPct: 30,
  color: "#000000",
  bgColor: "#ffffff",
  bgOpacity: 0,
  scale: 1,
  position: "bottom",
  axisGapEm: 1.2,
  offsetX: 0,
  offsetY: 0,
  cssOffsetX: 0,
  cssOffsetY: 0,
  axes: AXES,
  ...over,
});

const W = 960;
const H = 540;

describe("computeOverlayMetrics", () => {
  test("is pure: same input → deep-equal output", () => {
    const a = computeOverlayMetrics(W, H, cfg());
    const b = computeOverlayMetrics(W, H, cfg());
    expect(a).toEqual(b);
  });

  test("panel geometry is positive and inside the canvas", () => {
    const m = computeOverlayMetrics(W, H, cfg());
    expect(m.fontPx).toBeGreaterThanOrEqual(9);
    expect(m.panelW).toBeGreaterThan(0);
    expect(m.panelH).toBeGreaterThan(0);
    expect(m.trackW).toBeGreaterThan(0);
    expect(m.panelX).toBeGreaterThanOrEqual(0);
    expect(m.panelX + m.panelW).toBeLessThanOrEqual(W);
    expect(m.panelY).toBeGreaterThanOrEqual(0);
    expect(m.panelY + m.stackH).toBeLessThanOrEqual(H);
  });

  test("centered panel sits at the canvas centre; otherwise at the left margin", () => {
    const c = computeOverlayMetrics(W, H, cfg());
    expect(Math.abs(c.panelX + c.panelW / 2 - W / 2)).toBeLessThanOrEqual(1);
    const left = computeOverlayMetrics(W, H, cfg({ centered: false }));
    expect(left.panelX).toBe(c.pad);
  });

  test("position bottom anchors the stack to the bottom margin, top to the top margin", () => {
    const bottom = computeOverlayMetrics(W, H, cfg({ showCss: true }));
    expect(bottom.panelY + bottom.stackH).toBeLessThanOrEqual(H);
    expect(
      Math.abs(bottom.panelY + bottom.stackH - (H - bottom.pad))
    ).toBeLessThanOrEqual(2);
    const top = computeOverlayMetrics(W, H, cfg({ showCss: true, position: "top" }));
    expect(top.panelY).toBe(top.pad);
    expect(top.panelY + top.stackH).toBeLessThanOrEqual(H);
  });

  test("the CSS code line shrinks the row-gap ceiling", () => {
    const noCss = computeOverlayMetrics(W, H, cfg());
    const withCss = computeOverlayMetrics(W, H, cfg({ showCss: true }));
    expect(withCss.cssOn).toBe(true);
    expect(withCss.cssBarH).toBeGreaterThan(0);
    expect(withCss.axisGapMaxPx).toBeLessThan(noCss.axisGapMaxPx);
  });

  test("a taller canvas raises the row-gap ceiling", () => {
    const short = computeOverlayMetrics(W, H, cfg());
    const tall = computeOverlayMetrics(W, 1080, cfg());
    expect(tall.axisGapMaxPx).toBeGreaterThan(short.axisGapMaxPx);
  });

  test("row gap is clamped to its ceiling — the panel still fits the canvas", () => {
    const m = computeOverlayMetrics(W, H, cfg({ axisGapEm: 999 }));
    expect(m.axisGap).toBeLessThanOrEqual(m.axisGapMaxPx + 2);
    expect(m.panelH).toBeLessThanOrEqual(H - 2 * m.pad + 2);
  });

  test("sliders off → empty panel; the CSS line stands alone", () => {
    const m = computeOverlayMetrics(W, H, cfg({ showSliders: false, showCss: true }));
    expect(m.panelH).toBe(0);
    expect(m.cssOn).toBe(true);
    expect(m.cssBarH).toBeGreaterThan(0);
    expect(m.stackH).toBe(m.cssBarH);
  });

  test("panel drag offsets move only the panel, clamped to the canvas", () => {
    const base = computeOverlayMetrics(W, H, cfg({ showCss: true }));
    const moved = computeOverlayMetrics(
      W,
      H,
      cfg({ showCss: true, offsetX: 40, offsetY: 25 })
    );
    expect(moved.panelX - base.panelX).toBe(40);
    expect(moved.panelY - base.panelY).toBe(25);
    expect(moved.panelX + moved.panelW).toBeLessThanOrEqual(W);
    expect(moved.panelY + moved.panelH).toBeLessThanOrEqual(H);
    // The CSS line carries its own offsets — dragging the panel never
    // moves it.
    expect(moved.cssBarX).toBe(base.cssBarX);
    expect(moved.cssBarY).toBe(base.cssBarY);
  });

  test("CSS-line drag offsets move only the CSS line, clamped to the canvas", () => {
    const base = computeOverlayMetrics(W, H, cfg({ showCss: true }));
    const moved = computeOverlayMetrics(
      W,
      H,
      cfg({ showCss: true, cssOffsetX: 60, cssOffsetY: -80 })
    );
    expect(moved.cssBarX - base.cssBarX).toBe(60);
    expect(moved.cssBarY - base.cssBarY).toBe(-80);
    expect(moved.cssBarX + moved.cssBarW).toBeLessThanOrEqual(W);
    expect(moved.cssBarY).toBeGreaterThanOrEqual(0);
    expect(moved.cssBarY + moved.cssBarH).toBeLessThanOrEqual(H);
    // The panel stays put.
    expect(moved.panelX).toBe(base.panelX);
    expect(moved.panelY).toBe(base.panelY);
  });

  test("bigger fontScale grows the overlay font", () => {
    const a = computeOverlayMetrics(W, H, cfg());
    const b = computeOverlayMetrics(W, H, cfg({ fontScale: 2 }));
    expect(b.fontPx).toBeGreaterThan(a.fontPx);
  });

  test("shorter track length shrinks the track, never below the floor", () => {
    const wide = computeOverlayMetrics(W, H, cfg({ trackLenPct: 100 }));
    const narrow = computeOverlayMetrics(W, H, cfg({ trackLenPct: 20 }));
    expect(narrow.trackW).toBeLessThan(wide.trackW);
    expect(narrow.trackW).toBeGreaterThanOrEqual(narrow.fontPx * 6);
  });
});
