import { readCached } from "./cache";
import { sha256 } from "./security";
import { validateTurnstile } from "./turnstile";
import type { Env } from "./types";

/**
 * Leaderboard on D1. Players are anonymous (nickname + bearer secret held by
 * the browser); a "site" is a distinct hostname cleared to 100%. Completion is
 * only credited through a server-timed run opened on a cached snapshot, so a
 * forged request still has to reference a real capture and wait out a
 * plausible playing time.
 */

export type Period = "day" | "all";
type Row = { nickname: string; sites: number; pieces: number };
type Standing = Row & { rank: number };

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const RUN_LIFETIME = 6 * HOUR;
const RUN_STARTS_PER_HOUR = 60;
const PLAYERS_PER_DEVICE_PER_DAY = 3;
const PLAYERS_PER_NETWORK_PER_DAY = 10;
const BOARD_CACHE_SECONDS = 20;

const fail = (status: number, code: string, message: string) =>
  Object.assign(new Error(message), { status, code });

export const utcDay = (now: number) => new Date(now).toISOString().slice(0, 10);

export function siteHost(url: string) {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
}

/** Minimum wall-clock time to clear a page with this many candidates. */
export function minimumSeconds(candidates: number) {
  return Math.max(20, Math.min(candidates, 4000) * 0.05);
}

// Lookalikes collapse so "Аdmin" (Cyrillic А), "ADM1N" and "admin" collide;
// uppercase I and lowercase l are indistinguishable in many fonts.
const confusables: Record<string, string> = { а: "a", в: "b", е: "e", ё: "e", к: "k", м: "m", н: "h", о: "o", р: "p", с: "c", т: "t", у: "y", х: "x", "0": "o", "1": "i", l: "i", "3": "e" };
const reserved = new Set(["admin", "administrator", "moderator", "mod", "webivore", "system", "cloudflare", "anonymous", "null", "undefined", "you"].map(nicknameKey));
const rude = ["fuck", "shit", "cunt", "nigg", "fag", "nazi", "hitler", "хуй", "хуе", "хуя", "пизд", "ебл", "ебат", "ебан", "бляд", "пидор", "шлюх"];

export function nicknameKey(nickname: string) {
  return [...nickname.toLowerCase().replace(/[\s._-]+/g, "")].map((ch) => confusables[ch] ?? ch).join("");
}

export function cleanNickname(value: unknown) {
  const nickname = String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
  const length = [...nickname].length;
  if (length < 3 || length > 16)
    throw fail(400, "NICKNAME_LENGTH", "Nickname must be 3–16 characters.");
  if (!/^[\p{L}\p{N}][\p{L}\p{N}_.\- ]*$/u.test(nickname))
    throw fail(400, "NICKNAME_CHARS", "Use letters, digits, spaces, dots, dashes or underscores.");
  const key = nicknameKey(nickname);
  const compact = nickname.toLowerCase().replace(/[\s._-]+/g, "");
  if (reserved.has(key) || rude.some((word) => compact.includes(word) || key.includes(nicknameKey(word))))
    throw fail(400, "NICKNAME_REJECTED", "Pick a different nickname.");
  return { nickname, key };
}

function randomId(bytes: number) {
  const buffer = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...buffer)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function database(env: Env) {
  if (!env.LEADERBOARD) throw fail(503, "LEADERBOARD_UNAVAILABLE", "The leaderboard is not configured yet.");
  if (!env.RATE_LIMIT_SALT) throw fail(503, "LEADERBOARD_UNAVAILABLE", "The leaderboard is not configured yet.");
  return { db: env.LEADERBOARD, salt: env.RATE_LIMIT_SALT };
}

const secretHash = (salt: string, secret: string) => sha256(`token|${salt}|${secret}`);
const networkHash = (salt: string, request: Request) =>
  sha256(`ip|${salt}|${request.headers.get("CF-Connecting-IP") ?? "unknown"}`);

/**
 * Browser traits are only used to cap how many nicknames one device can mint.
 * They are hashed together with a server secret and never stored in clear.
 */
function deviceHash(salt: string, request: Request, device: unknown) {
  const traits = [
    request.headers.get("User-Agent") ?? "",
    request.headers.get("Accept-Language") ?? "",
    request.headers.get("CF-IPCountry") ?? "",
    String(device ?? "").slice(0, 200),
  ].join("|");
  return sha256(`device|${salt}|${traits}`);
}

async function authenticate(env: Env, request: Request) {
  const { db, salt } = database(env);
  const header = request.headers.get("Authorization") ?? "";
  const match = header.match(/^Bearer ([A-Za-z0-9_-]{8,32})\.([A-Za-z0-9_-]{16,64})$/);
  if (!match) return null;
  const player = await db
    .prepare("SELECT id, nickname, token_hash FROM players WHERE id = ?")
    .bind(match[1])
    .first<{ id: string; nickname: string; token_hash: string }>();
  if (!player || player.token_hash !== (await secretHash(salt, match[2]))) return null;
  return { id: player.id, nickname: player.nickname };
}

async function requirePlayer(env: Env, request: Request) {
  const player = await authenticate(env, request);
  if (!player) throw fail(401, "PLAYER_UNKNOWN", "Your nickname session expired. Pick a nickname again.");
  return player;
}

function tally(period: Period) {
  return period === "day"
    ? "SELECT player_id, COUNT(*) AS sites, SUM(pieces) AS pieces, MAX(first_at) AS last_at FROM meals WHERE day = ? GROUP BY player_id"
    : "SELECT player_id, COUNT(*) AS sites, SUM(pieces) AS pieces, MAX(first_at) AS last_at FROM player_sites GROUP BY player_id";
}
const better =
  "t.sites > me.sites OR (t.sites = me.sites AND (t.pieces > me.pieces OR (t.pieces = me.pieces AND t.last_at < me.last_at)))";

async function standing(db: D1Database, period: Period, day: string, playerId: string): Promise<Standing | null> {
  const params = period === "day" ? [day, playerId] : [playerId];
  const row = await db
    .prepare(
      `WITH t AS (${tally(period)}), me AS (SELECT * FROM t WHERE player_id = ?)
       SELECT p.nickname, me.sites, me.pieces, (SELECT 1 + COUNT(*) FROM t WHERE ${better}) AS rank
       FROM me JOIN players p ON p.id = me.player_id`,
    )
    .bind(...params)
    .first<Standing>();
  return row ?? null;
}

export async function board(env: Env, period: Period, limit: number, playerId: string | null, now = Date.now()) {
  const { db } = database(env);
  const day = utcDay(now);
  const params = period === "day" ? [day] : [];
  const [top, count] = await db.batch<Row & { total?: number }>([
    db
      .prepare(
        `WITH t AS (${tally(period)})
         SELECT p.nickname, t.sites, t.pieces FROM t JOIN players p ON p.id = t.player_id
         ORDER BY t.sites DESC, t.pieces DESC, t.last_at ASC LIMIT ?`,
      )
      .bind(...params, limit),
    db.prepare(`WITH t AS (${tally(period)}) SELECT COUNT(*) AS total FROM t`).bind(...params),
  ]);
  const rows = top.results.map((row, index) => ({ rank: index + 1, nickname: row.nickname, sites: row.sites, pieces: row.pieces }));
  const me = playerId ? await standing(db, period, day, playerId) : null;
  return { period, day, players: Number(count.results[0]?.total ?? 0), rows, me };
}

export async function register(env: Env, request: Request, body: Record<string, unknown>, now = Date.now()) {
  const { db, salt } = database(env);
  const { nickname, key } = cleanNickname(body.nickname);
  try {
    await validateTurnstile(env, String(body.turnstileToken ?? ""), request);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "TURNSTILE_REQUIRED" || code === "TURNSTILE_INVALID")
      throw fail(code === "TURNSTILE_REQUIRED" ? 428 : 403, code, "Finish the quick check, then claim your nickname.");
    throw error;
  }
  const [device, network] = await Promise.all([deviceHash(salt, request, body.device), networkHash(salt, request)]);
  const since = now - DAY;
  const [byDevice, byNetwork, taken] = await db.batch<{ n: number }>([
    db.prepare("SELECT COUNT(*) AS n FROM players WHERE device_hash = ? AND created_at > ?").bind(device, since),
    db.prepare("SELECT COUNT(*) AS n FROM players WHERE ip_hash = ? AND created_at > ?").bind(network, since),
    db.prepare("SELECT COUNT(*) AS n FROM players WHERE nickname_key = ?").bind(key),
  ]);
  if (Number(taken.results[0]?.n) > 0) throw fail(409, "NICKNAME_TAKEN", "That nickname is already taken.");
  if (Number(byDevice.results[0]?.n) >= PLAYERS_PER_DEVICE_PER_DAY || Number(byNetwork.results[0]?.n) >= PLAYERS_PER_NETWORK_PER_DAY)
    throw fail(429, "PLAYER_LIMIT", "Too many new nicknames from this browser today.");
  const id = randomId(12);
  const secret = randomId(24);
  try {
    await db
      .prepare("INSERT INTO players (id, nickname, nickname_key, token_hash, device_hash, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(id, nickname, key, await secretHash(salt, secret), device, network, now)
      .run();
  } catch (error) {
    if (/UNIQUE/i.test((error as Error).message)) throw fail(409, "NICKNAME_TAKEN", "That nickname is already taken.");
    throw error;
  }
  return { player: { id, nickname }, token: `${id}.${secret}` };
}

export async function rename(env: Env, request: Request, body: Record<string, unknown>) {
  const { db } = database(env);
  const player = await requirePlayer(env, request);
  const { nickname, key } = cleanNickname(body.nickname);
  try {
    await db.prepare("UPDATE players SET nickname = ?, nickname_key = ? WHERE id = ?").bind(nickname, key, player.id).run();
  } catch (error) {
    if (/UNIQUE/i.test((error as Error).message)) throw fail(409, "NICKNAME_TAKEN", "That nickname is already taken.");
    throw error;
  }
  return { player: { id: player.id, nickname } };
}

export async function startRun(env: Env, request: Request, body: Record<string, unknown>, now = Date.now()) {
  const { db, salt } = database(env);
  const snapshotId = String(body.snapshotId ?? "");
  if (!/^[a-f0-9]{64}$/.test(snapshotId)) throw fail(400, "RUN_INVALID", "Unknown level.");
  const snapshot = await readCached(env, snapshotId);
  if (!snapshot) throw fail(404, "RUN_INVALID", "Only captured websites count for the leaderboard.");
  const network = await networkHash(salt, request);
  const recent = await db
    .prepare("SELECT COUNT(*) AS n FROM runs WHERE ip_hash = ? AND started_at > ?")
    .bind(network, now - HOUR)
    .first<{ n: number }>();
  if (Number(recent?.n) >= RUN_STARTS_PER_HOUR) throw fail(429, "RUN_LIMIT", "Too many runs from this connection.");
  const candidates = snapshot.candidates.length;
  const id = randomId(12);
  const secret = randomId(24);
  const statements = [
    db
      .prepare("INSERT INTO runs (id, token_hash, snapshot_id, host, url, title, pieces_max, min_seconds, ip_hash, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, await secretHash(salt, secret), snapshotId, siteHost(snapshot.url), snapshot.url, snapshot.title.slice(0, 200), Math.max(1000, candidates * 20), minimumSeconds(candidates), network, now),
  ];
  // Abandoned runs expire; sweep occasionally instead of on a schedule.
  if (Math.random() < 0.05)
    statements.push(db.prepare("DELETE FROM runs WHERE finished_at IS NULL AND started_at < ?").bind(now - DAY));
  await db.batch(statements);
  return { runId: id, runToken: secret, host: siteHost(snapshot.url) };
}

export async function finishRun(env: Env, request: Request, runId: string, body: Record<string, unknown>, now = Date.now()) {
  const { db, salt } = database(env);
  const player = await requirePlayer(env, request);
  const run = await db
    .prepare("SELECT token_hash, host, pieces_max, min_seconds, started_at, finished_at FROM runs WHERE id = ?")
    .bind(runId)
    .first<{ token_hash: string; host: string; pieces_max: number; min_seconds: number; started_at: number; finished_at: number | null }>();
  if (!run || run.token_hash !== (await secretHash(salt, String(body.runToken ?? ""))))
    throw fail(404, "RUN_INVALID", "This run is not recognised.");
  if (run.finished_at !== null) throw fail(409, "RUN_FINISHED", "This run was already counted.");
  const elapsed = (now - run.started_at) / 1000;
  const pieces = Number(body.pieces);
  const seconds = Number(body.seconds);
  const reject = (code: string, message: string) => ({ counted: false as const, code, message });
  let verdict: ReturnType<typeof reject> | null = null;
  if (elapsed * 1000 > RUN_LIFETIME) verdict = reject("RUN_EXPIRED", "This run is too old to count.");
  else if (!Number.isInteger(pieces) || pieces < 1 || pieces > run.pieces_max) verdict = reject("RUN_REJECTED", "The result does not match this website.");
  else if (!Number.isFinite(seconds) || seconds <= 0 || seconds > elapsed + 10) verdict = reject("RUN_REJECTED", "The result does not match this run.");
  else if (elapsed < run.min_seconds) verdict = reject("RUN_TOO_FAST", "That was faster than this page can be eaten.");
  const closed = await db
    .prepare("UPDATE runs SET finished_at = ?, player_id = ?, seconds = ?, pieces = ? WHERE id = ? AND finished_at IS NULL")
    .bind(now, player.id, Number.isFinite(seconds) ? seconds : null, Number.isInteger(pieces) ? pieces : null, runId)
    .run();
  if (!closed.meta.changes) throw fail(409, "RUN_FINISHED", "This run was already counted.");
  if (verdict) return verdict;

  const day = utcDay(now);
  const best = Math.min(seconds, elapsed);
  const [seenEver, seenToday] = await db.batch<{ n: number }>([
    db.prepare("SELECT COUNT(*) AS n FROM player_sites WHERE player_id = ? AND host = ?").bind(player.id, run.host),
    db.prepare("SELECT COUNT(*) AS n FROM meals WHERE player_id = ? AND host = ? AND day = ?").bind(player.id, run.host, day),
  ]);
  await db.batch([
    db
      .prepare(
        `INSERT INTO meals (player_id, host, day, first_at, best_seconds, pieces) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (player_id, host, day) DO UPDATE SET best_seconds = MIN(best_seconds, excluded.best_seconds), pieces = MAX(pieces, excluded.pieces)`,
      )
      .bind(player.id, run.host, day, now, best, pieces),
    db
      .prepare(
        `INSERT INTO player_sites (player_id, host, first_at, best_seconds, pieces) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (player_id, host) DO UPDATE SET best_seconds = MIN(best_seconds, excluded.best_seconds), pieces = MAX(pieces, excluded.pieces)`,
      )
      .bind(player.id, run.host, now, best, pieces),
  ]);
  const [today, all] = await Promise.all([standing(db, "day", day, player.id), standing(db, "all", day, player.id)]);
  return {
    counted: true as const,
    host: run.host,
    newSite: !Number(seenEver.results[0]?.n),
    newToday: !Number(seenToday.results[0]?.n),
    today,
    all,
  };
}

const edgeCache = () => (globalThis as { caches?: CacheStorage & { default?: Cache } }).caches?.default;

/** Returns null for paths outside the leaderboard API. */
export async function routeLeaderboard(
  request: Request,
  env: Env,
  url: URL,
  readBody: () => Promise<Record<string, unknown>>,
): Promise<Response | null> {
  const { pathname } = url;
  const json = (value: unknown, status = 200, cache = "no-store") =>
    Response.json(value, { status, headers: { "Cache-Control": cache } });
  if (request.method === "GET" && pathname === "/api/leaderboard") {
    const period: Period = url.searchParams.get("period") === "all" ? "all" : "day";
    const limit = Math.min(50, Math.max(1, Math.trunc(Number(url.searchParams.get("limit")) || 20)));
    const signedIn = request.headers.has("Authorization");
    const player = signedIn ? await authenticate(env, request) : null;
    const key = new Request(`https://leaderboard.cache/${period}/${limit}`);
    if (!signedIn) {
      const hit = await edgeCache()?.match(key).catch(() => undefined);
      if (hit) return hit;
    }
    const response = json(await board(env, period, limit, player?.id ?? null), 200, signedIn ? "private, no-store" : `public, max-age=${BOARD_CACHE_SECONDS}`);
    if (!signedIn) await edgeCache()?.put(key, response.clone()).catch(() => {});
    return response;
  }
  if (request.method === "GET" && pathname === "/api/players/me") {
    const player = await requirePlayer(env, request);
    return json({ player });
  }
  if (request.method !== "POST") return null;
  if (pathname === "/api/players") return json(await register(env, request, await readBody()), 201);
  if (pathname === "/api/players/me") return json(await rename(env, request, await readBody()));
  if (pathname === "/api/runs") return json(await startRun(env, request, await readBody()), 201);
  const finish = pathname.match(/^\/api\/runs\/([A-Za-z0-9_-]{8,32})\/finish$/);
  if (finish) return json(await finishRun(env, request, finish[1], await readBody()));
  return null;
}
