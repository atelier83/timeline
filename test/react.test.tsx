import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Timeline } from "../src/core/timeline";
import { TimelineDock, useTimeline } from "../src/react";

afterEach(cleanup);

describe("useTimeline", () => {
  it("returns a stable timeline and mounts the dock UI by default", () => {
    let captured: Timeline | null = null;
    function Harness() {
      const tl = useTimeline({ fps: 30 });
      captured = tl;
      return null;
    }
    render(<Harness />);
    expect(captured).not.toBeNull();
    expect(document.querySelector(".tl-root")).not.toBeNull();
  });

  it("can skip the UI with ui: false", () => {
    function Harness() {
      useTimeline({ ui: false });
      return null;
    }
    const before = document.querySelectorAll(".tl-root").length;
    render(<Harness />);
    expect(document.querySelectorAll(".tl-root").length).toBe(before);
  });
});

describe("TimelineDock", () => {
  it("calls onReady once with the timeline", () => {
    const onReady = vi.fn();
    function App() {
      return (
        <TimelineDock
          fps={30}
          ui={false}
          onReady={(tl) => {
            onReady(tl);
            tl.add({ x: 0 }, "x", { min: 0, max: 1 }).addKeyframe(30, 1);
          }}
        />
      );
    }
    render(<App />);
    expect(onReady).toHaveBeenCalledTimes(1);
    const tl = onReady.mock.calls[0]![0] as Timeline;
    expect(tl.tracks).toHaveLength(1);
  });
});
