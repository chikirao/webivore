const base = "http://127.0.0.1:3001";
for (const url of [
  "https://example.com",
  "https://en.wikipedia.org/wiki/Internet",
  "https://news.ycombinator.com",
]) {
  await new Promise((r) => setTimeout(r, 600));
  const start = Date.now();
  try {
    const response = await fetch(`${base}/api/snapshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(65000),
    });
    const data = await response.json();
    console.log(
      JSON.stringify({
        url,
        status: response.status,
        ms: Date.now() - start,
        error: data.error,
        count: data.pieces?.length,
        height: data.height,
        images: data.pieces?.filter((p) => p.type === "IMAGE").length,
      }),
    );
    if (response.ok) {
      await (
        await import("node:fs/promises")
      ).writeFile(
        `artifacts/${new URL(url).hostname}.json`,
        JSON.stringify(data),
      );
    }
  } catch (e) {
    console.log(url, e.message);
  }
}
