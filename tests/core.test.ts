import test from "node:test";
import assert from "node:assert/strict";
import { validateURL, isPublicIP, safeFetch } from "../server/security.ts";
import { properties } from "../src/shared.ts";
test("blocks alternate local, private, metadata and IPv6 addresses", () => {
  for (const url of [
    "file:///etc/passwd",
    "http://localhost",
    "http://127.0.0.1",
    "http://2130706433",
    "http://0x7f000001",
    "http://10.0.0.1",
    "http://172.16.0.1",
    "http://192.168.1.1",
    "http://169.254.169.254",
    "http://[::1]",
    "http://[::ffff:127.0.0.1]",
    "http://user:pass@example.com",
    "https://example.com:444",
    "http://100.64.0.1",
    "http://198.18.0.1",
  ])
    assert.throws(() => validateURL(url), url);
});
test("allows public URLs and rejects non-global ranges", () => {
  assert.equal(
    validateURL("https://example.com/test?q=1").hostname,
    "example.com",
  );
  assert.equal(isPublicIP("93.184.216.34"), true);
  for (const ip of [
    "0.1.2.3",
    "224.0.0.1",
    "255.255.255.255",
    "192.0.2.1",
    "198.51.100.1",
    "203.0.113.1",
  ])
    assert.equal(isPublicIP(ip), false);
});
test("safeFetch refuses private destination before opening a connection", async () => {
  await assert.rejects(
    safeFetch("http://127.0.0.1/", { bytes: 0 }, new AbortController().signal),
  );
});
test("size and density produce increasing pickup thresholds", () => {
  const a = properties(20, 20, "TEXT_SMALL"),
    b = properties(350, 200, "IMAGE"),
    c = properties(1200, 500, "SECTION");
  assert.ok(a.threshold < b.threshold && b.threshold < c.threshold);
  assert.ok(a.growthValue > 0);
  assert.ok(c.mass > b.mass);
});
test("sparse pages have no impossible size gap", async () => {
  const { balancePieces } = await import("../src/shared.ts");
  const pieces = [
    { ...properties(80, 21, "LINK") },
    { ...properties(768, 21, "TEXT_BLOCK") },
    { ...properties(768, 32, "HERO") },
  ];
  const balanced = balancePieces(pieces as any);
  let area = 225;
  for (const p of [...balanced].sort((a, b) => a.threshold - b.threshold)) {
    assert.ok(Math.sqrt(area) >= p.threshold);
    area += p.growthValue;
  }
});
test("invisible and occluded colliders are discarded based on actual pixels", async () => {
  const { PNG } = await import("pngjs");
  const { visiblePieces } = await import("../server/visibility.ts");
  const a = new PNG({ width: 40, height: 40 }),
    b = new PNG({ width: 40, height: 40 });
  a.data.fill(255);
  b.data.fill(255);
  for (let y = 5; y < 15; y++)
    for (let x = 5; x < 15; x++) a.data[(y * 40 + x) * 4] = 20;
  const pieces = [
    { x: 0, y: 0, width: 20, height: 20 },
    { x: 20, y: 20, width: 20, height: 20 },
  ];
  assert.deepEqual(
    visiblePieces(pieces, PNG.sync.write(a), PNG.sync.write(b)),
    [pieces[0]],
  );
});
