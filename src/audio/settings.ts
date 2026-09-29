/**
 * Every sound knob in one place, like the CRT settings: production uses the
 * defaults, the dev panel edits a copy kept in localStorage.
 *
 * Each channel is one strip in the mixer: volume, stereo position, muffling
 * (low-pass), thinning (high-pass), a room reverb send and its own echo.
 * Room channels carry their timing too.
 */
export type Strip = {
  volume: number;
  /** −1 left … 1 right. */
  pan: number;
  /** Hz; lower is more muffled. */
  lowpass: number;
  /** Hz; higher is thinner, like a small speaker. */
  highpass: number;
  /** Room reverb send, 0–1. */
  reverb: number;
  /** Echo send, 0–1; delay in s; how much each repeat feeds the next. */
  echo: number;
  echoTime: number;
  echoFeedback: number;
};

const strip = (s: Partial<Strip>): Strip => ({
  volume: 0.5,
  pan: 0,
  lowpass: 16000,
  highpass: 20,
  reverb: 0.1,
  echo: 0,
  echoTime: 0.18,
  echoFeedback: 0.25,
  ...s,
});

export const SOUND_DEFAULTS = {
  master: { volume: 0.9, reverbTime: 1.6 },
  // ---- the room (intro) ----
  /** The unseen TV to the right: a record from another room. */
  tv: strip({ volume: 0.2, pan: 0.72, lowpass: 1150, highpass: 240, reverb: 0.58, echo: 0.22, echoTime: 0.13, echoFeedback: 0.28 }),
  /** Plays only while the fly is in the air. */
  fly: { ...strip({ volume: 0.05, pan: 0.35, lowpass: 2300, highpass: 260, reverb: 0.25 }), flyMin: 2, flyMax: 4.5, sitMin: 5, sitMax: 11 },
  crickets: { ...strip({ volume: 0.045, pan: -0.8, lowpass: 7500, highpass: 1400, reverb: 0.13, echo: 0.08 }), playMin: 2, playMax: 4.5, gapMin: 5, gapMax: 6.5 },
  /** The desk lamp to the left; dips in step with its light. */
  lamp: { ...strip({ volume: 0.03, pan: -0.6, lowpass: 5200, highpass: 80, reverb: 0.08, echo: 0.06 }), flicker: 0.9 },
  /** Console, disc and monitor sounds in the room. */
  intro: strip({ volume: 0.45, lowpass: 9000, reverb: 0.25 }),
  // ---- the music ----
  /** The menu, game and finale takes; per-take levels, and how pausing muffles them. */
  music: { ...strip({ volume: 0.5, reverb: 0 }), menu: 0.7, game: 0.6, finale: 0.8, finalAt: 80, pauseMuffle: 700 },
  // ---- the game ----
  /** Paper torn off the page. */
  pickup: { ...strip({ volume: 0.3, lowpass: 7000, reverb: 0.08 }), bright: 0.5 },
  /** Notes climbing with the streak, a short run on each new streak word. */
  streak: strip({ volume: 0.22, lowpass: 6000, reverb: 0.3, echo: 0.18, echoTime: 0.19, echoFeedback: 0.3 }),
  /** Confetti poppers and the victory fireworks. */
  party: strip({ volume: 0.4, lowpass: 9000, reverb: 0.35 }),
  /** The YOU WON! motif. */
  victory: strip({ volume: 0.38, lowpass: 9000, reverb: 0.45, echo: 0.12, echoTime: 0.25, echoFeedback: 0.3 }),
  /** The speed boost's rush. */
  boost: strip({ volume: 0.3, lowpass: 9000, reverb: 0.12 }),
  /** 3, 2, 1, GO and the rabbit landing on the page. */
  countdown: strip({ volume: 0.3, lowpass: 8000, reverb: 0.2 }),
  /** Static and a tube thunk when the CRT switches channel. */
  tube: strip({ volume: 0.22, lowpass: 7000, highpass: 120, reverb: 0.1 }),
};

export type SoundSettings = typeof SOUND_DEFAULTS;
export type Channel = Exclude<keyof SoundSettings, "master">;
export const CHANNELS = Object.keys(SOUND_DEFAULTS).filter((k) => k !== "master") as Channel[];

const KEY = "webivore.sound.v1";
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

function load(): SoundSettings {
  const base = clone(SOUND_DEFAULTS);
  if (!import.meta.env.DEV) return base;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (saved)
      for (const group of Object.keys(base) as (keyof SoundSettings)[]) Object.assign(base[group], saved[group] ?? {});
  } catch {
    /* storage unavailable: defaults */
  }
  return base;
}

export const soundSettings: SoundSettings = load();
const listeners = new Set<() => void>();

export function setSoundSetting<G extends keyof SoundSettings>(group: G, key: keyof SoundSettings[G], value: number) {
  (soundSettings[group] as Record<string, unknown>)[key as string] = value;
  try {
    localStorage.setItem(KEY, JSON.stringify(soundSettings));
  } catch {
    /* ignore */
  }
  listeners.forEach((f) => f());
}

export function resetSoundSettings() {
  const d = clone(SOUND_DEFAULTS);
  for (const group of Object.keys(d) as (keyof SoundSettings)[]) Object.assign(soundSettings[group], d[group]);
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((f) => f());
}

export function onSoundSettings(f: () => void) {
  listeners.add(f);
  return () => void listeners.delete(f);
}
