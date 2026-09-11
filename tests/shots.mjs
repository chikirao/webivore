import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
/**
 * State screenshots for design QA: entry / game start / game 68% at three camera
 * pitches / finish, at the viewports the redesign must support.
 *   node tests/shots.mjs [state...]   states: entry game grown finish mobile all
 */
const base = process.env.WEBIVORE_URL ?? "http://localhost:5174";
const wanted = new Set(process.argv.slice(2).length ? process.argv.slice(2) : ["all"]);
const want = (s) => wanted.has("all") || wanted.has(s);
const viewports = [
  ["desktop", 1536, 1024],
  ["laptop", 1024, 768],
  ["tablet", 768, 1024],
  ["phone", 390, 844],
];
mkdirSync("artifacts/shots", { recursive: true });
const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader"] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function collect(page, target) {
  return page.evaluate(async (target) => {
    const game = window.__game;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    while (!game.ready) await wait(100);
    game.muted = true;
    let limit = game.items.length + 1;
    while (game.mass / game.total < target && limit--) {
      const p = game.items.filter((p) => !p.gone && p.threshold <= game.capacity).sort((a, b) => a.threshold - b.threshold)[0];
      if (!p) break;
      game.pickup(p, game.pickupIndex.group(p, game.radius, game.capacity));
    }
    game.time = 102;
    game.vx = game.vy = 0;
    return { count: game.count, total: game.items.length, percent: (100 * game.mass) / game.total, radius: game.radius };
  }, target);
}
try {
  for (const [name, width, height] of viewports) {
    if (name === "phone" && !want("mobile") && !want("all")) continue;
    const page = await browser.newPage({ viewport: { width, height } });
    page.on("pageerror", (e) => console.log("PAGE ERROR", name, e.message));
    await page.goto(base);
    await page.waitForSelector(".demo", { timeout: 60000 });
    if (want("entry")) await page.screenshot({ path: `artifacts/shots/entry-${name}.png` });
    if (!(want("game") || want("grown") || want("finish"))) { await page.close(); continue; }
    await page.click(".demo");
    await page.waitForFunction(() => window.__game?.ready, null, { timeout: 60000 });
    await wait(3800);
    if (want("game")) await page.screenshot({ path: `artifacts/shots/game-start-${name}.png` });
    if (want("grown") || want("finish")) {
      const stats = await collect(page, 0.68);
      console.log(name, "68%:", JSON.stringify(stats));
      for (const [label, pitch] of [["mid", 0.88], ["high", 1.4], ["low", 0.34]]) {
        await page.evaluate((pitch) => { const g = window.__game; g.cam.pitch = pitch; g.cam.yaw = 0.5; g.paused = false; }, pitch);
        await wait(1500);
        if (want("grown")) await page.screenshot({ path: `artifacts/shots/game-68-${label}-${name}.png` });
      }
    }
    if (want("finish")) {
      const stats = await collect(page, 1);
      await page.evaluate(() => { const g = window.__game; g.done = g.count === g.items.length; });
      console.log(name, "finish:", JSON.stringify(stats));
      await page.waitForSelector(".victory, .finish", { timeout: 30000 });
      await wait(2500);
      await page.screenshot({ path: `artifacts/shots/finish-${name}.png` });
    }
    await page.close();
  }
} finally {
  await browser.close();
}
console.log("done");
