import "@fontsource/tektur/700.css";
import "./style.css";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { TouchControls, useTouchControls } from "./TouchControls";
import { importLocalFile, type ImportKind } from "./local-import";
import { downloadLevelFile, levelSource, type LevelSource } from "./level-file";
import { loadRemoteLevel, SnapshotError } from "./remote-level";
import { routeAt } from "./paths";

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
  guiding: true,
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
    [loadingMessage, setLoadingMessage] = useState(""),
    [error, setError] = useState(""),
    [importError, setImportError] = useState(""),
    [notice, setNotice] = useState(""),
    [turnstileNeeded, setTurnstileNeeded] = useState(false),
    [pendingUrl, setPendingUrl] = useState(""),
    [level, setLevel] = useState<Level | null>(null),
    [source, setSource] = useState<LevelSource | null>(null),
    [stats, setStats] = useState(initial),
    [muted, setMuted] = useState(false),
    [paused, setPaused] = useState(false),
    [countdown, setCountdown] = useState<number | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null),
    mapHost = useRef<HTMLDivElement>(null),
    game = useRef<Game | null>(null),
    operation = useRef<AbortController | null>(null);
  const pauseRef = useRef(false);
  const viewport = useViewport();
  const touchControls = useTouchControls();
  const moveStick = useCallback(
    (x: number, y: number) => game.current?.setStick(x, y),
    [],
  );
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
      if (game.current.paused) game.current.clearPointerInput();
    }
  }, [muted, paused, countdown]);
  const cancel = useCallback(() => {
    operation.current?.abort(new DOMException("Cancelled", "AbortError"));
    operation.current = null;
    setLoading(false);
    setLoadingMessage("");
  }, []);
  async function load(value = url, turnstileToken?: string) {
    operation.current?.abort();
    const controller = new AbortController();
    operation.current = controller;
    setLoading(true);
    setLoadingMessage(
      turnstileToken
        ? "Verification accepted. Capturing the page…"
        : "Checking the level cache…",
    );
    setError("");
    setNotice("");
    setTurnstileNeeded(false);
    try {
      const result = await loadRemoteLevel(value, {
        signal: controller.signal,
        turnstileToken,
      });
      if (controller.signal.aborted) return;
      setSource({
        kind: "remote",
        url: result.level.url,
        degraded: result.degraded,
      });
      setNotice(
        result.degraded
          ? "This site used a safe simplified media or sign-in fallback."
          : result.cache === "hit"
            ? "Loaded from the shared level cache."
            : "New level captured and cached.",
      );
      setLevel(result.level);
    } catch (reason) {
      if (controller.signal.aborted) return;
      const failure = reason as Error;
      if (
        failure instanceof SnapshotError &&
        failure.code === "TURNSTILE_REQUIRED"
      ) {
        setPendingUrl(value);
        setTurnstileNeeded(true);
      } else setError(failure.message);
    } finally {
      if (operation.current === controller) {
        operation.current = null;
        setLoading(false);
        setLoadingMessage("");
      }
    }
  }
  async function importFile(file: File, kind?: ImportKind) {
    operation.current?.abort();
    const controller = new AbortController();
    operation.current = controller;
    setLoading(true);
    setLoadingMessage(
      kind === "level"
        ? "Validating portable level…"
        : kind === "html"
          ? "Building a safe local page…"
          : "Cutting the image into playable fragments…",
    );
    setError("");
    setImportError("");
    setNotice("");
    setTurnstileNeeded(false);
    try {
      const imported = await importLocalFile(file, kind, controller.signal);
      if (controller.signal.aborted) return;
      setSource(imported.source);
      setNotice(
        imported.notice ??
          "Local level ready. The file never left this browser.",
      );
      setLevel(imported.level);
    } catch (reason) {
      if (!controller.signal.aborted)
        setImportError((reason as Error).message);
    } finally {
      if (operation.current === controller) {
        operation.current = null;
        setLoading(false);
        setLoadingMessage("");
      }
    }
  }
  const togglePause = () => {
    pauseRef.current = !paused;
    setPaused(!paused);
  };
  const leave = () => {
    cancel();
    setLevel(null);
    setSource(null);
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
          onDemo={() => {
            const demo = demoLevel();
            setSource(levelSource(demo));
            setNotice("Demo runs entirely in this browser.");
            setLevel(demo);
          }}
          onImport={(file, kind) => void importFile(file, kind)}
          onCancel={cancel}
          muted={muted}
          setMuted={setMuted}
          loadingMessage={loadingMessage}
          importError={importError}
          notice={notice}
          turnstileNeeded={turnstileNeeded}
          turnstileSiteKey={String(
            import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "",
          )}
          onTurnstileToken={(token) => void load(pendingUrl || url, token)}
        />
      </>
    );
  const site = siteLabel(level.url);
  return (
    <main className={`playing${touchControls ? " touch-playing" : ""}`}>
      <BrandCursor />
      <canvas
        ref={canvas}
        className="stage"
        aria-label={
          touchControls
            ? "3D website world. Joystick to walk; swipe to rotate camera."
            : "3D website world. WASD to walk; drag to orbit; right-drag to pan; scroll to zoom; Space to follow."
        }
      />
      {touchControls &&
        stats.ready &&
        !stats.done &&
        !stats.error &&
        !paused &&
        countdown === null && <TouchControls onMove={moveStick} />}
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
          onHint={() => game.current?.toggleHint()}
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
            <Plate
              as="button"
              shape="chip"
              className="chip"
              onClick={() => downloadLevelFile(level, source ?? undefined)}
            >
              Export level
            </Plate>
          </Plate>
        </div>
      )}
      {stats.done && game.current && (
        <Finish
          game={game.current}
          onLeave={leave}
          onExportLevel={() =>
            downloadLevelFile(level, source ?? undefined)
          }
        />
      )}
    </main>
  );
}
const appRoot = createRoot(document.getElementById("root")!);
appRoot.render(
  routeAt(location.pathname, "rabbit-editor", import.meta.env.BASE_URL) ? (
    <RabbitEditor />
  ) : new URLSearchParams(location.search).get("lab") === "rabbit" ? (
    <RabbitLab />
  ) : (
    <App />
  ),
);
if (import.meta.hot) import.meta.hot.dispose(() => appRoot.unmount());
