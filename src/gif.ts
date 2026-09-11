/** GIF89a encoder. Fixed global palette, LZW compression, infinite animation loop. */
export class GifEncoder {
  bytes: number[] = [];
  constructor(
    public width: number,
    public height: number,
  ) {
    this.text("GIF89a");
    this.word(width);
    this.word(height);
    this.bytes.push(0xf7, 0, 0);
    for (let i = 0; i < 216; i++)
      this.bytes.push(
        Math.floor(i / 36) * 51,
        (Math.floor(i / 6) % 6) * 51,
        (i % 6) * 51,
      );
    for (let i = 0; i < 40; i++) {
      const v = Math.round((i * 255) / 39);
      this.bytes.push(v, v, v);
    }
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
  frame(rgba: Uint8ClampedArray, delay = 8) {
    const pixels = new Uint8Array(this.width * this.height);
    for (let i = 0; i < pixels.length; i++) {
      const r = rgba[i * 4],
        g = rgba[i * 4 + 1],
        b = rgba[i * 4 + 2];
      pixels[i] =
        Math.max(r, g, b) - Math.min(r, g, b) < 18
          ? 216 + Math.round((((r + g + b) / 3) * 39) / 255)
          : Math.round(r / 51) * 36 +
            Math.round(g / 51) * 6 +
            Math.round(b / 51);
    }
    this.bytes.push(0x21, 0xf9, 4, 4);
    this.word(delay);
    this.bytes.push(0, 0, 0x2c);
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
