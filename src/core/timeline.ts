import { Track } from "./track";
import type {
  AnimatableTarget,
  EventListener,
  TimelineEvent,
  TimelineEventMap,
  TimelineOptions,
  TrackOptions,
} from "./types";

type AnyListener = (payload: never) => void;

/**
 * Headless timeline engine.
 *
 * Owns the tracks, the playhead time, and playback. `loop` repeats the whole
 * timeline when playback reaches a boundary.
 *
 * By default it is self-driving: while playing it runs its own rAF loop so the
 * library works standalone in any page. Set `autoUpdate: false` to drive it
 * from your own loop instead — `play()` then only flips the playing flag and
 * you advance time by calling `update(dt)` once per frame (see {@link update}).
 * Either way, on every time change it re-evaluates all tracks, writes the
 * values into their targets, and emits `update`.
 *
 * Events: "update" (time), "change" (structure), "keyframes" (track),
 *         "play" (direction), "pause", "stop", "seek" (time).
 */
export class Timeline {
  fps: number;
  loop: boolean;
  speed: number;
  /** The length auto-fits to the furthest content, never below `minFrames`. */
  minFrames: number;
  /**
   * When true (default) `play()` runs an internal rAF loop. Set to false to
   * drive playback yourself by calling {@link update} from your own loop.
   */
  autoUpdate: boolean;

  tracks: Track[] = [];

  currentTime = 0;
  isPlaying = false;
  /** +1 forward, -1 backward. */
  direction: 1 | -1 = 1;

  #raf: number | null = null;
  #lastT = 0;
  #listeners = new Map<TimelineEvent, Set<AnyListener>>();

  constructor(options: TimelineOptions = {}) {
    this.fps = options.fps ?? 30;
    this.loop = options.loop ?? false;
    this.speed = options.speed ?? 1;
    this.minFrames = options.minFrames ?? 1;
    this.autoUpdate = options.autoUpdate ?? true;

    if (typeof options.onUpdate === "function") {
      this.on("update", options.onUpdate);
    }
  }

  // --- events -------------------------------------------------------------

  on<K extends TimelineEvent>(event: K, fn: EventListener<K>): () => void {
    let set = this.#listeners.get(event);
    if (!set) this.#listeners.set(event, (set = new Set()));
    set.add(fn as AnyListener);
    return () => this.off(event, fn);
  }

  off<K extends TimelineEvent>(event: K, fn: EventListener<K>): void {
    this.#listeners.get(event)?.delete(fn as AnyListener);
  }

  emit<K extends TimelineEvent>(event: K, payload?: TimelineEventMap[K]): void {
    const set = this.#listeners.get(event);
    if (!set) return;
    // Isolate listeners: a throwing handler must not break sibling listeners
    // or kill the self-driving playback loop.
    for (const fn of set) {
      try {
        (fn as EventListener<K>)(payload as TimelineEventMap[K]);
      } catch (err) {
        console.error(`timeline: "${event}" listener threw`, err);
      }
    }
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
   * track span end. Auto-grows/shrinks as keyframes are edited; floored at
   * `minFrames` so it's never empty.
   */
  get duration(): number {
    let end = 0;
    for (const t of this.tracks) end = Math.max(end, t.endTime);
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
    // wraps/clamps at it in `#tick`.
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
    this.#lastT = now();
    this.emit("play", this.direction);
    // Self-driving mode runs its own loop; manual mode waits for update(dt).
    if (this.autoUpdate) this.#tick();
  }

  pause(): void {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    if (this.#raf != null) cancelAnimationFrame(this.#raf);
    this.#raf = null;
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

  /**
   * Advance playback by `dt` seconds, then write all tracks and emit `update`.
   *
   * Call this once per frame when driving the timeline yourself (construct with
   * `{ autoUpdate: false }` so `play()` doesn't also run an internal loop):
   *
   * ```ts
   * const tl = new Timeline({ autoUpdate: false });
   * function frame(now: number) {
   *   tl.update();          // or tl.update(dtSeconds) with your own delta
   *   requestAnimationFrame(frame);
   * }
   * tl.play();
   * requestAnimationFrame(frame);
   * ```
   *
   * With no argument the delta is derived from an internal clock, so a bare
   * `update()` in a rAF/game loop just works. It is a no-op while paused, so
   * it's safe to call unconditionally from a shared loop.
   */
  update(dt?: number): void {
    if (!this.isPlaying) return;
    const t0 = now();
    const delta = dt ?? (t0 - this.#lastT) / 1000;
    this.#lastT = t0;
    this.#advance(delta);
  }

  /**
   * Move the playhead by `dt` seconds, applying loop/clamp boundaries, then
   * write every track. Shared by the internal rAF loop and {@link update}.
   * Pauses (and stops) when a non-looping boundary is reached.
   */
  #advance(dt: number): void {
    const hi = this.duration;
    // Nothing to animate (no content and a zero floor): stop instead of
    // producing NaN via `t % 0` in the loop branches below.
    if (hi <= 0) {
      this.currentTime = 0;
      this.apply();
      return this.pause();
    }

    let t = this.currentTime + this.direction * this.speed * dt;

    // handle the timeline boundaries (loop or clamp+pause)
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
  }

  #tick = (): void => {
    if (!this.isPlaying) return;
    const t0 = now();
    const dt = (t0 - this.#lastT) / 1000;
    this.#lastT = t0;
    this.#advance(dt);
    // #advance may have paused at a boundary; only reschedule if still playing.
    if (this.isPlaying) this.#raf = requestAnimationFrame(this.#tick);
  };

  dispose(): void {
    this.pause();
    this.#listeners.clear();
    this.tracks = [];
  }
}

/** Monotonic-ish clock; falls back to Date.now in non-DOM environments. */
function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
