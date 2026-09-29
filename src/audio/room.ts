import { appUrl } from "../paths";
import { audio, bus, loadBuffer, whenAudioUnlocked } from "./engine";
import { soundSettings } from "./settings";

/**
 * The intro room's ambience: a record playing on the TV beyond the right
 * edge, a buzzing desk lamp and crickets outside on the left, a fly in the
 * right corner. The lamp dips with its light and the fly only buzzes while
 * it is in the air; Ambience feeds both every frame.
 *
 * Loops (lamp, fly) are files of three identical periods; the middle one is
 * looped, so decoder padding never reaches the seam.
 */
const FILES = { lamp: "lamp-loop.mp3", fly: "fly-loop.mp3", crickets: "crickets.mp3" };
const PERIOD = { lamp: 3.6, fly: 3.2 };
const url = (f: string) => appUrl(`assets/audio/${f}`);

type Loop = { src: AudioBufferSourceNode; gain: GainNode; pan: StereoPannerNode | null };

let buffers: Promise<(AudioBuffer | null)[]> | null = null;
/** The record, decoded (no <audio> element: iOS would show it as a media player). */
let tvBuffer: Promise<AudioBuffer | null> | null = null;
let tv: AudioBufferSourceNode | null = null;
let tvGain: GainNode | null = null;
let lamp: Loop | null = null;
let fly: Loop | null = null;
/** Fade stage in front of each channel strip, so leaving can ramp everything down. */
let fades: GainNode[] = [];
let cricketTimer = 0;
let session = 0;
let cancelUnlock = () => {};

function faded(channel: "lamp" | "fly" | "crickets", t: number) {
  const a = audio()!,
    input = bus(channel),
    g = a.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.setTargetAtTime(1, t, 0.6);
  if (input) g.connect(input);
  fades.push(g);
  return g;
}

function loop(buffer: AudioBuffer | null, period: number, out: AudioNode): Loop | null {
  const a = audio();
  if (!a || !buffer) return null;
  const src = a.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.loopStart = Math.min(buffer.duration / 3, period) + 0.2;
  src.loopEnd = src.loopStart + period;
  const gain = a.createGain();
  gain.gain.value = 0;
  const pan = a.createStereoPanner ? a.createStereoPanner() : null;
  src.connect(gain);
  (pan ? gain.connect(pan) : gain).connect(out);
  src.start(0, src.loopStart);
  return { src, gain, pan };
}

/** The prelude mounts: fetch the files; the sound starts with the first gesture. */
export function enterRoom() {
  const id = ++session;
  const a = audio();
  if (!a) return;
  buffers ??= Promise.all([FILES.lamp, FILES.fly, FILES.crickets].map((f) => loadBuffer(url(f))));
  // behind a lowpassed TV speaker: 22 kHz is plenty and saves phones memory
  tvBuffer ??= loadBuffer(url("tv.mp3"), 22050);
  cancelUnlock();
  cancelUnlock = whenAudioUnlocked(() => void start(id));
}

async function start(id: number) {
  const a = audio();
  if (!a || id !== session) return;
  // the record starts first; the room's loops join when they have decoded
  void startTv(id);
  const [lampBuf, flyBuf, cricketBuf] = (await buffers) ?? [];
  if (id !== session || fades.length) return;
  const t = a.currentTime;
  lamp = loop(lampBuf ?? null, PERIOD.lamp, faded("lamp", t));
  fly = loop(flyBuf ?? null, PERIOD.fly, faded("fly", t));
  lamp?.gain.gain.setTargetAtTime(1, t, 0.5);
  scheduleCrickets(id, cricketBuf ?? null, faded("crickets", t), 1 + Math.random() * 2);
}

async function startTv(id: number) {
  const a = audio(),
    buffer = await tvBuffer;
  const input = bus("tv");
  if (!a || !buffer || !input || id !== session || tv) return;
  tvGain = a.createGain();
  tvGain.gain.setValueAtTime(0, a.currentTime);
  tvGain.gain.setTargetAtTime(1, a.currentTime, 0.25);
  tv = a.createBufferSource();
  tv.buffer = buffer;
  tv.loop = true;
  tv.connect(tvGain).connect(input);
  tv.start();
}

function stopTv() {
  try {
    tv?.stop();
  } catch {
    /* already stopped */
  }
  tv?.disconnect();
  tvGain?.disconnect();
  tv = tvGain = null;
  // 40 MB of decoded record: let it go; coming back to the room fetches it again
  tvBuffer = null;
}

/** A few seconds of crickets, then quiet for a while, again and again. */
function scheduleCrickets(id: number, buffer: AudioBuffer | null, out: AudioNode, wait: number) {
  clearTimeout(cricketTimer);
  cricketTimer = window.setTimeout(() => {
    const a = audio();
    if (!a || !buffer || id !== session) return;
    const s = soundSettings.crickets;
    const dur = Math.min(buffer.duration - 0.5, s.playMin + Math.random() * Math.max(0, s.playMax - s.playMin));
    const from = Math.random() * Math.max(0, buffer.duration - dur - 0.2);
    const src = a.createBufferSource(),
      g = a.createGain(),
      t = a.currentTime;
    src.buffer = buffer;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + 0.4);
    g.gain.setValueAtTime(1, t + Math.max(0.4, dur - 0.6));
    g.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(g).connect(out);
    src.start(t, from, dur + 0.05);
    const gap = s.gapMin + Math.random() * Math.max(0, s.gapMax - s.gapMin);
    scheduleCrickets(id, buffer, out, dur + gap);
  }, wait * 1000);
}

/** Per frame from Ambience: the lamp's light level and the fly (room px). */
export function roomFrame(lampLevel: number, f: { x: number; flying: boolean; speed: number }, roomWidth: number) {
  const a = audio();
  if (!a || !fades.length) return;
  const t = a.currentTime;
  if (lamp) {
    // the light rests near 0.94; a dip pulls the buzz down with it
    const dip = Math.max(0, Math.min(1, (0.93 - lampLevel) / 0.2));
    lamp.gain.gain.setTargetAtTime(Math.max(0.03, 1 - soundSettings.lamp.flicker * dip), t, 0.012);
  }
  if (fly) {
    const speed = Math.min(1, f.speed / 1400);
    fly.gain.gain.setTargetAtTime(f.flying ? 0.5 + 0.5 * speed : 0, t, f.flying ? 0.12 : 0.05);
    fly.src.playbackRate.setTargetAtTime(0.9 + 0.2 * speed, t, 0.1);
    fly.pan?.pan.setTargetAtTime(Math.max(-1, Math.min(1, ((f.x / roomWidth) * 2 - 1) * 0.8)), t, 0.1);
  }
}

/** The prelude hands over: everything fades out over `seconds`. */
export function leaveRoom(seconds = 1) {
  const id = ++session;
  cancelUnlock();
  clearTimeout(cricketTimer);
  const a = audio();
  if (!a) return;
  const t = a.currentTime,
    tau = Math.max(0.02, seconds / 4);
  const ending = [lamp, fly],
    old = fades;
  for (const g of [...old, tvGain]) g?.gain.setTargetAtTime(0, t, tau);
  lamp = fly = null;
  fades = [];
  setTimeout(() => {
    for (const l of ending) {
      try {
        l?.src.stop();
      } catch {
        /* already stopped */
      }
      l?.src.disconnect();
    }
    old.forEach((g) => g.disconnect());
    if (id === session) stopTv();
  }, seconds * 1000 + 250);
}
