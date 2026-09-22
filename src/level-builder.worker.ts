/// <reference lib="webworker" />
import { imagePiecePlan, layoutSemanticBlocks, partitionPixels, type SemanticBlock } from "./level-builder";
import type { Level } from "./shared";
import type { SnapshotMetadata } from "./snapshot-types";

type BaseLevel = Omit<Level, "atlas" | "background">;
type RequestMessage =
  | { id: number; kind: "snapshot"; snapshot: SnapshotMetadata; atlas: ArrayBuffer }
  | { id: number; kind: "html"; title: string; fileName: string; blocks: SemanticBlock[] }
  | { id: number; kind: "image"; fileName: string; mimeType: string; image: ArrayBuffer };
type ResponseMessage =
  | { id: number; ok: true; level: BaseLevel; atlas: Blob; backgroundIsAtlas: boolean }
  | { id: number; ok: false; error: string };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<RequestMessage>) => void) | null;
  postMessage(message: ResponseMessage): void;
};

async function bitmapFrom(data: ArrayBuffer, type: string) {
  return createImageBitmap(new Blob([data], { type }));
}

async function buildSnapshot(message: Extract<RequestMessage, { kind: "snapshot" }>) {
  const { snapshot } = message;
  if (snapshot.width < 64 || snapshot.width > 4096 || snapshot.height < 64 || snapshot.height > 12_000)
    throw new Error("Snapshot dimensions are outside the supported range.");
  if (message.atlas.byteLength > 24 * 1024 * 1024) throw new Error("Snapshot atlas is too large.");
  const bitmap = await bitmapFrom(message.atlas, snapshot.atlas.mimeType);
  try {
    const canvas = new OffscreenCanvas(snapshot.width, snapshot.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas is unavailable.");
    context.fillStyle = "#f4f0e7";
    context.fillRect(0, 0, snapshot.width, snapshot.height);
    context.drawImage(bitmap, 0, 0, snapshot.width, snapshot.height);
    const pixels = context.getImageData(0, 0, snapshot.width, snapshot.height).data;
    const partition = partitionPixels(snapshot.candidates, pixels, snapshot.width, snapshot.height);
    if (!partition.pieces.length) throw new Error("This page has no visible content to collect.");
    return {
      level: {
        url: snapshot.url,
        title: snapshot.title || new URL(snapshot.url).hostname,
        width: snapshot.width,
        height: snapshot.height,
        pieces: partition.pieces,
        coverage: "exclusive" as const,
        pageColor: partition.pageColor,
        sourceElementCount: snapshot.sourceElementCount,
        truncated: snapshot.truncated,
      },
      atlas: await canvas.convertToBlob({ type: snapshot.atlas.mimeType, quality: 0.86 }),
      backgroundIsAtlas: false,
    };
  } finally {
    bitmap.close();
  }
}

async function drawEmbeddedImage(
  context: OffscreenCanvasRenderingContext2D,
  item: ReturnType<typeof layoutSemanticBlocks>["items"][number],
) {
  if (!item.imageDataUrl) return;
  try {
    const response = await fetch(item.imageDataUrl);
    const blob = await response.blob();
    if (blob.size > 5 * 1024 * 1024 || !/^image\/(?:png|jpeg|webp)$/.test(blob.type)) return;
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(item.width / bitmap.width, item.height / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    context.drawImage(bitmap, item.x + (item.width - width) / 2, item.y + (item.height - height) / 2, width, height);
    bitmap.close();
  } catch {
    // A broken embedded image becomes a labelled placeholder in the safe canonical page.
  }
}

async function buildHtml(message: Extract<RequestMessage, { kind: "html" }>) {
  const layout = layoutSemanticBlocks(message.blocks);
  const canvas = new OffscreenCanvas(layout.width, layout.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas is unavailable.");
  context.fillStyle = "#f4f0e7";
  context.fillRect(0, 0, layout.width, layout.height);
  context.fillStyle = "#171914";
  context.fillRect(0, 0, layout.width, 18);
  for (const item of layout.items) {
    if (item.type === "BUTTON") {
      context.fillStyle = "#ff2b19";
      context.fillRect(item.x, item.y, Math.min(item.width, 520), item.height);
    } else if (item.type === "IMAGE") {
      context.fillStyle = "#dedad0";
      context.fillRect(item.x, item.y, item.width, item.height);
      await drawEmbeddedImage(context, item);
    }
    context.fillStyle = item.type === "BUTTON" ? "#ffffff" : "#171914";
    context.font = `${item.type === "HERO" || item.type === "BUTTON" ? "700 " : ""}${item.fontSize}px Arial, sans-serif`;
    context.textBaseline = "top";
    item.lines.forEach((line, index) => context.fillText(line, item.x + (item.type === "BUTTON" ? 20 : 0), item.y + 8 + index * Math.round(item.fontSize * 1.3), item.width - 20));
    if (item.type === "LINK") {
      context.fillStyle = "#ff2b19";
      context.fillRect(item.x, item.y + item.height - 8, Math.min(item.width, 460), 3);
    }
  }
  const pixels = context.getImageData(0, 0, layout.width, layout.height).data;
  const partition = partitionPixels(layout.items, pixels, layout.width, layout.height);
  const atlas = await canvas.convertToBlob({ type: "image/png" });
  return {
    level: {
      url: `local-html:${encodeURIComponent(message.fileName)}`,
      title: message.title || message.fileName,
      width: layout.width,
      height: layout.height,
      pieces: partition.pieces,
      coverage: "exclusive" as const,
      pageColor: partition.pageColor,
      sourceElementCount: message.blocks.length,
      truncated: layout.items.length < message.blocks.length,
    },
    atlas,
    backgroundIsAtlas: false,
  };
}

async function buildImage(message: Extract<RequestMessage, { kind: "image" }>) {
  if (!/^image\/(?:png|jpeg|webp)$/.test(message.mimeType)) throw new Error("Choose a PNG, JPEG or WebP image.");
  if (message.image.byteLength > 24 * 1024 * 1024) throw new Error("Images are limited to 24 MB.");
  const bitmap = await bitmapFrom(message.image, message.mimeType);
  try {
    if (bitmap.width < 16 || bitmap.height < 16) throw new Error("The image is too small.");
    const maxPixels = 12_000_000;
    const scale = Math.min(1, 1280 / bitmap.width, 9000 / bitmap.height, Math.sqrt(maxPixels / (bitmap.width * bitmap.height)));
    const width = Math.max(64, Math.round(bitmap.width * scale));
    const height = Math.max(64, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable.");
    context.fillStyle = "#f4f0e7";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const pieces = imagePiecePlan(width, height);
    const atlas = await canvas.convertToBlob({ type: message.mimeType, quality: 0.88 });
    return {
      level: {
        url: `local-image:${encodeURIComponent(message.fileName)}`,
        title: message.fileName.replace(/\.[^.]+$/, ""),
        width,
        height,
        pieces,
        coverage: "exclusive" as const,
        pageColor: "#f4f0e7",
        sourceElementCount: 1,
        truncated: scale < 1,
      },
      atlas,
      backgroundIsAtlas: false,
    };
  } finally {
    bitmap.close();
  }
}

scope.onmessage = async ({ data }) => {
  try {
    const built = data.kind === "snapshot" ? await buildSnapshot(data) : data.kind === "html" ? await buildHtml(data) : await buildImage(data);
    scope.postMessage({ id: data.id, ok: true, ...built });
  } catch (error) {
    scope.postMessage({ id: data.id, ok: false, error: (error as Error).message || "Level building failed." });
  }
};
