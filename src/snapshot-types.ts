import type { Piece } from "./shared";

export const CAPTURE_PROFILE = "desktop-1280x900-v1";
export const EXTRACTOR_VERSION = "safe-dom-v2";
export const LEVEL_FORMAT_VERSION = 1;

export type CaptureCandidate = Omit<
  Piece,
  "mass" | "threshold" | "score" | "growthValue" | "regions"
>;

export type SnapshotMetadata = {
  id: string;
  url: string;
  title: string;
  width: number;
  height: number;
  candidates: CaptureCandidate[];
  truncated: boolean;
  sourceElementCount?: number;
  degraded?: boolean;
  degradationReason?: string;
  atlas: {
    url: string;
    mimeType: "image/png" | "image/jpeg" | "image/webp";
    bytes: number;
    etag: string;
    dataUrl?: string;
  };
  profile: typeof CAPTURE_PROFILE;
  extractorVersion: typeof EXTRACTOR_VERSION;
  levelFormatVersion: typeof LEVEL_FORMAT_VERSION;
};

export type SnapshotApiResponse = {
  cache: "hit" | "miss";
  snapshot: SnapshotMetadata;
};
