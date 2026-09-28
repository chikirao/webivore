/**
 * Empty page background. Areas with no piece on them can never be eaten, so
 * once a late game has torn the content around them away they stand out as
 * white islands that look collectable. A coarse grid tracks which cells still
 * touch a live piece; after each bite the empty cells nearby are cleared too,
 * reaching further as the ball grows.
 */
type Rect = { x: number; y: number; width: number; height: number };

export const CELL = 48;

export class EmptyCells {
  cols: number;
  rows: number;
  /** Live pieces overlapping each cell. */
  live: Uint16Array;
  cleared: Uint8Array;
  constructor(
    public width: number,
    public height: number,
    pieces: Rect[],
  ) {
    this.cols = Math.max(1, Math.ceil(width / CELL));
    this.rows = Math.max(1, Math.ceil(height / CELL));
    this.live = new Uint16Array(this.cols * this.rows);
    this.cleared = new Uint8Array(this.cols * this.rows);
    for (const p of pieces) this.each(p, 0, (i) => (this.live[i] = Math.min(65535, this.live[i] + 1)));
  }
  private each(r: Rect, grow: number, fn: (i: number, cx: number, cy: number) => void) {
    const c0 = Math.max(0, Math.floor((r.x - grow) / CELL)),
      c1 = Math.min(this.cols - 1, Math.floor((r.x + r.width + grow - 0.001) / CELL)),
      r0 = Math.max(0, Math.floor((r.y - grow) / CELL)),
      r1 = Math.min(this.rows - 1, Math.floor((r.y + r.height + grow - 0.001) / CELL));
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) fn(cy * this.cols + cx, cx, cy);
  }
  /** A piece was eaten: its cells lose one live piece. */
  eaten(p: Rect) {
    this.each(p, 0, (i) => (this.live[i] = Math.max(0, this.live[i] - 1)));
  }
  /**
   * Empty, not yet cleared cells within `reach` of `r`, merged into horizontal
   * runs so a wide margin becomes a few rectangles rather than dozens.
   */
  clearNear(r: Rect, reach: number): Rect[] {
    const runs: Rect[] = [];
    let run: Rect | undefined;
    let lastRow = -1,
      lastCol = -2;
    this.each(r, reach, (i, cx, cy) => {
      if (this.live[i] || this.cleared[i]) return;
      this.cleared[i] = 1;
      const x = cx * CELL,
        y = cy * CELL,
        w = Math.min(CELL, this.width - x),
        h = Math.min(CELL, this.height - y);
      if (run && cy === lastRow && cx === lastCol + 1) run.width += w;
      else {
        run = { x, y, width: w, height: h };
        runs.push(run);
      }
      lastRow = cy;
      lastCol = cx;
    });
    return runs;
  }
}
