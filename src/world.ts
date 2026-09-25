import * as THREE from "three";
import type { Level, Piece, Region } from "./shared";

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
 * The captured page as the ground. Eaten pieces leave torn black holes with a
 * pale paper rim, as in the trailer; the rim may overlap neighbours slightly.
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
  dirty = new Set<number>();
  constructor(
    public level: Level,
    public source: HTMLImageElement,
    scene: THREE.Scene,
    anisotropy: number,
  ) {
    for (let y = 0; y < level.height; y += 1024) {
      const height = Math.min(1024, level.height - y),
        canvas = document.createElement("canvas");
      canvas.width = level.width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
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
      this.tiles.push({ y, height, canvas, ctx, texture, mesh });
    }
  }
  erase(p: Piece) {
    for (const r of p.regions ?? [p]) {
      const first = Math.max(0, Math.floor((r.y - 6) / 1024)),
        last = Math.min(this.tiles.length - 1, Math.floor((r.y + r.height + 6) / 1024));
      for (let i = first; i <= last; i++) {
        const t = this.tiles[i];
        t.ctx.save();
        t.ctx.translate(0, -t.y);
        t.ctx.fillStyle = RIM;
        t.ctx.beginPath();
        tornPath(t.ctx, r, 2.2, 3.4, p.id * 3 + 1);
        t.ctx.fill();
        t.ctx.fillStyle = HOLE;
        t.ctx.beginPath();
        tornPath(t.ctx, r, 0.4, 2.6, p.id * 3 + 2);
        t.ctx.fill();
        t.ctx.restore();
        this.dirty.add(i);
      }
    }
  }
  clear() {
    for (let i = 0; i < this.tiles.length; i++) {
      const t = this.tiles[i];
      t.ctx.fillStyle = this.level.pageColor ?? "#f4f0e7";
      t.ctx.fillRect(0, 0, t.canvas.width, t.canvas.height);
      this.dirty.add(i);
    }
  }
  flush() {
    for (const i of this.dirty) this.tiles[i].texture.needsUpdate = true;
    this.dirty.clear();
  }
  dispose() {
    for (const t of this.tiles) {
      t.mesh.geometry.dispose();
      t.mesh.material.dispose();
      t.texture.dispose();
      t.mesh.removeFromParent();
    }
  }
}
