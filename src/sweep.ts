/**
 * Endgame sweep. Late in a big page a single forgotten crumb can sit thousands
 * of pixels behind the player. Once most of the page is eaten, pieces that are
 * tiny next to the ball are swept in automatically. They still count exactly
 * once, through the normal pickup path.
 */
export const SWEEP_FROM = 0.97;
/** A crumb's longest side, relative to the ball radius. */
export const CRUMB_SIDE = 0.6;

type Sized = { width: number; height: number; threshold: number };

export function isCrumb(piece: Sized, radius: number, capacity: number) {
  return piece.threshold <= capacity && Math.max(piece.width, piece.height) <= radius * CRUMB_SIDE;
}

/** Remaining pieces to sweep now: every crumb once the page is nearly eaten or only crumbs are left. */
export function crumbsToSweep<T extends Sized>(remaining: T[], eaten: number, total: number, radius: number, capacity: number) {
  const crumbs = remaining.filter((piece) => isCrumb(piece, radius, capacity));
  if (!crumbs.length) return [];
  return crumbs.length === remaining.length || eaten >= total * SWEEP_FROM ? crumbs : [];
}
