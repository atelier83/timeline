const STYLE_ID = "tl-timeline-styles";

/**
 * Self-contained dark theme (Adobe Animate-inspired: flat, minimal, monochrome
 * — a few tones of gray, hairline borders, quiet type, no accent colour).
 * Injected once. Everything is namespaced under `.tl-*` and uses CSS variables,
 * so it can be reskinned by overriding tokens on `.tl-root`.
 *
 * The same rules ship as `theme.css` (`@atelier83/timeline/theme.css`) for
 * consumers who prefer to link a stylesheet instead of letting the UI inject it.
 */
export const CSS = `
.tl-root {
  /* Adobe Animate-inspired palette: one major gray background, one dark gray
     for separators + grid dashes, one light gray for numbers + labels. */
  --tl-bg: #323232;
  --tl-surface: #323232;
  --tl-surface-2: #3c3c3c;
  /* one line tone everywhere: row separators, frame grid, ruler dashes */
  --tl-line: #212121;
  --tl-border: var(--tl-line);
  --tl-border-strong: #555555;
  --tl-text: #c8c8c8;
  --tl-text-dim: #8c8c8c;
  --tl-hover: rgba(255, 255, 255, 0.06);
  --tl-active: rgba(255, 255, 255, 0.1);
  /* neutral "accent" — playhead, focus, selection. a near-white line. */
  --tl-accent: #e6e6e6;
  --tl-accent-soft: rgba(255, 255, 255, 0.14);
  /* flat control fills (no borders); hover == active/selected */
  --tl-btn: #3b3b3b;
  --tl-btn-hover: #4a4a4a;
  /* grid dashes inside the lanes (same line tone as separators) */
  --tl-grid: var(--tl-line);
  --tl-grid-strong: var(--tl-line);
  /* alternating band shade (every 10 frames, matching the ruler labels) */
  --tl-band: rgba(255, 255, 255, 0.03);
  /* dope sheet: light populated spans, near-black keyframe markers */
  --tl-hold: #8f8f8f;
  --tl-tween: #b4b4b4;
  --tl-seg-sel: #d6d6d6;
  --tl-kf: #1c1c1c;
  --tl-sidebar-w: 184px;
  --tl-ruler-h: 26px;
  --tl-lane-h: 30px;
  --tl-radius: 6px;

  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 99999;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif;
  font-size: 12px;
  line-height: 1.4;
  color: var(--tl-text);
  background: var(--tl-bg);
  border-top: 1px solid var(--tl-border);
  user-select: none;
  -webkit-font-smoothing: antialiased;
  font-variant-numeric: tabular-nums;
}
.tl-root * { box-sizing: border-box; }
.tl-root.is-collapsed .tl-header,
.tl-root.is-collapsed .tl-body { display: none; }
/* collapsed = playback only: hide the inspectors (the corner toolbar lives in
   the header, so it's hidden automatically) */
.tl-root.is-collapsed .tl-inspector { display: none; }

/* thin, quiet scrollbars */
.tl-root ::-webkit-scrollbar { width: 10px; height: 10px; }
.tl-root ::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.12);
  border: 3px solid transparent;
  background-clip: padding-box;
  border-radius: 8px;
}
.tl-root ::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.2); background-clip: padding-box; }
.tl-root ::-webkit-scrollbar-track { background: transparent; }

/* transport */
.tl-transport {
  display: flex;
  align-items: center;
  gap: 3px;
  height: var(--tl-ruler-h);
  padding: 0 7px;
  background: var(--tl-surface);
  /* no top border: the last lane/row already draws the 1px separator above,
     so adding one here would render as a doubled 2px line */
}
.tl-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 26px;
  height: 26px;
  padding: 0 6px;
  border: none;
  border-radius: var(--tl-radius);
  background: var(--tl-btn);
  color: var(--tl-text-dim);
  font: inherit;
  line-height: 1;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}
.tl-btn:hover,
.tl-btn:active,
.tl-btn.is-active { background: var(--tl-btn-hover); color: var(--tl-text); }
.tl-btn:disabled { opacity: 0.4; cursor: default; }
/* smaller buttons for the corner authoring toolbar */
.tl-btn-sm { min-width: 20px; height: 20px; padding: 0 3px; border-radius: 4px; }
.tl-btn-sm .tl-icon { width: 13px; height: 13px; }
.tl-icon { width: 16px; height: 16px; display: block; flex: none; }
.tl-insp-field .tl-label-dim { display: inline-flex; align-items: center; }
.tl-insp-field .tl-icon { width: 14px; height: 14px; }
.tl-time {
  font-variant-numeric: tabular-nums;
  padding: 0 10px;
  color: var(--tl-text-dim);
  letter-spacing: 0.01em;
}
.tl-time b { color: var(--tl-text); font-weight: 600; }
.tl-spacer { flex: 1; }
.tl-label-dim { color: var(--tl-text-dim); }
.tl-sep { width: 1px; align-self: stretch; background: var(--tl-border); margin: 8px 6px; }

/* selection inspector */
.tl-inspector {
  display: none;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  margin: 0 6px;
  border-left: 1px solid var(--tl-border);
  border-right: 1px solid var(--tl-border);
}
.tl-inspector.is-visible { display: flex; }
.tl-insp-field { display: flex; align-items: center; gap: 5px; }
.tl-input {
  width: 56px;
  height: 22px;
  padding: 0 8px;
  border: none;
  border-radius: var(--tl-radius);
  background: var(--tl-btn);
  color: var(--tl-text);
  font: inherit;
  font-variant-numeric: tabular-nums;
  transition: background 0.12s ease;
}
.tl-input:hover,
.tl-input:focus { outline: none; background: var(--tl-btn-hover); }
.tl-input-name { width: 96px; text-align: left; }
.tl-input-script { width: 132px; text-align: left; }
.tl-select {
  height: 22px;
  padding: 0 6px;
  border: none;
  border-radius: var(--tl-radius);
  background: var(--tl-btn);
  color: var(--tl-text);
  font: inherit;
  cursor: pointer;
  transition: background 0.12s ease;
}
.tl-select:hover,
.tl-select:focus { outline: none; background: var(--tl-btn-hover); }

/* header (corner + ruler) */
.tl-header { display: flex; align-items: stretch; }
.tl-corner {
  width: var(--tl-sidebar-w);
  flex: 0 0 var(--tl-sidebar-w);
  height: var(--tl-ruler-h);
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 0 7px;
  /* no border-right: the ruler's frame-0 tick line provides the boundary,
     so adding one here would render as a doubled 2px line */
  border-bottom: 1px solid var(--tl-border);
  background: var(--tl-surface);
}
.tl-ruler-viewport {
  position: relative;
  flex: 1;
  height: var(--tl-ruler-h);
  overflow: hidden;
  border-bottom: 1px solid var(--tl-border);
  background: var(--tl-surface);
  cursor: ew-resize;
}
.tl-ruler {
  position: relative;
  height: 100%;
  --tl-ppf: 12px;
  /* dark vertical frame lines only, occupying the top quarter of the ruler */
  background-image: repeating-linear-gradient(
    90deg,
    var(--tl-line) 0 1px,
    transparent 1px var(--tl-ppf)
  );
  background-repeat: no-repeat;
  background-position: left top;
  background-size: 100% 25%;
}
.tl-tick {
  position: absolute;
  top: 0;
  bottom: 0;
  border-left: 1px solid var(--tl-border);
  color: var(--tl-text);
  padding-left: 6px;
  font-size: 10px;
  letter-spacing: 0.03em;
  line-height: var(--tl-ruler-h);
  white-space: nowrap;
}
.tl-ruler-head {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 0;
  border-left: 1px solid var(--tl-accent);
}

/* body: sidebar + lanes scroll together vertically */
.tl-body {
  max-height: 264px;
  overflow-y: auto;
  overflow-x: hidden;
}
.tl-body-inner {
  display: flex;
  align-items: stretch;
  min-height: 100%;
}
.tl-sidebar {
  width: var(--tl-sidebar-w);
  flex: 0 0 var(--tl-sidebar-w);
  /* no border-right: the lanes' frame-0 grid line provides the boundary,
     so adding one here would render as a doubled 2px line */
  background: var(--tl-surface);
}
.tl-track-row {
  height: var(--tl-lane-h);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px 0 12px;
  border-bottom: 1px solid var(--tl-border);
  cursor: pointer;
  transition: background 0.12s ease;
}
.tl-track-row:hover { background: var(--tl-hover); }
.tl-track-row.is-active { background: var(--tl-active); }
.tl-track-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
  color: var(--tl-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tl-row-labels { background: transparent; }

/* lanes */
.tl-lanes-viewport {
  position: relative;
  flex: 1;
  overflow-x: auto;
  overflow-y: hidden;
}
.tl-lanes-content {
  position: relative;
  --tl-ppf: 12px;
  background-image:
    repeating-linear-gradient(
      90deg,
      var(--tl-grid) 0 1px,
      transparent 1px var(--tl-ppf)
    ),
    repeating-linear-gradient(
      90deg,
      var(--tl-band) 0 var(--tl-ppf),
      transparent var(--tl-ppf) calc(var(--tl-ppf) * 10)
    );
}
.tl-lane {
  position: relative;
  height: var(--tl-lane-h);
  border-bottom: 1px solid var(--tl-border);
}
.tl-lane svg { position: absolute; inset: 0; display: block; overflow: visible; }
.tl-lane-labels { background: transparent; }

/* selected empty frame (track lanes draw an SVG rect) */
.tl-cell-sel {
  fill: rgba(255, 255, 255, 0.07);
  stroke: none;
  pointer-events: none;
}
/* selected frame highlight in the (DOM-based) labels lane */
.tl-cell-hl {
  position: absolute;
  top: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.07);
  pointer-events: none;
  z-index: 1;
}
/* invisible drag handle to extend a span's held tail */
.tl-span-resize { fill: transparent; cursor: ew-resize; }

/* dope-sheet frame blocks + keyframes */
.tl-block { fill: var(--tl-tween); stroke: var(--tl-bg); stroke-width: 1; cursor: grab; }
.tl-block-hold { fill: var(--tl-hold); }
.tl-block:active { cursor: grabbing; }
.tl-block.is-selected { fill: var(--tl-seg-sel); stroke: var(--tl-bg); }
.tl-kf {
  fill: var(--tl-kf);
  stroke: none;
  pointer-events: none;
}
.tl-end {
  fill: none;
  stroke: var(--tl-kf);
  stroke-width: 1;
  pointer-events: none;
}

/* labels inside the labels lane */
.tl-marker {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 4;
  cursor: pointer;
}
.tl-marker-line {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 1px;
  background: var(--tl-border-strong);
}
.tl-marker-flag {
  position: absolute;
  top: 4px;
  left: 2px;
  height: 18px;
  padding: 0 7px;
  font-size: 10.5px;
  line-height: 17px;
  white-space: nowrap;
  color: var(--tl-text);
  background: var(--tl-surface-2);
  border: 1px solid var(--tl-border);
  border-radius: 5px;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tl-marker.is-selected .tl-marker-flag { border-color: var(--tl-accent); color: var(--tl-accent); }
.tl-marker.is-hold .tl-marker-flag { background: var(--tl-accent-soft); border-color: var(--tl-accent); color: var(--tl-accent); }
.tl-marker.is-hold .tl-marker-line { background: var(--tl-accent); }
.tl-marker.is-hold .tl-marker-flag::before { content: "⏸ "; }

/* marker guide line spanning the track lanes */
.tl-lane-marker {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(255, 255, 255, 0.1);
  pointer-events: none;
  z-index: 3;
}
.tl-lane-marker.is-hold { background: var(--tl-accent-soft); }

/* playhead spans the lane stack */
.tl-playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 0;
  border-left: 1px solid var(--tl-accent);
  pointer-events: none;
  z-index: 5;
}
.tl-playhead::before {
  content: "";
  position: absolute;
  top: 0;
  left: -4px;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 5px solid var(--tl-accent);
}
`;

/** Inject the bundled stylesheet once into `doc`'s head. */
export function injectStyles(doc: Document = document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const el = doc.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  doc.head.appendChild(el);
}
