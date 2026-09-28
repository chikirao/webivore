import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { flushPatches, markDirty } from "../src/texture-patch.ts";

class FakeGL2 {}
(globalThis as { WebGL2RenderingContext?: unknown }).WebGL2RenderingContext = FakeGL2;

function fakeRenderer(uploaded: Map<THREE.Texture, number>) {
  const copies: { region: THREE.Box2; at: THREE.Vector2 }[] = [];
  const renderer = {
    getContext: () => new FakeGL2(),
    properties: { get: (t: THREE.Texture) => ({ __version: uploaded.get(t) }) },
    copyTextureToTexture: (_src: THREE.Texture, _dst: THREE.Texture, region: THREE.Box2, at: THREE.Vector2) =>
      copies.push({ region, at }),
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
  const { region, at } = copies[0];
  // Canvas rows 180..240 land at texture rows 1024-240 .. 1024-180.
  assert.deepEqual([region.min.x, region.min.y, region.max.x, region.max.y], [100, 784, 221, 844]);
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
