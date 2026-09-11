import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Game, type Stats } from "./game";
import { demoLevel } from "./demo";
import { maxCollectionRadius, type Level } from "./shared";
import "./style.css";
import { Trophy } from "./Trophy";
import { BrandCursor } from "./BrandCursor";
import { RabbitLab } from "./RabbitLab";
import { ProgressDial, PickupSignal } from "./Circuit";
import {
  ArrowRightIcon,
  GlobeIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
  PauseIcon,
  PlayIcon,
  MinusIcon,
  PlusIcon,
  CrosshairIcon,
  ArrowCounterClockwiseIcon,
  TimerIcon,
  SphereIcon,
} from "@phosphor-icons/react";
import "@fontsource/tektur/700.css";
const initial: Stats = {
  count: 0,
  percent: 0,
  radius: 0,
  time: 0,
  score: 0,
  label: "",
  free: false,
  zoom: 1,
  done: false,
  ready: false,
  error: "",
};
function time(n: number) {
  return `${Math.floor(n / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(n % 60)
    .toString()
    .padStart(2, "0")}`;
}
function App() {
  const [url, setUrl] = useState(""),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [level, setLevel] = useState<Level | null>(null),
    [stats, setStats] = useState(initial),
    [muted, setMuted] = useState(false),
    [paused, setPaused] = useState(false),
    [countdown, setCountdown] = useState<number | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null),
    game = useRef<Game | null>(null);
  const pauseRef = useRef(false);
  useEffect(() => {
    if (!level || !canvas.current) return;
    setStats(initial);
    pauseRef.current = false;
    setPaused(false);
    setCountdown(3);
    let g: Game;
    try {
      g = new Game(canvas.current, level, setStats, () => {
        pauseRef.current = !pauseRef.current;
        setPaused(pauseRef.current);
      });
    } catch (e) {
      setStats({
        ...initial,
        error: `3D graphics could not start: ${(e as Error).message}`,
      });
      return;
    }
    g.paused = true;
    game.current = g;
    if (import.meta.env.DEV)
      (window as unknown as { __game?: Game }).__game = g;
    return () => {
      g.destroy();
      game.current = null;
      delete (window as unknown as { __game?: Game }).__game;
    };
  }, [level]);
  useEffect(() => {
    if (!stats.ready || !game.current) return;
    let n = 3;
    const timer = setInterval(() => {
      n--;
      setCountdown(n);
      if (n < 0) {
        clearInterval(timer);
        setCountdown(null);
      }
    }, 800);
    return () => clearInterval(timer);
  }, [stats.ready]);
  useEffect(() => {
    if (game.current) {
      game.current.muted = muted;
      game.current.paused = paused || countdown !== null;
    }
  }, [muted, paused, countdown]);
  async function load(value = url) {
    setLoading(true);
    setError("");
    try {
      const full = /^https?:\/\//i.test(value) ? value : `https://${value}`;
      const parsed = new URL(full);
      if (!parsed.hostname.includes("."))
        throw new Error("Enter a public website, for example example.com.");
      const r = await fetch("/api/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: full }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Could not load website.");
      setLevel(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  const togglePause = () => {
    pauseRef.current = !paused;
    setPaused(!paused);
  };
  const leave = () => {
    setLevel(null);
    setStats(initial);
  };
  const site = level
    ? level.url.startsWith("demo:")
      ? "THE SMALL INTERNET"
      : new URL(level.url).hostname
    : "";
  return (
    <main className={level ? "playing" : "landing"}>
      <BrandCursor />
      {!level ? (
        <>
          <div className="entry-art" aria-hidden="true" />
          <header className="masthead">
            <span className="entry-motto">
              SURF
              <br />
              BITE
              <br />
              REPEAT
            </span>
            <a href="/" className="author">
              chikirao
            </a>
          </header>
          <section
            className="intro"
            aria-label="WEBIVORE — websites taste better here"
          >
            <h1 className="sr-only">WEBIVORE</h1>
            <div className="entry-panel">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void load();
                }}
              >
                <label className="sr-only" htmlFor="url">
                  Enter a website
                </label>
                <div className="url-entry">
                  <GlobeIcon weight="bold" aria-hidden="true" />
                  <input
                    id="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="enter a website"
                    autoComplete="url"
                    required
                    disabled={loading}
                  />
                  <button
                    className="consume red-button"
                    disabled={loading}
                    type="submit"
                  >
                    {loading ? "LOADING" : "START"}
                    <ArrowRightIcon weight="bold" />
                  </button>
                </div>
              </form>
              <button
                className="demo silver-button"
                disabled={loading}
                onClick={() => setLevel(demoLevel())}
              >
                <ArrowRightIcon weight="bold" />
                try demo
              </button>
              <div className="presets">
                {[
                  ["Wikipedia", "https://en.wikipedia.org/wiki/Internet"],
                  ["Hacker News", "https://news.ycombinator.com"],
                ].map(([name, href]) => (
                  <button
                    key={name}
                    disabled={loading}
                    onClick={() => {
                      setUrl(href);
                      void load(href);
                    }}
                  >
                    {name}
                  </button>
                ))}
              </div>
              {loading && (
                <p className="loading" role="status">
                  Cutting the page into bites… <small>Up to 55 seconds.</small>
                </p>
              )}
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
            </div>
          </section>
          <footer className="landing-footer">
            <span>
              A HUNGRIER
              <br />
              INTERNET
            </span>
            <span>WASD to walk · Drag to orbit · Scroll to zoom</span>
            <button
              className="sound"
              onClick={() => setMuted(!muted)}
              aria-label={muted ? "Enable sound" : "Mute sound"}
            >
              {muted ? (
                <SpeakerSlashIcon weight="fill" />
              ) : (
                <SpeakerHighIcon weight="fill" />
              )}
            </button>
          </footer>
        </>
      ) : (
        <>
          <div className="game-frame">
            <canvas
              ref={canvas}
              aria-label="3D website world. WASD to walk; drag to orbit; right-drag to pan; scroll to zoom; Space to follow."
            />
          </div>
          <header className="hud">
            <button
              className="hud-brand"
              aria-label="Back to websites"
              onClick={leave}
            >
              <img src="/assets/circuit-logo.png" alt="WEBIVORE" />
            </button>
            <div className="site-name">
              {site}
              <small>
                {level.truncated
                  ? "CAPTURED PAGE · HEIGHT LIMITED"
                  : "WEBSITES TASTE BETTER HERE"}
              </small>
            </div>
          </header>
          <div className="hud-actions">
            <button
              className="icon-button"
              onClick={() => setMuted(!muted)}
              aria-label={muted ? "Enable sound" : "Mute sound"}
            >
              {muted ? (
                <SpeakerSlashIcon weight="fill" />
              ) : (
                <SpeakerHighIcon weight="fill" />
              )}
            </button>
            <button
              className="icon-button"
              onClick={togglePause}
              aria-label={paused ? "Resume" : "Pause"}
            >
              {paused ? (
                <PlayIcon weight="fill" />
              ) : (
                <PauseIcon weight="fill" />
              )}
            </button>
          </div>
          <ProgressDial
            percent={stats.done ? 100 : stats.percent}
            count={stats.count}
          />
          <div className="secondary-stats silver-panel">
            <SphereIcon weight="bold" />
            <div>
              <span>SIZE</span>
              <strong>
                {stats.count ? ((stats.radius * 2) / 100).toFixed(1) : "0.0"}
                <small>m</small>
              </strong>
            </div>
            <TimerIcon weight="bold" />
            <div>
              <span>TIME</span>
              <strong>{time(stats.time)}</strong>
            </div>
            <small className="piece-count">
              {stats.count} / {level.pieces.length} PIECES · MAX{" "}
              {((maxCollectionRadius(level.pieces.length) * 2) / 100).toFixed(
                1,
              )}
              m
            </small>
          </div>
          {stats.ready && !stats.done && (
            <PickupSignal count={stats.count} label={stats.label} />
          )}
          <div className="camera silver-panel">
            <span>
              {stats.free ? "FREE CAMERA" : "ORBIT CAMERA"} ·{" "}
              {Math.round(stats.zoom * 100)}%
            </span>
            <div>
              <button
                className="icon-button"
                aria-label="Zoom out"
                onClick={() => game.current?.zoom(0.8)}
              >
                <MinusIcon weight="bold" />
              </button>
              <button
                className="icon-button"
                aria-label="Zoom in"
                onClick={() => game.current?.zoom(1.25)}
              >
                <PlusIcon weight="bold" />
              </button>
              <button
                className="icon-button"
                aria-label="Follow character"
                onClick={() => {
                  game.current?.recenter();
                }}
              >
                <CrosshairIcon weight="bold" />
              </button>
              <button
                className="icon-button"
                aria-label="Reset camera"
                onClick={() => game.current?.resetCamera()}
              >
                <ArrowCounterClockwiseIcon weight="bold" />
              </button>
            </div>
          </div>
          <div className="game-help">
            <span>
              WASD / ARROWS — WALK · DRAG — ORBIT · RIGHT-DRAG — PAN · Q/E —
              TURN · SPACE — FOLLOW
            </span>
            <span className="touch-help">
              LEFT THUMB — WALK · RIGHT THUMB — LOOK
            </span>
          </div>
          {!stats.ready && !stats.error && (
            <div className="overlay">
              <div className="pause-panel silver-panel">
                <h2>
                  Making
                  <br />a meal.
                </h2>
                <p role="status">Building your 3D world…</p>
              </div>
            </div>
          )}
          {stats.error && (
            <div className="overlay">
              <div className="pause-panel silver-panel">
                <h2>Oops.</h2>
                <p role="alert">{stats.error}</p>
                <button className="red-button" onClick={leave}>
                  BACK TO WEBSITES
                  <ArrowRightIcon weight="bold" />
                </button>
              </div>
            </div>
          )}
          {countdown !== null && stats.ready && !stats.error && (
            <div className="countdown">
              <strong>{countdown === 0 ? "GO!" : countdown}</strong>
              <span>START SMALL. EAT BIG.</span>
            </div>
          )}
          {paused && !stats.done && stats.ready && (
            <div className="overlay">
              <div className="pause-panel silver-panel">
                <span className="eyebrow">TAKE A BREATHER</span>
                <h2>Still hungry?</h2>
                <button className="red-button" onClick={togglePause}>
                  KEEP WALKING
                  <PlayIcon weight="fill" />
                </button>
                <button className="silver-button" onClick={leave}>
                  Choose another website
                </button>
              </div>
            </div>
          )}
          {stats.done && game.current && (
            <Trophy game={game.current} onLeave={leave} />
          )}
        </>
      )}
    </main>
  );
}
const appRoot = createRoot(document.getElementById("root")!);
appRoot.render(
  new URLSearchParams(location.search).get("lab") === "rabbit" ? <RabbitLab /> : <App />,
);
if (import.meta.hot) import.meta.hot.dispose(() => appRoot.unmount());
