import { partitionPage } from "./partition.ts";
import { capturePage, preparePage } from "./capture.ts";
import { extract } from "./extract.ts";
import express from "express";
import { chromium } from "playwright";
import { safeFetch, validateURL } from "./security.ts";
import { balancePieces } from "../src/shared.ts";
const app = express();
app.use(express.json({ limit: "4kb" }));
let busy = false;
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.post("/api/snapshot", async (req, res) => {
  if (busy) {
    res
      .status(429)
      .json({ error: "Another page is loading. Try again shortly." });
    return;
  }
  try {
    validateURL(String(req.body.url ?? ""));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message.split("\n")[0] });
    return;
  }
  busy = true;
  let browser;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55000);
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 1,
      serviceWorkers: "block",
      acceptDownloads: false,
    });
    const budget = { bytes: 0 };
    let requests = 0;
    await context.routeWebSocket("**/*", (ws) => ws.close());
    await context.route("**/*", async (route) => {
      try {
        if (
          ++requests > 180 ||
          controller.signal.aborted ||
          ![
            "document",
            "stylesheet",
            "image",
            "font",
            "script",
            "xhr",
            "fetch",
          ].includes(route.request().resourceType())
        ) {
          await route.abort();
          return;
        }
        const response = await safeFetch(
          route.request().url(),
          budget,
          controller.signal,
        );
        await route.fulfill(response);
      } catch {
        await route.abort().catch(() => {});
      }
    });
    const page = await context.newPage();
    const abort = () => void context.close().catch(() => {});
    controller.signal.addEventListener("abort", abort, { once: true });
    const response = await page.goto(req.body.url, {
      waitUntil: "domcontentloaded",
      timeout: 22000,
    });
    if (!response || response.status() >= 400)
      throw new Error(
        `Website returned ${response?.status() ?? "no response"}. Try another URL.`,
      );
    await page.waitForTimeout(1400);
    await preparePage(page);
    const data = await extract(page);
    const atlas = await capturePage(page, data.width, data.height);
    const partition = partitionPage(
      data.pieces,
      atlas,
      data.width,
      data.height,
    );
    if (!partition.pieces.length)
      throw new Error("This page has no visible content to collect.");
    const finalUrl = page.url();
    await browser.close();
    browser = undefined;
    busy = false;
    res.json({
      ...data,
      url: finalUrl,
      pieces: balancePieces(partition.pieces),
      coverage: "exclusive",
      pageColor: partition.pageColor,
      atlas: `data:image/png;base64,${atlas.toString("base64")}`,
      background: "",
    });
  } catch (e) {
    await browser?.close().catch(() => {});
    browser = undefined;
    busy = false;
    res.status(422).json({
      error: controller.signal.aborted
        ? "Loading timed out. Try a smaller page."
        : (e as Error).message.split("\n")[0],
    });
  } finally {
    clearTimeout(timer);
    await browser?.close();
    busy = false;
  }
});
app.listen(3001, "127.0.0.1", () =>
  console.log("Snapshot API: http://127.0.0.1:3001"),
);
