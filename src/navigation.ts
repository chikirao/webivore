import type { Piece } from "./shared";

export const GUIDE_STORAGE_KEY = "webivore:played";

/** Storage can be unavailable in private browsing; guidance still works in memory. */
export class PickupGuide {
  enabled = true;
  private automatic = true;
  private recorded = false;
  private limit: number;
  constructor(private storage?: Pick<Storage, "getItem" | "setItem">) {
    let returning = false;
    try {
      returning = storage?.getItem(GUIDE_STORAGE_KEY) === "1";
    } catch {
      /* optional persistence */
    }
    this.limit = returning ? 1 : 3;
    this.recorded = returning;
  }
  toggle() {
    this.enabled = !this.enabled;
    this.automatic = false;
  }
  collected(total: number) {
    if (total > 0 && !this.recorded) {
      this.recorded = true;
      try {
        this.storage?.setItem(GUIDE_STORAGE_KEY, "1");
      } catch {
        /* optional persistence */
      }
    }
    if (this.automatic && total >= this.limit) this.enabled = false;
  }
}

/** Distance to actual collectible regions, rather than a potentially empty bounding box. */
export function nearestCollectible<T extends Piece & { gone: boolean }>(
  items: T[],
  x: number,
  y: number,
  capacity: number,
) {
  let best: { item: T; x: number; y: number; distance: number } | undefined;
  for (const item of items) {
    if (item.gone || item.threshold > capacity) continue;
    for (const r of item.regions ?? [item]) {
      const tx = Math.max(r.x, Math.min(x, r.x + r.width));
      const ty = Math.max(r.y, Math.min(y, r.y + r.height));
      const distance = Math.hypot(tx - x, ty - y);
      if (!best || distance < best.distance)
        best = { item, x: tx, y: ty, distance };
    }
  }
  return best;
}

/** One scale on both axes; page edges may leave the window, player never does. */
export function localMap(width: number, height: number, x: number, y: number) {
  const scale = Math.min(width, height) / 700;
  return { scale, x: width / 2 - x * scale, y: height / 2 - y * scale };
}
