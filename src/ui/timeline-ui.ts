import { clamp, easingOptions, isTween } from "../core/interpolation";
import type { Timeline } from "../core/timeline";
import type { Track } from "../core/track";
import type { Easing, Keyframe, Label } from "../core/types";
import { injectStyles } from "./styles";

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
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
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
 *  - A single Labels lane (at the top) holds named markers / hold points.
 *  - Times are shown and edited in frames (Timeline keeps seconds internally).
 */
export class TimelineUI {
  tl: Timeline;
  pxPerFrame: number;
  collapsed: boolean;

  selected: KeyframeSelection | null = null;
  selectedSegments: SegmentSelection[] = [];
  selectedCell: CellSelection | null = null;
  selectedLabel: string | null = null;
  selectedLabelCell: number | null = null;
  activeTrack: Track | null = null;

  private _laneRefs = new Map<Track, LaneRefs>();
  // Actions (labels/scripts) row is temporarily disabled — flip to re-enable.
  private _actionsEnabled = false;
  private _labelsLane: HTMLElement | null = null;
  private _unsubs: Array<() => void> = [];
  private _mounted = false;

  // DOM — built in `_build`.
  root!: HTMLElement;
  private transport!: HTMLElement;
  private btnRewind!: HTMLButtonElement;
  private btnPlay!: HTMLButtonElement;
  private btnLoop!: HTMLButtonElement;
  private btnKey!: HTMLButtonElement;
  private btnFrame!: HTMLButtonElement;
  private btnLabel!: HTMLButtonElement;
  private btnCollapse!: HTMLButtonElement;
  private timeLabel!: HTMLElement;
  private kfInspector!: HTMLElement;
  private kfTime!: HTMLInputElement;
  private kfValue!: HTMLInputElement;
  private kfEase!: HTMLSelectElement;
  private kfDelete!: HTMLButtonElement;
  private mkInspector!: HTMLElement;
  private mkName!: HTMLInputElement;
  private mkScript!: HTMLInputElement;
  private mkDelete!: HTMLButtonElement;
  private header!: HTMLElement;
  private corner!: HTMLElement;
  private rulerViewport!: HTMLElement;
  private ruler!: HTMLElement;
  private rulerHead!: HTMLElement;
  private body!: HTMLElement;
  private bodyInner!: HTMLElement;
  private sidebar!: HTMLElement;
  private lanesViewport!: HTMLElement;
  private lanesContent!: HTMLElement;
  private playhead!: HTMLElement;

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
    const vw = this.lanesViewport?.clientWidth ?? 0;
    return Math.max((this.tl.totalFrames + 1) * this.pxPerFrame, vw);
  }
  // pointer X -> time: undo the half-cell offset so a click lands in the cell.
  private _rulerTime(clientX: number): number {
    const rect = this.ruler.getBoundingClientRect();
    const x = clientX - rect.left - this.pxPerFrame / 2;
    return clamp(
      this.xToTime(x),
      0,
      this.tl.frameToTime(this._visibleLastFrame()),
    );
  }
  private _laneTime(clientX: number): number {
    const rect = this.lanesContent.getBoundingClientRect();
    const x = clientX - rect.left - this.pxPerFrame / 2;
    return clamp(
      this.xToTime(x),
      0,
      this.tl.frameToTime(this._visibleLastFrame()),
    );
  }
  // pointer X -> frame number under the cursor (cell the click falls in)
  private _laneFrame(clientX: number): number {
    const rect = this.lanesContent.getBoundingClientRect();
    return (clientX - rect.left) / this.pxPerFrame;
  }
  // last whole frame that fits the visible content width.
  private _visibleLastFrame(): number {
    return Math.floor(this.contentWidth / this.pxPerFrame);
  }

  // --- lifecycle ----------------------------------------------------------

  mount(parent: HTMLElement = document.body): this {
    if (this._mounted) return this;
    injectStyles();
    this._build();
    parent.appendChild(this.root);
    this._mounted = true;

    this._unsubs.push(
      this.tl.on("update", () => this._updatePlayhead()),
      this.tl.on("seek", () => this._updatePlayhead()),
      this.tl.on("change", () => this.render()),
      this.tl.on("keyframes", (track) => this._onKeyframesChanged(track)),
      this.tl.on("labels", () => this.render()),
      this.tl.on("play", () => this._syncTransport()),
      this.tl.on("pause", () => this._syncTransport()),
      this.tl.on("stop", () => this._syncTransport()),
    );

    this.render();
    this._toggleCollapsed(this.collapsed);
    return this;
  }

  dispose(): void {
    this._unsubs.forEach((u) => u());
    this._unsubs = [];
    document.removeEventListener("keydown", this._onKeyDown);
    this.root?.remove();
    this._mounted = false;
  }

  // --- DOM construction ---------------------------------------------------

  private _build(): void {
    this.root = h("div", "tl-root");
    this.transport = h("div", "tl-transport");

    this.btnRewind = h("button", "tl-btn tl-btn-sm", { title: "Back to 0" });
    this.btnRewind.append(icon("skipBack"));
    this.btnPlay = h("button", "tl-btn tl-btn-sm", { title: "Play / pause" });
    this.btnPlay.append(icon("play"));
    this.btnLoop = h("button", "tl-btn tl-btn-sm", { title: "Loop" });
    this.btnLoop.append(icon("repeat"));
    this.btnKey = h("button", "tl-btn tl-btn-sm", {
      title: "Insert keyframe on selected track",
    });
    this.btnKey.append(icon("keyframe"));
    this.btnFrame = h("button", "tl-btn tl-btn-sm", {
      title: "Insert frame: extend the segment at the playhead by one frame",
    });
    this.btnFrame.append(icon("frame"));
    this.btnLabel = h("button", "tl-btn tl-btn-sm", {
      title: "Add action at playhead",
    });
    this.btnLabel.append(icon("flag"));
    this.btnRewind.onclick = () => {
      this.tl.pause();
      this.tl.seek(0);
    };
    this.btnPlay.onclick = () =>
      this.tl.isPlaying ? this.tl.pause() : this.tl.play(1);
    this.btnLoop.onclick = () => {
      this.tl.loop = !this.tl.loop;
      this._syncTransport();
    };
    this.btnKey.onclick = () => this._addKeyframeToActive();
    this.btnFrame.onclick = () => this._insertFrameInActive();
    this.btnLabel.onclick = () => this._addLabel();

    this.timeLabel = h("div", "tl-time");

    this._buildKeyframeInspector();
    this._buildLabelInspector();

    this.btnCollapse = h("button", "tl-btn tl-btn-sm", {
      title: "Hide tracks",
    });
    this.btnCollapse.append(icon("chevronDown"));
    this.btnCollapse.onclick = () => this._toggleCollapsed();

    this.transport.append(
      this.btnRewind,
      this.btnPlay,
      this.btnLoop,
      this.kfInspector,
      this.mkInspector,
      h("div", "tl-spacer"),
      this.timeLabel,
      this.btnCollapse,
    );

    // header: corner (authoring toolbar) + ruler
    this.header = h("div", "tl-header");
    this.corner = h("div", "tl-corner");
    this.corner.append(this.btnKey, this.btnFrame);
    if (this._actionsEnabled) this.corner.append(this.btnLabel);
    this.rulerViewport = h("div", "tl-ruler-viewport");
    this.ruler = h("div", "tl-ruler");
    this.rulerHead = h("div", "tl-ruler-head");
    this.ruler.append(this.rulerHead);
    this.rulerViewport.append(this.ruler);
    this.header.append(this.corner, this.rulerViewport);

    // body: scroll container > inner(flex row) > sidebar + lanes.
    this.body = h("div", "tl-body");
    this.bodyInner = h("div", "tl-body-inner");
    this.sidebar = h("div", "tl-sidebar");
    this.lanesViewport = h("div", "tl-lanes-viewport");
    this.lanesContent = h("div", "tl-lanes-content");
    this.playhead = h("div", "tl-playhead");
    this.lanesContent.append(this.playhead);
    this.lanesViewport.append(this.lanesContent);
    this.bodyInner.append(this.sidebar, this.lanesViewport);
    this.body.append(this.bodyInner);

    this.root.append(this.header, this.body, this.transport);

    this.lanesViewport.addEventListener("scroll", () => {
      this.rulerViewport.scrollLeft = this.lanesViewport.scrollLeft;
    });
    this._attachScrub(this.rulerViewport);

    document.addEventListener("keydown", this._onKeyDown);
  }

  private _buildKeyframeInspector(): void {
    this.kfInspector = h("div", "tl-inspector");
    this.kfTime = h("input", "tl-input", {
      type: "number",
      step: "1",
      min: "0",
      title: "Keyframe frame",
    });
    this.kfValue = h("input", "tl-input", {
      type: "number",
      step: "any",
      title: "Keyframe value",
    });
    this.kfEase = h("select", "tl-select", {
      title: "Easing of outgoing segment",
    });
    for (const opt of easingOptions) {
      this.kfEase.append(h("option", null, { value: opt.value, text: opt.label }));
    }
    this.kfDelete = h("button", "tl-btn tl-btn-sm", {
      title: "Delete keyframe (Del)",
    });
    this.kfDelete.append(icon("trash"));

    const t = h("span", "tl-insp-field");
    t.append(h("span", "tl-label-dim", { text: "f" }), this.kfTime);
    const v = h("span", "tl-insp-field");
    v.append(h("span", "tl-label-dim", { text: "v" }), this.kfValue);
    this.kfInspector.append(t, v, this.kfEase, this.kfDelete);

    this.kfTime.addEventListener("input", () =>
      this._editSelected({
        time: this.tl.frameToTime(parseInt(this.kfTime.value, 10)),
      }),
    );
    this.kfValue.addEventListener("input", () =>
      this._editSelected({ value: parseFloat(this.kfValue.value) }),
    );
    this.kfEase.addEventListener("change", () =>
      this._editSelected({ easing: this.kfEase.value as Easing }),
    );
    this.kfDelete.onclick = () => this._deleteSelected();
  }

  private _buildLabelInspector(): void {
    this.mkInspector = h("div", "tl-inspector");
    this.mkName = h("input", "tl-input tl-input-name", {
      type: "text",
      title: "Label name",
      placeholder: "label",
    });
    this.mkScript = h("input", "tl-input tl-input-script", {
      type: "text",
      title: "Frame script",
      placeholder: "script",
    });
    this.mkDelete = h("button", "tl-btn tl-btn-sm", { title: "Delete action" });
    this.mkDelete.append(icon("trash"));

    const nameField = h("span", "tl-insp-field");
    nameField.append(h("span", "tl-label-dim", { text: "L" }), this.mkName);
    const scriptField = h("span", "tl-insp-field");
    scriptField.append(h("span", "tl-label-dim", { text: "S" }), this.mkScript);
    this.mkInspector.append(nameField, scriptField, this.mkDelete);

    this.mkName.addEventListener("input", () =>
      this._editLabel({ name: this.mkName.value }),
    );
    this.mkScript.addEventListener("input", () =>
      this._editLabel({ script: this.mkScript.value }),
    );
    this.mkDelete.onclick = () => {
      if (!this.selectedLabel) return;
      this.tl.removeLabel(this.selectedLabel);
      this.selectedLabel = null;
      this._renderLabelsLane();
      this._renderLabelInspector();
      this._renderOverlays();
    };
  }

  // --- rendering ----------------------------------------------------------

  render(): void {
    if (!this.activeTrack || !this.tl.tracks.includes(this.activeTrack))
      this.activeTrack = this.tl.tracks[0] ?? null;
    this._renderSidebar();
    this._renderRuler();
    this._renderLanes();
    this._updatePlayhead();
    this._syncTransport();
    this._renderInspector();
    this._renderLabelInspector();
  }

  private _renderSidebar(): void {
    this.sidebar.innerHTML = "";

    if (this._actionsEnabled) {
      const labelRow = h("div", "tl-track-row tl-row-labels");
      labelRow.append(h("div", "tl-track-name", { text: "Actions" }));
      this.sidebar.append(labelRow);
    }

    for (const track of this.tl.tracks) {
      const row = h("div", "tl-track-row");
      row.classList.toggle("is-active", track === this.activeTrack);
      row.append(h("div", "tl-track-name", { text: track.label }));
      row.addEventListener("pointerdown", () => this._setActiveTrack(track));
      this.sidebar.append(row);
    }
  }

  private _renderRuler(): void {
    const width = this.contentWidth;
    this.ruler.style.width = `${width}px`;
    this.ruler.style.setProperty("--tl-ppf", `${this.pxPerFrame}px`);
    [...this.ruler.children].forEach((c) => {
      if (c !== this.rulerHead) c.remove();
    });

    const stepFrames = this._tickStepFrames();
    const lastFrame = Math.floor(width / this.pxPerFrame);
    for (let f = 0; f <= lastFrame; f += stepFrames) {
      const tick = h("div", "tl-tick", { text: `${f}` });
      tick.style.left = `${this.timeToX(this.tl.frameToTime(f))}px`;
      this.ruler.append(tick);
    }
  }

  private _tickStepFrames(): number {
    const targetFrames = 64 / this.pxPerFrame;
    const nice = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
    return nice.find((n) => n >= targetFrames) ?? 600;
  }

  private _renderLanes(): void {
    const width = this.contentWidth;
    this.lanesContent.style.width = `${width}px`;
    this.lanesContent.style.setProperty("--tl-ppf", `${this.pxPerFrame}px`);
    [...this.lanesContent.querySelectorAll(".tl-lane")].forEach((n) =>
      n.remove(),
    );

    if (this._actionsEnabled) {
      const labelsLane = h("div", "tl-lane tl-lane-labels");
      labelsLane.addEventListener("pointerdown", (e) =>
        this._onLabelsLaneScrub(e),
      );
      labelsLane.addEventListener("dblclick", (e) => {
        const time = this.tl.snapTime(this._laneTime(e.clientX));
        const l = this.tl.addLabel({ time });
        this._selectLabel(l.id);
      });
      this.lanesContent.insertBefore(labelsLane, this.playhead);
      this._labelsLane = labelsLane;
      this._renderLabelsLane();
    }

    for (const track of this.tl.tracks) {
      const lane = h("div", "tl-lane");
      const s = svg("svg", { width, height: LANE_H });
      lane.append(s);
      this.lanesContent.insertBefore(lane, this.playhead);
      lane.addEventListener("pointerdown", (e) => this._onLaneScrub(e, track));
      lane.addEventListener("dblclick", (e) => this._onLaneDblClick(e, track));

      this._laneRefs.set(track, { lane, svg: s });
      this._renderLaneGraph(track);
    }

    const laneCount = (this._actionsEnabled ? 1 : 0) + this.tl.tracks.length;
    this.playhead.style.height = `${laneCount * LANE_H}px`;
    this._renderOverlays();
  }

  /** Flash-style dope-sheet row for a single track. */
  private _renderLaneGraph(track: Track): void {
    const refs = this._laneRefs.get(track);
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
        this._onSegmentDrag(e as PointerEvent, track, seg),
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
        this._onSegmentResize(e as PointerEvent, track, i),
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
      this._onSpanResize(e as PointerEvent, track),
    );
    s.append(tail);
  }

  private _renderLabelsLane(): void {
    const lane = this._labelsLane;
    if (!lane) return;
    [...lane.querySelectorAll(".tl-marker, .tl-cell-hl")].forEach((n) =>
      n.remove(),
    );

    if (this.selectedLabelCell != null) {
      const hl = h("div", "tl-cell-hl");
      hl.style.left = `${this.selectedLabelCell * this.pxPerFrame}px`;
      hl.style.width = `${Math.max(this.pxPerFrame, 7)}px`;
      lane.append(hl);
    }

    for (const l of this.tl.labels) {
      const el = h("div", "tl-marker");
      el.classList.toggle("is-hold", !!l.hold);
      el.classList.toggle("is-selected", l.id === this.selectedLabel);
      el.style.left = `${this.frameCenterX(l.time)}px`;
      el.append(
        h("div", "tl-marker-line"),
        h("div", "tl-marker-flag", { text: l.name, title: l.name }),
      );
      el.addEventListener("pointerdown", (e) => this._onLabelDrag(e, l));
      el.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        this.tl.removeLabel(l.id);
        if (this.selectedLabel === l.id) this._selectLabel(null);
      });
      lane.append(el);
    }
  }

  /** Faint guide lines across the lanes for every label. */
  private _renderOverlays(): void {
    [...this.lanesContent.querySelectorAll(".tl-lane-marker")].forEach((n) =>
      n.remove(),
    );
    const laneCount = (this._actionsEnabled ? 1 : 0) + this.tl.tracks.length;
    const fullH = laneCount * LANE_H;
    for (const l of this.tl.labels) {
      const line = h("div", "tl-lane-marker");
      line.classList.toggle("is-hold", l.hold);
      line.style.left = `${this.frameCenterX(l.time)}px`;
      line.style.height = `${fullH}px`;
      this.lanesContent.insertBefore(line, this.playhead);
    }
  }

  private _onKeyframesChanged(track: Track): void {
    this._syncContentWidth();
    this._renderRuler();
    this._renderLaneGraph(track);
    this._renderOverlays();
    this._updatePlayhead();
  }

  private _syncContentWidth(): void {
    const width = this.contentWidth;
    this.lanesContent.style.width = `${width}px`;
    for (const refs of this._laneRefs.values())
      refs.svg.setAttribute("width", String(width));
  }

  // --- live updates -------------------------------------------------------

  private _updatePlayhead(): void {
    const x = this.frameCenterX(this.tl.currentTime);
    this.playhead.style.transform = `translateX(${x}px)`;
    this.rulerHead.style.transform = `translateX(${x}px)`;
    this.timeLabel.innerHTML = `<b>${this.tl.currentFrame}</b> <span class="tl-label-dim">/ ${this.tl.totalFrames} f · ${this.tl.fps}fps</span>`;
  }

  private _syncTransport(): void {
    setIcon(this.btnPlay, this.tl.isPlaying ? "pause" : "play");
    this.btnPlay.classList.toggle("is-active", this.tl.isPlaying);
    this.btnLoop.classList.toggle("is-active", this.tl.loop);
  }

  // --- active track + add helpers -----------------------------------------

  private _setActiveTrack(track: Track): void {
    if (this.activeTrack === track) return;
    this.activeTrack = track;
    this._renderSidebar();
  }

  private _addLabel(): void {
    const time = this.tl.snapTime(this.tl.currentTime);
    const l = this.tl.addLabel({ time });
    this._selectLabel(l.id);
  }

  private _addKeyframeToActive(): void {
    const track = this.activeTrack;
    if (!track) return;
    const f2t = (n: number): number => this.tl.frameToTime(n);
    const t2f = (t: number): number => this.tl.timeToFrame(t);
    const frame = t2f(this.tl.snapTime(this.tl.currentTime));

    const existing = track.keyframes.find((k) => t2f(k.time) === frame);
    if (existing) {
      this._setSelected({ track, id: existing.id });
      return;
    }

    const endF = t2f(track.endTime);

    if (frame > endF && track.keyframes.some((k) => t2f(k.time) < frame)) {
      track.setSpanEnd(f2t(frame - 1));
    }

    track.addKeyframe(frame, track.getCurrentValue());
    const added = track.keyframes.find((k) => t2f(k.time) === frame);
    if (added) this._setSelected({ track, id: added.id });
    this.tl.apply();
  }

  private _insertFrameInActive(): void {
    const track = this.activeTrack;
    if (!track || !track.hasKeyframes()) return;
    const f2t = (n: number): number => this.tl.frameToTime(n);
    const t2f = (t: number): number => this.tl.timeToFrame(t);
    const p = t2f(this.tl.snapTime(this.tl.currentTime));
    const endF = t2f(track.endTime);

    if (p > endF) {
      track.setSpanEnd(f2t(p));
      this._onKeyframesChanged(track);
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
    this._onKeyframesChanged(track);
    this.tl.apply();
  }

  // --- keyframe selection + inspector -------------------------------------

  private _setSelected(sel: KeyframeSelection | null): void {
    const prev = this.selected?.track;
    const segTracks = this.selectedSegments.map((s) => s.track);
    const cellTrack = this.selectedCell?.track;
    this.selected = sel;
    this.selectedSegments = [];
    this.selectedCell = null;
    if (sel) {
      this._blurInspectorInputs();
      this._clearLabelSelection();
      this._setActiveTrack(sel.track);
    }
    for (const t of [...segTracks, cellTrack])
      if (t && t !== prev && t !== sel?.track) this._renderLaneGraph(t);
    if (prev && prev !== sel?.track) this._renderLaneGraph(prev);
    if (sel?.track) this._renderLaneGraph(sel.track);
    this._renderInspector();
    this._renderLabelInspector();
  }

  private _blurInspectorInputs(): void {
    const el = document.activeElement;
    if (el instanceof HTMLElement && this.kfInspector.contains(el)) el.blur();
  }

  private _renderInspector(): void {
    const sel = this.selected;
    const kf = sel ? sel.track.getKeyframe(sel.id) : null;
    if (!kf) {
      this.kfInspector.classList.remove("is-visible");
      return;
    }
    this.kfInspector.classList.add("is-visible");
    if (document.activeElement !== this.kfTime)
      this.kfTime.value = String(this.tl.timeToFrame(kf.time));
    if (document.activeElement !== this.kfValue)
      this.kfValue.value = String(+kf.value.toFixed(4));
    if (document.activeElement !== this.kfEase) this.kfEase.value = kf.easing;
  }

  private _editSelected(patch: {
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
    this._renderLaneGraph(track);
    this._renderInspector();
    this.tl.apply();
  }

  private _deleteSelected(): void {
    if (!this.selected) return;
    const { track, id } = this.selected;
    track.removeKeyframe(id);
    this._setSelected(null);
    this._renderLaneGraph(track);
    this.tl.apply();
  }

  private _deleteSelectedSegments(): void {
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
      this._onKeyframesChanged(track);
    }
    this.selectedSegments = [];
    this.tl.apply();
  }

  // --- empty-frame (cell) selection ---------------------------------------

  private _setSelectedCell(track: Track, frame: number): void {
    const prev = this.selectedCell?.track;
    this.selectedCell = { track, frame };
    this.selected = null;
    this._clearLabelSelection();
    const segTracks = this.selectedSegments.map((s) => s.track);
    this.selectedSegments = [];
    for (const t of new Set([prev, track, ...segTracks]))
      if (t) this._renderLaneGraph(t);
    this._renderInspector();
    this._renderLabelInspector();
  }

  // --- label selection + inspector ----------------------------------------

  private _clearLabelSelection(): void {
    if (this.selectedLabel == null && this.selectedLabelCell == null) return;
    this.selectedLabel = null;
    this.selectedLabelCell = null;
    this._renderLabelsLane();
  }

  private _selectLabel(id: string | null): void {
    this.selectedLabel = id;
    if (id) {
      const l = this.tl.getLabel(id);
      this.selectedLabelCell = l ? this.tl.timeToFrame(l.time) : null;
      this.selected = null;
      this.selectedCell = null;
      const segTracks = this.selectedSegments.map((s) => s.track);
      this.selectedSegments = [];
      for (const t of segTracks) this._renderLaneGraph(t);
    } else {
      this.selectedLabelCell = null;
    }
    this._renderLabelsLane();
    this._renderInspector();
    this._renderLabelInspector();
    this._renderOverlays();
  }

  private _renderLabelInspector(): void {
    const l = this.selectedLabel ? this.tl.getLabel(this.selectedLabel) : null;
    if (!l) {
      this.mkInspector.classList.remove("is-visible");
      return;
    }
    this.mkInspector.classList.add("is-visible");
    if (document.activeElement !== this.mkName) this.mkName.value = l.name;
    if (document.activeElement !== this.mkScript)
      this.mkScript.value = l.script ?? "";
  }

  private _editLabel(patch: {
    name?: string;
    script?: string;
    time?: number;
    hold?: boolean;
  }): void {
    if (!this.selectedLabel) return;
    this.tl.updateLabel(this.selectedLabel, patch);
  }

  // --- interactions -------------------------------------------------------

  private _attachScrub(el: HTMLElement): void {
    const seekFromEvent = (e: PointerEvent): void =>
      this.tl.seek(this.tl.snapTime(this._rulerTime(e.clientX)));
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

  private _onLaneScrub(e: PointerEvent, track: Track): void {
    const target = e.target as Element | null;
    if (target?.classList?.contains("tl-block")) return;
    this._setActiveTrack(track);
    this.tl.pause();
    const seek = (clientX: number): void => {
      const frame = clamp(
        Math.floor(this._laneFrame(clientX)),
        0,
        this._visibleLastFrame(),
      );
      this.tl.seek(this.tl.frameToTime(frame));
      this._setSelectedCell(track, frame);
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

  private _onLabelsLaneScrub(e: PointerEvent): void {
    this.tl.pause();
    const seek = (clientX: number): void => {
      const frame = clamp(
        Math.floor(this._laneFrame(clientX)),
        0,
        this._visibleLastFrame(),
      );
      this.tl.seek(this.tl.frameToTime(frame));
      this._setSelectedLabelCell(frame);
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

  private _setSelectedLabelCell(frame: number): void {
    this.selectedLabelCell = frame;
    const existing = this.tl.labels.find(
      (l) => this.tl.timeToFrame(l.time) === frame,
    );
    this.selectedLabel = existing ? existing.id : null;

    this.selected = null;
    this.selectedCell = null;
    const segTracks = this.selectedSegments.map((s) => s.track);
    this.selectedSegments = [];
    for (const t of new Set(segTracks)) this._renderLaneGraph(t);

    this._renderLabelsLane();
    this._renderInspector();
    this._renderLabelInspector();
  }

  private _onLabelDrag(e: PointerEvent, label: Label): void {
    e.stopPropagation();
    this._selectLabel(label.id);
    this.tl.seek(label.time);
    this.tl.pause();
    const move = (ev: PointerEvent): void => {
      const time = this.tl.snapTime(this._laneTime(ev.clientX));
      this.tl.updateLabel(label.id, { time });
      this.selectedLabelCell = this.tl.timeToFrame(time);
    };
    const up = (): void => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  }

  private _onSegmentResize(e: PointerEvent, track: Track, index: number): void {
    e.stopPropagation();
    e.preventDefault();
    this.tl.pause();
    const fps = this.tl.fps;
    const maxFrame = this._visibleLastFrame();
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
      const boundary = clamp(Math.round(this._laneFrame(clientX)), 0, maxFrame);
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

  private _onSpanResize(e: PointerEvent, track: Track): void {
    e.stopPropagation();
    e.preventDefault();
    this.tl.pause();
    const apply = (clientX: number): void => {
      const frame = clamp(
        Math.round(this._laneFrame(clientX)) - 1,
        0,
        this._visibleLastFrame(),
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

  private _onLaneDblClick(e: MouseEvent, track: Track): void {
    const frame = this.tl.timeToFrame(
      this.tl.snapTime(this._laneTime(e.clientX)),
    );
    const existing = track.keyframes.find(
      (k) => this.tl.timeToFrame(k.time) === frame,
    );
    if (existing) {
      this._setSelected({ track, id: existing.id });
      return;
    }
    track.addKeyframe(frame, track.getCurrentValue());
    const added = track.keyframes.find(
      (k) => this.tl.timeToFrame(k.time) === frame,
    );
    if (added) this._setSelected({ track, id: added.id });
    this.tl.apply();
  }

  private _isSegmentSelected(track: Track, index: number): boolean {
    return this.selectedSegments.some(
      (s) => s.track === track && s.index === index,
    );
  }

  private _selectSegment(track: Track, index: number, additive: boolean): void {
    const member = this._isSegmentSelected(track, index);
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
    this._clearLabelSelection();
    this.selectedCell = null;
    this._setActiveTrack(track);
    for (const t of this.tl.tracks) this._renderLaneGraph(t);
    this._blurInspectorInputs();
    this._renderInspector();
    this._renderLabelInspector();
  }

  private _onSegmentDrag(e: PointerEvent, track: Track, index: number): void {
    e.stopPropagation();
    e.preventDefault();
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    const clickedFrame = clamp(
      Math.floor(this._laneFrame(e.clientX)),
      0,
      this._visibleLastFrame(),
    );
    this._selectSegment(track, index, additive);
    this.tl.pause();

    this.tl.seek(this.tl.frameToTime(clickedFrame));

    const fps = this.tl.fps;
    const visibleLast = this._visibleLastFrame();

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

    const startFrame = Math.round(this._laneFrame(e.clientX));
    let moved = false;
    const move = (ev: PointerEvent): void => {
      if (!moved && Math.abs(ev.clientX - e.clientX) > 3) moved = true;
      if (!moved) return;
      let d = Math.round(this._laneFrame(ev.clientX)) - startFrame;
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

  private _onKeyDown = (e: KeyboardEvent): void => {
    const typing =
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLSelectElement ||
      e.target instanceof HTMLTextAreaElement;
    if ((e.key === "Delete" || e.key === "Backspace") && !typing) {
      if (this.selectedSegments.length) this._deleteSelectedSegments();
      else if (this.selected) this._deleteSelected();
      else if (this.selectedLabel) {
        this.tl.removeLabel(this.selectedLabel);
        this._selectLabel(null);
      }
      e.preventDefault();
    } else if (e.code === "Space" && !typing && e.target === document.body) {
      this.tl.toggle();
      e.preventDefault();
    }
  };

  // --- collapse -----------------------------------------------------------

  private _toggleCollapsed(force?: boolean): void {
    this.collapsed = force ?? !this.collapsed;
    this.root.classList.toggle("is-collapsed", this.collapsed);
    setIcon(this.btnCollapse, this.collapsed ? "chevronUp" : "chevronDown");
    this.btnCollapse.title = this.collapsed ? "Show tracks" : "Hide tracks";
  }
}
