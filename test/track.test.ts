import { describe, expect, it } from "vitest";

import { Track } from "../src/core/track";

describe("Track construction", () => {
  it("defaults label, min, and max from the current property value", () => {
    const target = { x: 5 };
    const track = new Track(target, "x");
    expect(track.label).toBe("x");
    expect(track.min).toBe(4);
    expect(track.max).toBe(6);
  });

  it("falls back to 0..1 when the property has no finite value", () => {
    const track = new Track({} as Record<string, number>, "missing");
    expect(track.min).toBe(0);
    expect(track.max).toBe(1);
  });

  it("honours explicit options", () => {
    const track = new Track({ x: 0 }, "x", {
      label: "X position",
      min: -10,
      max: 10,
      step: 0.5,
      color: "#f00",
    });
    expect(track.label).toBe("X position");
    expect(track.min).toBe(-10);
    expect(track.max).toBe(10);
    expect(track.step).toBe(0.5);
    expect(track.color).toBe("#f00");
  });

  it("computes a non-zero range", () => {
    expect(new Track({ x: 0 }, "x", { min: 0, max: 0 }).range).toBe(1);
    expect(new Track({ x: 0 }, "x", { min: 0, max: 4 }).range).toBe(4);
  });
});

describe("keyframes", () => {
  it("adds keyframes sorted by time and clamps values to range", () => {
    const track = new Track({ x: 0 }, "x", { min: 0, max: 10 });
    track.addKeyframe(2, 5);
    track.addKeyframe(0, 100); // clamped to max
    track.addKeyframe(1, -5); // clamped to min
    expect(track.keyframes.map((k) => k.time)).toEqual([0, 1, 2]);
    expect(track.keyframes[0]!.value).toBe(10);
    expect(track.keyframes[1]!.value).toBe(0);
    expect(track.hasKeyframes()).toBe(true);
  });

  it("reads, moves, and removes keyframes by id", () => {
    const track = new Track({ x: 0 }, "x", { min: 0, max: 10 });
    track.addKeyframe(0, 1);
    const id = track.keyframes[0]!.id;
    expect(track.getKeyframe(id)).not.toBeNull();

    track.moveKeyframe(id, { time: 3, value: 7, easing: "linear" });
    const kf = track.getKeyframe(id)!;
    expect(kf.time).toBe(3);
    expect(kf.value).toBe(7);
    expect(kf.easing).toBe("linear");

    expect(track.removeKeyframe(id)).toBe(true);
    expect(track.removeKeyframe(id)).toBe(false);
    expect(track.hasKeyframes()).toBe(false);
  });

  it("returns null when moving a missing keyframe", () => {
    const track = new Track({ x: 0 }, "x");
    expect(track.moveKeyframe("nope")).toBeNull();
  });
});

describe("endTime + spanEnd", () => {
  it("is the last keyframe time by default", () => {
    const track = new Track({ x: 0 }, "x", { min: 0, max: 10 });
    expect(track.endTime).toBe(0);
    track.addKeyframe(0, 0);
    track.addKeyframe(4, 1);
    expect(track.endTime).toBe(4);
  });

  it("extends with a held tail but never before the last keyframe", () => {
    const track = new Track({ x: 0 }, "x", { min: 0, max: 10 });
    track.addKeyframe(0, 0);
    track.addKeyframe(4, 1);
    track.setSpanEnd(8);
    expect(track.endTime).toBe(8);
    track.setSpanEnd(2); // clamped up to the last keyframe
    expect(track.endTime).toBe(4);
  });
});

describe("evaluate", () => {
  it("returns undefined with no keyframes (host keeps ownership)", () => {
    const track = new Track({ x: 0 }, "x");
    expect(track.evaluate(0)).toBeUndefined();
    expect(track.apply(0)).toBeUndefined();
  });

  it("holds at the endpoints", () => {
    const track = new Track({ x: 0 }, "x", { min: 0, max: 10 });
    track.addKeyframe(1, 2, "linear");
    track.addKeyframe(3, 8, "linear");
    expect(track.evaluate(0)).toBe(2);
    expect(track.evaluate(5)).toBe(8);
  });

  it("tweens within a segment using the outgoing easing", () => {
    const track = new Track({ x: 0 }, "x", { min: 0, max: 10 });
    track.addKeyframe(0, 0, "linear");
    track.addKeyframe(2, 10, "linear");
    expect(track.evaluate(1)).toBeCloseTo(5);
  });

  it("steps (no interpolation) when the outgoing easing is 'none'", () => {
    const track = new Track({ x: 0 }, "x", { min: 0, max: 10 });
    track.addKeyframe(0, 0, "none");
    track.addKeyframe(2, 10, "linear");
    expect(track.evaluate(1.9)).toBe(0);
    expect(track.evaluate(2)).toBe(10);
  });

  it("apply writes the evaluated value into the target", () => {
    const target = { x: 0 };
    const track = new Track(target, "x", { min: 0, max: 10 });
    track.addKeyframe(0, 0, "linear");
    track.addKeyframe(2, 10, "linear");
    track.apply(1);
    expect(target.x).toBeCloseTo(5);
  });
});

describe("getCurrentValue", () => {
  it("reads the live property, or 0 when not finite", () => {
    expect(new Track({ x: 42 }, "x").getCurrentValue()).toBe(42);
    expect(
      new Track({} as Record<string, number>, "x").getCurrentValue(),
    ).toBe(0);
  });
});
