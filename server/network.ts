import type { BrowserContext } from "playwright";
import { safeFetch, validateURL } from "./security.ts";
import { Deadline } from "./deadline.ts";

export type NetworkState = {
  pending: number;
  lastActivity: number;
  requests: number;
  bytes: number;
  failures: Record<string, number>;
};
export async function guardContext(
  context: BrowserContext,
  deadline: Deadline,
  fetchResource: typeof safeFetch = safeFetch,
) {
  const state: NetworkState = {
    pending: 0,
    lastActivity: performance.now(),
    requests: 0,
    bytes: 0,
    failures: {},
  };
  const stopped = new AbortController();
  const note = (reason: string) => {
    state.failures[reason] = (state.failures[reason] ?? 0) + 1;
  };
  await context.routeWebSocket("**/*", (ws) => {
    note("websocket-blocked");
    ws.close();
  });
  await context.route("**/*", async (route) => {
    const request = route.request(),
      type = request.resourceType();
    let active = false;
    try {
      deadline.check();
      stopped.signal.throwIfAborted();
      if (
        ![
          "document",
          "stylesheet",
          "image",
          "font",
          "script",
          "xhr",
          "fetch",
        ].includes(type)
      ) {
        note(`${type}-blocked`);
        await route.abort();
        return;
      }
      // Reserve the last 20 attempts and 4 MB for visible assets / poster fallback.
      const optional = ["xhr", "fetch", "script"].includes(type);
      const limit = optional ? 160 : 180;
      if (
        state.requests >= limit ||
        state.bytes >= (optional ? 20_000_000 : 24_000_000)
      ) {
        note("budget-blocked");
        await route.abort();
        return;
      }
      state.pending++;
      active = true;
      for (let attempt = 0; attempt < 2; attempt++) {
        deadline.check();
        stopped.signal.throwIfAborted();
        if (state.requests >= limit)
          throw new Error("Request budget exceeded.");
        state.requests++;
        const resourceSignal = AbortSignal.any([
          deadline.signal,
          stopped.signal,
          AbortSignal.timeout(type === "document" ? 12_000 : 6000),
        ]);
        try {
          const response = await fetchResource(
            request.url(),
            state,
            resourceSignal,
            {
              method: request.method(),
              body: request.postDataBuffer() ?? undefined,
              headers: request.headers(),
              byteLimit: optional ? 20_000_000 : 24_000_000,
            },
          );
          if (
            [408, 429, 502, 503, 504].includes(response.status) &&
            attempt === 0 &&
            request.method() === "GET"
          ) {
            note(`retry-http-${response.status}`);
            await deadline.sleep(180);
            continue;
          }
          if (response.status >= 400) note(`http-${response.status}`);
          if (
            response.status >= 300 &&
            response.status < 400 &&
            response.headers.location
          )
            validateURL(new URL(response.headers.location, request.url()).href);
          await route.fulfill(response);
          return;
        } catch (error) {
          const message = (error as Error).message;
          const transient =
            resourceSignal.reason?.name === "TimeoutError" ||
            /ECONNRESET|ETIMEDOUT|EAI_AGAIN|timeout/i.test(message);
          if (
            attempt === 0 &&
            request.method() === "GET" &&
            transient &&
            !deadline.signal.aborted &&
            !stopped.signal.aborted &&
            deadline.remaining() > 7000
          ) {
            note("retry-transient");
            await deadline.sleep(180);
            continue;
          }
          throw error;
        }
      }
    } catch (error) {
      note(
        stopped.signal.aborted
          ? "unfinished-at-capture"
          : (error as Error).message.split("\n")[0].slice(0, 140),
      );
      await route.abort().catch(() => {});
    } finally {
      if (active) state.pending--;
      state.lastActivity = performance.now();
    }
  });
  return Object.assign(state, {
    stop: () =>
      stopped.abort(new Error("Unfinished resource omitted at capture.")),
  });
}
