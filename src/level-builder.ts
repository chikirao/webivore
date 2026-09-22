import { balancePieces, properties, type Piece, type Region } from "./shared";
import type { CaptureCandidate } from "./snapshot-types";

export type SemanticBlock = {
  kind: "title" | "heading" | "paragraph" | "link" | "list" | "control" | "image";
  text: string;
  imageDataUrl?: string;
  alt?: string;
};

export type LayoutItem = CaptureCandidate & { lines: string[]; imageDataUrl?: string };

const clean = (value: string, max = 500) => value.replace(/\s+/g, " ").trim().slice(0, max);

export function layoutSemanticBlocks(blocks: SemanticBlock[], width = 1280) {
  const items: LayoutItem[] = [];
  const margin = 72;
  let y = 58;
  const addText = (block: SemanticBlock, fontSize: number, type: string, weight: "normal" | "bold") => {
    const text = clean(block.text);
    if (!text) return;
    const available = width - margin * 2;
    const chars = Math.max(10, Math.floor(available / (fontSize * 0.58)));
    const words = text.split(" ");
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      if (line && `${line} ${word}`.length > chars) {
        lines.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
      if (lines.length >= 10) break;
    }
    if (line && lines.length < 10) lines.push(line);
    const lineHeight = Math.round(fontSize * 1.3);
    const height = Math.max(lineHeight, lines.length * lineHeight) + 16;
    items.push({
      id: items.length,
      tagName: block.kind === "heading" || block.kind === "title" ? "H1" : "P",
      text,
      x: margin,
      y,
      width: available,
      height,
      type,
      fontSize,
      backgroundColor: block.kind === "control" ? "#ff2b19" : "transparent",
      borderRadius: "0",
      zIndex: "0",
      lines,
    });
    y += height + (weight === "bold" ? 26 : 14);
  };
  const limited = blocks.slice(0, 800);
  for (const block of limited) {
    if (block.kind === "image" && block.imageDataUrl) {
      const height = 420;
      items.push({
        id: items.length,
        tagName: "IMG",
        text: clean(block.alt || block.text || "Imported image"),
        x: margin,
        y,
        width: width - margin * 2,
        height,
        type: "IMAGE",
        fontSize: 16,
        backgroundColor: "#e5e1d8",
        borderRadius: "0",
        zIndex: "0",
        lines: [],
        imageDataUrl: block.imageDataUrl,
      });
      y += height + 28;
      continue;
    }
    if (block.kind === "title") addText(block, 64, "HERO", "bold");
    else if (block.kind === "heading") addText(block, 42, "HERO", "bold");
    else if (block.kind === "control") addText(block, 24, "BUTTON", "bold");
    else if (block.kind === "link") addText(block, 22, "LINK", "normal");
    else addText(block, 22, "TEXT_BLOCK", "normal");
    if (y > 8900) break;
  }
  return { items, height: Math.max(900, Math.min(9000, y + 70)), width };
}

export function partitionPixels(
  candidates: CaptureCandidate[],
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
) {
  if (rgba.length !== width * height * 4) throw new Error("Atlas pixel data has the wrong size.");
  const owned = new Uint8Array(width * height);
  const colors = new Map<number, number>();
  for (let y = 0; y < height; y += 13)
    for (let x = 0; x < width; x += 13) {
      const i = (y * width + x) * 4;
      const color = (rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2];
      colors.set(color, (colors.get(color) ?? 0) + 1);
    }
  const dominant = [...colors].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0xffffff;
  const bg = [dominant >> 16, (dominant >> 8) & 255, dominant & 255];
  const ink = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return rgba[i + 3] > 8 && Math.abs(rgba[i] - bg[0]) + Math.abs(rgba[i + 1] - bg[1]) + Math.abs(rgba[i + 2] - bg[2]) > 24;
  };
  const result: Piece[] = [];
  const claim = (candidate: CaptureCandidate, requireInk: boolean) => {
    const x0 = Math.max(0, Math.floor(candidate.x));
    const y0 = Math.max(0, Math.floor(candidate.y));
    const x1 = Math.min(width, Math.ceil(candidate.x + candidate.width));
    const y1 = Math.min(height, Math.ceil(candidate.y + candidate.height));
    if (x1 <= x0 || y1 <= y0) return;
    let visible = !requireInk;
    for (let y = y0; y < y1 && !visible; y += 2)
      for (let x = x0; x < x1; x += 2)
        if (!owned[y * width + x] && ink(x, y)) {
          visible = true;
          break;
        }
    if (!visible) return;
    const regions: Region[] = [];
    let previous = new Map<string, Region>();
    let area = 0;
    for (let y = y0; y < y1; y++) {
      const next = new Map<string, Region>();
      let x = x0;
      while (x < x1) {
        while (x < x1 && owned[y * width + x]) x++;
        const start = x;
        while (x < x1 && !owned[y * width + x]) {
          owned[y * width + x] = 1;
          x++;
        }
        if (x === start) continue;
        area += x - start;
        const key = `${start}:${x}`;
        const existing = previous.get(key);
        if (existing) existing.height++;
        else regions.push({ x: start, y, width: x - start, height: 1 });
        next.set(key, existing ?? regions[regions.length - 1]);
      }
      previous = next;
    }
    if (!area) return;
    const props = properties(candidate.width, candidate.height, candidate.type);
    result.push({
      ...candidate,
      id: result.length,
      regions,
      ...props,
      mass: props.mass * (area / Math.max(1, candidate.width * candidate.height)),
    });
  };
  for (const candidate of [...candidates]
    .filter((candidate) => Number.isFinite(candidate.x + candidate.y + candidate.width + candidate.height))
    .slice(0, 10_000)
    .sort((a, b) => a.width * a.height - b.width * b.height))
    claim(candidate, true);
  for (let y = 0; y < height; y += 96)
    for (let x = 0; x < width; x += 160)
      claim(
        {
          id: 0,
          tagName: "PAGE",
          text: "Page fragment",
          x,
          y,
          width: Math.min(160, width - x),
          height: Math.min(96, height - y),
          type: "PAGE_FRAGMENT",
          fontSize: 16,
          backgroundColor: "transparent",
          borderRadius: "0",
          zIndex: "0",
        },
        false,
      );
  return {
    pieces: balancePieces(result),
    pageColor: `#${dominant.toString(16).padStart(6, "0")}`,
  };
}

export function imagePiecePlan(width: number, height: number) {
  const pieces: Piece[] = [];
  const bands = [
    { until: 0.16, size: 48 },
    { until: 0.38, size: 80 },
    { until: 0.68, size: 112 },
    { until: 1, size: 160 },
  ];
  let y = 0;
  for (const band of bands) {
    const end = Math.min(height, Math.max(y, Math.round(height * band.until)));
    for (; y < end; y += band.size) {
      const row = Math.floor(y / band.size);
      const offset = row % 2 ? Math.floor(band.size / 2) : 0;
      for (let x = -offset; x < width; x += band.size) {
        const left = Math.max(0, x);
        const right = Math.min(width, x + band.size);
        if (right - left < 8) continue;
        const pieceWidth = right - left;
        const pieceHeight = Math.min(band.size, end - y);
        const base = {
          id: pieces.length,
          tagName: "IMG",
          text: `Image fragment ${pieces.length + 1}`,
          x: left,
          y,
          width: pieceWidth,
          height: pieceHeight,
          type: band.size >= 112 ? "IMAGE" : "PAGE_FRAGMENT",
          fontSize: 16,
          backgroundColor: "transparent",
          borderRadius: "0",
          zIndex: "0",
        };
        pieces.push({ ...base, regions: [{ x: left, y, width: pieceWidth, height: pieceHeight }], ...properties(pieceWidth, pieceHeight, base.type) });
      }
    }
  }
  return balancePieces(pieces);
}
