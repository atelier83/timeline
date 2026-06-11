import { Timeline } from "../core/timeline";
import type { TimelineOptions } from "../core/types";
import { TimelineUI, type TimelineUIOptions } from "./timeline-ui";

export { TimelineUI } from "./timeline-ui";
export type { TimelineUIOptions } from "./timeline-ui";

export interface CreateTimelineOptions
  extends TimelineOptions, TimelineUIOptions {
  /** Mount the UI immediately (default true). */
  autoMount?: boolean;
  /** Parent element to mount into (defaults to `document.body`). */
  parent?: HTMLElement;
}

/** A {@link Timeline} with its attached {@link TimelineUI}. */
export type TimelineWithUI = Timeline & { ui: TimelineUI };

/**
 * Build a Timeline, attach a bottom-of-screen dope-sheet UI, and (by default)
 * mount it. Returns the Timeline with a `.ui` reference for convenience.
 */
export function createTimeline(
  options: CreateTimelineOptions = {},
): TimelineWithUI {
  const {
    autoMount = true,
    parent,
    pixelsPerFrame,
    collapsed,
    ...timelineOptions
  } = options;
  const timeline = new Timeline(timelineOptions);
  const ui = new TimelineUI(timeline, { pixelsPerFrame, collapsed });
  const withUI = timeline as TimelineWithUI;
  withUI.ui = ui;
  if (autoMount) ui.mount(parent);
  return withUI;
}
