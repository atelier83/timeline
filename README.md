# @atelier83/timeline

> Headless, framework-agnostic animation timeline for the web — keyframes, easing, and playback, with an optional Flash-style dope-sheet UI.

[![npm](https://img.shields.io/npm/v/@atelier83/timeline.svg)](https://www.npmjs.com/package/@atelier83/timeline)
[![npm unpacked size](https://img.shields.io/npm/unpacked-size/@atelier83/timeline)](https://socket.dev/npm/package/@atelier83/timeline/overview/0.2.0)
[![CI](https://github.com/atelier83/timeline/actions/workflows/ci.yml/badge.svg)](https://github.com/atelier83/timeline/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@atelier83/timeline.svg)](./LICENSE)

The kind of timeline you get in Flash/Animate or a motion tool. You bind numeric properties of any object to keyframes; the engine evaluates them over time, writes the values back, and drives its own playback. The core renders nothing — it's a small state machine you can wrap in any framework. When you want to author by hand, opt into the bundled dope-sheet UI: a bottom-of-screen panel with lanes, draggable keyframes, easing per segment, scrubbing, and labels.

## Features

- **Headless core** — vanilla TypeScript. No DOM, no rendering, no dependencies.
- **Keyframes + easing** — per-segment curves (linear, quad, cubic) or stepped holds.
- **Frame-accurate** — author in frames at any fps; the engine keeps time in seconds.
- **Auto-fitting length** — the duration grows and shrinks to the furthest content.
- **Self-driving or app-driven** — plays on its own rAF loop, or hand it your loop with `update(dt)`.
- **Optional dope-sheet UI** — a token-themed panel you can drop in.
- **Optional React bindings** — a thin `useTimeline` hook and `<TimelineDock>`.

## Contents

- [Install](#install)
- [Why headless?](#why-headless)
- [Concepts](#concepts)
- [Quick start](#quick-start)
- [Driving playback](#driving-playback)
- [The dope-sheet UI](#the-dope-sheet-ui)
- [React](#react)
- [Easing](#easing)
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

- **Timeline**: owns the tracks, the playhead, and playback. Time is in seconds; you author in frames.
- **Track**: binds one numeric property of a target object to a list of keyframes. `evaluate(time)` returns the interpolated value; `apply(time)` writes it back.
- **Keyframe**: `{ time, value, easing }`. The `easing` is applied to the segment _leaving_ the keyframe; `"none"` means a stepped hold.

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

## Driving playback

Like `dat.gui`/`lil-gui`, a `Timeline` mutates the properties of a plain object — `tl.add(target, "prop", { min, max })` binds one numeric field, and every frame the engine writes the interpolated value back into `target`. How that frame is pumped is up to you:

**Self-driving (default).** Call `play()` and the timeline runs its own `requestAnimationFrame` loop, mutating the target until you `pause()`/`stop()` — nothing else required:

```ts
const tl = new Timeline({ loop: true });
tl.add(state, "x", { min: 0, max: 100 }).addKeyframe(0, 0).addKeyframe(60, 100);
tl.play(); // self-driven; state.x updates on its own
```

**App-driven.** When you already own a render loop (a game loop, a WebGL/Three.js `requestAnimationFrame`, a worker tick), construct with `autoUpdate: false`. Now `play()` only flips the playing flag and you advance the playhead by calling `update()` once per frame:

```ts
const tl = new Timeline({ loop: true, autoUpdate: false });
tl.add(state, "x", { min: 0, max: 100 }).addKeyframe(0, 0).addKeyframe(60, 100);

function frame() {
  tl.update(); // advances while playing, no-op while paused
  renderMyScene(state); // state.x is up to date for this frame
  requestAnimationFrame(frame);
}

tl.play();
requestAnimationFrame(frame);
```

`update()` derives the delta from its own clock, so a bare call works in any loop. If you already track a per-frame delta, pass it explicitly — `update(dtSeconds)` — to stay perfectly in sync with the rest of your loop (and to honour the loop's own pause/slow-mo). `update()` is a no-op while paused, so it's safe to call unconditionally.

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

## Styling

The dope-sheet UI injects its structural rules on mount, but it carries **no colours of its own** — every value is read from a shared `@atelier83` design token (`--a83-*`). A theme defines those tokens; the library only consumes them. You have two ways to provide one.

### Option 1: the bundled dark theme

Load the default palette — a flat, dark grey look:

```ts
import "@atelier83/timeline/theme.css";
```

Without it (and without app-defined tokens), the `--a83-*` tokens are undefined and the panel renders unstyled.

### Option 2: define the tokens yourself

`@atelier83/timeline` and [`@atelier83/layouts`](https://www.npmjs.com/package/@atelier83/layouts) read the **same** `--a83-*` tokens, so defining them once themes both packages together — they share one palette by design. Skip the bundled CSS and set the tokens on `:root` (or any ancestor):

```css
:root {
  --a83-surface: #323232; /* panels / toolbars / lanes */
  --a83-text: #c8c8c8;
  --a83-text-muted: #8c8c8c;
  --a83-border: #212121;
  --a83-accent: #e6e6e6; /* playhead, focus */
  /* …the rest of the palette */
}
```

Tokens: `--a83-bg`, `--a83-surface`, `--a83-border`, `--a83-border-strong`, `--a83-text`, `--a83-text-muted`, `--a83-accent`, `--a83-control`, `--a83-control-hover`, `--a83-hover`, `--a83-active`, `--a83-overlay`, `--a83-highlight`, `--a83-font`, `--a83-radius-sm`, `--a83-radius-md`, `--a83-radius-lg`. This is the exact same set `@atelier83/layouts` uses — there are no timeline-specific variables; the dope-sheet spans and keyframe markers are derived from `--a83-text`, `--a83-accent`, and `--a83-bg` (the lane canvas).

There are no fallbacks and no built-in light/dark switching: the library always reads `var(--a83-*)`, and the theme decides what those resolve to. **Light/dark/system is your app's job** — redefine the tokens under your own `prefers-color-scheme` media query or `[data-theme]` rules. See [`theme.css`](./src/theme.css) for the full default set.

## API reference

### `new Timeline(options?)`

`options`: `{ fps?, loop?, speed?, minFrames?, autoUpdate?, onUpdate? }`. Set `autoUpdate: false` to drive playback from your own loop via `update(dt)` (see [Driving playback](#driving-playback)).

| member                                     | description                                                                               |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `add(target, prop, options?)`              | bind a numeric property; returns the `Track`                                              |
| `remove(track)`                            | detach a track                                                                            |
| `seek(time)`                               | move the playhead (seconds), evaluate, and emit `seek`/`update`                           |
| `play(dir?)`                               | begin playback (`+1` forward, `-1` backward); runs an rAF loop unless `autoUpdate: false` |
| `pause()` / `stop()` / `toggle()`          | stop (and, for `stop`, rewind to 0)                                                       |
| `update(dt?)`                              | advance playback by `dt` seconds (or an auto-derived delta); for app-driven loops         |
| `apply()`                                  | re-evaluate every track at the current time and emit `update`                             |
| `frameToTime` / `timeToFrame` / `snapTime` | frame ↔ second helpers                                                                    |
| `on(event, fn)` / `off(event, fn)`         | subscribe to events; `on` returns an unsubscribe function                                 |
| `dispose()`                                | pause and clear tracks and listeners                                                      |

Properties: `fps`, `loop`, `speed`, `autoUpdate`, `tracks`, `currentTime`, `currentFrame`, `isPlaying`, `direction`, `duration`, `totalFrames`.

Events: `update` (time), `change`, `keyframes` (track), `play` (direction), `pause`, `stop`, `seek` (time).

### `Track`

| member                                   | description                                                 |
| ---------------------------------------- | ----------------------------------------------------------- |
| `addKeyframe(frame, value, easing?)`     | add a keyframe (chainable); value is clamped to `min`/`max` |
| `moveKeyframe(id, patch)`                | retime / revalue / re-ease a keyframe                       |
| `removeKeyframe(id)` / `getKeyframe(id)` | edit and read keyframes                                     |
| `setSpanEnd(time)`                       | extend a held tail past the last keyframe                   |
| `evaluate(time)`                         | the value at `time` (or `undefined` when unkeyed)           |
| `apply(time)`                            | evaluate and write into the target                          |
| `getCurrentValue()`                      | the target's live value                                     |
| `endTime` / `hasKeyframes()`             | derived state                                               |
| `lastKeyframe`                           | the most recently added keyframe (or `null`)                |

### UI (`@atelier83/timeline/ui`)

| export                       | description                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| `createTimeline(options?)`   | build a timeline + dope-sheet UI and mount it (returns the timeline with a `.ui` handle)       |
| `TimelineUI`                 | the dope-sheet view; `new TimelineUI(timeline, options?)`, then `mount(parent?)` / `dispose()` |
| `injectStyles(doc?)` / `CSS` | inject (or read) the bundled stylesheet                                                        |

`createTimeline`/`TimelineUI` options: `pixelsPerFrame`, `collapsed` (and, for `createTimeline`, `autoMount` and `parent` plus all `Timeline` options).

### React (`@atelier83/timeline/react`)

| export                  | description                                                                |
| ----------------------- | -------------------------------------------------------------------------- |
| `useTimeline(options?)` | create a render-stable timeline; mounts the UI unless `ui: false`          |
| `<TimelineDock>`        | headless component that creates the timeline and calls `onReady(timeline)` |

## When not to use this

`timeline` is a small, unopinionated engine. Reach for something else if you need:

- a general-purpose tweening/animation library for one-off transitions — [GSAP](https://gsap.com/) or [motion](https://motion.dev/) fit better;
- a full NLE / video editor timeline with clips, tracks of media, and trimming;
- spring physics rather than keyframed curves — try [react-spring](https://www.react-spring.dev/).

It's a good fit when you want frame-based keyframe authoring, a vanilla core you can wrap in any framework, and an optional editor you fully control the look of.

## Development

```bash
pnpm install
pnpm dev          # live playground (DOM boxes driven by the timeline) at http://localhost:5173
pnpm test         # run the test suite once
pnpm test:watch   # watch mode
pnpm check-types  # type-check without emitting
pnpm build        # build the library to dist/
pnpm build:demo   # bundle the playground into demo-dist/ for hosting
```

The `playground/` page imports the library source directly and animates a row of plain DOM boxes by keyframing their CSS transforms. `pnpm build:demo` bundles it into `demo-dist/`, which you can deploy to any static host.

## License

[MIT](./LICENSE) © atelier83
