import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
/** Finish the demo, export the GIF through the real UI, decode it and check the composition. */
const base = process.env.WEBIVORE_URL ?? "http://localhost:5174";
const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1536, height: 1024 }, acceptDownloads: true });
await page.goto(base);
await page.click(".demo");
await page.waitForFunction(() => window.__game?.ready, null, { timeout: 60000 });
await page.waitForTimeout(3800);
await page.evaluate(() => {
  const g = window.__game;
  g.muted = true;
  let limit = g.items.length + 1;
  while (g.count < g.items.length && limit--) {
    const p = g.items.filter((p) => !p.gone && p.threshold <= g.capacity).sort((a, b) => a.threshold - b.threshold)[0];
    if (!p) break;
    g.pickup(p, g.pickupIndex.group(p, g.radius, g.capacity));
  }
  g.time = 102;
  g.done = g.count === g.items.length;
});
await page.waitForSelector(".export-key", { timeout: 30000 });
await page.waitForTimeout(1500);
const [download] = await Promise.all([page.waitForEvent("download", { timeout: 180000 }), page.click(".export-key")]);
mkdirSync("artifacts", { recursive: true });
const path = "artifacts/overdrive-trophy.gif";
await download.saveAs(path);
await page.screenshot({ path: "artifacts/shots/finish-after-export.png" });
await browser.close();
const report = execFileSync("python", ["-c", `
from PIL import Image, ImageSequence
im = Image.open(${JSON.stringify(path)})
frames = [f.convert("RGB").copy() for f in ImageSequence.Iterator(im)]
first, mid = frames[0], frames[len(frames)//2]
diff = sum(1 for a, b in zip(first.getdata(), mid.getdata()) if a != b)
# rabbit zone (left-middle) must hold near-white plastic and black outline; ball zone must hold colour
def stats(img, box):
    px = list(img.crop(box).getdata())
    white = sum(1 for r,g,b in px if r>235 and g>235 and b>235)
    black = sum(1 for r,g,b in px if r<40 and g<40 and b<40)
    colour = sum(1 for r,g,b in px if max(r,g,b)-min(r,g,b) > 40)
    return white/len(px), black/len(px), colour/len(px)
print({"size": im.size, "frames": len(frames), "loop": im.info.get("loop"), "duration": im.info.get("duration"), "changed_pixels": diff, "rabbit_zone": stats(first,(40,130,200,380)), "ball_zone": stats(first,(200,180,440,420))})
`], { encoding: "utf8" });
console.log(report.trim());
