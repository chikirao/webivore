import * as THREE from "three";
import { appUrl } from "./paths";
import { rabbitFrame } from "./rabbit-frame";
import {
  readRabbitSettings,
  RABBIT_GAME_KEY,
  type RabbitSettings,
  type PartTuning,
} from "./rabbit-settings";

/**
 * The generated head and body atlases (8 azimuths × 3 elevations) are composed
 * once, at load, into one sheet per view. The head sits on the body by one
 * geometric rule — its centre is one head radius above the neck, foreshortened
 * by the row's elevation — so the neck never opens and the head does not climb
 * forward at steep camera pitch. Every composite shares a ground anchor at the
 * feet. The sheet is drawn as a camera-facing quad whose depth follows a
 * vertical plane through the feet: the feet sit on the page, the head keeps
 * its true height against the ball, and the floor never swallows the sprite.
 * Head/body stay sprite-based. The user's preferred outlined ball-contact hands
 * are restored from the earlier implementation and can be tuned per view.
 */
export const RABBIT = {
  /** Gap between the rabbit's origin and the ball surface, in rabbit-scale units. */
  ballGap: 30,
  /** World size of one head / body atlas cell: the established art scale. */
  headSize: 52,
  bodySize: 32,
  /** Camera elevations the three atlas rows were generated at. */
  rows: [0, 40, 75].map((d) => (d * Math.PI) / 180),
  hand: { radius: 4.8 },
  ghostOpacity: 0.5,
  order: { solid: 2 },
};
const CELL = 250,
  STRIDE = 256,
  INSET = 3,
  /** Composite pixels per body pixel; head pixels are scaled by headSize / bodySize on top. */
  SHEET_SCALE = 0.8,
  SHEET_W = 512,
  SHEET_H = 640,
  ANCHOR_Y = SHEET_H - 12;
export type Frame = { column: number; row: number };
export type SheetMetrics = {
  /** Composite cell: lowest opaque pixel of the feet, relative to the cell top. */
  feet: number;
  /** Head centre offset above the neck hole centre, composite px. */
  headLift: number;
  /** Neck hole centre in the composite cell. */
  neck: { x: number; y: number };
  headRadius: number;
};

const vertexShader = /* glsl */ `
uniform vec2 size;
uniform vec2 anchor;
uniform float stature;
uniform vec2 offset;
uniform vec2 repeat;
uniform float bob;
varying vec2 vUv;
void main() {
  vUv = offset + uv * repeat;
  float s = length(modelMatrix[1].xyz);
  vec4 origin = modelViewMatrix * vec4(0.0, bob, 0.0, 1.0);
  vec4 view = origin + vec4((uv - anchor) * size * s, 0.0, 0.0);
  vec4 clip = projectionMatrix * view;
  // Depth from a vertical plane through the feet, not from the tilted billboard.
  float h = (uv.y - anchor.y) / (1.0 - anchor.y) * stature + bob;
  vec4 ref = projectionMatrix * viewMatrix * (modelMatrix * vec4(0.0, h, 0.0, 1.0));
  clip.z = ref.z / ref.w * clip.w;
  gl_Position = clip;
}`;
const fragmentShader = /* glsl */ `
uniform sampler2D map;
uniform float opacity;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(map, vUv);
  if (c.a < 0.35) discard;
  gl_FragColor = vec4(c.rgb, c.a * opacity);
  #include <colorspace_fragment>
}`;

type Mask = { data: Uint8ClampedArray; w: number; h: number };
function mask(image: HTMLImageElement, column: number, row: number): Mask {
  const c = document.createElement("canvas");
  c.width = c.height = CELL;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(
    image,
    column * STRIDE + INSET,
    row * STRIDE + INSET,
    CELL,
    CELL,
    0,
    0,
    CELL,
    CELL,
  );
  return { data: ctx.getImageData(0, 0, CELL, CELL).data, w: CELL, h: CELL };
}
function extent(m: Mask, y: number): [number, number] | null {
  let a = -1,
    b = -1;
  for (let x = 0; x < m.w; x++)
    if (m.data[(y * m.w + x) * 4 + 3] > 110) {
      if (a < 0) a = x;
      b = x;
    }
  return a < 0 ? null : [a, b];
}
function rows(m: Mask) {
  let top = -1,
    bottom = -1;
  for (let y = 0; y < m.h; y++) {
    const e = extent(m, y);
    if (e && e[1] - e[0] >= 3) {
      if (top < 0) top = y;
      bottom = y;
    }
  }
  return { top, bottom };
}
/** Neck rim (body top) and feet from a body cell. */
export function measureBody(m: Mask, elevation: number) {
  const { top, bottom } = rows(m);
  const rim = extent(m, Math.min(bottom, top + 5))!;
  const width = rim[1] - rim[0];
  return {
    neck: {
      x: (rim[0] + rim[1]) / 2,
      y: top + (width * Math.sin(elevation)) / 2,
    },
    feet: bottom,
    top,
  };
}
/** The head sphere: widest row in the lower part of the silhouette, below the ears. */
export function measureHead(m: Mask, lowerStart = 0.4) {
  const { top, bottom } = rows(m);
  let best = -1,
    at = top,
    centre = m.w / 2;
  for (
    let y = Math.round(top + (bottom - top) * lowerStart);
    y <= bottom;
    y++
  ) {
    const e = extent(m, y);
    if (e && e[1] - e[0] > best) {
      best = e[1] - e[0];
      at = y;
      centre = (e[0] + e[1]) / 2;
    }
  }
  return { centre: { x: centre, y: at }, radius: best / 2, bottom };
}

export class Rabbit {
  root = new THREE.Group();
  sprite: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  ghost: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  hands: THREE.Mesh[] = [];
  sheet = document.createElement("canvas");
  texture: THREE.CanvasTexture;
  metrics: SheetMetrics[] = [];
  frame: Frame = { column: 0, row: 1 };
  ready: Promise<void>;
  /** Height of the sheet above the feet anchor in unscaled world units: the depth plane's top. */
  stature = (ANCHOR_Y * RABBIT.bodySize) / (CELL * SHEET_SCALE);
  private disposables: { dispose(): void }[] = [];
  private sources?: [HTMLImageElement, HTMLImageElement];
  private bodyMetrics: ReturnType<typeof measureBody>[] = [];
  private headMetrics: ReturnType<typeof measureHead>[] = [];
  private repairedHeads: {
    image: HTMLImageElement;
    metrics: ReturnType<typeof measureHead>;
  }[] = [];
  constructor(
    public settings: RabbitSettings = readRabbitSettings(RABBIT_GAME_KEY),
  ) {
    this.sheet.width = SHEET_W * 8;
    this.sheet.height = SHEET_H * 3;
    this.texture = new THREE.CanvasTexture(this.sheet);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.generateMipmaps = false;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    const unit = RABBIT.bodySize / (CELL * SHEET_SCALE);
    const uniforms = () => ({
      map: { value: this.texture },
      size: { value: new THREE.Vector2(SHEET_W * unit, SHEET_H * unit) },
      anchor: { value: new THREE.Vector2(0.5, 1 - ANCHOR_Y / SHEET_H) },
      stature: { value: this.stature },
      offset: { value: new THREE.Vector2(0, 0) },
      repeat: { value: new THREE.Vector2(1 / 8, 1 / 3) },
      bob: { value: 0 },
      opacity: { value: 1 },
    });
    const geometry = new THREE.PlaneGeometry(1, 1, 1, 6);
    geometry.translate(0.5, 0.5, 0);
    const solid = new THREE.ShaderMaterial({
      uniforms: uniforms(),
      vertexShader,
      fragmentShader,
      alphaToCoverage: true,
    });
    this.sprite = new THREE.Mesh(geometry, solid);
    this.sprite.renderOrder = RABBIT.order.solid;
    this.sprite.frustumCulled = false;
    const ghost = new THREE.ShaderMaterial({
      uniforms: uniforms(),
      vertexShader,
      fragmentShader,
      transparent: true,
      depthFunc: THREE.GreaterDepth,
      depthWrite: false,
    });
    ghost.uniforms.opacity.value = RABBIT.ghostOpacity;
    this.ghost = new THREE.Mesh(geometry, ghost);
    this.ghost.frustumCulled = false;
    this.root.add(this.sprite, this.ghost);
    this.disposables.push(geometry, solid, ghost, this.texture);
    for (const side of [-1, 1]) {
      const hand = new THREE.Mesh(
        new THREE.SphereGeometry(RABBIT.hand.radius, 18, 14),
        new THREE.MeshStandardMaterial({ color: "white", roughness: 0.35 }),
      );
      const outline = new THREE.Mesh(
        new THREE.SphereGeometry(RABBIT.hand.radius + 1, 18, 14),
        new THREE.MeshBasicMaterial({ color: "black", side: THREE.BackSide }),
      );
      hand.add(outline);
      hand.renderOrder = RABBIT.order.solid;
      hand.position.set(side * 16, 20, 8);
      this.root.add(hand);
      this.hands.push(hand);
      this.disposables.push(
        hand.geometry,
        hand.material,
        outline.geometry,
        outline.material,
      );
    }
    const loader = new THREE.TextureLoader();
    this.ready = Promise.all([
      loader.loadAsync(appUrl("assets/rabbit-body.png")),
      loader.loadAsync(appUrl("assets/rabbit-head.png")),
      ...["low", "mid", "high"].map((name) =>
        loader.loadAsync(appUrl(`assets/rabbit-head-135-${name}.png`)),
      ),
    ]).then(([body, head, ...repairs]) => {
      this.repairedHeads = repairs.map((texture) => {
        const image = texture.image as HTMLImageElement;
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(image, 0, 0);
        const metrics = measureHead(
          {
            data: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
            w: canvas.width,
            h: canvas.height,
          },
          0.65,
        );
        texture.dispose();
        return { image, metrics };
      });
      this.compose(
        body.image as HTMLImageElement,
        head.image as HTMLImageElement,
      );
      body.dispose();
      head.dispose();
    });
  }
  configure(settings: RabbitSettings) {
    this.settings = settings;
    if (this.sources) this.compose(...this.sources);
  }
  /** Recompose from cached source measurements: editor and game use the same rig. */
  compose(body: HTMLImageElement, head: HTMLImageElement) {
    if (!this.sources) {
      this.sources = [body, head];
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 8; c++) {
          this.bodyMetrics.push(measureBody(mask(body, c, r), RABBIT.rows[r]));
          this.headMetrics.push(measureHead(mask(head, c, r)));
        }
    }
    const ctx = this.sheet.getContext("2d")!;
    ctx.clearRect(0, 0, this.sheet.width, this.sheet.height);
    const k = (RABBIT.headSize / RABBIT.bodySize) * SHEET_SCALE;
    this.metrics = [];
    for (let row = 0; row < 3; row++)
      for (let column = 0; column < 8; column++) {
        const elevation = RABBIT.rows[row];
        const tuning = this.settings.views[row * 8 + column];
        const b = this.bodyMetrics[tuning.bodyRow * 8 + tuning.bodyColumn];
        const h = this.headMetrics[tuning.headRow * 8 + tuning.headColumn];
        const ox = column * SHEET_W,
          oy = row * SHEET_H;
        // Body: feet on the anchor line, neck axis on the cell centre line.
        const bx = SHEET_W / 2 - b.neck.x * SHEET_SCALE,
          by = ANCHOR_Y - (b.feet + 1) * SHEET_SCALE;
        const neck = { x: SHEET_W / 2, y: by + b.neck.y * SHEET_SCALE };
        // Head: one head radius above the neck, foreshortened by the elevation, 2 px overlap.
        const lift = Math.max(0, h.radius * k * Math.cos(elevation) - 2);
        const hx = neck.x - h.centre.x * k,
          hy = neck.y - lift - h.centre.y * k;
        ctx.save();
        ctx.beginPath();
        ctx.rect(ox, oy, SHEET_W, SHEET_H);
        ctx.clip();
        ctx.translate(0, -tuning.ground);
        const part = (
          p: PartTuning,
          x: number,
          y: number,
          draw: () => void,
        ) => {
          if (!p.visible) return;
          ctx.save();
          ctx.translate(ox + x + p.x, oy + y - p.y);
          ctx.rotate((-p.rotation * Math.PI) / 180);
          ctx.scale(p.scale, p.scale);
          draw();
          ctx.restore();
        };
        part(tuning.body, neck.x, ANCHOR_Y, () =>
          ctx.drawImage(
            body,
            tuning.bodyColumn * STRIDE + INSET,
            tuning.bodyRow * STRIDE + INSET,
            CELL,
            CELL,
            bx - neck.x,
            by - ANCHOR_Y,
            CELL * SHEET_SCALE,
            CELL * SHEET_SCALE,
          ),
        );
        // The lowest row's complete black jaw extends a few pixels below y=256.
        // Sample through y=267 (the next ears start later), keeping the calibrated
        // centre/scale unchanged. The former 250px crop cut that outline off.
        const headHeight = tuning.headRow === 0 ? 264 : CELL;
        part(tuning.head, neck.x, neck.y - lift, () => {
          // The user's calibrated 135° views use source column 5. Replace its
          // illustration while retaining that source's head size and pivot.
          const repair =
            tuning.headColumn === 5
              ? this.repairedHeads[tuning.headRow]
              : undefined;
          if (repair) {
            const scale = (h.radius / repair.metrics.radius) * k;
            ctx.drawImage(
              repair.image,
              -repair.metrics.centre.x * scale,
              -repair.metrics.centre.y * scale,
              repair.image.naturalWidth * scale,
              repair.image.naturalHeight * scale,
            );
          } else
            ctx.drawImage(
              head,
              tuning.headColumn * STRIDE + INSET,
              tuning.headRow * STRIDE + INSET,
              CELL,
              headHeight,
              hx - neck.x,
              hy - neck.y + lift,
              CELL * k,
              headHeight * k,
            );
        });
        ctx.restore();
        this.metrics.push({
          feet: ANCHOR_Y - 1,
          headLift: lift,
          neck,
          headRadius: h.radius * k,
        });
      }
    this.texture.needsUpdate = true;
  }
  /** Ball centre and radius in rabbit-local units, mirroring Game.animateWorld. */
  static ballLocal(radius: number, scale: number) {
    return {
      center: new THREE.Vector3(
        0,
        Math.max(4, radius * 0.85) / scale,
        (RABBIT.ballGap * scale + radius) / scale,
      ),
      radius: (radius * 0.83) / scale,
    };
  }
  /** Nearest atlas frame with hysteresis: no flicker on an azimuth or row boundary. */
  pick(cameraAzimuth: number, heading: number, elevation: number): Frame {
    const nearest = rabbitFrame(cameraAzimuth, heading, elevation);
    const relative = heading - cameraAzimuth;
    const diff = Math.atan2(
      Math.sin(relative - (this.frame.column * Math.PI) / 4),
      Math.cos(relative - (this.frame.column * Math.PI) / 4),
    );
    const column =
      Math.abs(diff) > Math.PI / 8 + 0.09 ? nearest.column : this.frame.column;
    const edges = [0.35, 1.03];
    let row = this.frame.row;
    if (row < 2 && elevation > edges[row] + 0.05) row++;
    else if (row > 0 && elevation < edges[row - 1] - 0.05) row--;
    return { column, row };
  }
  update(
    camera: THREE.Camera,
    heading: number,
    radius: number,
    scale: number,
    time: number,
    speed: number,
  ) {
    const delta = camera.position
      .clone()
      .sub(this.root.getWorldPosition(new THREE.Vector3()));
    const elevation = Math.atan2(delta.y, Math.hypot(delta.x, delta.z));
    this.frame = this.pick(Math.atan2(delta.x, delta.z), heading, elevation);
    const { column, row } = this.frame;
    const m = Math.min(1, speed / 200);
    const bob = Math.abs(Math.sin(time * 11)) * 1.4 * m;
    for (const mesh of [this.sprite, this.ghost]) {
      mesh.material.uniforms.offset.value.set(column / 8, 1 - (row + 1) / 3);
      mesh.material.uniforms.bob.value = bob;
    }
    const view = this.settings.views[row * 8 + column];
    const localCamera = this.root.worldToLocal(camera.position.clone());
    const azimuth = Math.atan2(localCamera.x, localCamera.z),
      unit = RABBIT.bodySize / (CELL * SHEET_SCALE);
    this.hands.forEach((hand, i) => {
      const side = i ? 1 : -1,
        p = i ? view.rightHand : view.leftHand;
      if (radius > 0) {
        const ball = Rabbit.ballLocal(radius, scale);
        const y = THREE.MathUtils.clamp(
          ball.center.y - ball.radius * 0.15,
          14,
          40,
        );
        const dy = THREE.MathUtils.clamp(
            (y - ball.center.y) / ball.radius,
            -0.92,
            0.5,
          ),
          k = Math.sqrt(1 - dy * dy);
        const dir = new THREE.Vector3(
          side * Math.sin(0.62) * k,
          dy,
          -Math.cos(0.62) * k,
        );
        hand.position
          .copy(ball.center)
          .addScaledVector(dir, ball.radius + RABBIT.hand.radius * 0.4);
        if (Math.abs(hand.position.x) < 13) hand.position.x = side * 13;
      } else
        hand.position.set(
          side * 16,
          20 + bob + Math.sin(time * 2 + i) * 0.6,
          8 + m * 5,
        );
      hand.position.x += p.x * unit * Math.cos(azimuth);
      hand.position.z -= p.x * unit * Math.sin(azimuth);
      hand.position.y += (p.y + view.ground) * unit;
      hand.scale.setScalar(p.scale);
      hand.visible = p.visible;
      (hand.material as THREE.Material).depthTest = !p.front;
      ((hand.children[0] as THREE.Mesh).material as THREE.Material).depthTest =
        !p.front;
    });
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.root.removeFromParent();
  }
}
