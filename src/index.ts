export { Timeline } from "./core/timeline";
export type { AddLabelOptions, LabelPatch } from "./core/timeline";

export { Track } from "./core/track";
export type { KeyframePatch } from "./core/track";

export {
  clamp,
  easingOptions,
  easings,
  interpolate,
  isTween,
  lerp,
} from "./core/interpolation";
export type { EasingOption } from "./core/interpolation";

export type {
  AnimatableTarget,
  Easing,
  EasingName,
  EventListener,
  Keyframe,
  Label,
  TimelineEvent,
  TimelineEventMap,
  TimelineOptions,
  TrackOptions,
} from "./core/types";
