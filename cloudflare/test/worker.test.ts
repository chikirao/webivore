import assert from "node:assert/strict";
import test from "node:test";
import { cacheKey, keys, readCached, writeCached } from "../src/cache";
import { withBrowserSession } from "../src/capture";
import { handleRequest } from "../src/index";
import { isPublicIPv4, isPublicIPv6, normalizeUrl } from "../src/security";
import { validateTurnstile } from "../src/turnstile";
import {
  CAPTURE_PROFILE,
  EXTRACTOR_VERSION,
  LEVEL_FORMAT_VERSION,
  type CaptureResult,
  type Env,
} from "../src/types";

class MemoryKV {
  values = new Map<string, string | Uint8Array>();
  async get(key: string, type?: string) {
    const value = this.values.get(key);
    if (value === undefined) return null;
    if (type === "arrayBuffer") {
      const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
    const text = typeof value === "string" ? value : new TextDecoder().decode(value);
    return type === "json" ? JSON.parse(text) : text;
  }
  async put(key: string, value: string | ArrayBuffer | ArrayBufferView) {
    if (typeof value === "string") this.values.set(key, value);
    else if (ArrayBuffer.isView(value))
      this.values.set(key, new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)));
    else this.values.set(key, new Uint8Array(value.slice(0)));
  }
  async delete(key: string) {
    this.values.delete(key);
  }
}

const environment = (kv = new MemoryKV()): Env =>
  ({
    SNAPSHOTS: kv as unknown as KVNamespace,
    BROWSER: {} as Fetcher,
    ENVIRONMENT: "development",
    DEV_BYPASS_TURNSTILE: "true",
    RATE_LIMIT_SALT: "test-only-salt",
    ALLOWED_ORIGINS: "http://localhost:5174",
  }) as Env;

function result(id: string, url = "https://example.com/"): CaptureResult {
  const atlas = new Uint8Array([1, 2, 3, 4]);
  return {
    atlas,
    metadata: {
      id,
      url,
      title: "Example",
      width: 1280,
      height: 900,
      candidates: [],
      truncated: false,
      atlas: { url: `/api/snapshot/${id}/atlas`, mimeType: "image/jpeg", bytes: atlas.byteLength, etag: "abcd" },
      profile: CAPTURE_PROFILE,
      extractorVersion: EXTRACTOR_VERSION,
      levelFormatVersion: LEVEL_FORMAT_VERSION,
    },
  };
}

const post = (url = "https://example.com/") =>
  new Request("https://worker.example/api/snapshot", {
    method: "POST",
    headers: { Origin: "http://localhost:5174", "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.9" },
    body: JSON.stringify({ url }),
  });

test("URL normalization removes fragments and rejects SSRF destinations and dangerous ports", () => {
  assert.equal(normalizeUrl("HTTPS://Example.COM:443/a#fragment").href, "https://example.com/a");
  for (const value of ["http://127.0.0.1", "http://169.254.169.254/latest/meta-data", "http://10.0.0.1", "http://localhost", "http://[0:0:0:0:0:0:0:1]", "https://example.com:8443"])
    assert.throws(() => normalizeUrl(value), /blocked|ports/i);
  assert.equal(isPublicIPv4("8.8.8.8"), true);
  assert.equal(isPublicIPv4("192.168.1.1"), false);
  assert.equal(isPublicIPv6("2606:4700:4700::1111"), true);
  for (const value of ["::1", "0:0:0:0:0:0:0:1", "fc00::1", "fe80::1", "2001:db8::1", "2002:c0a8:101::"])
    assert.equal(isPublicIPv6(value), false, value);
  const redirects = ["https://example.com/start", "https://cdn.example.com/asset", "http://127.0.0.1/admin"];
  assert.throws(() => redirects.map((value) => normalizeUrl(value)), /blocked/i);
});

test("cache key includes normalized URL and all format versions", async () => {
  const one = await cacheKey("https://example.com/");
  const two = await cacheKey("https://example.com/other");
  assert.equal(one.length, 64);
  assert.notEqual(one, two);
  assert.equal(await cacheKey("https://example.com/"), one);
});

test("cache hit never launches Browser Run", async () => {
  const env = environment();
  const id = await cacheKey("https://example.com/");
  await writeCached(env, result(id));
  let launches = 0;
  const response = await handleRequest(post(), env, {
    capture: async () => {
      launches++;
      return result(id);
    },
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json() as any).cache, "hit");
  assert.equal(launches, 0);
});

test("simultaneous cache misses share one Browser Run capture", async () => {
  const env = environment();
  const id = await cacheKey("https://example.com/");
  let launches = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const dependency = {
    capture: async () => {
      launches++;
      await gate;
      return result(id);
    },
  };
  const first = handleRequest(post(), env, dependency);
  await Promise.resolve();
  const second = handleRequest(post(), env, dependency);
  await new Promise((resolve) => setTimeout(resolve, 10));
  release();
  const responses = await Promise.all([first, second]);
  assert.equal(launches, 1);
  assert.ok(responses.every((response) => response.status === 201));
});

test("quota errors and CORS failures return actionable fallbacks", async () => {
  const env = environment();
  const quota = await handleRequest(post("https://quota.example/"), env, {
    capture: async () => {
      throw Object.assign(new Error("Free quota exhausted; demo and local levels still work."), { code: "BROWSER_QUOTA", status: 429 });
    },
  });
  assert.equal(quota.status, 429);
  assert.equal((await quota.json() as any).code, "BROWSER_QUOTA");
  const denied = await handleRequest(
    new Request("https://worker.example/api/health", { headers: { Origin: "https://evil.example" } }),
    env,
  );
  assert.equal(denied.status, 403);
  const preflight = await handleRequest(
    new Request("https://worker.example/api/snapshot", { method: "OPTIONS", headers: { Origin: "http://localhost:5174" } }),
    env,
  );
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), "http://localhost:5174");
});

test("Turnstile validation is mandatory and checks Siteverify hostname", async () => {
  const env = { ...environment(), ENVIRONMENT: "production", DEV_BYPASS_TURNSTILE: "false", TURNSTILE_SECRET_KEY: "secret" };
  await assert.rejects(() => validateTurnstile(env, "", post()), /Complete the verification/i);
  await validateTurnstile(env, "token", post(), async () => Response.json({ success: true, hostname: "localhost" }));
  await assert.rejects(
    () => validateTurnstile(env, "token", post(), async () => Response.json({ success: true, hostname: "evil.example" })),
    /different site/i,
  );
});

test("corrupted KV records are treated as misses", async () => {
  const kv = new MemoryKV();
  const env = environment(kv);
  const id = await cacheKey("https://example.com/");
  const k = keys(id);
  await kv.put(k.status, JSON.stringify({ version: 1, etag: "abcd", bytes: 4 }));
  await kv.put(k.metadata, "{not-json");
  assert.equal(await readCached(env, id), null);
});

test("managed browser sessions close after success, error and timeout", async () => {
  for (const mode of ["success", "error", "timeout"] as const) {
    let closes = 0;
    const browser = { close: async () => { closes++; } };
    const operation = withBrowserSession(
      async () => browser,
      async () => {
        if (mode === "error") throw new Error("boom");
        if (mode === "timeout") throw new DOMException("Timed out", "TimeoutError");
        return "ok";
      },
    );
    if (mode === "success") assert.equal(await operation, "ok");
    else await assert.rejects(operation);
    assert.equal(closes, 1);
  }
});
