import test from "node:test";
import assert from "node:assert/strict";
import { Deadline, readinessDecision } from "../server/deadline.ts";
import { safeFetch } from "../server/security.ts";

test("readiness needs meaningful stable content and assets; network is only one signal", () => {
  const s = {
    meaningful: true,
    stableMs: 500,
    elapsedMs: 800,
    pending: 0,
    quietMs: 300,
    assetsReady: true,
  };
  assert.equal(readinessDecision(s, 3000), "ready");
  assert.equal(readinessDecision({ ...s, meaningful: false }, 3000), "wait");
  assert.equal(readinessDecision({ ...s, assetsReady: false }, 3000), "wait");
  assert.equal(readinessDecision({ ...s, pending: 1 }, 3000), "wait");
  assert.equal(
    readinessDecision({ ...s, pending: 1, stableMs: 1100 }, 3000),
    "ready",
  );
  assert.equal(
    readinessDecision({ ...s, meaningful: false, elapsedMs: 3000 }, 3000),
    "partial",
  );
});
test("deadline cancels sleeps, cannot be extended, and preserves capture reserve", async () => {
  const d = new Deadline(60);
  try {
    assert.equal(d.remaining(100), 0);
    await assert.rejects(d.sleep(500));
    assert.ok(d.signal.aborted);
    assert.throws(() => d.check());
  } finally {
    d.dispose();
  }
});
test("exhausted byte budget and oversized request bodies fail before networking", async () => {
  const signal = new AbortController().signal;
  await assert.rejects(
    safeFetch("https://example.com", { bytes: 24_000_000 }, signal),
    /budget/,
  );
  await assert.rejects(
    safeFetch("https://example.com", { bytes: 0 }, signal, {
      body: Buffer.alloc(64001),
    }),
    /budget/,
  );
});
