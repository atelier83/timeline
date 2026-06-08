# @atelier83/timeline

> Headless, framework-agnostic animation timeline for the web — keyframes, easing, labels, and playback, with an optional Flash-style dope-sheet UI.

[![npm](https://img.shields.io/npm/v/@atelier83/timeline.svg)](https://www.npmjs.com/package/@atelier83/timeline)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@atelier83/timeline.svg)](https://bundlephobia.com/package/@atelier83/timeline)
[![CI](https://github.com/atelier83/timeline/actions/workflows/ci.yml/badge.svg)](https://github.com/atelier83/timeline/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@atelier83/timeline.svg)](./LICENSE)

The kind of timeline you get in Flash/Animate or a motion tool. You bind numeric properties of any object to keyframes; the engine evaluates them over time, writes the values back, and drives its own playback. The core renders nothing — it's a small state machine you can wrap in any framework. When you want to author by hand, opt into the bundled dope-sheet UI: a bottom-of-screen panel with lanes, draggable keyframes, easing per segment, scrubbing, and labels.

## Features

- **Headless core** — vanilla TypeScript. No DOM, no rendering, no dependencies.
- **Keyframes + easing** — per-segment curves (linear, quad, cubic) or stepped holds.
- **Frame-accurate** — author in frames at any fps; the engine keeps time in seconds.
- **Auto-fitting length** — the duration grows and shrinks to the furthest content.
- **Labels & holds** — named markers; a `hold` marker stops playback like a Flash frame action.
- **Self-driving playback** — play/pause/loop, forward/backward, `gotoAndPlay`/`gotoAndStop`.
- **Optional dope-sheet UI** — a self-contained, themeable panel you can drop in.
- **Optional React bindings** — a thin `useTimeline` hook and `<TimelineDock>`.

## Contents

- [Install](#install)
- [Why headless?](#why-headless)
- [Concepts](#concepts)
- [Quick start](#quick-start)
- [The dope-sheet UI](#the-dope-sheet-ui)
- [React](#react)
- [Easing](#easing)
- [Labels & holds](#labels--holds)
- [Styling](#styling)
- [API reference](#api-reference)
- [When not to use this](#when-not-to-use-this)
- [Development](#development)
- [License](#license)

## Install

```bash
npm install @atelier83/timeline
# or: pnpm add @atelier83/timeline
```

`react` and `react-dom` (>=18) are optional peer dependencies, only needed if you use `@atelier83/timeline/react`.

## Why headless?

A timeline is really two things: a small engine that maps time to values, and a UI for editing it. They usually ship welded together, so the editor is the thing you fight when it doesn't fit your tool. `timeline` splits them. The core (`Timeline`, `Track`) is pure logic — no DOM, no styling, no framework — so you can run it in a game loop, a worker, an SSR build, or behind your own UI. The dope-sheet UI is a separate, optional layer that talks to the same engine through plain events.

## Concepts

- **Timeline**: owns the tracks, the playhead, playback, and labels. Time is in seconds; you author in frames.
- **Track**: binds one numeric property of a target object to a list of keyframes. `evaluate(time)` returns the interpolated value; `apply(time)` writes it back.
- **Keyframe**: `{ time, value, easing }`. The `easing` is applied to the segment _leaving_ the keyframe; `"none"` means a stepped hold.
- **Label**: a named marker at a time. A `hold` label is a playback stop point.

## Quick start

```ts
import { Timeline } from "@atelier83/timeline";

const state = { x: 0, opacity: 1 };

const tl = new Timeline({ fps: 30, loop: true });

tl.add(state, "x", { min: 0, max: 100 })
  .addKeyframe(0, 0, "easeInOutCubic")
  .addKeyframe(30, 100, "easeInOutCubic")
  .addKeyframe(60, 0);

tl.add(state, "opacity", { min: 0, max: 1 })
  .addKeyframe(0, 1)
  .addKeyframe(60, 0, "linear");

tl.on("update", () => {
  // state.x / state.opacity now hold the values for the current frame
  render(state);
});

tl.play();
```

The timeline runs its own `requestAnimationFrame` loop while playing, so it works standalone in any page. Don't have a render hook? Read values off your target object whenever you like, or call `tl.seek(time)` to jump and evaluate without playing.

## The dope-sheet UI

Pull in the UI when you want to author keyframes by hand. `createTimeline` builds a `Timeline`, mounts a bottom-of-screen panel, and returns the timeline (with a `.ui` handle):

```ts
import { createTimeline } from "@atelier83/timeline/ui";

const tl = createTimeline({ fps: 30, loop: true });

tl.add(settings, "rotation", { min: -180, max: 180 })
  .addKeyframe(0, 0, "easeInOutCubic")
  .addKeyframe(30, 180, "easeInOutCubic");
```

The panel is a Flash-style dope sheet:

- One **lane per track**; the sidebar lists the track labels (click to make a track active).
- **Keyframes** are dots; the **segment** between two is drawn as a block — lighter for a tween, darker for a stepped hold.
- The **Insert keyframe** button drops a key at the playhead on the active track using the property's current value; **Insert frame** extends the held tail.
- Select a keyframe to edit its **frame / value / easing** in the inline inspector, or drag segments to retime them; drag a segment's right edge to change its duration (later keys ripple along).
- **Scrub** by dragging the ruler; **Space** toggles playback; **Delete** removes the selection.

You can also drive the engine and the UI yourself:

```ts
import { Timeline } from "@atelier83/timeline";
import { TimelineUI } from "@atelier83/timeline/ui";

const tl = new Timeline({ fps: 24 });
const ui = new TimelineUI(tl, { pixelsPerFrame: 14 });
ui.mount(document.getElementById("editor")!); // defaults to document.body
```

## React

```tsx
import { useEffect } from "react";
import { useTimeline } from "@atelier83/timeline/react";

function Scene({ state }: { state: { x: number } }) {
  const tl = useTimeline({ fps: 30, loop: true });

  useEffect(() => {
    const track = tl.add(state, "x", { min: 0, max: 100 });
    track.addKeyframe(0, 0).addKeyframe(30, 100, "easeInOutCubic");
    return () => tl.remove(track);
  }, [tl]);

  // ...
}
```

`useTimeline` returns a timeline that's stable across renders and mounts the dope-sheet UI by default (pass `ui: false` to skip it). For a declarative entry point, `<TimelineDock onReady={(tl) => …} />` creates the timeline, mounts the UI, and hands you the instance once.

## Easing

Each keyframe carries the easing for its _outgoing_ segment. Built-ins: `linear`, `easeInQuad`, `easeOutQuad`, `easeInOutQuad`, `easeInCubic`, `easeOutCubic`, `easeInOutCubic`, and the special `"none"` (a stepped hold — the value stays put until the next keyframe).

```ts
import { easings, interpolate, easingOptions } from "@atelier83/timeline";

interpolate(0, 100, 0.5, "easeInOutCubic"); // -> 50
easings.easeInQuad(0.5); // -> 0.25 (raw t-mapping)
easingOptions; // [{ value, label }] for building a <select>
```

## Labels & holds

Labels are named markers. A `hold` label is a stop point: playback pauses when it crosses one, emitting `"hold"`. Combined with `gotoAndPlay`, this is the bridge between scripted and interactive sequences (a "play to the next beat, then wait" model).

```ts
tl.addLabel({ time: 1, name: "intro-end", hold: true });
tl.gotoAndPlay("intro-end"); // resolve a label name (or a frame number) then play
```

## Styling

The dope-sheet UI ships a self-contained dark theme that it injects on mount — no CSS import required. Everything is namespaced under `.tl-*` and driven by CSS variables, so you reskin by overriding tokens on the root:

```css
.tl-root {
  --tl-bg: #1b1b1f;
  --tl-accent: #7dd3fc;
  --tl-tween: #93c5fd;
  --tl-kf: #0b0b0c;
}
```

Prefer to manage the stylesheet yourself? Import it and skip the injected copy:

```ts
import "@atelier83/timeline/theme.css";
```

Key tokens: `--tl-bg`, `--tl-surface`, `--tl-line`, `--tl-text`, `--tl-text-dim`, `--tl-accent`, `--tl-btn`, `--tl-btn-hover`, `--tl-hold`, `--tl-tween`, `--tl-seg-sel`, `--tl-kf`, `--tl-sidebar-w`, `--tl-ruler-h`, `--tl-lane-h`, `--tl-radius`.

## API reference

### `new Timeline(options?)`

`options`: `{ fps?, loop?, speed?, minFrames?, onUpdate? }`.

| member                          | description                                                          |
| ------------------------------- | -------------------------------------------------------------------- |
| `add(target, prop, options?)`   | bind a numeric property; returns the `Track`                         |
| `remove(track)`                 | detach a track                                                       |
| `seek(time)`                    | move the playhead (seconds), evaluate, and emit `seek`/`update`      |
| `play(dir?)` / `playForward()` / `playBackward()` | start the rAF playback loop                       |
| `pause()` / `stop()` / `toggle()` | stop (and, for `stop`, rewind to 0)                                |
| `gotoAndPlay(target, dir?)`     | jump to a frame number or label name, then play (chainable)          |
| `gotoAndStop(target)`           | jump to a frame number or label name and pause (chainable)           |
| `addLabel(opts?)` / `updateLabel(id, patch)` / `removeLabel(id)` | manage labels                       |
| `getLabel(id)` / `findLabelByName(name)` | look labels up                                              |
| `apply()`                       | re-evaluate every track at the current time and emit `update`        |
| `frameToTime` / `timeToFrame` / `snapTime` | frame ↔ second helpers                                     |
| `on(event, fn)` / `off(event, fn)` | subscribe to events; `on` returns an unsubscribe function         |
| `dispose()`                     | pause and clear tracks, labels, and listeners                        |

Properties: `fps`, `loop`, `speed`, `tracks`, `labels`, `currentTime`, `currentFrame`, `isPlaying`, `direction`, `duration`, `totalFrames`.

Events: `update` (time), `change`, `keyframes` (track), `labels`, `play` (direction), `pause`, `stop`, `seek` (time), `hold` (label).

### `Track`

| member                              | description                                                  |
| ----------------------------------- | ------------------------------------------------------------ |
| `addKeyframe(frame, value, easing?)`| add a keyframe (chainable); value is clamped to `min`/`max`  |
| `moveKeyframe(id, patch)`           | retime / revalue / re-ease a keyframe                        |
| `removeKeyframe(id)` / `getKeyframe(id)` | edit and read keyframes                                  |
| `setSpanEnd(time)`                  | extend a held tail past the last keyframe                    |
| `evaluate(time)`                    | the value at `time` (or `undefined` when unkeyed)            |
| `apply(time)`                       | evaluate and write into the target                           |
| `getCurrentValue()`                 | the target's live value                                      |
| `endTime` / `range` / `hasKeyframes()` | derived state                                             |

### UI (`@atelier83/timeline/ui`)

| export                          | description                                                  |
| ------------------------------- | ------------------------------------------------------------ |
| `createTimeline(options?)`      | build a timeline + dope-sheet UI and mount it (returns the timeline with a `.ui` handle) |
| `TimelineUI`                    | the dope-sheet view; `new TimelineUI(timeline, options?)`, then `mount(parent?)` / `dispose()` |
| `injectStyles(doc?)` / `CSS`    | inject (or read) the bundled stylesheet                      |

`createTimeline`/`TimelineUI` options: `pixelsPerFrame`, `collapsed` (and, for `createTimeline`, `autoMount` and `parent` plus all `Timeline` options).

### React (`@atelier83/timeline/react`)

| export             | description                                                   |
| ------------------ | ------------------------------------------------------------- |
| `useTimeline(options?)` | create a render-stable timeline; mounts the UI unless `ui: false` |
| `<TimelineDock>`   | headless component that creates the timeline and calls `onReady(timeline)` |

## When not to use this

`timeline` is a small, unopinionated engine. Reach for something else if you need:

- a general-purpose tweening/animation library for one-off transitions — [GSAP](https://gsap.com/) or [motion](https://motion.dev/) fit better;
- a full NLE / video editor timeline with clips, tracks of media, and trimming;
- spring physics rather than keyframed curves — try [react-spring](https://www.react-spring.dev/).

It's a good fit when you want frame-based keyframe authoring, a vanilla core you can wrap in any framework, and an optional editor you fully control the look of.

## Development

```bash
pnpm install
pnpm dev          # live playground (a WebGL scene driven by the timeline) at http://localhost:5173
pnpm test         # run the test suite once
pnpm test:watch   # watch mode
pnpm check-types  # type-check without emitting
pnpm build        # build the library to dist/
pnpm build:demo   # bundle the playground into demo-dist/ for hosting
```

The `playground/` page imports the library source directly and animates a small three.js scene by keyframing the same settings its dat.gui exposes. `pnpm build:demo` bundles it into `demo-dist/`, which you can deploy to any static host.

## License

[MIT](./LICENSE) © atelier83
