import { CrownIcon, PencilSimpleIcon, TrophyIcon, XIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  fetchBoard,
  finishRun,
  LeaderboardError,
  registerPlayer,
  renamePlayer,
  storedPlayer,
  turnstileSiteKey,
  type Board,
  type BoardRow,
  type FinishResult,
  type Period,
  type Player,
  type RunTicket,
} from "./leaderboard-api";
import { TurnstileWidget } from "./TurnstileWidget";
import { Plate } from "./ui/Plate";
import { Chevrons } from "./ui/marks";
import "./ui/leaderboard.css";

const pad = (n: number) => String(n).padStart(2, "0");

export function usePlayer() {
  const [player, setPlayer] = useState<Player | null>(storedPlayer);
  useEffect(() => {
    const sync = () => setPlayer(storedPlayer());
    addEventListener("webivore:player", sync);
    addEventListener("storage", sync);
    return () => {
      removeEventListener("webivore:player", sync);
      removeEventListener("storage", sync);
    };
  }, []);
  return player;
}

type Load<T> = { state: "loading" } | { state: "ready"; data: T } | { state: "error"; message: string };

function useBoard(period: Period, limit: number, active: boolean, player: Player | null, refreshKey = 0) {
  const [load, setLoad] = useState<Load<Board>>({ state: "loading" });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setLoad((current) => (current.state === "ready" && current.data.period === period ? current : { state: "loading" }));
    fetchBoard(period, limit, player, controller.signal)
      .then((data) => setLoad({ state: "ready", data }))
      .catch((error: Error) => !controller.signal.aborted && setLoad({ state: "error", message: error.message }));
    return () => controller.abort();
  }, [period, limit, active, player, nonce, refreshKey]);
  return [load, () => setNonce((n) => n + 1)] as const;
}

/** Arcade HI-SCORE strip for the entry screen: today's top eater, opens the full board. */
export function HiScore({ onOpen, refreshKey }: { onOpen: () => void; refreshKey: number }) {
  const player = usePlayer();
  const [load] = useBoard("day", 1, true, null, refreshKey);
  const top = load.state === "ready" ? load.data.rows[0] : undefined;
  const mine = !!top && top.nickname === player?.nickname;
  const summary = top
    ? `Leaderboard. Today's top eater: ${top.nickname}, ${top.sites} ${top.sites === 1 ? "site" : "sites"}.`
    : "Open the leaderboard.";
  return (
    <Plate
      as="button"
      shape="cut"
      corners={["br"]}
      cut={16}
      fill="var(--ink)"
      line="var(--paper)"
      lineWidth={2}
      inset={4}
      className={`hiscore${mine ? " is-mine" : ""}`}
      onClick={onOpen}
      aria-label={summary}
      aria-haspopup="dialog"
    >
      <span className="hiscore-badge" aria-hidden="true">
        <CrownIcon weight="fill" />
      </span>
      <span className="hiscore-copy" aria-hidden="true">
        <span className="hiscore-kicker">Top eater today</span>
        <b className="hiscore-name">
          {load.state === "loading" ? "· · ·" : load.state === "error" ? "Leaderboard" : top ? top.nickname : "Nobody yet — be first"}
        </b>
      </span>
      {top && (
        <span className="hiscore-count" aria-hidden="true">
          <b>{pad(top.sites)}</b>
          <span>{top.sites === 1 ? "site" : "sites"}</span>
        </span>
      )}
      <span className="hiscore-cta" aria-hidden="true">
        <TrophyIcon weight="fill" />
        <Chevrons count={3} className="hiscore-chev" />
      </span>
    </Plate>
  );
}

/** Keeps focus inside an open dialog and closes it on Escape. */
function useDialog(open: boolean, onClose: () => void) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>("[data-autofocus], button")?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !panel.current) return;
      const focusable = [
        ...panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'),
      ].filter((element) => element.offsetParent !== null);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    addEventListener("keydown", key);
    return () => {
      removeEventListener("keydown", key);
      previous?.focus?.();
    };
  }, [open, onClose]);
  return panel;
}

function Row({ row, me }: { row: BoardRow; me: boolean }) {
  return (
    <li className={`lb-row rank-${Math.min(row.rank, 4)}${me ? " is-me" : ""}`}>
      <span className="lb-rank">{pad(row.rank)}</span>
      <span className="lb-name">
        {row.nickname}
        {me && <em>You</em>}
      </span>
      <span className="lb-sites">
        <b>{row.sites}</b>
        <small>{row.sites === 1 ? "site" : "sites"}</small>
      </span>
      <span className="lb-pieces">{row.pieces.toLocaleString("en-US")} pcs</span>
    </li>
  );
}

export function LeaderboardDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [period, setPeriod] = useState<Period>("day");
  const player = usePlayer();
  const [load, refresh] = useBoard(period, 20, open, player);
  const panel = useDialog(open, onClose);
  const titleId = useId();
  if (!open) return null;
  const board = load.state === "ready" ? load.data : null;
  const meListed = !!board?.me && board.rows.some((row) => row.rank === board.me!.rank);
  // Portalled: the finish ticket clips its children, which would trap a fixed backdrop.
  return createPortal(
    <div className="lb-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <Plate shape="cut" cut={28} fill="var(--paper)" line="var(--ink)" lineWidth={4} className="lb-sheet">
        <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <button className="lb-close" onClick={onClose} aria-label="Close leaderboard">
            <XIcon weight="bold" />
          </button>
          <h2 id={titleId} className="display lb-title">
            Leader<span>board</span>
          </h2>
          <div className="lb-tabs" role="tablist" aria-label="Period">
            {(["day", "all"] as const).map((value) => (
              <button
                key={value}
                role="tab"
                aria-selected={period === value}
                className={period === value ? "is-active" : ""}
                onClick={() => setPeriod(value)}
              >
                {value === "day" ? "Today" : "All time"}
              </button>
            ))}
            <span className="lb-meta label">
              {board ? `${board.players} ${board.players === 1 ? "eater" : "eaters"}` : " "}
              {period === "day" && " · resets 00:00 UTC"}
            </span>
          </div>
          <div className="lb-board" role="tabpanel" aria-busy={load.state === "loading"}>
            {load.state === "loading" && <p className="lb-empty" role="status">Counting bites…</p>}
            {load.state === "error" && (
              <p className="lb-empty" role="alert">
                {load.message}{" "}
                <button className="lb-link" onClick={refresh}>Retry</button>
              </p>
            )}
            {board && board.rows.length === 0 && (
              <p className="lb-empty">
                <b className="display">Empty plate.</b>
                {period === "day" ? "Nobody has cleared a site today. Eat one to 100% and the crown is yours." : "No sites eaten yet. Be the first name here."}
              </p>
            )}
            {board && board.rows.length > 0 && (
              <ol className="lb-list">
                {board.rows.map((row) => (
                  <Row key={row.rank} row={row} me={!!board.me && board.me.rank === row.rank && board.me.nickname === row.nickname} />
                ))}
                {board.me && !meListed && (
                  <>
                    <li className="lb-gap" aria-hidden="true">···</li>
                    <Row row={board.me} me />
                  </>
                )}
              </ol>
            )}
          </div>
          <PlayerPanel player={player} onChanged={refresh} />
          <p className="lb-rule">A site counts once cleared to 100%. Only live websites rank — demo and imported files don’t.</p>
        </div>
      </Plate>
    </div>,
    document.body,
  );
}

function PlayerPanel({ player, onChanged }: { player: Player | null; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  if (player && !editing)
    return (
      <div className="lb-player">
        <span className="label">Eating as</span>
        <b className="lb-player-name">{player.nickname}</b>
        <button className="lb-link" onClick={() => setEditing(true)}>
          <PencilSimpleIcon weight="bold" /> Rename
        </button>
      </div>
    );
  return (
    <NicknameForm
      player={player}
      intro={player ? "New nickname" : "Claim a nickname to rank your meals"}
      onDone={() => {
        setEditing(false);
        onChanged();
      }}
      onCancel={player ? () => setEditing(false) : undefined}
    />
  );
}

/** Registers (or renames) a player. Registration passes a Turnstile check when configured. */
export function NicknameForm({
  player,
  intro,
  submitLabel,
  onDone,
  onCancel,
}: {
  player: Player | null;
  intro: string;
  submitLabel?: string;
  onDone: (player: Player) => void;
  onCancel?: () => void;
}) {
  const [nickname, setNickname] = useState(player?.nickname ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");
  const [attempt, setAttempt] = useState(0);
  const siteKey = turnstileSiteKey();
  const needsCheck = !player && !!siteKey;
  const inputId = useId();
  const onToken = useCallback((value: string) => setToken(value), []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (needsCheck && !token) {
      setError("Finishing the quick check… try again in a second.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      onDone(player ? await renamePlayer(player, nickname) : await registerPlayer(nickname, token || undefined));
    } catch (reason) {
      setError((reason as LeaderboardError).message);
      // Turnstile tokens are single use.
      if (needsCheck) {
        setToken("");
        setAttempt((n) => n + 1);
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="lb-form" onSubmit={submit}>
      <label className="label" htmlFor={inputId}>{intro}</label>
      <div className="lb-form-row">
        <input
          id={inputId}
          data-autofocus={player ? "" : undefined}
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          placeholder="nickname"
          minLength={3}
          maxLength={16}
          autoComplete="nickname"
          spellCheck={false}
          required
          disabled={busy}
        />
        <button className="lb-submit" type="submit" disabled={busy}>
          {busy ? "…" : submitLabel ?? (player ? "Save" : "Claim")}
          <Chevrons count={2} className="lb-submit-chev" />
        </button>
        {onCancel && (
          <button type="button" className="lb-link" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      {error && <p className="lb-error" role="alert">{error}</p>}
      {needsCheck && <TurnstileWidget key={attempt} siteKey={siteKey} onToken={onToken} action="nickname" note="" />}
    </form>
  );
}

type Ticket =
  | { state: "idle" | "sending" }
  | { state: "done"; result: FinishResult }
  | { state: "error"; message: string };

/**
 * Finish-screen receipt. `run` is undefined for demo and local levels, null
 * when the Worker could not open a run, otherwise the pending run ticket.
 */
export function MealTicket({
  run,
  pieces,
  seconds,
}: {
  run: Promise<RunTicket | null> | null | undefined;
  pieces: number;
  seconds: number;
}) {
  const player = usePlayer();
  const [ticket, setTicket] = useState<Ticket>({ state: "idle" });
  const [boardOpen, setBoardOpen] = useState(false);
  const sent = useRef(false);
  const submit = useCallback(
    async (who: Player) => {
      if (sent.current || !run) return;
      sent.current = true;
      setTicket({ state: "sending" });
      const opened = await run;
      if (!opened) {
        setTicket({ state: "error", message: "Leaderboard offline — this meal wasn’t counted." });
        return;
      }
      try {
        setTicket({ state: "done", result: await finishRun(opened, who, pieces, seconds) });
      } catch (reason) {
        setTicket({ state: "error", message: (reason as Error).message });
      }
    },
    [run, pieces, seconds],
  );
  useEffect(() => {
    if (player && run) void submit(player);
  }, [player, run, submit]);

  const board = (
    <button className="ticket-board" onClick={() => setBoardOpen(true)} aria-haspopup="dialog" aria-label="Leaderboard">
      <TrophyIcon weight="fill" />
      <span>Leaderboard</span>
      <Chevrons count={2} className="ticket-chev" />
    </button>
  );
  let body;
  if (run === undefined)
    body = <p className="ticket-line">Demo &amp; local files don’t rank. Eat a live site to claim a spot.</p>;
  else if (!player && ticket.state === "idle")
    body = <NicknameForm player={null} intro="Sign this meal" submitLabel="Rank it" onDone={(who) => void submit(who)} />;
  else if (ticket.state === "error") body = <p className="ticket-line is-error" role="alert">{ticket.message}</p>;
  else if (ticket.state !== "done") body = <p className="ticket-line" role="status">Counting your meal…</p>;
  else if (!ticket.result.counted)
    body = <p className="ticket-line is-error" role="alert">{ticket.result.message}</p>;
  else {
    const { result } = ticket;
    body = (
      <p className="ticket-score" role="status">
        <b className="ticket-plus">{result.newToday ? "+1" : "✓"}</b>
        <span className="ticket-copy">
          <span className="ticket-kicker">{result.newToday ? (result.newSite ? "New site eaten" : "Eaten again today") : "Already on today’s plate"}</span>
          <span className="ticket-rank">
            {result.today && <>#{result.today.rank} today · </>}
            {result.all?.sites ?? 0} {result.all?.sites === 1 ? "site" : "sites"} all time
          </span>
        </span>
      </p>
    );
  }
  return (
    <div className="meal-ticket">
      {body}
      {board}
      <LeaderboardDialog open={boardOpen} onClose={() => setBoardOpen(false)} />
    </div>
  );
}
