import type { Piece } from "./shared";
import { isGraphic } from './highlights';

/** Persistent spatial index; gone pieces stay indexed but never participate again. */
export class PickupIndex<T extends Piece & { gone: boolean }> {
  cells = new Map<string, T[]>();
  constructor(
    pieces: T[],
    public cellSize = 128,
  ) {
    for (const p of pieces) {
      for (
        let y = Math.floor(p.y / cellSize);
        y <= Math.floor((p.y + p.height) / cellSize);
        y++
      )
        for (
          let x = Math.floor(p.x / cellSize);
          x <= Math.floor((p.x + p.width) / cellSize);
          x++
        ) {
          const key = `${x},${y}`;
          const cell = this.cells.get(key) ?? [];
          cell.push(p);
          this.cells.set(key, cell);
        }
    }
  }
  near(x: number, y: number, radius: number): T[] {
    const found = new Set<T>();
    for (
      let cy = Math.floor((y - radius) / this.cellSize);
      cy <= Math.floor((y + radius) / this.cellSize);
      cy++
    )
      for (
        let cx = Math.floor((x - radius) / this.cellSize);
        cx <= Math.floor((x + radius) / this.cellSize);
        cx++
      )
        for (const p of this.cells.get(`${cx},${cy}`) ?? [])
          if (!p.gone) found.add(p);
    return [...found];
  }
  group(seed: T, radius: number, capacity: number): T[] {
    // A stable minority remains individual at every size; no flickering regrouping.
    const chance = Math.min(0.8, Math.max(0, (radius - 35) / 100));
    const hash = ((Math.imul(seed.id + 1, 2654435761) >>> 0) % 1000) / 1000;
    if (isGraphic(seed) || hash >= chance || Math.sqrt(seed.width * seed.height) > radius)
      return [seed];
    const range = Math.min(220, 24 + radius * 0.85);
    const x = seed.x + seed.width / 2,
      y = seed.y + seed.height / 2;
    const members = this.near(x, y, range).filter(
      (p) =>
        p !== seed &&
        !isGraphic(p) &&
        p.threshold <= capacity &&
        Math.sqrt(p.width * p.height) <= radius &&
        Math.hypot(p.x + p.width / 2 - x, p.y + p.height / 2 - y) <= range &&
        p.id % 5 !== 0,
    );
    members.sort(
      (a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y),
    );
    return [seed, ...members.slice(0, Math.min(17, Math.floor(radius / 9)))];
  }
}

export function combinedPiece(members: Piece[]): Piece {
  const x = Math.min(...members.map((p) => p.x)),
    y = Math.min(...members.map((p) => p.y));
  return {
    ...members[0],
    x,
    y,
    width: Math.max(...members.map((p) => p.x + p.width)) - x,
    height: Math.max(...members.map((p) => p.y + p.height)) - y,
    regions: members.flatMap(
      (p) =>
        p.regions ?? [{ x: p.x, y: p.y, width: p.width, height: p.height }],
    ),
    mass: members.reduce((n, p) => n + p.mass, 0),
    growthValue: members.reduce((n, p) => n + p.growthValue, 0),
    score: members.reduce((n, p) => n + p.score, 0),
    threshold: Math.max(...members.map((p) => p.threshold)),
    text:
      members.length > 1
        ? `${members.length} pieces · one big bite`
        : members[0].text,
  };
}
