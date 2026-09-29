import * as THREE from "three";
import type { Level, Piece, Region } from "./shared";
import { dropPatches, flushPatches, markDirty } from "./texture-patch";

const HOLE = "#050505";
const RIM = "#d9d3c4";

function hash(n: number, salt: number) {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt | 0, 0xc2b2ae35);
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** Torn outline of a rect: jittered perimeter, deterministic per piece. */
export function tornPath(ctx: CanvasRenderingContext2D, r: Region, grow: number, rough: number, seed: number) {
  const x0 = r.x - grow,
    y0 = r.y - grow,
    x1 = r.x + r.width + grow,
    y1 = r.y + r.height + grow;
  const step = 4.5;
  const edge = (ax: number, ay: number, bx: number, by: number, nx: number, ny: number, salt: number) => {
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / step));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const j = (hash(i * 7 + salt, seed) - 0.35) * rough;
      ctx.lineTo(ax + (bx - ax) * t + nx * j, ay + (by - ay) * t + ny * j);
    }
  };
  ctx.moveTo(x0, y0);
  edge(x0, y0, x1, y0, 0, -1, 1);
  edge(x1, y0, x1, y1, 1, 0, 2);
  edge(x1, y1, x0, y1, 0, 1, 3);
  edge(x0, y1, x0, y0, -1, 0, 4);
  ctx.closePath();
}

/**
 * Hole padding, rim width and edge roughness for the current ball radius. Early
 * bites leave small neat holes; late bites pad far enough to close the gaps
 * between neighbouring lines, so a cleared area reads as one torn hole.
 */
export function tearSize(radius: number) {
  const pad = 0.4 + Math.min(14, Math.max(0, radius) * 0.07);
  return {
    pad,
    rim: pad + 1.8 + Math.min(3, Math.max(0, radius) * 0.012),
    rough: 2.6 + Math.min(6, Math.max(0, radius) * 0.03),
  };
}

/** Finish floor: tile size (divides the 1024 px texture chunks), flip rhythm. */
const FLIP_TILE = 128;
/**
 * Checkerboard loop, seconds: even squares turn up, then odd; the whole page
 * holds; even squares turn back, then odd; a black beat; again.
 */
const FLIP = { turn: 0.45, stagger: 0.6, show: 2, rest: 1, jitter: 0.08 };
const FLIP_DOWN = FLIP.stagger + FLIP.turn + FLIP.show;
const FLIP_CYCLE = FLIP_DOWN + FLIP.stagger + FLIP.turn + FLIP.rest;
type FlipTile = { x: number; z: number; w: number; h: number; odd: boolean; jitter: number };

type Hole = { r: Region; pad: number; rough: number; seed: number; x0: number; y0: number; x1: number; y1: number };

/**
 * The captured page as the ground. Eaten pieces leave torn black holes with a
 * pale paper rim, as in the trailer. A new rim never paints over an older
 * hole: touching holes are refilled after it, so adjacent bites merge instead
 * of leaving a web of pale outlines.
 */
export class WorldSurface {
  tiles: {
    y: number;
    height: number;
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    texture: THREE.CanvasTexture;
    mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  }[] = [];
  holes: Hole[] = [];
  constructor(
    public level: Level,
    public source: HTMLImageElement,
    scene: THREE.Scene,
    private renderer: THREE.WebGLRenderer,
  ) {
    const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    for (let y = 0; y < level.height; y += 1024) {
      const height = Math.min(1024, level.height - y),
        canvas = document.createElement("canvas");
      canvas.width = level.width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("the browser ran out of canvas memory for this page");
      ctx.drawImage(
        source,
        0,
        y,
        level.width,
        height,
        0,
        0,
        level.width,
        height,
      );
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = anisotropy;
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(level.width, height),
        new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(level.width / 2, 0, y + height / 2);
      scene.add(mesh);
      // Upload now rather than on the first frame; later bites patch only their own area.
      renderer.initTexture(texture);
      this.tiles.push({ y, height, canvas, ctx, texture, mesh });
    }
  }
  erase(p: Piece, radius = 0) {
    const { pad, rim, rough } = tearSize(radius);
    for (const r of p.regions ?? [p]) {
      const out = pad + rough,
        reach = rim + rough;
      const hole: Hole = { r, pad, rough, seed: p.id * 3 + 2, x0: r.x - out, y0: r.y - out, x1: r.x + r.width + out, y1: r.y + r.height + out };
      const x0 = r.x - reach,
        y0 = r.y - reach,
        x1 = r.x + r.width + reach,
        y1 = r.y + r.height + reach;
      const touching = this.holes.filter((h) => h.x1 > x0 && h.x0 < x1 && h.y1 > y0 && h.y0 < y1);
      touching.push(hole);
      this.holes.push(hole);
      const first = Math.max(0, Math.floor(y0 / 1024)),
        last = Math.min(this.tiles.length - 1, Math.floor(y1 / 1024));
      for (let i = first; i <= last; i++) {
        const t = this.tiles[i];
        t.ctx.save();
        t.ctx.translate(0, -t.y);
        // Refilled neighbours stay inside the uploaded patch, so canvas and texture agree.
        t.ctx.beginPath();
        t.ctx.rect(x0, y0, x1 - x0, y1 - y0);
        t.ctx.clip();
        t.ctx.fillStyle = RIM;
        t.ctx.beginPath();
        tornPath(t.ctx, r, rim, rough + 0.8, p.id * 3 + 1);
        t.ctx.fill();
        t.ctx.fillStyle = HOLE;
        t.ctx.beginPath();
        for (const h of touching) tornPath(t.ctx, h.r, h.pad, h.rough, h.seed);
        t.ctx.fill();
        t.ctx.restore();
        markDirty(t.texture, t.canvas, x0, y0 - t.y, x1 - x0, y1 - y0);
      }
    }
  }
  /**
   * The page is eaten: the ground goes black and the site comes back as a
   * floor of tiles that flip over to the page and back to black in a
   * checkerboard loop, like the attract screen's platform.
   */
  clear(reduced = false) {
    this.holes = [];
    const scene = this.tiles[0]?.mesh.parent;
    for (const t of this.tiles) {
      // the tile canvases get the untouched page back for the flip tiles
      t.ctx.drawImage(this.source, 0, t.y, this.level.width, t.height, 0, 0, this.level.width, t.height);
      t.texture.needsUpdate = true;
      const ground = new THREE.MeshBasicMaterial({ color: HOLE, side: THREE.DoubleSide });
      t.mesh.material.dispose();
      t.mesh.material = ground;
      if (!scene) continue;
      const tiles: FlipTile[] = [];
      const pos: number[] = [],
        uv: number[] = [];
      for (let y = 0; y < t.height; y += FLIP_TILE)
        for (let x = 0; x < this.level.width; x += FLIP_TILE) {
          const w = Math.min(FLIP_TILE, this.level.width - x),
            h = Math.min(FLIP_TILE, t.height - y);
          const u0 = x / this.level.width,
            u1 = (x + w) / this.level.width,
            v0 = 1 - y / t.height,
            v1 = 1 - (y + h) / t.height;
          // two triangles facing up (+y); corners: (x0,z0) (x0,z1) (x1,z0) (x1,z1)
          for (const [c, u, v] of [
            [0, u0, v0],
            [1, u0, v1],
            [2, u1, v0],
            [1, u0, v1],
            [3, u1, v1],
            [2, u1, v0],
          ] as const) {
            pos.push(c, 0, 0);
            uv.push(u, v);
          }
          const mx = x + w / 2,
            mz = t.y + y + h / 2;
          const col = x / FLIP_TILE,
            row = (t.y + y) / FLIP_TILE;
          tiles.push({ x: mx, z: mz, w, h, odd: (col + row) % 2 === 1, jitter: Math.random() * FLIP.jitter });
        }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({ map: t.texture, side: THREE.FrontSide }),
      );
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.flips.push({ mesh, tiles });
    }
    this.flipStart = performance.now() / 1000;
    this.flipReduced = reduced;
    this.animate();
  }
  private flips: { mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>; tiles: FlipTile[] }[] = [];
  private flipStart = 0;
  private flipReduced = false;
  /** Advances the finish floor: each ring flips to the page, holds, flips back to black. */
  animate() {
    if (!this.flips.length) return;
    const now = performance.now() / 1000 - this.flipStart;
    const ease = (u: number) => u * u * (3 - 2 * u);
    for (const { mesh, tiles } of this.flips) {
      const pos = mesh.geometry.attributes.position as THREE.BufferAttribute;
      const a = pos.array as Float32Array;
      tiles.forEach((tile, i) => {
        let angle = 0;
        if (!this.flipReduced) {
          const s = (now % FLIP_CYCLE) - (tile.odd ? FLIP.stagger : 0) - tile.jitter;
          const turn = (from: number) => Math.min(1, Math.max(0, (s - from) / FLIP.turn));
          angle =
            s < FLIP_DOWN
              ? Math.PI + Math.PI * ease(turn(0)) // black → page, over the top
              : Math.PI * ease(turn(FLIP_DOWN)); // page → black
        }
        const sin = Math.sin(angle),
          cos = Math.cos(angle);
        const lift = 0.6 + Math.abs(sin) * tile.h * 0.35;
        const hw = tile.w / 2,
          hh = tile.h / 2;
        // rotate each corner about the tile's x axis
        const corner = (c: number) => {
          const ox = c >= 2 ? hw : -hw,
            oz = c % 2 ? hh : -hh;
          return [tile.x + ox, lift - oz * sin, tile.z + oz * cos];
        };
        const corners = [corner(0), corner(1), corner(2), corner(3)];
        [0, 1, 2, 1, 3, 2].forEach((c, k) => a.set(corners[c], (i * 6 + k) * 3));
      });
      pos.needsUpdate = true;
    }
  }
  /** Sends drawn holes to the GPU (the game loop also flushes before every render). */
  flush() {
    flushPatches(this.renderer);
  }
  dispose() {
    for (const { mesh } of this.flips) {
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh.removeFromParent();
    }
    this.flips = [];
    dropPatches(this.tiles.map((t) => t.texture));
    for (const t of this.tiles) {
      t.mesh.geometry.dispose();
      t.mesh.material.dispose();
      t.texture.dispose();
      t.mesh.removeFromParent();
    }
  }
}
