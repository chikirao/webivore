import * as THREE from "three";
import type { Level, Piece } from "./shared";
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
    public background: HTMLImageElement | undefined,
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
      for (
        let i = Math.floor(r.y / 1024);
        i <=
        Math.min(
          this.tiles.length - 1,
          Math.floor((r.y + r.height - 1) / 1024),
        );
        i++
      ) {
        const t = this.tiles[i];
        if (!t) continue;
        const top = Math.max(r.y, t.y),
          bottom = Math.min(r.y + r.height, t.y + t.height);
        if (bottom <= top) continue;
        if (this.background && this.level.coverage !== "exclusive")
          t.ctx.drawImage(
            this.background,
            r.x,
            top,
            r.width,
            bottom - top,
            r.x,
            top - t.y,
            r.width,
            bottom - top,
          );
        else {
          t.ctx.fillStyle = this.level.pageColor ?? "#f4f0e7";
          t.ctx.fillRect(r.x, top - t.y, r.width, bottom - top);
        }
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
