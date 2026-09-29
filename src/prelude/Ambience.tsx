import { useEffect, useRef } from "react";
import type { Room } from "./rooms";
import { RoomLight, roomLight } from "./RoomLight";
import { crtSettings } from "../crt/settings";
import { soundSettings } from "../audio/settings";
import { roomFrame } from "../audio/room";

/**
 * Small signs of life in the room, all driven by one rAF (no React renders
 * per frame). Light is computed here and drawn by RoomLight in WebGL:
 *  - the lamp breathes with an irregular mains flicker;
 *  - a TV beyond the right edge cuts between cold colours;
 *  - the moonlit window breathes; a cloud drifts behind the blinds;
 * and a fly loops fast in the right corner, landing for a while between
 * flights. The room's sound follows the lamp's dips and the fly's flight.
 */

/** Smooth value noise, 1D. */
function noise1(seed: number) {
  const r = (i: number) => {
    const x = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  return (t: number) => {
    const i = Math.floor(t),
      f = t - i,
      u = f * f * (3 - 2 * f);
    return r(i) * (1 - u) + r(i + 1) * u;
  };
}

/**
 * An irregular light: slow drift, a little buzz, and rare short dips. Returns
 * ~1 at rest. Shared with the monitor so its spill stutters too.
 */
export function flickerSource(seed: number, dipsEvery = [3, 9], dipDepth = 0.4) {
  const slow = noise1(seed),
    buzz = noise1(seed + 9);
  let nextDip = dipsEvery[0] + Math.random() * (dipsEvery[1] - dipsEvery[0]);
  let dipUntil = 0,
    depth = 0;
  return (t: number) => {
    if (t > nextDip) {
      dipUntil = t + 0.05 + Math.random() * 0.12;
      depth = dipDepth * (0.4 + Math.random() * 0.6);
      nextDip = t + dipsEvery[0] + Math.random() * (dipsEvery[1] - dipsEvery[0]);
    }
    let v = 0.94 + slow(t * 0.7) * 0.08 + (buzz(t * 22) - 0.5) * 0.04;
    if (t < dipUntil) v *= 1 - depth * (0.6 + 0.4 * Math.sin(t * 90));
    return v;
  };
}

/**
 * An unseen TV: holds a shot for a while, cuts hard to another, sometimes
 * rattles through several quick cuts, sometimes goes to a dark scene.
 * Cold palette only. Returns the current light colour and brightness.
 */
const TV_PALETTE: [number, number, number][] = [
  [225, 235, 255], // white
  [70, 115, 255], // blue
  [95, 205, 255], // cyan
  [150, 95, 255], // violet
  [45, 70, 210], // deep blue
  [185, 215, 255], // pale blue
];
export function tvSource() {
  let color = TV_PALETTE[0],
    target = color,
    level = 0.8,
    targetLevel = 0.8,
    next = 0,
    rapid = 0;
  const buzz = noise1(21);
  return (t: number, dt: number) => {
    if (t >= next) {
      const roll = Math.random();
      if (rapid > 0) {
        rapid--;
        next = t + 0.08 + Math.random() * 0.25;
      } else if (roll < 0.14) {
        rapid = 2 + ((Math.random() * 4) | 0); // a burst of fast cuts
        next = t + 0.1;
      } else if (roll < 0.26) {
        next = t + 0.4 + Math.random() * 1.4; // a dark scene
        targetLevel = 0.12 + Math.random() * 0.15;
        return { rgb: color, level };
      } else {
        next = t + (Math.random() < 0.3 ? 2.5 + Math.random() * 4 : 0.5 + Math.random() * 2);
      }
      let pick = TV_PALETTE[(Math.random() * TV_PALETTE.length) | 0];
      if (pick === target) pick = TV_PALETTE[(TV_PALETTE.indexOf(pick) + 1) % TV_PALETTE.length];
      target = pick;
      targetLevel = 0.55 + Math.random() * 0.45;
    }
    // hard cuts: settle within ~2 frames
    const k = Math.min(1, dt * 28);
    color = color.map((c, i) => c + (target[i] - c) * k) as [number, number, number];
    level += (targetLevel - level) * k;
    return { rgb: color, level: level * (0.92 + buzz(t * 9) * 0.16) };
  };
}

type FlyState = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  mode: "fly" | "land" | "sit";
  until: number;
  tx: number;
  ty: number;
  retarget: number;
  perch: [number, number];
};

export function Ambience({
  room,
  scale,
  reduced,
  plate,
  baseUrl,
  spillUrl,
}: {
  room: Room;
  scale: number;
  reduced: boolean;
  /** The canvas that replaces the static plate. */
  plate: React.RefObject<HTMLCanvasElement | null>;
  baseUrl: string;
  spillUrl: string;
}) {
  const a = room.ambience;
  const fly = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const light = useRef<RoomLight | null>(null);

  const scaleNow = useRef(scale);
  scaleNow.current = scale;
  useEffect(() => {
    if (!plate.current) return;
    try {
      // Prelude keys the canvas by room: a resize that swaps the composition
      // gets a fresh canvas, since destroy() loses the old one's context.
      light.current = new RoomLight(plate.current, room, baseUrl, spillUrl);
      light.current.resize(scaleNow.current);
    } catch {
      light.current = null;
    }
    return () => {
      light.current?.destroy();
      light.current = null;
    };
  }, [plate, room, baseUrl, spillUrl]);

  useEffect(() => {
    light.current?.resize(scale);
  }, [scale]);

  useEffect(() => {
    const lampFlicker = flickerSource(1, [4, 11], 0.28);
    const moonBreath = noise1(5);
    const tv = tvSource();
    const z = a.fly.zone;
    const f: FlyState = {
      x: z.x + z.w / 2,
      y: z.y + z.h / 2,
      vx: 300,
      vy: 0,
      mode: "fly",
      until: 3,
      tx: z.x + z.w / 2,
      ty: z.y + z.h / 3,
      retarget: 0,
      perch: a.fly.perches[0],
    };
    let last = performance.now() / 1000;
    const start = last;
    let raf = 0;
    const loop = () => {
      const now = performance.now() / 1000;
      const t = now - start,
        dt = Math.min(0.05, now - last);
      last = now;

      const lampNow = lampFlicker(t);
      roomLight.lamp = reduced ? 0.9 : 0.72 + (lampNow - 0.9) * 2.2;
      const tvNow = reduced ? { rgb: [120, 150, 255] as [number, number, number], level: 0.6 } : tv(t, dt);
      roomLight.tv = tvNow.rgb;
      roomLight.tvLevel = tvNow.level;
      // a cloud drifts behind the window, left to right, every cloudPeriod s
      const w = a.window,
        m = a.moon;
      if (w && m) {
        const { cloudSize, cloudPeriod } = crtSettings.room;
        const reach = m.r * 18 * cloudSize;
        const span = w.w + reach * 2;
        const cx = w.x - reach + ((t / cloudPeriod + 0.2) % 1) * span;
        roomLight.cloud = [cx, m.y + Math.sin(t * 0.07) * m.r * 1.5];
        const d = (cx - m.x) / (m.r * 9 * cloudSize);
        roomLight.cover = Math.exp(-d * d);
        roomLight.moon = reduced ? 0.7 : 0.55 + moonBreath(t * 0.18) * 0.45;
      }
      light.current?.render(t, reduced);

      // the fly
      if (fly.current) {
        if (f.mode === "fly") {
          if (t > f.retarget || Math.hypot(f.tx - f.x, f.ty - f.y) < 40) {
            f.tx = z.x + Math.random() * z.w;
            f.ty = z.y + Math.random() * z.h;
            f.retarget = t + 0.25 + Math.random() * 0.6;
          }
          const dx = f.tx - f.x,
            dy = f.ty - f.y,
            d = Math.hypot(dx, dy) || 1;
          // seek + a swirl perpendicular to the heading makes loops
          const swirl = Math.sin(t * 9 + f.retarget * 7) * 5200;
          const sp = Math.hypot(f.vx, f.vy) || 1;
          f.vx += ((dx / d) * 7000 + (-f.vy / sp) * swirl) * dt;
          f.vy += ((dy / d) * 7000 + (f.vx / sp) * swirl) * dt;
          if (t > f.until) {
            f.mode = "land";
            f.until = Infinity;
            f.perch = a.fly.perches[(Math.random() * a.fly.perches.length) | 0];
          }
        } else if (f.mode === "land") {
          const dx = f.perch[0] - f.x,
            dy = f.perch[1] - f.y,
            d = Math.hypot(dx, dy);
          const want = Math.min(1100, d * 4);
          f.vx += ((dx / (d || 1)) * want - f.vx) * 8 * dt;
          f.vy += ((dy / (d || 1)) * want - f.vy) * 8 * dt;
          if (d < 4) {
            f.mode = "sit";
            f.x = f.perch[0];
            f.y = f.perch[1];
            f.vx = f.vy = 0;
            const { sitMin, sitMax } = soundSettings.fly;
            f.until = t + sitMin + Math.random() * Math.max(0, sitMax - sitMin);
          }
        } else {
          // sitting: tiny shuffles, then take off
          if (Math.random() < dt * 1.3) f.x = f.perch[0] + (Math.random() - 0.5) * 14;
          if (t > f.until) {
            f.mode = "fly";
            f.vy = -900;
            f.vx = (Math.random() - 0.5) * 900;
            const { flyMin, flyMax } = soundSettings.fly;
            f.until = t + flyMin + Math.random() * Math.max(0, flyMax - flyMin);
          }
        }
        const sp = Math.hypot(f.vx, f.vy);
        const max = 1500;
        if (sp > max) {
          f.vx *= max / sp;
          f.vy *= max / sp;
        }
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.x = Math.max(z.x - 80, Math.min(z.x + z.w + 80, f.x));
        f.y = Math.max(z.y - 80, Math.min(z.y + z.h + 120, f.y));
        const size = Math.max(9, 3.2 / scaleRef.current);
        const moving = f.mode !== "sit";
        const stretch = moving ? 1 + Math.min(1.4, sp / 900) : 1;
        const ang = moving ? Math.atan2(f.vy, f.vx) : 0;
        const el = fly.current;
        el.style.width = `${size}px`;
        el.style.height = `${size * 0.7}px`;
        el.style.transform = `translate(${f.x - size / 2}px, ${f.y - size * 0.35}px) rotate(${ang}rad) scaleX(${stretch})`;
        el.classList.toggle("sitting", !moving);
        roomFrame(reduced ? 0.94 : lampNow, { x: f.x, flying: moving, speed: sp }, room.size[0]);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [a, reduced]);

  return (
    <div className="pl-ambience" aria-hidden="true">
      <div ref={fly} className="pl-fly" />
    </div>
  );
}
