import * as THREE from "three";
import type { Piece } from "./shared";

/**
 * One-off set pieces: the rabbit's drop onto the page at the start and the
 * victory burst at the end. Everything here is temporary geometry that
 * disposes itself; the playable world is never modified.
 */
type Tile = { y: number; height: number; texture: THREE.Texture; mesh: THREE.Mesh };
type Hopper = { mesh: THREE.Mesh; shadow: THREE.Mesh; delay: number; height: number; tilt: THREE.Vector2; age: number };
type Bit = { mesh: THREE.Mesh; velocity: THREE.Vector3; spin: THREE.Vector3; life: number };

const DROP_HEIGHT = 520;
/** Seconds from the top to the page; main starts the fall so it lands on "GO". */
export const FALL = 0.42;
const HOP = 0.42;

export class Stunts {
  /** Rabbit height above the page while it falls. */
  lift = 0;
  /** Vertical squash of the rabbit after landing (1 = none). */
  squash = 1;
  /** Camera offset for the landing shake; the camera adds it on top of its follow. */
  shake = new THREE.Vector3();
  state: "waiting" | "falling" | "landed" = "waiting";
  celebrating = false;
  private t = 0;
  private trauma = 0;
  private sinceLanding = Infinity;
  private since = 0;
  private hoppers: Hopper[] = [];
  private bits: Bit[] = [];
  private ring?: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private tiles: Tile[] = [];
  private tileMaterials = new Map<THREE.Texture, THREE.MeshBasicMaterial>();
  private shadowMaterial = new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.16, depthWrite: false });
  private bitGeometry = new THREE.PlaneGeometry(1, 1);
  private bitMaterials = ["#ff1717", "#ffffff", "#111111"].map(
    (color) => new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }),
  );
  private x = 0;
  private z = 0;
  private pieces: Piece[] = [];

  constructor(
    private scene: THREE.Scene,
    private reduced: boolean,
  ) {
    if (reduced) this.state = "landed";
    else this.lift = DROP_HEIGHT;
  }

  /** Starts the fall onto (x, z). `pieces` are the page pieces that may hop on impact. */
  drop(x: number, z: number, pieces: Piece[], tiles: Tile[], onLand: () => void) {
    if (this.state !== "waiting") return;
    this.state = "falling";
    this.t = 0;
    this.x = x;
    this.z = z;
    this.pieces = pieces;
    this.tiles = tiles;
    this.onLand = onLand;
  }
  private onLand = () => {};

  private land() {
    this.state = "landed";
    this.lift = 0;
    this.sinceLanding = 0;
    this.trauma = 1;
    this.onLand();
    this.shockwave();
    this.hop();
    this.burst(new THREE.Vector3(this.x, 4, this.z), 26, 150, 220);
  }

  private shockwave() {
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.94, 1, 96),
      new THREE.MeshBasicMaterial({ color: "#ff1717", transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.set(this.x, 1.2, this.z);
    this.ring.scale.setScalar(1);
    this.scene.add(this.ring);
  }

  /** The nearest pieces jump in a wave that travels out from the landing spot. */
  private hop() {
    const reach = 300;
    const near = this.pieces
      .map((p) => ({ p, d: Math.hypot(p.x + p.width / 2 - this.x, p.y + p.height / 2 - this.z) }))
      .filter(({ p, d }) => d < reach && p.width * p.height < 90_000 && p.width > 4 && p.height > 4)
      .sort((a, b) => a.d - b.d)
      .slice(0, 18);
    for (const { p, d } of near) {
      const tile = this.tiles.find((t) => p.y >= t.y && p.y + p.height <= t.y + t.height);
      if (!tile) continue;
      const geometry = new THREE.PlaneGeometry(p.width, p.height);
      const u0 = p.x / (tile.texture.image as HTMLCanvasElement).width,
        u1 = (p.x + p.width) / (tile.texture.image as HTMLCanvasElement).width,
        v0 = 1 - (p.y - tile.y) / tile.height,
        v1 = 1 - (p.y + p.height - tile.y) / tile.height;
      // PlaneGeometry vertices: top-left, top-right, bottom-left, bottom-right.
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute([u0, v0, u1, v0, u0, v1, u1, v1], 2));
      let material = this.tileMaterials.get(tile.texture);
      if (!material) {
        material = new THREE.MeshBasicMaterial({ map: tile.texture, side: THREE.DoubleSide });
        this.tileMaterials.set(tile.texture, material);
      }
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(p.x + p.width / 2, 0.4, p.y + p.height / 2);
      const shadow = new THREE.Mesh(geometry, this.shadowMaterial);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.set(mesh.position.x, 0.3, mesh.position.z);
      shadow.visible = false;
      this.scene.add(shadow, mesh);
      const strength = 1 - d / reach;
      this.hoppers.push({
        mesh,
        shadow,
        delay: d / 1100,
        height: 10 + 30 * strength,
        tilt: new THREE.Vector2((Math.random() - 0.5) * 0.5 * strength, (Math.random() - 0.5) * 0.5 * strength),
        age: 0,
      });
    }
  }

  /** Paper confetti: flat red, white and black shards. */
  burst(at: THREE.Vector3, count: number, speed: number, up: number) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.bitGeometry, this.bitMaterials[i % 3]);
      const size = 4 + Math.random() * 9;
      mesh.scale.set(size, size * (0.5 + Math.random()), 1);
      mesh.position.copy(at);
      const a = Math.random() * Math.PI * 2;
      this.bits.push({
        mesh,
        velocity: new THREE.Vector3(Math.cos(a) * speed * (0.4 + Math.random()), up * (0.6 + Math.random() * 0.8), Math.sin(a) * speed * (0.4 + Math.random())),
        spin: new THREE.Vector3(Math.random() * 9, Math.random() * 9, Math.random() * 9),
        life: 1.4 + Math.random() * 0.8,
      });
      this.scene.add(mesh);
    }
  }

  /** Victory: volleys of confetti out of the ball while the rabbit dances. */
  celebrate(ball: () => THREE.Vector3, radius: () => number) {
    if (this.celebrating) return;
    this.celebrating = true;
    this.since = 0;
    this.ball = ball;
    this.ballRadius = radius;
    this.volleys = this.reduced ? [] : [0.2, 1.2, 2.2, 3.2];
  }
  private ball = () => new THREE.Vector3();
  private ballRadius = () => 0;
  private volleys: number[] = [];

  /** Rabbit's victory hops, as a height offset. */
  get cheer() {
    if (!this.celebrating || this.reduced) return 0;
    const t = this.since % 0.5;
    return Math.max(0, Math.sin((t / 0.5) * Math.PI)) * 30;
  }
  /** Side-to-side dance twist added to the rabbit's heading. */
  get dance() {
    if (!this.celebrating || this.reduced) return 0;
    return Math.sin(this.since * 6.3) * 0.7;
  }

  update(dt: number) {
    if (this.state === "falling") {
      this.t += dt;
      const u = Math.min(1, this.t / FALL);
      this.lift = DROP_HEIGHT * (1 - u * u);
      if (u >= 1) this.land();
    }
    this.since += dt;
    this.sinceLanding += dt;
    while (this.celebrating && this.volleys.length && this.since >= this.volleys[0]) {
      const first = this.volleys.length === 4;
      this.volleys.shift();
      const r = this.ballRadius(),
        top = this.ball().clone();
      top.y += r;
      this.burst(top, first ? 80 : 50, 160 + r * 0.8, 260 + r);
      if (first) this.trauma = 0.45;
    }
    const s = this.sinceLanding;
    // Squash on touchdown, one small rebound.
    this.squash = s < 0.45 ? 1 - 0.28 * Math.exp(-9 * s) * Math.cos(s * 22) : 1;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const amount = this.trauma * this.trauma * 26;
    this.shake.set((Math.random() - 0.5) * amount, (Math.random() - 0.5) * amount * 0.6, (Math.random() - 0.5) * amount);

    if (this.ring) {
      const age = s;
      this.ring.scale.setScalar(20 + age * 700);
      this.ring.material.opacity = Math.max(0, 1 - age * 2.4);
      if (age > 0.42) {
        this.ring.removeFromParent();
        this.ring.geometry.dispose();
        this.ring.material.dispose();
        this.ring = undefined;
      }
    }

    for (const h of this.hoppers) {
      h.age += dt;
      const u = (h.age - h.delay) / HOP;
      if (u <= 0) continue;
      const k = Math.min(1, u);
      const y = Math.sin(k * Math.PI) * h.height;
      h.mesh.position.y = 0.4 + y;
      h.mesh.rotation.set(-Math.PI / 2 + h.tilt.x * Math.sin(k * Math.PI), h.tilt.y * Math.sin(k * Math.PI), 0);
      h.shadow.visible = k < 1;
      h.shadow.scale.setScalar(1 + y * 0.004);
    }
    const done = this.hoppers.filter((h) => h.age - h.delay >= HOP);
    for (const h of done) {
      h.mesh.removeFromParent();
      h.shadow.removeFromParent();
      h.mesh.geometry.dispose();
    }
    if (done.length) this.hoppers = this.hoppers.filter((h) => h.age - h.delay < HOP);

    for (const b of this.bits) {
      b.life -= dt;
      b.velocity.y -= 420 * dt;
      b.velocity.multiplyScalar(Math.exp(-1.2 * dt));
      b.mesh.position.addScaledVector(b.velocity, dt);
      if (b.mesh.position.y < 0.5) {
        b.mesh.position.y = 0.5;
        b.velocity.set(0, 0, 0);
        b.spin.set(0, 0, 0);
        b.mesh.rotation.x = -Math.PI / 2;
      }
      b.mesh.rotation.x += b.spin.x * dt;
      b.mesh.rotation.y += b.spin.y * dt;
      b.mesh.rotation.z += b.spin.z * dt;
      if (b.life < 0.3) b.mesh.scale.multiplyScalar(Math.max(0, 1 - dt * 6));
    }
    const gone = this.bits.filter((b) => b.life <= 0);
    for (const b of gone) b.mesh.removeFromParent();
    if (gone.length) this.bits = this.bits.filter((b) => b.life > 0);
  }

  dispose() {
    for (const h of this.hoppers) {
      h.mesh.removeFromParent();
      h.shadow.removeFromParent();
      h.mesh.geometry.dispose();
    }
    for (const b of this.bits) b.mesh.removeFromParent();
    this.ring?.geometry.dispose();
    this.ring?.material.dispose();
    this.tileMaterials.forEach((m) => m.dispose());
    this.shadowMaterial.dispose();
    this.bitGeometry.dispose();
    this.bitMaterials.forEach((m) => m.dispose());
    this.hoppers = [];
    this.bits = [];
  }
}
