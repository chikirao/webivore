import { chromium } from "playwright";
import { Deadline } from "./deadline.ts";
import { guardContext } from "./network.ts";
import { prepareDocument } from "./readiness.ts";
import { capturePage } from "./capture.ts";
import { extract } from "./extract.ts";
import { partitionPage } from "./partition.ts";
import { validateURL } from "./security.ts";
import { balancePieces } from "../src/shared.ts";

export async function snapshot(url: string) {
  validateURL(url);
  const deadline = new Deadline();
  const start = performance.now();
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const abort = () => {
    void browser?.close().catch(() => {});
  };
  deadline.signal.addEventListener("abort", abort, { once: true });
  try {
    browser = await chromium.launch({
      headless: true,
      timeout: Math.min(15_000, deadline.remaining()),
    });
    deadline.check();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 1,
      serviceWorkers: "block",
      acceptDownloads: false,
    });
    context.on("page", (p) => {
      p.on("download", (d) => void d.cancel());
      if (context.pages().length > 1) void p.close().catch(() => {});
    });
    const network = await guardContext(context, deadline);
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    let navigation = "complete";
    try {
      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 22_000,
      });
      if (!response || response.status() >= 400)
        throw new Error(
          `Website returned ${response?.status() ?? "no response"}. Try another URL.`,
        );
    } catch (error) {
      if (
        (error as Error).name !== "TimeoutError" ||
        page.url() === "about:blank"
      )
        throw error;
      navigation = "partial-navigation-timeout";
    }
    const readiness = await prepareDocument(page, deadline, network);
    deadline.check();
    // Stop page timers/client re-renders between DOM extraction and tiled capture.
    // DevTools evaluations remain available for extraction and explicit scrolling.
    const session = await context.newCDPSession(page);
    await session.send("Emulation.setScriptExecutionDisabled", { value: true });
    const pendingAtCapture = network.pending;
    network.stop();
    const data = await extract(page);
    const atlas = await capturePage(page, data.width, data.height, deadline);
    deadline.check();
    const partition = partitionPage(
      data.pieces,
      atlas,
      data.width,
      data.height,
    );
    deadline.check();
    if (!partition.pieces.length)
      throw new Error("This page has no visible content to collect.");
    const diagnostics = {
      navigation,
      readiness,
      network: {
        requests: network.requests,
        bytes: network.bytes,
        failures: { ...network.failures },
        pendingAtCapture,
      },
      ms: Math.round(performance.now() - start),
    };
    return {
      ...data,
      url: page.url(),
      pieces: balancePieces(partition.pieces),
      coverage: "exclusive",
      pageColor: partition.pageColor,
      atlas: `data:image/png;base64,${atlas.toString("base64")}`,
      background: "",
      diagnostics,
    };
  } catch (error) {
    if (deadline.signal.aborted)
      throw new Error("Loading timed out. Try a smaller page.");
    throw error;
  } finally {
    deadline.signal.removeEventListener("abort", abort);
    await browser?.close().catch(() => {});
    deadline.dispose();
  }
}
