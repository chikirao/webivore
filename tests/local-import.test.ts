import assert from "node:assert/strict";
import test from "node:test";
import { DOMParser } from "linkedom";
import { sanitizeHtmlToBlocks } from "../src/local-import";
import { imagePiecePlan, layoutSemanticBlocks, partitionPixels } from "../src/level-builder";

test("untrusted HTML drops scripts, handlers, navigation, forms and remote assets", () => {
  const malicious = `<!doctype html><html><head>
    <title>Unsafe page</title><meta http-equiv="refresh" content="0;javascript:alert(1)">
    <style>body{background:url(https://tracker.invalid/pixel)}</style></head><body onload="steal()">
    <script>globalThis.pwned=true</script><iframe srcdoc="<script>pwn()</script>"></iframe>
    <object data="https://evil.invalid"></object><embed src="https://evil.invalid">
    <form action="https://evil.invalid"><button formaction="javascript:alert(1)" onclick="pwn()">Safe label</button></form>
    <a href="javascript:alert(1)" ping="https://evil.invalid">Readable link</a>
    <img src="https://evil.invalid/a.png" onerror="pwn()" alt="Remote diagram">
    <svg><script>pwn()</script><a xlink:href="javascript:pwn()">bad</a></svg>
    <p style="background:url(https://evil.invalid/css)">Playable text</p>
  </body></html>`;
  const result = sanitizeHtmlToBlocks(malicious, new DOMParser() as any);
  const serialized = JSON.stringify(result.blocks);
  assert.equal(result.title, "Unsafe page");
  assert.ok(result.removed >= 10);
  assert.match(serialized, /Safe label/);
  assert.match(serialized, /Readable link/);
  assert.match(serialized, /Playable text/);
  assert.doesNotMatch(serialized, /javascript:|onerror|onclick|srcdoc|evil\.invalid|tracker\.invalid|<script/i);
});

test("safe HTML model produces a finite playable completion budget", () => {
  const { blocks } = sanitizeHtmlToBlocks(
    "<title>Notes</title><h1>Field notes</h1><p>One small thing.</p><ul><li>First</li><li>Second</li></ul><button>Collect</button>",
    new DOMParser() as any,
  );
  const layout = layoutSemanticBlocks(blocks);
  const pixels = new Uint8ClampedArray(layout.width * layout.height * 4);
  pixels.fill(255);
  for (const item of layout.items)
    for (let y = Math.floor(item.y); y < Math.min(layout.height, Math.ceil(item.y + item.height)); y++)
      for (let x = Math.floor(item.x); x < Math.min(layout.width, Math.ceil(item.x + item.width)); x++) {
        const offset = (y * layout.width + x) * 4;
        pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0;
      }
  const built = partitionPixels(layout.items, pixels, layout.width, layout.height);
  assert.ok(built.pieces.length > 5);
  assert.ok(built.pieces.some((piece) => piece.type === "HERO"));
  assert.ok(built.pieces.every((piece) => Number.isFinite(piece.mass + piece.threshold + piece.growthValue)));
  assert.ok(built.pieces.reduce((sum, piece) => sum + piece.growthValue, 0) > 0);
});

test("image import partition is deterministic and grows from small to large fragments", () => {
  const first = imagePiecePlan(1280, 2400);
  const second = imagePiecePlan(1280, 2400);
  assert.deepEqual(first, second);
  assert.ok(first.length < 2000);
  assert.ok(Math.min(...first.map((piece) => piece.threshold)) <= 15);
  assert.ok(Math.max(...first.map((piece) => piece.threshold)) > 30);
  assert.ok(first.every((piece) => piece.type === "PAGE_FRAGMENT" || piece.type === "IMAGE"));
});
