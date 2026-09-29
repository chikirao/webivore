/**
 * Every CRT knob in one place. Production uses the defaults; the dev panel
 * edits a copy stored in localStorage so tuning survives reloads.
 */
export const CRT_DEFAULTS = {
  /** The monitor in the room (prelude). */
  screen: {
    curve: 0.078,
    overscan: 1.03,
    lines: 300,
    scanlines: 0.71,
    grille: 0.72,
    halation: 0.38,
    convergence: 1,
    noise: 0.095,
    /** Peak white of the picture: the tube is dimmer than the lit room around it. */
    white: 0.68,
    /** Glass sits recessed in the plastic: shadow under the overhang, a dark seam. */
    inset: 0.65,
    insetWidth: 0.05,
    /** Light chamfer on the plastic's lower lip, shadowed upper lip. */
    bevel: 0.6,
  },
  /** Relit room plate (prelude). */
  room: {
    lamp: 0.24,
    tv: 0.5,
    spill: 0,
    tvReflect: 0.5,
    moon: 0.55,
    /** Film grain over the room: amount, grain size in screen px, new frames per second. */
    grain: 0.13,
    /** Grain cell in px on a 1920 × 1080 screen; scales with the room on other screens. */
    grainSize: 1.5,
    grainFps: 45,
    /** Grain that is there even in the dark (0 = only where lamp/TV light falls). */
    grainShadows: 0.11,
    /** 0 = mono grain, 1 = per-channel colour grain. */
    grainColor: 0.3,
    /** Cloud behind the window: darkening where it passes, whole-window dim as it covers the moon. */
    cloudDark: 0.79,
    windowDim: 0.38,
    cloudSize: 1.3,
    cloudPeriod: 59,
  },
  /** The tube over the page and the game. */
  overlay: {
    enabled: true,
    scanlines: 0.17,
    linePx: 3,
    grille: 0.14,
    vignette: 0.46,
    corner: 0.55,
    edgeRgb: 3.5,
    edgeWidth: 0.35,
    barrel: 0,
    noise: 0.035,
    flicker: 0.025,
    glare: 0.05,
  },
  /** Bursts and channel switches. */
  burst: {
    kick: 0.35,
    kickMs: 210,
    switchMs: 270,
    rgbSplit: 18,
    tear: 26,
    bands: 0.55,
  },
};

export type CrtSettings = typeof CRT_DEFAULTS;
const KEY = "webivore.crt.v1";
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

function load(): CrtSettings {
  const base = clone(CRT_DEFAULTS);
  if (!import.meta.env.DEV) return base;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (saved)
      for (const group of Object.keys(base) as (keyof CrtSettings)[])
        Object.assign(base[group], saved[group] ?? {});
  } catch {
    /* storage unavailable: defaults */
  }
  return base;
}

export const crtSettings: CrtSettings = load();
const listeners = new Set<() => void>();

export function setCrtSetting<G extends keyof CrtSettings>(group: G, key: keyof CrtSettings[G], value: number | boolean) {
  (crtSettings[group] as Record<string, unknown>)[key as string] = value;
  try {
    localStorage.setItem(KEY, JSON.stringify(crtSettings));
  } catch {
    /* ignore */
  }
  listeners.forEach((f) => f());
}

export function resetCrtSettings() {
  const d = clone(CRT_DEFAULTS);
  for (const group of Object.keys(d) as (keyof CrtSettings)[]) Object.assign(crtSettings[group], d[group]);
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((f) => f());
}

export function onCrtSettings(f: () => void) {
  listeners.add(f);
  return () => void listeners.delete(f);
}
