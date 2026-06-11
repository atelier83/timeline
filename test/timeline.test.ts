import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Timeline } from "../src/core/timeline";

// Controllable clock + rAF queue so playback advances deterministically.
let clock = 0;
let rafs: FrameRequestCallback[] = [];

beforeEach(() => {
  clock = 0;
  rafs = [];
  // Strictly increasing clock: each read nudges time forward by a hair so the
  // synchronous first tick after play() sees dt > 0 (as it would in a browser),
  // while `step()` adds the bulk of the elapsed time.
  vi.spyOn(performance, "now").mockImplementation(() => (clock += 1e-4));
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    rafs.push(cb);
    return rafs.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Advance the clock by `ms` and run the next queued rAF callback. */
function step(ms: number): void {
  clock += ms;
  const cb = rafs.shift();
  cb?.(clock);
}

/** Run queued frames until playback stops or the cap is hit. */
function run(tl: Timeline, ms = 100, max = 200): void {
  let i = 0;
  while (tl.isPlaying && rafs.length && i++ < max) step(ms);
}

describe("tracks", () => {
  it("adds and removes tracks, emitting 'change'", () => {
    const tl = new Timeline();
    const changes = vi.fn();
    tl.on("change", changes);

    const track = tl.add({ x: 0 }, "x", { min: 0, max: 1 });
    expect(tl.tracks).toHaveLength(1);
    expect(track.timeline).toBe(tl);

    tl.remove(track);
    expect(tl.tracks).toHaveLength(0);
    tl.remove(track); // no-op, no extra emit
    expect(changes).toHaveBeenCalledTimes(2);
  });
});

describe("frame math + duration", () => {
  it("converts between frames and seconds at the configured fps", () => {
    const tl = new Timeline({ fps: 30 });
    expect(tl.frameToTime(30)).toBe(1);
    expect(tl.timeToFrame(1)).toBe(30);
    expect(tl.snapTime(0.51)).toBeCloseTo(15 / 30);
  });

  it("auto-fits duration to the furthest content, floored at minFrames", () => {
    const tl = new Timeline({ fps: 30, minFrames: 30 });
    expect(tl.duration).toBe(1); // floor: 30 frames
    const track = tl.add({ x: 0 }, "x", { min: 0, max: 1 });
    track.addKeyframe(60, 1); // 2s of content
    expect(tl.duration).toBe(2);
    expect(tl.totalFrames).toBe(60);
  });

  it("tracks the current frame from the current time", () => {
    const tl = new Timeline({ fps: 30 });
    tl.add({ x: 0 }, "x").addKeyframe(60, 0);
    tl.seek(1);
    expect(tl.currentFrame).toBe(30);
  });
});

describe("seek + apply", () => {
  it("writes track values and emits update + seek", () => {
    const tl = new Timeline({ fps: 30 });
    const target = { x: 0 };
    tl.add(target, "x", { min: 0, max: 10 })
      .addKeyframe(0, 0, "linear")
      .addKeyframe(30, 10, "linear");
    const update = vi.fn();
    const seek = vi.fn();
    tl.on("update", update);
    tl.on("seek", seek);

    tl.seek(0.5); // half a second = frame 15 = halfway
    expect(target.x).toBeCloseTo(5);
    expect(update).toHaveBeenCalled();
    expect(seek).toHaveBeenCalledWith(0.5);
  });

  it("invokes the onUpdate option as an update listener", () => {
    const onUpdate = vi.fn();
    const tl = new Timeline({ onUpdate });
    tl.seek(0);
    expect(onUpdate).toHaveBeenCalled();
  });
});

describe("playback", () => {
  it("plays forward and clamps + pauses at the end", () => {
    const tl = new Timeline({ fps: 30 });
    tl.add({ x: 0 }, "x").addKeyframe(30, 0); // duration 1s
    const onPlay = vi.fn();
    const onPause = vi.fn();
    tl.on("play", onPlay);
    tl.on("pause", onPause);

    tl.play();
    expect(tl.isPlaying).toBe(true);
    expect(onPlay).toHaveBeenCalledWith(1);

    run(tl, 100);
    expect(tl.isPlaying).toBe(false);
    expect(tl.currentTime).toBeCloseTo(1);
    expect(onPause).toHaveBeenCalled();
  });

  it("loops forward at the end instead of stopping", () => {
    const tl = new Timeline({ fps: 30, loop: true });
    tl.add({ x: 0 }, "x").addKeyframe(30, 0); // duration 1s

    tl.play();
    for (let i = 0; i < 15; i++) step(100); // 1.5s of travel
    expect(tl.isPlaying).toBe(true);
    expect(tl.currentTime).toBeLessThan(1);
    tl.pause();
  });

  it("plays backward and clamps + pauses at 0", () => {
    const tl = new Timeline({ fps: 30 });
    tl.add({ x: 0 }, "x").addKeyframe(30, 0); // duration 1s
    tl.seek(1);

    tl.play(-1);
    expect(tl.direction).toBe(-1);
    run(tl, 100);
    expect(tl.isPlaying).toBe(false);
    expect(tl.currentTime).toBe(0);
  });

  it("rewinds to the far end when parked at the boundary", () => {
    const tl = new Timeline({ fps: 30 });
    tl.add({ x: 0 }, "x").addKeyframe(30, 0);
    tl.seek(1); // parked at the end
    tl.play(1); // forward from the end -> rewinds to 0 first
    expect(tl.currentTime).toBeCloseTo(0);
    tl.pause();
  });

  it("keeps playing (and runs sibling listeners) when an update listener throws", () => {
    const tl = new Timeline({ fps: 30 });
    tl.add({ x: 0 }, "x").addKeyframe(60, 0); // duration 2s
    const sibling = vi.fn();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    tl.on("update", () => {
      throw new Error("boom");
    });
    tl.on("update", sibling);

    tl.play();
    step(100); // a throwing listener must not break the rAF loop
    expect(tl.isPlaying).toBe(true);
    expect(tl.currentTime).toBeGreaterThan(0);
    expect(sibling).toHaveBeenCalled(); // isolated from the throwing listener
    expect(errSpy).toHaveBeenCalled();

    tl.pause();
    errSpy.mockRestore();
  });

  it("does not produce NaN when duration is zero (minFrames: 0, no content)", () => {
    const tl = new Timeline({ fps: 30, minFrames: 0, loop: true });
    expect(tl.duration).toBe(0);

    tl.play();
    step(100);
    expect(Number.isNaN(tl.currentTime)).toBe(false);
    expect(tl.currentTime).toBe(0);
    expect(tl.isPlaying).toBe(false); // nothing to animate -> stops cleanly
  });

  it("toggles, and stop rewinds to 0", () => {
    const tl = new Timeline({ fps: 30 });
    tl.add({ x: 0 }, "x").addKeyframe(30, 0);
    tl.toggle();
    expect(tl.isPlaying).toBe(true);
    tl.toggle();
    expect(tl.isPlaying).toBe(false);

    tl.seek(0.5);
    tl.stop();
    expect(tl.currentTime).toBe(0);
  });
});

describe("manual driving (autoUpdate: false)", () => {
  it("does not start a rAF loop on play; advances via update(dt)", () => {
    const tl = new Timeline({ fps: 30, autoUpdate: false });
    const target = { x: 0 };
    tl.add(target, "x", { min: 0, max: 10 })
      .addKeyframe(0, 0, "linear")
      .addKeyframe(30, 10, "linear"); // duration 1s

    tl.play();
    expect(tl.isPlaying).toBe(true);
    expect(rafs).toHaveLength(0); // no internal loop scheduled

    tl.update(0.5); // advance half a second -> halfway
    expect(tl.currentTime).toBeCloseTo(0.5);
    expect(target.x).toBeCloseTo(5);
    expect(rafs).toHaveLength(0); // update() must not schedule rAF either

    tl.update(0.5); // reach the end -> clamps + pauses
    expect(tl.currentTime).toBeCloseTo(1);
    expect(tl.isPlaying).toBe(false);
  });

  it("is a no-op while paused, so a shared loop can call it unconditionally", () => {
    const tl = new Timeline({ fps: 30, autoUpdate: false });
    tl.add({ x: 0 }, "x").addKeyframe(30, 0);
    tl.seek(0.5);
    tl.update(0.5); // not playing -> nothing happens
    expect(tl.currentTime).toBeCloseTo(0.5);
  });

  it("derives dt from its own clock when called with no argument", () => {
    const tl = new Timeline({ fps: 30, autoUpdate: false, loop: true });
    tl.add({ x: 0 }, "x").addKeyframe(30, 0); // duration 1s
    tl.play();
    clock += 250; // 250ms elapse since play() sampled the clock
    tl.update(); // dt derived internally (~0.25s)
    expect(tl.currentTime).toBeGreaterThan(0);
    expect(tl.currentTime).toBeLessThan(1);
    tl.pause();
  });
});

describe("dispose", () => {
  it("pauses and clears tracks and listeners", () => {
    const tl = new Timeline();
    const update = vi.fn();
    tl.on("update", update);
    tl.add({ x: 0 }, "x").addKeyframe(30, 0);

    tl.dispose();
    expect(tl.tracks).toHaveLength(0);

    update.mockClear();
    tl.emit("update", 0);
    expect(update).not.toHaveBeenCalled();
  });
});
