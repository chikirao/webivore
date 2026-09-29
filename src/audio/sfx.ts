import { audio, audioReady, bus, isMuted, playBuffer, whenAudioUnlocked } from "./engine";
import type { Channel } from "./settings";
import { soundSettings } from "./settings";
import { biquad, chirp, envelope, finish, grains, midi, mix, noise, rng, sweep, toBuffer } from "./dsp";

/**
 * Every short sound in the intro and the game. Noisy ones (paper, confetti,
 * fireworks, static, machinery) are rendered once into buffers; tonal ones
 * (streak notes, the victory motif, the countdown) are played live on
 * oscillators, in the same E-minor pentatonic as the trailer.
 */
const cache = new Map<string, AudioBuffer[]>();

function render(key: string, count: number, make: (sr: number, r: () => number, i: number) => Float32Array) {
  let list = cache.get(key);
  if (list) return list;
  const a = audio();
  if (!a) return [];
  list = Array.from({ length: count }, (_, i) => toBuffer(a, make(a.sampleRate, rng(hashKey(key) + i * 977), i)));
  cache.set(key, list);
  return list;
}
const hashKey = (s: string) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;
const pick = <T,>(list: T[]) => list[(Math.random() * list.length) | 0];
const jitter = (k: number) => 1 + (Math.random() * 2 - 1) * k;

// ---------------------------------------------------------------- paper
/** Tear lengths, s: short nibbles to a long rip for a big group. */
const TEARS = [0.07, 0.09, 0.11, 0.14, 0.18, 0.23, 0.29, 0.36];

function tearBuffers() {
  return render("tear", TEARS.length, (sr, r, i) => {
    const len = TEARS[i],
      n = Math.floor(len * sr);
    // fibres snapping: dense at first, thinning out as the strip comes free
    const x = grains(
      n,
      sr,
      r,
      (u) => 1900 * (1 - u) + 260 * u,
      (u) => Math.min(1, u / 0.12) * (1 - u) ** 0.7,
      [0.3, 1.3],
    );
    biquad(x, sr, "bandpass", 2300, 0.55);
    biquad(x, sr, "lowpass", 6500);
    // the soft lift of the paper, under the snaps
    const lift = biquad(noise(Math.floor(0.05 * sr), r), sr, "lowpass", 520);
    envelope(lift, sr, (t) => Math.min(1, t / 0.004) * Math.exp(-t / 0.014));
    mix(x, lift, 0.9);
    return finish(x, sr, 0.9, 0.002, 0.02);
  });
}

let lastTear = 0;
/** A strip of page torn off: longer and lower for bigger bites. `size` 0…1. */
export function tear(size: number) {
  const a = audio();
  if (!a || !audioReady()) return;
  // a burst of bites in one frame is one sound
  if (a.currentTime - lastTear < 0.05) return;
  lastTear = a.currentTime;
  const list = tearBuffers(),
    i = Math.min(list.length - 1, Math.max(0, Math.round(size * (list.length - 1) + (Math.random() - 0.5) * 1.5)));
  const bright = soundSettings.pickup.bright;
  playBuffer("pickup", list[i], {
    gain: 0.55 + 0.45 * size,
    rate: jitter(0.1) * (0.85 + bright * 0.3) * (1 - size * 0.12),
    pan: (Math.random() - 0.5) * 0.3,
  });
}

// ---------------------------------------------------------------- tonal voices
function voice(channel: Channel) {
  const a = audio();
  if (!a || !audioReady() || isMuted()) return null;
  const input = bus(channel);
  return input ? { a, input } : null;
}

/** Soft vibraphone: a sine with a quick metallic partial and a slow tremolo. */
function vibe(channel: Channel, m: number, at: number, dur: number, vel = 1) {
  const v = voice(channel);
  if (!v) return;
  const { a, input } = v,
    t = a.currentTime + at,
    f = midi(m);
  const out = a.createGain();
  out.gain.setValueAtTime(0, t);
  out.gain.linearRampToValueAtTime(0.32 * vel, t + 0.004);
  out.gain.exponentialRampToValueAtTime(0.0008, t + dur + 0.6);
  const trem = a.createOscillator(),
    tremDepth = a.createGain();
  trem.frequency.value = 5.4;
  tremDepth.gain.value = 0.07 * vel;
  trem.connect(tremDepth).connect(out.gain);
  const body = a.createOscillator();
  body.frequency.value = f;
  const bell = a.createOscillator(),
    bellGain = a.createGain();
  bell.frequency.value = f * 3.98;
  bellGain.gain.setValueAtTime(0.25, t);
  bellGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  body.connect(out);
  bell.connect(bellGain).connect(out);
  out.connect(input);
  for (const o of [body, bell, trem]) {
    o.start(t);
    o.stop(t + dur + 0.65);
  }
}

/** Pulse-wave blips, one after another (the trailer's arpeggio). */
function arp(channel: Channel, notes: number[], step: number, vel = 1, at = 0) {
  const v = voice(channel);
  if (!v) return;
  const { a, input } = v;
  const tone = a.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 4200;
  tone.connect(input);
  notes.forEach((m, i) => {
    const t = a.currentTime + at + i * step,
      last = i === notes.length - 1;
    const o = a.createOscillator(),
      g = a.createGain();
    o.type = "square";
    o.frequency.value = midi(m);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16 * vel, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0005, t + (last ? 0.32 : 0.09));
    o.connect(g).connect(tone);
    o.start(t);
    o.stop(t + (last ? 0.34 : 0.1));
  });
}

/** A detuned saw chord through a closing low-pass: the trailer's stab. */
function stab(channel: Channel, chord: number[], at: number, dur: number, vel = 1, release = 0.25) {
  const v = voice(channel);
  if (!v) return;
  const { a, input } = v,
    t = a.currentTime + at;
  const filter = a.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 0.9;
  filter.frequency.setValueAtTime(5200, t);
  filter.frequency.exponentialRampToValueAtTime(1100, t + Math.max(0.12, dur * 0.7));
  const g = a.createGain();
  const level = (0.16 * vel) / Math.sqrt(chord.length);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(level, t + 0.004);
  g.gain.setValueAtTime(level * 0.8, t + dur);
  g.gain.exponentialRampToValueAtTime(0.0005, t + dur + release);
  filter.connect(g).connect(input);
  for (const m of chord)
    for (const detune of [-11, 0, 11]) {
      const o = a.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = midi(m);
      o.detune.value = detune + (Math.random() - 0.5) * 4;
      o.connect(filter);
      o.start(t);
      o.stop(t + dur + release + 0.05);
    }
}

// ---------------------------------------------------------------- streak
/** E-minor pentatonic run the streak climbs, bar after bar. */
const LADDER = [76, 79, 81, 83, 86, 88, 91, 93];
/** One note per bite while a streak runs; higher streaks sit a step higher. */
export function streakNote(streak: number) {
  if (streak < 2) return;
  const lift = streak >= 50 ? 2 : 0;
  vibe("streak", LADDER[(streak - 2) % LADDER.length] + lift, 0, 0.18, 0.8);
}
/** A new streak word: a short run, longer and brighter up the tiers. */
export function streakTier(tier: number) {
  const runs = [
    [76, 83],
    [76, 79, 83],
    [76, 79, 83, 88],
    [79, 83, 86, 91],
    [76, 81, 86, 88, 93],
    [79, 83, 88, 91, 95],
    [76, 79, 83, 88, 91, 95, 100],
    [76, 81, 83, 88, 93, 95, 100, 105],
  ];
  arp("streak", runs[Math.max(0, Math.min(runs.length - 1, tier - 1))], 0.034, 0.9);
  if (tier >= 7) stab("streak", [64, 67, 71, 74, 78], 0.05, 0.3, 0.7);
}

/**
 * Streak milestones. 500: a boom, a big E-minor stab and a rising run.
 * 1000: two booms, the stab climbing a step, a long run and a bell shower.
 */
export function streakMilestone(level: 1 | 2) {
  thud();
  stab("streak", [40, 52, 59, 64, 67, 71], 0, 0.45, 1.1, 0.6);
  arp("streak", [64, 67, 71, 76, 79, 83, 88, 91], 0.03, 0.9, 0.05);
  if (level < 2) return;
  stab("streak", [43, 55, 62, 67, 71, 74], 0.5, 0.4, 1.1, 0.4);
  stab("streak", [40, 52, 59, 64, 68, 71, 76], 0.95, 1.1, 1.2, 1);
  setTimeout(thud, 950);
  arp("streak", [76, 79, 83, 88, 91, 95, 100, 103, 107], 0.028, 0.8, 0.6);
  [88, 91, 95, 100, 103, 107].forEach((m, i) => vibe("streak", m, 1 + i * 0.07, 0.6, 0.5));
}

// ---------------------------------------------------------------- party
function popperBuffers() {
  return render("popper", 3, (sr, r) => {
    const n = Math.floor(0.9 * sr);
    const x = new Float32Array(n);
    // the pop
    const snap = biquad(noise(Math.floor(0.03 * sr), r), sr, "bandpass", 1600, 0.8);
    envelope(snap, sr, (t) => Math.exp(-t / 0.005));
    mix(x, snap, 1);
    const thump = chirp(Math.floor(0.09 * sr), sr, (t) => 90 + 150 * Math.exp(-t / 0.012));
    envelope(thump, sr, (t) => Math.exp(-t / 0.03));
    mix(x, thump, 0.7);
    // paper fluttering out
    const flutter = grains(Math.floor(0.8 * sr), sr, r, (u) => 180 * (1 - u) + 20, (u) => (1 - u) ** 1.5, [0.8, 2.5]);
    biquad(flutter, sr, "highpass", 2500);
    mix(x, flutter, 0.35, Math.floor(0.03 * sr));
    return finish(x, sr, 0.9, 0.0005, 0.08);
  });
}
/** Confetti out of the streak badge. */
export function popper() {
  playBuffer("party", pick(popperBuffers()), { rate: jitter(0.08), pan: -0.2 });
}

function fireworkBuffers() {
  return render("firework", 3, (sr, r) => {
    const n = Math.floor(2 * sr);
    const x = new Float32Array(n);
    const boom = chirp(Math.floor(0.8 * sr), sr, (t) => 38 + 45 * Math.exp(-t / 0.08));
    envelope(boom, sr, (t) => Math.min(1, t / 0.003) * Math.exp(-t / 0.22));
    mix(x, boom, 1);
    const puff = biquad(noise(Math.floor(0.25 * sr), r), sr, "lowpass", 380);
    envelope(puff, sr, (t) => Math.exp(-t / 0.05));
    mix(x, puff, 0.8);
    // the crackling tail, falling apart
    const crackle = grains(Math.floor(1.7 * sr), sr, r, (u) => 70 * (1 - u) ** 1.2 + 4, (u) => (1 - u) ** 1.3, [0.6, 1.8]);
    biquad(crackle, sr, "bandpass", 3800, 0.6);
    mix(x, crackle, 0.55, Math.floor(0.12 * sr));
    return finish(x, sr, 0.9, 0.001, 0.2);
  });
}
/** One volley of victory confetti out of the ball: a small firework. */
export function firework(big = false) {
  playBuffer("party", pick(fireworkBuffers()), {
    gain: big ? 1 : 0.7,
    rate: jitter(0.06) * (big ? 0.92 : 1.05),
    pan: (Math.random() - 0.5) * 0.8,
  });
}

/** YOU WON!: a quick chord, then the long one it resolves to, with a sparkle. */
export function victory() {
  stab("victory", [62, 66, 69, 76], 0, 0.11, 0.9, 0.12);
  stab("victory", [52, 64, 67, 71, 74, 78], 0.17, 1.1, 1, 0.7);
  [76, 83, 88, 91, 95].forEach((m, i) => vibe("victory", m, 0.2 + i * 0.055, 0.5, 0.55));
}

// ---------------------------------------------------------------- countdown and landing
/** 3, 2, 1 blips and a brighter GO. */
export function countdown(n: number) {
  if (n > 0) arp("countdown", [71], 0, 0.9);
  else {
    arp("countdown", [76], 0, 1);
    arp("countdown", [83], 0, 0.8);
    vibe("countdown", 88, 0.02, 0.3, 0.6);
  }
}

function thudBuffer() {
  return render("thud", 1, (sr, r) => {
    const x = chirp(Math.floor(0.6 * sr), sr, (t) => 36 + 84 * Math.exp(-t / 0.09));
    envelope(x, sr, (t) => Math.exp(-t / 0.16));
    const dust = biquad(noise(Math.floor(0.3 * sr), r), sr, "lowpass", 900);
    envelope(dust, sr, (t) => (1 - t / 0.3) ** 3);
    mix(x, dust, 0.8);
    return finish(x, sr, 0.9, 0.0005, 0.05);
  });
}
/** The rabbit hits the page. */
export function thud() {
  playBuffer("countdown", thudBuffer()[0], { gain: 1.3 });
}

// ---------------------------------------------------------------- boost
function boostBuffers() {
  return render("boost", 3, (sr, r) => {
    // a rush of air that opens up, on a soft push of the ball
    const n = Math.floor(0.5 * sr);
    const x = sweep(noise(n, r), sr, (u) => 450 * (4200 / 450) ** Math.sqrt(u), 0.45);
    envelope(x, sr, (t, u) => Math.min(1, t / 0.015) * (1 - u) ** 2);
    const push = chirp(Math.floor(0.25 * sr), sr, (t) => 52 + 80 * Math.exp(-t / 0.04));
    envelope(push, sr, (t) => Math.exp(-t / 0.07));
    mix(x, push, 0.55);
    return finish(x, sr, 0.85, 0.0005, 0.03);
  });
}
/** A speed boost; bigger balls sound heavier. */
export function boost(size = 0) {
  playBuffer("boost", pick(boostBuffers()), { rate: jitter(0.04) * (1 - 0.2 * Math.min(1, size)) });
}

// ---------------------------------------------------------------- tube and machinery
function staticBuffers() {
  return render("static", 3, (sr, r, i) => {
    const len = [0.22, 0.4, 0.75][i],
      n = Math.floor(len * sr);
    const x = biquad(noise(n, r), sr, "bandpass", 3000, 0.4);
    // sample-and-hold flutter, like a detuned channel
    let hold = 1,
      next = 0;
    envelope(x, sr, (t, u) => {
      if (t >= next) {
        hold = 0.25 + r() * 0.75;
        next = t + 0.012 + r() * 0.03;
      }
      return hold * Math.min(1, t / 0.004) * (1 - u) ** 1.2;
    });
    const tock = chirp(Math.floor(0.06 * sr), sr, (t) => 70 + 60 * Math.exp(-t / 0.01));
    envelope(tock, sr, (t) => Math.exp(-t / 0.018));
    mix(x, tock, 0.9);
    return finish(x, sr, 0.8, 0.0005, 0.03);
  });
}
/** The CRT changes channel (0 short switch … 2 long power-on). */
export function tube(kind: 0 | 1 | 2 = 0) {
  playBuffer("tube", staticBuffers()[kind], { rate: jitter(0.05) });
}

/** Room machinery, mono, placed by the caller. */
function machineBuffers() {
  return render("machine", 5, (sr, r, i) => {
    if (i === 0) {
      // a plastic tick: the disc lifted off the rug
      const x = biquad(noise(Math.floor(0.03 * sr), r), sr, "bandpass", 3200, 1.2);
      envelope(x, sr, (t) => Math.exp(-t / 0.003));
      return finish(x, sr, 0.8, 0.0002, 0.005);
    }
    if (i === 1) {
      // the tray: motor buzz, clack, a second clack as it closes
      const n = Math.floor(0.7 * sr),
        x = new Float32Array(n);
      const motor = chirp(Math.floor(0.3 * sr), sr, (t) => 140 + 40 * t);
      for (let k = 0; k < motor.length; k++) motor[k] = Math.sign(motor[k]) * 0.4 + (r() * 2 - 1) * 0.3;
      biquad(motor, sr, "lowpass", 900);
      envelope(motor, sr, (t, u) => Math.min(1, t / 0.02) * (1 - u));
      mix(x, motor, 0.35);
      for (const at of [0.3, 0.58]) {
        const clack = biquad(noise(Math.floor(0.04 * sr), r), sr, "bandpass", 1800, 1);
        envelope(clack, sr, (t) => Math.exp(-t / 0.006));
        mix(x, clack, 1, Math.floor(at * sr));
      }
      return finish(x, sr, 0.85, 0.001, 0.03);
    }
    if (i === 2) {
      // the disc spinning up and reading: a rising whirr with a ticking laser
      const n = Math.floor(2.8 * sr);
      const x = chirp(n, sr, (t) => 45 + 70 * Math.min(1, t / 1.6));
      const hiss = biquad(noise(n, r), sr, "bandpass", 700, 0.8);
      mix(x, hiss, 0.5);
      biquad(x, sr, "lowpass", 1400);
      const seek = grains(n, sr, r, () => 9, () => 1, [2, 4]);
      biquad(seek, sr, "bandpass", 2600, 1.5);
      mix(x, seek, 0.35);
      envelope(x, sr, (t, u) => Math.min(1, t / 0.4) * (u > 0.85 ? (1 - u) / 0.15 : 1));
      return finish(x, sr, 0.8, 0.01, 0.05);
    }
    if (i === 3) {
      // the monitor powers on: degauss thunk and a fading 60 Hz buzz, a little static
      const n = Math.floor(1.3 * sr);
      const x = chirp(n, sr, () => 60);
      for (let k = 0; k < n; k++) x[k] = Math.tanh(x[k] * 3) * 0.6;
      biquad(x, sr, "lowpass", 700);
      envelope(x, sr, (t) => Math.min(1, t / 0.01) * Math.exp(-t / 0.35));
      const thunk = chirp(Math.floor(0.2 * sr), sr, (t) => 50 + 70 * Math.exp(-t / 0.03));
      envelope(thunk, sr, (t) => Math.exp(-t / 0.06));
      mix(x, thunk, 1.2);
      const fizz = biquad(noise(n, r), sr, "highpass", 3000);
      envelope(fizz, sr, (t) => 0.3 * Math.exp(-t / 0.5));
      mix(x, fizz, 0.5);
      return finish(x, sr, 0.85, 0.001, 0.1);
    }
    // a rising whoosh with static: the dive into the screen
    const n = Math.floor(1.2 * sr);
    const x = sweep(noise(n, r), sr, (u) => 300 * (9000 / 300) ** (u * u), 0.55);
    envelope(x, sr, (_, u) => (u < 0.85 ? (u / 0.85) ** 2 : (1 - u) / 0.15));
    return finish(x, sr, 0.8, 0.01, 0.02);
  });
}
/** Intro machinery; `pan` is where it sits in the room, −1…1. */
export function room(kind: "tick" | "tray" | "spin" | "boot" | "dive", pan = 0, gain = 1) {
  const i = ["tick", "tray", "spin", "boot", "dive"].indexOf(kind);
  playBuffer("intro", machineBuffers()[i], { pan, gain });
}

/** Test hooks for the dev panel. */
export const SFX_TESTS: Record<string, () => void> = {
  "Tear small": () => tear(0.1),
  "Tear big": () => tear(1),
  "Streak run": () => [2, 3, 4, 5, 6, 7].forEach((n, i) => setTimeout(() => streakNote(n), i * 180)),
  "Tier up": () => streakTier(4),
  "Tier 100": () => streakTier(7),
  "Streak 500": () => streakMilestone(1),
  "Streak 1000": () => streakMilestone(2),
  Popper: popper,
  Firework: () => firework(true),
  "You won": victory,
  "3-2-1-GO": () => [3, 2, 1, 0].forEach((n, i) => setTimeout(() => countdown(n), i * 800)),
  Landing: thud,
  Boost: () => boost(0),
  "Tube switch": () => tube(0),
  "Tube power-on": () => tube(2),
  "Disc tick": () => room("tick"),
  Tray: () => room("tray"),
  "Disc spin": () => room("spin"),
  "Monitor on": () => room("boot"),
  Dive: () => room("dive"),
};

// Render the buffers while nothing is happening, not on the first bite.
whenAudioUnlocked(() =>
  setTimeout(() => {
    tearBuffers();
    popperBuffers();
    staticBuffers();
    thudBuffer();
    boostBuffers();
  }, 60),
);
