import * as THREE from "three";
import type { Piece } from "./shared";
import { attachmentDirection, LAYER_SIZE } from "./packing";
import { highlightScore, highlightSlot } from './highlights';
const VERTS = 81,
  INDICES = 384,
  SLOT = 128,
  COLS = 8,
  ROWS = 6;
type Layer = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  count: number;
  compacted: boolean;
};
export type PackedFragment = {
  layer: Layer;
  slot: number;
  normal: THREE.Vector3;
  orientation: THREE.Quaternion;
  depth: number;
  width: number;
  height: number;
  positions: Float32Array;
  uv: Float32Array;
  baked: boolean;
  piece: Piece;
};
export class LayeredPile {
  layers: Layer[] = [];
  count = 0;
  fragments: PackedFragment[] = [];
  private outer: Layer | undefined;
  private accents: { score: number; aspect: number }[] = [];
  private radius = 5;
  get renderMeshes() {
    return [...this.layers.map(l => l.mesh), ...(this.outer ? [this.outer.mesh] : [])];
  }
  constructor(
    public root: THREE.Group,
    public source: HTMLImageElement,
  ) {}
  allocate(p: Piece, radius: number) {
    if (this.radius !== radius) {
      this.radius = radius;
      this.refreshOuter();
    }
    const index = this.count++,
      slot = index % LAYER_SIZE;
    if (slot === 0) {
      this.createLayer();
      // Old layers retain every triangle and UV. Only their atlas resolution drops.
      for (const old of this.layers.slice(0, -8))
        if (!old.compacted) {
          const small = document.createElement("canvas");
          small.width = 256;
          small.height = 192;
          const context = small.getContext("2d")!;
          context.drawImage(old.canvas, 0, 0, 256, 192);
          old.canvas = small;
          old.ctx = context;
          old.texture.image = small;
          old.texture.needsUpdate = true;
          old.compacted = true;
        }
    }
    const layer = this.layers.at(-1)!;
    const sx = (slot % COLS) * SLOT,
      sy = Math.floor(slot / COLS) * SLOT;
    const c = document.createElement("canvas");
    c.width = SLOT;
    c.height = SLOT;
    const ctx = c.getContext("2d")!;
    const scaleX = (SLOT - 4) / p.width,
      scaleY = (SLOT - 4) / p.height;
    for (const r of p.regions ?? [p])
      ctx.drawImage(
        this.source,
        r.x,
        r.y,
        r.width,
        r.height,
        2 + (r.x - p.x) * scaleX,
        2 + (r.y - p.y) * scaleY,
        r.width * scaleX,
        r.height * scaleY,
      );
    layer.ctx.drawImage(c, sx, sy);
    layer.texture.needsUpdate = true;
    const normal = new THREE.Vector3(...attachmentDirection(index));
    const orientation = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      normal,
    );
    orientation.multiply(
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 0, 1),
        index * 2.117,
      ),
    );
    const aspect = THREE.MathUtils.clamp(p.width / p.height, 0.55, 1.8),
      size = Math.max(10, radius * 1.15);
    const width = size * Math.sqrt(aspect),
      height = size / Math.sqrt(aspect),
      depth = Math.max(2, radius * 0.68);
    const positions = new Float32Array(VERTS * 3),
      uv = new Float32Array(VERTS * 2);
    for (let i = 0; i < VERTS; i++) {
      const u = (i % 9) / 8 - 0.5,
        v = 0.5 - Math.floor(i / 9) / 8;
      const x = u * width,
        y = v * height;
      const bend = (x * x + y * y) / (Math.max(10, radius) * 2.5);
      positions.set(
        [
          x,
          y,
          -bend + Math.sin(u * 13 + index) * Math.sin(v * 11) * size * 0.035,
        ],
        i * 3,
      );
      uv.set(
        [
          (sx + 2 + (u + 0.5) * (SLOT - 4)) / (COLS * SLOT),
          1 - (sy + 2 + (0.5 - v) * (SLOT - 4)) / (ROWS * SLOT),
        ],
        i * 2,
      );
    }
    const f = {
      layer,
      slot,
      normal,
      orientation,
      depth,
      width,
      height,
      positions,
      uv,
      baked: false,
      piece: p,
    };
    this.fragments.push(f);
    return f;
  }
  createLayer() {
    const canvas = document.createElement("canvas");
    canvas.width = COLS * SLOT;
    canvas.height = ROWS * SLOT;
    const ctx = canvas.getContext("2d")!;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(LAYER_SIZE * VERTS * 3), 3),
    );
    geometry.setAttribute(
      "normal",
      new THREE.BufferAttribute(new Float32Array(LAYER_SIZE * VERTS * 3), 3),
    );
    geometry.setAttribute(
      "uv",
      new THREE.BufferAttribute(new Float32Array(LAYER_SIZE * VERTS * 2), 2),
    );
    const indices = new Uint16Array(LAYER_SIZE * INDICES);
    for (let s = 0; s < LAYER_SIZE; s++) {
      let n = s * INDICES;
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) {
          const a = s * VERTS + y * 9 + x,
            b = a + 1,
            c = a + 9,
            d = c + 1;
          indices.set([a, c, b, b, c, d], n);
          n += 6;
        }
    }
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.setDrawRange(0, 0);
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      color: "#e8e5d8",
      roughness: 1,
      side: THREE.DoubleSide,
      alphaTest: 0.2,
    });
    const mesh = new THREE.Mesh(geometry, material);
    this.root.add(mesh);
    this.layers.push({
      canvas,
      ctx,
      texture,
      mesh,
      count: 0,
      compacted: false,
    });
  }
  flightGeometry(f: PackedFragment) {
    const g = new THREE.PlaneGeometry(1, 1, 8, 8);
    g.setAttribute("uv", new THREE.BufferAttribute(f.uv.slice(), 2));
    return g;
  }
  bake(f: PackedFragment) {
    if (f.baked) return;
    f.baked = true;
    const g = f.layer.mesh.geometry,
      pos = g.attributes.position,
      uv = g.attributes.uv;
    const v = new THREE.Vector3();
    for (let i = 0; i < VERTS; i++) {
      v.fromArray(f.positions, i * 3)
        .applyQuaternion(f.orientation)
        .addScaledVector(f.normal, f.depth);
      pos.setXYZ(f.slot * VERTS + i, v.x, v.y, v.z);
      uv.setXY(f.slot * VERTS + i, f.uv[i * 2], f.uv[i * 2 + 1]);
    }
    f.layer.count = Math.max(f.layer.count, f.slot + 1);
    g.setDrawRange(0, f.layer.count * INDICES);
    pos.needsUpdate = true;
    uv.needsUpdate = true;
    g.computeVertexNormals();
    g.computeBoundingSphere();
    this.highlight(f.piece);
  }
  private highlight(p: Piece) {
    const score = highlightScore(p);
    const slot = highlightSlot(this.accents.map(a => a.score), score);
    if (slot < 0) return;
    if (!this.outer) {
      this.createLayer();
      this.outer = this.layers.pop()!;
      // A fixed 4x4 high-resolution atlas, independent of compacted inner layers.
      this.outer.canvas.width = this.outer.canvas.height = 1024;
      this.outer.mesh.material.color.set('#ffffff');
    }
    const { ctx, texture } = this.outer;
    const x = slot % 4 * 256, y = Math.floor(slot / 4) * 256;
    ctx.clearRect(x, y, 256, 256);
    for (const r of p.regions ?? [p])
      ctx.drawImage(this.source, r.x, r.y, r.width, r.height,
        x + 2 + (r.x-p.x)/p.width*252, y + 2 + (r.y-p.y)/p.height*252,
        r.width/p.width*252, r.height/p.height*252);
    texture.needsUpdate = true;
    this.accents[slot] = { score, aspect: p.width / p.height };
    this.refreshOuter();
  }
  private refreshOuter() {
    if (!this.outer) return;
    const g = this.outer.mesh.geometry;
    const pos = g.attributes.position, uv = g.attributes.uv;
    this.accents.forEach((a, s) => {
      const y = 1 - 2 * (s + .5) / 16;
      const angle = s * Math.PI * (3 - Math.sqrt(5));
      const normal = new THREE.Vector3(Math.cos(angle)*Math.sqrt(1-y*y), y, Math.sin(angle)*Math.sqrt(1-y*y));
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1), normal);
      // Fit, rather than stretch, wide diagrams. The original inner fragment stays frozen.
      const w = this.radius * .82 * Math.min(1, a.aspect);
      const h = this.radius * .82 * Math.min(1, 1/a.aspect);
      const v = new THREE.Vector3();
      for (let i=0; i<VERTS; i++) {
        const u = i%9/8, t = Math.floor(i/9)/8;
        const x = (u-.5)*w, y = (.5-t)*h;
        v.set(x, y, this.radius*.94-(x*x+y*y)/(this.radius*2)).applyQuaternion(q);
        pos.setXYZ(s*VERTS+i, v.x,v.y,v.z);
        uv.setXY(s*VERTS+i, (s%4*256+2+u*252)/1024, 1-(Math.floor(s/4)*256+2+t*252)/1024);
      }
    });
    g.setDrawRange(0, this.accents.length*INDICES);
    pos.needsUpdate = uv.needsUpdate = true;
    g.computeVertexNormals();
    g.computeBoundingSphere();
  }
  dispose() {
    for (const l of [...this.layers, ...(this.outer ? [this.outer] : [])]) {
      l.mesh.geometry.dispose();
      l.mesh.material.dispose();
      l.texture.dispose();
      l.mesh.removeFromParent();
    }
    this.layers = [];
    this.outer = undefined;
    this.accents = [];
  }
}
