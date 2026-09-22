import { setTimeout as delay } from "node:timers/promises";

/** One monotonic deadline per snapshot; child phases cannot extend it. */
export class Deadline {
  readonly controller = new AbortController();
  readonly end: number;
  private timer: ReturnType<typeof setTimeout>;
  constructor(readonly duration = 55_000) {
    this.end = performance.now() + duration;
    this.timer = setTimeout(
      () => this.controller.abort(new Error("Snapshot deadline exceeded.")),
      duration,
    );
  }
  get signal() {
    return this.controller.signal;
  }
  remaining(reserve = 0) {
    return Math.max(0, this.end - performance.now() - reserve);
  }
  check() {
    this.signal.throwIfAborted();
    if (!this.remaining()) throw new Error("Snapshot deadline exceeded.");
  }
  async sleep(ms: number) {
    this.check();
    await delay(ms, undefined, { signal: this.signal });
    this.check();
  }
  dispose() {
    clearTimeout(this.timer);
  }
}

export function readinessDecision(
  s: {
    meaningful: boolean;
    stableMs: number;
    elapsedMs: number;
    pending: number;
    quietMs: number;
    assetsReady: boolean;
  },
  limit: number,
) {
  if (s.elapsedMs >= limit) return "partial";
  return s.meaningful &&
    s.assetsReady &&
    s.stableMs >= 450 &&
    ((s.pending === 0 && s.quietMs >= 250) || s.stableMs >= 1000)
    ? "ready"
    : "wait";
}
