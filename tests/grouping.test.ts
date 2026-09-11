import test from "node:test";
import assert from "node:assert/strict";
import { PickupIndex, combinedPiece } from "../src/grouping";
import { properties, type Piece } from "../src/shared";
import { highlightScore, highlightSlot, HIGHLIGHT_LIMIT } from '../src/highlights';
const items = Array.from({ length: 100 }, (_, id) => ({
  id,
  x: 100 + (id % 10) * 12,
  y: 100 + Math.floor(id / 10) * 12,
  width: 10,
  height: 10,
  gone: false,
  tagName: "SPAN",
  text: "word",
  type: "TEXT",
  fontSize: 12,
  backgroundColor: "#fff",
  borderRadius: "0",
  zIndex: "0",
  ...properties(10, 10, "TEXT"),
}));
test('graphics stay independent, including when nearby text is grouped', () => {
  const source = items.map(p => ({...p}));
  source[1].type = 'IMAGE';
  const index = new PickupIndex(source);
  assert.deepEqual(index.group(source[1], 160, 180), [source[1]]);
  for (const p of source.filter(p => p !== source[1]))
    assert.ok(!index.group(p, 160, 180).includes(source[1]));
});
test('late charts displace text on a bounded outer layer; small text cannot displace charts', () => {
  const text = {...items[0], width: 200, height: 100};
  const chart = {...text, type: 'IMAGE'};
  const scores = Array(HIGHLIGHT_LIMIT).fill(highlightScore(text));
  for (let i=0; i<HIGHLIGHT_LIMIT; i++) {
    const slot = highlightSlot(scores, highlightScore(chart));
    assert.ok(slot >= 0);
    scores[slot] = highlightScore(chart);
  }
  assert.equal(scores.length, HIGHLIGHT_LIMIT);
  assert.equal(highlightSlot(scores, highlightScore(text)), -1);
  assert.equal(highlightSlot(scores, highlightScore(items[0])), -1);
  assert.ok(highlightSlot(scores, highlightScore({...chart, width: 400})) >= 0);
});
test("small ball stays granular; larger ball batches nearby eligible pieces and keeps singles", () => {
  const index = new PickupIndex(items);
  assert.ok(items.every((p) => index.group(p, 20, 20).length === 1));
  const groups = items.map((p) => index.group(p, 160, 180));
  assert.ok(groups.some((g) => g.length > 5));
  assert.ok(groups.some((g) => g.length === 1));
  assert.ok(groups.every((g) => g.length <= 18));
  const seed = items.find((p) => index.group(p, 160, 180).length > 1)!;
  const group = index.group(seed, 160, 180),
    merged = combinedPiece(group);
  assert.equal(
    merged.mass,
    group.reduce((n, p) => n + p.mass, 0),
  );
  assert.equal(
    merged.growthValue,
    group.reduce((n, p) => n + p.growthValue, 0),
  );
  assert.equal(merged.regions?.length, group.length);
});
test("groups exclude consumed, oversized and distant pieces", () => {
  const source = items.map((p) => ({ ...p }));
  source[1].threshold = 999;
  source[2].gone = true;
  source[3].x = 5000;
  const index = new PickupIndex(source);
  for (const seed of source.filter(
    (p) => !p.gone && p.threshold < 180 && p.x < 500,
  )) {
    const group = index.group(seed, 160, 180);
    assert.ok(group.every((p) => !p.gone && p.threshold <= 180 && p.x < 500));
  }
});
