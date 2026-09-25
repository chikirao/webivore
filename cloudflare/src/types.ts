export const CAPTURE_PROFILE = "desktop-1280x900-v1" as const;
export const EXTRACTOR_VERSION = "safe-dom-v2" as const;
export const LEVEL_FORMAT_VERSION = 1 as const;

export type Candidate = {
  id: number;
  tagName: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: string;
  fontSize: number;
  backgroundColor: string;
  borderRadius: string;
  zIndex: string;
  imageUrl?: string;
};

export type SnapshotMetadata = {
  id: string;
  url: string;
  title: string;
  width: number;
  height: number;
  candidates: Candidate[];
  truncated: boolean;
  sourceElementCount?: number;
  degraded?: boolean;
  degradationReason?: string;
  atlas: {
    url: string;
    mimeType: "image/jpeg";
    bytes: number;
    etag: string;
    dataUrl?: string;
  };
  profile: typeof CAPTURE_PROFILE;
  extractorVersion: typeof EXTRACTOR_VERSION;
  levelFormatVersion: typeof LEVEL_FORMAT_VERSION;
};

export interface Env {
  BROWSER: Fetcher;
  SNAPSHOTS: KVNamespace;
  LEADERBOARD?: D1Database;
  TURNSTILE_SECRET_KEY?: string;
  RATE_LIMIT_SALT?: string;
  ALLOWED_ORIGINS?: string;
  CACHE_TTL_SECONDS?: string;
  UNCACHED_CAPTURE_LIMIT?: string;
  ENVIRONMENT?: string;
  DEV_BYPASS_TURNSTILE?: string;
}

export type CaptureResult = { metadata: SnapshotMetadata; atlas: Uint8Array };
