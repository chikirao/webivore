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
export const metres = (radius: number, count: number) => (count ? ((radius * 2) / 100).toFixed(1) : "0.0");

export function Bracket({ corner }: { corner: "tl" | "tr" | "bl" | "br" }) {
  return (
    <svg className={`bracket ${corner}`} viewBox="0 0 200 54" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 0 H200 L150 22 H36 L0 54 Z" fill="var(--ink)" />
      <path d="M8 6 H172 L140 16 H30 L8 34 Z" fill="none" stroke="var(--paper)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
      <path d="M150 22 H200 L180 30 H140 Z" fill="var(--red)" />
    </svg>
  );
}

type Shown = PickupEvent & { slot: number };
const hash = (n: number) => ((Math.imul(n + 1, 2654435761) >>> 0) % 1000) / 1000;
/**
 * Pickup feedback pinned to where the bite happened: the world point is projected
 * by the game, a deterministic scatter separates simultaneous bites, and the
 * result is clamped inside the play area away from the HUD. Bounded pool of four.
 */
export function PickupSignals({ pickups, width, height }: { pickups: PickupEvent[]; width: number; height: number }) {
  const [shown, setShown] = useState<Shown[]>([]);
  const seen = useRef(new Set<number>());
  useEffect(() => {
    const fresh = pickups.filter((p) => !seen.current.has(p.id));
    if (!fresh.length) return;
    for (const p of fresh) seen.current.add(p.id);
    setShown((s) => [...s, ...fresh.map((p, i) => ({ ...p, slot: (s.length + i) % 4 }))].slice(-4));
    const timer = setTimeout(() => setShown((s) => s.filter((p) => !fresh.includes(p))), 1150);
    return () => clearTimeout(timer);
  }, [pickups]);
  if (!width || !height) return null;
  return (
    <div className="signals" aria-live="polite">
      {shown.map((p) => {
        const h = hash(p.id);
        const x = Math.min(width * 0.9, Math.max(width * 0.1, p.x + (h - 0.5) * 90));
        const y = Math.min(height * 0.78, Math.max(height * 0.25, p.y - 30 - (h * 40) - p.slot * 8));
        return (
          <div key={p.id} className={`signal ${p.big ? "big" : ""}`} style={{ left: x, top: y }}>
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
      <Bracket corner="tl" />
      <Bracket corner="tr" />
      <Bracket corner="bl" />
      <Bracket corner="br" />
      <div className="hud-top">
        <Meter percent={stats.done ? 100 : stats.percent} count={stats.count} total={level.pieces.length} />
      </div>
      <div className="hud-map">
        <Plate shape="cut" cut={20} corners={["tr", "bl"]} fill="var(--paper)" line="var(--ink)" lineWidth={4} inset={0} className="map-plate">
          <div ref={mapHost} className="map-host" />
        </Plate>
        <div className="map-side">
          <Plate as="button" shape="cut" cut={10} className="glyph-button" onClick={onPause} aria-label={paused ? "Resume" : "Pause"} aria-pressed={paused}>
            {paused ? <PlayIcon weight="fill" /> : <PauseIcon weight="fill" />}
          </Plate>
          <Plate as="button" shape="cut" cut={10} className="glyph-button" onClick={onMute} aria-label={muted ? "Enable sound" : "Mute sound"} aria-pressed={muted}>
            {muted ? <SpeakerSlashIcon weight="fill" /> : <SpeakerHighIcon weight="fill" />}
          </Plate>
        </div>
        <Plate as="button" shape="tag" cut={14} className="site-rail" onClick={onLeave} title="Back to websites">
          <CaretLeftIcon weight="bold" />
          <span className="site-name">{site}</span>
          {level.truncated && <span className="label site-note">page cut at 9000 px</span>}
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
        <Plate shape="cut" cut={22} corners={["tl", "br"]} fill="var(--paper)" line="var(--ink)" lineWidth={4} inset={0} className="camera-plate">
          <span className="label camera-label">
            {stats.free ? "Free camera" : "Orbit camera"} · {Math.round(stats.zoom * 100)}%
          </span>
          <span className="camera-buttons">
            <Plate as="button" shape="cut" cut={9} className="glyph-button" onClick={() => onZoom(0.8)} aria-label="Zoom out">
              <MinusIcon weight="bold" />
            </Plate>
            <Plate as="button" shape="cut" cut={9} className="glyph-button" onClick={() => onZoom(1.25)} aria-label="Zoom in">
              <PlusIcon weight="bold" />
            </Plate>
            <Plate as="button" shape="cut" cut={9} className="glyph-button" onClick={onRecenter} aria-label="Follow character">
              <CrosshairIcon weight="bold" />
            </Plate>
            <Plate as="button" shape="cut" cut={9} className="glyph-button camera-reset" onClick={onReset} aria-label="Reset camera">
              <ArrowCounterClockwiseIcon weight="bold" />
              <span className="reset-text">Reset</span>
            </Plate>
          </span>
        </Plate>
      </div>
      <p className="hint hud-hint">
        <span className="keys-hint">
          <b>WASD</b> walk · <b>drag</b> orbit · <b>right-drag</b> pan · <b>Q/E</b> turn · <b>space</b> follow · <b>esc</b> pause
        </span>
        <span className="touch-hint">
          <b>left thumb</b> walk · <b>right thumb</b> look
        </span>
      </p>
      {stats.ready && !stats.done && <PickupSignals pickups={stats.pickups} width={viewport.width} height={viewport.height} />}
      {countdown !== null && stats.ready && !stats.error && (
        <div className="countdown" aria-live="assertive">
          <strong className="display outlined">{countdown === 0 ? "GO" : countdown}</strong>
        </div>
      )}
    </>
  );
}
