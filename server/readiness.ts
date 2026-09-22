import { evaluatePage } from "./evaluate.ts";
import type { Page } from "playwright";
import { Deadline, readinessDecision } from "./deadline.ts";
import type { NetworkState } from "./network.ts";
import { recoverYouTubePage, type YouTubeRecovery } from "./youtube.ts";

export async function settlePage(
  page: Page,
  deadline: Deadline,
  limit: number,
  network?: NetworkState,
  captureReserve = 20_000,
) {
  const start = performance.now();
  let previous = "",
    stableSince = start;
  while (true) {
    deadline.check();
    const sample = await evaluatePage(
      page,
      () => {
        const visible = (e: Element) => {
          const r = e.getBoundingClientRect();
          const s = getComputedStyle(e);
          return (
            r.width > 1 &&
            r.height > 1 &&
            r.top < 9000 &&
            r.bottom > 0 &&
            s.visibility === "visible" &&
            s.display !== "none"
          );
        };
        const text = (document.body?.innerText ?? "").trim();
        const imgs = Array.from(document.images).filter(
          (i) => visible(i) && i.getBoundingClientRect().top < innerHeight,
        );
        const loading = Array.from(
          document.querySelectorAll('[aria-busy="true"],[role="progressbar"]'),
        ).some(visible);
        const meaningful =
          !loading &&
          ((text.length > 80 &&
            !/^(loading|please wait|загрузка)[.\s…]*$/i.test(text)) ||
            imgs.some((i) => i.naturalWidth > 80));
        return {
          signature: [
            document.documentElement.scrollHeight,
            document.body?.childElementCount,
            text.slice(0, 12000),
            imgs.map((i) => `${i.currentSrc}:${i.naturalWidth}`).join("|"),
          ].join(":"),
          meaningful,
          assetsReady:
            imgs.every((i) => i.complete) && document.fonts.status === "loaded",
        };
      },
      undefined,
    );
    const now = performance.now();
    if (sample.signature !== previous) {
      previous = sample.signature;
      stableSince = now;
    }
    const decision = readinessDecision(
      {
        ...sample,
        stableMs: now - stableSince,
        elapsedMs: now - start,
        pending: network?.pending ?? 0,
        quietMs: network ? now - network.lastActivity : now - start,
      },
      Math.min(limit, now - start + deadline.remaining(captureReserve)),
    );
    if (decision !== "wait")
      return {
        state: decision,
        meaningful: sample.meaningful,
        ms: Math.round(now - start),
      };
    await deadline.sleep(100);
  }
}

/** All fallback URLs are loaded by the same guarded context, never by browser networking. */
export async function prepareMedia(page: Page, timeout: number) {
  return evaluatePage(
    page,
    async (timeout: number) => {
      let posters = document.querySelectorAll(
          '[data-webivore-media="youtube-thumbnail"]',
        ).length,
        placeholders = 0;
      const load = async (src: string) => {
        const image = new Image();
        image.src = src;
        await Promise.race([
          image.decode().catch(() => {}),
          new Promise((r) => setTimeout(r, timeout)),
        ]);
        return image.naturalWidth > 0 ? image : null;
      };
      const url = new URL(location.href);
      const youtube =
        /(^|\.)youtube\.com$/.test(url.hostname) || url.hostname === "youtu.be";
      const id = youtube
        ? (url.searchParams.get("v") ??
          (url.hostname === "youtu.be"
            ? url.pathname.slice(1)
            : url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1]))
        : null;
      if (id && /^[\w-]{11}$/.test(id) && !posters) {
        const player =
          document.querySelector<HTMLElement>("#movie_player") ??
          document.querySelector<HTMLElement>(
            "#player-container-inner, #player",
          );
        const video = player?.querySelector("video");
        if (!video || video.readyState < 2 || video.error) {
          const image = await load(
            `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
          );
          if (image) {
            const article = document.createElement("article");
            article.dataset.webivoreMedia = "youtube-thumbnail";
            article.style.cssText =
              "background:#181818;color:white;padding:20px;box-sizing:border-box;width:100%;font:20px Arial,sans-serif";
            image.alt = document.title.replace(/ - YouTube$/, "");
            image.style.cssText =
              "width:100%;max-height:600px;object-fit:contain;display:block";
            const title = document.createElement("h1");
            title.textContent = image.alt;
            const caption = document.createElement("p");
            caption.textContent = "YouTube · Video thumbnail";
            article.append(image);
            if (
              !document.querySelector(
                "ytd-watch-metadata h1, #info-contents h1",
              )
            )
              article.append(title);
            article.append(caption);
            // A short page can still contain real recommendations/comments.
            // Replace only the player; never discard the surrounding document.
            if (player) player.replaceWith(article);
            else document.body.prepend(article);
            posters++;
          }
        }
      }
      await Promise.all(
        Array.from(document.querySelectorAll("video"))
          .slice(0, 12)
          .map(async (video) => {
            video.pause();
            if (video.readyState >= 2 && !video.error) return;
            const rect = video.getBoundingClientRect();
            if (rect.width < 2 || rect.height < 2) return;
            const image = video.poster ? await load(video.poster) : null;
            const replacement = image ?? document.createElement("div");
            replacement.dataset.webivoreMedia = image
              ? "poster"
              : "placeholder";
            replacement.style.cssText = `width:${rect.width}px;height:${rect.height}px;max-width:100%;object-fit:contain;background:#242424;color:white;display:grid;place-items:center;font:24px Arial,sans-serif`;
            if (image) {
              image.alt = video.title || "Video poster";
              posters++;
            } else {
              replacement.textContent =
                "▶ " + (video.title || "Video preview unavailable");
              placeholders++;
            }
            video.replaceWith(replacement);
          }),
      );
      return { posters, placeholders };
    },
    Math.max(1, timeout),
  );
}

export async function prepareDocument(
  page: Page,
  deadline: Deadline,
  network?: NetworkState,
) {
  const initial = await settlePage(page, deadline, 6500, network);
  await page.addStyleTag({
    content:
      "*{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important;content-visibility:visible!important}",
  });
  const normalize = async () =>
    page.evaluate(() => {
      for (const el of Array.from(
        document.querySelectorAll<HTMLElement>("*"),
      ).slice(0, 14000)) {
        if (["sticky", "fixed"].includes(getComputedStyle(el).position))
          el.style.setProperty("position", "static", "important");
      }
    });
  await normalize();
  // Recompute height: lazy content can extend the document during the sweep.
  for (let top = 0; top < 9000 && deadline.remaining(24_000) > 0; top += 700) {
    const height = await page.evaluate((y) => {
      window.scrollTo(0, y);
      return document.documentElement.scrollHeight;
    }, top);
    await deadline.sleep(100);
    if (top + 900 >= Math.min(9000, height)) break;
  }
  const youtube: YouTubeRecovery = await recoverYouTubePage(
    page,
    deadline,
  ).catch(() => {
    deadline.check();
    return { state: "unavailable", reason: "watch-recovery-failed" };
  });
  const media = await prepareMedia(
    page,
    Math.min(2500, deadline.remaining(22_000)),
  );
  // Recovery is a bounded document (20 comments + 20 recommendations), with
  // eager images and no application hydration left. Don't reserve 20 seconds
  // while refusing to decode its newly recovered thumbnails.
  const captureReserve = youtube.state === "recovered" ? 8000 : 20_000;
  const assets = await evaluatePage(
    page,
    async (timeout: number) => {
      window.scrollTo(0, 0);
      const inCapture = (el: Element) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.top < 9000 && r.bottom > 0;
      };
      const images = Array.from(document.images).filter(inCapture);
      for (const image of images) image.loading = "eager";
      const backgrounds = new Set<string>();
      for (const el of Array.from(document.querySelectorAll("*")).slice(
        0,
        14000,
      )) {
        if (!inCapture(el)) continue;
        for (const match of getComputedStyle(el).backgroundImage.matchAll(
          /url\(["']?([^"')]+)["']?\)/g,
        ))
          backgrounds.add(match[1]);
      }
      const bgImages = Array.from(backgrounds)
        .slice(0, 80)
        .map((src) => {
          const i = new Image();
          i.src = src;
          return i;
        });
      let expired = false;
      let timer: ReturnType<typeof setTimeout>;
      await Promise.race([
        Promise.all([
          document.fonts.ready,
          ...images.map((i) => i.decode().catch(() => {})),
          ...bgImages.map((i) => i.decode().catch(() => {})),
        ]),
        new Promise((r) => {
          timer = setTimeout(() => {
            expired = true;
            r(null);
          }, timeout);
        }),
      ]);
      clearTimeout(timer!);
      return {
        expired,
        images: images.length,
        missingImages: images.filter((i) => !i.naturalWidth).length,
        backgrounds: bgImages.length,
        missingBackgrounds: bgImages.filter((i) => !i.naturalWidth).length,
        fonts: document.fonts.status,
        consentOverlay: !!document.querySelector(
          '[role="dialog"], [aria-modal="true"]',
        ),
      };
    },
    Math.max(1, Math.min(3500, deadline.remaining(captureReserve + 1000))),
  );
  const final = await settlePage(page, deadline, 2500, network, captureReserve);
  await normalize();
  await page.evaluate(() => window.scrollTo(0, 0));
  return { initial, final, media, assets, youtube };
}
