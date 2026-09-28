import * as THREE from "three";

/** Readable reason for anything thrown, including the bare DOM events image loaders reject with. */
export function reasonOf(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof Event !== "undefined" && error instanceof Event) {
    const src = (error.target as HTMLImageElement | null)?.src ?? "";
    return `an image failed to load${src && !src.startsWith("data:") ? ` (${src.split("/").pop()})` : ""}`;
  }
  return String(error);
}

/**
 * Resolves once an <img> can be drawn. Safari's decode() rejects some large,
 * valid images, so a failed decode falls back to the load event.
 */
export async function imageReady(img: HTMLImageElement) {
  try {
    await img.decode();
    return;
  } catch {
    // Fall through to the load event.
  }
  if (img.complete) {
    if (img.naturalWidth) return;
    throw new Error("the page image could not be decoded");
  }
  await new Promise<void>((resolve, reject) => {
    img.addEventListener("load", () => resolve(), { once: true });
    img.addEventListener("error", () => reject(new Error("the page image could not be decoded")), { once: true });
  });
}

/** TextureLoader with retries: one dropped request should not end the run. */
export async function loadTexture(url: string, tries = 3) {
  const loader = new THREE.TextureLoader();
  for (let attempt = 0; ; attempt++) {
    try {
      return await loader.loadAsync(attempt ? `${url}${url.includes("?") ? "&" : "?"}retry=${attempt}` : url);
    } catch {
      if (attempt + 1 >= tries)
        throw new Error(`could not download ${url.split("/").pop()}. Check your connection and try again`);
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
}
