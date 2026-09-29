/**
 * Empty page background. Areas with no piece on them can never be eaten, so
 * once a late game has torn the content around them away they stand out as
 * white islands and margins that look collectable. A coarse grid tracks which
 * cells still hold pixels of a live piece — its exact regions, not its bounding
 * box, which would keep whole empty stretches alive. After each bite the empty
 * cells nearby clear, and further out so does any empty cell with no live
 * content left around it (page margins, blank columns, gaps between blocks).
 */
type Rect = { x: number; y: number; width: number; height: number };
type Shape = Rect & { regions?: Rect[] };

export const CELL = 48;

export class EmptyCells {
  cols: number;
  rows: number;
  /** Live piece regions overlapping each cell. */
  live: Uint32Array;
  cleared: Uint8Array;
  constructor(
    public width: number,
    public height: number,
    pieces: Shape[],
  ) {
    this.cols = Math.max(1, Math.ceil(width / CELL));
    this.rows = Math.max(1, Math.ceil(height / CELL));
    this.live = new Uint32Array(this.cols * this.rows);
    this.cleared = new Uint8Array(this.cols * this.rows);
    for (const p of pieces) for (const r of p.regions ?? [p]) this.each(r, 0, (i) => this.live[i]++);
  }
  private each(r: Rect, grow: number, fn: (i: number, cx: number, cy: number) => void) {
    const c0 = Math.max(0, Math.floor((r.x - grow) / CELL)),
      c1 = Math.min(this.cols - 1, Math.floor((r.x + r.width + grow - 0.001) / CELL)),
      r0 = Math.max(0, Math.floor((r.y - grow) / CELL)),
      r1 = Math.min(this.rows - 1, Math.floor((r.y + r.height + grow - 0.001) / CELL));
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) fn(cy * this.cols + cx, cx, cy);
  }
  /** A piece was eaten: its cells lose its live regions. */
  eaten(p: Shape) {
    for (const r of p.regions ?? [p]) this.each(r, 0, (i) => (this.live[i] = Math.max(0, this.live[i] - 1)));
  }
  /**
   * Empty, not yet cleared cells to tear away after a bite at `r`, merged into
   * horizontal runs so a wide margin becomes a few rectangles, not dozens:
   *  - every empty cell within `reach`;
   *  - within `2 × reach + 4 cells`, every empty cell whose neighbourhood of
   *    `max(2 cells, 0.8 × reach)` holds no live content any more.
   */
  clearNear(r: Rect, reach: number): Rect[] {
    const far = reach * 2 + CELL * 4;
    const m = Math.max(2, Math.ceil((reach * 0.8) / CELL));
    const c0 = Math.max(0, Math.floor((r.x - far) / CELL)),
      c1 = Math.min(this.cols - 1, Math.floor((r.x + r.width + far - 0.001) / CELL)),
      r0 = Math.max(0, Math.floor((r.y - far) / CELL)),
      r1 = Math.min(this.rows - 1, Math.floor((r.y + r.height + far - 0.001) / CELL));
    const n0 = Math.floor((r.x - reach) / CELL),
      n1 = Math.floor((r.x + r.width + reach - 0.001) / CELL),
      m0 = Math.floor((r.y - reach) / CELL),
      m1 = Math.floor((r.y + r.height + reach - 0.001) / CELL);
    // live-cell prefix sums over the window grown by m, for O(1) box queries
    const x0 = Math.max(0, c0 - m),
      x1 = Math.min(this.cols - 1, c1 + m),
      y0 = Math.max(0, r0 - m),
      y1 = Math.min(this.rows - 1, r1 + m);
    const w = x1 - x0 + 2;
    const sum = new Uint32Array(w * (y1 - y0 + 2));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const k = (y - y0 + 1) * w + (x - x0 + 1);
        sum[k] = (this.live[y * this.cols + x] ? 1 : 0) + sum[k - 1] + sum[k - w] - sum[k - w - 1];
      }
    const liveAround = (cx: number, cy: number) => {
      const ax = Math.max(x0, cx - m) - x0,
        bx = Math.min(x1, cx + m) - x0 + 1,
        ay = Math.max(y0, cy - m) - y0,
        by = Math.min(y1, cy + m) - y0 + 1;
      return sum[by * w + bx] - sum[ay * w + bx] - sum[by * w + ax] + sum[ay * w + ax];
    };
    const runs: Rect[] = [];
    for (let cy = r0; cy <= r1; cy++) {
      let run: Rect | undefined;
      for (let cx = c0; cx <= c1; cx++) {
        const i = cy * this.cols + cx;
        const near = cx >= n0 && cx <= n1 && cy >= m0 && cy <= m1;
        if (this.live[i] || this.cleared[i] || !(near || liveAround(cx, cy) === 0)) {
          run = undefined;
          continue;
        }
        this.cleared[i] = 1;
        const x = cx * CELL,
          y = cy * CELL,
          cw = Math.min(CELL, this.width - x),
          ch = Math.min(CELL, this.height - y);
        if (run) run.width += cw;
        else {
          run = { x, y, width: cw, height: ch };
          runs.push(run);
        }
      }
    }
    return runs;
  }
}
