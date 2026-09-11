import * as THREE from "three";
import { maxCollectionRadius, type Level, type Piece } from "./shared";
import { PickupIndex, combinedPiece } from "./grouping";
import { Rabbit, RABBIT } from "./rabbit";
import { WorldSurface } from "./world";
import { LayeredPile, type PackedFragment } from "./pile";

export type PickupEvent = {
  id: number;
  big: boolean;
  label: string;
  /** Screen position inside the stage, CSS px. */
  x: number;
  y: number;
};
export type Stats = {
  count: number;
  percent: number;
  radius: number;
  time: number;
  score: number;
  label: string;
  free: boolean;
  zoom: number;
  done: boolean;
  ready: boolean;
  error: string;
  pickups: PickupEvent[];
};
type Item = Piece & {
  gone: boolean;
  mesh?: THREE.Group;
  paper?: THREE.Mesh<
    THREE.PlaneGeometry,
    THREE.MeshBasicMaterial | THREE.MeshStandardMaterial
  >;
  start?: THREE.Vector3;
  pickedAt: number;
  normal: THREE.Vector3;
  curled: boolean;
  members?: Item[];
  packed?: PackedFragment;
  flightAge?: number;
};
const UP = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp;

export class Game {
  canvas: HTMLCanvasElement;
  level: Level;
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(48, 1, 1, 30000);
  items: Item[];
  pickupIndex: PickupIndex<Item>;
  rabbit!: Rabbit;
  lastSound = -Infinity;
  visualBites = 0;
  /** Recent bites with their world position, projected for HUD feedback. Bounded. */
  recent: { id: number; big: boolean; label: string; x: number; z: number; time: number }[] = [];
  surface?: WorldSurface;
  collection?: LayeredPile;
  flights: Item[] = [];
  maxRadius = 360;
  particleGeometry?: THREE.BoxGeometry;
  particleMaterials: THREE.MeshBasicMaterial[] = [];
  character = new THREE.Group();
  pile = new THREE.Group();
  pileShadow?: THREE.Mesh;
  legs: THREE.Mesh[] = [];
  arms: THREE.Mesh[] = [];
  starterCapacity = 15;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  radius = 0;
  area = 0;
  count = 0;
  mass = 0;
  total = 0;
  score = 0;
  time = 0;
  done = false;
  paused = false;
  muted = false;
  ready = false;
  error = "";
  label = "Walk up to a little piece. Your collection starts there.";
  labelUntil = 7;
  heading = Math.PI;
  keys = new Set<string>();
  cam = {
    yaw: 0,
    pitch: 0.88,
    userZoom: 1,
    free: false,
    target: new THREE.Vector3(),
    pan: new THREE.Vector3(),
  };
  atlas = new Image();
  background = new Image();
  attached: Item[] = [];
  particles: { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number }[] = [];
  raf = 0;
  last = 0;
  reportAt = 0;
  width = 0;
  height = 0;
  disposed = false;
  audio?: AudioContext;
  handlers: (() => void)[] = [];
  drag?: { x: number; y: number; pan: boolean; id: number };
  touch?: { x: number; y: number; id: number };
  stick = { x: 0, y: 0 };
  reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  textures: THREE.Texture[] = [];
  geometries: THREE.BufferGeometry[] = [];
  materials: THREE.Material[] = [];
  mapCanvas = document.createElement("canvas");
  mapContext = this.mapCanvas.getContext("2d")!;
  constructor(
    canvas: HTMLCanvasElement,
    level: Level,
    public report: (s: Stats) => void,
    public onPause: () => void,
    mapHost?: HTMLElement | null,
  ) {
    this.canvas = canvas;
    this.level = level;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor("#000000");
    this.scene.fog = new THREE.Fog("#000000", 3200, 10000);
    this.scene.add(new THREE.HemisphereLight("#ffffff", "#777777", 2.6));
    const light = new THREE.DirectionalLight("#ffffff", 3);
    light.position.set(-300, 700, 300);
    this.scene.add(light);
    this.items = level.pieces.map((p) => ({
      ...p,
      gone: false,
      pickedAt: 0,
      curled: false,
      normal: new THREE.Vector3(),
    }));
    this.pickupIndex = new PickupIndex(this.items);
    this.maxRadius = maxCollectionRadius(this.items.length);
    this.starterCapacity = Math.max(
      15,
      Math.min(...this.items.map((p) => p.threshold)),
    );
    this.total = this.items.reduce((s, p) => s + p.mass, 0);
    const first =
      [...this.items]
        .filter((p) => p.threshold <= 15 && p.y < 1800)
        .sort((a, b) => a.threshold - b.threshold || a.y - b.y)[0] ??
      [...this.items].sort((a, b) => a.threshold - b.threshold)[0];
    if (first) {
      const cx = first.x + first.width / 2,
        cy = first.y + first.height / 2;
      const options = [
        { x: first.x - 40, y: cy },
        { x: first.x + first.width + 40, y: cy },
        { x: cx, y: first.y + first.height + 45 },
        { x: cx, y: first.y - 45 },
      ];
      const spawn = options.find(
        (pos) =>
          pos.x >= 18 &&
          pos.x <= level.width - 18 &&
          pos.y >= 18 &&
          pos.y <= level.height - 18 &&
          this.items
            .filter((p) => p.threshold <= this.starterCapacity)
            .every(
              (p) =>
                Math.hypot(
                  pos.x - clamp(pos.x, p.x, p.x + p.width),
                  pos.y - clamp(pos.y, p.y, p.y + p.height),
                ) > 20,
            ),
      ) ?? { x: 18, y: 18 };
      this.x = spawn.x;
      this.y = spawn.y;
    }
    this.cam.target.set(this.x, 15, this.y);
    this.buildCharacter();
    this.scene.add(this.character, this.pile);
    this.pileShadow = new THREE.Mesh(
      this.ownGeometry(new THREE.CircleGeometry(1, 32)),
      this.ownMaterial(
        new THREE.MeshBasicMaterial({
          color: "#000000",
          transparent: true,
          opacity: 0.2,
          depthWrite: false,
        }),
      ),
    );
    this.pileShadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.pileShadow);
    this.bind();
    this.mapCanvas.className = "world-map";
    this.mapCanvas.width = 240;
    this.mapCanvas.height = 156;
    this.mapCanvas.setAttribute(
      "aria-label",
      "Map of the website; red dot is your character",
    );
    (mapHost ?? canvas.parentElement)?.append(this.mapCanvas);
    void this.loadWorld();
    this.raf = requestAnimationFrame(this.frame);
  }
  get capacity() {
    return Math.sqrt(this.starterCapacity ** 2 + this.area);
  }
  ownGeometry<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g);
    return g;
  }
  ownMaterial<T extends THREE.Material>(m: T): T {
    this.materials.push(m);
    return m;
  }
  solid(color: string) {
    return this.ownMaterial(
      new THREE.MeshStandardMaterial({ color, roughness: 0.82 }),
    );
  }
  buildCharacter() {
    this.rabbit = new Rabbit();
    this.character.add(this.rabbit.root);
  }
  texture(
    source: CanvasImageSource,
    x: number,
    y: number,
    w: number,
    h: number,
    max = 1024,
  ) {
    const c = document.createElement("canvas"),
      ratio = Math.min(1, max / Math.max(w, h));
    c.width = Math.max(1, Math.ceil(w * ratio));
    c.height = Math.max(1, Math.ceil(h * ratio));
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(source, x, y, w, h, 0, 0, c.width, c.height);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.textures.push(t);
    return t;
  }
  async loadWorld() {
    try {
      this.atlas.src = this.level.atlas;
      const promises = [this.atlas.decode(), this.rabbit.ready];
      if (this.level.background) {
        this.background.src = this.level.background;
        promises.push(this.background.decode());
      }
      await Promise.all(promises);
      if (this.disposed) return;
      this.surface = new WorldSurface(
        this.level,
        this.atlas,
        this.level.background ? this.background : undefined,
        this.scene,
        Math.min(8, this.renderer.capabilities.getMaxAnisotropy()),
      );
      this.collection = new LayeredPile(this.pile, this.atlas);
      const slab = new THREE.Mesh(
        this.ownGeometry(
          new THREE.BoxGeometry(
            this.level.width + 8,
            12,
            this.level.height + 8,
          ),
        ),
        this.solid("#111111"),
      );
      slab.position.set(this.level.width / 2, -7, this.level.height / 2);
      this.scene.add(slab);
      this.ready = true;
    } catch (e) {
      if (!this.disposed) {
        this.error = `Could not build the 3D world: ${(e as Error).message}`;
        this.label = this.error;
        this.labelUntil = Infinity;
      }
    }
  }
  bind() {
    const on = (
      target: EventTarget,
      name: string,
      fn: EventListener,
      options?: AddEventListenerOptions,
    ) => {
      target.addEventListener(name, fn, options);
      this.handlers.push(() => target.removeEventListener(name, fn, options));
    };
    on(window, "keydown", ((e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(
          e.code,
        )
      )
        e.preventDefault();
      this.keys.add(e.code);
      if (e.repeat) return;
      if (e.code === "Space") this.recenter();
      if (e.code === "KeyR") this.resetCamera();
      if (e.code === "Escape") this.onPause();
      if (e.code === "Equal") this.zoom(1.15);
      if (e.code === "Minus") this.zoom(0.87);
    }) as EventListener);
    on(window, "keyup", ((e: KeyboardEvent) => {
      this.keys.delete(e.code);
    }) as EventListener);
    on(window, "blur", (() => {
      this.keys.clear();
      this.stick = { x: 0, y: 0 };
      if (!this.paused && !this.done) this.onPause();
    }) as EventListener);
    on(
      this.canvas,
      "wheel",
      ((e: WheelEvent) => {
        e.preventDefault();
        this.zoom(Math.exp(-e.deltaY * 0.001));
      }) as EventListener,
      { passive: false },
    );
    on(this.canvas, "contextmenu", (e) => e.preventDefault());
    on(this.canvas, "pointerdown", ((e: PointerEvent) => {
      this.canvas.setPointerCapture(e.pointerId);
      if (
        e.pointerType === "touch" &&
        e.clientX < this.canvas.getBoundingClientRect().left + this.width / 2
      ) {
        this.touch = { x: e.clientX, y: e.clientY, id: e.pointerId };
      } else {
        const pan = e.button === 2 || e.shiftKey;
        this.drag = { x: e.clientX, y: e.clientY, id: e.pointerId, pan };
        if (pan) this.cam.free = true;
      }
    }) as EventListener);
    on(this.canvas, "pointermove", ((e: PointerEvent) => {
      if (this.touch?.id === e.pointerId) {
        this.stick = {
          x: clamp((e.clientX - this.touch.x) / 60, -1, 1),
          y: clamp((e.clientY - this.touch.y) / 60, -1, 1),
        };
      } else if (this.drag?.id === e.pointerId) {
        const dx = e.clientX - this.drag.x,
          dy = e.clientY - this.drag.y;
        if (this.drag.pan) {
          const scale = (1 + this.radius / 120) / this.cam.userZoom;
          this.cam.pan.x -=
            (dx * Math.cos(this.cam.yaw) + dy * Math.sin(this.cam.yaw)) * scale;
          this.cam.pan.z -=
            (dy * Math.cos(this.cam.yaw) - dx * Math.sin(this.cam.yaw)) * scale;
        } else {
          this.cam.yaw -= dx * 0.006;
          this.cam.pitch = clamp(this.cam.pitch + dy * 0.005, 0.32, 1.43);
        }
        this.drag.x = e.clientX;
        this.drag.y = e.clientY;
      }
    }) as EventListener);
    const release = ((e: PointerEvent) => {
      if (this.touch?.id === e.pointerId) {
        this.touch = undefined;
        this.stick = { x: 0, y: 0 };
      }
      if (this.drag?.id === e.pointerId) this.drag = undefined;
    }) as EventListener;
    on(this.canvas, "pointerup", release);
    on(this.canvas, "pointercancel", release);
    on(this.canvas, "webglcontextlost", ((e: Event) => {
      e.preventDefault();
      this.error =
        "The graphics context was interrupted. Reload the world to continue.";
      this.paused = true;
    }) as EventListener);
  }
  zoom(factor: number) {
    this.cam.userZoom = clamp(this.cam.userZoom * factor, 0.3, 2.8);
  }
  recenter() {
    this.cam.free = false;
    this.cam.pan.set(0, 0, 0);
  }
  resetCamera() {
    this.recenter();
    this.cam.yaw = 0;
    this.cam.pitch = 0.88;
    this.cam.userZoom = 1;
  }
  sound(block = false) {
    if (this.muted || this.time - this.lastSound < 0.065) return;
    this.lastSound = this.time;
    try {
      this.audio ??= new AudioContext();
      void this.audio.resume();
      const o = this.audio.createOscillator(),
        g = this.audio.createGain();
      o.connect(g);
      g.connect(this.audio.destination);
      o.type = block ? "triangle" : "sine";
      o.frequency.setValueAtTime(
        block ? 95 : 340 + Math.random() * 450,
        this.audio.currentTime,
      );
      o.frequency.exponentialRampToValueAtTime(
        block ? 55 : 1100,
        this.audio.currentTime + 0.12,
      );
      g.gain.setValueAtTime(0.025, this.audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.audio.currentTime + 0.15);
      o.start();
      o.stop(this.audio.currentTime + 0.16);
    } catch {}
  }
  pickup(seed: Item, candidates: Item[] = [seed]) {
    if (seed.gone || !this.collection || !this.surface) return;
    const members = candidates.filter(
      (p) => !p.gone && p.threshold <= this.capacity,
    );
    if (!members.length) return;
    const combined = combinedPiece(members);
    const p: Item =
      members.length === 1
        ? seed
        : { ...seed, ...combined, normal: new THREE.Vector3() };
    if (members.length > 1) p.members = members;
    for (const member of members) {
      member.gone = true;
      member.pickedAt = this.time;
      this.attached.push(member);
      this.count++;
      this.mass += member.mass;
      this.score += member.score;
      this.area += member.growthValue;
      this.surface.erase(member);
    }
    p.gone = true;
    p.pickedAt = this.time;
    this.visualBites++;
    this.radius = Math.min(this.maxRadius, Math.max(5, Math.sqrt(this.area)));
    if (this.count === this.items.length) this.surface.clear();
    p.packed = this.collection.allocate(p, this.radius);
    p.normal.copy(p.packed.normal);
    for (const member of members) {
      member.packed = p.packed;
      member.normal.copy(p.normal);
    }
    if (this.flights.length < 32) {
      p.mesh = new THREE.Group();
      p.start = new THREE.Vector3(p.x + p.width / 2, 2, p.y + p.height / 2);
      p.mesh.position.copy(p.start);
      p.paper = new THREE.Mesh(
        this.collection.flightGeometry(p.packed),
        p.packed.layer.mesh.material,
      );
      p.mesh.add(p.paper);
      this.scene.add(p.mesh);
      this.flights.push(p);
    } else {
      this.collection.bake(p.packed);
      p.curled = true;
      p.members?.forEach((member) => (member.curled = true));
    }
    this.label =
      this.count === 1
        ? "Your first piece. Keep walking — it will grow."
        : `+ ${p.text.slice(0, 42) || p.type.toLowerCase()}`;
    this.labelUntil = this.time + 2;
    this.recent.push({
      id: this.visualBites,
      big: members.length >= 4,
      label: members.length > 1 ? `${members.length} pieces` : p.text.slice(0, 32) || p.type.toLowerCase(),
      x: p.x + p.width / 2,
      z: p.y + p.height / 2,
      time: this.time,
    });
    if (this.recent.length > 6) this.recent.splice(0, this.recent.length - 6);
    this.sound();
    if (!this.reduced && this.particles.length < 80) {
      for (let i = 0; i < 5; i++) {
        this.particleGeometry ??= this.ownGeometry(
          new THREE.BoxGeometry(3, 3, 3),
        );
        if (!this.particleMaterials.length)
          this.particleMaterials = ["#ff1717", "#ffffff"].map((color) =>
            this.ownMaterial(new THREE.MeshBasicMaterial({ color })),
          );
        const m = new THREE.Mesh(
          this.particleGeometry,
          this.particleMaterials[i % 2],
        );
        m.position.set(p.x + p.width / 2, 8, p.y + p.height / 2);
        this.scene.add(m);
        this.particles.push({
          mesh: m,
          velocity: new THREE.Vector3(
            (Math.random() - 0.5) * 100,
            80 + Math.random() * 80,
            (Math.random() - 0.5) * 100,
          ),
          life: 0.5,
        });
      }
    }
  }
  update(dt: number) {
    if (!this.ready || this.error) return;
    this.time += dt;
    let side =
      (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0) -
      (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0) +
      this.stick.x;
    let forward =
      (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0) -
      (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0) -
      this.stick.y;
    const len = Math.hypot(side, forward);
    if (len > 1) {
      side /= len;
      forward /= len;
    }
    const ax = side * Math.cos(this.cam.yaw) - forward * Math.sin(this.cam.yaw),
      az = -side * Math.sin(this.cam.yaw) - forward * Math.cos(this.cam.yaw);
    const accel = 680 + this.radius * 2.3;
    this.vx = (this.vx + ax * accel * dt) * Math.exp(-4 * dt);
    this.vy = (this.vy + az * accel * dt) * Math.exp(-4 * dt);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const speed = Math.hypot(this.vx, this.vy);
    if (speed > 4) {
      const target = Math.atan2(this.vx, this.vy);
      this.heading +=
        Math.atan2(
          Math.sin(target - this.heading),
          Math.cos(target - this.heading),
        ) * Math.min(1, dt * 12);
    }
    this.x = clamp(this.x, 18, this.level.width - 18);
    this.y = clamp(this.y, 18, this.level.height - 18);
    const reach = this.count ? this.radius : 13;
    const offset = this.count ? RABBIT.ballGap + this.radius : 0;
    const px = this.x + Math.sin(this.heading) * offset,
      pz = this.y + Math.cos(this.heading) * offset;
    const nearby = new Set([
      ...this.pickupIndex.near(px, pz, reach + 6),
      ...this.pickupIndex.near(this.x, this.y, 15),
    ]);
    for (const p of nearby) {
      if (p.gone) continue;
      const near = (x: number, z: number) => {
        const dx = x - clamp(x, p.x, p.x + p.width),
          dz = z - clamp(z, p.y, p.y + p.height);
        return { dx, dz, d: Math.hypot(dx, dz) };
      };
      const contact = near(px, pz),
        feet = near(this.x, this.y);
      const can = this.capacity >= p.threshold;
      if (can && (contact.d <= reach + 5 || feet.d <= 14)) {
        this.pickup(p, this.pickupIndex.group(p, this.radius, this.capacity));
      }
    }
    if (this.count && speed > 1) {
      const axis = new THREE.Vector3(this.vy, 0, -this.vx).normalize();
      this.pile.quaternion.premultiply(
        new THREE.Quaternion().setFromAxisAngle(
          axis,
          (speed * dt) / Math.max(this.radius, 12),
        ),
      );
    }
    this.done = this.count === this.items.length;
  }
  animateWorld(dt: number) {
    const speed = Math.hypot(this.vx, this.vy);
    this.character.position.set(this.x, 0, this.y);
    this.character.rotation.y = this.heading;
    const scale = 1 + Math.min(0.8, this.radius / 380);
    this.character.scale.setScalar(scale);
    this.rabbit.update(
      this.camera,
      this.heading,
      this.radius,
      scale,
      this.time,
      speed,
    );
    if (this.count && !this.paused && !this.reduced)
      this.pile.rotateY(dt * 0.24);
    this.pile.position.set(
      this.x + Math.sin(this.heading) * (RABBIT.ballGap * scale + this.radius),
      Math.max(12, this.radius),
      this.y + Math.cos(this.heading) * (RABBIT.ballGap * scale + this.radius),
    );
    if (this.pileShadow) {
      this.pileShadow.visible = this.count > 0;
      this.pileShadow.position.set(
        this.pile.position.x,
        0.8,
        this.pile.position.z,
      );
      this.pileShadow.scale.setScalar(this.radius * 1.02);
    }
    this.pile.updateMatrixWorld(true);
    for (const p of this.flights) {
      if (!p.mesh || !p.paper || !p.packed) continue;
      const f = p.packed;
      p.flightAge = Math.max(
        (p.flightAge ?? 0) + (this.done ? dt : 0),
        this.time - p.pickedAt,
      );
      const t = clamp(p.flightAge / 0.65, 0, 1),
        ease = 1 - (1 - t) ** 3;
      const target = f.normal.clone().multiplyScalar(f.depth),
        destination = this.pile.localToWorld(target);
      p.mesh.position.copy(p.start!).lerp(destination, ease);
      p.mesh.position.y += Math.sin(t * Math.PI) * Math.max(25, f.depth);
      p.mesh.quaternion
        .identity()
        .slerp(this.pile.quaternion.clone().multiply(f.orientation), ease);
      p.paper.rotation.x = THREE.MathUtils.lerp(-Math.PI / 2, 0, ease);
      const positions = p.paper.geometry.attributes.position;
      for (let i = 0; i < 81; i++) {
        const u = (i % 9) / 8 - 0.5,
          v = 0.5 - Math.floor(i / 9) / 8;
        positions.setXYZ(
          i,
          THREE.MathUtils.lerp(u * p.width, f.positions[i * 3], ease),
          THREE.MathUtils.lerp(v * p.height, f.positions[i * 3 + 1], ease),
          f.positions[i * 3 + 2] * ease,
        );
      }
      positions.needsUpdate = true;
      p.paper.geometry.computeVertexNormals();
      p.paper.geometry.computeBoundingSphere();
      if (t === 1) {
        this.collection!.bake(f);
        p.curled = true;
        p.members?.forEach((member) => (member.curled = true));
        p.mesh.removeFromParent();
        p.paper.geometry.dispose();
        p.mesh = undefined;
        p.paper = undefined;
      }
    }
    this.flights = this.flights.filter((p) => !p.curled);
    for (const p of this.particles) {
      if (!this.paused) {
        p.life -= dt;
        p.velocity.y -= 250 * dt;
        p.mesh.position.addScaledVector(p.velocity, dt);
      }
      p.mesh.scale.setScalar(Math.max(0, p.life * 2));
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
      }
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }
  updateCamera(dt: number) {
    if (this.keys.has("KeyQ")) this.cam.yaw += dt * 1.5;
    if (this.keys.has("KeyE")) this.cam.yaw -= dt * 1.5;
    const look = new THREE.Vector3(
      this.x + this.vx * 0.15,
      Math.max(15, this.radius * 0.65),
      this.y + this.vy * 0.15,
    );
    look.add(this.cam.pan);
    this.cam.target.lerp(look, 1 - Math.exp(-6 * dt));
    const distance = (460 + this.radius * 4.1) / this.cam.userZoom;
    const offset = new THREE.Vector3(
      Math.sin(this.cam.yaw) * Math.cos(this.cam.pitch),
      Math.sin(this.cam.pitch),
      Math.cos(this.cam.yaw) * Math.cos(this.cam.pitch),
    ).multiplyScalar(distance);
    const desired = this.cam.target.clone().add(offset);
    this.camera.position.lerp(desired, 1 - Math.exp(-10 * dt));
    this.camera.lookAt(this.cam.target);
  }
  /** World point → CSS px inside the stage canvas. */
  project(x: number, y: number, z: number) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: ((v.x + 1) / 2) * this.width, y: ((1 - v.y) / 2) * this.height, behind: v.z > 1 };
  }
  drawMap() {
    const c = this.mapContext,
      w = 216,
      h = 118,
      x = 12,
      y = 26;
    c.clearRect(0, 0, 240, 156);
    c.fillStyle = "#ffffff";
    c.fillRect(0, 0, 240, 156);
    c.fillStyle = "#000000";
    c.font = "9px monospace";
    c.fillText("YOU ARE HERE", 10, 15);
    c.fillStyle = "#ececec";
    c.fillRect(x, y, w, h);
    for (const p of this.items) {
      if (p.gone) continue;
      c.fillStyle = p.threshold <= this.capacity ? "#111111" : "#c9c9c9";
      c.fillRect(
        x + (p.x / this.level.width) * w,
        y + (p.y / this.level.height) * h,
        Math.max(1, (p.width / this.level.width) * w),
        Math.max(1, (p.height / this.level.height) * h),
      );
    }
    c.fillStyle = "#ff1717";
    c.beginPath();
    c.arc(
      x + (this.x / this.level.width) * w,
      y + (this.y / this.level.height) * h,
      3.5,
      0,
      Math.PI * 2,
    );
    c.fill();
  }
  frame = (now: number) => {
    if (this.disposed) return;
    const dt = Math.min((now - this.last) / 1000 || 0.016, 0.15);
    this.last = now;
    const w = this.canvas.clientWidth,
      h = this.canvas.clientHeight;
    if (this.width !== w || this.height !== h) {
      this.width = w;
      this.height = h;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / Math.max(1, h);
      this.camera.updateProjectionMatrix();
    }
    if (!this.paused && !this.done) {
      let remaining = dt;
      while (remaining > 0) {
        const step = Math.min(remaining, 1 / 60);
        this.update(step);
        remaining -= step;
      }
    }
    this.animateWorld(dt);
    this.updateCamera(dt);
    this.surface?.flush();
    this.renderer.render(this.scene, this.camera);
    if (now - this.reportAt > 100) {
      this.reportAt = now;
      this.drawMap();
      this.report({
        count: this.count,
        percent: this.total ? (100 * this.mass) / this.total : 0,
        radius: this.radius,
        time: this.time,
        score: this.score,
        label: this.time < this.labelUntil ? this.label : "",
        free: this.cam.free,
        zoom: this.cam.userZoom,
        done: this.done,
        ready: this.ready,
        error: this.error,
        pickups: this.recent
          .filter((r) => this.time - r.time < 1.2)
          .map((r) => {
            const s = this.project(r.x, 6, r.z);
            return { id: r.id, big: r.big, label: r.label, x: s.x, y: s.y };
          }),
      });
    }
    this.raf = requestAnimationFrame(this.frame);
  };
  destroy() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.handlers.forEach((fn) => fn());
    this.mapCanvas.remove();
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
    this.textures.forEach((t) => t.dispose());
    this.surface?.dispose();
    this.collection?.dispose();
    for (const p of this.flights) p.paper?.geometry.dispose();
    this.rabbit.dispose();
    this.scene.clear();
    this.renderer.dispose();
    void this.audio?.close();
  }
}
