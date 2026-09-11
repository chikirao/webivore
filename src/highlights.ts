import type { Piece } from './shared';

export const HIGHLIGHT_LIMIT = 16;
export function isGraphic(p: Piece) {
  return p.type === 'IMAGE' || !!p.imageUrl || /^(IMG|SVG|CANVAS|VIDEO)$/.test(p.tagName);
}
export function highlightScore(p: Piece) {
  if (!isGraphic(p) && (p.regions || p.width * p.height < 12000)) return 0;
  return (isGraphic(p) ? 1e6 : 0) + Math.sqrt(p.width * p.height);
}
/** Bounded selection: graphics beat text; equally valuable later pickups replace older ones. */
export function highlightSlot(scores: number[], score: number) {
  if (!score) return -1;
  if (scores.length < HIGHLIGHT_LIMIT) return scores.length;
  const weakest = Math.min(...scores);
  return score >= weakest ? scores.indexOf(weakest) : -1;
}
