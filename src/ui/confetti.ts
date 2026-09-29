/**
 * Screen-space paper confetti on one shared canvas above the HUD. Particles
 * have gravity, drag and a tumbling flip, like the 3D landing debris. The
 * loop only runs while something is falling.
 */
type Bit = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  angle: number;
  spin: number;
  flip: number;
  flipSpeed: number;
  color: string;
  life: number;
};

import { lessEffects } from "../prefs";

const PAPER = ["#ff0013", "#ffffff", "#050505"];
/** Phones: a 1× canvas and fewer bits; the full-screen redraw is the cost. */
const light = () => lessEffects() || matchMedia("(pointer: coarse)").matches;
let canvas: HTMLCanvasElement | undefined;
let ctx: CanvasRenderingContext2D | null = null;
let bits: Bit[] = [];
let raf = 0;
let last = 0;

function layer() {
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.className = "confetti-layer";
    canvas.setAttribute("aria-hidden", "true");
    document.body.append(canvas);
    ctx = canvas.getContext("2d");
  }
  const dpr = light() ? 1 : Math.min(devicePixelRatio || 1, 2);
  const w = Math.round(innerWidth * dpr),
    h = Math.round(innerHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return dpr;
}

export type BurstOptions = {
  count?: number;
  /** Launch speed in px/s. */
  power?: number;
  /** Rainbow paper instead of red, white and black. */
  rainbow?: boolean;
  /** Launch direction in radians (0 = right, -π/2 = up) and spread. */
  angle?: number;
  spread?: number;
};

/** Throws a handful of paper at a screen point (CSS px). */
export function burst(x: number, y: number, { count = 40, power = 520, rainbow = false, angle = -Math.PI / 2, spread = Math.PI * 0.9 }: BurstOptions = {}) {
  if (typeof window === "undefined" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  layer();
  if (light()) count = Math.round(count * 0.4);
  for (let i = 0; i < count && bits.length < (light() ? 160 : 600); i++) {
    const a = angle + (Math.random() - 0.5) * spread,
      v = power * (0.45 + Math.random() * 0.75);
    bits.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      w: 6 + Math.random() * 7,
      h: 4 + Math.random() * 9,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 14,
      flip: Math.random() * Math.PI * 2,
      flipSpeed: 6 + Math.random() * 10,
      color: rainbow ? `hsl(${Math.floor(Math.random() * 360)} 95% 55%)` : PAPER[i % 3],
      life: 1.6 + Math.random() * 1.1,
    });
  }
  if (!raf) {
    last = performance.now();
    raf = requestAnimationFrame(step);
  }
}

/** Confetti from the centre of an element, e.g. a burst badge. */
export function burstFrom(el: Element | null, options?: BurstOptions) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return;
  burst(r.left + r.width / 2, r.top + r.height / 2, options);
}

function step(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const dpr = layer();
  if (!ctx || !canvas) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const b of bits) {
    b.life -= dt;
    b.vy += 1250 * dt;
    const drag = Math.exp(-2.6 * dt);
    b.vx *= drag;
    b.vy *= drag;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.angle += b.spin * dt;
    b.flip += b.flipSpeed * dt;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.angle);
    ctx.scale(1, Math.cos(b.flip));
    ctx.globalAlpha = Math.min(1, b.life * 2.5);
    ctx.fillStyle = b.color;
    ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
    if (b.color === "#ffffff") {
      ctx.strokeStyle = "#050505";
      ctx.lineWidth = 1.2;
      ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);
    }
    ctx.restore();
  }
  bits = bits.filter((b) => b.life > 0 && b.y < innerHeight + 40);
  if (bits.length) raf = requestAnimationFrame(step);
  else {
    raf = 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}
