import * as THREE from "three";
import type { Piece } from "./shared";
import {
  FULL_RES_LAYERS,
  LAYER_SIZE,
  PRIORITY_LIMIT,
  VERTS,
  GRID,
  regularPlacement,
  priorityPlacement,
  sheet,
  worldVertices,
  orientation,
  type Placement,
} from "./packing";
import { highlightScore, highlightSlot } from "./highlights";
const INDICES = (GRID - 1) * (GRID - 1) * 6,
  SLOT = 128,
  COLS = 8,
  ROWS = 6,
  PRIORITY_CELL = 256,
  PRIORITY_COLS = 4;
type Layer = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  count: number;
  compacted: boolean;
};
export type PackedFragment = {
  index: number;
  layer: Layer;
  slot: number;
  placement: Placement;
  normal: THREE.Vector3;
  orientation: THREE.Quaternion;
  depth: number;
  width: number;
  height: number;
  /** Local crumpled sheet, used by the flight animation before baking. */
  positions: Float32Array;
  uv: Float32Array;
  baked: boolean;
  piece: Piece;
};
type Priority = { score: number; aspect: number; index: number };

/**
 * Permanent multi-layer ball. Every bite is frozen where it landed; only atlas
 * resolution is reduced for old layers. A bounded priority set (graphics first)
 * is additionally drawn refit to the live surface, along each piece's own
 * attachment direction, so late diagrams stay readable without floating.
 * Budget: ceil(bites / 48) + 2 draw calls, 48 × 81 vertices per layer, at most
 * FULL_RES_LAYERS historical atlases at 1024 × 768 plus one support atlas and
 * one 1024² priority atlas. Old geometry remains bounded by captured bite count.
 */
export class LayeredPile {
  layers: Layer[] = [];
  count = 0;
  fragments: PackedFragment[] = [];
  private outer: Layer | undefined;
  private skin: Layer | undefined;
  private skinPieces: (PackedFragment | undefined)[] = [];
  priorities: Priority[] = [];
  private radius = 5;
  get renderMeshes() {
    return [
      ...this.layers.map((l) => l.mesh),
      ...(this.skin ? [this.skin.mesh] : []),
      ...(this.outer ? [this.outer.mesh] : []),
    ];
  }
  /** Current live shell radius the priority copies are fitted to. */
  get shellRadius() {
    return this.radius;
  }
  constructor(
    public root: THREE.Group,
    public source: HTMLImageElement,
  ) {}
  allocate(p: Piece, radius: number) {
    if (this.radius !== radius) {
      this.radius = radius;
      this.refit();
    }
    const index = this.count++,
      slot = index % LAYER_SIZE;
    if (slot === 0) {
      this.createLayer();
      // Old layers retain every triangle and UV. Only their atlas resolution drops.
      for (const old of this.layers.slice(0, -FULL_RES_LAYERS))
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
    this.paint(layer.ctx, p, sx, sy, SLOT);
    layer.texture.needsUpdate = true;
    const placement = regularPlacement(index, radius, p.width / p.height);
    const positions = sheet(placement, index);
    const uv = new Float32Array(VERTS * 2);
    for (let i = 0; i < VERTS; i++) {
      const u = (i % GRID) / (GRID - 1),
        v = Math.floor(i / GRID) / (GRID - 1);
      uv.set(
        [
          (sx + 2 + u * (SLOT - 4)) / (COLS * SLOT),
          1 - (sy + 2 + v * (SLOT - 4)) / (ROWS * SLOT),
        ],
        i * 2,
      );
    }
    const [qx, qy, qz, qw] = orientation(placement);
    const f: PackedFragment = {
      index,
      layer,
      slot,
      placement,
      normal: new THREE.Vector3(...placement.normal),
      orientation: new THREE.Quaternion(qx, qy, qz, qw),
      depth: placement.depth,
      width: placement.width,
      height: placement.height,
      positions,
      uv,
      baked: false,
      piece: p,
    };
    this.fragments.push(f);
    return f;
  }
  private paint(
    ctx: CanvasRenderingContext2D,
    p: Piece,
    x: number,
    y: number,
    cell: number,
  ) {
    const inner = cell - 4;
    ctx.clearRect(x, y, cell, cell);
    for (const r of p.regions ?? [p])
      ctx.drawImage(
        this.source,
        r.x,
        r.y,
        r.width,
        r.height,
        x + 2 + ((r.x - p.x) / p.width) * inner,
        y + 2 + ((r.y - p.y) / p.height) * inner,
        (r.width / p.width) * inner,
        (r.height / p.height) * inner,
      );
  }
  createLayer(size: [number, number] = [COLS * SLOT, ROWS * SLOT]) {
    const canvas = document.createElement("canvas");
    canvas.width = size[0];
    canvas.height = size[1];
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
      for (let y = 0; y < GRID - 1; y++)
        for (let x = 0; x < GRID - 1; x++) {
          const a = s * VERTS + y * GRID + x,
            b = a + 1,
            c = a + GRID,
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
    const layer = { canvas, ctx, texture, mesh, count: 0, compacted: false };
    this.layers.push(layer);
    return layer;
  }
  flightGeometry(f: PackedFragment) {
    const g = new THREE.PlaneGeometry(1, 1, GRID - 1, GRID - 1);
    g.setAttribute("uv", new THREE.BufferAttribute(f.uv.slice(), 2));
    return g;
  }
  private write(
    layer: Layer,
    slot: number,
    world: Float32Array,
    uv: Float32Array,
  ) {
    const g = layer.mesh.geometry,
      pos = g.attributes.position,
      uvs = g.attributes.uv;
    for (let i = 0; i < VERTS; i++) {
      pos.setXYZ(
        slot * VERTS + i,
        world[i * 3],
        world[i * 3 + 1],
        world[i * 3 + 2],
      );
      uvs.setXY(slot * VERTS + i, uv[i * 2], uv[i * 2 + 1]);
    }
    layer.count = Math.max(layer.count, slot + 1);
    g.setDrawRange(0, layer.count * INDICES);
    pos.needsUpdate = true;
    uvs.needsUpdate = true;
  }
  bake(f: PackedFragment) {
    if (f.baked) return;
    f.baked = true;
    this.write(f.layer, f.slot, worldVertices(f.placement, f.positions), f.uv);
    f.layer.mesh.geometry.computeVertexNormals();
    f.layer.mesh.geometry.computeBoundingSphere();
    this.cover(f);
    this.prioritize(f);
  }
  /** A bounded, overlapping support shell made from actual collected pixels.
   * All original geometry stays frozen. These 48 copies grow under the priority
   * diagrams, so a sudden large bite cannot leave them hanging above old layers.
   */
  private cover(f: PackedFragment) {
    const slot = f.index % LAYER_SIZE;
    this.skinPieces[slot] = f;
    if (!this.skin && this.count >= LAYER_SIZE) {
      this.skin = this.createLayer();
      this.layers.pop();
      this.skin.mesh.material.color.set("#ffffff");
      this.skinPieces.forEach((piece, s) => {
        if (piece)
          this.paint(
            this.skin!.ctx,
            piece.piece,
            (s % COLS) * SLOT,
            Math.floor(s / COLS) * SLOT,
            SLOT,
          );
      });
    } else if (this.skin) {
      this.paint(
        this.skin.ctx,
        f.piece,
        (slot % COLS) * SLOT,
        Math.floor(slot / COLS) * SLOT,
        SLOT,
      );
    }
    if (this.skin) {
      this.skin.texture.needsUpdate = true;
      this.refit();
    }
  }
  /** Offer a baked bite a bounded priority slot; graphics displace text, bigger displaces smaller. */
  private prioritize(f: PackedFragment) {
    const score = highlightScore(f.piece);
    const slot = highlightSlot(
      this.priorities.map((a) => a.score),
      score,
    );
    if (slot < 0) return;
    if (!this.outer) {
      this.outer = this.createLayer([
        PRIORITY_COLS * PRIORITY_CELL,
        PRIORITY_COLS * PRIORITY_CELL,
      ]);
      this.layers.pop();
      this.outer.mesh.material.color.set("#ffffff");
    }
    const x = (slot % PRIORITY_COLS) * PRIORITY_CELL,
      y = Math.floor(slot / PRIORITY_COLS) * PRIORITY_CELL;
    this.paint(this.outer.ctx, f.piece, x, y, PRIORITY_CELL);
    this.outer.texture.needsUpdate = true;
    this.priorities[slot] = {
      score,
      aspect: f.piece.width / f.piece.height,
      index: f.index,
    };
    this.refit();
  }
  /** Placement of one priority copy at the current radius (also used by tests and the trophy). */
  priorityVertices(slot: number, radius = this.radius) {
    const a = this.priorities[slot];
    const placement = priorityPlacement(a.index, radius, a.aspect);
    return worldVertices(placement, sheet(placement, a.index));
  }
  private refit() {
    if (this.skin) {
      this.skinPieces.forEach((f, s) => {
        if (!f) return;
        const p = regularPlacement(s, this.radius, 1);
        p.depth = this.radius * 0.807;
        this.write(this.skin!, s, worldVertices(p, sheet(p, s, 0)), f.uv);
      });
      this.skin.mesh.geometry.computeVertexNormals();
      this.skin.mesh.geometry.computeBoundingSphere();
    }
    if (!this.outer) return;
    this.priorities.forEach((_, s) => {
      const uv = new Float32Array(VERTS * 2);
      const x = (s % PRIORITY_COLS) * PRIORITY_CELL,
        y = Math.floor(s / PRIORITY_COLS) * PRIORITY_CELL;
      for (let i = 0; i < VERTS; i++) {
        const u = (i % GRID) / (GRID - 1),
          t = Math.floor(i / GRID) / (GRID - 1);
        uv.set(
          [
            (x + 2 + u * (PRIORITY_CELL - 4)) / (PRIORITY_COLS * PRIORITY_CELL),
            1 -
              (y + 2 + t * (PRIORITY_CELL - 4)) /
                (PRIORITY_COLS * PRIORITY_CELL),
          ],
          i * 2,
        );
      }
      this.write(this.outer!, s, this.priorityVertices(s), uv);
    });
    this.outer.mesh.geometry.computeVertexNormals();
    this.outer.mesh.geometry.computeBoundingSphere();
  }
  dispose() {
    for (const l of [
      ...this.layers,
      ...(this.skin ? [this.skin] : []),
      ...(this.outer ? [this.outer] : []),
    ]) {
      l.mesh.geometry.dispose();
      l.mesh.material.dispose();
      l.texture.dispose();
      l.mesh.removeFromParent();
    }
    this.layers = [];
    this.outer = undefined;
    this.skin = undefined;
    this.skinPieces = [];
    this.priorities = [];
  }
}
export { PRIORITY_LIMIT };
