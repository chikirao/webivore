import { test } from "node:test";
import assert from "node:assert/strict";
import { PickupGuide, nearestCollectible, localMap } from "../src/navigation";
import { properties, type Piece } from "../src/shared";
const piece = (id: number, x: number, y: number, threshold = 12) => ({
  id,
  x,
  y,
  width: 20,
  height: 20,
  type: "TEXT",
  tagName: "P",
  text: "bite",
  fontSize: 12,
  backgroundColor: "white",
  borderRadius: "0",
  zIndex: "0",
  ...properties(20, 20, "TEXT"),
  threshold,
  gone: false,
});
test("guidance teaches three original pieces, then one in subsequent games", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => {
      values.set(k, v);
    },
  };
  const first = new PickupGuide(storage);
  first.collected(1);
  assert(first.enabled);
  first.collected(2);
  assert(first.enabled);
  first.collected(3);
  assert(!first.enabled);
  const next = new PickupGuide(storage);
  assert(next.enabled);
  next.collected(1);
  assert(!next.enabled);
  next.toggle();
  next.collected(20);
  assert(next.enabled);
  next.toggle();
  assert(!next.enabled);
});
test("manual dismissal and grouped collections stop automatic guidance", () => {
  const g = new PickupGuide();
  g.toggle();
  g.collected(1);
  assert(!g.enabled);
  const grouped = new PickupGuide();
  grouped.collected(5);
  assert(!grouped.enabled);
  const denied = new PickupGuide({
    getItem() {
      throw Error();
    },
    setItem() {
      throw Error();
    },
  });
  denied.collected(3);
  assert(!denied.enabled);
});
test("nearest target excludes oversized/collected pieces and respects real regions", () => {
  const items = [piece(1, 10, 0, 50), piece(2, 20, 0), piece(3, 0, 3000)];
  items[1].gone = true;
  assert.equal(nearestCollectible(items, 0, 0, 15)?.item.id, 3);
  items[1].gone = false;
  assert.equal(nearestCollectible(items, 0, 0, 15)?.item.id, 2);
  const sparse = {
    ...piece(4, 0, 0),
    regions: [{ x: 200, y: 200, width: 20, height: 20 }],
  } as Piece & { gone: boolean };
  assert.equal(nearestCollectible([sparse, items[1]], 0, 0, 15)?.item.id, 2);
  assert.equal(nearestCollectible(items, 0, 0, 1), undefined);
});
test("local map keeps player centered and distances isotropic as it scrolls", () => {
  for (const y of [0, 4500, 9000]) {
    const m = localMap(180, 100, 500, y);
    assert.equal(m.x + 500 * m.scale, 90);
    assert.equal(m.y + y * m.scale, 50);
    assert(
      Math.abs(m.x + 600 * m.scale - 90 - (m.y + (y + 100) * m.scale - 50)) <
        1e-10,
    );
  }
  const a = localMap(180, 100, 0, 0),
    b = localMap(180, 100, 100, 200);
  assert.equal(a.scale, b.scale);
  assert.equal(b.x, a.x - 100 * a.scale);
});
