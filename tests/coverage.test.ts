import test from "node:test";
import assert from "node:assert/strict";
import { PNG } from "pngjs";
import { partitionPage } from "../server/partition.ts";
import { attachmentDirection, LAYER_SIZE } from "../src/packing.ts";
import {
  balancePieces,
  maxCollectionRadius,
  type Piece,
} from "../src/shared.ts";

test("every complete layer covers every octant and both poles", () => {
  for (let layer = 0; layer < 12; layer++) {
    const octants = Array(8).fill(0),
      mean = [0, 0, 0];
    let north = false,
      south = false;
    for (let i = 0; i < LAYER_SIZE; i++) {
      const v = attachmentDirection(layer * LAYER_SIZE + i);
      assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-12);
      octants[(v[0] > 0 ? 1 : 0) + (v[1] > 0 ? 2 : 0) + (v[2] > 0 ? 4 : 0)]++;
      v.forEach((x, j) => (mean[j] += x));
      north ||= v[1] > 0.95;
      south ||= v[1] < -0.95;
    }
    assert.ok(
      octants.every((n) => n >= 4),
      String(octants),
    );
    assert.ok(north && south);
    assert.ok(mean.every((n) => Math.abs(n / LAYER_SIZE) < 0.03));
  }
});
test("all visible pixels have exactly one owner, including content omitted by DOM extraction", () => {
  const png = new PNG({ width: 128, height: 200 });
  png.data.fill(255);
  for (let y = 5; y < 55; y++)
    for (let x = 5; x < 100; x++) {
      const i = (y * 128 + x) * 4;
      png.data[i] = 20;
      png.data[i + 1] = 30;
    }
  for (let y = 150; y < 180; y++)
    for (let x = 15; x < 110; x++) png.data[(y * 128 + x) * 4 + 2] = 5;
  const base = {
    id: 0,
    tagName: "SPAN",
    text: "overlap",
    x: 5,
    y: 5,
    width: 65,
    height: 50,
    type: "TEXT_BLOCK",
    fontSize: 16,
    backgroundColor: "transparent",
    borderRadius: "0",
    zIndex: "0",
  };
  const { pieces } = partitionPage(
    [base, { ...base, x: 30, width: 70 }],
    PNG.sync.write(png),
    128,
    200,
  );
  const owners = new Uint8Array(128 * 200);
  for (const p of pieces)
    for (const r of p.regions!)
      for (let y = r.y; y < r.y + r.height; y++)
        for (let x = r.x; x < r.x + r.width; x++) {
          owners[y * 128 + x]++;
          assert.equal(owners[y * 128 + x], 1);
        }
  for (let y = 0; y < 200; y++)
    for (let x = 0; x < 128; x++) {
      const i = (y * 128 + x) * 4;
      if (png.data[i] < 230 || png.data[i + 1] < 230 || png.data[i + 2] < 230)
        assert.equal(owners[y * 128 + x], 1, `${x},${y}`);
    }
  assert.ok(pieces.some((p) => p.type === "PAGE_FRAGMENT"));
});
test("10,000 collectibles remain collectible within a bounded level-wide growth budget", () => {
  const pieces = Array.from({ length: 10000 }, (_, id) => ({
    id,
    mass: 20 + id * 100,
    threshold: 12 + id * 0.3,
    growthValue: 0,
  })) as Piece[];
  balancePieces(pieces);
  let area = 225;
  for (const p of [...pieces].sort((a, b) => a.threshold - b.threshold)) {
    assert.ok(Math.sqrt(area) + 1e-9 >= p.threshold);
    area += p.growthValue;
  }
  assert.ok(
    Math.abs(Math.sqrt(area - 225) - maxCollectionRadius(pieces.length)) < 1e-7,
  );
  assert.equal(maxCollectionRadius(pieces.length), 360);
});
