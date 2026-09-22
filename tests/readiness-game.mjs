import { chromium } from "playwright";
import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
const browser = await chromium.launch({
  args: [
    "--enable-unsafe-swiftshader",
    "--use-gl=angle",
    "--use-angle=swiftshader",
  ],
});
await mkdir("artifacts/readiness", { recursive: true });
const reports = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1536, height: 1024 },
    acceptDownloads: true,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const [name, url] of [
    ["youtube", "https://www.youtube.com/watch?v=jNQXAC9IVRw"],
    ["wikipedia", "https://en.wikipedia.org/wiki/Internet"],
    ["example", "https://example.com"],
  ]) {
    await page.goto("http://localhost:5174");
    await page.locator("#url").fill(url);
    const started = Date.now();
    const response = page.waitForResponse(
      (r) => r.url().endsWith("/api/snapshot"),
      { timeout: 60000 },
    );
    await page.locator(".start-key").click();
    const data = await (await response).json();
    assert.ok(data.pieces?.length, data.error);
    await page.waitForFunction(() => window.__game?.ready, null, {
      timeout: 60000,
    });
    await page.waitForFunction(() => !window.__game.paused);
    await page.screenshot({ path: `artifacts/readiness/game-${name}.png` });
    if (name === "youtube") {
      assert.equal(data.diagnostics.readiness.media.posters, 1);
      for (const [width, height] of [
        [1024, 768],
        [768, 1024],
        [390, 844],
      ]) {
        await page.setViewportSize({ width, height });
        await page.screenshot({
          path: `artifacts/readiness/game-youtube-${width}.png`,
        });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
        );
      }
      await page.setViewportSize({ width: 1536, height: 1024 });
    }
    const result = await page.evaluate(() => {
      const g = window.__game;
      g.muted = true;
      let remaining = g.items.length + 1;
      while (g.count < g.items.length && remaining--) {
        const p = g.items
          .filter((p) => !p.gone && p.threshold <= g.capacity)
          .sort((a, b) => a.threshold - b.threshold)[0];
        if (!p) break;
        g.pickup(p, g.pickupIndex.group(p, g.radius, g.capacity));
      }
      return {
        count: g.count,
        total: g.items.length,
        mass: g.mass,
        expected: g.items.reduce((sum, p) => sum + p.mass, 0),
        unique: new Set(g.attached.map((p) => p.id)).size,
      };
    });
    assert.equal(result.count, result.total);
    assert.equal(result.unique, result.total);
    assert.ok(Math.abs(result.mass - result.expected) < 0.001);
    await page.waitForSelector(".export-key");
    await page.screenshot({ path: `artifacts/readiness/finish-${name}.png` });
    if (name === "youtube") {
      const download = page.waitForEvent("download", { timeout: 180000 });
      await page.locator(".export-key").click();
      await (await download).saveAs("artifacts/readiness/youtube.gif");
    }
    await page.getByRole("button", { name: "Play again" }).click();
    await page.locator(".demo").waitFor();
    const report = {
      name,
      url,
      ms: Date.now() - started,
      ...result,
      diagnostics: data.diagnostics,
    };
    reports.push(report);
    console.log(JSON.stringify(report));
  }
  await page.locator(".demo").click();
  await page.waitForFunction(() => window.__game?.ready);
  assert.deepEqual(errors, []);
  await writeFile(
    "artifacts/readiness/game-results.json",
    JSON.stringify(reports, null, 2),
  );
} finally {
  await browser.close();
}
