import { PNG } from "pngjs";
import { properties, type Piece, type Region } from "../src/shared.ts";

// Every pixel can belong to at most one collectible. Remaining visual content
// (including CSS decoration and nodes beyond the DOM budget) becomes page tiles.
export function partitionPage(
  candidates: Omit<Piece, "mass" | "threshold" | "score" | "growthValue">[],
  buffer: Buffer,
  width: number,
  height: number,
) {
  const png = PNG.sync.read(buffer),
    owned = new Uint8Array(width * height);
  const colors = new Map<number, number>();
  for (let y = 0; y < height; y += 11)
    for (let x = 0; x < width; x += 11) {
      const i = (y * width + x) * 4;
      const color =
        (png.data[i] << 16) | (png.data[i + 1] << 8) | png.data[i + 2];
      colors.set(color, (colors.get(color) || 0) + 1);
    }
  const dominant = [...colors].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0xffffff;
  const bg = [dominant >> 16, (dominant >> 8) & 255, dominant & 255];
  const ink = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return (
      Math.abs(png.data[i] - bg[0]) +
        Math.abs(png.data[i + 1] - bg[1]) +
        Math.abs(png.data[i + 2] - bg[2]) >
      24
    );
  };
  const result: Piece[] = [];
  function claim(
    candidate: Omit<Piece, "mass" | "threshold" | "score" | "growthValue">,
  ) {
    const x0 = Math.max(0, Math.floor(candidate.x)),
      y0 = Math.max(0, Math.floor(candidate.y)),
      x1 = Math.min(width, Math.ceil(candidate.x + candidate.width)),
      y1 = Math.min(height, Math.ceil(candidate.y + candidate.height));
    let visible = false;
    for (let y = y0; y < y1 && !visible; y++)
      for (let x = x0; x < x1; x++)
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
        let rect = previous.get(key);
        if (rect) rect.height++;
        else {
          rect = { x: start, y, width: x - start, height: 1 };
          regions.push(rect);
        }
        next.set(key, rect);
      }
      previous = next;
    }
    const props = properties(candidate.width, candidate.height, candidate.type);
    const ratio = area / Math.max(1, candidate.width * candidate.height);
    result.push({
      ...candidate,
      id: result.length,
      regions,
      ...props,
      mass: props.mass * ratio,
    });
  }
  // Smaller fragments own overlaps first; a parent may only claim the remainder.
  for (const p of [...candidates].sort(
    (a, b) => a.width * a.height - b.width * b.height,
  ))
    claim(p);
  for (let y = 0; y < height; y += 96)
    for (let x = 0; x < width; x += 160)
      claim({
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
      });
  return {
    pieces: result,
    pageColor: `#${dominant.toString(16).padStart(6, "0")}`,
  };
}
