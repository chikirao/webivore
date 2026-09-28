import test from "node:test";
import assert from "node:assert/strict";
import { crumbsToSweep, isCrumb } from "../src/sweep.ts";
import { tearSize } from "../src/world.ts";

const piece = (side: number, threshold = 10) => ({ width: side, height: side / 2, threshold });

test("a crumb is collectable and small next to the ball", () => {
  assert.equal(isCrumb(piece(20), 100, 50), true);
  assert.equal(isCrumb(piece(80), 100, 50), false, "too large for this ball");
  assert.equal(isCrumb(piece(20, 60), 100, 50), false, "not collectable yet");
});

test("leftover crumbs are swept only near the end or when nothing else is left", () => {
  const crumb = piece(10);
  const big = piece(400);
  assert.deepEqual(crumbsToSweep([crumb, big], 90, 100, 100, 50), [], "mid-game crumbs stay on the page");
  assert.deepEqual(crumbsToSweep([crumb, big], 98, 100, 100, 50), [crumb], "97%+ sweeps crumbs, big pieces stay");
  assert.deepEqual(crumbsToSweep([crumb], 50, 100, 100, 50), [crumb], "only crumbs left");
  assert.deepEqual(crumbsToSweep([big], 99, 100, 100, 50), [], "a real piece still has to be eaten");
});

test("holes stay small early and pad wide enough late to merge neighbouring lines", () => {
  const early = tearSize(8);
  const late = tearSize(160);
  assert.ok(early.pad < 1.5, `early pad ${early.pad}`);
  assert.ok(late.pad * 2 >= 12, `late holes bridge a 12px line gap (pad ${late.pad})`);
  assert.ok(late.rim > late.pad && late.rough > early.rough);
  assert.ok(tearSize(10_000).pad <= 14.4, "padding is bounded");
});
