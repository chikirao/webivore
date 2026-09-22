import { Deadline } from "./deadline.ts";
import { prepareDocument } from "./readiness.ts";
import type { Page } from "playwright";
import { PNG } from "pngjs";

// An oversized screenshot clip can contain unpainted pixels below the viewport.
// Each tile here comes from an actual scrolled and painted viewport.
export async function capturePage(
  page: Page,
  width: number,
  height: number,
  deadline?: Deadline,
) {
  const output = new PNG({ width, height });
  const viewport = page.viewportSize()!;
  for (let top = 0; top < height; top += viewport.height) {
    deadline?.check();
    const actual = await page.evaluate(async (y) => {
      window.scrollTo(0, y);

      return window.scrollY;
    }, top);
    const tile = PNG.sync.read(
      await page.screenshot({
        fullPage: false,
        timeout: Math.max(1, Math.min(7000, deadline?.remaining() ?? 7000)),
      }),
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
  const deadline = new Deadline();
  try {
    return await prepareDocument(page, deadline);
  } finally {
    deadline.dispose();
  }
}
