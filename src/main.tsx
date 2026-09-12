import "@fontsource/tektur/700.css";
import "./style.css";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Game, type Stats } from "./game";
import { demoLevel } from "./demo";
import type { Level } from "./shared";
import { BrandCursor } from "./BrandCursor";
import { RabbitLab } from "./RabbitLab";
import { RabbitEditor } from "./RabbitEditor";
import { Entry } from "./Entry";
import { Hud } from "./Hud";
import { Finish, siteLabel } from "./Finish";
import { Plate } from "./ui/Plate";
import { Chevrons } from "./ui/marks";
import { PlayIcon } from "@phosphor-icons/react";

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
  pickups: [],
};

function useViewport() {
  const [size, setSize] = useState({ width: innerWidth, height: innerHeight });
  useEffect(() => {
    const on = () => setSize({ width: innerWidth, height: innerHeight });
    addEventListener("resize", on);
    return () => removeEventListener("resize", on);
  }, []);
  return size;
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
    mapHost = useRef<HTMLDivElement>(null),
    game = useRef<Game | null>(null);
  const pauseRef = useRef(false);
  const viewport = useViewport();
  useEffect(() => {
    if (!level || !canvas.current) return;
    setStats(initial);
    pauseRef.current = false;
    setPaused(false);
    setCountdown(3);
    let g: Game;
    try {
      g = new Game(
        canvas.current,
        level,
        setStats,
        () => {
          pauseRef.current = !pauseRef.current;
          setPaused(pauseRef.current);
        },
        mapHost.current,
      );
    } catch (e) {
      setStats({
        ...initial,
        error: `3D graphics could not start: ${(e as Error).message}`,
      });
      return;
    }
    g.paused = true;
    game.current = g;
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
  if (!level)
    return (
      <>
        <BrandCursor />
        <Entry
          url={url}
          setUrl={setUrl}
          loading={loading}
          error={error}
          onStart={(v) => void load(v)}
          onDemo={() => setLevel(demoLevel())}
          muted={muted}
          setMuted={setMuted}
        />
      </>
    );
  const site = siteLabel(level.url);
  return (
    <main className="playing">
      <BrandCursor />
      <canvas
        ref={canvas}
        className="stage"
        aria-label="3D website world. WASD to walk; drag to orbit; right-drag to pan; scroll to zoom; Space to follow."
      />
      <div inert={stats.done}>
        <Hud
          stats={stats}
          level={level}
          site={site}
          paused={paused}
          muted={muted}
          countdown={countdown}
          mapHost={mapHost}
          onPause={togglePause}
          onMute={() => setMuted(!muted)}
          onLeave={leave}
          onZoom={(f) => game.current?.zoom(f)}
          onRecenter={() => game.current?.recenter()}
          onReset={() => game.current?.resetCamera()}
          viewport={viewport}
        />
      </div>
      {!stats.ready && !stats.error && (
        <div className="overlay">
          <Plate
            shape="cut"
            cut={30}
            fill="var(--paper)"
            line="var(--ink)"
            lineWidth={4}
            inset={0}
            className="panel"
          >
            <h2 className="display">Making a meal.</h2>
            <p role="status">Building your 3D world…</p>
          </Plate>
        </div>
      )}
      {stats.error && (
        <div className="overlay">
          <Plate
            shape="cut"
            cut={30}
            fill="var(--paper)"
            line="var(--ink)"
            lineWidth={4}
            inset={0}
            className="panel"
          >
            <h2 className="display">Oops.</h2>
            <p role="alert">{stats.error}</p>
            <Plate
              as="button"
              shape="key"
              fill="var(--red)"
              className="key"
              onClick={leave}
            >
              Back to websites
              <Chevrons className="chev" />
            </Plate>
          </Plate>
        </div>
      )}
      {paused && !stats.done && stats.ready && (
        <div className="overlay">
          <Plate
            shape="cut"
            cut={30}
            fill="var(--paper)"
            line="var(--ink)"
            lineWidth={4}
            inset={0}
            className="panel"
          >
            <span className="label">Paused</span>
            <h2 className="display">Still hungry?</h2>
            <Plate
              as="button"
              shape="key"
              fill="var(--red)"
              className="key"
              onClick={togglePause}
              autoFocus
            >
              Keep walking
              <PlayIcon weight="fill" />
            </Plate>
            <Plate as="button" shape="chip" className="chip" onClick={leave}>
              Choose another website
            </Plate>
          </Plate>
        </div>
      )}
      {stats.done && game.current && (
        <Finish game={game.current} onLeave={leave} />
      )}
    </main>
  );
}
const appRoot = createRoot(document.getElementById("root")!);
appRoot.render(
  location.pathname === "/rabbit-editor" ? (
    <RabbitEditor />
  ) : new URLSearchParams(location.search).get("lab") === "rabbit" ? (
    <RabbitLab />
  ) : (
    <App />
  ),
);
if (import.meta.hot) import.meta.hot.dispose(() => appRoot.unmount());
