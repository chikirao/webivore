import { chromium } from "playwright";
import assert from "node:assert/strict";
const target=process.env.LAYER_TEST_URL??"https://en.wikipedia.org/wiki/Internet";
const name=target.includes("ycombinator")?"hacker-news":"wikipedia";
const browser = await chromium.launch({
  args: ["--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:5174");
  await page
    .getByLabel("WHAT’S ON THE MENU?")
    .fill(target);
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/api/snapshot"),
    { timeout: 65000 },
  );
  await page.getByRole("button", { name: /^CONSUME/ }).click();
  const snapshot = await (await response).json();
  assert.ok(
    snapshot.pieces?.length > (name==="wikipedia"?650:110),
    JSON.stringify({ error: snapshot.error, count: snapshot.pieces?.length }),
  );
  assert.equal(snapshot.coverage, "exclusive");
  await page.waitForFunction(() => (window as any).__game?.ready);
  await page.waitForFunction(() => !(window as any).__game.paused);
  const stage = await page.evaluate(() => {
    const g = (window as any).__game;
    g.paused = true;
    g.muted = true;
    const helper = {
      collect(n: number) {
        for (let i = 0; i < n; i++) {
          const p = g.items
            .filter((p: any) => !p.gone && p.threshold <= g.capacity)
            .sort((a: any, b: any) => a.mass - b.mass)[0];
          if (!p) throw Error("growth stalled");
          g.pickup(p);
        }
        g.time += 1;
        g.animateWorld(0);
        g.surface.flush();
      },
    };
    helper.collect(24);
    const first = g.collection.fragments[0];
    const depth = first.depth;
    const vertices = Array.from(
      g.collection.layers[0].mesh.geometry.attributes.position.array.slice(
        0,
        243,
      ),
    );
    helper.collect(Math.min(240,g.items.length-24));
    const same = vertices.every(
      (n, i) =>
        n === g.collection.layers[0].mesh.geometry.attributes.position.array[i],
    );
    g.x = 640;
    g.y = 1700;
    g.heading = 0;
    g.vx = 0;
    g.vy = 0;
    g.resetCamera();
    g.cam.yaw = -0.55;
    g.cam.userZoom = 1.4;
    return {
      count: g.count,
      total: g.items.length,
      layers: g.collection.layers.length,
      allLayersVisible: g.collection.layers.every((l: any) => l.mesh.visible),
      firstDepth: depth,
      currentRadius: g.radius,
      same,
      firstStillBaked: first.baked,
    };
  });
  assert.ok(stage.same && stage.firstStillBaked && stage.allLayersVisible);
  assert.equal(stage.layers,Math.ceil(stage.count/48));
  assert.ok(stage.firstDepth < stage.currentRadius * 0.8);
  console.log("Persistent layers:", stage);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `artifacts/layers-${name}-front.png` });
  await page.evaluate(() => ((window as any).__game.cam.yaw += Math.PI));
  await page.waitForTimeout(700);
  await page.screenshot({ path: `artifacts/layers-${name}-back.png` });
  const finish = await page.evaluate(() => {
    const g = (window as any).__game;
    for (const p of [...g.items].sort(
      (a: any, b: any) => a.threshold - b.threshold,
    ))
      if (!p.gone) {
        if (p.threshold > g.capacity + 1e-6) throw Error("unreachable item");
        g.pickup(p);
      }
    g.time += 1;
    g.animateWorld(0);
    g.surface.flush();
    const rgb = g.level.pageColor
      .match(/\w\w/g)
      .map((n: string) => parseInt(n, 16));
    let remaining = 0;
    for (const tile of g.surface.tiles) {
      const data = tile.ctx.getImageData(
        0,
        0,
        tile.canvas.width,
        tile.canvas.height,
      ).data;
      for (let i = 0; i < data.length; i += 4)
        if (
          Math.abs(data[i] - rgb[0]) +
            Math.abs(data[i + 1] - rgb[1]) +
            Math.abs(data[i + 2] - rgb[2]) >
          24
        )
          remaining++;
    }
    const result = {
      count: g.count,
      total: g.items.length,
      radius: g.radius,
      maxRadius: g.maxRadius,
      remainingVisiblePixels: remaining,
      allFragmentsRetained: g.collection.fragments.length,
      layers: g.collection.layers.length,
      compactedLayers: g.collection.layers.filter((l:any)=>l.compacted).length,
    };
    g.x = 640;
    g.y = 4000;
    g.resetCamera();
    return result;
  });
  assert.equal(finish.count, finish.total);
  assert.equal(finish.remainingVisiblePixels, 0);
  assert.equal(finish.allFragmentsRetained, finish.total);
  assert.ok(finish.radius <= finish.maxRadius + 1e-7);
  console.log("Whole captured page consumed:", finish);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `artifacts/layers-${name}-cleared.png` });
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}


