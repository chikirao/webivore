import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { Deadline } from "../server/deadline.ts";
import { guardContext } from "../server/network.ts";
import { prepareDocument, prepareMedia } from "../server/readiness.ts";
import { extract } from "../server/extract.ts";
import {
  initial,
  player,
  comments,
  videoId,
} from "./fixtures/readiness/youtube-data.ts";
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240"><rect width="400" height="240" fill="#44aa66"/></svg>';
for (const failComments of [false, true])
  test(
    `YouTube broken client retains real page sections (comments failure=${failComments})`,
    { timeout: 20000 },
    async () => {
      const browser = await chromium.launch();
      // Even a late recovery with only 17 seconds left should use that time for
      // comments and images, instead of reserving it all for screenshots.
      const d = new Deadline(failComments ? 55_000 : 17_000);
      try {
        const c = await browser.newContext({
          viewport: { width: 1280, height: 900 },
          serviceWorkers: "block",
        });
        let commentRequests = 0;
        const calls: string[] = [];
        await guardContext(c, d, async (url, _budget, _signal, request) => {
          calls.push(url);
          const u = new URL(url);
          if (u.pathname === "/youtubei/v1/next") {
            commentRequests++;
            assert.equal(request?.method, "POST");
            assert.equal(
              JSON.parse(request!.body!.toString()).continuation,
              "fixture-read-only-continuation",
            );
            return {
              status: failComments ? 503 : 200,
              headers: { "content-type": "application/json" },
              body: Buffer.from(JSON.stringify(comments)),
            };
          }
          if (u.hostname === "fixture.example")
            return {
              status: 200,
              headers: { "content-type": "image/svg+xml" },
              body: Buffer.from(svg),
            };
          const source = { initial: structuredClone(initial), player };
          // Untrusted remote text must remain text, never execute as markup.
          source.initial.contents.twoColumnWatchNextResults.results.results.contents[1].videoSecondaryInfoRenderer!.attributedDescription.content =
            '<img src=x onerror="window.injected=true">';
          return {
            status: 200,
            headers: { "content-type": "text/html" },
            body: Buffer.from(
              `<html><head><title>Fixture video</title></head><body><div id="player" class="skeleton"><video width="640" height="360"></video></div><div id="watch-page-skeleton">Loading</div><ytd-app></ytd-app><footer id="keep">Existing unrelated content</footer><script>window.ytInitialData=${JSON.stringify(source.initial).replaceAll("<", "\\u003c")};window.ytInitialPlayerResponse=${JSON.stringify(source.player)};window.ytcfg={get:()=>({client:{clientName:'WEB',clientVersion:'fixture'}})};</script></body></html>`,
            ),
          };
        });
        const p = await c.newPage();
        await p.goto(`https://www.youtube.com/watch?v=${videoId}`, {
          waitUntil: "domcontentloaded",
        });
        const result = await prepareDocument(p, d);
        assert.equal(
          await p
            .locator("[data-webivore-recommendations] [data-video-id]")
            .count(),
          2,
        );
        assert.equal(
          await p.locator("[data-comment-id]").count(),
          failComments ? 0 : 2,
        );
        assert.equal(commentRequests, 1);
        assert.equal(
          await p.locator("#watch-page-skeleton, #player.skeleton").count(),
          0,
        );
        assert.equal(
          await p.locator("#keep").innerText(),
          "Existing unrelated content",
        );
        assert.equal(
          await p.evaluate(() => Boolean((window as any).injected)),
          false,
        );
        assert.ok(!calls.some((url) => url.includes("127.0.0.1")));
        const data = await extract(p);
        assert.ok(data.pieces.some((x) => x.text === "Related skate lesson"));
        if (!failComments)
          assert.ok(
            data.pieces.some((x) => x.text.includes("An actual comment")),
          );
        else {
          assert.equal(result.youtube.commentStatus, "http-503");
          assert.match(
            await p.locator("[data-webivore-comments]").innerText(),
            /could not be loaded/,
          );
        }
        assert.equal(result.media.placeholders, 0);
        assert.equal(result.assets.missingImages, 0);
      } finally {
        d.dispose();
        await browser.close();
      }
    },
  );
test(
  "thumbnail replacement preserves short native recommendations and comments",
  { timeout: 10000 },
  async () => {
    const browser = await chromium.launch();
    try {
      const c = await browser.newContext();
      await c.route("**/*", (r) =>
        r.fulfill(
          r.request().resourceType() === "image"
            ? { contentType: "image/svg+xml", body: svg }
            : {
                contentType: "text/html",
                body: '<title>Native</title><div id="movie_player"><video width="600" height="340"></video></div><ytd-watch-metadata><h1>Native video</h1></ytd-watch-metadata><aside id="recommendations">Related video</aside><section id="comments">Real comment</section>',
              },
        ),
      );
      const p = await c.newPage();
      await p.goto(`https://www.youtube.com/watch?v=${videoId}`);
      await prepareMedia(p, 2000);
      assert.equal(await p.locator("#comments").innerText(), "Real comment");
      assert.equal(
        await p.locator("#recommendations").innerText(),
        "Related video",
      );
      assert.equal(await p.locator("h1").count(), 1);
    } finally {
      await browser.close();
    }
  },
);
