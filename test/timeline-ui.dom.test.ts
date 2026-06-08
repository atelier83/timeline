import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Timeline } from "../src/core/timeline";
import { createTimeline, TimelineUI } from "../src/ui";

let host: HTMLElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  host.remove();
  document.getElementById("tl-timeline-styles")?.remove();
});

describe("TimelineUI", () => {
  it("renders the transport, a sidebar row, and a lane per track", () => {
    const tl = new Timeline({ fps: 30 });
    tl.add({ x: 0 }, "x", { min: 0, max: 1, label: "X" }).addKeyframe(30, 1);
    tl.add({ y: 0 }, "y", { min: 0, max: 1, label: "Y" }).addKeyframe(15, 1);

    const ui = new TimelineUI(tl, { pixelsPerFrame: 10 });
    ui.mount(host);

    expect(host.querySelector(".tl-root")).not.toBeNull();
    expect(host.querySelectorAll(".tl-track-row")).toHaveLength(2);
    expect(host.querySelectorAll(".tl-lane")).toHaveLength(2);
    // each lane draws keyframe dots
    expect(host.querySelectorAll(".tl-kf").length).toBeGreaterThan(0);

    ui.dispose();
    expect(host.querySelector(".tl-root")).toBeNull();
  });

  it("reflects structural and playback changes from the timeline", () => {
    const tl = new Timeline({ fps: 30 });
    tl.add({ x: 0 }, "x").addKeyframe(30, 0);
    const ui = new TimelineUI(tl, {});
    ui.mount(host);

    expect(host.querySelectorAll(".tl-track-row")).toHaveLength(1);
    tl.add({ y: 0 }, "y").addKeyframe(30, 0); // emits "change" -> re-render
    expect(host.querySelectorAll(".tl-track-row")).toHaveLength(2);

    const play = host.querySelector<HTMLButtonElement>(".tl-transport .tl-btn");
    expect(play).not.toBeNull();
    ui.dispose();
  });
});

describe("createTimeline", () => {
  it("builds a timeline with an attached UI and mounts into a parent", () => {
    const tl = createTimeline({ fps: 24, parent: host });
    expect(tl).toBeInstanceOf(Timeline);
    expect(tl.ui).toBeInstanceOf(TimelineUI);
    expect(host.querySelector(".tl-root")).not.toBeNull();
    tl.ui.dispose();
  });

  it("can defer mounting with autoMount: false", () => {
    const tl = createTimeline({ autoMount: false });
    expect(document.querySelector(".tl-root")).toBeNull();
    tl.ui.mount(host);
    expect(host.querySelector(".tl-root")).not.toBeNull();
    tl.ui.dispose();
  });
});
