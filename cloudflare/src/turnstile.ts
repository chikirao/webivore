import type { Env } from "./types";
import { sha256 } from "./security";

export async function validateTurnstile(
  env: Env,
  token: string,
  request: Request,
  fetcher: typeof fetch = fetch,
) {
  const origin = request.headers.get("Origin") ?? "";
  const developmentBypass = env.ENVIRONMENT === "development" && env.DEV_BYPASS_TURNSTILE === "true" && /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin);
  if (developmentBypass) return;
  if (!env.TURNSTILE_SECRET_KEY) throw Object.assign(new Error("Fresh captures are disabled until Turnstile is configured."), { code: "TURNSTILE_UNAVAILABLE", status: 503 });
  if (!token || token.length > 2048) throw Object.assign(new Error("Complete the verification to create a new capture."), { code: "TURNSTILE_REQUIRED", status: 428 });
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token });
  const response = await fetcher("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body,
    signal: AbortSignal.timeout(5000),
  });
  const result = (await response.json()) as { success?: boolean; hostname?: string; action?: string };
  if (!response.ok || !result.success) throw Object.assign(new Error("Verification failed or expired. Please try again."), { code: "TURNSTILE_INVALID", status: 403 });
  const expectedHostnames = (env.ALLOWED_ORIGINS ?? "").split(",").map((entry) => {
    try { return new URL(entry.trim()).hostname; } catch { return ""; }
  }).filter(Boolean);
  if (result.hostname && expectedHostnames.length && !expectedHostnames.includes(result.hostname))
    throw Object.assign(new Error("Verification was issued for a different site."), { code: "TURNSTILE_INVALID", status: 403 });
}

export async function enforceRateLimit(env: Env, request: Request) {
  if (!env.RATE_LIMIT_SALT) throw Object.assign(new Error("Fresh captures are disabled until rate limiting is configured."), { code: "RATE_LIMIT_UNAVAILABLE", status: 503 });
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const hour = new Date().toISOString().slice(0, 13);
  const digest = await sha256(`${hour}|${ip}|${env.RATE_LIMIT_SALT}`);
  const key = `rate:${hour}:${digest}`;
  const limit = Math.min(10, Math.max(1, Number(env.UNCACHED_CAPTURE_LIMIT) || 3));
  const count = Number((await env.SNAPSHOTS.get(key)) ?? "0");
  if (count >= limit) throw Object.assign(new Error("Too many new captures from this connection. Cached and local levels still work."), { code: "RATE_LIMITED", status: 429 });
  await env.SNAPSHOTS.put(key, String(count + 1), { expirationTtl: 3700 });
}
