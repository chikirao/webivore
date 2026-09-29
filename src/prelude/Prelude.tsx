import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { appUrl } from "../paths";
import { CrtScreen } from "../crt/CrtScreen";
import { BOOT_SECONDS, ScreenProgram, type ScreenPhase } from "../crt/screen-program";
import { crtTransition } from "../crt/fx";
import { crtSettings, onCrtSettings } from "../crt/settings";
import { fitRoom, pickRoom, zoomToScreen, type Room } from "./rooms";
import { Ambience, flickerSource } from "./Ambience";
import { roomLight } from "./RoomLight";
import { enterRoom, leaveRoom } from "../audio/room";
import { room as roomSound } from "../audio/sfx";
import { setMuted, useAudioUnlocked, useMuted } from "../audio/engine";
import "./prelude.css";

/**
 * The prelude: a teenager's room at night. The PC monitor boots into a
 * WEBIVORE splash, the disc on the rug pulses until it is clicked or dragged
 * into the console, the game "reads", the screen asks to be clicked and the
 * camera dives into the glass, handing over to the real entry screen.
 */
type Stage = "loading" | "room" | "boot" | "insert" | "reading" | "ready" | "zoom" | "done";
type Console = "off" | "tray-open" | "on";

const useViewport = () => {
  const [v, setV] = useState({ w: innerWidth, h: innerHeight });
  useEffect(() => {
    const on = () => setV({ w: innerWidth, h: innerHeight });
    addEventListener("resize", on);
    return () => removeEventListener("resize", on);
  }, []);
  return v;
};

/** Captured pages the splash platform flips through (docs/.../splash-sites). */
const SPLASH_SITES = ["wikipedia", "hn", "mdn", "github", "archive", "craigslist", "spacejam", "w3c", "cameronsworld"];
const asset = (room: Room, file: string) => appUrl(`assets/room/${room.dir}/${file}`);
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function preload(urls: string[], onProgress: (p: number) => void) {
  let done = 0;
  return Promise.all(
    urls.map(
      (u) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = img.onerror = () => {
            onProgress(++done / urls.length);
            resolve();
          };
          img.src = u;
        }),
    ),
  );
}

export function Prelude({ onDone }: { onDone: () => void }) {
  const view = useViewport();
  const room = useMemo(() => pickRoom(view.w, view.h), [view.w, view.h]);
  const fit = useMemo(() => fitRoom(room, view.w, view.h), [room, view.w, view.h]);
  const [stage, setStage] = useState<Stage>("loading");
  const [loaded, setLoaded] = useState(0);
  const [consoleState, setConsole] = useState<Console>("off");
  const [dragging, setDragging] = useState(false);
  const [discAway, setDiscAway] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [touch] = useState(() => matchMedia("(pointer: coarse)").matches);
  const muted = useMuted();
  const soundReady = useAudioUnlocked();
  const [, bump] = useState(0);
  useEffect(() => onCrtSettings(() => bump((n) => n + 1)), []);
  const screenCanvas = useRef<HTMLCanvasElement>(null);
  const plate = useRef<HTMLCanvasElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const discEl = useRef<HTMLButtonElement>(null);
  const discShadow = useRef<HTMLImageElement>(null);
  const crt = useRef<CrtScreen | null>(null);
  const program = useRef<ScreenProgram | null>(null);
  const stageRef = useRef(stage);
  stageRef.current = stage;
  const powerStart = useRef<number | null>(null);
  const zoomScale = useRef(1);
  const finished = useRef(false);
  const inserted = useRef(false);
  const revealed = useRef(false);
  /** One clock for the render loop, the power-on and the screen phases. */
  const origin = useRef(performance.now());
  const programClock = () => (performance.now() - origin.current) / 1000;

  const urls = useMemo(
    () =>
      [room.base, room.light, "console-off.webp", "console-on.webp", "console-tray-open.webp",
        "console-shadow-off.webp", "console-shadow-on.webp", "console-shadow-tray-open.webp",
        "disc-on-rug-sprite.webp", "disc-on-rug-shadow.webp"].map((f) => asset(room, f)),
    [room],
  );

  // the room's sound: starts with the first tap or click, fades out on the way in
  useEffect(() => {
    enterRoom();
    return () => leaveRoom(0.3);
  }, []);
  /** Stereo position of a plate rect in the room, -1..1. */
  const panOf = (r: { x: number; w: number }) => Math.max(-1, Math.min(1, ((r.x + r.w / 2) / room.size[0]) * 2 - 1)) * 0.7;

  // 1. load the plates, then fade the room in
  useEffect(() => {
    let live = true;
    void preload(urls, (p) => live && setLoaded(p)).then(() => {
      if (!live) return;
      setStage((s) => (s === "loading" ? "room" : s));
    });
    return () => {
      live = false;
    };
  }, [urls]);

  // 2. the tube: WebGL renderer + signal program, one rAF loop
  useEffect(() => {
    const canvas = screenCanvas.current;
    if (!canvas) return;
    const prog = new ScreenProgram(SPLASH_SITES.map((n) => appUrl(`assets/splash/${n}.webp`)));
    program.current = prog;
    if (import.meta.env.DEV) Object.assign(window, { __screen: prog });
    let screen: CrtScreen | null = null;
    try {
      screen = new CrtScreen(canvas, prog.canvas);
    } catch {
      screen = null; // no WebGL2: the plate's dark glass stays, the flow still works
    }
    crt.current = screen;
    let raf = 0,
      frame = 0,
      avg: [number, number, number] = [0, 0, 0];
    // the spill stutters now and then; the picture itself only barely
    const flicker = reduced() ? () => 1 : flickerSource(3, [2.5, 7], 0.45);
    const loop = () => {
      const now = (performance.now() - origin.current) / 1000;
      const fl = flicker(now);
      if (powerStart.current !== null) {
        const p = Math.min(1.3, (now - powerStart.current) / 1.25);
        if (screen) {
          screen.power = p;
          screen.wobble = Math.max(0, 1 - p) * 0.8;
        }
      }
      prog.draw(now);
      if (screen) {
        screen.flash = prog.phase === "launch" ? Math.min(0.6, screen.flash + 0.02) : 0;
        screen.gain = 1 - (1 - fl) * 0.22;
        screen.tv = roomLight.tv;
        screen.tvLevel = roomLight.tvLevel;
        screen.render(now);
      }
      // the light the tube throws into the room follows the picture
      if (scene.current) {
        if (++frame % 4 === 0) {
          avg = prog.average();
          scene.current.style.setProperty("--screen-rgb", avg.map(Math.round).join(" "));
        }
        const [r, g, b] = avg;
        const power = powerStart.current === null ? 0 : Math.min(1, (now - powerStart.current) / 1.25);
        const level = Math.min(1, ((r + g + b) / 3 / 255) * 1.8 + 0.12) * power * fl;
        scene.current.style.setProperty("--screen-level", level.toFixed(3));
        roomLight.screen = avg;
        roomLight.screenLevel = level;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      screen?.destroy();
      prog.destroy();
      crt.current = null;
    };
  }, []);

  // backing store follows the on-screen size of the glass
  useLayoutEffect(() => {
    const s = stage === "zoom" ? zoomScale.current : fit.s;
    const dpr = Math.min(2, devicePixelRatio || 1);
    // phones: a smaller tube backing store, the dive is short anyway
    const w = Math.min(touch ? 1280 : 2048, room.screen.w * s * dpr);
    crt.current?.resize(w, (w * room.screen.h) / room.screen.w);
  }, [fit.s, room, stage, touch]);

  // 3. timeline: room → power on → boot → splash (insert disc)
  useEffect(() => {
    if (stage === "room") {
      const t = setTimeout(() => setStage("boot"), reduced() ? 100 : 900);
      return () => clearTimeout(t);
    }
    if (stage === "boot") {
      // the raster needs ~0.8 s to open; BIOS text starts once it is lit
      powerStart.current = programClock();
      roomSound("boot", panOf(room.screen), 0.35);
      const t1 = setTimeout(() => program.current?.set("boot", programClock()), 50);
      program.current?.set("splash", programClock()); // anything but boot, so set() restarts it
      const t2 = setTimeout(() => setStage("insert"), (BOOT_SECONDS + 0.9) * 1000);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
    if (stage === "insert") program.current?.set("splash", programClock());
    if (stage === "reading") {
      program.current?.set("reading", programClock());
      roomSound("spin", panOf(room.console), 0.22);
      const start = performance.now(),
        total = reduced() ? 600 : 2600;
      let raf = 0;
      const tick = () => {
        const p = Math.min(1, (performance.now() - start) / total);
        if (program.current) program.current.progress = p;
        if (p < 1) raf = requestAnimationFrame(tick);
        else setStage("ready");
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }
    if (stage === "ready") program.current?.set("ready", programClock());
  }, [stage]);


  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    setLeaving(true);
    if (!revealed.current) {
      crtTransition("reveal"); // skip: no dive to lead in
      leaveRoom(0.4);
    }
    setTimeout(onDone, reduced() ? 50 : 420);
  }, [onDone]);

  // 4. insert: the disc flies from wherever it is into the open tray
  const insert = useCallback(
    (from?: { x: number; y: number }) => {
      if (stageRef.current !== "insert" || inserted.current) return;
      inserted.current = true;
      setStage("reading");
      const el = discEl.current;
      const { disc, tray } = room;
      const cx = disc.x + disc.w / 2,
        cy = disc.y + disc.h / 2;
      const start = from ?? { x: 0, y: 0 };
      const dx = tray.x - cx,
        dy = tray.y - cy;
      const k = tray.w / (disc.w * 0.82);
      const ms = reduced() ? 1 : 620;
      discShadow.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms * 0.4, fill: "forwards" });
      const anim = el?.animate(
        [
          { transform: `translate(${start.x}px, ${start.y}px) scale(${from ? 1.06 : 1})` },
          { transform: `translate(${(start.x + dx) / 2}px, ${Math.min(start.y, dy) - 120}px) scale(1.1)`, offset: 0.45 },
          { transform: `translate(${dx}px, ${dy}px) scale(${k})` },
        ],
        { duration: ms, easing: "cubic-bezier(.45,0,.25,1)", fill: "forwards" },
      );
      roomSound("tray", panOf(room.console), 0.6);
      const land = () => {
        setDiscAway(true);
        setConsole("tray-open");
        setTimeout(() => setConsole("on"), reduced() ? 50 : 520);
      };
      if (anim) anim.onfinish = land;
      else land();
    },
    [room],
  );

  // pointer: a tap inserts at once; dragging lifts the disc and needs a drop on
  // the console. Move/up are followed on window, so a finger that leaves the
  // button or a lost capture (touch browsers) still ends the drag.
  const drag = useRef<{ id: number; x0: number; y0: number; x: number; y: number; moved: boolean; stop: () => void } | null>(null);
  const offsetOf = (d: { x0: number; y0: number; x: number; y: number }) => ({ x: (d.x - d.x0) / fit.s, y: (d.y - d.y0) / fit.s - 30 });
  /** Dropped on the console: the pointer or the lifted disc over it, with a finger-sized margin. */
  const overConsole = (d: { x0: number; y0: number; x: number; y: number }) => {
    const c = room.console,
      m = Math.max(60, 48 / fit.s);
    const inside = (x: number, y: number) => x > c.x - m && x < c.x + c.w + m && y > c.y - m - 80 && y < c.y + c.h + m;
    const o = offsetOf(d);
    return (
      inside((d.x - fit.tx) / fit.s, (d.y - fit.ty) / fit.s) ||
      inside(room.disc.x + room.disc.w / 2 + o.x, room.disc.y + room.disc.h / 2 + o.y)
    );
  };
  const endDrag = (cancelled: boolean) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    d.stop();
    setDragging(false);
    scene.current?.classList.remove("drop-ready");
    if (!d.moved) return cancelled ? undefined : insert();
    const o = offsetOf(d);
    if (overConsole(d)) return insert(o);
    // missed: back onto the rug
    const el = discEl.current;
    if (!el) return;
    el.animate([{ transform: `translate(${o.x}px, ${o.y}px) scale(1.06)` }, { transform: "none" }], {
      duration: 380,
      easing: "cubic-bezier(.3,1.4,.5,1)",
    });
    el.style.transform = "";
    if (discShadow.current) {
      discShadow.current.style.opacity = "";
      discShadow.current.style.transform = "";
    }
  };
  const onDiscDown = (e: React.PointerEvent) => {
    if (stageRef.current !== "insert" || drag.current || e.button > 0) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* window listeners cover it */
    }
    const id = e.pointerId;
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d || ev.pointerId !== id) return;
      d.x = ev.clientX;
      d.y = ev.clientY;
      if (!d.moved && Math.hypot(d.x - d.x0, d.y - d.y0) < 6) return;
      if (!d.moved) {
        d.moved = true;
        setDragging(true);
        roomSound("tick", panOf(room.disc));
      }
      const o = offsetOf(d);
      discEl.current!.style.transform = `translate(${o.x}px, ${o.y}px) scale(1.06)`;
      if (discShadow.current) {
        discShadow.current.style.opacity = "0.35";
        discShadow.current.style.transform = `translate(${o.x + 18}px, ${o.y + 40}px)`;
      }
      scene.current?.classList.toggle("drop-ready", overConsole(d));
    };
    const up = (ev: PointerEvent) => ev.pointerId === id && endDrag(false);
    const cancel = (ev: PointerEvent) => ev.pointerId === id && endDrag(true);
    // a touch drag the browser takes over still counts where the finger was
    const lost = () => drag.current?.moved && endDrag(false);
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", cancel);
    el.addEventListener("lostpointercapture", lost);
    drag.current = {
      id,
      x0: e.clientX,
      y0: e.clientY,
      x: e.clientX,
      y: e.clientY,
      moved: false,
      stop: () => {
        removeEventListener("pointermove", move);
        removeEventListener("pointerup", up);
        removeEventListener("pointercancel", cancel);
        el.removeEventListener("lostpointercapture", lost);
      },
    };
  };
  useEffect(() => () => drag.current?.stop(), []);

  // 5. the dive into the glass
  const launch = useCallback(() => {
    if (stageRef.current !== "ready") return;
    program.current?.set("launch", programClock());
    zoomScale.current = zoomToScreen(room, innerWidth, innerHeight).s;
    setStage("zoom");
    const dive = reduced() ? 80 : 1050;
    roomSound("dive", 0, 0.8);
    leaveRoom(dive / 1000);
    revealed.current = true;
    crtTransition("reveal", dive);
    setTimeout(finish, dive);
  }, [room, finish]);

  const skip = useCallback(() => {
    setStage("done");
    finish();
  }, [finish]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") skip();
      else if ((e.key === "Enter" || e.key === " ") && stageRef.current === "ready") {
        e.preventDefault();
        launch();
      }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [skip, launch]);

  const zoom = stage === "zoom" ? zoomToScreen(room, view.w, view.h) : null;
  const t = zoom ?? fit;
  const [W, H] = room.size;
  const fade = (gap: number) => (gap > 0 ? Math.min(0.14, (90 / t.s) / H + 0.04) * 100 : 0);
  const mask = zoom
    ? undefined
    : [
        `linear-gradient(to bottom, transparent 0%, #000 ${fade(fit.gaps.top)}%, #000 ${100 - fade(fit.gaps.bottom)}%, transparent 100%)`,
        `linear-gradient(to right, transparent 0%, #000 ${fade(fit.gaps.left) * (H / W)}%, #000 ${100 - fade(fit.gaps.right) * (H / W)}%, transparent 100%)`,
      ].join(", ");

  // hints live in screen space next to the object they point at
  /** A plate rect in viewport pixels, for placing hints. */
  const box = (r: { x: number; y: number; w: number; h: number }) => ({
    x: t.tx + (r.x + r.w / 2) * t.s,
    top: t.ty + r.y * t.s,
    bottom: t.ty + (r.y + r.h) * t.s,
  });

  const layer = (file: string, x: number, y: number, extra = "") => (
    <img className={`pl-layer ${extra}`} src={asset(room, file)} alt="" draggable={false} style={{ left: x, top: y }} />
  );

  return (
    <div
      className={`prelude stage-${stage}${leaving ? " leaving" : ""}${dragging ? " dragging" : ""}`}
      role="dialog"
      aria-label="WEBIVORE intro"
    >
      <div className="pl-backdrop" style={{ backgroundImage: `url(${asset(room, room.base)})` }} />
      <div
        ref={scene}
        className="pl-scene"
        style={{
          width: W,
          height: H,
          transform: `translate(${t.tx}px, ${t.ty}px) scale(${t.s})`,
          maskImage: mask,
          WebkitMaskImage: mask,
          ["--base" as string]: `url(${asset(room, room.base)})`,
          ["--light" as string]: `url(${asset(room, room.light)})`,
        }}
      >
        <canvas
          ref={screenCanvas}
          className="pl-screen"
          style={{ left: room.screen.x, top: room.screen.y, width: room.screen.w, height: room.screen.h, borderRadius: room.screen.r }}
        />
        <img className="pl-layer pl-base" src={asset(room, room.base)} alt="" draggable={false} />
        <canvas key={room.id} ref={plate} className="pl-layer pl-lit" style={{ width: W, height: H }} />
        <div className="pl-glow" />
        <div
          className="pl-bevel"
          style={{
            left: room.screen.x,
            top: room.screen.y,
            width: room.screen.w,
            height: room.screen.h,
            borderRadius: room.screen.r,
            opacity: crtSettings.screen.bevel,
          }}
        />
        <div
          className="pl-screen-halo"
          style={{ left: room.screen.x, top: room.screen.y, width: room.screen.w, height: room.screen.h }}
        />
        <Ambience
          room={room}
          scale={fit.s}
          reduced={reduced()}
          plate={plate}
          baseUrl={asset(room, room.base)}
          spillUrl={asset(room, room.light)}
        />
        {layer(`console-shadow-${consoleState}.webp`, room.consoleShadow.x, room.consoleShadow.y)}
        {layer(`console-${consoleState}.webp`, room.console.x, room.console.y, "pl-console")}
        {!discAway && (
          <>
            <img
              ref={discShadow}
              className="pl-layer pl-disc-shadow"
              src={asset(room, "disc-on-rug-shadow.webp")}
              alt=""
              draggable={false}
              style={{ left: room.disc.x, top: room.disc.y }}
            />
            <button
              ref={discEl}
              type="button"
              className="pl-disc"
              style={{ left: room.disc.x, top: room.disc.y, width: room.disc.w, height: room.disc.h }}
              aria-label="Insert the WEBIVORE disc into the console"
              disabled={stage !== "insert"}
              onPointerDown={onDiscDown}
              onClick={() => !drag.current && insert()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  insert();
                }
              }}
            >
              <img src={asset(room, "disc-on-rug-sprite.webp")} alt="" draggable={false} />
            </button>
          </>
        )}
        <button
          type="button"
          className="pl-screen-hit"
          style={{ left: room.screen.x, top: room.screen.y, width: room.screen.w, height: room.screen.h }}
          aria-label="Start WEBIVORE"
          disabled={stage !== "ready"}
          onClick={launch}
          onPointerEnter={() => program.current && (program.current.hover = true)}
          onPointerLeave={() => program.current && (program.current.hover = false)}
        />
      </div>
      <div className="pl-vignette" />
      {stage === "insert" && !dragging && (
        <Hint className="pl-hint-disc" at={box(room.disc)}>
          {touch ? "Tap the disc" : "Click the disc"} <span>or drag it into the console</span>
        </Hint>
      )}
      {stage === "insert" && dragging && (
        <Hint className="pl-hint-drop" at={box(room.console)}>
          Drop it on the console
        </Hint>
      )}
      {stage === "ready" && (
        <Hint className="pl-hint-screen" at={box(room.screen)}>
          {touch ? "Tap the screen" : "Click the screen"}
        </Hint>
      )}
      {stage === "loading" && (
        <div className="pl-loading" role="progressbar" aria-label="Loading" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(loaded * 100)}>
          <i style={{ ["--p" as string]: loaded }} />
        </div>
      )}
      {stage !== "zoom" && !leaving && (
        <div className="pl-corner">
          <button type="button" className="pl-text-button" aria-pressed={muted} onClick={() => soundReady && setMuted(!muted)}>
            {muted ? "Sound on" : soundReady ? "Mute sound" : touch ? "Tap for sound" : "Click for sound"}
          </button>
          <button type="button" className="pl-text-button" onClick={skip}>
            Skip intro <kbd>Esc</kbd>
          </button>
        </div>
      )}
    </div>
  );
}

/** A hint plate under its target (above when there is no room), kept inside the viewport. */
function Hint({ at, className, children }: { at: { x: number; top: number; bottom: number }; className: string; children: React.ReactNode }) {
  const el = useRef<HTMLParagraphElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; arrow: number; above: boolean } | null>(null);
  useLayoutEffect(() => {
    const e = el.current;
    if (!e) return;
    const w = e.offsetWidth,
      h = e.offsetHeight,
      m = 12;
    const left = Math.max(m, Math.min(innerWidth - w - m, at.x - w / 2));
    const above = at.bottom + 14 + h > innerHeight - 64;
    const top = above ? Math.max(m, at.top - h - 14) : at.bottom + 14;
    setPos({ left, top, arrow: Math.max(14, Math.min(w - 14, at.x - left)), above });
  }, [at.x, at.top, at.bottom]);
  return (
    <p
      ref={el}
      className={`pl-hint ${className}${pos?.above ? " above" : ""}`}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0, ["--arrow" as string]: `${pos?.arrow ?? 0}px` }}
    >
      {children}
    </p>
  );
}
