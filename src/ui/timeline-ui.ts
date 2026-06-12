import { clamp, easingOptions, isTween } from "../core/interpolation";
import type { Timeline } from "../core/timeline";
import type { Track } from "../core/track";
import type { Easing, Keyframe } from "../core/types";
// Styles are provided via `@atelier83/timeline/theme.css` at the package level.

const SVG_NS = "http://www.w3.org/2000/svg";
const LANE_H = 30;

type Attrs = Record<string, string | number>;

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
  for (const k in attrs) el.setAttribute(k, String(attrs[k]));
  return el;
}

interface HAttrs {
  text?: string;
  [key: string]: string | number | undefined;
}

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string | null,
  attrs: HAttrs = {},
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  for (const k in attrs) {
    const v = attrs[k];
    if (v == null) continue;
    if (k === "text") el.textContent = String(v);
    else el.setAttribute(k, String(v));
  }
  return el;
}

/**
 * Inner paths of the Lucide (https://lucide.dev) icons we use. Inlined as SVG
 * so the UI has no icon-font/library dependency and the strokes inherit
 * `currentColor`, stay crisp, and match the flat, monochrome theme.
 */
const ICON_PATHS = {
  skipBack:
    '<polygon points="19 20 9 12 19 4 19 20"/><line x1="5" x2="5" y1="19" y2="5"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  pause:
    '<rect x="14" y="3" width="5" height="18" rx="1"/><rect x="5" y="3" width="5" height="18" rx="1"/>',
  repeat:
    '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  // shared dope-sheet shapes — same as the lane markers so the buttons show
  // exactly what they create: a filled keyframe dot and a hollow frame box
  keyframe:
    '<circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="none"/>',
  frame:
    '<rect x="6.5" y="6.5" width="11" height="11" rx="0" fill="none" stroke="currentColor"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronUp: '<path d="m18 15-6-6-6 6"/>',
  trash:
    '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
} satisfies Record<string, string>;

type IconName = keyof typeof ICON_PATHS;

function icon(name: IconName): SVGSVGElement {
  const el = svg("svg", {
    class: "tl-icon",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
  });
  el.innerHTML = ICON_PATHS[name] ?? "";
  return el;
}

const setIcon = (el: Element, name: IconName): void =>
  el.replaceChildren(icon(name));

export interface TimelineUIOptions {
  /** Horizontal zoom: pixels per frame. */
  pixelsPerFrame?: number;
  /** Start collapsed (transport only). */
  collapsed?: boolean;
}

interface LaneRefs {
  lane: HTMLElement;
  svg: SVGSVGElement;
}

interface KeyframeSelection {
  track: Track;
  id: string;
}
interface SegmentSelection {
  track: Track;
  index: number;
}
interface CellSelection {
  track: Track;
  frame: number;
}

/**
 * DOM UI for a Timeline — a Flash-style dope sheet.
 *
 *  - Each track is a lane of keyframe dots; the segment between two keyframes
 *    is drawn gray + dashed for "hold" (no tween) or in the track color for a
 *    tween.
 *  - Keyframes are select-only; time/value/easing are edited in the inspector.
 *  - Times are shown and edited in frames (Timeline keeps seconds internally).
 */
export class TimelineUI {
  tl: Timeline;
  pxPerFrame: number;
  collapsed: boolean;

  selected: KeyframeSelection | null = null;
  selectedSegments: SegmentSelection[] = [];
  selectedCell: CellSelection | null = null;
  activeTrack: Track | null = null;

  #laneRefs = new Map<Track, LaneRefs>();
  #unsubs: Array<() => void> = [];
  #mounted = false;

  // DOM — built in #build().
  root!: HTMLElement;
  #transport!: HTMLElement;
  #btnRewind!: HTMLButtonElement;
  #btnPlay!: HTMLButtonElement;
  #btnLoop!: HTMLButtonElement;
  #btnKey!: HTMLButtonElement;
  #btnFrame!: HTMLButtonElement;
  #btnCollapse!: HTMLButtonElement;
  #timeLabel!: HTMLElement;
  #kfInspector!: HTMLElement;
  #kfTime!: HTMLInputElement;
  #kfValue!: HTMLInputElement;
  #kfEase!: HTMLSelectElement;
  #kfDelete!: HTMLButtonElement;
  #header!: HTMLElement;
  #corner!: HTMLElement;
  #rulerViewport!: HTMLElement;
  #ruler!: HTMLElement;
  #rulerHead!: HTMLElement;
  #body!: HTMLElement;
  #bodyInner!: HTMLElement;
  #sidebar!: HTMLElement;
  #lanesViewport!: HTMLElement;
  #lanesContent!: HTMLElement;
  #playhead!: HTMLElement;

  constructor(timeline: Timeline, options: TimelineUIOptions = {}) {
    this.tl = timeline;
    this.pxPerFrame = options.pixelsPerFrame ?? 12;
    this.collapsed = options.collapsed ?? false;
  }

  // --- coordinate mapping -------------------------------------------------

  timeToX(t: number): number {
    return t * this.tl.fps * this.pxPerFrame;
  }
  xToTime(x: number): number {
    return x / (this.tl.fps * this.pxPerFrame);
  }
  /** X of a frame's cell center — keyframes/playhead sit here (not the edge). */
  frameCenterX(time: number): number {
    return this.timeToX(time) + this.pxPerFrame / 2;
  }
  get contentWidth(): number {
    const vw = this.#lanesViewport?.clientWidth ?? 0;
    return Math.max((this.tl.totalFrames + 1) * this.pxPerFrame, vw);
  }
  // pointer X (relative to `el`) -> time: undo the half-cell offset so a click
  // lands in the cell. Used for both the ruler and the lanes content.
  #timeAt(el: HTMLElement, clientX: number): number {
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left - this.pxPerFrame / 2;
    return clamp(
      this.xToTime(x),
      0,
      this.tl.frameToTime(this.#visibleLastFrame()),
    );
  }
  // pointer X -> frame number under the cursor (cell the click falls in)
  #laneFrame(clientX: number): number {
    const rect = this.#lanesContent.getBoundingClientRect();
    return (clientX - rect.left) / this.pxPerFrame;
  }
  // last whole frame that fits the visible content width.
  #visibleLastFrame(): number {
    return Math.floor(this.contentWidth / this.pxPerFrame);
  }

  // --- lifecycle ----------------------------------------------------------

  mount(parent: HTMLElement = document.body): this {
    if (this.#mounted) return this;
    this.#build();
    parent.appendChild(this.root);
    this.#mounted = true;

    this.#unsubs.push(
      this.tl.on("update", () => this.#updatePlayhead()),
      this.tl.on("seek", () => this.#updatePlayhead()),
      this.tl.on("change", () => this.render()),
      this.tl.on("keyframes", (track) => this.#onKeyframesChanged(track)),
      this.tl.on("play", () => this.#syncTransport()),
      this.tl.on("pause", () => this.#syncTransport()),
      this.tl.on("stop", () => this.#syncTransport()),
    );

    this.render();
    this.#toggleCollapsed(this.collapsed);
    return this;
  }

  dispose(): void {
    this.#unsubs.forEach((u) => u());
    this.#unsubs = [];
    document.removeEventListener("keydown", this.#onKeyDown);
    this.root?.remove();
    this.#mounted = false;
  }

  // --- DOM construction ---------------------------------------------------

  #build(): void {
    this.root = h("div", "tl-root");
    this.#transport = h("div", "tl-transport");

    this.#btnRewind = h("button", "tl-btn tl-btn-sm", { title: "Back to 0" });
    this.#btnRewind.append(icon("skipBack"));
    this.#btnPlay = h("button", "tl-btn tl-btn-sm", { title: "Play / pause" });
    this.#btnPlay.append(icon("play"));
    this.#btnLoop = h("button", "tl-btn tl-btn-sm", { title: "Loop" });
    this.#btnLoop.append(icon("repeat"));
    this.#btnKey = h("button", "tl-btn tl-btn-sm", {
      title: "Insert keyframe on selected track",
    });
    this.#btnKey.append(icon("keyframe"));
    this.#btnFrame = h("button", "tl-btn tl-btn-sm", {
      title: "Insert frame: extend the segment at the playhead by one frame",
    });
    this.#btnFrame.append(icon("frame"));
    this.#btnRewind.onclick = () => {
      this.tl.pause();
      this.tl.seek(0);
    };
    this.#btnPlay.onclick = () =>
      this.tl.isPlaying ? this.tl.pause() : this.tl.play(1);
    this.#btnLoop.onclick = () => {
      this.tl.loop = !this.tl.loop;
      this.#syncTransport();
    };
    this.#btnKey.onclick = () => this.#addKeyframeToActive();
    this.#btnFrame.onclick = () => this.#insertFrameInActive();

    this.#timeLabel = h("div", "tl-time");

    this.#buildKeyframeInspector();

    this.#btnCollapse = h("button", "tl-btn tl-btn-sm", {
      title: "Hide tracks",
    });
    this.#btnCollapse.append(icon("chevronDown"));
    this.#btnCollapse.onclick = () => this.#toggleCollapsed();

    this.#transport.append(
      this.#btnRewind,
      this.#btnPlay,
      this.#btnLoop,
      this.#kfInspector,
      h("div", "tl-spacer"),
      this.#timeLabel,
      this.#btnCollapse,
    );

    // header: corner (authoring toolbar) + ruler
    this.#header = h("div", "tl-header");
    this.#corner = h("div", "tl-corner");
    this.#corner.append(this.#btnKey, this.#btnFrame);
    this.#rulerViewport = h("div", "tl-ruler-viewport");
    this.#ruler = h("div", "tl-ruler");
    this.#rulerHead = h("div", "tl-ruler-head");
    this.#ruler.append(this.#rulerHead);
    this.#rulerViewport.append(this.#ruler);
    this.#header.append(this.#corner, this.#rulerViewport);

    // body: scroll container > inner(flex row) > sidebar + lanes.
    this.#body = h("div", "tl-body");
    this.#bodyInner = h("div", "tl-body-inner");
    this.#sidebar = h("div", "tl-sidebar");
    this.#lanesViewport = h("div", "tl-lanes-viewport");
    this.#lanesContent = h("div", "tl-lanes-content");
    this.#playhead = h("div", "tl-playhead");
    this.#lanesContent.append(this.#playhead);
    this.#lanesViewport.append(this.#lanesContent);
    this.#bodyInner.append(this.#sidebar, this.#lanesViewport);
    this.#body.append(this.#bodyInner);

    this.root.append(this.#header, this.#body, this.#transport);

    this.#lanesViewport.addEventListener("scroll", () => {
      this.#rulerViewport.scrollLeft = this.#lanesViewport.scrollLeft;
    });
    this.#attachScrub(this.#rulerViewport);

    document.addEventListener("keydown", this.#onKeyDown);
  }

  #buildKeyframeInspector(): void {
    this.#kfInspector = h("div", "tl-inspector");
    this.#kfTime = h("input", "tl-input", {
      type: "number",
      step: "1",
      min: "0",
      title: "Keyframe frame",
    });
    this.#kfValue = h("input", "tl-input", {
      type: "number",
      step: "any",
      title: "Keyframe value",
    });
    this.#kfEase = h("select", "tl-select", {
      title: "Easing of outgoing segment",
    });
    for (const opt of easingOptions) {
      this.#kfEase.append(
        h("option", null, { value: opt.value, text: opt.label }),
      );
    }
    this.#kfDelete = h("button", "tl-btn tl-btn-sm", {
      title: "Delete keyframe (Del)",
    });
    this.#kfDelete.append(icon("trash"));

    const t = h("span", "tl-insp-field");
    t.append(h("span", "tl-label-dim", { text: "f" }), this.#kfTime);
    const v = h("span", "tl-insp-field");
    v.append(h("span", "tl-label-dim", { text: "v" }), this.#kfValue);
    this.#kfInspector.append(t, v, this.#kfEase, this.#kfDelete);

    this.#kfTime.addEventListener("input", () =>
      this.#editSelected({
        time: this.tl.frameToTime(parseInt(this.#kfTime.value, 10)),
      }),
    );
    this.#kfValue.addEventListener("input", () =>
      this.#editSelected({ value: parseFloat(this.#kfValue.value) }),
    );
    this.#kfEase.addEventListener("change", () =>
      this.#editSelected({ easing: this.#kfEase.value as Easing }),
    );
    this.#kfDelete.onclick = () => this.#deleteSelected();
  }

  // --- rendering ----------------------------------------------------------

  render(): void {
    if (!this.activeTrack || !this.tl.tracks.includes(this.activeTrack))
      this.activeTrack = this.tl.tracks[0] ?? null;
    this.#renderSidebar();
    this.#renderRuler();
    this.#renderLanes();
    this.#updatePlayhead();
    this.#syncTransport();
    this.#renderInspector();
  }

  #renderSidebar(): void {
    this.#sidebar.innerHTML = "";

    for (const track of this.tl.tracks) {
      const row = h("div", "tl-track-row");
      row.classList.toggle("is-active", track === this.activeTrack);
      row.append(h("div", "tl-track-name", { text: track.label }));
      row.addEventListener("pointerdown", () => this.#setActiveTrack(track));
      this.#sidebar.append(row);
    }
  }

  #renderRuler(): void {
    const width = this.contentWidth;
    this.#ruler.style.width = `${width}px`;
    this.#ruler.style.setProperty("--tl-ppf", `${this.pxPerFrame}px`);
    [...this.#ruler.children].forEach((c) => {
      if (c !== this.#rulerHead) c.remove();
    });

    const stepFrames = this.#tickStepFrames();
    const lastFrame = Math.floor(width / this.pxPerFrame);
    for (let f = 0; f <= lastFrame; f += stepFrames) {
      const tick = h("div", "tl-tick", { text: `${f}` });
      tick.style.left = `${this.timeToX(this.tl.frameToTime(f))}px`;
      this.#ruler.append(tick);
    }
  }

  #tickStepFrames(): number {
    const targetFrames = 64 / this.pxPerFrame;
    const nice = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
    return nice.find((n) => n >= targetFrames) ?? 600;
  }

  #renderLanes(): void {
    const width = this.contentWidth;
    this.#lanesContent.style.width = `${width}px`;
    this.#lanesContent.style.setProperty("--tl-ppf", `${this.pxPerFrame}px`);
    [...this.#lanesContent.querySelectorAll(".tl-lane")].forEach((n) =>
      n.remove(),
    );

    for (const track of this.tl.tracks) {
      const lane = h("div", "tl-lane");
      const s = svg("svg", { width, height: LANE_H });
      lane.append(s);
      this.#lanesContent.insertBefore(lane, this.#playhead);
      lane.addEventListener("pointerdown", (e) => this.#onLaneScrub(e, track));
      lane.addEventListener("dblclick", (e) => this.#onLaneDblClick(e, track));

      this.#laneRefs.set(track, { lane, svg: s });
      this.#renderLaneGraph(track);
    }

    this.#playhead.style.height = `${this.tl.tracks.length * LANE_H}px`;
  }

  /** Flash-style dope-sheet row for a single track. */
  #renderLaneGraph(track: Track): void {
    const refs = this.#laneRefs.get(track);
    if (!refs?.svg) return;
    const s = refs.svg;
    s.setAttribute("width", String(this.contentWidth));
    s.innerHTML = "";

    const ppf = this.pxPerFrame;
    const cy = LANE_H / 2;
    const top = 0;
    const bh = LANE_H;
    const r = clamp(ppf * 0.3, 1.5, 3);
    const left = (t: number): number => this.tl.timeToFrame(t) * ppf;
    const cellW = Math.max(ppf, 7);

    if (this.selectedCell?.track === track) {
      s.append(
        svg("rect", {
          class: "tl-cell-sel",
          x: this.selectedCell.frame * ppf,
          y: 0.5,
          width: cellW,
          height: bh - 1,
        }),
      );
    }

    const kfs = track.keyframes;
    if (kfs.length === 0) return;

    const isSel = (i: number): boolean =>
      this.selectedSegments.some(
        (seg) => seg.track === track && seg.index === i,
      );
    const endT = track.endTime;
    const endFrame = this.tl.timeToFrame(endT);
    const lastKf = kfs[kfs.length - 1]!;
    const lastKfFrame = this.tl.timeToFrame(lastKf.time);

    const block = (kf: Keyframe, x: number, w: number, seg: number): void => {
      const rect = svg("rect", { x, y: top, width: w, height: bh, rx: 1 });
      let cls = isTween(kf.easing) ? "tl-block" : "tl-block tl-block-hold";
      if (isSel(seg)) cls += " is-selected";
      rect.setAttribute("class", cls);
      rect.addEventListener("pointerdown", (e) =>
        this.#onSegmentDrag(e as PointerEvent, track, seg),
      );
      s.append(rect);
    };

    for (let i = 0; i < kfs.length - 1; i++) {
      const a = kfs[i]!;
      block(
        a,
        left(a.time),
        Math.max(1, left(kfs[i + 1]!.time) - left(a.time)),
        i,
      );
    }
    block(
      lastKf,
      left(lastKf.time),
      Math.max(cellW, left(endT) + cellW - left(lastKf.time)),
      kfs.length - 1,
    );

    for (const kf of kfs) {
      s.append(
        svg("circle", {
          class: "tl-kf",
          cx: this.frameCenterX(kf.time),
          cy,
          r,
        }),
      );
    }

    const endRect = (frame: number): void => {
      const w = Math.max(r * 2, 4);
      const cx = this.frameCenterX(this.tl.frameToTime(frame));
      s.append(
        svg("rect", {
          class: "tl-end",
          x: cx - w / 2,
          y: cy - w / 2,
          width: w,
          height: w,
        }),
      );
    };
    for (let i = 0; i < kfs.length - 1; i++) {
      const a = this.tl.timeToFrame(kfs[i]!.time);
      const b = this.tl.timeToFrame(kfs[i + 1]!.time);
      if (b - a >= 2) endRect(b - 1);
    }
    if (endFrame > lastKfFrame) endRect(endFrame);

    for (let i = 0; i < kfs.length - 1; i++) {
      const bx = left(kfs[i + 1]!.time);
      const handle = svg("rect", {
        class: "tl-span-resize",
        x: bx - 3,
        y: top,
        width: 6,
        height: bh,
      });
      handle.addEventListener("pointerdown", (e) =>
        this.#onSegmentResize(e as PointerEvent, track, i),
      );
      s.append(handle);
    }
    const tail = svg("rect", {
      class: "tl-span-resize",
      x: left(endT) + cellW - 3,
      y: top,
      width: 6,
      height: bh,
    });
    tail.addEventListener("pointerdown", (e) =>
      this.#onSpanResize(e as PointerEvent, track),
    );
    s.append(tail);
  }

  #onKeyframesChanged(track: Track): void {
    this.#syncContentWidth();
    this.#renderRuler();
    this.#renderLaneGraph(track);
    this.#updatePlayhead();
  }

  #syncContentWidth(): void {
    const width = this.contentWidth;
    this.#lanesContent.style.width = `${width}px`;
    for (const refs of this.#laneRefs.values())
      refs.svg.setAttribute("width", String(width));
  }

  // --- live updates -------------------------------------------------------

  #updatePlayhead(): void {
    const x = this.frameCenterX(this.tl.currentTime);
    this.#playhead.style.transform = `translateX(${x}px)`;
    this.#rulerHead.style.transform = `translateX(${x}px)`;
    this.#timeLabel.innerHTML = `<b>${this.tl.currentFrame}</b> <span class="tl-label-dim">/ ${this.tl.totalFrames} f · ${this.tl.fps}fps</span>`;

    // Auto-scroll to keep the playhead visible during playback. Scroll by a
    // page (viewport width) so it doesn't jump on every frame — only when the
    // playhead leaves the visible area.
    if (this.tl.isPlaying) {
      const vp = this.#lanesViewport;
      const { scrollLeft, clientWidth } = vp;
      if (x < scrollLeft || x > scrollLeft + clientWidth) {
        vp.scrollLeft = x - clientWidth * 0.1;
      }
    }
  }

  #syncTransport(): void {
    setIcon(this.#btnPlay, this.tl.isPlaying ? "pause" : "play");
    this.#btnPlay.classList.toggle("is-active", this.tl.isPlaying);
    this.#btnLoop.classList.toggle("is-active", this.tl.loop);
  }

  // --- active track + add helpers -----------------------------------------

  #setActiveTrack(track: Track): void {
    if (this.activeTrack === track) return;
    this.activeTrack = track;
    this.#renderSidebar();
  }

  #addKeyframeToActive(): void {
    const track = this.activeTrack;
    if (!track) return;
    const f2t = (n: number): number => this.tl.frameToTime(n);
    const t2f = (t: number): number => this.tl.timeToFrame(t);
    const frame = t2f(this.tl.snapTime(this.tl.currentTime));

    const existing = track.keyframes.find((k) => t2f(k.time) === frame);
    if (existing) {
      this.#setSelected({ track, id: existing.id });
      return;
    }

    const endF = t2f(track.endTime);

    if (frame > endF && track.keyframes.some((k) => t2f(k.time) < frame)) {
      track.setSpanEnd(f2t(frame - 1));
    }

    track.addKeyframe(frame, track.getCurrentValue());
    if (track.lastKeyframe)
      this.#setSelected({ track, id: track.lastKeyframe.id });
    this.tl.apply();
  }

  #insertFrameInActive(): void {
    const track = this.activeTrack;
    if (!track || !track.hasKeyframes()) return;
    const f2t = (n: number): number => this.tl.frameToTime(n);
    const t2f = (t: number): number => this.tl.timeToFrame(t);
    const p = t2f(this.tl.snapTime(this.tl.currentTime));
    const endF = t2f(track.endTime);

    if (p > endF) {
      track.setSpanEnd(f2t(p));
      this.#onKeyframesChanged(track);
      this.tl.apply();
      return;
    }

    const hadSpanEnd = track.spanEnd != null;
    const spanEndF = endF;

    const atOrAfter = track.keyframes
      .map((k) => ({ id: k.id, frame: t2f(k.time) }))
      .filter((k) => k.frame >= p)
      .sort((a, b) => b.frame - a.frame);
    for (const k of atOrAfter)
      track.moveKeyframe(k.id, { time: f2t(k.frame + 1) });

    if (atOrAfter.length > 0) {
      if (hadSpanEnd && spanEndF >= p) {
        track.setSpanEnd(f2t(spanEndF + 1));
      }
    } else {
      track.setSpanEnd(f2t(endF + 1));
    }
    this.#onKeyframesChanged(track);
    this.tl.apply();
  }

  // --- keyframe selection + inspector -------------------------------------

  #setSelected(sel: KeyframeSelection | null): void {
    const prev = this.selected?.track;
    const segTracks = this.selectedSegments.map((s) => s.track);
    const cellTrack = this.selectedCell?.track;
    this.selected = sel;
    this.selectedSegments = [];
    this.selectedCell = null;
    if (sel) {
      this.#blurInspectorInputs();
      this.#setActiveTrack(sel.track);
    }
    for (const t of [...segTracks, cellTrack])
      if (t && t !== prev && t !== sel?.track) this.#renderLaneGraph(t);
    if (prev && prev !== sel?.track) this.#renderLaneGraph(prev);
    if (sel?.track) this.#renderLaneGraph(sel.track);
    this.#renderInspector();
  }

  #blurInspectorInputs(): void {
    const el = document.activeElement;
    if (el instanceof HTMLElement && this.#kfInspector.contains(el)) el.blur();
  }

  #renderInspector(): void {
    const sel = this.selected;
    const kf = sel ? sel.track.getKeyframe(sel.id) : null;
    if (!kf) {
      this.#kfInspector.classList.remove("is-visible");
      return;
    }
    this.#kfInspector.classList.add("is-visible");
    if (document.activeElement !== this.#kfTime)
      this.#kfTime.value = String(this.tl.timeToFrame(kf.time));
    if (document.activeElement !== this.#kfValue)
      this.#kfValue.value = String(+kf.value.toFixed(4));
    if (document.activeElement !== this.#kfEase) this.#kfEase.value = kf.easing;
  }

  #editSelected(patch: {
    time?: number;
    value?: number;
    easing?: Easing;
  }): void {
    if (!this.selected) return;
    const { track, id } = this.selected;
    const next: { time?: number; value?: number; easing?: Easing } = {};
    if (Number.isFinite(patch.time)) next.time = patch.time;
    if (Number.isFinite(patch.value)) next.value = patch.value;
    if (typeof patch.easing === "string") next.easing = patch.easing;
    track.moveKeyframe(id, next);
    this.#renderLaneGraph(track);
    this.#renderInspector();
    this.tl.apply();
  }

  #deleteSelected(): void {
    if (!this.selected) return;
    const { track, id } = this.selected;
    track.removeKeyframe(id);
    this.#setSelected(null);
    this.#renderLaneGraph(track);
    this.tl.apply();
  }

  #deleteSelectedSegments(): void {
    if (!this.selectedSegments.length) return;
    const byTrack = new Map<Track, Set<string>>();
    for (const { track, index } of this.selectedSegments) {
      const kfs = track.keyframes;
      let set = byTrack.get(track);
      if (!set) byTrack.set(track, (set = new Set()));
      const a = kfs[index];
      const b = kfs[index + 1];
      if (a) set.add(a.id);
      if (b) set.add(b.id);
    }
    for (const [track, ids] of byTrack) {
      for (const id of ids) track.removeKeyframe(id);
      this.#onKeyframesChanged(track);
    }
    this.selectedSegments = [];
    this.tl.apply();
  }

  // --- empty-frame (cell) selection ---------------------------------------

  #setSelectedCell(track: Track, frame: number): void {
    const prev = this.selectedCell?.track;
    this.selectedCell = { track, frame };
    this.selected = null;
    const segTracks = this.selectedSegments.map((s) => s.track);
    this.selectedSegments = [];
    for (const t of new Set([prev, track, ...segTracks]))
      if (t) this.#renderLaneGraph(t);
    this.#renderInspector();
  }

  // --- interactions -------------------------------------------------------

  #attachScrub(el: HTMLElement): void {
    const seekFromEvent = (e: PointerEvent): void =>
      this.tl.seek(this.tl.snapTime(this.#timeAt(this.#ruler, e.clientX)));
    el.addEventListener("pointerdown", (e) => {
      el.setPointerCapture(e.pointerId);
      this.tl.pause();
      seekFromEvent(e);
      const move = (ev: PointerEvent): void => seekFromEvent(ev);
      const up = (): void => {
        el.releasePointerCapture(e.pointerId);
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
    });
  }

  #onLaneScrub(e: PointerEvent, track: Track): void {
    const target = e.target as Element | null;
    if (target?.classList?.contains("tl-block")) return;
    this.#setActiveTrack(track);
    this.tl.pause();
    const seek = (clientX: number): void => {
      const frame = clamp(
        Math.floor(this.#laneFrame(clientX)),
        0,
        this.#visibleLastFrame(),
      );
      this.tl.seek(this.tl.frameToTime(frame));
      this.#setSelectedCell(track, frame);
    };
    seek(e.clientX);
    const move = (ev: PointerEvent): void => seek(ev.clientX);
    const up = (): void => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  }

  #onSegmentResize(e: PointerEvent, track: Track, index: number): void {
    e.stopPropagation();
    e.preventDefault();
    this.tl.pause();
    const fps = this.tl.fps;
    const maxFrame = this.#visibleLastFrame();
    const kfs = track.keyframes;
    const a = kfs[index];
    const b = kfs[index + 1];
    if (!a || !b) return;
    const aFrame = this.tl.timeToFrame(a.time);
    const ripple = kfs.slice(index + 1).map((k) => ({
      id: k.id,
      frame: this.tl.timeToFrame(k.time),
    }));
    const bFrame0 = ripple[0]!.frame;
    const lastFrame0 = ripple[ripple.length - 1]!.frame;
    const dMin = aFrame + 1 - bFrame0;
    const dMax = Math.max(dMin, maxFrame - lastFrame0);
    const apply = (clientX: number): void => {
      const boundary = clamp(Math.round(this.#laneFrame(clientX)), 0, maxFrame);
      const d = clamp(boundary - bFrame0, dMin, dMax);
      for (const m of ripple)
        track.moveKeyframe(m.id, { time: (m.frame + d) / fps });
      this.tl.apply();
    };
    apply(e.clientX);
    const move = (ev: PointerEvent): void => apply(ev.clientX);
    const up = (): void => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  }

  #onSpanResize(e: PointerEvent, track: Track): void {
    e.stopPropagation();
    e.preventDefault();
    this.tl.pause();
    const apply = (clientX: number): void => {
      const frame = clamp(
        Math.round(this.#laneFrame(clientX)) - 1,
        0,
        this.#visibleLastFrame(),
      );
      track.setSpanEnd(this.tl.frameToTime(frame));
    };
    apply(e.clientX);
    const move = (ev: PointerEvent): void => apply(ev.clientX);
    const up = (): void => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  }

  #onLaneDblClick(e: MouseEvent, track: Track): void {
    const frame = this.tl.timeToFrame(
      this.tl.snapTime(this.#timeAt(this.#lanesContent, e.clientX)),
    );
    const existing = track.keyframes.find(
      (k) => this.tl.timeToFrame(k.time) === frame,
    );
    if (existing) {
      this.#setSelected({ track, id: existing.id });
      return;
    }
    track.addKeyframe(frame, track.getCurrentValue());
    if (track.lastKeyframe)
      this.#setSelected({ track, id: track.lastKeyframe.id });
    this.tl.apply();
  }

  #isSegmentSelected(track: Track, index: number): boolean {
    return this.selectedSegments.some(
      (s) => s.track === track && s.index === index,
    );
  }

  #selectSegment(track: Track, index: number, additive: boolean): void {
    const member = this.#isSegmentSelected(track, index);
    if (additive) {
      this.selectedSegments = member
        ? this.selectedSegments.filter(
            (s) => !(s.track === track && s.index === index),
          )
        : [...this.selectedSegments, { track, index }];
    } else if (!member) {
      this.selectedSegments = [{ track, index }];
    }
    const startKf = track.keyframes[index];
    const single = !additive && this.selectedSegments.length === 1 && startKf;
    this.selected = single ? { track, id: startKf.id } : null;
    this.selectedCell = null;
    this.#setActiveTrack(track);
    for (const t of this.tl.tracks) this.#renderLaneGraph(t);
    this.#blurInspectorInputs();
    this.#renderInspector();
  }

  #onSegmentDrag(e: PointerEvent, track: Track, index: number): void {
    e.stopPropagation();
    e.preventDefault();
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    const clickedFrame = clamp(
      Math.floor(this.#laneFrame(e.clientX)),
      0,
      this.#visibleLastFrame(),
    );
    this.#selectSegment(track, index, additive);
    this.tl.pause();

    this.tl.seek(this.tl.frameToTime(clickedFrame));

    const fps = this.tl.fps;
    const visibleLast = this.#visibleLastFrame();

    const movingIds = new Map<Track, Set<string>>();
    const tailTracks = new Map<Track, number>();
    for (const seg of this.selectedSegments) {
      const kfs = seg.track.keyframes;
      const a = kfs[seg.index];
      const b = kfs[seg.index + 1];
      if (!a) continue;
      let set = movingIds.get(seg.track);
      if (!set) movingIds.set(seg.track, (set = new Set()));
      set.add(a.id);
      if (b) set.add(b.id);
      else tailTracks.set(seg.track, this.tl.timeToFrame(seg.track.endTime));
    }

    const moves: Array<{ track: Track; id: string; frame: number }> = [];
    let dMin = -Infinity;
    let dMax = Infinity;
    for (const [tr, ids] of movingIds) {
      const moving: number[] = [];
      const fixed: number[] = [];
      for (const kf of tr.keyframes) {
        const f = this.tl.timeToFrame(kf.time);
        if (ids.has(kf.id)) {
          moving.push(f);
          moves.push({ track: tr, id: kf.id, frame: f });
        } else fixed.push(f);
      }
      if (!moving.length) continue;
      const minM = Math.min(...moving);
      const tailFrame = tailTracks.get(tr);
      const maxM =
        tailFrame != null
          ? Math.max(...moving, tailFrame)
          : Math.max(...moving);
      let lower = 0;
      let upper = visibleLast;
      for (const f of fixed) {
        if (f < minM) lower = Math.max(lower, f + 1);
        if (f > maxM) upper = Math.min(upper, f - 1);
      }
      dMin = Math.max(dMin, lower - minM);
      dMax = Math.min(dMax, upper - maxM);
    }
    if (!moves.length) return;

    const startFrame = Math.round(this.#laneFrame(e.clientX));
    let moved = false;
    const move = (ev: PointerEvent): void => {
      if (!moved && Math.abs(ev.clientX - e.clientX) > 3) moved = true;
      if (!moved) return;
      let d = Math.round(this.#laneFrame(ev.clientX)) - startFrame;
      d = clamp(d, dMin, dMax);
      for (const m of moves)
        m.track.moveKeyframe(m.id, { time: (m.frame + d) / fps });
      for (const [tr, spanEndFrame] of tailTracks)
        tr.setSpanEnd((spanEndFrame + d) / fps);
      this.tl.apply();
    };
    const up = (): void => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  }

  #onKeyDown = (e: KeyboardEvent): void => {
    const typing =
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLSelectElement ||
      e.target instanceof HTMLTextAreaElement;
    if ((e.key === "Delete" || e.key === "Backspace") && !typing) {
      if (this.selectedSegments.length) this.#deleteSelectedSegments();
      else if (this.selected) this.#deleteSelected();
      e.preventDefault();
    } else if (e.code === "Space" && !typing && e.target === document.body) {
      this.tl.toggle();
      e.preventDefault();
    }
  };

  // --- collapse -----------------------------------------------------------

  #toggleCollapsed(force?: boolean): void {
    this.collapsed = force ?? !this.collapsed;
    this.root.classList.toggle("is-collapsed", this.collapsed);
    setIcon(this.#btnCollapse, this.collapsed ? "chevronUp" : "chevronDown");
    this.#btnCollapse.title = this.collapsed ? "Show tracks" : "Hide tracks";
  }
}
