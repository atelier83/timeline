import { createTimeline } from "../src/ui";
import "../src/theme.css";

const SIZE = 56;
const MARGIN = 16;
const COLORS = ["#f87171", "#60a5fa", "#34d399", "#fbbf24"];
const app = document.getElementById("app")!;
const boxes = COLORS.map((color) => {
  const el = document.createElement("div");
  el.className = "box";
  el.style.background = color;
  el.style.left = MARGIN + "px";
  el.style.top = MARGIN + "px";
  app.appendChild(el);
  return el;
});
function lerp(a, b, t) {
  return a + (b - a) * t;
}
// reads the live dope-sheet height so bottom corners always clear the panel,
// including when it collapses or the window resizes
function availableHeight() {
  const panel = document.querySelector(".tl-root");
  return innerHeight - (panel ? panel.offsetHeight : 0);
}
function corners() {
  const h = availableHeight();
  return [
    { x: MARGIN, y: MARGIN },
    { x: innerWidth - SIZE - MARGIN, y: MARGIN },
    { x: MARGIN, y: h - SIZE - MARGIN },
    { x: innerWidth - SIZE - MARGIN, y: h - SIZE - MARGIN },
  ];
}
const settings = { progress: 0, rotate: 0, scale: 1 };
function render() {
  const t = settings.progress;
  const cs = corners();
  boxes.forEach((box, i) => {
    box.style.left = lerp(MARGIN, cs[i].x, t) + "px";
    box.style.top = lerp(MARGIN, cs[i].y, t) + "px";
    box.style.transform = `rotate(${settings.rotate}deg) scale(${settings.scale})`;
  });
}
const tl = createTimeline({ loop: true, onUpdate: render });
tl.add(settings, "progress", { min: 0, max: 1 })
  .addKeyframe(0, 0, "easeInOutCubic")
  .addKeyframe(40, 1, "easeInOutCubic")
  .addKeyframe(80, 0);
tl.add(settings, "rotate", { min: -180, max: 180 })
  .addKeyframe(0, 0, "easeInOutCubic")
  .addKeyframe(40, 90, "easeInOutCubic")
  .addKeyframe(80, 0);
tl.add(settings, "scale", { min: 0.5, max: 1.2 })
  .addKeyframe(0, 1, "easeInOutCubic")
  .addKeyframe(40, 0.8, "easeInOutCubic")
  .addKeyframe(80, 1);
tl.seek(0);
