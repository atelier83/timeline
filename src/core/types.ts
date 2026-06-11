import type { Track } from "./track";

/** Names of the built-in tween curves (everything except the stepped "none"). */
export type EasingName =
  | "linear"
  | "easeInQuad"
  | "easeOutQuad"
  | "easeInOutQuad"
  | "easeInCubic"
  | "easeOutCubic"
  | "easeInOutCubic";

/**
 * Easing applied to the segment leaving a keyframe. "none" is special: it means
 * *no* interpolation (stepped) — the value holds until the next keyframe.
 */
export type Easing = EasingName | "none";

/** A target object whose numeric properties a track can drive. */
export type AnimatableTarget = Record<string, number>;

/** A single keyframe on a track. `time` is stored in seconds. */
export interface Keyframe {
  id: string;
  time: number;
  value: number;
  /** Curve applied to the *outgoing* segment (towards the next keyframe). */
  easing: Easing;
}

export interface TrackOptions {
  /** Display label; defaults to the bound property name. */
  label?: string;
  /** Authoring range minimum (values are clamped to it). */
  min?: number;
  /** Authoring range maximum (values are clamped to it). */
  max?: number;
}

export interface TimelineOptions {
  /** Frames per second. The timeline keeps time in seconds; UIs author in frames. */
  fps?: number;
  /** Repeat the whole timeline when playback reaches a boundary. */
  loop?: boolean;
  /** Playback rate multiplier. */
  speed?: number;
  /** Floor on the derived length (in frames) so the timeline is never empty. */
  minFrames?: number;
  /**
   * When true (default) `play()` runs its own requestAnimationFrame loop. Set
   * to false to drive playback from your own loop by calling `update(dt)`.
   */
  autoUpdate?: boolean;
  /** Convenience: registered as an `update` listener. */
  onUpdate?: (time: number) => void;
}

/** Payload type carried by each timeline event. */
export interface TimelineEventMap {
  /** Time changed and tracks were re-evaluated. Payload: current time (s). */
  update: number;
  /** Structure changed (track added/removed). */
  change: void;
  /** A track's keyframes changed. Payload: the track. */
  keyframes: Track;
  /** Playback started. Payload: the direction (+1 / -1). */
  play: number;
  /** Playback paused. */
  pause: void;
  /** Playback stopped and rewound to 0. */
  stop: void;
  /** The playhead was moved. Payload: current time (s). */
  seek: number;
}

export type TimelineEvent = keyof TimelineEventMap;

export type EventListener<K extends TimelineEvent> = (
  payload: TimelineEventMap[K],
) => void;
