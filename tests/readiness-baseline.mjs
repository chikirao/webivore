import { chromium } from "playwright";
import { safeFetch } from "../server/security.ts";

import { writeFile } from "node:fs/promises";
const urls = [
  "https://www.youtube.com/watch?v=jNQXAC9IVRw",
  "https://en.wikipedia.org/wiki/Internet",
  "https://example.com",
  "https://react.dev",
  "https://www.pexels.com/search/nature/",
];
for (const [i, url] of urls.entries()) {
  const start = Date.now(),
    controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 55000);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    serviceWorkers: "block",
    acceptDownloads: false,
  });
  controller.signal.addEventListener(
    "abort",
    () => void context.close().catch(() => {}),
  );
  const budget = { bytes: 0 };
  let requests = 0;
  const failures = [];
  await context.routeWebSocket("**/*", (ws) => ws.close());
  await context.route("**/*", async (route) => {
    try {
      if (
        ++requests > 180 ||
        ![
          "document",
          "stylesheet",
          "image",
          "font",
          "script",
          "xhr",
          "fetch",
        ].includes(route.request().resourceType())
      )
        throw Error("blocked " + route.request().resourceType());
      await route.fulfill(
        await safeFetch(route.request().url(), budget, controller.signal),
      );
    } catch (e) {
      failures.push({
        url: route.request().url().slice(0, 160),
        reason: e.message,
      });
      await route.abort().catch(() => {});
    }
  });
  let result;
  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 22000 });
    await page.waitForTimeout(1400);
    await preparePage(page);
    await page.screenshot({
      path: `artifacts/readiness/before-${i}.png`,
      timeout: 7000,
    });
    result = {
      url,
      ms: Date.now() - start,
      requests,
      bytes: budget.bytes,
      title: await page.title(),
      state: await page.evaluate(() => ({
        text: document.body.innerText.slice(0, 400),
        images: document.images.length,
        loaded: [...document.images].filter((i) => i.naturalWidth).length,
        video: document.querySelectorAll("video").length,
      })),
      failures,
    };
  } catch (e) {
    result = {
      url,
      ms: Date.now() - start,
      error: e.message,
      requests,
      bytes: budget.bytes,
      failures,
    };
  }
  clearTimeout(timer);
  await browser.close();
  console.log(JSON.stringify(result));
  await writeFile(
    `artifacts/readiness/before-${i}.json`,
    JSON.stringify(result, null, 2),
  );
}

async function preparePage(page) {
  await page.addStyleTag({
    content:
      "*{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important;content-visibility:visible!important}",
  });
  await page.evaluate(() => {
    for (const el of [...document.querySelectorAll("*")].slice(0, 14000)) {
      if (["sticky", "fixed"].includes(getComputedStyle(el).position))
        el.style.setProperty("position", "static", "important");
    }
  });
  const height = await page.evaluate(() =>
    Math.min(9000, document.documentElement.scrollHeight),
  );
  for (let y = 0; y < height; y += 900) {
    await page.evaluate((y) => scrollTo(0, y), y);
    await page.waitForTimeout(65);
  }
  await page.evaluate(async () => {
    scrollTo(0, 0);
    await Promise.race([
      document.fonts.ready,
      new Promise((r) => setTimeout(r, 1000)),
    ]);
    await Promise.race([
      Promise.all([...document.images].map((i) => i.decode().catch(() => {}))),
      new Promise((r) => setTimeout(r, 1200)),
    ]);
  });
}
