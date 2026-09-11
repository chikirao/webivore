import { chromium } from "playwright";
import assert from "node:assert/strict";
import { PNG } from "pngjs";
const browser = await chromium.launch({
  args: ["--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:5174");
  for (const [name, url] of [
    ["wikipedia", "https://en.wikipedia.org/wiki/Internet"],
    ["example", "https://example.com"],
  ]) {
    await page.getByLabel("WHAT’S ON THE MENU?").fill(url);
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/snapshot") && r.request().method() === "POST",
      { timeout: 65000 },
    );
    await page.getByRole("button", { name: /^CONSUME/ }).click();
    const snapshot = await (await response).json();
    assert.ok(snapshot.pieces?.length > 0, JSON.stringify(snapshot));
    await page.waitForFunction(() => !!(window as any).__game?.ready);
    await page.waitForFunction(() => !(window as any).__game.paused);
    if (name === "wikipedia") {
      const png = PNG.sync.read(
        Buffer.from(snapshot.atlas.split(",")[1], "base64"),
      );
      let ink = 0;
      for (let y = 4000; y < 8500; y += 4)
        for (let x = 260; x < 1040; x += 4) {
          const i = (y * png.width + x) * 4;
          if (
            png.data[i] < 150 ||
            png.data[i + 1] < 150 ||
            png.data[i + 2] < 150
          )
            ink++;
        }
      assert.ok(ink > 2000, `Lower-page content missing: ${ink}`);
      await page.evaluate(() => {
        const g = (window as any).__game;
        g.x = 630;
        g.y = 4900;
        g.vx = 0;
        g.vy = 0;
        g.paused = true;
        g.resetCamera();
        g.cam.yaw = -0.25;
        g.cam.userZoom = 0.75;
      });
      await page.waitForTimeout(700);
    }
    await page.screenshot({ path: `artifacts/3d-real-${name}.png` });
    if (name === "example") {
      const result = await page.evaluate(() => {
        const g = (window as any).__game;
        g.muted = true;
        let n = 0;
        while (!g.done && n++ < 1000) {
          const p = g.items.find(
            (p: any) => !p.gone && p.threshold <= g.capacity,
          );
          if (!p) break;
          g.x = p.x + p.width / 2;
          g.y = p.y + p.height / 2;
          g.update(0.016);
        }
        return { done: g.done, count: g.count };
      });
      assert.ok(result.done);
      console.log("Actual Example.com reaches the finish:", result);
    }
    console.log(name, "3D texture rendering PASS", snapshot.pieces.length);
    if (name === "example")
      await page.getByRole("button", { name: /EAT ANOTHER SITE/ }).click();
    else await page.getByRole("button", { name: "↙ WEBIVORE" }).click();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}


