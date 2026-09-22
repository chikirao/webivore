import type { Page } from "playwright";
import { Deadline } from "./deadline.ts";
import { evaluatePage } from "./evaluate.ts";

// YouTube's public response has several renderer generations. Only read data:
// never replay serviceEndpoint/actions or execute scripts taken from the payload.
type Data = Record<string, any>;
export function renderers(root: unknown, key: string | string[]): Data[] {
  const keys = Array.isArray(key) ? key : [key];
  const result: Data[] = [],
    stack: unknown[] = [root];
  let visited = 0;
  while (stack.length && visited++ < 40_000) {
    const value = stack.pop();
    if (!value || typeof value !== "object") continue;
    const object = value as Data;
    for (const name of keys)
      if (object[name] && typeof object[name] === "object")
        result.push(object[name]);
    const children = Object.values(object);
    for (let i = children.length - 1; i >= 0; i--)
      if (children[i] && typeof children[i] === "object")
        stack.push(children[i]);
  }
  return result;
}
export function youtubeText(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 5000);
  if (!value || typeof value !== "object") return "";
  const v = value as Data;
  if (typeof v.simpleText === "string") return v.simpleText.slice(0, 5000);
  if (typeof v.content === "string") return v.content.slice(0, 5000);
  return Array.isArray(v.runs)
    ? v.runs
        .map((r: Data) => (typeof r?.text === "string" ? r.text : ""))
        .join("")
        .slice(0, 5000)
    : "";
}
function imageURL(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
}
function thumbnail(list: unknown, desiredWidth = 320): string {
  if (!Array.isArray(list)) return "";
  const valid = list
    .filter((v) => v && imageURL(v.url))
    .sort((a, b) => (Number(a.width) || 0) - (Number(b.width) || 0));
  return imageURL(
    (valid.find((v) => Number(v.width) >= desiredWidth) ?? valid.at(-1))?.url,
  );
}
export type Recommendation = {
  id: string;
  title: string;
  image: string;
  metadata: string;
  duration: string;
};
export type Comment = {
  id: string;
  author: string;
  text: string;
  avatar: string;
  published: string;
  likes: string;
  replies: string;
};
export function parseComments(payload: unknown) {
  const entities = new Map(
    renderers(payload, "commentEntityPayload").map((e) => [e.key, e]),
  );
  const comments: Comment[] = [],
    seen = new Set<string>();
  // Follow displayed thread order, not entity storage order; don't accidentally
  // include reply entities or duplicated engagement-panel representations.
  for (const thread of renderers(payload, "commentThreadRenderer")) {
    const old = thread.comment?.commentRenderer;
    const model = thread.commentViewModel?.commentViewModel;
    const entity = entities.get(model?.commentKey);
    const id = youtubeText(old?.commentId ?? entity?.properties?.commentId);
    const text = youtubeText(old?.contentText ?? entity?.properties?.content);
    if (!id || !text || seen.has(id)) continue;
    seen.add(id);
    comments.push({
      id,
      text,
      author: youtubeText(old?.authorText ?? entity?.author?.displayName),
      avatar: old
        ? thumbnail(old.authorThumbnail?.thumbnails)
        : imageURL(entity?.author?.avatarThumbnailUrl),
      published: youtubeText(
        old?.publishedTimeText ?? entity?.properties?.publishedTime,
      ),
      likes: youtubeText(old?.voteCount ?? entity?.toolbar?.likeCountNotliked),
      replies: youtubeText(
        thread.replies?.commentRepliesRenderer?.viewReplies?.buttonRenderer
          ?.text,
      ),
    });
    if (comments.length === 20) break;
  }
  return {
    comments,
    count: youtubeText(
      renderers(payload, "commentsHeaderRenderer")[0]?.countText,
    ),
    message: youtubeText(renderers(payload, "messageRenderer")[0]?.text),
  };
}
export function parseWatchPage(initial: unknown, player: unknown, id: string) {
  const data = initial as Data | undefined,
    details = (player as Data | undefined)?.videoDetails;
  if (!details || details.videoId !== id || !youtubeText(details.title))
    return null;
  const primary = renderers(data?.contents, "videoPrimaryInfoRenderer")[0];
  const secondary = renderers(data?.contents, "videoSecondaryInfoRenderer")[0];
  const owner = secondary?.owner?.videoOwnerRenderer;
  const sidebar = data?.contents?.twoColumnWatchNextResults?.secondaryResults;
  const recommendations: Recommendation[] = [],
    seen = new Set<string>();
  for (const item of renderers(sidebar, [
    "lockupViewModel",
    "compactVideoRenderer",
  ])) {
    const videoId = item.contentId ?? item.videoId;
    if (
      typeof videoId !== "string" ||
      !/^[\w-]{11}$/.test(videoId) ||
      videoId === id ||
      seen.has(videoId)
    )
      continue;
    const model = item.metadata?.lockupMetadataViewModel;
    const title = youtubeText(model?.title ?? item.title);
    if (!title) continue;
    seen.add(videoId);
    const rows = model?.metadata?.contentMetadataViewModel?.metadataRows;
    recommendations.push({
      id: videoId,
      title,
      image: thumbnail(
        item.contentImage?.thumbnailViewModel?.image?.sources ??
          item.thumbnail?.thumbnails,
      ),
      metadata: Array.isArray(rows)
        ? rows
            .map((r: Data) =>
              (Array.isArray(r?.metadataParts) ? r.metadataParts : [])
                .map((p: Data) => youtubeText(p?.text))
                .filter(Boolean)
                .join(" · "),
            )
            .join("\n")
        : [
            youtubeText(item.shortBylineText),
            youtubeText(item.viewCountText),
            youtubeText(item.publishedTimeText),
          ]
            .filter(Boolean)
            .join(" · "),
      duration: youtubeText(
        renderers(item.contentImage, "thumbnailBadgeViewModel")[0]?.text ??
          item.lengthText,
      ),
    });
    if (recommendations.length === 20) break;
  }
  const section = renderers(data?.contents, "itemSectionRenderer").find(
    (s) =>
      s.sectionIdentifier === "comment-item-section" ||
      s.targetId === "comments-section",
  );
  const endpoint = renderers(section, "continuationItemRenderer")[0]
    ?.continuationEndpoint;
  const token = endpoint?.continuationCommand?.token;
  return {
    id,
    title: youtubeText(details.title),
    author: youtubeText(owner?.title ?? details.author),
    avatar: thumbnail(owner?.thumbnail?.thumbnails),
    subscribers: youtubeText(owner?.subscriberCountText),
    description: youtubeText(
      secondary?.attributedDescription ??
        secondary?.description ??
        details.shortDescription,
    ),
    views:
      youtubeText(primary?.viewCount?.videoViewCountRenderer?.viewCount) ||
      youtubeText(details.viewCount),
    date: youtubeText(primary?.dateText),
    image:
      thumbnail(details.thumbnail?.thumbnails, 1280) ||
      `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    recommendations,
    continuation:
      typeof token === "string" && token.length <= 16_000 ? token : "",
    commentsMessage: youtubeText(
      renderers(section, "messageRenderer")[0]?.text,
    ),
  };
}

/** Recover public watch-page data when the client bundle cannot run in the budget. */
export type YouTubeRecovery = {
  state: string;
  reason?: string;
  recommendations?: number;
  comments?: number;
  commentStatus?: string;
};
export async function recoverYouTubePage(
  page: Page,
  deadline: Deadline,
): Promise<YouTubeRecovery> {
  const url = new URL(page.url());
  if (!/(^|\.)youtube\.com$/.test(url.hostname))
    return { state: "not-youtube" };
  const id =
    url.searchParams.get("v") ??
    url.pathname.match(/^\/(?:shorts|embed)\/([\w-]{11})(?:\/|$)/)?.[1];
  if (!id || !/^[\w-]{11}$/.test(id)) return { state: "not-watch-page" };
  const source = await evaluatePage(
    page,
    () => {
      const w = window as typeof window & {
        ytInitialData?: unknown;
        ytInitialPlayerResponse?: unknown;
        ytcfg?: { get: (key: string) => any };
      };
      const visible = (selector: string) =>
        Array.from(document.querySelectorAll<HTMLElement>(selector)).some(
          (e) =>
            e.getBoundingClientRect().height > 0 &&
            (e.innerText ?? "").trim().length > 0,
        );
      const c = w.ytcfg?.get("INNERTUBE_CONTEXT")?.client;
      return {
        initial: w.ytInitialData,
        player: w.ytInitialPlayerResponse,
        client: c
          ? {
              clientName: c.clientName,
              clientVersion: c.clientVersion,
              hl: c.hl,
              gl: c.gl,
              visitorData: c.visitorData,
            }
          : null,
        nativeTitle: visible("ytd-watch-metadata h1, #info-contents h1"),
        nativeRecommendations: visible(
          "ytd-compact-video-renderer, yt-lockup-view-model, .yt-lockup-view-model",
        ),
        nativeComments: visible("ytd-comment-thread-renderer"),
      };
    },
    undefined,
  );
  if (
    source.nativeTitle &&
    source.nativeRecommendations &&
    source.nativeComments
  )
    return { state: "native" };
  const watch = parseWatchPage(source.initial, source.player, id);
  if (!watch) return { state: "unavailable", reason: "watch-data-unavailable" };
  let commentData = parseComments(source.initial),
    commentStatus = commentData.comments.length ? "initial" : "unavailable";
  const remaining = Math.min(4500, deadline.remaining(12_000));
  if (
    !source.nativeComments &&
    !commentData.comments.length &&
    watch.continuation &&
    source.client &&
    remaining > 250
  ) {
    const result = await evaluatePage(
      page,
      async ({ client, continuation, timeout }) => {
        try {
          // Fixed, read-only endpoint. Never execute a URL/action supplied by a renderer.
          const r = await fetch("/youtubei/v1/next?prettyPrint=false", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ context: { client }, continuation }),
            signal: AbortSignal.timeout(Math.floor(timeout)),
          });
          if (!r.ok) return { status: `http-${r.status}`, data: null };
          return { status: "loaded", data: await r.json() };
        } catch {
          return { status: "request-failed-or-timed-out", data: null };
        }
      },
      {
        client: source.client,
        continuation: watch.continuation,
        timeout: remaining,
      },
    );
    commentStatus = result.status;
    commentData = parseComments(result.data);
    if (commentStatus === "loaded" && !commentData.comments.length)
      commentStatus = "empty-or-unrecognized";
  } else if (source.nativeComments) commentStatus = "native";
  else if (!watch.continuation)
    commentStatus = watch.commentsMessage ? "disabled" : "no-continuation";
  else if (remaining <= 250) commentStatus = "deadline-reserve";
  const recovered = await renderWatchPage(page, {
    ...watch,
    comments: commentData.comments,
    commentCount: commentData.count,
    commentsMessage:
      commentData.message ||
      watch.commentsMessage ||
      "Comments could not be loaded for this snapshot.",
    nativeTitle: source.nativeTitle,
    nativeRecommendations: source.nativeRecommendations,
    nativeComments: source.nativeComments,
  });
  return {
    state: recovered ? "recovered" : "native-preserved",
    recommendations: watch.recommendations.length,
    comments: commentData.comments.length,
    commentStatus,
  };
}

type WatchRender = NonNullable<ReturnType<typeof parseWatchPage>> & {
  comments: Comment[];
  commentCount: string;
  commentsMessage: string;
  nativeTitle: boolean;
  nativeRecommendations: boolean;
  nativeComments: boolean;
};
export async function renderWatchPage(page: Page, data: WatchRender) {
  return evaluatePage(
    page,
    (data: WatchRender) => {
      // All remote strings are textContent/attributes, never innerHTML or CSS.
      const element = (tag: string, cls: string, text = "") => {
        const e = document.createElement(tag);
        e.className = cls;
        e.textContent = text;
        return e;
      };
      const img = (src: string, alt: string, cls: string) => {
        const e = document.createElement("img");
        e.className = cls;
        e.alt = alt;
        if (src) e.dataset.webivoreSrc = src;
        e.loading = "eager";
        return e;
      };
      const root = element("section", "wv-yt");
      root.setAttribute("data-webivore-youtube", "recovered");
      const nav = element("header", "wv-yt-nav");
      nav.append(
        element("span", "wv-yt-menu", "☰"),
        element("strong", "wv-yt-brand", "▶ YouTube"),
        element("div", "wv-yt-search", "Search"),
        element("span", "wv-yt-account", "Sign in"),
      );
      const main = element("div", "wv-yt-columns"),
        primary = element("main", "wv-yt-primary");
      const poster = element("div", "wv-yt-player");
      poster.setAttribute("data-webivore-media", "youtube-thumbnail");
      poster.append(img(data.image, data.title, "wv-yt-poster"));
      primary.append(poster, element("h1", "wv-yt-title", data.title));
      const channel = element("div", "wv-yt-channel"),
        owner = element("div", "wv-yt-owner");
      owner.append(
        element("strong", "", data.author),
        element("small", "", data.subscribers),
      );
      if (data.avatar)
        channel.append(img(data.avatar, data.author, "wv-yt-avatar"));
      channel.append(owner);
      primary.append(channel);
      const description = element("section", "wv-yt-description");
      description.append(
        element(
          "strong",
          "",
          [data.views, data.date].filter(Boolean).join(" · "),
        ),
        // Truncate the DOM text itself. CSS overflow would leave invisible text
        // rectangles that extract() could mistake for collectible fragments.
        element("p", "", data.description.split("\n").slice(0, 4).join("\n")),
      );
      primary.append(description);
      const comments = element("section", "wv-yt-comments");
      comments.setAttribute("data-webivore-comments", "");
      comments.append(element("h2", "", data.commentCount || "Comments"));
      if (!data.comments.length)
        comments.append(element("p", "wv-yt-note", data.commentsMessage));
      for (const c of data.comments) {
        const row = element("article", "wv-yt-comment");
        row.setAttribute("data-comment-id", c.id);
        if (c.avatar) row.append(img(c.avatar, c.author, "wv-yt-avatar"));
        else
          row.append(
            element(
              "div",
              "wv-yt-avatar wv-yt-anonymous",
              c.author.slice(0, 1),
            ),
          );
        const body = element("div", "wv-yt-comment-body"),
          byline = element("div", "wv-yt-byline");
        byline.append(
          element("strong", "", c.author),
          element("small", "", c.published),
        );
        body.append(byline, element("p", "", c.text));
        if (c.likes) body.append(element("small", "", "♡ " + c.likes));
        if (c.replies) body.append(element("div", "wv-yt-replies", c.replies));
        row.append(body);
        comments.append(row);
      }
      if (data.comments.length)
        comments.append(
          element(
            "p",
            "wv-yt-note",
            "Showing the first available comments in this snapshot.",
          ),
        );
      primary.append(comments);
      const sidebar = element("aside", "wv-yt-recommendations");
      sidebar.setAttribute("data-webivore-recommendations", "");
      sidebar.append(element("h2", "", "Recommended videos"));
      for (const r of data.recommendations) {
        const row = element("article", "wv-yt-recommendation");
        row.setAttribute("data-video-id", r.id);
        const thumb = element("div", "wv-yt-thumb");
        thumb.append(img(r.image, r.title, ""));
        if (r.duration)
          thumb.append(element("small", "wv-yt-duration", r.duration));
        const info = element("div", "wv-yt-video-info");
        info.append(element("h3", "", r.title), element("p", "", r.metadata));
        row.append(thumb, info);
        sidebar.append(row);
      }
      main.append(primary, sidebar);
      root.append(
        nav,
        element(
          "p",
          "wv-yt-notice",
          "Page snapshot · Video shown as a thumbnail",
        ),
        main,
      );
      let inserted = false;
      if (
        data.nativeTitle ||
        data.nativeComments ||
        data.nativeRecommendations
      ) {
        // Preserve all existing native content. Fill only missing sections, never
        // decide whether to delete the page from its total text length.
        const commentHost = document.querySelector("ytd-comments, #comments");
        const recHost = document.querySelector(
          "#secondary-inner, ytd-watch-next-secondary-results-renderer",
        );
        if (!data.nativeComments && commentHost) {
          const wrapper = element("div", "wv-yt");
          wrapper.append(comments);
          commentHost.append(wrapper);
          inserted = true;
        }
        if (!data.nativeRecommendations && recHost) {
          const wrapper = element("div", "wv-yt");
          wrapper.append(sidebar);
          recHost.append(wrapper);
          inserted = true;
        }
      } else {
        // YouTube ships its initial player and skeleton as siblings of ytd-app.
        // Remove only those known loading placeholders after source data recovery.
        document
          .querySelectorAll("#player.skeleton, #watch-page-skeleton")
          .forEach((e) => e.remove());
        const app = document.querySelector("ytd-app");
        if (app) {
          app.replaceWith(root);
          inserted = true;
        }
        // Unknown markup is never erased. The readable fallback is appended.
        else {
          document.body.append(root);
          inserted = true;
        }
      }
      const style = document.createElement("style");
      style.textContent = `
      .wv-yt{color:#0f0f0f!important;background:#fff!important;font:14px/1.45 Arial,sans-serif!important;box-sizing:border-box;text-align:left;}
      .wv-yt *{box-sizing:border-box;letter-spacing:normal;}.wv-yt p,.wv-yt h1,.wv-yt h2,.wv-yt h3{margin:0;color:inherit;}.wv-yt img{display:block;color:#606060;max-width:100%;object-fit:cover;}.wv-yt small{font-size:12px;color:#606060;}
      .wv-yt-nav{height:64px;display:flex;align-items:center;gap:24px;padding:0 28px;border-bottom:1px solid #eee;}.wv-yt-menu{font-size:23px;}.wv-yt-brand{font-size:25px;white-space:nowrap;}.wv-yt-brand:first-letter{color:#f00;}.wv-yt-search{margin:0 auto;border:1px solid #ccc;border-radius:24px;color:#777;padding:10px 20px;width:520px;}.wv-yt-account{color:#065fd4;white-space:nowrap;}
      .wv-yt-notice{font-size:11px;color:#606060!important;padding:8px 28px 0;}.wv-yt-columns{display:grid;grid-template-columns:minmax(0,1fr) 390px;gap:24px;padding:18px 28px 40px;max-width:1440px;margin:auto;align-items:start;}
      .wv-yt-player{aspect-ratio:16/9;background:#111;border-radius:12px;overflow:hidden;}.wv-yt-poster{width:100%;height:100%;object-fit:contain!important;}.wv-yt-title{font-size:21px!important;font-weight:700!important;line-height:1.3!important;margin:14px 0!important;}
      .wv-yt-channel{display:flex;gap:12px;align-items:center;margin:14px 0;}.wv-yt-avatar{width:40px;height:40px;border-radius:50%;flex-shrink:0;background:#eee;}.wv-yt-owner>*{display:block;}.wv-yt-description{padding:12px;background:#f2f2f2;border-radius:12px;margin:16px 0 28px;}.wv-yt-description p{white-space:pre-wrap;overflow-wrap:anywhere;margin-top:6px;}
      .wv-yt h2{font-size:20px;font-weight:700;margin-bottom:24px;}.wv-yt-comment{display:flex;gap:16px;margin-bottom:26px;}.wv-yt-comment-body{min-width:0;}.wv-yt-comment p{white-space:pre-wrap;overflow-wrap:anywhere;margin:5px 0 8px;}.wv-yt-byline{display:flex;gap:8px;align-items:baseline;}.wv-yt-byline strong{font-size:13px;}.wv-yt-replies{color:#065fd4;margin-top:8px;font-weight:600;}.wv-yt-note{color:#606060!important;font-size:12px;}.wv-yt-anonymous{display:grid;place-items:center;}
      .wv-yt-recommendation{display:grid;grid-template-columns:168px minmax(0,1fr);gap:10px;margin-bottom:14px;}.wv-yt-thumb{position:relative;aspect-ratio:16/9;background:#eee;border-radius:8px;overflow:hidden;}.wv-yt-thumb img{width:100%;height:100%;}.wv-yt-duration{position:absolute;bottom:4px;right:4px;background:#111d;color:#fff!important;padding:1px 4px;border-radius:3px;}.wv-yt h3{font-size:14px;font-weight:700;line-height:1.35;margin-bottom:6px;}.wv-yt-video-info p{font-size:12px;color:#606060;white-space:pre-line;}
      @media(max-width:900px){.wv-yt-columns{grid-template-columns:1fr;}.wv-yt-search{width:auto;flex:1;}.wv-yt-recommendations{max-width:500px;}}
    `;
      document.head.append(style);
      for (const image of document.querySelectorAll<HTMLImageElement>(
        ".wv-yt img[data-webivore-src]",
      )) {
        image.src = image.dataset.webivoreSrc!;
        delete image.dataset.webivoreSrc;
      }
      return inserted;
    },
    data,
  );
}
