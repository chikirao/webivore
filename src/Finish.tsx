import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { CheckIcon, CopyIcon, DownloadSimpleIcon, PlayIcon } from "@phosphor-icons/react";
import type { Game } from "./game";
import { Plate } from "./ui/Plate";
import { Meter } from "./ui/Meter";
import { metres, time } from "./Hud";
import { ArrowArt, EntryGraphics } from "./ui/OverdriveArt";
import { BallMark, Burst, Chevrons, ClockMark } from "./ui/marks";
import "./ui/finish.css";
import { appUrl } from "./paths";
import { MealTicket } from "./Leaderboard";
import { storedPlayer, type Player, type RunTicket } from "./leaderboard-api";

export const siteLabel = (url: string) =>
  url.startsWith("demo:")
    ? "the small internet"
    : url.startsWith("local-")
      ? decodeURIComponent(url.split(":").slice(1).join(":"))
      : new URL(url).hostname;
const SIZE = 512,
  FRAMES = 60,
  /** GIF frame delay in centiseconds: 60 × 6 cs = one 3.6 s loop. */
  DELAY = 6,
  LOOP_MS = FRAMES * DELAY * 10,
  /** Live preview and Copy PNG are drawn at twice the GIF size. */
  HI = SIZE * 2,
  GAME_URL = "webivore.chikirao.ru";
const RED = "#ff0013",
  INK = "#050505",
  PAPER = "#ffffff",
  DISPLAY = "'Russo One', Arial, sans-serif";
/** Art window of the card, in card-local pixels (card centre at 0,0). */
const ART = { x: -156, y: -166, w: 312, h: 232 },
  BALL_PX = 212;

/**
 * The trophy card: a tilted collectible card on a red halftone table. The
 * real collected ball (all layers, priority copies included) turns once per
 * loop inside the art window beside the celebrating rabbit; the card carries
 * the player's nickname (GUEST without an account), the site, size, time,
 * date and the game address. The halftone swell travels from the bottom-left
 * to the top-right corner and re-enters as it leaves, so the last frame meets
 * the first without a seam. One drawing serves the live preview, Copy PNG and
 * every GIF frame; it scales with the target canvas.
 */
export class TrophyScene {
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  scene = new THREE.Scene();
  camera: THREE.OrthographicCamera;
  ball = new THREE.Group();
  rabbit = new Image();
  fonts: Promise<unknown>;
  nickname = "GUEST";
  date: string;
  constructor(public game: Game) {
    // Twice the drawn size so the ball stays crisp on the 2× preview and PNG.
    this.renderer.setSize(BALL_PX * 2, BALL_PX * 2);
    this.renderer.setClearColor(0xffffff, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    for (const f of game.collection?.fragments ?? []) game.collection?.bake(f);
    for (const mesh of game.collection?.renderMeshes ?? [])
      this.ball.add(new THREE.Mesh(mesh.geometry, mesh.material));
    const view = Math.max(12, game.radius) * 1.08;
    this.camera = new THREE.OrthographicCamera(-view, view, view, -view, 0.1, view * 20);
    this.camera.position.set(0, view * 0.35, view * 4);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(this.ball, new THREE.HemisphereLight(0xffffff, 0x888888, 2.4));
    const light = new THREE.DirectionalLight(0xffffff, 2.5);
    light.position.set(-view, view * 2, view * 2);
    this.scene.add(light);
    this.rabbit.src = appUrl("assets/rabbit-victory-trim.png");
    const d = new Date();
    this.date = [d.getDate(), d.getMonth() + 1, d.getFullYear() % 100]
      .map((n) => String(n).padStart(2, "0"))
      .join(".");
    this.fonts = Promise.all([document.fonts.load(`24px ${DISPLAY}`), this.rabbit.decode()]);
  }
  /** `phase` in [0, 1): position in the loop. */
  draw(canvas: HTMLCanvasElement, phase: number) {
    const c = canvas.getContext("2d")!;
    const k = canvas.width / SIZE;
    c.setTransform(k, 0, 0, k, 0, 0);
    c.textBaseline = "alphabetic";
    c.fillStyle = RED;
    c.fillRect(0, 0, SIZE, SIZE);
    wave(c, phase);
    c.save();
    c.translate(256, 262);
    c.rotate(-0.06);
    cut(c, -168, -214, 356, 452, 22);
    c.fillStyle = "rgba(0,0,0,0.35)";
    c.fill();
    cut(c, -178, -226, 356, 452, 22);
    c.fillStyle = INK;
    c.fill();
    cut(c, -170, -218, 340, 436, 18);
    c.fillStyle = PAPER;
    c.fill();
    // Nickname and pieces
    c.textAlign = "left";
    fit(c, this.nickname, 28, 220);
    italic(c, clip(c, this.nickname, 220), -154, -184, INK);
    c.textAlign = "right";
    c.font = `22px ${DISPLAY}`;
    c.fillStyle = RED;
    c.fillText(String(this.game.count), 154, -186);
    c.font = "700 10px Arial, sans-serif";
    c.fillText("PCS", 154, -172);
    // Art window: rays, the turning ball, the rabbit beside it
    c.save();
    c.beginPath();
    c.rect(ART.x, ART.y, ART.w, ART.h);
    c.clip();
    c.fillStyle = INK;
    c.fillRect(ART.x, ART.y, ART.w, ART.h);
    rays(c, -30, -40, 22, 320, "#222");
    shade(c, -30, 52, 90, 14, 0.8);
    this.ball.rotation.set(0.2, phase * Math.PI * 2, 0.08);
    this.renderer.render(this.scene, this.camera);
    c.drawImage(this.renderer.domElement, -30 - BALL_PX / 2, -48 - BALL_PX / 2, BALL_PX, BALL_PX);
    if (this.rabbit.complete && this.rabbit.naturalWidth) {
      const h = 170;
      c.drawImage(this.rabbit, 60, -120, (h * this.rabbit.naturalWidth) / this.rabbit.naturalHeight, h);
    }
    c.restore();
    c.lineWidth = 3;
    c.strokeStyle = INK;
    c.strokeRect(ART.x, ART.y, ART.w, ART.h);
    // Site line
    c.fillStyle = INK;
    c.fillRect(ART.x, 74, ART.w, 30);
    c.textAlign = "left";
    const site = siteLabel(this.game.level.url);
    fit(c, site, 17, 250, 11);
    italic(c, clip(c, site, 250), ART.x + 10, 96, PAPER);
    chevrons(c, 120, 82, 2, RED, 0.9);
    // Stats
    const stats = [
      ["SIZE", `${metres(this.game.radius, this.game.count)}m`],
      ["TIME", time(this.game.time)],
      ["DATE", this.date],
    ];
    c.font = "700 11px Arial, sans-serif";
    c.fillStyle = "#666";
    stats.forEach(([label], i) => c.fillText(label, ART.x + 4 + i * 100, 132));
    c.font = `24px ${DISPLAY}`;
    stats.forEach(([, value], i) => italic(c, value, ART.x + 4 + i * 100, 164, INK));
    // Footer: game name and address
    c.fillStyle = "#ddd";
    c.fillRect(ART.x, 180, ART.w, 2);
    c.font = `12px ${DISPLAY}`;
    c.fillStyle = RED;
    c.fillText("WEBIVORE", ART.x + 4, 203);
    c.fillStyle = INK;
    c.textAlign = "right";
    c.fillText(GAME_URL, ART.x + ART.w - 4, 203);
    c.restore();
  }
  dispose() {
    this.renderer.dispose();
    this.scene.clear();
  }
}

type Ctx = CanvasRenderingContext2D;
function cut(c: Ctx, x: number, y: number, w: number, h: number, k: number) {
  c.beginPath();
  c.moveTo(x + k, y);
  c.lineTo(x + w, y);
  c.lineTo(x + w, y + h - k);
  c.lineTo(x + w - k, y + h);
  c.lineTo(x, y + h);
  c.lineTo(x, y + k);
  c.closePath();
}
function rays(c: Ctx, cx: number, cy: number, n: number, r: number, color: string) {
  c.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2,
      b = a + Math.PI / n;
    c.beginPath();
    c.moveTo(cx, cy);
    c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    c.lineTo(cx + Math.cos(b) * r, cy + Math.sin(b) * r);
    c.fill();
  }
}
function shade(c: Ctx, cx: number, cy: number, rx: number, ry: number, alpha: number) {
  const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(0,0,0,${alpha})`);
  g.addColorStop(1, "rgba(0,0,0,0)");
  c.save();
  c.translate(cx, cy);
  c.scale(1, ry / rx);
  c.fillStyle = g;
  c.fillRect(-rx, -rx, rx * 2, rx * 2);
  c.restore();
}
/** Largest display size (down to `min`) that fits `max` px. */
function fit(c: Ctx, text: string, size: number, max: number, min = 12) {
  c.font = `${size}px ${DISPLAY}`;
  while (c.measureText(text).width > max && size > min) c.font = `${--size}px ${DISPLAY}`;
}
function clip(c: Ctx, text: string, max: number) {
  if (c.measureText(text).width <= max) return text;
  while (text.length > 1 && c.measureText(text + "…").width > max) text = text.slice(0, -1);
  return text + "…";
}
function italic(c: Ctx, text: string, x: number, y: number, fill: string) {
  c.save();
  c.translate(x, y);
  c.transform(1, 0, -0.18, 1, 0, 0);
  c.fillStyle = fill;
  c.fillText(text, 0, 0);
  c.restore();
}
function chevrons(c: Ctx, x: number, y: number, n: number, color: string, s: number) {
  c.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const o = x + i * 13 * s;
    c.beginPath();
    c.moveTo(o, y);
    c.lineTo(o + 7 * s, y);
    c.lineTo(o + 13 * s, y + 7 * s);
    c.lineTo(o + 7 * s, y + 14 * s);
    c.lineTo(o, y + 14 * s);
    c.lineTo(o + 6 * s, y + 7 * s);
    c.fill();
  }
}
/**
 * Halftone swell along the bottom-left → top-right diagonal. The diagonal
 * coordinate wraps, so the crest leaves one corner as it re-enters the other.
 */
function wave(c: Ctx, phase: number) {
  const step = 14;
  c.fillStyle = "#c8000f";
  for (let j = 0, y = 0; y < SIZE + step; j++, y += step * 0.87)
    for (let x = ((j % 2) * step) / 2; x < SIZE + step; x += step) {
      let d = ((x + SIZE - y) / (SIZE * 2) - phase) % 1;
      if (d < 0) d += 1;
      const r = 1.2 + 5.6 * Math.exp(-(((d - 0.5) / 0.2) ** 2));
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    }
}

const nicknameOf = (player: Player | null) => player?.nickname || "GUEST";

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
    [copied, setCopied] = useState(false);
  const running = useRef(false),
    mounted = useRef(true),
    urlRef = useRef(""),
    /** Nickname baked into the cached GIF; a new name means a new GIF. */
    urlNick = useRef(""),
    reduced = useRef(false);
  const phaseNow = () => (reduced.current ? 0.12 : (performance.now() % LOOP_MS) / LOOP_MS);
  useEffect(() => {
    mounted.current = true;
    const s = new TrophyScene(game);
    s.nickname = nicknameOf(storedPlayer());
    scene.current = s;
    // A nickname claimed on this screen (meal ticket) shows up on the card at once.
    const sync = () => (s.nickname = nicknameOf(storedPlayer()));
    addEventListener("webivore:player", sync);
    let raf = 0;
    reduced.current = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tick = () => {
      if (canvas.current && !running.current) s.draw(canvas.current, phaseNow());
      raf = requestAnimationFrame(tick);
    };
    void s.fonts.then(() => {
      raf = requestAnimationFrame(tick);
    });
    return () => {
      mounted.current = false;
      removeEventListener("webivore:player", sync);
      cancelAnimationFrame(raf);
      worker.current?.terminate();
      s.dispose();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, [game]);
  const fileBase = `webivore-${siteLabel(game.level.url).toLowerCase().replace(/[^a-z0-9]+/g, "-") || "level"}`;
  const save = (url: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileBase}.gif`;
    a.click();
  };
  async function exportGif() {
    if (!scene.current || running.current) return;
    // Pressing again re-saves the packed loop instead of encoding it anew.
    if (urlRef.current && urlNick.current === scene.current.nickname) return save(urlRef.current);
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
        w.onmessage = (e) => {
          if (e.data.type === "progress") setProgress(Math.round(50 + e.data.value * 50));
          else if (e.data.type === "error") reject(new Error(e.data.message));
          else resolve(e.data);
        };
        w.onerror = () => reject(new Error("GIF encoder interrupted. Please try again."));
        w.postMessage(data, transfer);
      });
    try {
      await scene.current.fonts;
      w.postMessage({ type: "start", size: SIZE });
      for (let i = 0; i < FRAMES; i++) {
        if (!mounted.current) return;
        scene.current.draw(output, i / FRAMES);
        const pixels = output.getContext("2d")!.getImageData(0, 0, SIZE, SIZE).data;
        await request({ type: "frame", pixels: pixels.buffer }, [pixels.buffer]);
        setProgress(Math.round(((i + 1) / FRAMES) * 50));
      }
      const result = await request({ type: "finish", delay: DELAY });
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(new Blob([result.bytes], { type: "image/gif" }));
      urlRef.current = url;
      urlNick.current = scene.current.nickname;
      save(url);
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      w.terminate();
      running.current = false;
      if (mounted.current) setProgress(null);
    }
  }
  async function copyPng() {
    if (!scene.current) return;
    setError("");
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined")
        throw new Error("This browser can’t copy images. Use Download GIF.");
      const still = document.createElement("canvas");
      still.width = still.height = HI;
      scene.current.draw(still, phaseNow());
      // The blob is handed over as a promise so Safari keeps the click gesture.
      const png = new Promise<Blob>((resolve, reject) =>
        still.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not render the card."))), "image/png"),
      );
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      setCopied(true);
      setTimeout(() => mounted.current && setCopied(false), 1800);
    } catch (e) {
      const message = (e as Error).message;
      setError(message.includes("Download GIF") ? message : "Clipboard blocked. Use Download GIF.");
    }
  }
  const site = siteLabel(game.level.url);
  return (
    <div className="finish" role="dialog" aria-modal="true" aria-labelledby="finish-title">
      <EntryGraphics />
      <header className="finish-top">
        <div className="finish-meter">
          <Meter percent={100} count={game.count} total={game.items.length} complete />
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
            width={HI}
            height={HI}
            aria-label={`Your trophy card: the ${site} ball turning beside the celebrating rabbit`}
          />
        </div>
        <div className="finish-actions">
          <h2 id="finish-title" className="yours-rail">
            <span>All</span>
            <strong>Yours</strong>
          </h2>
          <button className="key export-key" disabled={progress !== null} onClick={() => void exportGif()} autoFocus>
            <ArrowArt input={false} />
            <span className="export-body">
              <DownloadSimpleIcon weight="fill" />
              {progress === null ? "Download GIF" : <span role="status">Packing {progress}%</span>}
              <Chevrons className="chev" />
            </span>
          </button>
          <button className="copy-png" onClick={() => void copyPng()} aria-live="polite">
            {copied ? <CheckIcon weight="bold" /> : <CopyIcon weight="bold" />}
            {copied ? "Copied" : "Copy PNG"}
          </button>
          <Plate as="button" shape="chip" line={null} className="chip again-chip" onClick={onLeave}>
            Play again
            <PlayIcon weight="fill" />
          </Plate>
          <button className="level-export" onClick={onExportLevel}>
            Level file ↓
          </button>
          <MealTicket run={run} pieces={game.count} seconds={game.time} />
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
