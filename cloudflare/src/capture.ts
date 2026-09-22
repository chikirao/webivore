import puppeteer from "@cloudflare/puppeteer";
import { normalizeUrl, sha256, verifyPublicHostname } from "./security";
import {
  CAPTURE_PROFILE,
  EXTRACTOR_VERSION,
  LEVEL_FORMAT_VERSION,
  type Candidate,
  type CaptureResult,
  type Env,
} from "./types";

const DEADLINE_MS = 48_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function withBrowserSession<T, B extends { close(): Promise<unknown> }>(
  launch: () => Promise<B>,
  task: (browser: B) => Promise<T>,
) {
  const browser = await launch();
  try {
    return await task(browser);
  } finally {
    await browser.close().catch(() => {});
  }
}

function deadline(start: number) {
  const remaining = () => DEADLINE_MS - (Date.now() - start);
  const check = () => {
    if (remaining() <= 0) throw new Error("Capture deadline exceeded.");
  };
  return { remaining, check };
}

export async function capture(urlValue: string, id: string, env: Env): Promise<CaptureResult> {
  const requested = normalizeUrl(urlValue);
  await verifyPublicHostname(requested.hostname);
  const started = Date.now();
  const clock = deadline(started);
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
  const closeOnDeadline = setTimeout(() => void browser?.close().catch(() => {}), DEADLINE_MS);
  try {
    return await withBrowserSession(
      () => puppeteer.launch(env.BROWSER, { keep_alive: 60_000 }),
      async (activeBrowser) => {
    browser = activeBrowser;
    const page = await browser.newPage();
    const cdp = await page.createCDPSession();
    await cdp.send("Browser.setDownloadBehavior", { behavior: "deny" });
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await page.setBypassServiceWorker(true);
    await page.setRequestInterception(true);
    const verifiedHosts = new Set<string>();
    let requestCount = 0;
    let declaredBytes = 0;
    let receivedBytes = 0;
    let resourceBudgetExceeded = false;
    let degraded = false;
    let degradationReason = "";
    await cdp.send("Network.enable");
    cdp.on("Network.dataReceived", (event) => {
      receivedBytes += event.encodedDataLength;
      if (receivedBytes > 24_000_000) resourceBudgetExceeded = true;
    });
    page.on("dialog", (dialog) => void dialog.dismiss());
    page.on("popup", (popup) => void popup?.close().catch(() => {}));
    page.on("request", (request) => {
      void (async () => {
        try {
          clock.check();
          if (resourceBudgetExceeded)
            throw new Error("Page resource budget exceeded.");
          const target = normalizeUrl(request.url());
          const type = request.resourceType();
          const method = request.method();
          if (++requestCount > 150) throw new Error("Request budget exceeded.");
          if (!["document", "stylesheet", "image", "font", "script", "xhr", "fetch"].includes(type))
            throw new Error("Resource type blocked.");
          if (!["GET", "HEAD", "POST"].includes(method)) throw new Error("Request method blocked.");
          if (method === "POST" && (request.postData()?.length ?? 0) > 64_000)
            throw new Error("Request body blocked.");
          if (!verifiedHosts.has(target.hostname)) {
            if (verifiedHosts.size >= 12) throw new Error("Hostname budget exceeded.");
            await verifyPublicHostname(target.hostname);
            verifiedHosts.add(target.hostname);
          }
          await request.continue();
        } catch {
          await request.abort("blockedbyclient").catch(() => {});
        }
      })();
    });
    page.on("response", (response) => {
      const declared = Number(response.headers()["content-length"] ?? 0);
      if (Number.isFinite(declared) && declared > 0) {
        declaredBytes += declared;
        if (declared > 6_000_000 || declaredBytes > 24_000_000)
          resourceBudgetExceeded = true;
      }
    });
    let navigationTimedOut = false;
    try {
      const response = await page.goto(requested.href, { waitUntil: "domcontentloaded", timeout: 18_000 });
      if (!response || response.status() >= 400)
        throw new Error(`Website returned ${response?.status() ?? "no response"}.`);
    } catch (error) {
      if (!/timeout/i.test((error as Error).message) || page.url() === "about:blank") throw error;
      navigationTimedOut = true;
      degraded = true;
      degradationReason = "navigation-timeout";
    }
    clock.check();
    const finalUrl = normalizeUrl(page.url());
    await verifyPublicHostname(finalUrl.hostname);
    let previous = "";
    let stable = 0;
    for (let attempt = 0; attempt < 24 && clock.remaining() > 24_000; attempt++) {
      const sample = await page.evaluate(() => ({
        height: document.documentElement.scrollHeight,
        children: document.body?.childElementCount ?? 0,
        text: (document.body?.innerText ?? "").slice(0, 6000),
        images: Array.from(document.images).slice(0, 30).map((image) => `${image.currentSrc}:${image.naturalWidth}`).join("|"),
      }));
      const signature = JSON.stringify(sample);
      stable = signature === previous ? stable + 1 : 0;
      previous = signature;
      if (stable >= 3 && sample.text.trim().length > 60) break;
      await sleep(160);
    }
    await page.addStyleTag({ content: "*{animation:none!important;transition:none!important;scroll-behavior:auto!important;caret-color:transparent!important;content-visibility:visible!important}" });
    const initialHeight = await page.evaluate(() => Math.min(9000, Math.max(900, document.documentElement.scrollHeight)));
    for (let top = 0; top < initialHeight && clock.remaining() > 19_000; top += 700) {
      await page.evaluate((y) => window.scrollTo(0, y), top);
      await sleep(80);
    }
    const media = await page.evaluate(async () => {
      let replaced = 0;
      let reason = "";
      const current = new URL(location.href);
      const youtube = /(^|\.)youtube\.com$/.test(current.hostname) || current.hostname === "youtu.be";
      const videoId = youtube
        ? current.searchParams.get("v") ?? (current.hostname === "youtu.be" ? current.pathname.slice(1) : current.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1])
        : null;
      const player = document.querySelector<HTMLElement>("#movie_player,#player-container-inner,#player");
      const video = player?.querySelector("video");
      if (videoId && /^[\w-]{11}$/.test(videoId) && (!video || video.readyState < 2 || video.error)) {
        const article = document.createElement("article");
        article.dataset.webivoreFallback = "youtube";
        Object.assign(article.style, { background: "#181818", color: "white", padding: "24px", boxSizing: "border-box", width: "100%", font: "20px Arial,sans-serif" });
        const image = document.createElement("img");
        image.src = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        image.alt = document.title.replace(/ - YouTube$/, "") || "YouTube video";
        Object.assign(image.style, { width: "100%", maxHeight: "600px", objectFit: "contain", display: "block" });
        const heading = document.createElement("h1");
        heading.textContent = image.alt;
        const caption = document.createElement("p");
        caption.textContent = "YouTube · recognisable thumbnail fallback · video streams are not downloaded";
        article.appendChild(image);
        article.appendChild(heading);
        article.appendChild(caption);
        if (player) player.replaceWith(article);
        else document.body.insertBefore(article, document.body.firstChild);
        replaced++;
        reason = "youtube-thumbnail";
      }
      for (const item of Array.from(document.querySelectorAll("video")).slice(0, 12)) {
        item.pause();
        if (item.readyState >= 2 && !item.error) continue;
        const rect = item.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) continue;
        const fallback = document.createElement("div");
        fallback.dataset.webivoreFallback = "video";
        fallback.textContent = `▶ ${item.title || "Video preview unavailable"}`;
        Object.assign(fallback.style, { width: `${rect.width}px`, height: `${rect.height}px`, maxWidth: "100%", background: "#242424", color: "white", display: "grid", placeItems: "center", font: "24px Arial,sans-serif" });
        item.replaceWith(fallback);
        replaced++;
        reason ||= "video-placeholder";
      }
      const bodyText = (document.body?.innerText ?? "").trim();
      const authWall = !!document.querySelector('input[type="password"]') && bodyText.length < 1200;
      if (authWall || bodyText.length < 20) {
        const originalTitle = document.title || current.hostname;
        document.body.replaceChildren();
        const main = document.createElement("main");
        Object.assign(main.style, { minHeight: "900px", padding: "72px", boxSizing: "border-box", background: "#f4f0e7", color: "#171914", font: "24px Arial,sans-serif" });
        const label = document.createElement("p");
        label.textContent = current.hostname;
        const heading = document.createElement("h1");
        heading.textContent = originalTitle;
        heading.style.fontSize = "68px";
        const message = document.createElement("p");
        message.textContent = "This site requires sign-in or blocked automated rendering. WEBIVORE created a safe metadata fallback.";
        main.appendChild(label);
        main.appendChild(heading);
        main.appendChild(message);
        document.body.appendChild(main);
        replaced++;
        reason = authWall ? "authentication-wall" : "empty-render";
      }
      return { replaced, reason };
    });
    if (media.replaced) {
      degraded = true;
      degradationReason = media.reason;
    }
    await page.evaluate(async (timeout) => {
      window.scrollTo(0, 0);
      const images = Array.from(document.images).slice(0, 120);
      images.forEach((image) => (image.loading = "eager"));
      await Promise.race([
        Promise.all([document.fonts.ready, ...images.map((image) => image.decode().catch(() => {}))]),
        new Promise((resolve) => setTimeout(resolve, timeout)),
      ]);
    }, Math.max(200, Math.min(3000, clock.remaining() - 14_000)));
    await page.evaluate(() => {
      for (const element of Array.from(document.querySelectorAll<HTMLElement>("*")).slice(0, 14_000)) {
        const position = getComputedStyle(element).position;
        if (position === "fixed" || position === "sticky") element.style.setProperty("position", "static", "important");
      }
      window.scrollTo(0, 0);
    });
    const extracted = await page.evaluate(() => {
      const width = 1280;
      const height = Math.min(9000, Math.max(900, document.documentElement.scrollHeight));
      const candidates: Candidate[] = [];
      let sourceElementCount = 0;
      const add = (element: Element, rect: DOMRect, value: string, type: string) => {
        const x = Math.max(0, rect.left), y = Math.max(0, rect.top), right = Math.min(width, rect.right), bottom = Math.min(height, rect.bottom);
        if (right - x < 1 || bottom - y < 1 || candidates.length >= 10_000) return;
        const style = getComputedStyle(element);
        candidates.push({
          id: candidates.length,
          tagName: element.tagName,
          text: value.replace(/\s+/g, " ").trim().slice(0, 100),
          x, y, width: right - x, height: bottom - y, type,
          fontSize: parseFloat(style.fontSize) || 16,
          backgroundColor: style.backgroundColor,
          borderRadius: style.borderRadius,
          zIndex: style.zIndex,
          imageUrl: element instanceof HTMLImageElement ? element.currentSrc.slice(0, 2048) : undefined,
        });
      };
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      let node: Node | null, visits = 0;
      while ((node = walker.nextNode()) && visits++ < 40_000 && candidates.length < 10_000) {
        const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
        if (!element || ["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"].includes(element.tagName)) continue;
        const style = getComputedStyle(element);
        if (style.visibility !== "visible" || style.display === "none" || Number(style.opacity) === 0) continue;
        if (node.nodeType === Node.ELEMENT_NODE) {
          sourceElementCount++;
          if (["IMG", "SVG", "CANVAS", "VIDEO", "INPUT", "TEXTAREA", "BUTTON"].includes(element.tagName))
            add(element, element.getBoundingClientRect(), element.getAttribute("alt") || element.textContent || element.tagName, /IMG|SVG|CANVAS|VIDEO/.test(element.tagName) ? "IMAGE" : element.tagName === "BUTTON" ? "BUTTON" : "INPUT");
        } else if (node.textContent?.trim()) {
          const range = document.createRange();
          range.selectNodeContents(node);
          const type = element.closest("a") ? "LINK" : /^H[1-6]$/.test(element.tagName) ? "HERO" : "TEXT_BLOCK";
          for (const rect of Array.from(range.getClientRects())) add(element, rect, node.textContent, rect.width * rect.height < 1800 ? "TEXT_SMALL" : type);
        }
      }
      return { width, height, candidates, title: document.title, sourceElementCount, truncated: document.documentElement.scrollHeight > 9000 || candidates.length >= 10_000 };
    });
    clock.check();
    if (
      resourceBudgetExceeded ||
      declaredBytes > 24_000_000 ||
      receivedBytes > 24_000_000
    )
      throw new Error("Page resource budget exceeded.");
    const screenshot = await page.screenshot({
      type: "jpeg",
      quality: 84,
      clip: { x: 0, y: 0, width: extracted.width, height: extracted.height },
      captureBeyondViewport: true,
    });
    const atlas = new Uint8Array(screenshot);
    if (atlas.byteLength > 20 * 1024 * 1024) throw new Error("Captured page is too large to cache safely.");
    const etag = await sha256(atlas);
    return {
      atlas,
      metadata: {
        id,
        url: finalUrl.href,
        title: extracted.title || finalUrl.hostname,
        width: extracted.width,
        height: extracted.height,
        candidates: extracted.candidates,
        truncated: extracted.truncated,
        sourceElementCount: extracted.sourceElementCount,
        degraded: degraded || navigationTimedOut,
        ...(degradationReason ? { degradationReason } : {}),
        atlas: { url: `/api/snapshot/${id}/atlas`, mimeType: "image/jpeg", bytes: atlas.byteLength, etag },
        profile: CAPTURE_PROFILE,
        extractorVersion: EXTRACTOR_VERSION,
        levelFormatVersion: LEVEL_FORMAT_VERSION,
      },
    };
      },
    );
  } catch (error) {
    const message = (error as Error).message;
    if (/browser time limit exceeded|code:\s*429|unable to create new browser/i.test(message))
      throw Object.assign(new Error("Cloudflare's free browser quota is exhausted. Cached, demo and local levels remain available."), { code: "BROWSER_QUOTA", status: 429 });
    if (/deadline|timeout/i.test(message))
      throw Object.assign(new Error("Capture timed out. Try a smaller public page or import a screenshot."), { code: "CAPTURE_TIMEOUT", status: 504 });
    throw error;
  } finally {
    clearTimeout(closeOnDeadline);
  }
}
