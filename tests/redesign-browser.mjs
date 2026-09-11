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
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:5174");
  await page.locator(".entry-art").waitFor();
  await page.screenshot({ path: "artifacts/redesign-landing.png" });
  await page.getByRole("button", { name: /try demo/ }).click();
  await page.waitForFunction(() => window.__game?.ready);
  await page.waitForTimeout(3500);
  assert.equal(await page.evaluate(() => window.__game.count), 0);
  await page.evaluate(() => {
    const g = window.__game;
    g.paused = true;
    g.muted = true;
    g.cam.userZoom = 1.5;
  });
  await page.screenshot({ path: "artifacts/redesign-start.png" });
  const motion = await page.evaluate(() => {
    const g = window.__game;
    g.radius = 70;
    g.x = 400;
    g.y = 400;
    g.vx = 80;
    g.vy = 0;
    g.heading = 0;
    const old = g.items.map((p) => p.threshold);
    g.items.forEach((p) => (p.threshold = 999999));
    g.update(0.05);
    const result = { x: g.x, vx: g.vx, count: g.count };
    g.items.forEach((p, i) => (p.threshold = old[i]));
    g.radius = 0;
    return result;
  });
  assert.ok(motion.x > 400 && motion.vx > 0);
  assert.equal(motion.count, 0);
  await page.evaluate(() => {
    const g = window.__game;
    for (let i = 0; i < 80; i++) {
      const p = g.items
        .filter((p) => !p.gone && p.threshold <= g.capacity)
        .sort((a, b) => a.threshold - b.threshold)[0];
      if (p) g.pickup(p, g.pickupIndex.group(p, g.radius, g.capacity));
    }
    g.time += 1;
    g.x = 640;
    g.y = 600;
    g.vx = g.vy = 0;
    g.cam.userZoom = 1.5;
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: "artifacts/redesign-grown.png" });
  await page.evaluate(() => {
    const g = window.__game;
    g.cam.yaw = Math.PI;
    g.cam.pitch = 1.3;
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: "artifacts/redesign-top.png" });
  await page.evaluate(() => {
    const g = window.__game;
    for (const p of [...g.items].sort((a, b) => a.threshold - b.threshold))
      if (!p.gone) g.pickup(p, g.pickupIndex.group(p, g.radius, g.capacity));
    g.done = g.count === g.items.length;
  });
  await page.getByRole("heading", { name: "All yours!" }).waitFor();
  await page.waitForTimeout(500);
  await page.screenshot({ path: "artifacts/redesign-victory.png" });
  const downloadPromise = page.waitForEvent("download", { timeout: 120000 });
  await page.getByRole("button", { name: "EXPORT GIF" }).click();
  const download = await downloadPromise;
  await download.saveAs("artifacts/webivore-trophy.gif");
  const gif = await fs.readFile("artifacts/webivore-trophy.gif");
  assert.equal(gif.subarray(0, 6).toString(), "GIF89a");
  assert.equal(gif.readUInt16LE(6), 512);
  assert.equal(gif.readUInt16LE(8), 512);
  await page.getByRole("button", { name: /EAT ANOTHER SITE/ }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "artifacts/redesign-mobile.png" });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.getByRole("button", { name: /try demo/ }).click();
  await page.waitForFunction(() => window.__game?.ready);
  await page.waitForTimeout(3500);
  await page.screenshot({ path: "artifacts/redesign-mobile-game.png" });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ motion, gifBytes: gif.length, errors }));
} finally {
  await browser.close();
}
