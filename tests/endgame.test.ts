import test from "node:test";
import assert from "node:assert/strict";
import { crumbsToSweep, isCrumb } from "../src/sweep.ts";
import { tearSize } from "../src/world.ts";
import { EmptyCells } from "../src/clearing.ts";

const piece = (side: number, threshold = 10) => ({ width: side, height: side / 2, threshold, mass: (side * side) / 2 });

test("a crumb is collectable and small next to the ball", () => {
  assert.equal(isCrumb(piece(20), 100, 50), true);
  assert.equal(isCrumb(piece(160), 100, 50), false, "too large for this ball");
  assert.equal(isCrumb(piece(20, 60), 100, 50), false, "not collectable yet");
  assert.equal(isCrumb({ width: 900, height: 2, threshold: 10 }, 100, 50), true, "a hairline rule is small, however long");
});

test("leftover crumbs are swept near the end or when nothing else is left", () => {
  const crumb = piece(10);
  const big = piece(400);
  const total = 1_000_000;
  assert.deepEqual(crumbsToSweep([crumb, big], total * 0.8, total, 100, 50), [], "mid-game crumbs stay on the page");
  assert.deepEqual(crumbsToSweep([crumb, big], total * 0.9, total, 100, 50), [crumb], "90%+ sweeps crumbs, big pieces stay");
  assert.deepEqual(crumbsToSweep([crumb], total * 0.5, total, 100, 50), [crumb], "only crumbs left");
  assert.deepEqual(crumbsToSweep([big], total * 0.9, total, 100, 50), [], "a real piece still has to be eaten");
});

test("a forgotten comma never blocks the finish", () => {
  const comma = { width: 4, height: 9, threshold: 12, mass: 36 };
  const rule = { width: 2400, height: 1, threshold: 12, mass: 2400 };
  const total = 4_000_000;
  assert.deepEqual(crumbsToSweep([comma, rule], total - 2436, total, 360, 400), [comma, rule], "both go once the page is nearly eaten");
  const tooBig = { width: 250, height: 200, threshold: 12, mass: 50_000 };
  assert.deepEqual(crumbsToSweep([comma, tooBig], total - 50_036, total, 360, 400), [comma, tooBig], "what is left weighs next to nothing: the page clears");
});

test("holes stay small early and pad wide enough late to merge neighbouring lines", () => {
  const early = tearSize(8);
  const late = tearSize(160);
  assert.ok(early.pad < 1.5, `early pad ${early.pad}`);
  assert.ok(late.pad * 2 >= 12, `late holes bridge a 12px line gap (pad ${late.pad})`);
  assert.ok(late.rim > late.pad && late.rough > early.rough);
  assert.ok(tearSize(10_000).pad <= 14.4, "padding is bounded");
});

test("empty background next to eaten content clears, cells under live pieces stay", () => {
  const live = { x: 200, y: 0, width: 40, height: 40 };
  const eaten = { x: 0, y: 0, width: 40, height: 40 };
  const cells = new EmptyCells(480, 96, [live, eaten]);
  assert.deepEqual(cells.clearNear(eaten, 0), [], "the bitten cell still holds the piece until it is eaten");
  cells.eaten(eaten);
  const near = cells.clearNear(eaten, 60);
  assert.deepEqual(near, [
    { x: 0, y: 0, width: 144, height: 48 },
    { x: 336, y: 0, width: 48, height: 48 },
    { x: 0, y: 48, width: 144, height: 48 },
    { x: 336, y: 48, width: 48, height: 48 },
  ], "empty cells merge into runs per row; the live piece keeps two cells of paper around it");
  const far = cells.clearNear({ x: 0, y: 0, width: 480, height: 96 }, 0);
  assert.ok(far.filter((r) => r.y === 0).every((r) => r.x + r.width <= 192 || r.x >= 240), "the live piece's cell is never cleared");
  assert.deepEqual(cells.clearNear(eaten, 60), [], "cells clear once");
});

test("a blank page margin clears once the content beside it is eaten, even beyond the bite's reach", () => {
  // text column at x 300-700, an empty left margin 0-250
  const lines = Array.from({ length: 8 }, (_, i) => ({ x: 300, y: i * 60, width: 400, height: 20 }));
  const below = { x: 300, y: 2000, width: 400, height: 20 };
  const cells = new EmptyCells(960, 2100, [...lines, below]);
  let cleared: { x: number; y: number; width: number; height: number }[] = [];
  for (const line of lines) {
    cells.eaten(line);
    cleared = cleared.concat(cells.clearNear(line, 40));
  }
  const at = (x: number, y: number) => cleared.some((r) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height);
  assert.ok(at(10, 100) && at(10, 400), "the left margin next to the eaten column is gone");
  assert.ok(!at(310, 2005), "live content far below keeps its paper");
  assert.ok(!at(10, 1900), "margin next to uneaten content stays");
});

test("only a piece's actual pixels keep background alive, not its bounding box", () => {
  // an L-shaped piece: its box spans 0-480, its pixels are two thin strips
  const piece = {
    x: 0,
    y: 0,
    width: 480,
    height: 480,
    regions: [
      { x: 0, y: 0, width: 480, height: 10 },
      { x: 0, y: 0, width: 10, height: 480 },
    ],
  };
  const eaten = { x: 470, y: 470, width: 10, height: 10 };
  const cells = new EmptyCells(480, 480, [piece, eaten]);
  cells.eaten(eaten);
  const cleared = cells.clearNear(eaten, 100);
  assert.ok(cleared.some((r) => r.x <= 300 && r.x + r.width > 300 && r.y <= 300 && r.y + r.height > 300), "empty inside of the L clears");
  assert.ok(!cleared.some((r) => r.y === 0), "the strip's own row stays");
});
