/**
 * Interpolation primitives.
 *
 * The easing registry is intentionally pluggable: per-keyframe curves are
 * looked up here by name, so new presets can be registered without touching
 * Track/Timeline evaluation logic.
 */

import type { Easing, EasingName } from "./types";

export const lerp = (a: number, b: number, t: number): number =>
  a + (b - a) * t;

export const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));

/** Normalized easing functions: map t in [0,1] -> eased t in [0,1]. */
export const easings: Record<EasingName, (t: number) => number> = {
  linear: (t) => t,
  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => t * (2 - t),
  easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => (t -= 1) * t * t + 1,
  easeInOutCubic: (t) =>
    t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
};

export interface EasingOption {
  value: Easing;
  label: string;
}

/**
 * Easing options surfaced in a UI. "none" is special: it means *no*
 * interpolation (stepped), handled directly in Track.evaluate rather than as a
 * t-mapping. Everything else is a tween.
 */
export const easingOptions: EasingOption[] = [
  { value: "none", label: "none" },
  ...(Object.keys(easings) as EasingName[]).map(
    (value): EasingOption => ({ value, label: value }),
  ),
];

export const isTween = (easing: Easing): boolean => easing !== "none";

/**
 * Interpolate between two keyframe values across a [0,1] segment progress.
 * `easing` names the curve applied to the *outgoing* keyframe segment.
 */
export function interpolate(
  a: number,
  b: number,
  t: number,
  easing: Easing = "linear",
): number {
  const ease = easings[easing as EasingName] ?? easings.linear;
  return lerp(a, b, ease(clamp(t, 0, 1)));
}
