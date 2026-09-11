import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
// The in-app rabbit lab measures 8 azimuths × 3 elevations × 4 ball sizes with a
// real perspective camera, the page floor and the ball. See src/RabbitLab.tsx.
const base = process.env.WEBIVORE_URL ?? "http://localhost:5174";
const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader"] });
try {
  const page = await browser.newPage({ viewport: { width: 1900, height: 1200 } });
  await page.goto(`${base}/?lab=rabbit`);
  await page.waitForFunction(() => !!window.__rabbitLab, null, { timeout: 120000 });
  const results = await page.evaluate(() => window.__rabbitLab);
  mkdirSync("artifacts", { recursive: true });
  for (const r of results) {
    writeFileSync(`artifacts/rabbit-lab-r${r.radius}.png`, Buffer.from(r.sheet.split(",")[1], "base64"));
    delete r.sheet;
  }
  writeFileSync("artifacts/rabbit-lab-results.json", JSON.stringify(results, null, 2));
  const failed = results.flatMap((r) => r.cells.filter((c) => !c.pass).map((c) => ({ radius: r.radius, ...c })));
  console.log(`${results.reduce((n, r) => n + r.cells.length, 0)} cells measured, ${failed.length} failed`);
  for (const f of failed) console.log("  FAIL", JSON.stringify(f));
  assert.equal(failed.length, 0);
  console.log("PASS: rabbit silhouette connected, feet above floor, head readable in every view.");
} finally {
  await browser.close();
}
