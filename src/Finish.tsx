import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { DownloadSimpleIcon, PlayIcon } from "@phosphor-icons/react";
import type { Game } from "./game";
import { Plate } from "./ui/Plate";
import { Meter } from "./ui/Meter";
import { metres, time } from "./Hud";
import { ArrowArt, EntryGraphics } from "./ui/OverdriveArt";
import { BallMark, Burst, Chevrons, ClockMark } from "./ui/marks";
import "./ui/finish.css";
import { appUrl } from "./paths";
import { MealTicket } from "./Leaderboard";
import type { RunTicket } from "./leaderboard-api";

export const siteLabel = (url: string) =>
  url.startsWith("demo:")
    ? "the small internet"
    : url.startsWith("local-")
      ? decodeURIComponent(url.split(":").slice(1).join(":"))
      : new URL(url).hostname;
const SIZE = 512,
  FRAMES = 48;

/**
 * The square trophy: the real collected ball (all layers, priority copies
 * included) rendered by three.js, the celebrating rabbit standing beside it so
 * head and pose stay readable through the whole turn, logotype and site name.
 * Identical drawing for the live preview and every exported GIF frame.
 */
export class TrophyScene {
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  scene = new THREE.Scene();
  camera: THREE.OrthographicCamera;
  ball = new THREE.Group();
  rabbit = new Image();
  fonts: Promise<unknown>;
  constructor(public game: Game) {
    this.renderer.setSize(SIZE, SIZE);
    this.renderer.setClearColor(0xffffff, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    for (const f of game.collection?.fragments ?? []) game.collection?.bake(f);
    for (const mesh of game.collection?.renderMeshes ?? [])
      this.ball.add(new THREE.Mesh(mesh.geometry, mesh.material));
    // Ball fills the left of the square, leaving the right for the rabbit.
    const r = Math.max(12, game.radius);
    const view = r * 1.38;
    this.camera = new THREE.OrthographicCamera(
      -view,
      view,
      view,
      -view,
      0.1,
      view * 20,
    );
    this.camera.position.set(0, view * 0.35, view * 4);
    this.camera.lookAt(0, 0, 0);
    this.ball.position.set(-view * 0.25, -view * 0.33, 0);
    this.scene.add(
      this.ball,
      new THREE.HemisphereLight(0xffffff, 0x888888, 2.4),
    );
    const light = new THREE.DirectionalLight(0xffffff, 2.5);
    light.position.set(-r, r * 2, r * 2);
    this.scene.add(light);
    this.rabbit.src = appUrl("assets/rabbit-victory-trim.png");
    this.fonts = Promise.all([
      document.fonts.load("italic 700 52px Russo One"),
      this.rabbit.decode(),
    ]);
  }
  draw(canvas: HTMLCanvasElement, angle: number) {
    const c = canvas.getContext("2d")!;
    c.fillStyle = "#fff";
    c.fillRect(0, 0, SIZE, SIZE);
    // Corner accents
    c.fillStyle = "#0b0b0b";
    for (const [sx, sy] of [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ]) {
      c.save();
      c.translate(sx > 0 ? 0 : SIZE, sy > 0 ? 0 : SIZE);
      c.scale(sx, sy);
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(96, 0);
      c.lineTo(72, 12);
      c.lineTo(12, 12);
      c.lineTo(12, 60);
      c.lineTo(0, 78);
      c.closePath();
      c.fill();
      c.restore();
    }
    // Motion marks around the ball
    c.strokeStyle = "#ff1d1d";
    c.lineWidth = 7;
    c.lineCap = "round";
    for (const [a0, a1] of [
      [-2.6, -2.1],
      [-0.55, -0.1],
      [1.4, 1.75],
    ]) {
      c.beginPath();
      c.arc(252, 310, 205, a0, a1);
      c.stroke();
    }
    // Rabbit beside the ball: head and pose stay clear of the ball throughout the turn.
    // Full pose at right, rendered after the ball so neither head nor feet disappear.
    this.ball.rotation.set(0.2, angle, 0.08);
    this.renderer.render(this.scene, this.camera);
    c.drawImage(this.renderer.domElement, 0, 0);
    if (this.rabbit.complete && this.rabbit.naturalWidth) {
      const h = 310,
        w = (h * this.rabbit.naturalWidth) / this.rabbit.naturalHeight;
      c.drawImage(this.rabbit, 300, 130, w, h);
    }
    // Paper shards
    c.fillStyle = "#fff";
    c.strokeStyle = "#0b0b0b";
    c.lineWidth = 3;
    for (const [x, y, s, r] of [
      [92, 392, 16, 0.4],
      [438, 118, 12, -0.5],
      [470, 402, 14, 0.2],
      [150, 458, 10, -0.9],
    ]) {
      c.save();
      c.translate(x, y);
      c.rotate(r + angle * 0.3);
      c.beginPath();
      c.rect(-s / 2, -s * 0.65, s, s * 1.3);
      c.fill();
      c.stroke();
      c.restore();
    }
    // Logotype and site
    c.save();
    c.fillStyle = "#050505";
    c.transform(1, 0, -0.2, 1, 0, 0);
    c.fillRect(38, 26, 462, 71);
    c.restore();
    c.font = "italic 700 62px Russo One, Arial, sans-serif";
    c.textAlign = "left";
    c.textBaseline = "alphabetic";
    c.lineJoin = "round";
    c.lineWidth = 8;
    c.strokeStyle = "#0b0b0b";
    c.strokeText("WEBIVORE", 30, 79, 447);
    c.fillStyle = "#fff";
    c.fillText("WEBIVORE", 30, 79, 447);
    c.fillStyle = "#ff1d1d";
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      c.moveTo(34 + i * 16, 100);
      c.lineTo(44 + i * 16, 100);
      c.lineTo(38 + i * 16, 110);
      c.lineTo(28 + i * 16, 110);
      c.closePath();
      c.fill();
    }
    const site = siteLabel(this.game.level.url);
    c.fillStyle = "#0b0b0b";
    let siteSize = 20;
    c.font = `700 ${siteSize}px Arial, sans-serif`;
    while (c.measureText(site).width > 250 && siteSize > 11)
      c.font = `700 ${--siteSize}px Arial, sans-serif`;
    c.fillText(site, 34, 128);
    c.font = "700 10px Arial, sans-serif";
    c.textAlign = "right";
    c.fillText(`chikirao · ${this.game.count} pieces`, SIZE - 30, SIZE - 24);
  }
  dispose() {
    this.renderer.dispose();
    this.scene.clear();
  }
}

export function Finish({
  game,
  run,
  onLeave,
  onExportLevel,
}: {
  game: Game;
  /** Leaderboard run: undefined when the level cannot rank (demo/local). */
  run?: Promise<RunTicket | null> | null;
  onLeave: () => void;
  onExportLevel: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    scene = useRef<TrophyScene | null>(null),
    worker = useRef<Worker | null>(null);
  const [progress, setProgress] = useState<number | null>(null),
    [error, setError] = useState(""),
    [download, setDownload] = useState("");
  const running = useRef(false),
    mounted = useRef(true),
    urlRef = useRef("");
  useEffect(() => {
    mounted.current = true;
    const s = new TrophyScene(game);
    scene.current = s;
    let raf = 0;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tick = (now: number) => {
      if (canvas.current && !running.current)
        s.draw(canvas.current, reduced ? 0.6 : now * 0.00055);
      raf = requestAnimationFrame(tick);
    };
    void s.fonts.then(() => {
      raf = requestAnimationFrame(tick);
    });
    return () => {
      mounted.current = false;
      cancelAnimationFrame(raf);
      worker.current?.terminate();
      s.dispose();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, [game]);
  async function exportGif() {
    if (!scene.current || running.current) return;
    running.current = true;
    setProgress(0);
    setError("");
    const w = new Worker(new URL("./gif.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current = w;
    const output = document.createElement("canvas");
    output.width = output.height = SIZE;
    const request = (data: unknown, transfer: Transferable[] = []) =>
      new Promise<any>((resolve, reject) => {
        w.onmessage = (e) =>
          e.data.type === "error"
            ? reject(new Error(e.data.message))
            : resolve(e.data);
        w.onerror = () =>
          reject(new Error("GIF encoder interrupted. Please try again."));
        w.postMessage(data, transfer);
      });
    try {
      await scene.current.fonts;
      w.postMessage({ type: "start", size: SIZE });
      for (let i = 0; i < FRAMES; i++) {
        if (!mounted.current) return;
        scene.current.draw(output, (i * Math.PI * 2) / FRAMES);
        const pixels = output
          .getContext("2d")!
          .getImageData(0, 0, SIZE, SIZE).data;
        await request({ type: "frame", pixels: pixels.buffer, delay: 8 }, [
          pixels.buffer,
        ]);
        setProgress(Math.round(((i + 1) / FRAMES) * 100));
      }
      const result = await request({ type: "finish" });
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(
        new Blob([result.bytes], { type: "image/gif" }),
      );
      urlRef.current = url;
      setDownload(url);
      const a = document.createElement("a");
      a.href = url;
      a.download = `webivore-${siteLabel(game.level.url).toLowerCase().replace(/[^a-z0-9]+/g, "-") || "level"}.gif`;
      a.click();
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      w.terminate();
      running.current = false;
      if (mounted.current) setProgress(null);
    }
  }
  const site = siteLabel(game.level.url);
  return (
    <div
      className="finish"
      role="dialog"
      aria-modal="true"
      aria-labelledby="finish-title"
    >
      <EntryGraphics />
      <header className="finish-top">
        <div className="finish-meter">
          <Meter
            percent={100}
            count={game.count}
            total={game.items.length}
            complete
          />
        </div>
        <Burst className="cleared">
          Site
          <br />
          cleared
        </Burst>
      </header>
      <section className="finish-main">
        <div className="trophy-frame">
          <canvas
            ref={canvas}
            width={SIZE}
            height={SIZE}
            aria-label={`Your collected ${site} ball rotating beside the celebrating rabbit`}
          />
        </div>
        <div className="finish-actions">
          <h2 id="finish-title" className="yours-rail">
            <span>All</span>
            <strong>Yours</strong>
          </h2>
          <button
            className="key export-key"
            disabled={progress !== null}
            onClick={() => void exportGif()}
            autoFocus
          >
            <ArrowArt input={false} />
            <span className="export-body">
              <DownloadSimpleIcon weight="fill" />
              {progress === null ? (
                "Export GIF"
              ) : (
                <span role="status">Packing {progress}%</span>
              )}
              <Chevrons className="chev" />
            </span>
          </button>
          <Plate
            as="button"
            shape="chip"
            line={null}
            className="chip again-chip"
            onClick={onLeave}
          >
            Play again
            <PlayIcon weight="fill" />
          </Plate>
          <button className="level-export" onClick={onExportLevel}>
            Level file ↓
          </button>
          <MealTicket run={run} pieces={game.count} seconds={game.time} />
          {download && (
            <a
              className="download-again"
              href={download}
              download="webivore-trophy.gif"
            >
              Download again
            </a>
          )}
          {error && (
            <p className="status status-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </section>
      <footer className="finish-rail">
        <a className="author" href={appUrl("")}>
          chikirao
        </a>
        <i className="rail-bar" />
        <BallMark className="rail-mark" />
        <b className="display rail-value">{metres(game.radius, game.count)}m</b>
        <i className="rail-bar" />
        <ClockMark className="rail-mark" />
        <b className="display rail-value">{time(game.time)}</b>
        <i className="rail-bar" />
        <span className="label rail-pieces">{game.count} pieces</span>
        <span className="strip checker-paper" aria-hidden="true" />
        <span className="strip hatch-white" aria-hidden="true" />
        <span className="strip hatch-red wide" aria-hidden="true" />
        <span className="strip dots-paper" aria-hidden="true" />
      </footer>
    </div>
  );
}
