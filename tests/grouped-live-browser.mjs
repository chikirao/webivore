import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const browser = await chromium.launch({
  args: ["--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const results = [];
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const name of ["Wikipedia", "Hacker News"]) {
    await page.goto("http://localhost:5174");
    await page.getByRole("button", { name: new RegExp("^" + name) }).click();
    await page.waitForFunction(
      () => window.__game?.ready,
      {},
      { timeout: 75000 },
    );
    await page.waitForTimeout(3500);
    const before = await page.evaluate(() => {
      const g = window.__game;
      g.paused = true;
      g.muted = true;
      for (let i = 0; i < 24; i++) {
        const p = g.items
          .filter((p) => !p.gone && p.threshold <= g.capacity)
          .sort((a, b) => a.threshold - b.threshold)[0];
        g.pickup(p);
      }
      g.time += 1;
      g.animateWorld(0.7);
      window.__frozen = Array.from(g.collection.fragments[0].positions);
      window.__depth = g.collection.fragments[0].depth;
      return { pieces: g.items.length, layers: g.collection.layers.length };
    });
    assert.ok(before.pieces > 100);
    const mid = await page.evaluate(() => {
      const g = window.__game;
      while (g.count < g.items.length * 0.65) {
        const p = g.items
          .filter((p) => !p.gone && p.threshold <= g.capacity)
          .sort((a, b) => a.threshold - b.threshold)[0];
        if (!p) throw Error("No eligible remaining piece");
        g.pickup(p, g.pickupIndex.group(p, g.radius, g.capacity));
      }
      g.time += 1;
      g.animateWorld(0.7);
      g.surface.flush();
      g.x = 640;
      g.y = 950;
      g.vx = g.vy = 0;
      g.cam.userZoom = 1.5;
      g.cam.yaw = g.heading;
      g.cam.pitch = 0.65;
      return { count: g.count, bites: g.visualBites, radius: g.radius };
    });
    await page.waitForTimeout(600);
    await page.screenshot({
      path: "artifacts/grouped-" + name.replaceAll(" ", "-") + ".png",
    });
    const end = await page.evaluate(() => {
      const g = window.__game;
      let steps = 0;
      while (g.count < g.items.length && steps++ < g.items.length) {
        const p = g.items
          .filter((p) => !p.gone && p.threshold <= g.capacity)
          .sort((a, b) => a.threshold - b.threshold)[0];
        if (!p) throw Error("No eligible final piece");
        g.x = p.x + p.width / 2;
        g.y = p.y + p.height / 2;
        g.vx = g.vy = 0;
        g.update(0.016);
      }
      g.time += 1;
      g.animateWorld(0.7);
      g.surface.flush();
      let visible = 0;
      const sample = document.createElement("canvas");
      sample.width = sample.height = 1;
      const ctx = sample.getContext("2d");
      ctx.fillStyle = g.level.pageColor;
      ctx.fillRect(0, 0, 1, 1);
      const color = ctx.getImageData(0, 0, 1, 1).data;
      for (const t of g.surface.tiles) {
        const data = t.ctx.getImageData(
          0,
          0,
          t.canvas.width,
          t.canvas.height,
        ).data;
        for (let i = 0; i < data.length; i += 4)
          if (
            Math.abs(data[i] - color[0]) +
              Math.abs(data[i + 1] - color[1]) +
              Math.abs(data[i + 2] - color[2]) >
            24
          )
            visible++;
      }
      return {
        count: g.count,
        total: g.items.length,
        bites: g.visualBites,
        visible,
        done: g.done,
        radius: g.radius,
        max: g.maxRadius,
        mass: g.mass,
        totalMass: g.total,
        layers: g.collection.layers.length,
        frozen:
          JSON.stringify(window.__frozen) ===
            JSON.stringify(Array.from(g.collection.fragments[0].positions)) &&
          window.__depth === g.collection.fragments[0].depth,
        allAccounted: g.attached.every((p) => p.gone && p.packed?.baked),
        unique: new Set(g.attached.map((p) => p.id)).size,
      };
    });
    assert.equal(end.count, end.total);
    assert.equal(end.unique, end.total);
    assert.ok(end.done && end.frozen && end.allAccounted);
    assert.equal(end.visible, 0);
    assert.ok(Math.abs(end.mass - end.totalMass) < 0.01);
    assert.ok(end.radius <= end.max);
    assert.ok(end.bites < end.total * 0.9);
    results.push({ name, before, mid, end });
    console.log(JSON.stringify(results.at(-1)));
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(
    "artifacts/grouped-live-results.json",
    JSON.stringify(results, null, 2),
  );
} finally {
  await browser.close();
}
