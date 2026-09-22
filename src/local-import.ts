import { buildLevel } from "./level-builder-client";
import type { SemanticBlock } from "./level-builder";
import { LEVEL_FILE_LIMITS, parseLevelFile, type LevelSource } from "./level-file";
import type { Level } from "./shared";

export type ImportKind = "level" | "html" | "image";
export type ImportedLevel = { level: Level; source: LevelSource; notice?: string };

const HTML_LIMIT = 5 * 1024 * 1024;
const IMAGE_LIMIT = 24 * 1024 * 1024;
const BLOCK_LIMIT = 800;
const forbiddenSelector = "script,iframe,frame,object,embed,applet,style,link,base,noscript,template,svg,math";

const text = (element: Element, max = 1200) =>
  (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export function sanitizeHtmlToBlocks(html: string, parser = new DOMParser()): {
  title: string;
  blocks: SemanticBlock[];
  removed: number;
} {
  const document = parser.parseFromString(html, "text/html");
  let removed = 0;
  for (const element of Array.from(document.querySelectorAll(forbiddenSelector))) {
    element.remove();
    removed++;
  }
  for (const meta of Array.from(document.querySelectorAll("meta"))) {
    if ((meta.getAttribute("http-equiv") ?? "").toLowerCase() === "refresh") {
      meta.remove();
      removed++;
    }
  }
  for (const form of Array.from(document.querySelectorAll("form"))) {
    const replacement = document.createElement("div");
    while (form.firstChild) replacement.append(form.firstChild);
    form.replaceWith(replacement);
    removed++;
  }
  for (const element of Array.from(document.querySelectorAll("*"))) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (
        name.startsWith("on") ||
        ["style", "srcdoc", "action", "formaction", "target", "ping", "download"].includes(name) ||
        ((name === "href" || name === "src" || name === "xlink:href") && /^(?:javascript|vbscript):/i.test(value))
      ) {
        element.removeAttribute(attribute.name);
        removed++;
      }
    }
  }
  const title = text(document.querySelector("title") ?? document.querySelector("h1") ?? document.body, 300) || "Imported HTML";
  const blocks: SemanticBlock[] = [{ kind: "title", text: title }];
  const seen = new Set<Element>();
  const add = (element: Element, kind: SemanticBlock["kind"]) => {
    if (blocks.length >= BLOCK_LIMIT || seen.has(element)) return;
    const value = text(element);
    if (!value) return;
    seen.add(element);
    blocks.push({ kind, text: value });
  };
  for (const element of Array.from(document.body.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,a,button,label,img"))) {
    if (blocks.length >= BLOCK_LIMIT) break;
    const tag = element.tagName;
    if (tag === "IMG") {
      const image = element as HTMLImageElement;
      const src = image.getAttribute("src")?.trim() ?? "";
      const alt = (image.getAttribute("alt") ?? "Imported image").slice(0, 300);
      if (/^data:image\/(?:png|jpeg|webp);base64,/i.test(src) && src.length <= 7 * 1024 * 1024)
        blocks.push({ kind: "image", text: alt, alt, imageDataUrl: src });
      else if (/^blob:/i.test(src)) blocks.push({ kind: "image", text: alt, alt, imageDataUrl: src });
      else if (alt) blocks.push({ kind: "paragraph", text: `[Image: ${alt}]` });
    } else if (/^H[1-6]$/.test(tag)) add(element, "heading");
    else if (tag === "A") add(element, "link");
    else if (tag === "BUTTON" || tag === "LABEL") add(element, "control");
    else if (tag === "LI") add(element, "list");
    else add(element, "paragraph");
  }
  if (blocks.length === 1) {
    const fallback = text(document.body, 6000);
    if (fallback) blocks.push({ kind: "paragraph", text: fallback });
  }
  return { title, blocks, removed };
}

async function resolveLocalBlobImages(blocks: SemanticBlock[]) {
  const result: SemanticBlock[] = [];
  for (const block of blocks) {
    if (!block.imageDataUrl?.startsWith("blob:")) {
      result.push(block);
      continue;
    }
    try {
      if (typeof location === "undefined" || new URL(block.imageDataUrl).origin !== location.origin)
        throw new Error("foreign blob URL");
      const response = await fetch(block.imageDataUrl);
      const blob = await response.blob();
      if (blob.size > 5 * 1024 * 1024 || !/^image\/(?:png|jpeg|webp)$/.test(blob.type))
        throw new Error("unsupported blob image");
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Could not read embedded image."));
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(blob);
      });
      result.push({ ...block, imageDataUrl: dataUrl });
    } catch {
      result.push({ kind: "paragraph", text: `[Image: ${block.alt || block.text || "unavailable"}]` });
    }
  }
  return result;
}

export function detectImportKind(file: Pick<File, "name" | "type">): ImportKind | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".webivore.json")) return "level";
  if (name.endsWith(".html") || name.endsWith(".htm") || file.type === "text/html") return "html";
  if (/\.(png|jpe?g|webp)$/.test(name) || /^image\/(?:png|jpeg|webp)$/.test(file.type)) return "image";
  return null;
}

export async function importLocalFile(file: File, expected?: ImportKind, signal?: AbortSignal): Promise<ImportedLevel> {
  signal?.throwIfAborted();
  const kind = expected ?? detectImportKind(file);
  if (!kind) throw new Error("Choose a .webivore.json, HTML, PNG, JPEG or WebP file.");
  if (expected && detectImportKind(file) !== expected) throw new Error(`This picker expects a ${expected} file.`);
  if (kind === "level") {
    if (file.size > LEVEL_FILE_LIMITS.fileBytes) throw new Error("WEBIVORE level files are limited to 25 MB.");
    const parsed = parseLevelFile(await file.text());
    signal?.throwIfAborted();
    return { level: parsed.level, source: parsed.file.source };
  }
  if (kind === "html") {
    if (file.size > HTML_LIMIT) throw new Error("HTML imports are limited to 5 MB.");
    const parsed = sanitizeHtmlToBlocks(await file.text());
    signal?.throwIfAborted();
    const blocks = await resolveLocalBlobImages(parsed.blocks);
    const level = await buildLevel({ kind: "html", title: parsed.title, fileName: file.name, blocks }, signal);
    return {
      level,
      source: { kind: "html", fileName: file.name },
      notice: "Local HTML is converted into a safe simplified page. Scripts and unavailable remote assets are ignored.",
    };
  }
  if (file.size > IMAGE_LIMIT) throw new Error("Page images are limited to 24 MB.");
  const mimeType = file.type || (file.name.toLowerCase().endsWith(".png") ? "image/png" : file.name.toLowerCase().endsWith(".webp") ? "image/webp" : "image/jpeg");
  const image = await file.arrayBuffer();
  signal?.throwIfAborted();
  const level = await buildLevel({ kind: "image", fileName: file.name, mimeType, image }, signal);
  return { level, source: { kind: "image", fileName: file.name } };
}
