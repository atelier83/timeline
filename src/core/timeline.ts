import { Track } from "./track";
import type {
  AnimatableTarget,
  EventListener,
  Label,
  TimelineEvent,
  TimelineEventMap,
  TimelineOptions,
  TrackOptions,
} from "./types";

let _labelId = 0;
const nextLabelId = (): string => `lb_${++_labelId}`;

/** Patch applied to a label via {@link Timeline.updateLabel}. */
export interface LabelPatch {
  time?: number;
  name?: string;
  hold?: boolean;
  script?: string;
}

/** Options accepted by {@link Timeline.addLabel}. */
export interface AddLabelOptions {
  time?: number;
  name?: string;
  hold?: boolean;
  script?: string;
}

type AnyListener = (payload: never) => void;

/**
 * Headless timeline engine.
 *
 * Owns the tracks, the playhead time, playback, and named labels. A label is a
 * marker at a frame; one flagged `hold` acts as a stop point: playback pauses
 * on reaching it until the user advances again — the bridge between predefined
 * and interactive animation. `loop` repeats the whole timeline.
 *
 * It is self-driving: while playing it runs its own rAF loop so the library
 * works standalone in any page. On every time change it re-evaluates all
 * tracks, writes the values into their targets, and emits `update`.
 *
 * Events: "update" (time), "change" (structure), "keyframes" (track), "labels",
 *         "play" (direction), "pause", "stop", "seek" (time), "hold" (label).
 */
export class Timeline {
  fps: number;
  loop: boolean;
  speed: number;
  /** The length auto-fits to the furthest content, never below `minFrames`. */
  minFrames: number;

  tracks: Track[] = [];
  labels: Label[] = [];

  currentTime = 0;
  isPlaying = false;
  /** +1 forward, -1 backward. */
  direction: 1 | -1 = 1;

  private _raf: number | null = null;
  private _lastT = 0;
  private _listeners = new Map<TimelineEvent, Set<AnyListener>>();

  constructor(options: TimelineOptions = {}) {
    this.fps = options.fps ?? 30;
    this.loop = options.loop ?? false;
    this.speed = options.speed ?? 1;
    this.minFrames = options.minFrames ?? 1;

    if (typeof options.onUpdate === "function") {
      this.on("update", options.onUpdate);
    }
  }

  // --- events -------------------------------------------------------------

  on<K extends TimelineEvent>(event: K, fn: EventListener<K>): () => void {
    let set = this._listeners.get(event);
    if (!set) this._listeners.set(event, (set = new Set()));
    set.add(fn as AnyListener);
    return () => this.off(event, fn);
  }

  off<K extends TimelineEvent>(event: K, fn: EventListener<K>): void {
    this._listeners.get(event)?.delete(fn as AnyListener);
  }

  emit<K extends TimelineEvent>(event: K, payload?: TimelineEventMap[K]): void {
    this._listeners
      .get(event)
      ?.forEach((fn) => (fn as EventListener<K>)(payload as TimelineEventMap[K]));
  }

  // --- tracks -------------------------------------------------------------

  /** dat.gui-style binding: add(target, "prop", { min, max }). */
  add(
    target: AnimatableTarget,
    property: string,
    options: TrackOptions = {},
  ): Track {
    const track = new Track(target, property, options);
    track.timeline = this;
    this.tracks.push(track);
    this.emit("change");
    return track;
  }

  remove(track: Track): void {
    const i = this.tracks.indexOf(track);
    if (i !== -1) {
      this.tracks.splice(i, 1);
      this.emit("change");
    }
  }

  // --- frames -------------------------------------------------------------

  /**
   * Length of the timeline in seconds, derived from content: the furthest
   * track span end and the latest label. Auto-grows/shrinks as keyframes are
   * edited; floored at `minFrames` so it's never empty.
   */
  get duration(): number {
    let end = 0;
    for (const t of this.tracks) end = Math.max(end, t.endTime);
    for (const l of this.labels) end = Math.max(end, l.time);
    return Math.max(end, this.frameToTime(this.minFrames));
  }

  get totalFrames(): number {
    return Math.round(this.duration * this.fps);
  }
  get currentFrame(): number {
    return Math.round(this.currentTime * this.fps);
  }
  frameToTime(frame: number): number {
    return frame / this.fps;
  }
  timeToFrame(time: number): number {
    return Math.round(time * this.fps);
  }
  /** Snap a time to the nearest whole frame. */
  snapTime(time: number): number {
    return Math.round(time * this.fps) / this.fps;
  }

  /** Resolve a Flash-style target: a frame number or a label name -> seconds. */
  private _resolveTime(target: number | string): number {
    if (typeof target === "string") {
      const l = this.findLabelByName(target);
      return l ? l.time : this.currentTime;
    }
    if (Number.isFinite(target)) return this.frameToTime(target);
    return this.currentTime;
  }

  // --- labels -------------------------------------------------------------

  /**
   * Add a named marker at a frame. `hold` makes it a playback stop point;
   * `script` is an arbitrary string (e.g. a frame action) carried with it.
   */
  addLabel(options: AddLabelOptions = {}): Label {
    const { time = this.currentTime, name, hold = false, script = "" } = options;
    const label: Label = {
      id: nextLabelId(),
      time: Math.max(0, time),
      name: name ?? `label ${this.labels.length + 1}`,
      hold,
      script,
    };
    this.labels.push(label);
    this.labels.sort((a, b) => a.time - b.time);
    this.emit("labels");
    return label;
  }

  getLabel(id: string): Label | null {
    return this.labels.find((l) => l.id === id) ?? null;
  }

  updateLabel(id: string, patch: LabelPatch = {}): Label | null {
    const label = this.getLabel(id);
    if (!label) return null;
    if (Number.isFinite(patch.time)) label.time = Math.max(0, patch.time!);
    if (typeof patch.name === "string") label.name = patch.name;
    if (typeof patch.hold === "boolean") label.hold = patch.hold;
    if (typeof patch.script === "string") label.script = patch.script;
    this.labels.sort((a, b) => a.time - b.time);
    this.emit("labels");
    return label;
  }

  removeLabel(id: string): boolean {
    const i = this.labels.findIndex((l) => l.id === id);
    if (i === -1) return false;
    this.labels.splice(i, 1);
    this.emit("labels");
    return true;
  }

  findLabelByName(name: string): Label | null {
    return this.labels.find((l) => l.name === name) ?? null;
  }

  /**
   * Find the first hold label strictly crossed by a step from `prev` to `next`
   * in the given direction. Returns the label to stop on, or null.
   */
  private _holdLabelInStep(
    prev: number,
    next: number,
    dir: number,
  ): Label | null {
    const holds = this.labels.filter((l) => l.hold);
    if (dir > 0) {
      return (
        holds
          .filter((l) => l.time > prev && l.time <= next)
          .sort((a, b) => a.time - b.time)[0] ?? null
      );
    }
    return (
      holds
        .filter((l) => l.time < prev && l.time >= next)
        .sort((a, b) => b.time - a.time)[0] ?? null
    );
  }

  // --- evaluation ---------------------------------------------------------

  /** Evaluate + write every track at the current time, then notify. */
  apply(): void {
    for (const track of this.tracks) track.apply(this.currentTime);
    this.emit("update", this.currentTime);
  }

  // --- playback -----------------------------------------------------------

  seek(time: number): void {
    // Only floor at 0. The playhead may sit beyond the current content while
    // authoring; `duration` auto-fits to content and playback still
    // wraps/clamps at it in `_tick`.
    this.currentTime = Math.max(0, time);
    this.apply();
    this.emit("seek", this.currentTime);
  }

  play(direction: number = 1): void {
    this.direction = direction >= 0 ? 1 : -1;
    if (this.isPlaying) return;

    // if parked at the boundary in the travel direction, rewind to the other end
    if (this.direction > 0 && this.currentTime >= this.duration - 1e-6) {
      this.currentTime = 0;
    } else if (this.direction < 0 && this.currentTime <= 1e-6) {
      this.currentTime = this.duration;
    }

    this.isPlaying = true;
    this._lastT = now();
    this.emit("play", this.direction);
    this._tick();
  }

  playForward(): void {
    this.play(1);
  }

  playBackward(): void {
    this.play(-1);
  }

  /** Flash-style: jump to a frame number or label name, then play. Chainable. */
  gotoAndPlay(target: number | string, direction: number = 1): this {
    this.seek(this._resolveTime(target));
    this.play(direction);
    return this;
  }

  /** Flash-style: jump to a frame number or label name and pause. Chainable. */
  gotoAndStop(target: number | string): this {
    this.pause();
    this.seek(this._resolveTime(target));
    return this;
  }

  pause(): void {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    if (this._raf != null) cancelAnimationFrame(this._raf);
    this._raf = null;
    this.emit("pause");
  }

  /** Toggle pause, always (re)starting in the forward direction. */
  toggle(): void {
    if (this.isPlaying) this.pause();
    else this.play(1);
  }

  stop(): void {
    this.pause();
    this.currentTime = 0;
    this.apply();
    this.emit("stop");
  }

  private _tick = (): void => {
    if (!this.isPlaying) return;
    const t0 = now();
    const dt = (t0 - this._lastT) / 1000;
    this._lastT = t0;

    const hi = this.duration;
    const prev = this.currentTime;
    let t = prev + this.direction * this.speed * dt;

    // 1) stop at a hold label if we cross one this step
    const hold = this._holdLabelInStep(prev, t, this.direction);
    if (hold) {
      this.currentTime = hold.time;
      this.apply();
      this.pause();
      this.emit("hold", hold);
      return;
    }

    // 2) handle the timeline boundaries (loop or clamp+pause)
    if (t >= hi) {
      if (this.loop) t = t % hi;
      else {
        this.currentTime = hi;
        this.apply();
        return this.pause();
      }
    } else if (t <= 0) {
      if (this.loop) t = hi + (t % hi);
      else {
        this.currentTime = 0;
        this.apply();
        return this.pause();
      }
    }

    this.currentTime = t;
    this.apply();
    this._raf = requestAnimationFrame(this._tick);
  };

  dispose(): void {
    this.pause();
    this._listeners.clear();
    this.tracks = [];
    this.labels = [];
  }
}

/** Monotonic-ish clock; falls back to Date.now in non-DOM environments. */
function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
