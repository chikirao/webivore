import type { Page } from "playwright";

// tsx/esbuild preserves nested function names with a __name helper. Serialize a
// local helper with the callback, without installing globals in the remote page.
export function evaluatePage<A, R>(
  page: Page,
  callback: (arg: A) => R,
  arg: A,
): Promise<Awaited<R>> {
  return page.evaluate(
    `((__name) => (${callback.toString()})(${JSON.stringify(arg)}))((fn) => fn)`,
  );
}
