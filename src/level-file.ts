import type { Level, Piece } from "./shared";

export const LEVEL_FILE_FORMAT = "webivore-level" as const;
export const LEVEL_FILE_VERSION = 1 as const;
export const LEVEL_FILE_LIMITS = {
  fileBytes: 25 * 1024 * 1024,
  atlasCharacters: 23 * 1024 * 1024,
  pieces: 12_000,
  width: 4096,
  height: 12_000,
  coordinate: 24_000,
  text: 500,
} as const;

export type LevelSource = {
  kind: "remote" | "html" | "image" | "demo";
  url?: string;
  fileName?: string;
  degraded?: boolean;
};

export type WebivoreLevelFile = {
  format: typeof LEVEL_FILE_FORMAT;
  version: typeof LEVEL_FILE_VERSION;
  createdAt?: string;
  source: LevelSource;
  level: Omit<Level, "atlas" | "background">;
  atlas: { mimeType: "image/png" | "image/jpeg" | "image/webp"; dataUrl: string };
  background?:
    | { kind: "atlas" }
    | {
        kind: "embedded";
        mimeType: "image/png" | "image/jpeg" | "image/webp";
        dataUrl: string;
      };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

function finite(value: unknown, label: string, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max)
    throw new Error(`${label} must be a finite number between ${min} and ${max}.`);
  return value;
}

function shortString(
  value: unknown,
  label: string,
  max: number = LEVEL_FILE_LIMITS.text,
) {
  if (typeof value !== "string" || value.length > max)
    throw new Error(`${label} must be a string no longer than ${max} characters.`);
  return value;
}

function imageData(value: unknown, label: string) {
  if (!isRecord(value)) throw new Error(`${label} is missing.`);
  const mimeType = shortString(value.mimeType, `${label}.mimeType`, 32);
  if (!(["image/png", "image/jpeg", "image/webp"] as string[]).includes(mimeType))
    throw new Error(`${label} uses an unsupported image type.`);
  const dataUrl = shortString(value.dataUrl, `${label}.dataUrl`, LEVEL_FILE_LIMITS.atlasCharacters);
  const prefix = `data:${mimeType};base64,`;
  if (!dataUrl.startsWith(prefix) || !/^[A-Za-z0-9+/]*={0,2}$/.test(dataUrl.slice(prefix.length)))
    throw new Error(`${label} is not a valid base64 image data URL.`);
  return { mimeType, dataUrl } as WebivoreLevelFile["atlas"];
}

function validatePiece(value: unknown, index: number): Piece {
  if (!isRecord(value)) throw new Error(`Piece ${index} is invalid.`);
  const label = `Piece ${index}`;
  const piece: Piece = {
    id: Math.trunc(finite(value.id, `${label}.id`, 0, LEVEL_FILE_LIMITS.pieces * 4)),
    tagName: shortString(value.tagName, `${label}.tagName`, 32),
    text: shortString(value.text, `${label}.text`),
    x: finite(value.x, `${label}.x`, 0, LEVEL_FILE_LIMITS.coordinate),
    y: finite(value.y, `${label}.y`, 0, LEVEL_FILE_LIMITS.coordinate),
    width: finite(value.width, `${label}.width`, 0.5, LEVEL_FILE_LIMITS.width),
    height: finite(value.height, `${label}.height`, 0.5, LEVEL_FILE_LIMITS.height),
    type: shortString(value.type, `${label}.type`, 40),
    fontSize: finite(value.fontSize, `${label}.fontSize`, 0, 1000),
    backgroundColor: shortString(value.backgroundColor, `${label}.backgroundColor`, 100),
    borderRadius: shortString(value.borderRadius, `${label}.borderRadius`, 100),
    zIndex: shortString(value.zIndex, `${label}.zIndex`, 40),
    threshold: finite(value.threshold, `${label}.threshold`, 0, LEVEL_FILE_LIMITS.coordinate),
    mass: finite(value.mass, `${label}.mass`, 0, 1e12),
    score: finite(value.score, `${label}.score`, 0, 1e9),
    growthValue: finite(value.growthValue, `${label}.growthValue`, 0, 1e12),
  };
  if (value.href !== undefined) piece.href = shortString(value.href, `${label}.href`, 2048);
  if (value.imageUrl !== undefined)
    piece.imageUrl = shortString(value.imageUrl, `${label}.imageUrl`, 4096);
  if (value.regions !== undefined) {
    if (!Array.isArray(value.regions) || value.regions.length > 2048)
      throw new Error(`${label}.regions is too large.`);
    piece.regions = value.regions.map((region, regionIndex) => {
      if (!isRecord(region)) throw new Error(`${label}.regions[${regionIndex}] is invalid.`);
      return {
        x: finite(region.x, `${label}.regions[${regionIndex}].x`, 0, LEVEL_FILE_LIMITS.coordinate),
        y: finite(region.y, `${label}.regions[${regionIndex}].y`, 0, LEVEL_FILE_LIMITS.coordinate),
        width: finite(region.width, `${label}.regions[${regionIndex}].width`, 0.5, LEVEL_FILE_LIMITS.width),
        height: finite(region.height, `${label}.regions[${regionIndex}].height`, 0.5, LEVEL_FILE_LIMITS.height),
      };
    });
  }
  return piece;
}

export function levelSource(level: Level): LevelSource {
  if (level.url.startsWith("demo:")) return { kind: "demo", url: level.url };
  if (level.url.startsWith("local-html:")) return { kind: "html", fileName: level.title };
  if (level.url.startsWith("local-image:")) return { kind: "image", fileName: level.title };
  return { kind: "remote", url: level.url };
}

export function createLevelFile(level: Level, source = levelSource(level)): WebivoreLevelFile {
  const { atlas, background, ...portableLevel } = level;
  const mimeType = (/^data:(image\/(?:png|jpeg|webp));base64,/.exec(atlas)?.[1] ??
    "image/png") as WebivoreLevelFile["atlas"]["mimeType"];
  const backgroundEntry = !background
    ? undefined
    : background === atlas
      ? ({ kind: "atlas" } as const)
      : ({
          kind: "embedded" as const,
          mimeType: (/^data:(image\/(?:png|jpeg|webp));base64,/.exec(background)?.[1] ??
            "image/png") as WebivoreLevelFile["atlas"]["mimeType"],
          dataUrl: background,
        } as const);
  return {
    format: LEVEL_FILE_FORMAT,
    version: LEVEL_FILE_VERSION,
    createdAt: new Date().toISOString(),
    source,
    level: portableLevel,
    atlas: { mimeType, dataUrl: atlas },
    ...(backgroundEntry ? { background: backgroundEntry } : {}),
  };
}

export function validateLevelFile(value: unknown): { file: WebivoreLevelFile; level: Level } {
  if (!isRecord(value)) throw new Error("This is not a WEBIVORE level file.");
  if (value.format !== LEVEL_FILE_FORMAT) throw new Error("This file is not a WEBIVORE level.");
  if (value.version !== LEVEL_FILE_VERSION)
    throw new Error(`WEBIVORE level version ${String(value.version)} is not supported.`);
  if (!isRecord(value.source)) throw new Error("The level source metadata is missing.");
  const kind = value.source.kind;
  if (!["remote", "html", "image", "demo"].includes(String(kind)))
    throw new Error("The level source type is invalid.");
  const source: LevelSource = { kind: kind as LevelSource["kind"] };
  if (value.source.url !== undefined) source.url = shortString(value.source.url, "source.url", 2048);
  if (value.source.fileName !== undefined)
    source.fileName = shortString(value.source.fileName, "source.fileName", 260);
  if (value.source.degraded !== undefined) source.degraded = value.source.degraded === true;
  if (!isRecord(value.level)) throw new Error("The level data is missing.");
  if (!Array.isArray(value.level.pieces) || value.level.pieces.length === 0)
    throw new Error("The level contains no collectible pieces.");
  if (value.level.pieces.length > LEVEL_FILE_LIMITS.pieces)
    throw new Error(`The level contains more than ${LEVEL_FILE_LIMITS.pieces} pieces.`);
  const atlas = imageData(value.atlas, "atlas");
  let background = "";
  let backgroundEntry: WebivoreLevelFile["background"];
  if (value.background !== undefined) {
    if (!isRecord(value.background)) throw new Error("background is invalid.");
    if (value.background.kind === "atlas") {
      background = atlas.dataUrl;
      backgroundEntry = { kind: "atlas" };
    } else if (value.background.kind === "embedded") {
      const image = imageData(value.background, "background");
      background = image.dataUrl;
      backgroundEntry = { kind: "embedded", ...image };
    } else throw new Error("background kind is invalid.");
  }
  const width = finite(value.level.width, "level.width", 64, LEVEL_FILE_LIMITS.width);
  const height = finite(value.level.height, "level.height", 64, LEVEL_FILE_LIMITS.height);
  const pieces = value.level.pieces.map(validatePiece);
  for (const [index, piece] of pieces.entries()) {
    if (piece.x + piece.width > width + 1 || piece.y + piece.height > height + 1)
      throw new Error(`Piece ${index} extends outside the level.`);
    for (const region of piece.regions ?? [])
      if (region.x + region.width > width + 1 || region.y + region.height > height + 1)
        throw new Error(`Piece ${index} has a region outside the level.`);
  }
  const level: Level = {
    url: shortString(value.level.url, "level.url", 2048),
    title: shortString(value.level.title, "level.title", 300),
    width,
    height,
    atlas: atlas.dataUrl,
    background,
    pieces,
    truncated: value.level.truncated === true,
  };
  if (value.level.coverage !== undefined) {
    if (value.level.coverage !== "exclusive") throw new Error("level.coverage is invalid.");
    level.coverage = "exclusive";
  }
  if (value.level.pageColor !== undefined)
    level.pageColor = shortString(value.level.pageColor, "level.pageColor", 100);
  if (value.level.sourceElementCount !== undefined)
    level.sourceElementCount = finite(
      value.level.sourceElementCount,
      "level.sourceElementCount",
      0,
      1_000_000,
    );
  const file: WebivoreLevelFile = {
    format: LEVEL_FILE_FORMAT,
    version: LEVEL_FILE_VERSION,
    ...(typeof value.createdAt === "string" ? { createdAt: shortString(value.createdAt, "createdAt", 64) } : {}),
    source,
    level: { ...level, atlas: undefined, background: undefined } as unknown as WebivoreLevelFile["level"],
    atlas,
    ...(backgroundEntry ? { background: backgroundEntry } : {}),
  };
  delete (file.level as Partial<Level>).atlas;
  delete (file.level as Partial<Level>).background;
  return { file, level };
}

export function serializeLevelFile(level: Level, source?: LevelSource) {
  const file = createLevelFile(level, source);
  validateLevelFile(file);
  const json = JSON.stringify(file);
  if (new TextEncoder().encode(json).byteLength > LEVEL_FILE_LIMITS.fileBytes)
    throw new Error("This level is too large to export as a portable file.");
  return json;
}

export function parseLevelFile(text: string) {
  if (new TextEncoder().encode(text).byteLength > LEVEL_FILE_LIMITS.fileBytes)
    throw new Error(`Level files are limited to ${LEVEL_FILE_LIMITS.fileBytes / 1024 / 1024} MB.`);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("The level file is damaged or is not valid JSON.");
  }
  return validateLevelFile(value);
}

export function downloadLevelFile(level: Level, source?: LevelSource) {
  const blob = new Blob([serializeLevelFile(level, source)], { type: "application/json" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const slug = (level.title || "level").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  anchor.href = href;
  anchor.download = `${slug || "level"}.webivore.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(href), 0);
}
