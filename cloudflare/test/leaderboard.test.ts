import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import test from "node:test";
import { cacheKey, writeCached } from "../src/cache";
import { handleRequest } from "../src/index";
import { board, cleanNickname, finishRun, minimumSeconds, register, startRun } from "../src/leaderboard";
import { CAPTURE_PROFILE, EXTRACTOR_VERSION, LEVEL_FORMAT_VERSION, type Env } from "../src/types";

/** Minimal D1 surface backed by real SQLite, so the SQL itself is exercised. */
class FakeD1 {
  db = new DatabaseSync(":memory:");
  constructor() {
    this.db.exec(readFileSync(new URL("../migrations/0001_leaderboard.sql", import.meta.url), "utf8"));
  }
  prepare(sql: string) {
    const statement = this.db.prepare(sql);
    const bound = (params: unknown[]) => ({
      sql,
      bind: (...next: unknown[]) => bound(next),
      first: async () => { const row = statement.get(...(params as never[])); return row ? { ...row } : null; },
      all: async () => ({ results: statement.all(...(params as never[])).map((row) => ({ ...row })) }),
      run: async () => ({ results: [], meta: { changes: Number((statement as StatementSync).run(...(params as never[])).changes) } }),
    });
    return bound([]);
  }
  async batch(statements: ReturnType<FakeD1["prepare"]>[]) {
    this.db.exec("BEGIN");
    try {
      const results = [];
      for (const s of statements) results.push(/^\s*(WITH|SELECT)/i.test(s.sql) ? await s.all() : await s.run());
      this.db.exec("COMMIT");
      return results;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}

class MemoryKV {
  values = new Map<string, string | Uint8Array>();
  async get(key: string, type?: string) {
    const value = this.values.get(key);
    if (value === undefined) return null;
    if (type === "arrayBuffer") return typeof value === "string" ? new TextEncoder().encode(value).buffer : value.buffer;
    const text = typeof value === "string" ? value : new TextDecoder().decode(value);
    return type === "json" ? JSON.parse(text) : text;
  }
  async put(key: string, value: string | Uint8Array) {
    this.values.set(key, value);
  }
}

const environment = (withDatabase = true): Env =>
  ({
    SNAPSHOTS: new MemoryKV() as unknown as KVNamespace,
    LEADERBOARD: withDatabase ? (new FakeD1() as unknown as D1Database) : undefined,
    BROWSER: {} as Fetcher,
    ENVIRONMENT: "development",
    DEV_BYPASS_TURNSTILE: "true",
    RATE_LIMIT_SALT: "test-only-salt",
    ALLOWED_ORIGINS: "http://localhost:5174",
  }) as Env;

async function capture(env: Env, url: string, candidates = 400) {
  const id = await cacheKey(url);
  await writeCached(env, {
    atlas: new Uint8Array([1, 2, 3]),
    metadata: {
      id,
      url,
      title: "Example",
      width: 1280,
      height: 900,
      candidates: Array.from({ length: candidates }, (_, i) => ({ id: i, tagName: "P", text: "", x: 0, y: 0, width: 10, height: 10, type: "TEXT", fontSize: 12, backgroundColor: "", borderRadius: "", zIndex: "" })),
      truncated: false,
      atlas: { url: `/api/snapshot/${id}/atlas`, mimeType: "image/jpeg", bytes: 3, etag: "abcd" },
      profile: CAPTURE_PROFILE,
      extractorVersion: EXTRACTOR_VERSION,
      levelFormatVersion: LEVEL_FORMAT_VERSION,
    },
  });
  return id;
}

const request = (token?: string, ip = "203.0.113.9", agent = "Test Browser") =>
  new Request("https://worker.example/api", {
    headers: { Origin: "http://localhost:5174", "CF-Connecting-IP": ip, "User-Agent": agent, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });

const T0 = Date.UTC(2026, 8, 25, 10);

async function eat(env: Env, token: string, url: string, at: number, pieces = 300) {
  const snapshotId = await capture(env, url);
  const run = await startRun(env, request(), { snapshotId }, at);
  return finishRun(env, request(token), run.runId, { runToken: run.runToken, pieces, seconds: 60 }, at + 90_000);
}

test("nicknames are normalised, bounded and resist lookalike impersonation", () => {
  assert.equal(cleanNickname("  Кролик   01 ").nickname, "Кролик 01");
  for (const bad of ["ab", "x".repeat(17), "<script>", "_lead", "admin", "Аdmin", "ADM1N", "NULL", "Hit1er_fan"])
    assert.throws(() => cleanNickname(bad), /Nickname|Use letters|different/, bad);
  assert.equal(cleanNickname("GrapeFruit").nickname, "GrapeFruit");
});

test("nickname uniqueness ignores case, separators and Cyrillic lookalikes", async () => {
  const env = environment();
  await register(env, request(), { nickname: "Bunny_Bite" }, T0);
  for (const clash of ["bunnybite", "BUNNY.BITE", "Вunny bite"])
    await assert.rejects(register(env, request(undefined, "198.51.100.1"), { nickname: clash }, T0), { code: "NICKNAME_TAKEN" });
});

test("one browser can mint only a few nicknames per day", async () => {
  const env = environment();
  for (const name of ["one_eater", "two_eater", "three_eater"]) await register(env, request(), { nickname: name, device: "Europe/Moscow|390x844" }, T0);
  await assert.rejects(register(env, request(), { nickname: "four_eater", device: "Europe/Moscow|390x844" }, T0), { code: "PLAYER_LIMIT" });
  await register(env, request(), { nickname: "four_eater", device: "Europe/Moscow|390x844" }, T0 + 25 * 3_600_000);
});

test("runs only open on captured websites and cannot finish faster than the page allows", async () => {
  const env = environment();
  const { token } = await register(env, request(), { nickname: "speedy" }, T0);
  await assert.rejects(startRun(env, request(), { snapshotId: "a".repeat(64) }, T0), { code: "RUN_INVALID" });
  const snapshotId = await capture(env, "https://en.wikipedia.org/wiki/Internet", 1500);
  const run = await startRun(env, request(), { snapshotId }, T0);
  assert.equal(minimumSeconds(1500), 75);
  const early = await finishRun(env, request(token), run.runId, { runToken: run.runToken, pieces: 1500, seconds: 30 }, T0 + 30_000);
  assert.deepEqual([early.counted, "code" in early && early.code], [false, "RUN_TOO_FAST"]);
  await assert.rejects(finishRun(env, request(token), run.runId, { runToken: run.runToken, pieces: 1500, seconds: 80 }, T0 + 90_000), { code: "RUN_FINISHED" });

  const second = await startRun(env, request(), { snapshotId }, T0);
  await assert.rejects(finishRun(env, request(token), second.runId, { runToken: "wrong-token-value-123", pieces: 10, seconds: 80 }, T0 + 90_000), { code: "RUN_INVALID" });
  await assert.rejects(finishRun(env, request("AAAAAAAAAAAA.forgedforgedforged"), second.runId, { runToken: second.runToken, pieces: 10, seconds: 80 }, T0 + 90_000), { code: "PLAYER_UNKNOWN" });
  const inflated = await finishRun(env, request(token), second.runId, { runToken: second.runToken, pieces: 999_999, seconds: 80 }, T0 + 90_000);
  assert.equal(inflated.counted, false);
});

test("boards rank distinct sites per day and all time", async () => {
  const env = environment();
  const a = await register(env, request(), { nickname: "alpha" }, T0);
  const b = await register(env, request(undefined, "198.51.100.2", "Other"), { nickname: "bravo" }, T0);

  const first = await eat(env, a.token, "https://www.example.com/", T0);
  assert.ok(first.counted && first.newSite && first.newToday);
  const again = await eat(env, a.token, "https://example.com/other", T0 + 1000);
  assert.ok(again.counted && !again.newSite && !again.newToday, "www and paths on one host are one site");
  await eat(env, a.token, "https://news.ycombinator.com/", T0 + 2000);
  const bravo = await eat(env, b.token, "https://example.org/", T0 + 3000, 900);
  assert.ok(bravo.counted);
  assert.deepEqual(bravo.today, { nickname: "bravo", sites: 1, pieces: 900, rank: 2 });

  const today = await board(env, "day", 10, b.player.id, T0 + 5000);
  assert.deepEqual(today.rows.map((r) => [r.rank, r.nickname, r.sites]), [[1, "alpha", 2], [2, "bravo", 1]]);
  assert.equal(today.players, 2);
  assert.equal(today.me?.rank, 2);

  const tomorrow = T0 + 24 * 3_600_000;
  await eat(env, b.token, "https://example.net/", tomorrow);
  const nextDay = await board(env, "day", 10, null, tomorrow + 1000);
  assert.deepEqual(nextDay.rows.map((r) => [r.nickname, r.sites]), [["bravo", 1]]);
  const allTime = await board(env, "all", 10, a.player.id, tomorrow + 1000);
  // Tied on sites, bravo leads on pieces eaten.
  assert.deepEqual(allTime.rows.map((r) => [r.nickname, r.sites, r.pieces]), [["bravo", 2, 1200], ["alpha", 2, 600]]);
  assert.equal(allTime.me?.rank, 2);
});

test("HTTP layer: CORS allows bearer auth and a missing database degrades clearly", async () => {
  const env = environment(false);
  const preflight = await handleRequest(new Request("https://worker.example/api/runs", { method: "OPTIONS", headers: { Origin: "http://localhost:5174" } }), env);
  assert.match(preflight.headers.get("Access-Control-Allow-Headers") ?? "", /Authorization/);
  const response = await handleRequest(new Request("https://worker.example/api/leaderboard", { headers: { Origin: "http://localhost:5174" } }), env);
  assert.equal(response.status, 503);
  assert.equal((await response.json() as { code: string }).code, "LEADERBOARD_UNAVAILABLE");

  const live = environment();
  const created = await handleRequest(new Request("https://worker.example/api/players", {
    method: "POST",
    headers: { Origin: "http://localhost:5174", "Content-Type": "application/json" },
    body: JSON.stringify({ nickname: "http_eater" }),
  }), live);
  assert.equal(created.status, 201);
  const { token } = await created.json() as { token: string };
  const me = await handleRequest(new Request("https://worker.example/api/players/me", { headers: { Origin: "http://localhost:5174", Authorization: `Bearer ${token}` } }), live);
  assert.deepEqual((await me.json() as { player: { nickname: string } }).player.nickname, "http_eater");
});
