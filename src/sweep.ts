/**
 * Endgame sweep. Late in a big page a single forgotten comma or a hairline
 * rule can sit thousands of pixels behind the player. Once most of the page
 * is eaten, pieces that are negligible next to the ball are swept in
 * automatically, and when what is left weighs next to nothing the whole rest
 * goes. They still count exactly once, through the normal pickup path.
 */
/** Share of the page's mass after which crumbs are swept. */
export const SWEEP_FROM = 0.9;
/** A crumb's size (square root of its area, so thin lines count as small), relative to the ball radius. */
export const CRUMB_SIZE = 0.5;
/** When everything left weighs at most this share of the page, it is all swept and the page is cleared. */
export const LEFTOVER = 0.015;

type Sized = { width: number; height: number; threshold: number; mass?: number };

const massOf = (p: Sized) => p.mass ?? p.width * p.height;

export function isCrumb(piece: Sized, radius: number, capacity: number) {
  return piece.threshold <= capacity && Math.sqrt(piece.width * piece.height) <= radius * CRUMB_SIZE;
}

/** Remaining pieces to sweep now. `eaten` and `total` are masses. */
export function crumbsToSweep<T extends Sized>(remaining: T[], eaten: number, total: number, radius: number, capacity: number) {
  if (!remaining.length) return [];
  const left = remaining.reduce((s, p) => s + massOf(p), 0);
  if (left <= total * LEFTOVER) return remaining.filter((p) => p.threshold <= capacity);
  const crumbs = remaining.filter((piece) => isCrumb(piece, radius, capacity));
  if (!crumbs.length) return [];
  return crumbs.length === remaining.length || eaten >= total * SWEEP_FROM ? crumbs : [];
}
