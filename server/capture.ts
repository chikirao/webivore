import type { Page } from "playwright";
import { PNG } from "pngjs";

// An oversized screenshot clip can contain unpainted pixels below the viewport.
// Each tile here comes from an actual scrolled and painted viewport.
export async function capturePage(page: Page, width: number, height: number) {
  const output = new PNG({ width, height });
  const viewport = page.viewportSize()!;
  for (let top = 0; top < height; top += viewport.height) {
    const actual = await page.evaluate(async (y) => {
      window.scrollTo(0, y);
      await new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r())),
      );
      return window.scrollY;
    }, top);
    const tile = PNG.sync.read(
      await page.screenshot({ fullPage: false, timeout: 7000 }),
    );
    const copyHeight = Math.min(tile.height, height - actual);
    if (copyHeight > 0)
      PNG.bitblt(
        tile,
        output,
        0,
        0,
        Math.min(width, tile.width),
        copyHeight,
        0,
        actual,
      );
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  return PNG.sync.write(output);
}

export async function preparePage(page: Page) {
  await page.addStyleTag({
    content:
      "*{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important;content-visibility:visible!important}",
  });
  await page.evaluate(() => {
    for (const el of Array.from(
      document.querySelectorAll<HTMLElement>("*"),
    ).slice(0, 14000)) {
      const position = getComputedStyle(el).position;
      if (position === "sticky" || position === "fixed")
        el.style.setProperty("position", "static", "important");
    }
  });
  const height = await page.evaluate(() =>
    Math.min(9000, document.documentElement.scrollHeight),
  );
  for (let top = 0; top < height; top += 900) {
    await page.evaluate((y) => window.scrollTo(0, y), top);
    await page.waitForTimeout(65);
  }
  await page.evaluate(async () => {
    window.scrollTo(0, 0);
    await Promise.race([
      document.fonts.ready,
      new Promise((r) => setTimeout(r, 1000)),
    ]);
    await Promise.race([
      Promise.all(
        Array.from(document.images).map((im) => im.decode().catch(() => {})),
      ),
      new Promise((r) => setTimeout(r, 1200)),
    ]);
  });
}
