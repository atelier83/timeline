import { describe, expect, it } from "vitest";

import {
  clamp,
  easingOptions,
  easings,
  interpolate,
  isTween,
  lerp,
} from "../src/core/interpolation";

describe("lerp", () => {
  it("interpolates linearly between a and b", () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(-4, 4, 0.25)).toBe(-2);
  });
});

describe("clamp", () => {
  it("keeps a value within [min, max]", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});

describe("easings", () => {
  it("maps the [0,1] endpoints to themselves", () => {
    for (const ease of Object.values(easings)) {
      expect(ease(0)).toBeCloseTo(0);
      expect(ease(1)).toBeCloseTo(1);
    }
  });

  it("has the expected curvature for the quad/cubic variants", () => {
    expect(easings.easeInQuad(0.5)).toBeCloseTo(0.25);
    expect(easings.easeOutQuad(0.5)).toBeCloseTo(0.75);
    expect(easings.easeInOutQuad(0.5)).toBeCloseTo(0.5);
    expect(easings.easeInCubic(0.5)).toBeCloseTo(0.125);
    expect(easings.easeOutCubic(0.5)).toBeCloseTo(0.875);
    expect(easings.easeInOutCubic(0.25)).toBeCloseTo(4 * 0.25 ** 3);
  });
});

describe("easingOptions", () => {
  it("lists 'none' first, then every named easing", () => {
    expect(easingOptions[0]).toEqual({ value: "none", label: "none" });
    const values = easingOptions.map((o) => o.value);
    expect(values).toContain("linear");
    expect(values).toContain("easeInOutCubic");
    expect(values).toHaveLength(Object.keys(easings).length + 1);
  });
});

describe("isTween", () => {
  it("is false only for 'none'", () => {
    expect(isTween("none")).toBe(false);
    expect(isTween("linear")).toBe(true);
    expect(isTween("easeInOutCubic")).toBe(true);
  });
});

describe("interpolate", () => {
  it("defaults to a linear curve", () => {
    expect(interpolate(0, 100, 0.5)).toBe(50);
  });

  it("applies the named easing", () => {
    expect(interpolate(0, 100, 0.5, "easeInQuad")).toBeCloseTo(25);
  });

  it("clamps progress to [0,1]", () => {
    expect(interpolate(0, 100, -1)).toBe(0);
    expect(interpolate(0, 100, 2)).toBe(100);
  });

  it("falls back to linear for an unknown/stepped easing name", () => {
    expect(interpolate(0, 100, 0.5, "none")).toBe(50);
  });
});
