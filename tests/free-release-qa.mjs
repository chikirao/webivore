import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(projectRoot, "artifacts", "free-release");
const baseUrl = process.argv[2] ?? process.env.WEBIVORE_URL ?? "http://localhost:5174/";
const htmlFixture = path.join(projectRoot, "tests", "fixtures", "local-import.html");
const imageFixture = path.join(projectRoot, "docs", "concepts", "04-overdrive-entry.png");

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
const errors = [];

const assertFits = async (page, label) => {
  const fit = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth <= innerWidth,
    dialog: !document.querySelector("[role=dialog]") ||
      document.querySelector("[role=dialog]").scrollWidth <= document.querySelector("[role=dialog]").clientWidth,
  }));
  assert.equal(fit.page, true, `${label}: page has horizontal overflow`);
  assert.equal(fit.dialog, true, `${label}: import dialog has horizontal overflow`);
};

try {
  for (const [name, width, height, hasTouch, isMobile] of [
    ["desktop", 1536, 1024, false, false],
    ["laptop", 1024, 768, false, false],
    ["tablet", 768, 1024, true, false],
    ["phone", 390, 844, true, true],
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch, isMobile });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(`${name}: ${error.message}`));
    await page.goto(baseUrl);
    await page.locator(".entry").waitFor();
    await assertFits(page, `${name} entry`);
    await page.screenshot({ path: path.join(output, `${name}-entry.png`) });

    const importButton = page.getByRole("button", { name: "IMPORT FILE" });
    await importButton.click();
    const dialog = page.getByRole("dialog", { name: "Import file" });
    await dialog.waitFor();
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Close import");
    await assertFits(page, `${name} import`);
    const bounds = await dialog.boundingBox();
    assert(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height <= height);
    await page.screenshot({ path: path.join(output, `${name}-import.png`) });

    await page.keyboard.press("Shift+Tab");
    assert.match(await page.locator(":focus").getAttribute("aria-label") ?? await page.locator(":focus").innerText(), /Page image/i);
    await page.keyboard.press("Tab");
    assert.match(await page.locator(":focus").getAttribute("aria-label") ?? "", /Close import/i);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    assert.equal(await page.locator(":focus").getAttribute("id"), "open-import");

    if (name === "desktop") {
      const apiRequests = [];
      page.on("request", (request) => {
        if (/\/api\//.test(new URL(request.url()).pathname)) apiRequests.push(request.url());
      });
      await importButton.click();
      await page.locator('input[type="file"]').setInputFiles(htmlFixture);
      await page.waitForFunction(() => window.__game?.ready);
      assert.equal(apiRequests.length, 0, "Local HTML import must not call the snapshot API");
      await page.screenshot({ path: path.join(output, "desktop-html-game.png") });
      await page.getByRole("button", { name: "Pause", exact: true }).click();
      await page.getByRole("button", { name: "EXPORT LEVEL" }).waitFor();
      await page.getByRole("button", { name: "CHOOSE ANOTHER WEBSITE" }).click();
      await page.getByRole("button", { name: "IMPORT FILE" }).click();
      await page.locator('input[type="file"]').setInputFiles(imageFixture);
      await page.waitForFunction(() => window.__game?.ready);
      assert.equal(apiRequests.length, 0, "Local image import must not call the snapshot API");
      await page.screenshot({ path: path.join(output, "desktop-image-game.png") });
      await page.locator('button[title="Back to websites"]').click();
    }

    await page.getByRole("button", { name: "DEMO" }).click();
    await page.waitForFunction(() => window.__game?.ready);
    await page.waitForTimeout(350);
    await assertFits(page, `${name} game`);
    await page.screenshot({ path: path.join(output, `${name}-game.png`) });
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ baseUrl, viewports: 4, errors }, null, 2));
} finally {
  await browser.close();
}
