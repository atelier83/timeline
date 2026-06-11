import { createTimeline } from "../src/ui";
import "../src/theme.css";

// A deliberately simple playground: a row of plain <div> boxes. The timeline
// keyframes a small `settings` object and on every update we map those values
// onto the boxes' CSS transforms. No WebGL, no scene graph — just DOM.

const BOX_COUNT = 6;

const settings = {
  spread: 120, // horizontal gap between boxes (px)
  rotate: 0, // rotation applied to each box (deg)
  scale: 1, // uniform scale of each box
  lift: 0, // vertical offset, staggered per box (px)
  hue: 200, // base hue; each box steps further around the wheel
};

const stage = document.createElement("div");
stage.style.cssText = `
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
`;
document.body.appendChild(stage);

const boxes: HTMLDivElement[] = [];
for (let i = 0; i < BOX_COUNT; i++) {
  const box = document.createElement("div");
  box.style.cssText = `
    position: absolute;
    width: 80px;
    height: 80px;
    border-radius: 12px;
    will-change: transform;
  `;
  stage.appendChild(box);
  boxes.push(box);
}

function render() {
  const mid = (BOX_COUNT - 1) / 2;
  boxes.forEach((box, i) => {
    const x = (i - mid) * settings.spread;
    // alternate the vertical lift so the row breathes in a wave
    const y = settings.lift * (i % 2 === 0 ? 1 : -1);
    box.style.transform = `translate(${x}px, ${y}px) rotate(${settings.rotate}deg) scale(${settings.scale})`;
    box.style.background = `hsl(${settings.hue + i * 24}, 70%, 60%)`;
  });
}

const timeline = createTimeline({
  loop: true,
  onUpdate: render,
});

timeline
  .add(settings, "spread", { min: 0, max: 200 })
  .addKeyframe(0, 20, "easeInOutCubic")
  .addKeyframe(30, 100, "easeInOutCubic")
  .addKeyframe(60, 20);

timeline
  .add(settings, "rotate", { min: -180, max: 180 })
  .addKeyframe(0, 0, "easeInOutCubic")
  .addKeyframe(30, 180, "easeInOutCubic")
  .addKeyframe(60, 0);

timeline
  .add(settings, "scale", { min: 0.2, max: 1.5 })
  .addKeyframe(0, 0.6, "easeInOutCubic")
  .addKeyframe(30, 1.3, "easeInOutCubic")
  .addKeyframe(60, 0.6);

timeline
  .add(settings, "lift", { min: -120, max: 120 })
  .addKeyframe(0, 0, "easeInOutCubic")
  .addKeyframe(30, 80, "easeInOutCubic")
  .addKeyframe(60, 0);

timeline
  .add(settings, "hue", { min: 0, max: 360 })
  .addKeyframe(0, 200, "easeInOutCubic")
  .addKeyframe(30, 360, "easeInOutCubic")
  .addKeyframe(60, 200);

timeline.seek(0);
