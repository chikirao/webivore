/**
 * Tiny offline DSP for procedural one-shots: seeded noise, grains, biquads and
 * a state-variable filter with a moving cutoff. Everything renders into
 * Float32Arrays that become AudioBuffers once, then play for free.
 */
export function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Filter = "lowpass" | "highpass" | "bandpass";

/** RBJ biquad, in place. */
export function biquad(x: Float32Array, sr: number, type: Filter, freq: number, q = 0.707) {
  const w = (2 * Math.PI * Math.min(freq, sr * 0.45)) / sr,
    cos = Math.cos(w),
    alpha = Math.sin(w) / (2 * q);
  let b0: number, b1: number, b2: number;
  if (type === "lowpass") {
    b0 = (1 - cos) / 2;
    b1 = 1 - cos;
    b2 = b0;
  } else if (type === "highpass") {
    b0 = (1 + cos) / 2;
    b1 = -(1 + cos);
    b2 = b0;
  } else {
    b0 = alpha;
    b1 = 0;
    b2 = -alpha;
  }
  const a0 = 1 + alpha,
    a1 = -2 * cos,
    a2 = 1 - alpha;
  let x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const x0 = x[i];
    const y0 = (b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
    x[i] = y0;
  }
  return x;
}

/** Band-pass state-variable filter whose centre follows `cutoff(u)`, u = 0…1 over the buffer. */
export function sweep(x: Float32Array, sr: number, cutoff: (u: number) => number, res = 0.5) {
  let ic1 = 0,
    ic2 = 0;
  const k = 2 - 2 * res;
  for (let i = 0; i < x.length; i++) {
    const g = Math.tan((Math.PI * Math.min(cutoff(i / x.length), sr * 0.45)) / sr);
    const a1 = 1 / (1 + g * (g + k)),
      a2 = g * a1,
      a3 = g * a2;
    const v3 = x[i] - ic2,
      v1 = a1 * ic1 + a2 * v3,
      v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    x[i] = v1;
  }
  return x;
}

/** Sparse noise grains (crackle); `rate(u)` grains per second, `amp(u)` envelope. */
export function grains(
  n: number,
  sr: number,
  r: () => number,
  rate: (u: number) => number,
  amp: (u: number) => number,
  grainMs: [number, number] = [0.5, 1.6],
) {
  const out = new Float32Array(n);
  let t = 0;
  const dur = n / sr;
  while (t < dur) {
    const u = t / dur;
    t += -Math.log(1 - r() * 0.999) / Math.max(1, rate(u));
    const i = Math.floor(t * sr),
      g = Math.max(2, Math.floor(((grainMs[0] + r() * (grainMs[1] - grainMs[0])) / 1000) * sr));
    if (i + g >= n) break;
    const a = amp(u) * (0.25 + 0.75 * r() ** 1.5);
    for (let k = 0; k < g; k++) out[i + k] += (r() * 2 - 1) * Math.exp(-k / (g / 3)) * a;
  }
  return out;
}

export function noise(n: number, r: () => number) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = r() * 2 - 1;
  return out;
}

/** Sine with a per-sample frequency. */
export function chirp(n: number, sr: number, freq: (t: number) => number) {
  const out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    ph += (2 * Math.PI * freq(i / sr)) / sr;
    out[i] = Math.sin(ph);
  }
  return out;
}

export function mix(into: Float32Array, x: Float32Array, gain = 1, at = 0) {
  for (let i = 0; i < x.length && i + at < into.length; i++) into[i + at] += x[i] * gain;
  return into;
}

export function envelope(x: Float32Array, sr: number, f: (t: number, u: number) => number) {
  for (let i = 0; i < x.length; i++) x[i] *= f(i / sr, i / x.length);
  return x;
}

/** Peak-normalise and fade both ends so nothing clicks. */
export function finish(x: Float32Array, sr: number, peak = 0.9, fadeIn = 0.001, fadeOut = 0.01) {
  let m = 0;
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]));
  const k = m > 0 ? peak / m : 0,
    a = Math.max(1, Math.floor(fadeIn * sr)),
    b = Math.max(1, Math.floor(fadeOut * sr));
  for (let i = 0; i < x.length; i++) {
    let g = k;
    if (i < a) g *= i / a;
    if (i > x.length - b) g *= (x.length - i) / b;
    x[i] *= g;
  }
  return x;
}

export function toBuffer(a: BaseAudioContext, x: Float32Array) {
  const b = a.createBuffer(1, x.length, a.sampleRate);
  b.getChannelData(0).set(x);
  return b;
}

export const midi = (m: number) => 440 * 2 ** ((m - 69) / 12);
