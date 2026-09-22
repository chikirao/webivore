import test from "node:test";
import assert from "node:assert/strict";
import dns from "node:dns/promises";
import https from "node:https";
import { EventEmitter } from "node:events";
import { safeFetch } from "../server/security.ts";

// Simulated public transport, no test-only exception in URL validation/pinning.
for (const [label, headers, chunks] of [
  ["declared oversized", { "content-length": "6000001" }, []],
  [
    "streamed oversized",
    {},
    [Buffer.alloc(3_000_001), Buffer.alloc(3_000_001)],
  ],
  ["shared total", {}, [Buffer.alloc(100)]],
] as const)
  test(`safeFetch rejects ${label} and settles the request`, async (t) => {
    t.mock.method(dns, "lookup", async () => [
      { address: "93.184.216.34", family: 4 },
    ]);
    let destroyed = false;
    t.mock.method(
      https,
      "request",
      (_url: unknown, options: any, callback: Function) => {
        const req = new EventEmitter() as any;
        req.setTimeout = () => req;
        req.destroy = (error?: Error) => {
          destroyed = true;
          if (error) queueMicrotask(() => req.emit("error", error));
        };
        req.end = () =>
          queueMicrotask(() => {
            assert.equal(typeof options.lookup, "function");
            options.lookup(
              "fixture.example",
              {},
              (_error: unknown, ip: string) =>
                assert.equal(ip, "93.184.216.34"),
            );
            const response = new EventEmitter() as any;
            response.headers = headers;
            response.statusCode = 200;
            response.destroy = () => {
              destroyed = true;
            };
            callback(response);
            for (const chunk of chunks) response.emit("data", chunk);
            response.emit("end");
          });
        return req;
      },
    );
    await assert.rejects(
      safeFetch(
        "https://fixture.example/",
        { bytes: label === "shared total" ? 23_999_999 : 0 },
        new AbortController().signal,
      ),
      /budget/,
    );
    assert.ok(destroyed);
  });
