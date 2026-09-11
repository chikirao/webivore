export const LAYER_SIZE = 48;
// A complete Fibonacci sphere, visited in a coprime permutation. Latitude and
// longitude no longer derive from the same fractional golden-ratio sequence.
export function attachmentDirection(index: number): [number, number, number] {
  const layer = Math.floor(index / LAYER_SIZE),
    j = ((index % LAYER_SIZE) * 17) % LAYER_SIZE;
  const y = 1 - (2 * (j + 0.5)) / LAYER_SIZE,
    angle = j * Math.PI * (3 - Math.sqrt(5)) + layer * 1.137;
  const r = Math.sqrt(1 - y * y);
  return [Math.cos(angle) * r, y, Math.sin(angle) * r];
}
