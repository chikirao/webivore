import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { captureBall } from "./ball-capture.mjs";
// Deterministic shell fixture; direct pickups intentionally skip walking here.
// tests/wikipedia-run.mjs separately proves collection through keyboard input.
mkdirSync("artifacts/astra-qa", { recursive: true });
const browser = await chromium.launch({
  args: [
    "--enable-unsafe-swiftshader",
    "--use-gl=angle",
    "--use-angle=swiftshader",
  ],
});
try {
  const page = await browser.newPage({
      viewport: { width: 1536, height: 1024 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.WEBIVORE_URL ?? "http://localhost:5174");
  await page.click(process.argv[2] === "demo" ? ".demo" : "text=Wikipedia");
  await page.waitForFunction(() => window.__game?.ready, null, {
    timeout: 120000,
  });
  await page.waitForTimeout(3500);
  const result = await page.evaluate(() => {
    const g = window.__game;
    g.muted = true;
    while (g.count < g.items.length) {
      const eligible = g.items
        .filter((p) => !p.gone && p.threshold <= g.capacity)
        .sort(
          (a, b) =>
            Math.hypot(a.x - g.x, a.y - g.y) - Math.hypot(b.x - g.x, b.y - g.y),
        );
      if (!eligible.length) break;
      const p = eligible[0];
      g.pickup(p, g.pickupIndex.group(p, g.radius, g.capacity));
    }
    for (const f of g.collection.fragments) g.collection.bake(f);
    g.paused = true;
    return {
      count: g.count,
      total: g.items.length,
      unique: new Set(g.attached.map((p) => p.id)).size,
      draws: g.collection.renderMeshes.length,
      layers: g.collection.layers.length,
    };
  });
  assert.equal(result.count, result.total);
  assert.equal(result.unique, result.total);
  assert(result.draws <= result.layers + 2);
  await captureBall(
    page,
    `artifacts/astra-qa/ball-views-${process.argv[2] === "demo" ? "demo" : "wiki"}.png`,
  );
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(result));
  if (process.argv.includes("--gif")) {
    await page.evaluate(() => {
      const g = window.__game;
      g.done = g.count === g.items.length;
      g.paused = false;
    });
    await page.waitForSelector(".export-key");
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 300000 }),
      page.locator(".export-key").click(),
    ]);
    await download.saveAs("artifacts/astra-qa/rough-ball.gif");
    assert.deepEqual(errors, []);
    console.log("Exported current shell via UI.");
  }
} finally {
  await browser.close();
}
