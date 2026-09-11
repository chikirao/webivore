import * as THREE from "three";
import { rabbitFrame } from "./rabbit-frame";

/** Camera-facing parts with independently selected prerendered azimuth/elevation frames. */
export class Rabbit {
  root = new THREE.Group();
  head: THREE.Sprite;
  body: THREE.Sprite;
  hands: THREE.Mesh[] = [];
  textures: THREE.Texture[] = [];
  ready: Promise<void>;
  frame = { column: 0, row: 1 };
  neckOffsets: number[] = Array(24).fill(22);
  constructor() {
    const loader = new THREE.TextureLoader();
    const pending: Promise<unknown>[] = [];
    const part = (url: string, size: number) => {
      const texture = new THREE.Texture();
      pending.push(
        loader.loadAsync(url).then((loaded) => {
          texture.image = loaded.image;
          texture.needsUpdate = true;
          loaded.dispose();
        }),
      );
      texture.colorSpace = THREE.SRGBColorSpace;
      // Inset each cell to prevent neighboring rows bleeding into billboard edges.
      texture.repeat.set(250 / 2048, 250 / 768);
      texture.generateMipmaps = false;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.NearestFilter;
      this.textures.push(texture);
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: texture,
          alphaTest: 0.15,
          depthWrite: true,
        }),
      );
      sprite.scale.set(size, size, 1);
      sprite.center.set(0.5, 0.12);
      this.root.add(sprite);
      return sprite;
    };
    this.body = part("/assets/rabbit-body.png", 32);
    this.head = part("/assets/rabbit-head.png", 52);
    this.head.position.y = 0;
    for (const side of [-1, 1]) {
      const hand = new THREE.Mesh(
        new THREE.SphereGeometry(4.8, 16, 12),
        new THREE.MeshStandardMaterial({ color: "white", roughness: 0.35 }),
      );
      const outline = new THREE.Mesh(
        new THREE.SphereGeometry(5.7, 16, 12),
        new THREE.MeshBasicMaterial({ color: "black", side: THREE.BackSide }),
      );
      hand.add(outline);
      hand.position.set(side * 16, 18, 10);
      this.root.add(hand);
      this.hands.push(hand);
    }
    this.ready = Promise.all(pending).then(() => {
      // Measure the actual opaque neck in every frame, not the transparent cell edge.
      const sample = document.createElement("canvas");
      sample.width = sample.height = 250;
      const ctx = sample.getContext("2d", { willReadFrequently: true })!;
      for (let row = 0; row < 3; row++)
        for (let column = 0; column < 8; column++) {
          const edge = (texture: THREE.Texture, bottom: boolean) => {
            ctx.clearRect(0, 0, 250, 250);
            ctx.drawImage(
              texture.image as HTMLImageElement,
              column * 256 + 3,
              row * 256 + 3,
              250,
              250,
              0,
              0,
              250,
              250,
            );
            const pixels = ctx.getImageData(0, 0, 250, 250).data;
            for (let i = 0; i < 250; i++) {
              const y = bottom ? 249 - i : i;
              let opaque = 0;
              for (let x = 105; x < 145; x++)
                if (pixels[(y * 250 + x) * 4 + 3] > 128) opaque++;
              if (opaque >= 12) return y / 250;
            }
            return bottom ? 0.9 : 0.2;
          };
          const bodyTop = edge(this.textures[0], false);
          const headBottom = edge(this.textures[1], true);
          this.neckOffsets[row * 8 + column] =
            (0.88 - bodyTop) * 32 - (0.88 - headBottom) * 52 - 3;
        }
    });
  }
  update(
    camera: THREE.Camera,
    heading: number,
    radius: number,
    scale: number,
    phase: number,
    moving: number,
  ) {
    const delta = camera.position
      .clone()
      .sub(this.root.getWorldPosition(new THREE.Vector3()));
    const elevation = Math.atan2(delta.y, Math.hypot(delta.x, delta.z));
    const { column, row } = rabbitFrame(
      Math.atan2(delta.x, delta.z),
      heading,
      elevation,
    );
    this.frame = { column, row };
    for (const t of this.textures)
      t.offset.set(column / 8 + 3 / 2048, 1 - (row + 1) / 3 + 3 / 768);
    // Both sprites share one 3D origin and one screen-space joint. Camera pitch
    // can no longer stretch the neck; their opaque silhouettes overlap by 3 units.
    this.head.center.y = 0.12 - this.neckOffsets[row * 8 + column] / 52;
    const bob = Math.sin(phase * 12) * Math.min(0.7, moving / 200);
    this.head.position.y = this.body.position.y = bob;
    this.body.material.rotation = this.head.material.rotation = 0;
    this.hands.forEach((hand, i) => {
      const side = i ? 1 : -1;
      const spread = Math.min(radius * 0.55, 20 * scale);
      hand.position.set(
        side * (radius ? spread / scale : 16),
        radius ? Math.max(18, radius / scale) : 18,
        radius
          ? 24 +
              (radius -
                Math.sqrt(Math.max(0, radius * radius - spread * spread))) /
                scale
          : 10,
      );
    });
  }
  dispose() {
    this.textures.forEach((t) => t.dispose());
    this.head.material.dispose();
    this.body.material.dispose();
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        o.material.dispose();
      }
    });
  }
}
