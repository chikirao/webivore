import { snapshot } from "../server/snapshot.ts";
import { writeFile, mkdir } from "node:fs/promises";
await mkdir("artifacts/readiness", { recursive: true });
const urls = [
  "https://www.youtube.com/watch?v=jNQXAC9IVRw",
  "https://en.wikipedia.org/wiki/Internet",
  "https://example.com",
  "https://react.dev",
  "https://www.pexels.com/search/nature/",
];
for (const [i, url] of urls.entries()) {
  const start = Date.now();
  try {
    const data = await snapshot(url);
    await writeFile(
      `artifacts/readiness/after-${i}.json`,
      JSON.stringify(data),
    );
    await writeFile(
      `artifacts/readiness/after-${i}.png`,
      Buffer.from(data.atlas.split(",")[1], "base64"),
    );
    console.log(
      JSON.stringify({
        url,
        ms: Date.now() - start,
        pieces: data.pieces.length,
        ...data.diagnostics,
      }),
    );
  } catch (error) {
    console.log(
      JSON.stringify({ url, ms: Date.now() - start, error: error.message }),
    );
  }
}
