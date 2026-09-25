import { encodeLoop } from "./gif";
let frames: Uint8ClampedArray[] = [];
let size = 0;
self.onmessage = (event: MessageEvent) => {
  try {
    const d = event.data;
    if (d.type === "start") (frames = []), (size = d.size);
    if (d.type === "frame") {
      frames.push(new Uint8ClampedArray(d.pixels));
      self.postMessage({ type: "frame" });
    }
    if (d.type === "finish") {
      // The palette needs every frame, so encoding happens here in one pass.
      const bytes = encodeLoop(frames, size, d.delay, (p) => self.postMessage({ type: "progress", value: p }));
      frames = [];
      self.postMessage({ type: "done", bytes }, { transfer: [bytes.buffer] });
    }
  } catch (error) {
    self.postMessage({ type: "error", message: String(error) });
  }
};
