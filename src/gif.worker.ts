import { GifEncoder } from "./gif";
let encoder: GifEncoder;
self.onmessage = (event: MessageEvent) => {
  try {
    const d = event.data;
    if (d.type === "start") encoder = new GifEncoder(d.size, d.size);
    if (d.type === "frame") {
      encoder.frame(new Uint8ClampedArray(d.pixels), d.delay);
      self.postMessage({ type: "frame" });
    }
    if (d.type === "finish") {
      const bytes = encoder.finish();
      self.postMessage({ type: "done", bytes }, { transfer: [bytes.buffer] });
    }
  } catch (error) {
    self.postMessage({ type: "error", message: String(error) });
  }
};
