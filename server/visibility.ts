import { PNG } from "pngjs";
import type { Piece } from "../src/shared.ts";

// A collider is only valid if hiding that DOM element changes visible pixels.
// This catches transparent elements, occlusion and unpainted captures.
export function visiblePieces<
  T extends Pick<Piece, "x" | "y" | "width" | "height">,
>(pieces: T[], atlas: Buffer, background: Buffer): T[] {
  const before = PNG.sync.read(atlas),
    after = PNG.sync.read(background);
  return pieces.filter((p) => {
    const left = Math.max(0, Math.floor(p.x)),
      top = Math.max(0, Math.floor(p.y));
    const right = Math.min(before.width, Math.ceil(p.x + p.width)),
      bottom = Math.min(before.height, Math.ceil(p.y + p.height));
    const step = Math.max(1, Math.floor(Math.min(p.width, p.height) / 24));
    for (let y = top; y < bottom; y += step)
      for (let x = left; x < right; x += step) {
        const i = (y * before.width + x) * 4;
        if (
          Math.abs(before.data[i] - after.data[i]) +
            Math.abs(before.data[i + 1] - after.data[i + 1]) +
            Math.abs(before.data[i + 2] - after.data[i + 2]) +
            Math.abs(before.data[i + 3] - after.data[i + 3]) >
          24
        )
          return true;
      }
    return false;
  });
}
