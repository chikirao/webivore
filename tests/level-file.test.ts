import assert from "node:assert/strict";
import test from "node:test";
import { LEVEL_FILE_LIMITS, createLevelFile, parseLevelFile, serializeLevelFile, validateLevelFile } from "../src/level-file";
import type { Level } from "../src/shared";

const level = (): Level => ({
  url: "https://example.com/",
  title: "Example",
  width: 1280,
  height: 900,
  atlas: "data:image/png;base64,AA==",
  background: "",
  coverage: "exclusive",
  pageColor: "#ffffff",
  truncated: false,
  pieces: [
    {
      id: 0,
      tagName: "P",
      text: "Hello",
      x: 10,
      y: 10,
      width: 80,
      height: 30,
      type: "TEXT_BLOCK",
      fontSize: 16,
      backgroundColor: "transparent",
      borderRadius: "0",
      zIndex: "0",
      threshold: 12,
      mass: 1920,
      score: 44,
      growthValue: 125.5,
      regions: [{ x: 10, y: 10, width: 80, height: 30 }],
    },
  ],
});

test("portable level round trip preserves gameplay budget and atlas", () => {
  const original = level();
  const parsed = parseLevelFile(serializeLevelFile(original, { kind: "remote", url: original.url }));
  assert.equal(parsed.level.pieces.length, original.pieces.length);
  assert.equal(parsed.level.width, original.width);
  assert.equal(parsed.level.height, original.height);
  assert.equal(parsed.level.atlas, original.atlas);
  assert.equal(parsed.level.pieces.reduce((sum, piece) => sum + piece.mass, 0), 1920);
  assert.equal(parsed.level.pieces.reduce((sum, piece) => sum + piece.growthValue, 0), 125.5);
});

test("portable level rejects damaged, incompatible and non-finite data", () => {
  assert.throws(() => parseLevelFile("{broken"), /damaged/i);
  assert.throws(() => validateLevelFile({ ...createLevelFile(level()), version: 99 }), /not supported/i);
  const invalid = createLevelFile(level()) as any;
  invalid.level.pieces[0].x = Infinity;
  assert.throws(() => validateLevelFile(invalid), /finite number/i);
});

test("portable level enforces piece and atlas limits", () => {
  const tooMany = createLevelFile(level()) as any;
  tooMany.level.pieces = Array.from({ length: LEVEL_FILE_LIMITS.pieces + 1 }, () => tooMany.level.pieces[0]);
  assert.throws(() => validateLevelFile(tooMany), /more than/i);
  const badAtlas = createLevelFile(level()) as any;
  badAtlas.atlas.dataUrl = "data:text/html;base64,PHNjcmlwdD4=";
  badAtlas.atlas.mimeType = "text/html";
  assert.throws(() => validateLevelFile(badAtlas), /unsupported image/i);
});
