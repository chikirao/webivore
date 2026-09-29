import * as THREE from "three";
import { Rabbit } from "../rabbit";

/**
 * The INSERT DISC attract loop: the game's own rabbit rig dances its victory
 * dance on a floating platform of website tiles while the camera orbits. Every
 * few seconds a wave flips the tiles over to another captured site. Rendered
 * with alpha into a small offscreen canvas that the screen program composites.
 */
const TILES = 6;
const SIZE = 160;
const THICK = 14;
/** The rabbit a touch larger than in the game, so it reads on a 640 × 480 tube. */
const RABBIT_SCALE = 1.35;
const WAVE_EVERY = 2.8;
const FLIP = 0.42;

type Tile = { mesh: THREE.Mesh; pivot: THREE.Group; site: number; next: number; start: number };

export class SplashScene {
  readonly canvas = document.createElement("canvas");
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(34, 4 / 3, 1, 5000);
  private rabbit = new Rabbit();
  private character = new THREE.Group();
  private shadow: THREE.Mesh;
  private sites: THREE.MeshBasicMaterial[] = [];
  private loaded: number[] = [];
  private tiles: Tile[] = [];
  private waveAt = 1.2;
  private site = -1;

  constructor(siteUrls: string[], width: number, height: number) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.scene.add(new THREE.HemisphereLight("#ffffff", "#777777", 2.6));
    const light = new THREE.DirectionalLight("#ffffff", 3);
    light.position.set(-300, 700, 300);
    this.scene.add(light);

    const loader = new THREE.TextureLoader();
    siteUrls.forEach((url, i) => {
      const material = new THREE.MeshBasicMaterial({ color: "#111", side: THREE.DoubleSide });
      this.sites.push(material);
      loader.load(url, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        material.map = tex;
        material.color.set("#fff");
        material.needsUpdate = true;
        this.loaded.push(i);
      });
    });

    // slab under the tiles: ink body with a red keyline, like the UI plates
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(SIZE + 10, THICK, SIZE + 10),
      new THREE.MeshBasicMaterial({ color: "#050505" }),
    );
    slab.position.y = -THICK / 2 - 0.5;
    const rim = new THREE.Mesh(
      new THREE.BoxGeometry(SIZE + 12, 3, SIZE + 12),
      new THREE.MeshBasicMaterial({ color: "#ff0013" }),
    );
    rim.position.y = -THICK * 0.62;
    this.scene.add(slab, rim);

    const cell = SIZE / TILES;
    for (let row = 0; row < TILES; row++)
      for (let col = 0; col < TILES; col++) {
        const geometry = new THREE.PlaneGeometry(cell - 1.2, cell - 1.2);
        geometry.rotateX(-Math.PI / 2);
        // this tile's share of the page image
        const uv = geometry.attributes.uv as THREE.BufferAttribute;
        for (let i = 0; i < uv.count; i++)
          uv.setXY(i, (col + uv.getX(i)) / TILES, 1 - (row + 1 - uv.getY(i)) / TILES);
        const mesh = new THREE.Mesh(geometry, this.sites[0]);
        const pivot = new THREE.Group();
        pivot.position.set(-SIZE / 2 + (col + 0.5) * cell, 0, -SIZE / 2 + (row + 0.5) * cell);
        pivot.add(mesh);
        this.scene.add(pivot);
        this.tiles.push({ mesh, pivot, site: 0, next: 0, start: -1 });
      }

    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(24, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.45, depthWrite: false }),
    );
    this.shadow.position.y = 0.6;
    this.scene.add(this.shadow);
    this.character.add(this.rabbit.root);
    this.scene.add(this.character);
  }

  private wave(t: number) {
    const choices = this.loaded.filter((i) => i !== this.site);
    if (!choices.length) return;
    this.site = choices[Math.floor(Math.random() * choices.length)];
    const corner = [Math.random() < 0.5 ? 0 : TILES - 1, Math.random() < 0.5 ? 0 : TILES - 1];
    this.tiles.forEach((tile, i) => {
      const d = Math.hypot((i % TILES) - corner[0], Math.floor(i / TILES) - corner[1]);
      tile.next = this.site;
      tile.start = t + d * 0.07;
    });
  }

  render(t: number) {
    if (t >= this.waveAt) {
      this.wave(t);
      this.waveAt = t + WAVE_EVERY;
    }
    for (const tile of this.tiles) {
      if (tile.start < 0 || t < tile.start) continue;
      const u = Math.min(1, (t - tile.start) / FLIP);
      // over the top edge; the new page is on the far side
      tile.pivot.rotation.x = u < 0.5 ? Math.PI * u : -Math.PI * (1 - u);
      tile.pivot.position.y = Math.sin(Math.PI * u) * 10;
      if (u >= 0.5 && tile.site !== tile.next) {
        tile.site = tile.next;
        tile.mesh.material = this.sites[tile.next];
      }
      if (u >= 1) {
        tile.start = -1;
        tile.pivot.rotation.x = 0;
        tile.pivot.position.y = 0;
      }
    }

    // the victory dance from the game: hops, a twist, waving hands
    const yaw = t * 0.55;
    const s = RABBIT_SCALE;
    const hop = Math.max(0, Math.sin(((t % 0.5) / 0.5) * Math.PI)) * 22 * s;
    const heading = yaw + Math.sin(t * 6.3) * 0.7;
    this.character.position.set(0, hop, 0);
    this.character.rotation.y = heading;
    const squash = 1 - Math.max(0, 0.08 - hop / 200);
    this.character.scale.set(s, s * squash, s);
    this.shadow.scale.setScalar(s * (1 - hop / 100));
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.45 - hop / 120;

    const pitch = 0.4 + Math.sin(t * 0.31) * 0.06,
      distance = 305;
    // aimed above the dancer, so it sits below the wordmark between the bars
    const target = new THREE.Vector3(0, 64, 0);
    this.camera.position
      .set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))
      .multiplyScalar(distance)
      .add(target);
    this.camera.lookAt(target);
    this.camera.updateMatrixWorld();
    this.rabbit.update(this.camera, heading, 0, 1, t, 0, true);
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    this.rabbit.dispose();
    for (const m of this.sites) m.map?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
