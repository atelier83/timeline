# Roadmap

Planned additions to `@atelier83/timeline`. The core is intentionally minimal
(keyframes, easing, playback); everything here is opt-in scope to layer on top
without bloating that core.

Status: `[ ]` planned · `[~]` in progress · `[x]` done

## Labels & markers

- [ ] **Labels** — named markers at a frame on the timeline.
  - `addLabel({ time, name })`, `getLabel(id)`, `updateLabel(id, patch)`,
    `removeLabel(id)`, `findLabelByName(name)`.
  - `labels` event so the UI can re-render.
  - `duration` should grow to include the furthest label.
  - _Previously implemented; removed in the simplification pass. Re-add as an
    opt-in module rather than baking it back into the core `Timeline`._
- [ ] **Hold labels** — a label flagged `hold` acts as a playback stop point;
      playback pauses when the playhead crosses it and emits `hold`.
- [ ] **UI: labels lane** — a dedicated lane at the top of the dope sheet with
      draggable markers, a selected-cell highlight, and guide lines across the
      track lanes. (The old `_actionsEnabled` scaffolding is the reference.)

## Scripts / frame actions

- [ ] **Scripts** — attach an arbitrary string (or callback) to a label, à la
      Flash frame actions. Carried as `script` on the label.
- [ ] **Script execution** — decide the model: emit an event with the script
      payload vs. run a registered callback. Keep `eval` out of the core.
- [ ] **UI: script inspector** — edit a label's name + script inline.

## Playback helpers (Flash-style)

- [ ] **`gotoAndStop(target)`** — jump to a frame number or label name, pause.
- [ ] **`gotoAndPlay(target, dir?)`** — jump to a frame number or label name,
      then play. Needs a `_resolveTime(number | string)` helper.
- [ ] **`playForward()` / `playBackward()`** — thin sugar over `play(±1)`
      (low priority; `play(-1)` already exists).

## Engine

- [ ] **Per-track enable/mute** — skip evaluation/writing for a disabled track.
- [ ] **Playback rate per track** or global ease-curve on `speed`.
- [ ] **Relative keyframes** — values as deltas from the track's start value.
- [ ] **Serialization** — `toJSON()` / `fromJSON()` for tracks + keyframes so
      timelines can be saved and reloaded.
- [ ] **Non-numeric tracks** — colors / strings via pluggable interpolators
      (currently only `AnimatableTarget = Record<string, number>`).

## UI / authoring

- [ ] **Copy / paste keyframes** and segments.
- [ ] **Undo / redo** for keyframe edits.
- [ ] **Box-select** multiple keyframes across tracks.
- [ ] **Snap toggle** (snap-to-frame on/off while dragging).
- [ ] **Curve editor** — bezier handles per segment instead of named presets.

## Tooling / docs

- [ ] **ESLint + Prettier** — add `eslint` + `typescript-eslint` (strict +
      stylistic) and `prettier`, a `lint` script, and a lint step in
      `ci.yml` (CI currently runs only `check-types` + `test`). Enable the
      `@typescript-eslint/naming-convention` rule to ban leading underscores
      on members so the `#private` convention is machine-enforced.
- [ ] **Examples** beyond the playground (vanilla + React).
- [ ] **Bundle-size budget** check in CI.
- [ ] **Changelog** + first published release.

## Notes

- Keep the headless core dependency-free and DOM-free. UI features live in
  `src/ui`; framework glue lives in `src/react`.
- Prefer opt-in modules over growing the `Timeline` surface — the recent pass
  trimmed it down deliberately.
