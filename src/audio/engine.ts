import { useSyncExternalStore } from "react";
import { soundSettings, onSoundSettings, type Channel, type Strip } from "./settings";

/**
 * One AudioContext for the whole app: intro room, menus and game.
 *
 * Browsers only let audio start from a user gesture, so the context is
 * created suspended and unlocked by the first tap, click or key press;
 * whatever wants to play from then on (the room ambience) listens for that.
 * Every sound goes through a channel strip (settings.ts) into one master bus
 * with a shared room reverb and a soft limiter.
 */
type Bus = {
  input: GainNode;
  highpass: BiquadFilterNode;
  lowpass: BiquadFilterNode;
  volume: GainNode;
  panner: StereoPannerNode | GainNode;
  reverbSend: GainNode;
  echoSend: GainNode;
  delay: DelayNode;
  feedback: GainNode;
};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let reverb: ConvolverNode | null = null;
let reverbTime = 0;
const buses = new Map<Channel, Bus>();
let unlocked = false;
const unlockListeners = new Set<() => void>();

// ---------- mute: a user preference, kept across visits ----------
const MUTE_KEY = "webivore.muted";
let muted = (() => {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
})();
const muteListeners = new Set<() => void>();

export function isMuted() {
  return muted;
}
export function setMuted(value: boolean) {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? "1" : "0");
  } catch {
    /* ignore */
  }
  applyMaster();
  muteListeners.forEach((f) => f());
}
export function useMuted() {
  return useSyncExternalStore(
    (f) => {
      muteListeners.add(f);
      return () => void muteListeners.delete(f);
    },
    () => muted,
  );
}

// ---------- the player's mix: all sound and music levels, kept across visits ----------
export type Mix = { volume: number; music: number; musicMuted: boolean };
const MIX_KEY = "webivore.mix";
let mix: Mix = (() => {
  const base: Mix = { volume: 1, music: 1, musicMuted: false };
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(MIX_KEY) ?? "{}") };
  } catch {
    return base;
  }
})();
const mixListeners = new Set<() => void>();
export const getMix = () => mix;
export function setMix(patch: Partial<Mix>) {
  mix = { ...mix, ...patch };
  try {
    localStorage.setItem(MIX_KEY, JSON.stringify(mix));
  } catch {
    /* ignore */
  }
  applyMaster();
  mixListeners.forEach((f) => f());
}
export function onMix(f: () => void) {
  mixListeners.add(f);
  return () => void mixListeners.delete(f);
}
export function useMix() {
  return useSyncExternalStore(onMix, getMix);
}
/** Music's share of the mix: 0 when muted either way. */
export const musicLevel = () => (mix.musicMuted ? 0 : mix.music);

// ---------- context ----------
/** The shared context (created suspended on first use), or null without Web Audio. */
export function audio(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC({ latencyHint: "interactive" });
  } catch {
    return null;
  }
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 8;
  limiter.ratio.value = 6;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.2;
  master = ctx.createGain();
  master.connect(limiter).connect(ctx.destination);
  reverb = ctx.createConvolver();
  reverb.connect(master);
  applyMaster();
  onSoundSettings(() => {
    applyMaster();
    for (const [name, bus] of buses) applyStrip(bus, soundSettings[name]);
  });
  if (import.meta.env.DEV) Object.assign(window, { __audio: { ctx, master } });
  document.addEventListener("visibilitychange", () => {
    if (!ctx || !unlocked) return;
    if (document.hidden) void ctx.suspend();
    else void ctx.resume();
  });
  return ctx;
}

export const audioReady = () => unlocked && ctx?.state === "running";

const events = ["pointerdown", "pointerup", "touchend", "keydown", "click"] as const;
function markUnlocked() {
  if (unlocked) return;
  unlocked = true;
  for (const e of events) removeEventListener(e, unlock, true);
  gestureListeners.clear();
  unlockListeners.forEach((f) => f());
  unlockListeners.clear();
  muteListeners.forEach((f) => f());
}
function unlock() {
  const a = audio();
  if (!a) return;
  // media elements must be started inside the gesture
  if (!unlocked) gestureListeners.forEach((f) => f());
  // iOS needs a sound started inside the gesture itself
  const blip = a.createBufferSource();
  blip.buffer = a.createBuffer(1, 1, a.sampleRate);
  blip.connect(a.destination);
  blip.start();
  void a.resume().then(() => a.state === "running" && markUnlocked());
}

/**
 * Called once by the app. Browsers keep sound off until the first tap, click
 * or key press; where they allow autoplay (a returning visitor, some
 * settings) the context runs at once and sound starts with the page.
 */
export function installAudioUnlock() {
  for (const e of events) addEventListener(e, unlock, true);
  const a = audio();
  if (!a) return;
  if (a.state === "running") markUnlocked();
  else void a.resume().then(() => a.state === "running" && markUnlocked());
}
/** False until the browser lets sound play. */
export function useAudioUnlocked() {
  return useSyncExternalStore(
    (f) => {
      muteListeners.add(f);
      return () => void muteListeners.delete(f);
    },
    () => unlocked,
  );
}
const gestureListeners = new Set<() => void>();

/**
 * Runs `f` once audio can play (now, if it already can). `gesture` runs
 * synchronously inside each gesture until then, for media elements.
 */
export function whenAudioUnlocked(f: () => void, gesture?: () => void) {
  if (unlocked) {
    gesture?.();
    f();
    return () => {};
  }
  unlockListeners.add(f);
  if (gesture) gestureListeners.add(gesture);
  return () => {
    unlockListeners.delete(f);
    if (gesture) gestureListeners.delete(gesture);
  };
}

function applyMaster() {
  if (!ctx || !master) return;
  const m = soundSettings.master;
  master.gain.setTargetAtTime(muted ? 0 : m.volume * mix.volume, ctx.currentTime, 0.04);
  if (reverb && Math.abs(reverbTime - m.reverbTime) > 0.05) {
    reverbTime = m.reverbTime;
    reverb.buffer = impulse(ctx, reverbTime);
  }
}

/** A small-room impulse: decaying stereo noise, darker as it fades. */
function impulse(a: BaseAudioContext, seconds: number) {
  const n = Math.max(1, Math.floor(seconds * a.sampleRate)),
    buf = a.createBuffer(2, n, a.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      // one-pole low-pass that closes over the tail
      const k = 0.55 - 0.45 * t;
      lp += (Math.random() * 2 - 1 - lp) * k;
      d[i] = lp * Math.pow(1 - t, 2.4) * Math.min(1, i / (a.sampleRate * 0.006));
    }
  }
  return buf;
}

function applyStrip(b: Bus, s: Strip) {
  if (!ctx) return;
  const t = ctx.currentTime,
    k = 0.03;
  b.volume.gain.setTargetAtTime(s.volume, t, k);
  b.lowpass.frequency.setTargetAtTime(Math.max(60, s.lowpass), t, k);
  b.highpass.frequency.setTargetAtTime(Math.max(10, s.highpass), t, k);
  if ("pan" in b.panner) b.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, s.pan)), t, k);
  b.reverbSend.gain.setTargetAtTime(s.reverb, t, k);
  b.echoSend.gain.setTargetAtTime(s.echo, t, k);
  b.delay.delayTime.setTargetAtTime(Math.max(0.01, Math.min(1.9, s.echoTime)), t, 0.05);
  b.feedback.gain.setTargetAtTime(Math.max(0, Math.min(0.85, s.echoFeedback)), t, k);
}

/** The input node of a channel strip (built on first use). */
export function bus(name: Channel): AudioNode | null {
  const a = audio();
  if (!a || !master || !reverb) return null;
  let b = buses.get(name);
  if (!b) {
    const input = a.createGain(),
      highpass = a.createBiquadFilter(),
      lowpass = a.createBiquadFilter(),
      volume = a.createGain(),
      panner = a.createStereoPanner ? a.createStereoPanner() : a.createGain(),
      reverbSend = a.createGain(),
      echoSend = a.createGain(),
      delay = a.createDelay(2),
      tone = a.createBiquadFilter(),
      feedback = a.createGain();
    highpass.type = "highpass";
    highpass.Q.value = 0.6;
    lowpass.type = "lowpass";
    lowpass.Q.value = 0.6;
    tone.type = "lowpass";
    tone.frequency.value = 2600;
    input.connect(highpass).connect(lowpass).connect(volume).connect(panner).connect(master);
    panner.connect(reverbSend).connect(reverb);
    // each repeat comes back a little darker
    panner.connect(echoSend).connect(delay).connect(tone).connect(master);
    tone.connect(feedback).connect(delay);
    b = { input, highpass, lowpass, volume, panner, reverbSend, echoSend, delay, feedback };
    buses.set(name, b);
    const s = soundSettings[name];
    b.volume.gain.value = s.volume;
    b.lowpass.frequency.value = Math.max(60, s.lowpass);
    b.highpass.frequency.value = Math.max(10, s.highpass);
    if ("pan" in b.panner) b.panner.pan.value = s.pan;
    b.reverbSend.gain.value = s.reverb;
    b.echoSend.gain.value = s.echo;
    b.delay.delayTime.value = s.echoTime;
    b.feedback.gain.value = s.echoFeedback;
  }
  return b.input;
}

export type PlayOptions = {
  gain?: number;
  rate?: number;
  /** Extra stereo position on top of the channel's, −1…1. */
  pan?: number;
  /** Seconds from now. */
  delay?: number;
};

/** One-shot of a prepared buffer through a channel; silently nothing before unlock. */
export function playBuffer(channel: Channel, buffer: AudioBuffer | null | undefined, o: PlayOptions = {}) {
  if (!buffer || !audioReady() || muted) return null;
  const a = ctx!,
    input = bus(channel);
  if (!input) return null;
  const src = a.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = o.rate ?? 1;
  const g = a.createGain();
  g.gain.value = o.gain ?? 1;
  let out: AudioNode = g;
  if (o.pan && a.createStereoPanner) {
    const p = a.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, o.pan));
    g.connect(p);
    out = p;
  }
  src.connect(g);
  out.connect(input);
  src.start(a.currentTime + (o.delay ?? 0));
  return src;
}

/** Decodes a fetched file; resolves null when audio is unavailable or the file fails. */
export async function loadBuffer(url: string): Promise<AudioBuffer | null> {
  const a = audio();
  if (!a) return null;
  try {
    const data = await (await fetch(url)).arrayBuffer();
    return await new Promise<AudioBuffer>((resolve, reject) => a.decodeAudioData(data, resolve, reject));
  } catch {
    return null;
  }
}
