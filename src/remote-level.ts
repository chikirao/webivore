import { buildLevel } from "./level-builder-client";
import type { Level } from "./shared";
import type { SnapshotApiResponse } from "./snapshot-types";

export class SnapshotError extends Error {
  constructor(
    message: string,
    public code = "SNAPSHOT_FAILED",
    public status = 0,
  ) {
    super(message);
  }
}

export function normalizePublicUrl(value: string) {
  const input = value.trim();
  const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
    throw new Error("Use a public HTTP or HTTPS address without a password.");
  if (!url.hostname.includes(".") && url.hostname !== "localhost")
    throw new Error("Enter a public website, for example example.com.");
  url.hash = "";
  if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80"))
    url.port = "";
  return url.href;
}

export function snapshotApiUrl(path: string) {
  const configured = String(import.meta.env.VITE_SNAPSHOT_API_URL ?? "").trim().replace(/\/$/, "");
  if (!configured) return path;
  return `${configured}${path.startsWith("/") ? path : `/${path}`}`;
}

function isLegacyLevel(value: unknown): value is Level {
  const candidate = value as Partial<Level> | null;
  return !!candidate && typeof candidate === "object" && typeof candidate.atlas === "string" && Array.isArray(candidate.pieces);
}

export async function loadRemoteLevel(value: string, options: { signal?: AbortSignal; turnstileToken?: string } = {}) {
  const url = normalizePublicUrl(value);
  const response = await fetch(snapshotApiUrl("/api/snapshot"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, ...(options.turnstileToken ? { turnstileToken: options.turnstileToken } : {}) }),
    signal: options.signal,
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const code = typeof payload.code === "string" ? payload.code : "SNAPSHOT_FAILED";
    const fallback = code === "BROWSER_QUOTA"
      ? "Fresh website captures are unavailable until Cloudflare's free quota resets. Demo, cached and local levels still work."
      : code === "TURNSTILE_REQUIRED"
        ? "Please verify this new capture."
        : "Could not load website.";
    throw new SnapshotError(typeof payload.error === "string" ? payload.error : fallback, code, response.status);
  }
  if (isLegacyLevel(payload)) return { level: payload, cache: "miss" as const, degraded: false, snapshotId: undefined };
  const result = payload as unknown as SnapshotApiResponse;
  if (!result.snapshot || !["hit", "miss"].includes(result.cache))
    throw new SnapshotError("The snapshot service returned an incompatible response.", "BAD_RESPONSE", 502);
  const atlasUrl = result.snapshot.atlas.dataUrl ?? new URL(result.snapshot.atlas.url, snapshotApiUrl("/api/")).href;
  const atlasResponse = await fetch(atlasUrl, { signal: options.signal });
  if (!atlasResponse.ok) throw new SnapshotError("The cached atlas is unavailable. Try the capture again.", "ATLAS_MISSING", atlasResponse.status);
  const declared = Number(atlasResponse.headers.get("content-length"));
  if (declared > 24 * 1024 * 1024) throw new SnapshotError("The captured atlas is too large.", "ATLAS_TOO_LARGE", 413);
  const atlas = await atlasResponse.arrayBuffer();
  if (atlas.byteLength > 24 * 1024 * 1024) throw new SnapshotError("The captured atlas is too large.", "ATLAS_TOO_LARGE", 413);
  const level = await buildLevel({ kind: "snapshot", snapshot: result.snapshot, atlas }, options.signal);
  return { level, cache: result.cache, degraded: result.snapshot.degraded === true, snapshotId: result.snapshot.id };
}
