/**
 * What the tube shows, drawn into a small 2D canvas at roughly NTSC
 * resolution. The CRT pass supplies all glass artefacts; this only paints the
 * signal. Each phase gets the seconds since it began.
 */
import { SplashScene } from "./splash-scene";

export type ScreenPhase = "boot" | "splash" | "reading" | "ready" | "launch";

export const SCREEN_W = 640;
export const SCREEN_H = 480;
const RED = "#ff0013";
const INK = "#050505";
const DISPLAY = '"Russo One", Arial, sans-serif';

const BIOS: [number, string][] = [
  [0.15, "CHIKIRAO BIOS v2.03   (C) 2003 chikirao interactive"],
  [0.5, "CPU: WEB-EATER 733MHz"],
  [0.75, "Memory Test: "],
  [1.55, "Detecting IDE Primary Master ... WEB-ROM 52X"],
  [1.9, "Detecting IDE Primary Slave  ... None"],
  [2.2, "Mounting paper ball .......... OK"],
  [2.55, "Starting WEBIVORE ..."],
];
export const BOOT_SECONDS = 3.1;

function slanted(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill: string, stroke = INK, width = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.transform(1, 0, -0.21, 1, 0, 0);
  ctx.font = `${size}px ${DISPLAY}`;
  ctx.textBaseline = "alphabetic";
  if (width) {
    ctx.lineJoin = "round";
    ctx.lineWidth = width;
    ctx.strokeStyle = stroke;
    ctx.strokeText(text, 0, 0);
  }
  ctx.fillStyle = fill;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function chevrons(ctx: CanvasRenderingContext2D, x: number, y: number, n: number, t: number, color: string) {
  for (let i = 0; i < n; i++) {
    const a = 0.25 + 0.75 * Math.max(0, Math.sin(t * 6 - i * 0.9));
    ctx.globalAlpha = a;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + i * 22, y);
    ctx.lineTo(x + i * 22 + 12, y);
    ctx.lineTo(x + i * 22 + 24, y + 14);
    ctx.lineTo(x + i * 22 + 12, y + 28);
    ctx.lineTo(x + i * 22, y + 28);
    ctx.lineTo(x + i * 22 + 12, y + 14);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function backdrop(ctx: CanvasRenderingContext2D, t: number) {
  ctx.fillStyle = RED;
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  // slow halftone swell behind the platform
  ctx.fillStyle = "rgba(0,0,0,.2)";
  for (let y = 6; y < SCREEN_H; y += 12)
    for (let x = (y / 12) % 2 < 1 ? 0 : 6; x < SCREEN_W; x += 12) {
      const d = Math.hypot(x - 320, (y - 250) * 1.3) / 330;
      const r = Math.max(0, d - 0.25 + Math.sin(t * 1.4 - d * 5) * 0.08) * 4.2;
      if (r < 0.3) continue;
      ctx.beginPath();
      ctx.arc(x, y, Math.min(5, r), 0, 7);
      ctx.fill();
    }
  // one bold rail through the scene
  ctx.fillStyle = "rgba(255,255,255,.9)";
  ctx.beginPath();
  ctx.moveTo(0, 318);
  ctx.lineTo(640, 196);
  ctx.lineTo(640, 222);
  ctx.lineTo(0, 350);
  ctx.fill();
}

// The entry's WEBIVORE wordmark plate (ui/OverdriveArt Wordmark), same geometry.
const PLATE = new Path2D("M0 61 40 16H83L96 3H602L623 30H960L1050 248H856L823 216H356L322 233H160L139 212H0Z");
const KEYLINE = new Path2D("M0 95 58 39H603L599 55H915L875 192H346L315 221H159L140 202H0");
const MARKS = new Path2D("M210 186h33l-32 32h-33z M260 186h33l-32 32h-33z M310 186h33l-32 32h-33z");
const DASHES = new Path2D("M640 10h148 M37 228h95");

function wordmark(ctx: CanvasRenderingContext2D, t: number) {
  // slides in from the left with a little overshoot, then settles
  const u = Math.min(1, Math.max(0, t / 0.6));
  const back = 1 + 2.2 * (u - 1) ** 3 + 1.2 * (u - 1) ** 2;
  const x = -600 + 616 * back;
  ctx.save();
  ctx.translate(x, 14);
  ctx.scale(0.5, 0.5);
  ctx.fillStyle = INK;
  ctx.fill(PLATE);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 8;
  ctx.stroke(KEYLINE);
  ctx.save();
  ctx.transform(1, 0, Math.tan((-9 * Math.PI) / 180), 1, 38, 0);
  ctx.font = `italic 900 164px ${DISPLAY}`;
  ctx.textBaseline = "alphabetic";
  const w = ctx.measureText("WEBIVORE").width || 842;
  ctx.translate(-9, 172);
  ctx.scale(842 / w, 1);
  ctx.lineJoin = "round";
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#fff";
  ctx.strokeText("WEBIVORE", 0, 0);
  ctx.fillStyle = "#fff";
  ctx.fillText("WEBIVORE", 0, 0);
  ctx.restore();
  ctx.fillStyle = RED;
  ctx.fill(MARKS);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 7;
  ctx.setLineDash([10, 9]);
  ctx.stroke(DASHES);
  ctx.restore();
}

export class ScreenProgram {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private stage: SplashScene | null = null;
  phase: ScreenPhase = "boot";
  private since = 0;
  /** When the attract loop first came up: the wordmark slides in from here. */
  private shownAt = -1;
  progress = 0;
  hover = false;

  constructor(siteUrls: string[]) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = SCREEN_W;
    this.canvas.height = SCREEN_H;
    this.ctx = this.canvas.getContext("2d")!;
    try {
      this.stage = new SplashScene(siteUrls, SCREEN_W, SCREEN_H);
    } catch {
      this.stage = null; // no WebGL: red card and wordmark only
    }
    void document.fonts?.load(`italic 900 40px ${DISPLAY}`);
  }

  destroy() {
    this.stage?.destroy();
  }

  set(phase: ScreenPhase, now: number) {
    if (phase === this.phase) return;
    this.phase = phase;
    this.since = now;
  }

  /** Average colour of the signal, for the light it throws into the room. */
  private probe = Object.assign(document.createElement("canvas"), { width: 4, height: 3 });
  average(): [number, number, number] {
    const p = this.probe.getContext("2d", { willReadFrequently: true })!;
    p.drawImage(this.canvas, 0, 0, 4, 3);
    const d = p.getImageData(0, 0, 4, 3).data;
    let r = 0,
      g = 0,
      b = 0;
    for (let i = 0; i < d.length; i += 4) {
      r += d[i];
      g += d[i + 1];
      b += d[i + 2];
    }
    const n = d.length / 4 / 255;
    return [r / n, g / n, b / n];
  }

  draw(now: number) {
    const t = now - this.since;
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    if (this.phase === "boot") {
      this.shownAt = -1;
      return this.boot(t);
    }
    if (this.shownAt < 0) this.shownAt = now;
    backdrop(ctx, now);
    if (this.stage) {
      this.stage.render(now);
      ctx.drawImage(this.stage.canvas, 0, 0);
    }
    wordmark(ctx, now - this.shownAt);
    if (this.phase === "splash") {
      ctx.fillStyle = INK;
      ctx.fillRect(0, 392, SCREEN_W, 58);
      if (Math.floor(t * 1.6) % 2 === 0) slanted(ctx, "INSERT DISC", 72, 436, 36, "#fff");
      chevrons(ctx, 330, 407, 4, t, RED);
    } else if (this.phase === "reading") {
      ctx.fillStyle = INK;
      ctx.fillRect(0, 380, SCREEN_W, 80);
      slanted(ctx, "READING DISC", 44, 414, 26, "#fff");
      const x = 44,
        y = 426,
        w = 552;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, w, 20);
      const segs = 24,
        lit = Math.floor(this.progress * segs);
      for (let i = 0; i < lit; i++) {
        ctx.fillStyle = i === lit - 1 && Math.floor(t * 8) % 2 ? "#fff" : RED;
        ctx.fillRect(x + 4 + i * (w - 8) / segs, y + 4, (w - 8) / segs - 4, 12);
      }
      // spinning disc icon
      ctx.save();
      ctx.translate(590, 404);
      ctx.rotate(t * 9);
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, 7);
      ctx.fill();
      ctx.fillStyle = RED;
      ctx.fillRect(-14, -3, 28, 6);
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, 7);
      ctx.fill();
      ctx.restore();
    } else if (this.phase === "ready" || this.phase === "launch") {
      ctx.fillStyle = INK;
      ctx.fillRect(0, 360, SCREEN_W, 100);
      const on = this.hover || Math.floor(t * 2.2) % 3 !== 2;
      if (on) {
        const s = this.hover ? 1.08 : 1;
        ctx.save();
        ctx.translate(320, 428);
        ctx.scale(s, s);
        slanted(ctx, "CLICK ME", -176, 0, 62, "#fff", RED, 10);
        ctx.restore();
      }
      chevrons(ctx, 30, 396, 3, t, RED);
      chevrons(ctx, 548, 396, 3, t + 1, RED);
      if (this.phase === "launch") {
        ctx.fillStyle = `rgba(255,255,255,${Math.min(1, t * 2.4)})`;
        ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
      }
    }
  }

  private boot(t: number) {
    const ctx = this.ctx;
    ctx.font = "bold 17px 'Courier New', monospace";
    ctx.textBaseline = "top";
    // a little energy-star style badge, invented
    ctx.fillStyle = "#e6e6e6";
    ctx.fillText("▟▙", 574, 24);
    let y = 28;
    for (const [at, line] of BIOS) {
      if (t < at) break;
      ctx.fillStyle = line.startsWith("CHIKIRAO") ? "#fff" : "#c8c8c8";
      let text = line;
      if (line.startsWith("Memory")) {
        const kb = Math.min(262144, Math.floor(((t - at) / 0.7) * 262144 / 1024) * 1024);
        text += `${kb}K${kb >= 262144 ? " OK" : ""}`;
      }
      ctx.fillText(text, 26, y);
      y += 26;
    }
    if (Math.floor(t * 3) % 2 === 0) ctx.fillRect(26, y + 4, 11, 16);
    ctx.fillStyle = "#9a9a9a";
    ctx.fillText("Press DEL to enter SETUP", 26, 440);
  }
}
