/// <reference types="bun-types" />
// Unit tests for computeAxisValues — the PURE timeline function that turns
// (axes, progress, easing, mode) into the per-frame axis values. Written
// before the store boilerplate refactor as a safety net: the function must
// behave identically before and after the refactor.
//
// Run with: bun test
import { describe, test, expect } from "bun:test";
import { computeAxisValues } from "../src/lib/renderer";
import type { EasingType } from "../src/lib/easing";
import type { AxisMoveMode } from "../src/lib/studio-store-types";

type AxisInput = Parameters<typeof computeAxisValues>[0][number];

const axis = (over: Partial<AxisInput> = {}): AxisInput => ({
  tag: "wght",
  min: 0,
  max: 100,
  current: 40,
  animFrom: 0,
  animTo: 100,
  animate: true,
  ...over,
});

const at = (
  axes: AxisInput[],
  p: number,
  easing: EasingType = "linear",
  mode: AxisMoveMode = "sync"
) => computeAxisValues(axes, p, easing, mode);

describe("computeAxisValues", () => {
  test("no animated axes → static current values, progress is irrelevant", () => {
    const a = axis({ animate: false, current: 40 });
    for (const p of [0, 0.3, 0.5, 0.9, 1]) {
      for (const mode of ["sync", "binary"] as AxisMoveMode[]) {
        expect(at([a], p, "linear", mode)[0].value).toBe(40);
      }
    }
  });

  test("sync mode: linear interpolation endpoints and midpoint", () => {
    const a = axis();
    expect(at([a], 0)[0].value).toBe(0);
    expect(at([a], 0.5)[0].value).toBe(50);
    expect(at([a], 1)[0].value).toBe(100);
  });

  test("sync mode follows the easing curve (easeIn half = quarter)", () => {
    const a = axis();
    // applyEasing(0.5, "easeIn") === 0.25 → 0 + (100 - 0) * 0.25
    expect(at([a], 0.5, "easeIn")[0].value).toBe(25);
  });

  test("sync mode with several animated axes moves them together", () => {
    const a = axis({ tag: "wght" });
    const b = axis({
      tag: "wdth",
      animFrom: 200,
      animTo: 300,
      min: 0,
      max: 400,
    });
    const [va, vb] = at([a, b], 0.5);
    expect(va.value).toBe(50);
    expect(vb.value).toBe(250);
  });

  test("sync mode clamps values to [min, max]", () => {
    const a = axis({ animFrom: -50, animTo: 150, min: 0, max: 100 });
    expect(at([a], 0)[0].value).toBe(0);
    expect(at([a], 1)[0].value).toBe(100);
  });

  test("binary mode, one axis: full out-and-back cycle closes seamlessly", () => {
    const a = axis();
    expect(at([a], 0, "linear", "binary")[0].value).toBe(0);
    expect(at([a], 0.25, "linear", "binary")[0].value).toBe(50);
    expect(at([a], 0.5, "linear", "binary")[0].value).toBe(100);
    expect(at([a], 0.75, "linear", "binary")[0].value).toBe(50);
    expect(at([a], 1, "linear", "binary")[0].value).toBe(0);
  });

  test("binary mode, two axes: topmost animated axis is the least significant bit", () => {
    // States (00 → 01 → 10 → 11): wght is bit 0 (topmost), wdth is bit 1.
    const wght = axis({ tag: "wght", animFrom: 0, animTo: 100 });
    const wdth = axis({
      tag: "wdth",
      animFrom: 10,
      animTo: 110,
      min: 0,
      max: 200,
    });
    const axes = [wght, wdth];
    // p=0    → state 00
    expect(at(axes, 0, "linear", "binary").map((v) => v.value)).toEqual([
      0, 10,
    ]);
    // p=0.25 → total = 1.0 → state 01 (wght flips)
    expect(at(axes, 0.25, "linear", "binary").map((v) => v.value)).toEqual([
      100, 10,
    ]);
    // p=0.5  → total = 2.0 → state 10 (wdth flips)
    expect(at(axes, 0.5, "linear", "binary").map((v) => v.value)).toEqual([
      0, 110,
    ]);
    // p=0.75 → total = 3.0 → state 11 (both flipped)
    expect(at(axes, 0.75, "linear", "binary").map((v) => v.value)).toEqual([
      100, 110,
    ]);
    // p=1    → wraps back to state 00
    expect(at(axes, 1, "linear", "binary").map((v) => v.value)).toEqual([
      0, 10,
    ]);
  });

  test("binary mode clamps each step to [min, max]", () => {
    const a = axis({ animFrom: -50, animTo: 150, min: 0, max: 100 });
    expect(at([a], 0, "linear", "binary")[0].value).toBe(0);
    expect(at([a], 0.5, "linear", "binary")[0].value).toBe(100);
  });

  test("progress outside [0, 1] is clamped", () => {
    const a = axis();
    expect(at([a], -0.5)[0].value).toBe(0);
    expect(at([a], 2)[0].value).toBe(100);
    expect(at([a], -0.5, "linear", "binary")[0].value).toBe(0);
    expect(at([a], 2, "linear", "binary")[0].value).toBe(0); // p=1 → back to from
  });

  test("non-animated axes keep their current value while others animate", () => {
    const animated = axis({ tag: "wght" });
    const frozen = axis({ tag: "wdth", animate: false, current: 55 });
    for (const p of [0, 0.5, 1]) {
      const [va, vb] = at([animated, frozen], p);
      expect(vb.value).toBe(55);
    }
  });

  test("returned tags match the input order", () => {
    const wght = axis({ tag: "wght" });
    const wdth = axis({ tag: "wdth", animate: false });
    expect(at([wght, wdth], 0.3).map((v) => v.tag)).toEqual(["wght", "wdth"]);
  });
});
