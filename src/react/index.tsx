import { useEffect, useRef, useState } from "react";

import { Timeline } from "../core/timeline";
import type { TimelineOptions } from "../core/types";
import { TimelineUI, type TimelineUIOptions } from "../ui/timeline-ui";

export interface UseTimelineOptions extends TimelineOptions, TimelineUIOptions {
  /** Mount the bottom-of-screen dope-sheet UI (default true). */
  ui?: boolean;
  /** Element to mount the UI into (defaults to `document.body`). */
  parent?: HTMLElement;
}

/**
 * Create a {@link Timeline} that lives for the lifetime of the component, with
 * an optional dope-sheet UI mounted alongside it. The returned timeline is
 * stable across renders, so it's safe to read in effects and event handlers.
 *
 * Add tracks in an effect keyed on the returned timeline, e.g.:
 *
 * ```tsx
 * const tl = useTimeline({ loop: true });
 * useEffect(() => {
 *   const track = tl.add(state, "x", { min: 0, max: 1 });
 *   track.addKeyframe(0, 0).addKeyframe(30, 1, "easeInOutCubic");
 *   return () => tl.remove(track);
 * }, [tl]);
 * ```
 */
export function useTimeline(options: UseTimelineOptions = {}): Timeline {
  const [timeline] = useState(() => new Timeline(options));
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const o = optionsRef.current;
    let view: TimelineUI | null = null;
    if (o.ui !== false) {
      view = new TimelineUI(timeline, {
        pixelsPerFrame: o.pixelsPerFrame,
        collapsed: o.collapsed,
      });
      view.mount(o.parent);
    }
    return () => {
      view?.dispose();
      // Stop playback without tearing down the user's tracks, so the timeline
      // survives StrictMode's mount/unmount/mount cycle.
      timeline.pause();
    };
  }, [timeline]);

  return timeline;
}

export interface TimelineDockProps extends UseTimelineOptions {
  /** Called once with the timeline so you can add tracks and labels. */
  onReady?: (timeline: Timeline) => void;
}

/**
 * Headless component that creates a timeline and mounts the dope-sheet UI. It
 * renders nothing itself (the UI is a fixed-position dock). Use `onReady` to
 * wire up tracks.
 */
export function TimelineDock({ onReady, ...options }: TimelineDockProps): null {
  const timeline = useTimeline(options);
  const readyRef = useRef(false);

  useEffect(() => {
    if (readyRef.current) return;
    readyRef.current = true;
    onReady?.(timeline);
  }, [timeline, onReady]);

  return null;
}
