import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { capturePage, preparePage } from "../server/capture.ts";
import { extract } from "../server/extract.ts";
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
  await fs.mkdir("artifacts", { recursive: true });
  await page.goto("http://localhost:5174");
  await page.getByRole("button", { name: /try demo/ }).click();
  await page.waitForFunction(() => !!(window as any).__game?.ready);
  await page.waitForTimeout(3500);
  const start = await page.evaluate(() => {
    const g = (window as any).__game;
    return {
      count: g.count,
      radius: g.radius,
      pile: g.pile.children.length,
      character: g.rabbit.root.children.length,
    };
  });
  assert.equal(start.count, 0);
  assert.equal(start.radius, 0);
  assert.equal(start.pile, 0);
  assert.equal(start.character, 4);
  await page.screenshot({ path: "artifacts/3d-empty-hands.png" });
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(550);
  await page.keyboard.up("KeyD");
  await page.waitForFunction(() =>
    (window as any).__game.attached.some((p: any) => p.curled),
  );
  const first = await page.evaluate(() => {
    const g = (window as any).__game;
    return {
      count: g.count,
      radius: g.radius,
      curled: g.attached.filter((p: any) => p.curled).length,
    };
  });
  assert.ok(first.count > 0, JSON.stringify(first));
  assert.ok(first.curled > 0);
  await page.screenshot({ path: "artifacts/3d-first-pieces.png" });
  const before = await page.evaluate(() => (window as any).__game.cam.yaw);
  await page.mouse.move(700, 450);
  await page.mouse.down();
  await page.mouse.move(850, 530);
  await page.mouse.up();
  const after = await page.evaluate(() => (window as any).__game.cam.yaw);
  assert.notEqual(before, after);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(910, 550);
  await page.mouse.up({ button: "right" });
  await page.getByText(/FREE CAMERA/).waitFor();
  await page.keyboard.press("Space");
  await page.getByText(/ORBIT CAMERA/).waitFor();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const stopped = await page.evaluate(() => (window as any).__game.time);
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => (window as any).__game.time), stopped);
  await page.getByRole("button", { name: /KEEP WALKING/ }).click();
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.paused = true;
    g.muted = true;
    for (let i = 0; i < 35; i++) {
      const p = g.items
        .filter((p: any) => !p.gone && p.threshold <= g.capacity)
        .sort((a: any, b: any) => a.mass - b.mass)[0];
      if (!p) break;
      g.pickup(p);
    }
    g.time += 1;
    g.x = 640;
    g.y = 950;
    g.vx = 0;
    g.vy = 0;
    g.resetCamera();
    g.cam.yaw = -0.45;
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: "artifacts/3d-grown-collection.png" });
  const finish = await page.evaluate(() => {
    const g = (window as any).__game;
    let steps = 0;
    while (!g.done && steps++ < 1000) {
      const p = g.items.find((p: any) => !p.gone && p.threshold <= g.capacity);
      if (!p) break;
      g.x = p.x + p.width / 2;
      g.y = p.y + p.height / 2;
      g.update(0.016);
    }
    return { done: g.done, count: g.count };
  });
  assert.ok(finish.done);
  await page.getByRole("button", { name: /EAT ANOTHER SITE/ }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /try demo/ }).click();
  await page.waitForFunction(() => !!(window as any).__game?.ready);
  await page.waitForTimeout(3500);
  await page.screenshot({ path: "artifacts/3d-mobile.png" });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  const fixture = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  await fixture.setContent(
    `<body style="margin:0"><div style="height:9000px;background:white"><div style="position:absolute;top:2400px;width:200px;height:120px;background:rgb(230,20,40)">BELOW THE VIEWPORT</div><div style="position:absolute;top:8100px;width:200px;height:120px;background:rgb(30,80,220)">BOTTOM TILE</div></div></body>`,
  );
  await preparePage(fixture);
  const data = await extract(fixture);
  const snapshot = PNG.sync.read(await capturePage(fixture, 1280, 9000));
  const pixel = (x: number, y: number) =>
    Array.from(
      snapshot.data.subarray((y * 1280 + x) * 4, (y * 1280 + x) * 4 + 3),
    );
  assert.deepEqual(pixel(100, 2450), [230, 20, 40]);
  assert.deepEqual(pixel(100, 8150), [30, 80, 220]);
  assert.ok(data.pieces.some((p) => p.y > 8000));
  assert.deepEqual(errors, []);
  console.log(
    "PASS: empty hands, keyboard pickup, curled geometry, orbit/tilt/pan/follow, pause, growth, finish, mobile, no runtime errors.",
  );
  console.log(
    "PASS: screenshot pixels at y=2450 and y=8150 preserve actual DOM colors.",
  );
} finally {
  await browser.close();
}

