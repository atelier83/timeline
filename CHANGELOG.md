# @atelier83/timeline

## 0.1.0

### Minor Changes

- Initial release of `@atelier83/timeline`.
- Headless animation timeline engine — vanilla TypeScript, zero runtime dependencies, DOM-free core.
- Keyframe-based tracks: bind any numeric property on any object with `timeline.add(target, "prop", { min, max })`.
- Built-in easing curves: `linear`, `easeInQuad`, `easeOutQuad`, `easeInOutQuad`, `easeInCubic`, `easeOutCubic`, `easeInOutCubic`, and stepped `none` (hold).
- Playback: `play()`, `pause()`, `stop()`, `seek(time)`, `toggle()`, `loop`, `speed`.
- Self-driving by default (`autoUpdate: true`) — runs its own `requestAnimationFrame` loop. Set `autoUpdate: false` and call `timeline.update(dt?)` to drive playback from your own loop.
- Event emitter: `on(event, fn)` returns an unsubscribe function. Events: `update`, `change`, `keyframes`, `play`, `pause`, `stop`, `seek`.
- Optional Flash-style dope-sheet UI (`@atelier83/timeline/ui`): fixed bottom panel with transport bar, ruler, track lanes, keyframe inspector, collapse/expand.
- Optional React bindings (`@atelier83/timeline/react`): `useTimeline`, `TimelineDock`.
- Shared `--a83-*` CSS design tokens — themes together with `@atelier83/layouts` from one palette.
- Auto-scroll: lanes viewport follows the playhead during playback.
