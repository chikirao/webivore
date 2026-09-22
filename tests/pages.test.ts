import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { routeAt, withBase } from "../src/paths";

test("GitHub Pages subpath resolves assets and rabbit editor route", () => {
  assert.equal(withBase("assets/rabbit.png", "/WEBIVORE/"), "/WEBIVORE/assets/rabbit.png");
  assert.equal(withBase("fonts/display.ttf", "/WEBIVORE/"), "/WEBIVORE/fonts/display.ttf");
  assert.equal(routeAt("/WEBIVORE/rabbit-editor/", "rabbit-editor", "/WEBIVORE/"), true);
  assert.equal(routeAt("/rabbit-editor", "rabbit-editor", "/WEBIVORE/"), false);
});

test("favicon, manifest and custom domain survive a Pages build", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const manifest = JSON.parse(readFileSync(new URL("../public/site.webmanifest", import.meta.url), "utf8"));
  assert.match(html, /%BASE_URL%assets\/webivore-favicon\.png/);
  assert.match(html, /%BASE_URL%site\.webmanifest/);
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.icons[0].src, "assets/webivore-favicon.png");
  assert.equal(readFileSync(new URL("../public/CNAME", import.meta.url), "utf8").trim(), "webivore.chikirao.ru");
});
