import { useEffect, useRef, useState, type RefObject } from "react";
import {
  ArrowCounterClockwiseIcon,
  CaretLeftIcon,
  CrosshairIcon,
  MinusIcon,
  PauseIcon,
  QuestionIcon,
  PlayIcon,
  PlusIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
} from "@phosphor-icons/react";
import type { Level } from "./shared";
import type { Stats } from "./game";
import { Plate } from "./ui/Plate";
import { Meter } from "./ui/Meter";
import { BallMark, ClockMark } from "./ui/marks";
import { Combo } from "./Combo";
import { BoostButton } from "./BoostButton";
import "./ui/game.css";

export function time(n: number) {
  return `${Math.floor(n / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(n % 60)
    .toString()
    .padStart(2, "0")}`;
}
export const metres = (radius: number, count: number) =>
  count ? ((radius * 2) / 100).toFixed(1) : "0.0";

export function Bracket({ corner }: { corner: "tl" | "tr" | "bl" | "br" }) {
  return (
    <svg
      className={`bracket ${corner}`}
      viewBox="0 0 200 54"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d="M0 0 H200 L150 22 H36 L0 54 Z" fill="var(--ink)" />
      <path
        d="M8 6 H172 L140 16 H30 L8 34 Z"
        fill="none"
        stroke="var(--paper)"
        strokeWidth="3"
        vectorEffect="non-scaling-stroke"
      />
      <path d="M150 22 H200 L180 30 H140 Z" fill="var(--red)" />
    </svg>
  );
}

const NUDGE_KEY = "webivore.helpNudges";
const NUDGE_AFTER = 10;
const NUDGE_TIMES = 2;
const nudgesShown = () => {
  try {
    return Number(localStorage.getItem(NUDGE_KEY)) || 0;
  } catch {
    return NUDGE_TIMES; // no storage: never nag
  }
};

/**
 * "Need help?" above the guide button when no new piece has been found for
 * ten seconds of play. Shown at most twice per browser, then never again.
 */
function HelpNudge({ stats, paused, onHint }: { stats: Stats; paused: boolean; onHint: () => void }) {
  const [open, setOpen] = useState(false);
  const since = useRef<{ count: number; time: number } | null>(null);
  /** Found a piece on their own while the callout was up: no more callouts this run. */
  const solved = useRef(false);
  const active = stats.ready && !stats.done && !stats.error && !paused;
  useEffect(() => {
    if (!since.current || stats.count !== since.current.count || stats.guiding) {
      since.current = { count: stats.count, time: stats.time };
      if (open) {
        solved.current = true;
        setOpen(false);
      }
      return;
    }
    if (!open && !solved.current && active && stats.time - since.current.time >= NUDGE_AFTER && nudgesShown() < NUDGE_TIMES) {
      try {
        localStorage.setItem(NUDGE_KEY, String(nudgesShown() + 1));
      } catch {
        /* ignore */
      }
      setOpen(true);
    }
  }, [stats.count, stats.time, stats.guiding, active, open]);
  if (!open || !active) return null;
  return (
    <button
      type="button"
      className="help-nudge"
      onClick={() => {
        setOpen(false);
        onHint();
      }}
    >
      <b className="display">Need help?</b>
      <span className="label">Click me</span>
    </button>
  );
}

export function Hud({
  stats,
  level,
  site,
  paused,
  muted,
  countdown,
  mapHost,
  onPause,
  onMute,
  onLeave,
  onZoom,
  onRecenter,
  onBoost,
  boostCharge,
  onReset,
  onHint,
  viewport,
}: {
  stats: Stats;
  level: Level;
  site: string;
  paused: boolean;
  muted: boolean;
  countdown: number | null;
  mapHost: RefObject<HTMLDivElement | null>;
  onPause: () => void;
  onMute: () => void;
  onLeave: () => void;
  onZoom: (f: number) => void;
  onRecenter: () => void;
  onBoost: () => void;
  boostCharge: () => number;
  onReset: () => void;
  onHint: () => void;
  viewport: { width: number; height: number };
}) {
  return (
    <>
      <svg
        className="game-frame"
        viewBox="0 0 1536 1024"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M18 260 60 216H1185L1220 234H1477L1518 273V877L1498 900H1176L1137 935H1017L994 954H578L520 875H191L162 847H44L18 820Z"
          fill="none"
          stroke="white"
          strokeWidth="28"
        />
        <path
          d="M18 260 60 216H1185L1220 234H1477L1518 273V877L1498 900H1176L1137 935H1017L994 954H578L520 875H191L162 847H44L18 820Z"
          fill="none"
          stroke="var(--ink)"
          strokeWidth="10"
        />
        <path
          d="M18 820 44 847H162L191 875H520L578 954H994L1017 935H1137L1176 900H1498L1518 877V974L1492 997H1203L1155 973H1014L983 1000H858L821 973H638L607 1000H41L18 977Z"
          fill="var(--ink)"
        />
        <path
          d="M21 650v84 M45 846h15l-25 24H21 M65 846h15l-25 24H41 M1020 935h26l-41 55h-26 M1060 935h26l-41 55h-26"
          fill="var(--red)"
        />
        <path
          d="M877 956h18l22 18-22 18h-18l22-18z M910 956h18l22 18-22 18h-18l22-18z M943 956h18l22 18-22 18h-18l22-18z"
          fill="white"
        />
      </svg>
      <div className="hud-top">
        <Meter
          percent={stats.done ? 100 : stats.percent}
          count={stats.count}
          total={level.pieces.length}
        />
      </div>
      <div className="hud-map">
        <Plate
          shape="cut"
          cut={20}
          corners={["tr", "bl"]}
          fill="var(--paper)"
          line="var(--ink)"
          lineWidth={4}
          inset={0}
          className="map-plate"
        >
          <div ref={mapHost} className="map-host" />
        </Plate>
        <div className="map-side">
          <Plate
            as="button"
            shape="cut"
            cut={10}
            className="glyph-button"
            onClick={onPause}
            aria-label={paused ? "Resume" : "Pause"}
            aria-pressed={paused}
          >
            {paused ? <PlayIcon weight="fill" /> : <PauseIcon weight="fill" />}
          </Plate>
          <Plate
            as="button"
            shape="cut"
            cut={10}
            className="glyph-button"
            onClick={onMute}
            aria-label={muted ? "Enable sound" : "Mute sound"}
            aria-pressed={muted}
          >
            {muted ? (
              <SpeakerSlashIcon weight="fill" />
            ) : (
              <SpeakerHighIcon weight="fill" />
            )}
          </Plate>
        </div>
        <Plate
          as="button"
          shape="tag"
          cut={14}
          className="site-rail"
          onClick={onLeave}
          title="Back to websites"
          aria-label={`Back to websites, now eating ${site}`}
        >
          <CaretLeftIcon weight="bold" />
          <span className="site-name">{site}</span>
          {level.truncated && (
            <span className="label site-note">page cut at 9000 px</span>
          )}
        </Plate>
      </div>
      <div className="hud-stats">
        <Plate shape="tag" cut={26} className="stats-rail" inset={5}>
          <BallMark className="stat-mark" />
          <span className="stat">
            <span className="label">Size</span>
            <strong className="display">
              {metres(stats.radius, stats.count)}
              <small>m</small>
            </strong>
          </span>
          <i className="stat-divider" aria-hidden="true" />
          <ClockMark className="stat-mark" />
          <span className="stat">
            <span className="label">Time</span>
            <strong className="display">{time(stats.time)}</strong>
          </span>
          <span className="label stat-count">
            {stats.count} / {level.pieces.length} pieces
          </span>
        </Plate>
      </div>
      <div className="hud-camera">
        <HelpNudge stats={stats} paused={paused} onHint={onHint} />
        {stats.ready && !stats.done && <BoostButton className="hud-boost" onBoost={onBoost} charge={boostCharge} keyLabel="Space" />}
        <button
          className="guide-button"
          onClick={onHint}
          aria-label="Guide to nearest collectible"
          aria-pressed={stats.guiding}
          aria-keyshortcuts="H"
          title="Guide to nearest collectible (H)"
          disabled={!stats.ready || stats.done}
        >
          <QuestionIcon weight="bold" />
          <span>H</span>
        </button>
        <Plate
          shape="cut"
          cut={22}
          corners={["tl", "br"]}
          fill="var(--paper)"
          line="var(--ink)"
          lineWidth={4}
          inset={0}
          className="camera-plate"
        >
          <span className="label camera-label">
            {stats.free ? "Free camera" : "Orbit camera"}
            <span className="camera-zoom">{Math.round(stats.zoom * 100)}%</span>
          </span>
          <span className="camera-buttons">
            <Plate
              as="button"
              shape="cut"
              cut={9}
              className="glyph-button"
              onClick={() => onZoom(0.8)}
              aria-label="Zoom out"
            >
              <MinusIcon weight="bold" />
            </Plate>
            <Plate
              as="button"
              shape="cut"
              cut={9}
              className="glyph-button"
              onClick={() => onZoom(1.25)}
              aria-label="Zoom in"
            >
              <PlusIcon weight="bold" />
            </Plate>
            <Plate
              as="button"
              shape="cut"
              cut={9}
              className="glyph-button"
              onClick={onRecenter}
              aria-label="Follow character"
            >
              <CrosshairIcon weight="bold" />
            </Plate>
            <Plate
              as="button"
              shape="cut"
              cut={9}
              className="glyph-button camera-reset"
              onClick={onReset}
              aria-label="Reset camera"
            >
              <ArrowCounterClockwiseIcon weight="bold" />
              <span className="reset-text">Reset</span>
            </Plate>
          </span>
        </Plate>
      </div>
      <p className={`hint hud-hint${stats.looked ? " looked" : ""}`}>
        <span className="keys-hint">
          <b>WASD</b> walk · <b>drag</b> orbit · <b>right-drag</b> pan ·{" "}
          <b>Q/E</b> turn · <b>space</b> boost · <b>F</b> follow · <b>esc</b> pause · <b>H</b>{" "}
          hint
        </span>
        {!stats.looked && (
          <span className="touch-hint">
            <b>joystick</b> walk · <b>swipe</b> look
          </span>
        )}
      </p>
      {stats.ready && !stats.done && (
        <Combo pickups={stats.pickups} />
      )}
      {countdown !== null && stats.ready && !stats.error && (
        <div className="countdown" aria-live="assertive">
          <strong className="display outlined">
            {countdown === 0 ? "GO" : countdown}
          </strong>
        </div>
      )}
    </>
  );
}
