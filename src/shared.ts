export type Region = { x: number; y: number; width: number; height: number };
export type Piece = {
  regions?: Region[];
  id: number;
  tagName: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: string;
  fontSize: number;
  backgroundColor: string;
  borderRadius: string;
  zIndex: string;
  href?: string;
  imageUrl?: string;
  threshold: number;
  mass: number;
  score: number;
  growthValue: number;
};
export type Level = {
  url: string;
  title: string;
  width: number;
  height: number;
  atlas: string;
  background: string;
  pieces: Piece[];
  truncated: boolean;
  coverage?: "exclusive";
  pageColor?: string;
  sourceElementCount?: number;
};
export function properties(width: number, height: number, type: string) {
  const density = /IMAGE|VIDEO|CARD/.test(type)
    ? 1.25
    : /SECTION|HERO|FOOTER/.test(type)
      ? 1.6
      : 0.8;
  const mass = width * height * density;
  return {
    mass,
    threshold: Math.max(12, Math.sqrt(mass) * 0.24),
    score: Math.ceil(Math.sqrt(mass)),
    growthValue: mass * 0.065,
  };
}
export function maxCollectionRadius(count: number) {
  return Math.min(360, Math.max(65, 18 * Math.cbrt(count)));
}
// Growth is a finite level-wide budget. More DOM objects do not mean infinite size.
export function balancePieces<T extends Piece>(pieces: T[]): T[] {
  const budget = maxCollectionRadius(pieces.length) ** 2;
  const weight = pieces.reduce(
    (n, p) => n + Math.pow(Math.max(1, p.mass), 0.6),
    0,
  );
  for (const p of pieces)
    p.growthValue =
      (budget * Math.pow(Math.max(1, p.mass), 0.6)) / Math.max(1, weight);
  let area = 225;
  for (const p of [...pieces].sort((a, b) => a.threshold - b.threshold)) {
    p.threshold = Math.min(p.threshold, Math.sqrt(area) * 0.98);
    area += p.growthValue;
  }
  return pieces;
}
