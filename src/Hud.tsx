import { useEffect, useRef, useState, type RefObject } from "react";
import {
  ArrowCounterClockwiseIcon,
  CaretLeftIcon,
  CrosshairIcon,
  MinusIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
} from "@phosphor-icons/react";
import type { Level } from "./shared";
import type { PickupEvent, Stats } from "./game";
import { Plate } from "./ui/Plate";
import { Meter } from "./ui/Meter";
import { BallMark, Burst, ClockMark } from "./ui/marks";
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

type Shown = PickupEvent & { slot: number };
const hash = (n: number) =>
  ((Math.imul(n + 1, 2654435761) >>> 0) % 1000) / 1000;
/**
 * Pickup feedback pinned to where the bite happened: the world point is projected
 * by the game, a deterministic scatter separates simultaneous bites, and the
 * result is clamped inside the play area away from the HUD. Bounded pool of four.
 */
export function PickupSignals({
  pickups,
  width,
  height,
}: {
  pickups: PickupEvent[];
  width: number;
  height: number;
}) {
  const [shown, setShown] = useState<Shown[]>([]);
  const seen = useRef(new Set<number>());
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  useEffect(
    () => () => {
      for (const t of timers.current.values()) clearTimeout(t);
    },
    [],
  );
  useEffect(() => {
    const fresh = pickups.filter((p) => !seen.current.has(p.id));
    if (!fresh.length) return;
    for (const p of fresh) seen.current.add(p.id);
    if (seen.current.size > 64)
      seen.current = new Set([...seen.current].slice(-32));
    setShown((s) =>
      [
        ...s,
        ...fresh.map((p, i) => ({ ...p, slot: (s.length + i) % 4 })),
      ].slice(-4),
    );
    for (const p of fresh) {
      timers.current.set(
        p.id,
        setTimeout(() => {
          setShown((s) => s.filter((shown) => shown.id !== p.id));
          timers.current.delete(p.id);
        }, 1150),
      );
    }
  }, [pickups]);
  if (!width || !height) return null;
  return (
    <div className="signals" aria-live="polite">
      {shown.map((p) => {
        const h = hash(p.id);
        const half = Math.min(115, width * 0.28);
        const x = Math.min(
          width - half - 12,
          Math.max(half + 12, p.x + (h - 0.5) * 120),
        );
        const hudBottom =
          height *
          (width <= 800 && x > width * 0.55
            ? 0.32
            : width <= 520
              ? 0.15
              : width <= 800
                ? 0.16
                : 0.22);
        const y = Math.min(
          height * 0.79,
          Math.max(
            hudBottom + (p.big ? 170 : 70),
            p.y - 20 - h * 35 - p.slot * 12,
          ),
        );
        return (
          <div
            key={p.id}
            className={`signal ${p.big ? "big" : ""}`}
            style={{ left: x, top: y }}
          >
            {p.big ? (
              <Burst>
                Big
                <br />
                bite
              </Burst>
            ) : (
              <b className="display got-it">Got it</b>
            )}
            <span className="signal-label">{p.label}</span>
          </div>
        );
      })}
    </div>
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
  onReset,
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
  onReset: () => void;
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
            {stats.free ? "Free camera" : "Orbit camera"} ·{" "}
            {Math.round(stats.zoom * 100)}%
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
      <p className="hint hud-hint">
        <span className="keys-hint">
          <b>WASD</b> walk · <b>drag</b> orbit · <b>right-drag</b> pan ·{" "}
          <b>Q/E</b> turn · <b>space</b> follow · <b>esc</b> pause
        </span>
        <span className="touch-hint">
          <b>left thumb</b> walk · <b>right thumb</b> look
        </span>
      </p>
      {stats.ready && !stats.done && (
        <PickupSignals
          pickups={stats.pickups}
          width={viewport.width}
          height={viewport.height}
        />
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
