import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const url = process.argv[2] ?? "https://www.youtube.com/watch?v=XFl4q2FfkVg";
const dir = "artifacts/youtube-page";
await mkdir(dir, { recursive: true });
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
    acceptDownloads: true,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:5174");
  await page.locator("#url").fill(url);
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/api/snapshot"),
    { timeout: 60000 },
  );
  await page.locator(".start-key").click();
  const data = await (await response).json();
  assert.ok(data.pieces?.length, data.error);
  const recovery = data.diagnostics.readiness.youtube;
  assert.equal(recovery.state, "recovered");
  assert.ok(recovery.recommendations > 0);
  assert.ok(recovery.comments > 0);
  assert.equal(data.diagnostics.readiness.assets.missingImages, 0);
  assert.ok(data.diagnostics.network.requests <= 180);
  assert.ok(data.diagnostics.network.bytes <= 24_000_000);
  await writeFile(`${dir}/level.json`, JSON.stringify(data));
  await writeFile(
    `${dir}/atlas.png`,
    Buffer.from(data.atlas.split(",")[1], "base64"),
  );
  await page.waitForFunction(() => window.__game?.ready, null, {
    timeout: 60000,
  });
  await page.waitForFunction(() => !window.__game.paused);
  for (const [name, y] of [
    ["top", 560],
    ["comments", 1500],
  ]) {
    await page.evaluate((y) => {
      const g = window.__game;
      g.paused = true;
      g.x = 640;
      g.y = y;
      g.resetCamera();
      g.cam.pitch = 1.15;
      g.cam.yaw = 0;
      g.cam.userZoom = 0.45;
    }, y);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${dir}/game-${name}.png` });
  }
  for (const [width, height] of [
    [1024, 768],
    [768, 1024],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: `${dir}/game-${width}.png` });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  }
  await page.setViewportSize({ width: 1536, height: 1024 });
  const completion = await page.evaluate(() => {
    const g = window.__game;
    g.muted = true;
    g.paused = false;
    let n = g.items.length + 1;
    while (g.count < g.items.length && n--) {
      const p = g.items
        .filter((p) => !p.gone && p.threshold <= g.capacity)
        .sort((a, b) => a.threshold - b.threshold)[0];
      if (!p) break;
      g.pickup(p, g.pickupIndex.group(p, g.radius, g.capacity));
    }
    return {
      count: g.count,
      total: g.items.length,
      unique: new Set(g.attached.map((p) => p.id)).size,
      mass: g.mass,
      expected: g.items.reduce((s, p) => s + p.mass, 0),
    };
  });
  assert.equal(completion.count, completion.total);
  assert.equal(completion.unique, completion.total);
  assert.ok(Math.abs(completion.mass - completion.expected) < 0.001);
  await page.waitForSelector(".export-key");
  await page.screenshot({ path: `${dir}/finish.png` });
  const download = page.waitForEvent("download", { timeout: 180000 });
  await page.locator(".export-key").click();
  await (await download).saveAs(`${dir}/final.gif`);
  await page.getByRole("button", { name: "Play again" }).click();
  await page.locator(".demo").waitFor();
  assert.deepEqual(errors, []);
  const result = { url, diagnostics: data.diagnostics, completion, errors };
  await writeFile(`${dir}/results.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
