import type { Page } from "playwright";

export async function extract(page: Page) {
  return page.evaluate(() => {
    const width = 1280,
      height = Math.min(
        9000,
        Math.max(900, document.documentElement.scrollHeight),
      );
    const pieces: {
      id: number;
      tagName: string;
      text: string;
      x: number;
      y: number;
      width: number;
      height: number;
      type: string;
      fontSize: number;
      backgroundColor: string;
      borderRadius: string;
      zIndex: string;
      imageUrl?: string;
    }[] = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    );
    let visits = 0,
      sourceElementCount = 0;
    const helper = {
      add(el: Element, rect: DOMRect, text: string, type: string) {
        const x = Math.max(0, rect.left),
          y = Math.max(0, rect.top),
          right = Math.min(width, rect.right),
          bottom = Math.min(height, rect.bottom);
        if (right - x < 1 || bottom - y < 1) return;
        const s = getComputedStyle(el);
        pieces.push({
          id: pieces.length,
          tagName: el.tagName,
          text: text.trim().slice(0, 100),
          x,
          y,
          width: right - x,
          height: bottom - y,
          type,
          fontSize: parseFloat(s.fontSize) || 16,
          backgroundColor: s.backgroundColor,
          borderRadius: s.borderRadius,
          zIndex: s.zIndex,
          imageUrl: el instanceof HTMLImageElement ? el.currentSrc : undefined,
        });
      },
    };
    let node: Node | null;
    while ((node = walker.nextNode()) && visits++ < 40000) {
      const el =
        node.nodeType === Node.ELEMENT_NODE
          ? (node as Element)
          : node.parentElement;
      if (!el) continue;
      if (["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"].includes(el.tagName))
        continue;
      const s = getComputedStyle(el);
      if (
        s.visibility !== "visible" ||
        s.display === "none" ||
        Number(s.opacity) === 0
      )
        continue;
      if (node.nodeType === Node.ELEMENT_NODE) {
        sourceElementCount++;
        if (
          [
            "IMG",
            "SVG",
            "CANVAS",
            "VIDEO",
            "INPUT",
            "TEXTAREA",
            "BUTTON",
          ].includes(el.tagName)
        )
          helper.add(
            el,
            el.getBoundingClientRect(),
            el.getAttribute("alt") || el.textContent || el.tagName,
            /IMG|SVG|CANVAS|VIDEO/.test(el.tagName)
              ? "IMAGE"
              : el.tagName === "BUTTON"
                ? "BUTTON"
                : "INPUT",
          );
      } else if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
        // Range rectangles preserve ordinary text before/after nested links as well.
        const range = document.createRange();
        range.selectNodeContents(node);
        const type = el.closest("a")
          ? "LINK"
          : /^H[1-6]$/.test(el.tagName)
            ? "HERO"
            : "TEXT_BLOCK";
        for (const rect of range.getClientRects())
          helper.add(
            el,
            rect,
            node.textContent,
            rect.width * rect.height < 1800 ? "TEXT_SMALL" : type,
          );
      }
    }
    return {
      width,
      height,
      pieces,
      title: document.title,
      sourceElementCount,
      detailCoarsened: visits >= 40000,
      truncated: document.documentElement.scrollHeight > 9000,
    };
  });
}
