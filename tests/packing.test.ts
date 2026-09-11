import test from "node:test";
import assert from "node:assert/strict";
import {
  LAYER_SIZE,
  PRIORITY_LIMIT,
  VERTS,
  attachmentDirection,
  regularPlacement,
  priorityPlacement,
  sheet,
  worldVertices,
  vertexRadii,
  orientation,
} from "../src/packing.ts";
import { highlightScore, highlightSlot } from "../src/highlights.ts";

const mean = (a: number[]) => a.reduce((n, x) => n + x, 0) / a.length;
/** Growth of a real run: radius follows the square root of collected area. */
const radiusAt = (i: number, n: number, max = 360) => Math.max(5, max * Math.sqrt((i + 1) / n));
const aspectAt = (i: number) => 0.6 + ((i * 37) % 100) / 90;

test("orientation maps +Z onto the attachment normal for every direction", () => {
  for (let i = 0; i < 400; i++) {
    const p = regularPlacement(i, 100, 1);
    const [qx, qy, qz, qw] = orientation({ ...p, roll: 0 });
    // rotate (0,0,1) by q
    const x = 2 * (qx * qz + qw * qy), y = 2 * (qy * qz - qw * qx), z = 1 - 2 * (qx * qx + qy * qy);
    assert.ok(Math.hypot(x - p.normal[0], y - p.normal[1], z - p.normal[2]) < 1e-9, `index ${i}`);
    assert.ok(Math.abs(Math.hypot(...attachmentDirection(i)) - 1) < 1e-12);
  }
});

test("a late large Wikipedia pie chart stays on the surface without forming a separate air sphere", () => {
  const n = 1000, R = 360;
  // The live shell at the end: vertex radii of the newest regular bites.
  const recent: number[][] = [];
  for (let i = n - LAYER_SIZE * 2; i < n; i++) {
    const p = regularPlacement(i, radiusAt(i, n), aspectAt(i));
    recent.push(vertexRadii(worldVertices(p, sheet(p, i))));
  }
  const shellMin = Math.min(...recent.flat()), shellMax = Math.max(...recent.flat());
  const shellMean = mean(recent.map(mean));
  // A pie chart collected at bite 990 (aspect 1.6), promoted to the priority set and refit to R.
  const chartIndex = 990, chart = priorityPlacement(chartIndex, R, 1.6);
  const chartRadii = vertexRadii(worldVertices(chart, sheet(chart, chartIndex)));
  assert.ok(Math.min(...chartRadii) >= shellMin - R * 0.02, `chart dips below the shell band: ${Math.min(...chartRadii)} < ${shellMin}`);
  assert.ok(Math.max(...chartRadii) <= shellMax + R * 0.02, `chart floats above the shell band: ${Math.max(...chartRadii)} > ${shellMax}`);
  assert.ok(Math.abs(mean(chartRadii) - shellMean) < R * 0.08, `chart mean ${mean(chartRadii)} vs shell mean ${shellMean}`);
  // Partial overlap: neighbours reach beyond the chart's centre, so it is woven into the shell.
  const centre = chartRadii[Math.floor(VERTS / 2)];
  assert.ok(recent.some((r) => Math.max(...r) > centre), "no neighbour reaches past the chart");
  // Fitted, not stretched: wide charts keep their aspect within the regular size envelope.
  assert.ok(chart.width / chart.height > 1.3 && chart.width <= R * 1.15 * 1.1);
  // It sits over its own frozen inner copy, hiding the duplicate.
  const w = worldVertices(chart, sheet(chart, chartIndex));
  const c = [w[40 * 3], w[40 * 3 + 1], w[40 * 3 + 2]], l = Math.hypot(...c);
  const dot = c[0] / l * chart.normal[0] + c[1] / l * chart.normal[1] + c[2] / l * chart.normal[2];
  assert.ok(dot > 0.99);
  // And it keeps its relation to the shell while the ball grows.
  for (const r of [120, 200, 300]) {
    const p = priorityPlacement(chartIndex, r, 1.6);
    const radii = vertexRadii(worldVertices(p, sheet(p, chartIndex)));
    const shell = regularPlacement(chartIndex, r, 1);
    const band = vertexRadii(worldVertices(shell, sheet(shell, chartIndex)));
    assert.ok(mean(radii) - mean(band) < r * 0.06 && mean(radii) > mean(band), `r=${r}`);
  }
});

test("priority selection is bounded and prefers graphics, then size, then recency", () => {
  const base = { id: 0, tagName: "P", text: "", x: 0, y: 0, width: 300, height: 100, type: "TEXT_BLOCK", fontSize: 12, backgroundColor: "", borderRadius: "", zIndex: "", threshold: 1, mass: 1, score: 1, growthValue: 1 };
  const scores: number[] = [];
  for (let i = 0; i < 40; i++) {
    const slot = highlightSlot(scores, highlightScore({ ...base, type: i % 3 ? "IMAGE" : "TEXT_BLOCK", width: 200 + i * 10 }));
    if (slot >= 0) scores[slot] = highlightScore({ ...base, type: i % 3 ? "IMAGE" : "TEXT_BLOCK", width: 200 + i * 10 });
    assert.ok(slot < PRIORITY_LIMIT);
  }
  assert.equal(scores.length, PRIORITY_LIMIT);
  assert.ok(scores.every((s) => s >= 1e6), "text remains only while graphics are scarce");
  assert.equal(highlightSlot(scores, highlightScore({ ...base, type: "TEXT_BLOCK", width: 5000 })), -1);
});
