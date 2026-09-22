import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { Deadline } from "../server/deadline.ts";
import { prepareDocument } from "../server/readiness.ts";
import { guardContext } from "../server/network.ts";
import { capturePage } from "../server/capture.ts";
import { extract } from "../server/extract.ts";
import { PNG } from "pngjs";
const green =
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240"><rect width="400" height="240" fill="#00cc44"/></svg>';
for (const name of ["spa", "lazy", "network", "video", "assets"])
  test(`browser readiness: ${name}`, { timeout: 20_000 }, async () => {
    const browser = await chromium.launch();
    const deadline = new Deadline(15_000);
    try {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        serviceWorkers: "block",
        acceptDownloads: false,
      });
      deadline.signal.addEventListener(
        "abort",
        () => void context.close().catch(() => {}),
        { once: true },
      );
      const html = await readFile(
        new URL(`./fixtures/readiness/${name}.html`, import.meta.url),
        "utf8",
      );
      // Fixture transport only. Production guard, resource types and budgets still run.
      const network = await guardContext(
        context,
        deadline,
        async (url, _budget, signal) => {
          const path = new URL(url).pathname;
          if (name === "assets" && path !== "/")
            await new Promise((r) => setTimeout(r, 700));
          if (path === "/font.woff2")
            return {
              status: 200,
              headers: { "content-type": "font/woff2" },
              body: await readFile(
                new URL(
                  "../node_modules/@fontsource/tektur/files/tektur-latin-700-normal.woff2",
                  import.meta.url,
                ),
              ),
            };
          if (path === "/forever")
            await new Promise((_, reject) => {
              signal.addEventListener("abort", () => reject(signal.reason), {
                once: true,
              });
            });
          return {
            status: path === "/missing.svg" ? 404 : 200,
            headers: {
              "content-type": path.endsWith(".svg")
                ? "image/svg+xml"
                : "text/html",
            },
            body: Buffer.from(
              path === "/green.svg" ? green : path === "/" ? html : "",
            ),
          };
        },
      );
      const page = await context.newPage();
      await page.goto("https://fixture.example/", {
        waitUntil: "domcontentloaded",
      });
      // Use a full production deadline; short per-test watchdog above remains active.
      const readinessDeadline = new Deadline();
      let result;
      try {
        result = await prepareDocument(page, readinessDeadline, network);
      } finally {
        readinessDeadline.dispose();
      }
      if (name === "spa")
        assert.match(
          await page.locator("main").innerText(),
          /Rendered application/,
        );
      if (name === "lazy") {
        assert.equal(
          await page
            .locator("#lazy")
            .evaluate((i: HTMLImageElement) => i.naturalWidth),
          400,
        );
        assert.equal(
          await page
            .locator("header")
            .evaluate((e) => getComputedStyle(e).position),
          "static",
        );
        const data = await extract(page);
        const png = PNG.sync.read(
          await capturePage(page, data.width, data.height),
        );
        const piece = data.pieces.find((p) =>
          p.imageUrl?.endsWith("green.svg"),
        )!;
        assert.ok(piece);
        const index = (Math.floor(piece.y + 100) * png.width + 200) * 4;
        assert.deepEqual(
          [...png.data.subarray(index, index + 3)],
          [0, 204, 68],
        );
        await mkdir("artifacts/readiness", { recursive: true });
        await writeFile(
          "artifacts/readiness/fixture-lazy.png",
          PNG.sync.write(png),
        );
      }
      if (name === "network") {
        assert.equal(result.final.state, "ready");
        assert.ok(result.assets.missingImages);
        assert.ok(network.pending > 0);
      }
      if (name === "assets") {
        assert.equal(result.assets.missingBackgrounds, 0);
        assert.equal(result.assets.backgrounds, 1);
        assert.equal(result.assets.fonts, "loaded");
      }
      if (name === "video") {
        assert.equal(result.media.posters, 1);
        assert.equal(result.media.placeholders, 1);
        assert.equal(await page.locator("video").count(), 0);
        assert.ok(network.failures["media-blocked"]);
      }
    } finally {
      deadline.dispose();
      await browser.close();
    }
  });
test(
  "guard blocks private resources and redirects, media, and caps attempts including retries",
  { timeout: 15_000 },
  async () => {
    const browser = await chromium.launch();
    const d = new Deadline(12_000);
    try {
      const context = await browser.newContext({
        serviceWorkers: "block",
        acceptDownloads: false,
      });
      const real = await guardContext(context, d);
      const page = await context.newPage();
      await assert.rejects(page.goto("http://127.0.0.1/"));
      assert.ok(Object.keys(real.failures).some((k) => /Private/.test(k)));
      await context.close();
      const c = await browser.newContext({ serviceWorkers: "block" });
      let calls = 0;
      const state = await guardContext(c, d, async () => {
        calls++;
        return {
          status: 200,
          headers: { "content-type": "image/svg+xml" },
          body: Buffer.from(green),
        };
      });
      const p = await c.newPage();
      await p.setContent("<body>");
      await p.evaluate(() =>
        Promise.all(
          Array.from(
            { length: 200 },
            (_, i) =>
              new Promise((r) => {
                const image = new Image();
                image.onload = image.onerror = r;
                image.src = `https://fixture.example/${i}.svg`;
                document.body.append(image);
              }),
          ),
        ),
      );
      assert.equal(calls, 180);
      assert.equal(state.requests, 180);
      assert.ok(state.failures["budget-blocked"] >= 20);
    } finally {
      d.dispose();
      await browser.close();
    }
  },
);

test(
  "retry is bounded and preserves POST semantics; redirect destinations remain guarded",
  { timeout: 15_000 },
  async () => {
    const browser = await chromium.launch();
    const d = new Deadline();
    try {
      const context = await browser.newContext();
      let calls = 0;
      let seen: any;
      const state = await guardContext(
        context,
        d,
        async (url, budget, signal, request) => {
          calls++;
          seen = request;
          if (new URL(url).hostname === "127.0.0.1")
            return (await import("../server/security.ts")).safeFetch(
              url,
              budget,
              signal,
              request,
            );
          return {
            status: calls === 1 ? 503 : 200,
            headers: { "content-type": "text/html" },
            body: Buffer.from("<h1>Recovered public page</h1>"),
          };
        },
      );
      const p = await context.newPage();
      await p.goto("https://fixture.example/");
      assert.equal(calls, 2);
      assert.equal(state.failures["retry-http-503"], 1);
      await p.evaluate(() =>
        fetch("/post", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: '{"query":"test"}',
        }),
      );
      assert.equal(seen.method, "POST");
      assert.equal(seen.body.toString(), '{"query":"test"}');
      await context.close();
      const c = await browser.newContext();
      let publicCalls = 0;
      const s = await guardContext(
        c,
        d,
        async (url, budget, signal, request) => {
          if (new URL(url).hostname === "127.0.0.1")
            return (await import("../server/security.ts")).safeFetch(
              url,
              budget,
              signal,
              request,
            );
          publicCalls++;
          return {
            status: 302,
            headers: { location: "http://127.0.0.1/metadata" },
            body: Buffer.alloc(0),
          };
        },
      );
      const page = await c.newPage();
      await assert.rejects(page.goto("https://fixture.example/redirect"));
      assert.equal(publicCalls, 1);
      assert.ok(Object.keys(s.failures).some((k) => /Private/.test(k)));
    } finally {
      d.dispose();
      await browser.close();
      assert.equal(browser.isConnected(), false);
    }
  },
);

test(
  "closing a job with in-flight work settles routes without unhandled errors",
  { timeout: 10_000 },
  async () => {
    const browser = await chromium.launch();
    const d = new Deadline(300);
    try {
      const context = await browser.newContext();
      d.signal.addEventListener(
        "abort",
        () => void context.close().catch(() => {}),
        { once: true },
      );
      await guardContext(context, d, async (_url, _budget, signal) => {
        await new Promise((_, reject) => {
          if (signal.aborted) reject(signal.reason);
          else
            signal.addEventListener("abort", () => reject(signal.reason), {
              once: true,
            });
        });
        throw Error("unreachable");
      });
      const page = await context.newPage();
      await assert.rejects(page.goto("https://fixture.example/hang"));
      assert.ok(d.signal.aborted);
    } finally {
      d.dispose();
      await browser.close();
      assert.equal(browser.isConnected(), false);
    }
  },
);

test(
  "frozen DOM and tiled atlas stay aligned despite page timers",
  { timeout: 10_000 },
  async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 900 },
      });
      await page.setContent(
        '<body style="margin:0"><h1>Stable capture title</h1><div style="height:1900px;background:#00cc44"></div><script>setInterval(()=>document.querySelector("h1").textContent=String(Date.now()),30)</script>',
      );
      const session = await page.context().newCDPSession(page);
      await session.send("Emulation.setScriptExecutionDisabled", {
        value: true,
      });
      const before = await extract(page);
      const png = PNG.sync.read(
        await capturePage(page, before.width, before.height),
      );
      const after = await extract(page);
      assert.deepEqual(after, before);
      assert.equal(png.height, before.height);
      for (const y of [850, 950, 1800]) {
        const i = (y * png.width + 500) * 4;
        assert.deepEqual([...png.data.subarray(i, i + 3)], [0, 204, 68]);
      }
    } finally {
      await browser.close();
    }
  },
);
