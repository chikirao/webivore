import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
const out = "artifacts/navigation-qa";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  args: ["--enable-unsafe-swiftshader"],
});
const results = [],
  errors = [];
try {
  for (const [width, height] of [
    [1536, 1024],
    [1024, 768],
    [768, 1024],
    [390, 844],
    [1280, 600],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: width <= 768,
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://localhost:5174");
    await page.evaluate(() => document.fonts.ready);
    for (const loading of [false, true]) {
      if (loading) {
        await page.route("**/api/snapshot", () => {});
        await page
          .locator("#url")
          .fill("https://www.youtube.com/watch?v=XFl4q2FfkVg");
        await page.locator(".start-key").click();
      }
      const bounds = await page.locator(".start-key").evaluate((el) => {
        const a = el.getBoundingClientRect(),
          b = el.querySelector("span").getBoundingClientRect();
        return {
          fits:
            b.left >= a.left &&
            b.right <= a.right &&
            b.top >= a.top &&
            b.bottom <= a.bottom,
          font: getComputedStyle(el.querySelector("span")).fontSize,
        };
      });
      assert(bounds.fits, JSON.stringify({ width, height, loading, bounds }));
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page.screenshot({
        path: `${out}/${width}-${height}-${loading ? "loading" : "entry"}.png`,
      });
      results.push({ width, height, loading, ...bounds });
    }
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.goto("http://localhost:5174");
    await page.locator(".demo").click();
    await page.waitForFunction(
      () => window.__game?.ready && !window.__game.paused,
    );
    const hint = page.getByRole("button", {
      name: "Guide to nearest collectible",
    });
    assert.equal(await hint.getAttribute("aria-pressed"), "true");
    await page.keyboard.press("h");
    await page.waitForTimeout(200);
    assert.equal(await hint.getAttribute("aria-pressed"), "false");
    await hint.click();
    await page.waitForTimeout(200);
    assert.equal(await hint.getAttribute("aria-pressed"), "true");
    const hit = await hint.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return el.contains(
        document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
      );
    });
    assert(hit);
    await page.mouse.move(0, 0);
    await page.screenshot({ path: `${out}/${width}-${height}-game.png` });
    assert.equal(
      await page.locator(".touch-joystick").count(),
      width <= 768 ? 1 : 0,
    );
    if (width === 1536) {
      await page.evaluate(() => {
        const g = window.__game;
        g.x = 1100;
        g.y = 1000;
        g.guideCheckedAt = -Infinity;
        g.updateGuide();
        g.resetCamera();
      });
      await page.waitForTimeout(350);
      assert(
        await page.evaluate(() =>
          window.__game.guideArrows.children.some((a) => a.visible),
        ),
      );
      await page.screenshot({ path: `${out}/guide-path.png` });
      await page.evaluate(() => {
        const g = window.__game;
        g.level.height = 9000;
        g.x = 500;
        g.y = 4500;
        g.paused = true;
        g.drawMap();
      });
      const centered = await page.evaluate(() => {
        const g = window.__game,
          c = g.mapCanvas;
        return [
          ...g.mapContext.getImageData(
            Math.floor(c.width / 2),
            Math.floor(c.height / 2),
            1,
            1,
          ).data,
        ];
      });
      assert(centered[0] > 220 && centered[1] < 60);
      await page.screenshot({ path: `${out}/long-map.png` });
    }
    await context.close();
  }
  // Real pickup integration: first three, returning one; no fabricated UI state.
  const context = await browser.newContext({
    viewport: { width: 1536, height: 1024 },
  });
  const page = await context.newPage();
  await page.goto("http://localhost:5174");
  for (const quota of [3, 1]) {
    await page.locator(".demo").click();
    await page.waitForFunction(() => window.__game?.ready);
    await page.evaluate(() => {
      window.__game.paused = true;
    });
    for (let i = 1; i <= quota; i++) {
      const enabled = await page.evaluate(() => {
        const g = window.__game;
        g.paused = true;
        const p = g.items.find((p) => !p.gone && p.threshold <= g.capacity);
        g.pickup(p);
        return g.guide.enabled;
      });
      assert.equal(enabled, i < quota);
    }
    await page.getByTitle("Back to websites").click();
  }
  await context.close();
  assert.deepEqual(errors, []);
  writeFileSync(
    `${out}/results.json`,
    JSON.stringify({ results, errors, tutorial: "3 then 1 passed" }, null, 2),
  );
  console.log("Navigation browser QA passed", results);
} finally {
  await browser.close();
}
