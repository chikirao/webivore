import { cacheKey, readAtlas, readCached, writeCached } from "./cache";
import { capture } from "./capture";
import { normalizeUrl } from "./security";
import { enforceRateLimit, validateTurnstile } from "./turnstile";
import type { CaptureResult, Env } from "./types";

type Dependencies = { capture: typeof capture };
const flights = new Map<string, Promise<CaptureResult>>();
const edgeCache = () => (caches as CacheStorage & { default: Cache }).default;

function allowedOrigin(request: Request, env: Env) {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  const allowed = (env.ALLOWED_ORIGINS ?? "http://localhost:5174,http://127.0.0.1:5174")
    .split(",")
    .map((entry) => entry.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return allowed.includes(origin.replace(/\/$/, "")) ? origin : false;
}

function withCors(response: Response, request: Request, env: Env) {
  const origin = allowedOrigin(request, env);
  const headers = new Headers(response.headers);
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
    headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    headers.set("Access-Control-Max-Age", "86400");
  }
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function json(value: unknown, status = 200, headers: HeadersInit = {}) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

async function boundedJson(request: Request) {
  const declared = Number(request.headers.get("Content-Length") ?? 0);
  if (declared > 4096) throw Object.assign(new Error("Request body is too large."), { status: 413, code: "REQUEST_TOO_LARGE" });
  if (!request.body) return {};
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4096) {
      await reader.cancel();
      throw Object.assign(new Error("Request body is too large."), { status: 413, code: "REQUEST_TOO_LARGE" });
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  } catch {
    throw Object.assign(new Error("Request body must be valid JSON."), { status: 400, code: "BAD_JSON" });
  }
}

async function handlePost(request: Request, env: Env, dependencies: Dependencies) {
  const body = await boundedJson(request);
  const normalized = normalizeUrl(String(body.url ?? "")).href;
  const id = await cacheKey(normalized);
  const cached = await readCached(env, id);
  if (cached) return json({ cache: "hit", snapshot: cached }, 200, { ETag: `"${cached.atlas.etag}"` });

  await validateTurnstile(env, String(body.turnstileToken ?? ""), request);
  await enforceRateLimit(env, request);

  let pending = flights.get(id);
  if (!pending) {
    pending = dependencies.capture(normalized, id, env);
    flights.set(id, pending);
    void pending.finally(() => flights.delete(id)).catch(() => {});
  }
  const result = await pending;
  let snapshot = result.metadata;
  try {
    await writeCached(env, result);
  } catch {
    // KV can fail independently of Browser Run. A POP-local Cache API copy keeps
    // the just-created level usable without base64-expanding a 20 MiB atlas in
    // the 128 MiB Worker isolate. It is deliberately only a best-effort bridge;
    // the next uncached capture may run again if KV remains unavailable.
    const atlasUrl = new URL(snapshot.atlas.url, request.url);
    try {
      const atlasBody = result.atlas.slice().buffer as ArrayBuffer;
      await edgeCache().put(new Request(atlasUrl), new Response(atlasBody, {
        headers: {
          "Content-Type": snapshot.atlas.mimeType,
          "Content-Length": String(result.atlas.byteLength),
          "Cache-Control": "public, max-age=300",
          ETag: `"${snapshot.atlas.etag}"`,
        },
      }));
    } catch {
      throw Object.assign(new Error("The snapshot was captured, but cache storage is temporarily unavailable. Demo and local levels still work."), { code: "CACHE_UNAVAILABLE", status: 503 });
    }
  }
  return json({ cache: "miss", snapshot }, 201, { ETag: `"${snapshot.atlas.etag}"` });
}

async function handleGet(request: Request, env: Env, pathname: string) {
  if (pathname === "/api/health")
    return json({ ok: true, service: "webivore-snapshot", browser: "cloudflare-browser-run", cache: "workers-kv" });
  const match = pathname.match(/^\/api\/snapshot\/([a-f0-9]{64})(?:\/(atlas))?$/);
  if (!match) return json({ error: "Not found.", code: "NOT_FOUND" }, 404);
  const [, id, part] = match;
  if (!part) {
    const metadata = await readCached(env, id);
    if (!metadata) return json({ error: "Cached snapshot not found.", code: "CACHE_MISS" }, 404);
    return json(metadata, 200, { "Cache-Control": "public, max-age=60", ETag: `"${metadata.atlas.etag}"` });
  }
  const found = await readAtlas(env, id);
  if (!found) {
    const fallback = await edgeCache().match(new Request(new URL(`/api/snapshot/${id}/atlas`, request.url))).catch(() => undefined);
    if (!fallback) return json({ error: "Cached atlas not found.", code: "CACHE_MISS" }, 404);
    const etag = fallback.headers.get("ETag");
    if (etag && request.headers.get("If-None-Match") === etag)
      return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": fallback.headers.get("Cache-Control") ?? "public, max-age=300" } });
    return fallback;
  }
  const etag = `"${found.metadata.atlas.etag}"`;
  if (request.headers.get("If-None-Match") === etag)
    return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" } });
  return new Response(found.atlas, {
    headers: {
      "Content-Type": found.metadata.atlas.mimeType,
      "Content-Length": String(found.atlas.byteLength),
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      ETag: etag,
    },
  });
}

export async function handleRequest(request: Request, env: Env, dependencies: Dependencies = { capture }) {
  const url = new URL(request.url);
  const origin = allowedOrigin(request, env);
  if (origin === false) return withCors(json({ error: "Origin is not allowed.", code: "CORS_DENIED" }, 403), request, env);
  try {
    let response: Response;
    if (request.method === "OPTIONS")
      response = new Response(null, { status: 204, headers: { "Cache-Control": "public, max-age=86400" } });
    else if (request.method === "GET") response = await handleGet(request, env, url.pathname);
    else if (request.method === "POST" && url.pathname === "/api/snapshot")
      response = await handlePost(request, env, dependencies);
    else response = json({ error: "Not found.", code: "NOT_FOUND" }, 404);
    return withCors(response, request, env);
  } catch (error) {
    const tagged = error as Error & { status?: number; code?: string };
    const status = tagged.status ?? (/private|public URL|port|credentials|valid public/i.test(tagged.message) ? 400 : 422);
    return withCors(
      json({ error: tagged.message.split("\n")[0].slice(0, 240), code: tagged.code ?? "SNAPSHOT_FAILED" }, status),
      request,
      env,
    );
  }
}

export default {
  fetch(request: Request, env: Env) {
    return handleRequest(request, env);
  },
} satisfies ExportedHandler<Env>;
