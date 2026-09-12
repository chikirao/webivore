import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
const baseline = JSON.parse(
  readFileSync("src/rabbit-user-settings.json", "utf8"),
);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
mkdirSync("artifacts/astra-qa", { recursive: true });
try {
  await page.goto("http://localhost:5174/rabbit-editor");
  await page.waitForSelector(".rig-canvas canvas");
  await page.waitForTimeout(2000);
  await page.screenshot({
    path: "artifacts/astra-qa/rabbit-editor-desktop.png",
  });
  const a = await page.locator(".rig-canvas canvas").screenshot();
  await page.waitForTimeout(500);
  const b = await page.locator(".rig-canvas canvas").screenshot();
  assert(!a.equals(b), "Animation did not advance without keyboard input");
  for (const [r, label] of [
    "Низко · 10°",
    "Середина · 40°",
    "Сверху · 75°",
  ].entries())
    for (let c = 0; c < 8; c++) {
      await page
        .getByRole("button", { name: `${label}, ${c * 45}°`, exact: true })
        .click();
      await page
        .getByText(
          `В кадре: ${c * 45}° / ${["низко", "середина", "сверху"][r]}`,
          { exact: true },
        )
        .waitFor({ timeout: 10000 });
      if (c === 3)
        await page.screenshot({
          path: `artifacts/astra-qa/rabbit-editor-135-${r}.png`,
        });
    }
  await page
    .getByRole("button", { name: "Середина · 40°, 180°", exact: true })
    .click();
  await page
    .getByRole("spinbutton", {
      name: "X · вправо, точное значение",
      exact: true,
    })
    .fill("36");
  await page.waitForTimeout(400);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Экспорт JSON ↓", exact: true }).click(),
  ]);
  await download.saveAs("artifacts/astra-qa/rabbit-editor-test.json");
  const config = JSON.parse(
    readFileSync("artifacts/astra-qa/rabbit-editor-test.json", "utf8"),
  );
  assert.equal(config.views.length, 24);
  assert.equal(config.views[12].head.x, 36);
  await page.reload();
  await page.waitForTimeout(1800);
  assert.equal(
    await page
      .getByRole("spinbutton", {
        name: "X · вправо, точное значение",
        exact: true,
      })
      .inputValue(),
    "36",
  );
  await page
    .getByRole("button", { name: "Сбросить этот ракурс", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("spinbutton", {
        name: "X · вправо, точное значение",
        exact: true,
      })
      .inputValue(),
    String(baseline.views[12].head.x),
  );
  await page.getByRole("button", { name: "Отменить", exact: true }).click();
  assert.equal(
    await page
      .getByRole("spinbutton", {
        name: "X · вправо, точное значение",
        exact: true,
      })
      .inputValue(),
    "36",
  );
  config.views[12].head.x = 24;
  await page.locator("input[type=file]").setInputFiles({
    name: "settings.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(config)),
  });
  await page
    .getByText("Все 24 ракурса импортированы.", { exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("spinbutton", {
        name: "X · вправо, точное значение",
        exact: true,
      })
      .inputValue(),
    "24",
  );
  await page
    .getByRole("button", { name: "Применить в игре", exact: true })
    .click();
  await page.getByRole("link", { name: "Вернуться в игру ↗" }).click();
  await page.locator(".demo").click();
  await page.waitForFunction(() => window.__game?.ready);
  assert.equal(
    await page.evaluate(() => window.__game.rabbit.settings.views[12].head.x),
    24,
  );
  await page.goto("http://localhost:5174/rabbit-editor");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "artifacts/astra-qa/rabbit-editor-phone.png" });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    "artifacts/astra-qa/rabbit-editor-results.json",
    JSON.stringify(
      {
        views: 24,
        animation: "automatic",
        draft: "restored",
        export: "24 views",
        import: "passed",
        undo: "passed",
        gameSettings: "same config",
        overflow: "none",
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: 24 camera views, automatic animation, tuning, undo, export/import, draft restore and game application.",
  );
} finally {
  await browser.close();
}
