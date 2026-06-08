import { clamp, interpolate } from "./interpolation";
import type { Timeline } from "./timeline";
import type { AnimatableTarget, Easing, Keyframe, TrackOptions } from "./types";

let _kfId = 0;
const nextId = (): string => `kf_${++_kfId}`;

/** A patch applied to a keyframe via {@link Track.moveKeyframe}. */
export interface KeyframePatch {
  time?: number;
  value?: number;
  easing?: Easing;
}

/**
 * A Track binds a single numeric property of a target object to a set of
 * keyframes. It is fully headless: given a time, `evaluate` returns the
 * interpolated value and `apply` writes it back into the target.
 *
 * Keyframe shape: { id, time, value, easing }
 *   - `time` is stored internally in seconds; use `addKeyframe(frame, …)` to
 *     author in frames — conversion is handled by the owning timeline.
 *   - `easing` names the curve used on the segment leaving this keyframe.
 */
export class Track {
  target: AnimatableTarget;
  property: string;
  /** Set by {@link Timeline.add}; used to notify the timeline of edits. */
  timeline: Timeline | null = null;

  label: string;
  color: string | null;
  min: number;
  max: number;
  step: number | null;

  keyframes: Keyframe[] = [];

  /**
   * Optional explicit end of the span (a held tail past the last keyframe);
   * null means the span ends at the last keyframe's frame.
   */
  spanEnd: number | null = null;

  constructor(
    target: AnimatableTarget,
    property: string,
    options: TrackOptions = {},
  ) {
    this.target = target;
    this.property = property;

    const raw = target[property];
    const hasValue = Number.isFinite(raw);
    const current = hasValue ? (raw as number) : 0;

    this.label = options.label ?? property;
    this.color = options.color ?? null;
    this.min = options.min ?? (hasValue ? current - 1 : 0);
    this.max = options.max ?? (hasValue ? current + 1 : 1);
    this.step = options.step ?? null;
  }

  get range(): number {
    return this.max - this.min || 1;
  }

  /** Time at which the track's span ends (>= last keyframe time). */
  get endTime(): number {
    const n = this.keyframes.length;
    if (n === 0) return 0;
    const lastT = this.keyframes[n - 1]!.time;
    return Math.max(this.spanEnd ?? 0, lastT);
  }

  /** Extend/shorten the held tail; cannot go before the last keyframe. */
  setSpanEnd(time: number): void {
    const n = this.keyframes.length;
    const lastT = n ? this.keyframes[n - 1]!.time : 0;
    this.spanEnd = Math.max(time, lastT);
    this._notify();
  }

  /** Notify the owning timeline that this track's keyframes changed. */
  private _notify(): void {
    this.timeline?.emit("keyframes", this);
  }

  /** Current live value of the bound property (what the host currently sees). */
  getCurrentValue(): number {
    const v = this.target[this.property];
    return Number.isFinite(v) ? (v as number) : 0;
  }

  hasKeyframes(): boolean {
    return this.keyframes.length > 0;
  }

  sort(): this {
    this.keyframes.sort((a, b) => a.time - b.time);
    return this;
  }

  /**
   * Add a keyframe. `frame` is a frame index, converted to time via the owning
   * timeline (or treated as seconds when the track is standalone).
   */
  addKeyframe(frame: number, value: number, easing: Easing = "none"): this {
    const time = this.timeline ? this.timeline.frameToTime(frame) : frame;
    const kf: Keyframe = {
      id: nextId(),
      time: Math.max(0, time),
      value: clamp(value, this.min, this.max),
      easing,
    };
    this.keyframes.push(kf);
    this.sort();
    this._notify();
    return this;
  }

  getKeyframe(id: string): Keyframe | null {
    return this.keyframes.find((k) => k.id === id) ?? null;
  }

  removeKeyframe(id: string): boolean {
    const i = this.keyframes.findIndex((k) => k.id === id);
    if (i === -1) return false;
    this.keyframes.splice(i, 1);
    this._notify();
    return true;
  }

  /** Move a keyframe in time/value and/or change its easing; keeps sorted. */
  moveKeyframe(id: string, patch: KeyframePatch = {}): Keyframe | null {
    const kf = this.getKeyframe(id);
    if (!kf) return null;
    if (Number.isFinite(patch.time)) kf.time = Math.max(0, patch.time!);
    if (Number.isFinite(patch.value))
      kf.value = clamp(patch.value!, this.min, this.max);
    if (typeof patch.easing === "string") kf.easing = patch.easing;
    this.sort();
    this._notify();
    return kf;
  }

  /**
   * Evaluate the track value at `time`.
   * Returns `undefined` when there are no keyframes so the host's own control
   * keeps ownership of the property.
   */
  evaluate(time: number): number | undefined {
    const kfs = this.keyframes;
    const n = kfs.length;
    if (n === 0) return undefined;
    const first = kfs[0]!;
    const last = kfs[n - 1]!;
    if (time <= first.time) return first.value;
    if (time >= last.time) return last.value;

    // find the segment [a, b] containing `time`
    let a = first;
    let b = last;
    for (let i = 0; i < n - 1; i++) {
      const lo = kfs[i]!;
      const hi = kfs[i + 1]!;
      if (time >= lo.time && time < hi.time) {
        a = lo;
        b = hi;
        break;
      }
    }
    // "none" = stepped, no interpolation: keep a's value until b's time
    if (a.easing === "none") return a.value;
    const span = b.time - a.time || 1;
    const u = (time - a.time) / span;
    return interpolate(a.value, b.value, u, a.easing);
  }

  /** Evaluate at `time` and write into the target. No-op when unkeyed. */
  apply(time: number): number | undefined {
    const v = this.evaluate(time);
    if (v === undefined) return undefined;
    this.target[this.property] = v;
    return v;
  }
}
