import * as dat from "dat.gui";
import * as THREE from "three";

import { createTimeline } from "../src/ui";

// A small WebGL scene (a fan of rounded image cards) driven by a settings
// object. The timeline keyframes the same `settings` values dat.gui exposes,
// so playback animates the scene exactly as if you were dragging the sliders.

const IMAGE_POOL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

const settings = {
  background: "#000000",
  tiles: 11,
  startAngle: -90,
  endAngle: 90,
  offset: -2,
  tile: 1,
  originX: 0,
  originY: -2,
  shadowBlur: 70,
  shadowOpacity: 0.9,
  cornerRadius: 0.03,
  easing: 0.15,
  stagger: 0.68,
};

let geometry: THREE.ShapeGeometry | null = null;

class WebGL {
  tileData: any[] = []; // { pivot, mesh, material, imageIdx, targetAngle }
  stepRad = 0;
  isDragging = false;
  lastPointerX = 0;
  pendingDelta = 0;
  dragDirection = 0;

  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
  group: THREE.Group;
  loader: THREE.TextureLoader;
  textureCache: Map<string, THREE.Texture>;
  shadowTexture: THREE.CanvasTexture;
  shadowMaterial: THREE.MeshBasicMaterial;
  gui!: dat.GUI;
  timeline!: ReturnType<typeof createTimeline>;

  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(settings.background);

    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 100);
    this.camera.position.set(0, 0, 10);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    document.body.appendChild(this.renderer.domElement);

    this.group = new THREE.Group();
    this.group.position.set(settings.originX, settings.originY, 0);
    this.scene.add(this.group);

    this.loader = new THREE.TextureLoader();
    this.textureCache = new Map();

    this.shadowTexture = this.createShadowTexture();
    this.shadowMaterial = new THREE.MeshBasicMaterial({
      map: this.shadowTexture,
      transparent: true,
      depthWrite: false,
    });

    window.addEventListener("resize", this.resize);
    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);

    this.resize();
    this.initGui();
    this.build();
    this.initTimeline();
    this.update();
  }

  createShadowTexture(): THREE.CanvasTexture {
    const W = 200;
    const H = 320;
    const blur = settings.shadowBlur;
    const pad = blur * 2;
    const canvas = document.createElement("canvas");
    canvas.width = W + pad * 2;
    canvas.height = H + pad * 2;
    const ctx = canvas.getContext("2d")!;

    const r = Math.min((settings.cornerRadius / settings.tile) * H, W / 2, H / 2);

    const roundedRect = (
      x: number,
      y: number,
      w: number,
      h: number,
      radius: number,
    ) => {
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + w - radius, y);
      ctx.arcTo(x + w, y, x + w, y + radius, radius);
      ctx.lineTo(x + w, y + h - radius);
      ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
      ctx.lineTo(x + radius, y + h);
      ctx.arcTo(x, y + h, x, y + h - radius, radius);
      ctx.lineTo(x, y + radius);
      ctx.arcTo(x, y, x + radius, y, radius);
      ctx.closePath();
    };

    ctx.shadowColor = `rgba(0,0,0,${settings.shadowOpacity})`;
    ctx.shadowBlur = blur;
    ctx.fillStyle = "black";
    roundedRect(pad, pad, W, H, r);
    ctx.fill();

    ctx.globalCompositeOperation = "destination-out";
    ctx.shadowBlur = 0;
    roundedRect(pad, pad, W, H, r);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    return new THREE.CanvasTexture(canvas);
  }

  rebuildShadow() {
    if (this.shadowTexture) this.shadowTexture.dispose();
    this.shadowTexture = this.createShadowTexture();
    this.shadowMaterial.map = this.shadowTexture;
    this.shadowMaterial.needsUpdate = true;
    this.build();
  }

  createRoundedGeometry(width: number, height: number, radius: number) {
    const r = Math.min(radius, width / 2, height / 2);
    const shape = new THREE.Shape();
    const x = -width / 2;
    const y = -height / 2;

    shape.moveTo(x + r, y);
    shape.lineTo(x + width - r, y);
    shape.quadraticCurveTo(x + width, y, x + width, y + r);
    shape.lineTo(x + width, y + height - r);
    shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    shape.lineTo(x + r, y + height);
    shape.quadraticCurveTo(x, y + height, x, y + height - r);
    shape.lineTo(x, y + r);
    shape.quadraticCurveTo(x, y, x + r, y);

    const geo = new THREE.ShapeGeometry(shape);

    const pos = geo.attributes.position;
    const uvs = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      uvs.setXY(
        i,
        (pos.getX(i) + width / 2) / width,
        (pos.getY(i) + height / 2) / height,
      );
    }
    uvs.needsUpdate = true;

    return geo;
  }

  getTexture(imageIdx: number): THREE.Texture {
    const total = IMAGE_POOL.length;
    const idx = ((imageIdx % total) + total) % total;
    const url = `/images/${IMAGE_POOL[idx]}.jpg`;
    if (!this.textureCache.has(url)) {
      this.textureCache.set(url, this.loader.load(url));
    }
    return this.textureCache.get(url)!;
  }

  initGui = () => {
    this.gui = new dat.GUI();
    const gui = this.gui;
    gui.add(settings, "tiles", 1, 24, 1).onChange(() => this.build());
    gui.add(settings, "startAngle", -360, 360, 1).onChange(() => this.build());
    gui.add(settings, "endAngle", -360, 360, 1).onChange(() => this.build());
    gui.add(settings, "offset", -2, 2, 0.01).onChange(() => this.build());
    gui.add(settings, "tile", 0.08, 1.25, 0.01).onChange(() => this.build());
    gui.add(settings, "originX", -2, 2, 0.01).onChange(() => {
      this.group.position.x = settings.originX;
    });
    gui.add(settings, "originY", -2, 2, 0.01).onChange(() => {
      this.group.position.y = settings.originY;
    });
    gui.add(settings, "cornerRadius", 0, 0.3, 0.001).onChange(() => {
      this.rebuildShadow();
      this.build();
    });
    gui.add(settings, "easing", 0.01, 1, 0.01);
    gui.add(settings, "stagger", 0, 1, 0.01);
    gui.add(settings, "shadowBlur", 0, 80, 1).onChange(() => this.rebuildShadow());
    gui
      .add(settings, "shadowOpacity", 0, 1, 0.01)
      .onChange(() => this.rebuildShadow());
    gui.addColor(settings, "background").onChange((v: string) => {
      this.scene.background = new THREE.Color(v);
    });
  };

  initTimeline = () => {
    // The timeline writes evaluated values straight into `settings`; on every
    // update we push them into the scene and refresh the dat.gui display.
    this.timeline = createTimeline({
      loop: true,
      onUpdate: () => {
        this.group.position.x = settings.originX;
        this.group.position.y = settings.originY;
        this.build();
        this.rebuildShadow();
        this.gui.updateDisplay();
      },
    });

    this.timeline
      .add(settings, "startAngle", { min: -360, max: 360 })
      .addKeyframe(0, 0, "easeInOutCubic")
      .addKeyframe(30, -90, "easeInOutCubic")
      .addKeyframe(60, 0);
    this.timeline
      .add(settings, "endAngle", { min: -360, max: 360 })
      .addKeyframe(0, 0, "easeInOutCubic")
      .addKeyframe(30, 90, "easeInOutCubic")
      .addKeyframe(60, 0);
    this.timeline
      .add(settings, "tile", { min: 0.08, max: 1.25 })
      .addKeyframe(0, 0.08, "easeInOutCubic")
      .addKeyframe(30, 1.25, "easeInOutCubic")
      .addKeyframe(60, 0.8);
    this.timeline
      .add(settings, "cornerRadius", { min: 0, max: 0.3 })
      .addKeyframe(0, 0.3, "easeInOutCubic")
      .addKeyframe(30, 0.03, "easeInOutCubic")
      .addKeyframe(60, 0.3);

    // apply the t=0 pose so values and curves reflect the seed on load
    this.timeline.seek(0);
  };

  build() {
    const disposedGeos = new Set<THREE.BufferGeometry>();
    for (const { pivot, material, shadowGeo } of this.tileData) {
      this.group.remove(pivot);
      material.dispose();
      if (!disposedGeos.has(shadowGeo)) {
        shadowGeo.dispose();
        disposedGeos.add(shadowGeo);
      }
    }
    if (geometry) geometry.dispose();
    this.tileData = [];

    const planeWidth = settings.tile * (10 / 16);
    geometry = this.createRoundedGeometry(
      planeWidth,
      settings.tile,
      settings.cornerRadius,
    );

    const W = 200;
    const H = 320;
    const pad = settings.shadowBlur * 2;
    const shadowGeoShared = new THREE.PlaneGeometry(
      (planeWidth * (W + pad * 2)) / W,
      (settings.tile * (H + pad * 2)) / H,
    );

    const n = settings.tiles;
    const startRad = THREE.MathUtils.degToRad(settings.startAngle);
    const endRad = THREE.MathUtils.degToRad(settings.endAngle);
    this.stepRad = n > 1 ? (endRad - startRad) / (n - 1) : 0;

    for (let i = 0; i < n; i++) {
      const cardOrder = (n - 1 - i) * 2 + 1;
      const shadowOrder = (n - 1 - i) * 2;
      const z = (n - 1 - i) * 0.001;

      const shadowMesh = new THREE.Mesh(shadowGeoShared, this.shadowMaterial);
      shadowMesh.position.set(0, -settings.offset, z - 0.0005);
      shadowMesh.renderOrder = shadowOrder;

      const material = new THREE.MeshBasicMaterial({ map: this.getTexture(i) });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(0, -settings.offset, z);
      mesh.renderOrder = cardOrder;

      const pivot = new THREE.Group();
      pivot.rotation.z = startRad + i * this.stepRad;
      pivot.add(shadowMesh);
      pivot.add(mesh);

      this.group.add(pivot);
      const angle = startRad + i * this.stepRad;
      this.tileData.push({
        pivot,
        mesh,
        material,
        shadowMesh,
        shadowGeo: shadowGeoShared,
        imageIdx: i,
        targetAngle: angle,
      });
    }
  }

  recycle() {
    if (this.tileData.length < 2 || this.stepRad === 0) return;

    const startRad = THREE.MathUtils.degToRad(settings.startAngle);
    const endRad = THREE.MathUtils.degToRad(settings.endAngle);
    const half = Math.abs(this.stepRad) * 0.5;

    this.tileData.sort((a, b) => a.targetAngle - b.targetAngle);

    while (this.tileData[0].targetAngle < startRad - half) {
      const tile = this.tileData.shift();
      const last = this.tileData[this.tileData.length - 1];
      tile.targetAngle = last.targetAngle + this.stepRad;
      tile.pivot.rotation.z = tile.targetAngle;
      tile.imageIdx = (last.imageIdx + 1) % IMAGE_POOL.length;
      tile.material.map = this.getTexture(tile.imageIdx);
      this.tileData.push(tile);
    }

    while (this.tileData[this.tileData.length - 1].targetAngle > endRad + half) {
      const tile = this.tileData.pop();
      const first = this.tileData[0];
      tile.targetAngle = first.targetAngle - this.stepRad;
      tile.pivot.rotation.z = tile.targetAngle;
      tile.imageIdx = (first.imageIdx - 1 + IMAGE_POOL.length) % IMAGE_POOL.length;
      tile.material.map = this.getTexture(tile.imageIdx);
      this.tileData.unshift(tile);
    }

    this.updateDepthOrder();
  }

  updateDepthOrder() {
    const n = this.tileData.length;
    for (let j = 0; j < n; j++) {
      const z = (n - 1 - j) * 0.001;
      this.tileData[j].mesh.position.z = z;
      this.tileData[j].shadowMesh.position.z = z - 0.0005;
      this.tileData[j].mesh.renderOrder = (n - 1 - j) * 2 + 1;
      this.tileData[j].shadowMesh.renderOrder = (n - 1 - j) * 2;
    }
  }

  onPointerDown = (e: PointerEvent) => {
    this.isDragging = true;
    this.lastPointerX = e.clientX;
  };

  onPointerMove = (e: PointerEvent) => {
    if (!this.isDragging) return;
    const delta = e.clientX - this.lastPointerX;
    this.lastPointerX = e.clientX;
    if (delta !== 0) {
      this.pendingDelta -= delta;
      this.dragDirection = Math.sign(-delta);
    }
  };

  onPointerUp = () => {
    this.isDragging = false;
    this.snapToCenter();
  };

  snapToCenter() {
    const centerRad = THREE.MathUtils.degToRad(
      (settings.startAngle + settings.endAngle) / 2,
    );

    let closest = this.tileData[0];
    let minDist = Infinity;
    for (const tile of this.tileData) {
      const dist = Math.abs(tile.targetAngle - centerRad);
      if (dist < minDist) {
        minDist = dist;
        closest = tile;
      }
    }

    const offset = centerRad - closest.targetAngle;
    for (const tile of this.tileData) {
      tile.targetAngle += offset;
    }

    this.recycle();
  }

  resize = () => {
    const aspect = window.innerWidth / window.innerHeight;
    this.camera.left = -aspect;
    this.camera.right = aspect;
    this.camera.top = 1;
    this.camera.bottom = -1;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.build();
  };

  update = () => {
    requestAnimationFrame(this.update);

    const n = this.tileData.length;

    if (this.pendingDelta !== 0) {
      const deltaRad = this.pendingDelta * 0.003;
      this.pendingDelta = 0;
      for (const tile of this.tileData) {
        tile.targetAngle += deltaRad;
      }
      this.recycle();
    }

    this.tileData.sort((a, b) => a.targetAngle - b.targetAngle);

    let anyMoving = false;
    for (let j = 0; j < n; j++) {
      const tile = this.tileData[j];
      const diff = tile.targetAngle - tile.pivot.rotation.z;
      if (Math.abs(diff) < 0.00001) {
        tile.pivot.rotation.z = tile.targetAngle;
        continue;
      }

      const leadFactor =
        this.dragDirection >= 0
          ? j / Math.max(n - 1, 1)
          : (n - 1 - j) / Math.max(n - 1, 1);
      const easing = settings.easing * (1 - settings.stagger * (1 - leadFactor));

      tile.pivot.rotation.z += diff * easing;
      anyMoving = true;
    }

    if (anyMoving) this.updateDepthOrder();

    this.renderer.render(this.scene, this.camera);
  };
}

new WebGL();
