import { CAPTURE_PROFILE, EXTRACTOR_VERSION, LEVEL_FORMAT_VERSION, type CaptureResult, type Env, type SnapshotMetadata } from "./types";
import { sha256 } from "./security";

const STATUS_VERSION = 1;
const ttl = (env: Env) => Math.min(30 * 86400, Math.max(7 * 86400, Number(env.CACHE_TTL_SECONDS) || 14 * 86400));
export const keys = (id: string) => ({ status: `status:${id}`, metadata: `metadata:${id}`, atlas: `atlas:${id}` });

export function cacheKey(url: string) {
  return sha256([url, CAPTURE_PROFILE, EXTRACTOR_VERSION, LEVEL_FORMAT_VERSION].join("\n"));
}

function validMetadata(value: unknown, id: string): value is SnapshotMetadata {
  const item = value as Partial<SnapshotMetadata> | null;
  return !!item && item.id === id && item.profile === CAPTURE_PROFILE && item.extractorVersion === EXTRACTOR_VERSION && item.levelFormatVersion === LEVEL_FORMAT_VERSION && Array.isArray(item.candidates) && !!item.atlas?.etag;
}

export async function readCached(env: Env, id: string) {
  try {
    const k = keys(id);
    const status = await env.SNAPSHOTS.get(k.status, "json") as { version?: number; etag?: string; bytes?: number } | null;
    if (!status || status.version !== STATUS_VERSION || !status.etag || !status.bytes) return null;
    const metadata = await env.SNAPSHOTS.get(k.metadata, "json");
    if (!validMetadata(metadata, id) || metadata.atlas.etag !== status.etag || metadata.atlas.bytes !== status.bytes) return null;
    return metadata;
  } catch {
    return null;
  }
}

export async function writeCached(env: Env, result: CaptureResult) {
  const k = keys(result.metadata.id);
  const options = { expirationTtl: ttl(env) };
  await env.SNAPSHOTS.put(k.metadata, JSON.stringify(result.metadata), options);
  await env.SNAPSHOTS.put(k.atlas, result.atlas, options);
  await env.SNAPSHOTS.put(k.status, JSON.stringify({ version: STATUS_VERSION, etag: result.metadata.atlas.etag, bytes: result.atlas.byteLength }), options);
}

export async function readAtlas(env: Env, id: string) {
  const metadata = await readCached(env, id);
  if (!metadata) return null;
  try {
    const atlas = await env.SNAPSHOTS.get(keys(id).atlas, "arrayBuffer");
    if (!atlas || atlas.byteLength !== metadata.atlas.bytes) return null;
    return { metadata, atlas };
  } catch {
    return null;
  }
}
