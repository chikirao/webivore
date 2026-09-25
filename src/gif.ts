/**
 * GIF89a encoder for the trophy loop.
 *
 * The palette is built once from every frame (median cut over a 15-bit
 * histogram), so the ball's photos and the red card share 255 tuned colours
 * instead of a fixed web-safe cube. An ordered (Bayer) dither hides banding and
 * stays identical wherever a frame does not change, which lets every later
 * frame mark unchanged pixels transparent: the static card costs almost nothing
 * and only the ball and the background wave are re-encoded.
 */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);
const DITHER = 14;
const COLOURS = 255,
  CLEAR = 255;

type Box = { bins: number[]; volume: number };

/** Median cut over a 5-bit-per-channel histogram. Returns up to `max` RGB colours. */
export function buildPalette(frames: Uint8ClampedArray[], max = COLOURS) {
  const hist = new Uint32Array(1 << 15);
  for (const rgba of frames)
    for (let i = 0; i < rgba.length; i += 12)
      hist[((rgba[i] >> 3) << 10) | ((rgba[i + 1] >> 3) << 5) | (rgba[i + 2] >> 3)]++;
  const all: number[] = [];
  for (let b = 0; b < hist.length; b++) if (hist[b]) all.push(b);
  const channel = (b: number, c: number) => (b >> (10 - c * 5)) & 31;
  const measure = (bins: number[]): Box => {
    let volume = 0;
    for (let c = 0; c < 3; c++) {
      let lo = 31,
        hi = 0;
      for (const b of bins) {
        const v = channel(b, c);
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      volume = Math.max(volume, hi - lo);
    }
    return { bins, volume };
  };
  const boxes = [measure(all)];
  while (boxes.length < max) {
    // Split the box with the most pixels weighted by its spread.
    let best = -1,
      score = 0;
    boxes.forEach((box, i) => {
      if (box.bins.length < 2) return;
      let n = 0;
      for (const b of box.bins) n += hist[b];
      const s = n * box.volume;
      if (s > score) (score = s), (best = i);
    });
    if (best < 0) break;
    const { bins } = boxes[best];
    let axis = 0,
      span = -1;
    for (let c = 0; c < 3; c++) {
      let lo = 31,
        hi = 0;
      for (const b of bins) {
        const v = channel(b, c);
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (hi - lo > span) (span = hi - lo), (axis = c);
    }
    bins.sort((a, b) => channel(a, axis) - channel(b, axis));
    let total = 0;
    for (const b of bins) total += hist[b];
    let acc = 0,
      cut = 1;
    for (; cut < bins.length - 1; cut++) {
      acc += hist[bins[cut - 1]];
      if (acc >= total / 2) break;
    }
    boxes.splice(best, 1, measure(bins.slice(0, cut)), measure(bins.slice(cut)));
  }
  const palette = new Uint8Array(256 * 3);
  boxes.forEach((box, i) => {
    let r = 0,
      g = 0,
      b = 0,
      n = 0;
    for (const bin of box.bins) {
      const w = hist[bin];
      r += (channel(bin, 0) * 8 + 4) * w;
      g += (channel(bin, 1) * 8 + 4) * w;
      b += (channel(bin, 2) * 8 + 4) * w;
      n += w;
    }
    palette.set([Math.round(r / n), Math.round(g / n), Math.round(b / n)], i * 3);
  });
  return { palette, size: boxes.length };
}

/** Nearest palette index for dithered RGB, cached on a 6-bit-per-channel grid. */
function mapper(palette: Uint8Array, size: number) {
  const cache = new Int16Array(1 << 18).fill(-1);
  return (r: number, g: number, b: number) => {
    const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
    let hit = cache[key];
    if (hit < 0) {
      const cr = (r & ~3) + 2,
        cg = (g & ~3) + 2,
        cb = (b & ~3) + 2;
      let best = 1e9;
      for (let i = 0; i < size; i++) {
        const dr = palette[i * 3] - cr,
          dg = palette[i * 3 + 1] - cg,
          db = palette[i * 3 + 2] - cb;
        const d = dr * dr * 3 + dg * dg * 4 + db * db * 2;
        if (d < best) (best = d), (hit = i);
      }
      cache[key] = hit;
    }
    return hit;
  };
}

export function quantize(rgba: Uint8ClampedArray, width: number, nearest: (r: number, g: number, b: number) => number) {
  const out = new Uint8Array(rgba.length / 4);
  const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
  for (let i = 0; i < out.length; i++) {
    const x = i % width,
      y = (i / width) | 0;
    const d = BAYER[(y & 3) * 4 + (x & 3)] * DITHER;
    out[i] = nearest(clamp(rgba[i * 4] + d), clamp(rgba[i * 4 + 1] + d), clamp(rgba[i * 4 + 2] + d));
  }
  return out;
}

export class GifEncoder {
  bytes: number[] = [];
  previous: Uint8Array | null = null;
  constructor(
    public width: number,
    public height: number,
    palette: Uint8Array,
  ) {
    this.text("GIF89a");
    this.word(width);
    this.word(height);
    this.bytes.push(0xf7, 0, 0);
    for (const v of palette) this.bytes.push(v);
    this.bytes.push(0x21, 0xff, 11);
    this.text("NETSCAPE2.0");
    this.bytes.push(3, 1, 0, 0, 0);
  }
  text(s: string) {
    for (const c of s) this.bytes.push(c.charCodeAt(0));
  }
  word(n: number) {
    this.bytes.push(n & 255, (n >> 8) & 255);
  }
  /** Palette indices of one full frame; unchanged pixels become transparent after the first. */
  frame(indices: Uint8Array, delay = 6) {
    const pixels = indices.slice();
    const prev = this.previous;
    if (prev) for (let i = 0; i < pixels.length; i++) if (pixels[i] === prev[i]) pixels[i] = CLEAR;
    this.previous = indices;
    // Disposal 1 (keep) and a transparent index, so later frames draw only what moved.
    this.bytes.push(0x21, 0xf9, 4, prev ? 0b101 : 0b100);
    this.word(delay);
    this.bytes.push(CLEAR, 0, 0x2c);
    this.word(0);
    this.word(0);
    this.word(this.width);
    this.word(this.height);
    this.bytes.push(0, 8);
    const data: number[] = [];
    let dictionary = new Map<number, number>(),
      next = 258,
      size = 9,
      bits = 0,
      buffer = 0;
    const emit = (code: number) => {
      buffer |= code << bits;
      bits += size;
      while (bits >= 8) {
        data.push(buffer & 255);
        buffer >>>= 8;
        bits -= 8;
      }
    };
    emit(256);
    let prefix = pixels[0];
    for (let i = 1; i < pixels.length; i++) {
      const suffix = pixels[i],
        key = prefix * 256 + suffix,
        known = dictionary.get(key);
      if (known !== undefined) {
        prefix = known;
        continue;
      }
      emit(prefix);
      if (next < 4096) {
        dictionary.set(key, next++);
        if (next > 1 << size && size < 12) size++;
      } else {
        emit(256);
        dictionary = new Map();
        next = 258;
        size = 9;
      }
      prefix = suffix;
    }
    emit(prefix);
    emit(257);
    if (bits) data.push(buffer & 255);
    for (let i = 0; i < data.length; i += 255) {
      const block = data.slice(i, i + 255);
      this.bytes.push(block.length, ...block);
    }
    this.bytes.push(0);
  }
  finish() {
    return new Uint8Array([...this.bytes, 0x3b]);
  }
}

/** Palette from all frames, then dither and encode each. `progress` gets 0..1. */
export function encodeLoop(frames: Uint8ClampedArray[], size: number, delay: number, progress?: (p: number) => void) {
  const { palette, size: count } = buildPalette(frames);
  const nearest = mapper(palette, count);
  const gif = new GifEncoder(size, size, palette);
  frames.forEach((rgba, i) => {
    gif.frame(quantize(rgba, size, nearest), delay);
    progress?.((i + 1) / frames.length);
  });
  return gif.finish();
}
