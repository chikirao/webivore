import test from "node:test";
import assert from "node:assert/strict";
import { buildPalette, encodeLoop } from "../src/gif.ts";

const SIZE = 16;
function frame(paint: (x: number, y: number) => [number, number, number]) {
  const rgba = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) rgba.set([...paint(x, y), 255], (y * SIZE + x) * 4);
  return rgba;
}
const red: [number, number, number] = [255, 0, 19];

test("palette keeps the card red and photo colours instead of a fixed cube", () => {
  const photo = frame((x, y) => (x < 8 ? red : [40 + x * 9, 120 + y * 5, 200 - x * 6]));
  const { palette, size } = buildPalette([photo]);
  assert.ok(size <= 255, "index 255 stays free for transparency");
  let best = Infinity;
  for (let i = 0; i < size; i++)
    best = Math.min(best, Math.abs(palette[i * 3] - 255) + palette[i * 3 + 1] + Math.abs(palette[i * 3 + 2] - 19));
  assert.ok(best < 12, `red reproduced within ${best}`);
});

test("GIF loops forever and later frames reuse unchanged pixels", () => {
  const still = frame(() => red);
  const moved = frame((x, y) => (x > 10 && y > 10 ? [0, 0, 0] : red));
  const bytes = encodeLoop([still, moved, still], SIZE, 6);
  const text = String.fromCharCode(...bytes);
  assert.equal(text.slice(0, 6), "GIF89a");
  assert.equal(bytes[bytes.length - 1], 0x3b);
  assert.ok(text.includes("NETSCAPE2.0\x03\x01\x00\x00"), "infinite loop extension");
  const controls = [...text.matchAll(/\x21\xf9\x04([\s\S])([\s\S])([\s\S])\xff/g)];
  assert.equal(controls.length, 3);
  assert.equal(controls[0][1].charCodeAt(0) & 1, 0, "first frame is opaque");
  assert.equal(controls[1][1].charCodeAt(0) & 1, 1, "later frames mark unchanged pixels transparent");
  assert.equal(controls[1][2].charCodeAt(0), 6, "6 cs per frame");
});
