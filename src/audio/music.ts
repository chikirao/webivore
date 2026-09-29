import { appUrl } from "../paths";
import { audio, bus, loadBuffer, musicLevel, onMix, whenAudioUnlocked } from "./engine";
import MAP_JSON from "./music-map.json";
import { onSoundSettings, soundSettings } from "./settings";

/**
 * The game's music: one theme in three takes (scripts/game-music.py).
 *
 * - menu:   the entry screen, slow and muffled;
 * - game:   a count-in under 3-2-1, the groove from GO, a long loop, then
 *           "last bites" near the end;
 * - finale: a jingle timed to the dance and the YOU WON! card, then the
 *           trophy screen's loop.
 *
 * Each file is an intro followed by loops. A section is [entry, loopStart,
 * loopEnd] in seconds: play from `entry`, then repeat [loopStart, loopEnd).
 * The files are rendered so that those loops are seamless.
 */
export type Track = "menu" | "game" | "finale";
type Section = [entry: number, start: number, end: number];
type TrackMap = { beat: number; bar: number; loop: Section; final?: Section };
export const MUSIC_MAP = MAP_JSON as unknown as Record<Track, TrackMap>;
const MAP = MUSIC_MAP;

type Playing = { track: Track; src: AudioBufferSourceNode; gain: GainNode; when: number; offset: number; section: Section };

const buffers = new Map<Track, Promise<AudioBuffer | null>>();
let current: Playing | null = null;
let wanted: Track | null = null;
let token = 0;
let cancelPending = () => {};
let wantFinal = false;
let chain: { input: GainNode; filter: BiquadFilterNode; out: GainNode } | null = null;
let paused = false;

const coarse = () => matchMedia("(pointer: coarse)").matches;

/**
 * A decoded buffer is kept at the rate it was decoded at, and the game take
 * is over two minutes of stereo: phones decode it at 32 kHz, the muffled menu
 * at 22 kHz, which keeps tens of megabytes off their memory.
 */
function rateFor(track: Track) {
  return track === "menu" ? 22050 : coarse() ? 32000 : 44100;
}

function load(track: Track) {
  let p = buffers.get(track);
  if (!p) {
    p = loadBuffer(appUrl(`assets/audio/music-${track}.mp3`), rateFor(track));
    buffers.set(track, p);
  }
  return p;
}

/** Fetch and decode a take ahead of time, so it starts on cue. */
export function prefetchMusic(track: Track) {
  whenAudioUnlocked(() => void load(track));
}

function level(track: Track) {
  const m = soundSettings.music;
  return track === "menu" ? m.menu : track === "game" ? m.game : m.finale;
}

function output() {
  const a = audio();
  if (!a) return null;
  if (!chain) {
    const input = a.createGain(),
      filter = a.createBiquadFilter(),
      out = a.createGain();
    filter.type = "lowpass";
    filter.frequency.value = 20000;
    filter.Q.value = 0.5;
    const target = bus("music");
    if (target) input.connect(filter).connect(out).connect(target);
    chain = { input, filter, out };
    applyPause();
  }
  return chain.input;
}

function start(track: Track, buffer: AudioBuffer, section: Section, when: number, offset: number) {
  const a = audio(),
    out = output();
  if (!a || !out) return;
  const src = a.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.loopStart = section[1];
  src.loopEnd = section[2];
  const gain = a.createGain();
  gain.gain.value = level(track);
  src.connect(gain).connect(out);
  src.start(when, offset);
  current = { track, src, gain, when, offset, section };
}

function stop(p: Playing | null, fade: number, at?: number) {
  const a = audio();
  if (!a || !p) return;
  const t = Math.max(a.currentTime, at ?? 0);
  p.gain.gain.cancelScheduledValues(t);
  p.gain.gain.setTargetAtTime(0, t, Math.max(0.01, fade / 4));
  try {
    p.src.stop(t + fade + 0.1);
  } catch {
    /* already stopped */
  }
}

export type PlayOptions = {
  /** Seconds the current take fades out over. */
  fade?: number;
  /** Where in the file to begin. */
  offset?: number;
  /** performance.now() of the moment the take should have started: a late start catches up. */
  since?: number;
};

/** Switches to a take (null: silence), fading the current one out. */
export function playMusic(track: Track | null, { fade = 1, offset = 0, since }: PlayOptions = {}) {
  if (track === wanted) return;
  const previous = wanted;
  wanted = track;
  const id = ++token;
  cancelPending();
  stop(current, fade);
  current = null;
  if (track !== "game") wantFinal = false;
  // the take that ended is let go (back on the menu, everything is)
  if (previous && previous !== track) buffers.delete(previous);
  if (track === "menu") for (const t of [...buffers.keys()]) if (t !== "menu") buffers.delete(t);
  if (!track) return;
  cancelPending = whenAudioUnlocked(() => {
    void load(track).then((buffer) => {
      const a = audio();
      if (id !== token || !buffer || !a) return;
      const m = MAP[track];
      // from the top: the intro, then the loop (or straight into the last bites)
      const late = since === undefined ? 0 : Math.max(0, (performance.now() - since) / 1000);
      if (wantFinal && m.final) start(track, buffer, m.final, a.currentTime + 0.03, m.final[0]);
      else start(track, buffer, m.loop, a.currentTime + 0.03, Math.min(offset + late, m.loop[1]));
    });
  });
}

/** Seconds of the file playing at context time `t`. */
function position(p: Playing, t: number) {
  const pos = p.offset + (t - p.when),
    [, s, e] = p.section;
  return pos < e ? pos : s + ((pos - s) % (e - s));
}

/** The game take moves to its last-bites loop, on the next bar line. */
export function musicFinal() {
  wantFinal = true;
  const a = audio(),
    p = current;
  if (!a || !p || p.track !== "game") return;
  const final = MAP.game.final;
  if (!final || p.section === final) return;
  void load("game").then((buffer) => {
    if (!buffer || current !== p) return;
    const now = a.currentTime + 0.05,
      pos = position(p, now),
      bar = MAP.game.bar,
      origin = p.section[0];
    let next = origin + Math.ceil((pos - origin) / bar) * bar;
    if (next - pos < 0.08) next += bar;
    const when = now + (next - pos);
    stop(p, 0.03, when);
    start("game", buffer, final, when, final[0]);
  });
}

/** The finale skips ahead to its trophy-screen loop (the YOU WON! card was skipped). */
export function musicToLoop() {
  const a = audio(),
    p = current;
  if (!a || !p || p.track !== "finale" || position(p, a.currentTime) >= p.section[0] - 0.3) return;
  void load("finale").then((buffer) => {
    if (!buffer || current !== p) return;
    const when = a.currentTime + 0.02;
    stop(p, 0.25, when);
    start("finale", buffer, p.section, when, p.section[0]);
    current!.gain.gain.setValueAtTime(0, when);
    current!.gain.gain.setTargetAtTime(level("finale"), when, 0.08);
  });
}

function applyPause() {
  const a = audio();
  if (!a || !chain) return;
  const t = a.currentTime;
  chain.filter.frequency.setTargetAtTime(paused ? soundSettings.music.pauseMuffle : 20000, t, 0.12);
  chain.out.gain.setTargetAtTime((paused ? 0.55 : 1) * musicLevel(), t, 0.12);
}

/** Pausing muffles the music instead of stopping it. */
export function musicPause(on: boolean) {
  if (paused === on) return;
  paused = on;
  applyPause();
}

onSoundSettings(() => {
  const a = audio();
  if (a && current) current.gain.gain.setTargetAtTime(level(current.track), a.currentTime, 0.05);
  applyPause();
});
onMix(applyPause);

export const MUSIC_TESTS: Record<string, () => void> = {
  Menu: () => playMusic("menu", { fade: 0.3 }),
  Game: () => playMusic("game", { fade: 0.3 }),
  "Last bites": musicFinal,
  Finale: () => playMusic("finale", { fade: 0.3 }),
  "Stop music": () => playMusic(null, { fade: 0.5 }),
};

if (import.meta.env.DEV)
  Object.assign(window, {
    __musicFinal: musicFinal,
    __music: () => {
      const a = audio();
      return {
        wanted,
        playing: current?.track ?? null,
        section: current?.section ?? null,
        position: a && current ? position(current, a.currentTime) : null,
        decoded: [...buffers.keys()],
        paused,
      };
    },
  });
