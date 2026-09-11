import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { Game } from "./game";
import { drawProgressDial } from "./Circuit";
import { ArrowRightIcon, DownloadSimpleIcon } from "@phosphor-icons/react";

class TrophyScene {
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  scene = new THREE.Scene();
  camera: THREE.OrthographicCamera;
  ball: THREE.Group;
  rabbit = new Image();
  dial = new Image();
  logo = new Image();
  ring = document.createElement("canvas");
  constructor(public game: Game) {
    this.renderer.setSize(512, 512);
    this.renderer.setClearColor(0xffffff, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    for (const f of game.collection?.fragments ?? []) game.collection?.bake(f);
    this.ball = new THREE.Group();
    for (const mesh of game.collection?.renderMeshes ?? [])
      this.ball.add(new THREE.Mesh(mesh.geometry, mesh.material));
    const r = Math.max(12, game.radius) * 1.6;
    this.camera = new THREE.OrthographicCamera(-r, r, r, -r, 0.1, r * 20);
    this.camera.position.set(0, r * 0.5, r * 4);
    this.camera.lookAt(0, 0, 0);
    this.ball.position.set(0, -r * 0.24, 0);
    this.scene.add(
      this.ball,
      new THREE.HemisphereLight(0xffffff, 0x888888, 2.4),
    );
    const light = new THREE.DirectionalLight(0xffffff, 2.5);
    light.position.set(-r, r * 2, r * 2);
    this.scene.add(light);
    this.rabbit.src = "/assets/rabbit-victory.png";
    this.dial.src = "/assets/circuit-dial.png";
    this.logo.src = "/assets/circuit-logo.png";
    this.ring.width = this.ring.height = 512;
    drawProgressDial(this.ring.getContext("2d")!, 100, 512, true);
  }
  draw(canvas: HTMLCanvasElement, angle: number) {
    const c = canvas.getContext("2d")!;
    c.fillStyle = "#fff";
    c.fillRect(0, 0, 512, 512);
    if (this.dial.complete && this.dial.naturalWidth)
      c.drawImage(this.dial, 0, 0, 512, 512);
    c.drawImage(this.ring, 0, 0);
    if (this.rabbit.complete && this.rabbit.naturalWidth)
      c.drawImage(this.rabbit, 145, 45, 219, 248);
    this.ball.rotation.set(0.2, angle, 0.08);
    this.renderer.render(this.scene, this.camera);
    c.drawImage(this.renderer.domElement, 0, 0);
    // Quiet label plates keep live metadata legible over the completion ring.
    c.fillStyle = "white";
    c.beginPath();
    c.roundRect(99, 391, 314, 99, 30);
    c.fill();
    c.beginPath();
    c.roundRect(202, 15, 108, 39, 16);
    c.fill();
    if (this.logo.complete && this.logo.naturalWidth)
      c.drawImage(this.logo, 111, 387, 290, 65);
    c.fillStyle = "#000";
    c.font = "900 italic 28px Arial";
    c.textAlign = "center";
    c.fillText("100%", 256, 48);
    const site = this.game.level.url.startsWith("demo:")
      ? "the small internet"
      : new URL(this.game.level.url).hostname;
    c.font = "bold 17px Arial";
    while (c.measureText(site).width > 325) {
      const n = parseInt(c.font.match(/\d+/)![0]) - 1;
      c.font = `bold ${n}px Arial`;
    }
    c.fillText(site, 256, 467);
    c.font = "9px Arial";
    c.fillText(
      `chikirao / vault     •     ${this.game.count} pieces, one trophy.`,
      256,
      484,
    );
  }
  dispose() {
    this.renderer.dispose();
    this.scene.clear();
  }
}

export function Trophy({ game, onLeave }: { game: Game; onLeave: () => void }) {
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
        s.draw(canvas.current, reduced ? 0 : now * 0.00055);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
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
    output.width = output.height = 512;
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
      await Promise.all([
        scene.current.rabbit.decode(),
        scene.current.dial.decode(),
        scene.current.logo.decode(),
      ]);
      w.postMessage({ type: "start", size: 512 });
      for (let i = 0; i < 48; i++) {
        if (!mounted.current) return;
        scene.current.draw(output, (i * Math.PI * 2) / 48);
        const pixels = output
          .getContext("2d")!
          .getImageData(0, 0, 512, 512).data;
        await request({ type: "frame", pixels: pixels.buffer, delay: 8 }, [
          pixels.buffer,
        ]);
        setProgress(Math.round(((i + 1) / 48) * 100));
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
      a.download =
        "webivore-" +
        (game.level.url.startsWith("demo:")
          ? "demo"
          : new URL(game.level.url).hostname) +
        ".gif";
      a.click();
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      w.terminate();
      running.current = false;
      if (mounted.current) setProgress(null);
    }
  }
  return (
    <div
      className="victory"
      role="dialog"
      aria-modal="true"
      aria-labelledby="victory-title"
    >
      <a className="author" href="/">
        chikirao
      </a>
      <div className="trophy-card">
        <canvas
          ref={canvas}
          width={512}
          height={512}
          aria-label="Your collected ball rotating with the celebrating rabbit"
        />
      </div>
      <div className="victory-copy">
        <h2 id="victory-title">
          <img src="/assets/circuit-yours.png" alt="All yours!" />
        </h2>
        <p className="victory-site">
          {game.level.url.startsWith("demo:")
            ? "the small internet"
            : new URL(game.level.url).hostname}
        </p>
        <button
          className="red-button"
          disabled={progress !== null}
          onClick={() => void exportGif()}
        >
          <DownloadSimpleIcon weight="bold" />
          {progress === null ? (
            "EXPORT GIF"
          ) : (
            <span className="export-status" role="status">
              PACKING… {progress}%
            </span>
          )}
          <ArrowRightIcon weight="bold" />
        </button>
        <small className="export-note">512 × 512 · LOOPING GIF</small>
        {download && (
          <a
            className="download-again"
            href={download}
            download="webivore-trophy.gif"
          >
            Download again
          </a>
        )}
        {error && <p role="alert">{error}</p>}
        <button className="silver-button" onClick={onLeave}>
          <ArrowRightIcon weight="bold" />
          EAT ANOTHER SITE
        </button>
        <div className="final-stats">
          <b>
            {game.count}
            <small>PIECES</small>
          </b>
          <b>
            {((game.radius * 2) / 100).toFixed(1)}m
            <small>COLLECTION SIZE</small>
          </b>
          <b>
            {Math.floor(game.time / 60)}:
            {String(Math.floor(game.time % 60)).padStart(2, "0")}
            <small>TIME</small>
          </b>
        </div>
      </div>
    </div>
  );
}
