import type { Piece } from "./shared";
import { PRIORITY_LIMIT } from "./packing";

export { PRIORITY_LIMIT };
export function isGraphic(p: Piece) {
  return p.type === "IMAGE" || !!p.imageUrl || /^(IMG|SVG|CANVAS|VIDEO)$/.test(p.tagName);
}
/** Graphics outrank text; among graphics, larger wins. Small or batched text never qualifies. */
export function highlightScore(p: Piece) {
  if (!isGraphic(p) && (p.regions || p.width * p.height < 12000)) return 0;
  return (isGraphic(p) ? 1e6 : 0) + Math.sqrt(p.width * p.height);
}
/** Bounded selection: graphics beat text; equally valuable later pickups replace older ones. */
export function highlightSlot(scores: number[], score: number) {
  if (!score) return -1;
  if (scores.length < PRIORITY_LIMIT) return scores.length;
  const weakest = Math.min(...scores);
  return score >= weakest ? scores.indexOf(weakest) : -1;
}
