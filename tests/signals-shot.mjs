import { chromium } from "playwright";
// Pickup feedback placement check: bites near the rabbit must appear near the bite, inside the play area.
const base = process.env.WEBIVORE_URL ?? "http://localhost:5174";
const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1536, height: 1024 } });
await page.goto(base);
await page.click(".demo");
await page.waitForFunction(() => window.__game?.ready, null, { timeout: 60000 });
await page.waitForTimeout(3800);
const placed = await page.evaluate(async () => {
  const g = window.__game;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  g.muted = true;
  // Grow a little so grouped bites (BIG BITE) exist, then take three bites 250 ms apart.
  let n = 40;
  while (n--) {
    const p = g.items.filter((p) => !p.gone && p.threshold <= g.capacity).sort((a, b) => a.threshold - b.threshold)[0];
    if (!p) break;
    g.pickup(p, g.pickupIndex.group(p, g.radius, g.capacity));
  }
  await wait(1400);
  const out = [];
  for (let i = 0; i < 3; i++) {
    const p = g.items.filter((p) => !p.gone && p.threshold <= g.capacity).sort((a, b) => a.threshold - b.threshold)[0];
    g.pickup(p, g.pickupIndex.group(p, g.radius, g.capacity));
    out.push(g.project(p.x + p.width / 2, 6, p.y + p.height / 2));
    await wait(250);
  }
  await wait(150);
  const signals = [...document.querySelectorAll(".signal")].map((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.bottom, big: el.classList.contains("big"), text: el.textContent };
  });
  return { bites: out, signals, w: innerWidth, h: innerHeight };
});
await page.screenshot({ path: "artifacts/shots/signals-desktop.png" });
console.log(JSON.stringify(placed, null, 1));
await browser.close();
