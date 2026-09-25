import { snapshotApiUrl } from "./remote-level";

/** Client for the Worker leaderboard. Only captured websites can be ranked. */

export type Period = "day" | "all";
export type BoardRow = { rank: number; nickname: string; sites: number; pieces: number };
export type Board = { period: Period; day: string; players: number; rows: BoardRow[]; me: BoardRow | null };
export type Player = { id: string; nickname: string; token: string };
export type RunTicket = { runId: string; runToken: string; host: string };
export type FinishResult =
  | { counted: true; host: string; newSite: boolean; newToday: boolean; today: BoardRow | null; all: BoardRow | null }
  | { counted: false; code: string; message: string };

export class LeaderboardError extends Error {
  constructor(message: string, public code = "LEADERBOARD_FAILED", public status = 0) {
    super(message);
  }
}

const STORAGE_KEY = "webivore.player.v1";

export function storedPlayer(): Player | null {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<Player> | null;
    return value && typeof value.id === "string" && typeof value.nickname === "string" && typeof value.token === "string"
      ? (value as Player)
      : null;
  } catch {
    return null;
  }
}

export function storePlayer(player: Player | null) {
  try {
    if (player) localStorage.setItem(STORAGE_KEY, JSON.stringify(player));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private windows may refuse storage; the session still works in memory.
  }
  dispatchEvent(new CustomEvent("webivore:player", { detail: player }));
}

/** Coarse browser traits; the Worker only keeps a salted hash to cap nickname minting. */
function deviceTraits() {
  try {
    return [
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      `${screen.width}x${screen.height}@${devicePixelRatio}`,
      navigator.language,
      navigator.hardwareConcurrency,
      navigator.maxTouchPoints,
    ].join("|");
  } catch {
    return "";
  }
}

export function leaderboardBase() {
  return String(import.meta.env.VITE_LEADERBOARD_API_URL ?? "").trim().replace(/\/$/, "");
}

const endpoint = (path: string) => {
  const override = leaderboardBase();
  return override ? `${override}${path}` : snapshotApiUrl(path);
};

async function call<T>(path: string, init: RequestInit & { player?: Player | null } = {}): Promise<T> {
  const { player, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (rest.body) headers.set("Content-Type", "application/json");
  if (player) headers.set("Authorization", `Bearer ${player.token}`);
  let response: Response;
  try {
    response = await fetch(endpoint(path), { ...rest, headers });
  } catch {
    throw new LeaderboardError("The leaderboard is offline right now.", "OFFLINE");
  }
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const code = typeof payload.code === "string" ? payload.code : response.status === 404 ? "OFFLINE" : "LEADERBOARD_FAILED";
    if (code === "PLAYER_UNKNOWN") storePlayer(null);
    const message = code === "OFFLINE" || code === "LEADERBOARD_UNAVAILABLE"
      ? "The leaderboard is offline right now."
      : typeof payload.error === "string" ? payload.error : "The leaderboard did not answer.";
    throw new LeaderboardError(message, code, response.status);
  }
  return payload as T;
}

export function fetchBoard(period: Period, limit = 20, player = storedPlayer(), signal?: AbortSignal) {
  return call<Board>(`/api/leaderboard?period=${period}&limit=${limit}`, { player, signal });
}

export async function registerPlayer(nickname: string, turnstileToken?: string) {
  const result = await call<{ player: { id: string; nickname: string }; token: string }>("/api/players", {
    method: "POST",
    body: JSON.stringify({ nickname, turnstileToken, device: deviceTraits() }),
  });
  const player = { ...result.player, token: result.token };
  storePlayer(player);
  return player;
}

export async function renamePlayer(player: Player, nickname: string) {
  const result = await call<{ player: { id: string; nickname: string } }>("/api/players/me", {
    method: "POST",
    player,
    body: JSON.stringify({ nickname }),
  });
  const next = { ...player, nickname: result.player.nickname };
  storePlayer(next);
  return next;
}

export function startRun(snapshotId: string) {
  return call<RunTicket>("/api/runs", { method: "POST", body: JSON.stringify({ snapshotId }) });
}

export function finishRun(run: RunTicket, player: Player, pieces: number, seconds: number) {
  return call<FinishResult>(`/api/runs/${run.runId}/finish`, {
    method: "POST",
    player,
    body: JSON.stringify({ runToken: run.runToken, pieces, seconds }),
  });
}

export const turnstileSiteKey = () => String(import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "");
