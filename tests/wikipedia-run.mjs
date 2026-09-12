import { chromium } from "playwright";
import { captureBall } from "./ball-capture.mjs";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
// Acceptance run: public preset and real keyboard movement. State reads guide a
// nearest-eligible route; this does not teleport, call pickup, or force completion.
const base = process.env.WEBIVORE_URL ?? "http://localhost:5174";
mkdirSync("artifacts/astra-qa", { recursive: true });
const browser = await chromium.launch({
  args: [
    "--enable-unsafe-swiftshader",
    "--use-gl=angle",
    "--use-angle=swiftshader",
  ],
});
const page = await browser.newPage({
  viewport: { width: 1536, height: 1024 },
  acceptDownloads: true,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const held = new Set();
async function keys(next) {
  for (const k of held)
    if (!next.includes(k)) {
      await page.keyboard.up(k);
      held.delete(k);
    }
  for (const k of next)
    if (!held.has(k)) {
      await page.keyboard.down(k);
      held.add(k);
    }
}
try {
  await page.goto(base);
  await page.getByRole("button", { name: "Wikipedia" }).click();
  await page.waitForFunction(() => window.__game?.ready, null, {
    timeout: 120000,
  });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: "artifacts/astra-qa/wiki-start.png" });
  const begin = Date.now();
  let bucket = -1;
  let early = null;
  const seen = new Set(),
    graphics = [];
  let captured = false;
  while (Date.now() - begin < 1200000) {
    const s = await page.evaluate(() => {
      const g = window.__game;
      const eligible = g.items
        .filter((p) => !p.gone && p.threshold <= g.capacity)
        .map((p) => {
          const x = Math.max(
              18,
              Math.min(g.level.width - 18, p.x + p.width / 2),
            ),
            y = Math.max(18, Math.min(g.level.height - 18, p.y + p.height / 2));
          return { x, y, d: Math.hypot(x - g.x, y - g.y) };
        })
        .sort((a, b) => a.d - b.d);
      return {
        done: g.done,
        count: g.count,
        total: g.items.length,
        pct: (g.mass / g.total) * 100,
        x: g.x,
        y: g.y,
        vx: g.vx,
        vy: g.vy,
        yaw: g.cam.yaw,
        target: eligible[0],
        radius: g.radius,
        graphics: g.items
          .filter(
            (p) =>
              p.gone &&
              (p.type === "IMAGE" ||
                /^(IMG|SVG|CANVAS|VIDEO)$/.test(p.tagName)),
          )
          .map((p) => ({
            id: p.id,
            text: p.text.slice(0, 50),
            size: [p.width, p.height],
            at: p.pickedAt,
          })),
        frozen:
          g.collection.layers.length > 1 &&
          g.collection.fragments.slice(0, 48).every((f) => f.baked)
            ? Array.from(
                g.collection.layers[0].mesh.geometry.attributes.position.array,
              )
            : null,
      };
    });
    if (!early && s.frozen) early = s.frozen;
    for (const p of s.graphics)
      if (!seen.has(p.id)) {
        seen.add(p.id);
        graphics.push({ ...p, percent: s.pct });
      }
    if (Math.floor(s.pct / 10) > bucket) {
      bucket = Math.floor(s.pct / 10);
      console.log(
        JSON.stringify({
          count: s.count,
          total: s.total,
          percent: +s.pct.toFixed(2),
          seconds: Math.round((Date.now() - begin) / 1000),
        }),
      );
    }
    if (s.done) break;
    assert(s.target, "No eligible item remains before completion");
    if (!captured && s.pct >= 65) {
      await keys([]);
      await page.waitForTimeout(1800);
      await page.screenshot({ path: "artifacts/astra-qa/wiki-game.png" });
      for (const [name, dy] of [
        ["high", 140],
        ["low", -250],
        ["side", 110],
      ]) {
        await page.mouse.move(880, 500);
        await page.mouse.down();
        await page.mouse.move(880, 500 + dy, { steps: 12 });
        await page.mouse.up();
        await page.waitForTimeout(600);
        await page.screenshot({
          path: "artifacts/astra-qa/wiki-camera-" + name + ".png",
        });
      }
      await page
        .getByRole("button", { name: "Reset camera", exact: true })
        .click();
      captured = true;
    }
    // Brake against momentum near a target, avoiding oscillation at small pieces.
    const dx = s.target.x - s.x - s.vx * 0.18,
      dy = s.target.y - s.y - s.vy * 0.18;
    const side = dx * Math.cos(s.yaw) - dy * Math.sin(s.yaw),
      forward = -dx * Math.sin(s.yaw) - dy * Math.cos(s.yaw),
      m = Math.max(Math.abs(side), Math.abs(forward));
    const next = [];
    if (Math.abs(side) > Math.max(2, m * 0.3)) next.push(side > 0 ? "d" : "a");
    if (Math.abs(forward) > Math.max(2, m * 0.3))
      next.push(forward > 0 ? "w" : "s");
    await keys(next);
    await page.waitForTimeout(180);
  }
  await keys([]);
  const result = await page.evaluate(() => {
    const g = window.__game;
    return {
      done: g.done,
      count: g.count,
      total: g.items.length,
      percent: (g.mass / g.total) * 100,
      mass: g.mass,
      expectedMass: g.items.reduce((s, p) => s + p.mass, 0),
      unique: new Set(g.attached.map((p) => p.id)).size,
      radius: g.radius,
      layers: g.collection.layers.length,
      renderMeshes: g.collection.renderMeshes.length,
      priorityGraphics: g.collection.priorities.filter((p) => p.score >= 1e6)
        .length,
      inner: Array.from(
        g.collection.layers[0].mesh.geometry.attributes.position.array,
      ),
    };
  });
  assert(result.done, "Keyboard run timed out");
  assert.equal(result.count, result.total);
  assert.equal(result.unique, result.total);
  assert(Math.abs(result.mass - result.expectedMass) < 0.001);
  assert(early, "No historical layer captured");
  assert(
    result.inner.every((v, i) => v === early[i]),
    "Frozen first layer changed",
  );
  delete result.inner;
  await page.waitForSelector(".export-key");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "artifacts/astra-qa/wiki-finish.png" });
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 300000 }),
    page.locator(".export-key").click(),
  ]);
  await download.saveAs("artifacts/astra-qa/wikipedia.gif");
  const gif = execFileSync(
    "python",
    [
      "-c",
      `from PIL import Image, ImageSequence, ImageChops
im=Image.open('artifacts/astra-qa/wikipedia.gif')
frames=[f.convert('RGB').copy() for f in ImageSequence.Iterator(im)]
assert im.size==(512,512) and len(frames)==48 and im.info.get('loop')==0
assert ImageChops.difference(frames[0],frames[24]).getbbox()
s=Image.new('RGB',(2048,512),'#888888')
for i,k in enumerate([0,12,24,36]):s.paste(frames[k],(512*i,0))
s.save('artifacts/astra-qa/wiki-gif-frames.png')
print('512 x 512; 48 frames; loop=0; animated')`,
    ],
    { encoding: "utf8" },
  ).trim();
  await captureBall(page, "artifacts/astra-qa/ball-views-wiki.png");
  assert.deepEqual(errors, []);
  writeFileSync(
    "artifacts/astra-qa/wikipedia-results.json",
    JSON.stringify(
      {
        ...result,
        graphics,
        errors,
        gif,
        method: "real keyboard input; no direct pickup or completion mutation",
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      ...result,
      gif,
      lateGraphics: graphics.filter((p) => p.percent > 80).length,
    }),
  );
  await page.getByRole("button", { name: "Play again" }).click();
  await page.waitForSelector(".demo");
  console.log("replay passed");
} finally {
  await browser.close();
}
