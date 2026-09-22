import type { Level } from "./shared";
import type { SemanticBlock } from "./level-builder";
import type { SnapshotMetadata } from "./snapshot-types";

type WorkerInput =
  | { kind: "snapshot"; snapshot: SnapshotMetadata; atlas: ArrayBuffer }
  | { kind: "html"; title: string; fileName: string; blocks: SemanticBlock[] }
  | { kind: "image"; fileName: string; mimeType: string; image: ArrayBuffer };
type WorkerOutput =
  | { id: number; ok: true; level: Omit<Level, "atlas" | "background">; atlas: Blob; backgroundIsAtlas: boolean }
  | { id: number; ok: false; error: string };

function blobToDataUrl(blob: Blob, signal?: AbortSignal) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    const abort = () => {
      reader.abort();
      reject(signal?.reason ?? new DOMException("Cancelled", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    reader.onerror = () => reject(new Error("Could not read the generated atlas."));
    reader.onload = () => resolve(String(reader.result));
    reader.onloadend = () => signal?.removeEventListener("abort", abort);
    reader.readAsDataURL(blob);
  });
}

let sequence = 0;
export function buildLevel(input: WorkerInput, signal?: AbortSignal): Promise<Level> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const id = ++sequence;
    const worker = new Worker(new URL("./level-builder.worker.ts", import.meta.url), { type: "module" });
    const stop = () => worker.terminate();
    const abort = () => {
      stop();
      reject(signal?.reason ?? new DOMException("Cancelled", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    worker.onerror = (event) => {
      stop();
      signal?.removeEventListener("abort", abort);
      reject(new Error(event.message || "Level builder stopped unexpectedly."));
    };
    worker.onmessage = async ({ data }: MessageEvent<WorkerOutput>) => {
      if (data.id !== id) return;
      stop();
      signal?.removeEventListener("abort", abort);
      if (!data.ok) {
        reject(new Error(data.error));
        return;
      }
      try {
        const atlas = await blobToDataUrl(data.atlas, signal);
        resolve({ ...data.level, atlas, background: data.backgroundIsAtlas ? atlas : "" });
      } catch (error) {
        reject(error);
      }
    };
    const transfer: Transferable[] = [];
    if (input.kind === "snapshot") transfer.push(input.atlas);
    if (input.kind === "image") transfer.push(input.image);
    worker.postMessage({ id, ...input }, transfer);
  });
}
