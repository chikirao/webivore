import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { flushPatches, markDirty } from "../src/texture-patch.ts";

class FakeGL2 {}
(globalThis as { WebGL2RenderingContext?: unknown }).WebGL2RenderingContext = FakeGL2;
/** The scratch canvas the patch is cut into before upload. */
const draws: unknown[][] = [];
(globalThis as { document?: unknown }).document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => ({ clearRect() {}, drawImage: (...a: unknown[]) => draws.push(a) }) }),
};

function fakeRenderer(uploaded: Map<THREE.Texture, number>) {
  const copies: { size: [number, number]; region: THREE.Box2 | null; at: THREE.Vector2 }[] = [];
  const renderer = {
    getContext: () => new FakeGL2(),
    properties: { get: (t: THREE.Texture) => ({ __version: uploaded.get(t) }) },
    copyTextureToTexture: (src: THREE.Texture, _dst: THREE.Texture, region: THREE.Box2 | null, at: THREE.Vector2) =>
      copies.push({ size: [(src.image as HTMLCanvasElement).width, (src.image as HTMLCanvasElement).height], region, at }),
  };
  return { renderer: renderer as unknown as THREE.WebGLRenderer, copies };
}

const canvasOf = (width: number, height: number) => ({ width, height }) as HTMLCanvasElement;

test("bites in one frame upload one merged, flipped rectangle", () => {
  const canvas = canvasOf(1280, 1024);
  const texture = new THREE.Texture(canvas);
  texture.version = 3;
  const { renderer, copies } = fakeRenderer(new Map([[texture, 3]]));
  markDirty(texture, canvas, 100, 200, 50, 40);
  markDirty(texture, canvas, 120.5, 180, 100, 30);
  flushPatches(renderer);
  assert.equal(copies.length, 1);
  const { size, region, at } = copies[0];
  // Only the merged rectangle is cut out and uploaded, not the whole canvas.
  assert.deepEqual(draws.at(-1), [canvas, 100, 180, 121, 60, 0, 0, 121, 60]);
  assert.deepEqual(size, [121, 60]);
  assert.equal(region, null);
  // Canvas rows 180..240 land at texture rows 1024-240 .. 1024-180.
  assert.deepEqual([at.x, at.y], [100, 784]);
  assert.equal(texture.version, 3, "no whole-texture upload");
  flushPatches(renderer);
  assert.equal(copies.length, 1, "patches are consumed");
});

test("textures not yet on the GPU, or already queued, take the whole upload", () => {
  const canvas = canvasOf(512, 512);
  const fresh = new THREE.Texture(canvas);
  const queued = new THREE.Texture(canvas);
  queued.version = 2;
  const { renderer, copies } = fakeRenderer(new Map([[queued, 1]]));
  const before = fresh.version;
  markDirty(fresh, canvas, 0, 0, 10, 10);
  markDirty(queued, canvas, 0, 0, 10, 10);
  markDirty(queued, canvas, -50, 600, 10, 10); // outside the canvas: ignored
  flushPatches(renderer);
  assert.equal(copies.length, 0);
  assert.equal(fresh.version, before + 1, "first upload carries the patch");
  assert.equal(queued.version, 2, "the queued full upload is enough");
});
