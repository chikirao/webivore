import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  args: ["--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 650 },
  });
  await page.goto("http://localhost:5174");
  const frames = await page.evaluate(async () => {
    const THREE = await import("/node_modules/.vite/deps/three.js");
    const { Rabbit } = await import("/src/rabbit.ts");
    const rabbit = new Rabbit();
    await rabbit.ready;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#fff");
    scene.add(rabbit.root, new THREE.HemisphereLight(0xffffff, 0x777777, 3));
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(200, 200);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const camera = new THREE.OrthographicCamera(-50, 50, 90, -10, 0.1, 1000);
    const contact = document.createElement("div");
    contact.style.cssText =
      "position:fixed;inset:0;z-index:999;background:white;display:grid;grid-template-columns:repeat(8,200px);grid-template-rows:repeat(3,214px)";
    document.body.append(contact);
    const frames = [];
    for (let row = 0; row < 3; row++)
      for (let column = 0; column < 8; column++) {
        const pitch = [0.15, 0.65, 1.3][row],
          yaw = (column * Math.PI) / 4;
        camera.position.set(
          Math.sin(yaw) * Math.cos(pitch) * 250,
          Math.sin(pitch) * 250,
          Math.cos(yaw) * Math.cos(pitch) * 250,
        );
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld();
        rabbit.update(camera, 0, 0, 1, 0, 0);
        renderer.render(scene, camera);
        frames.push(rabbit.frame);
        const cell = document.createElement("div"),
          canvas = document.createElement("canvas");
        canvas.width = canvas.height = 200;
        canvas.getContext("2d").drawImage(renderer.domElement, 0, 0);
        cell.append(canvas);
        const caption = document.createElement("div");
        caption.style.cssText = "font:10px Arial;text-align:center";
        caption.textContent = `${column * 45}° / ${Math.round((pitch * 180) / Math.PI)}°`;
        cell.append(caption);
        contact.append(cell);
      }
    renderer.dispose();
    rabbit.dispose();
    return frames;
  });
  assert.equal(new Set(frames.map((f) => `${f.column},${f.row}`)).size, 24);
  await page.screenshot({ path: "artifacts/rabbit-all-views.png" });
  console.log("PASS: all 24 directional/elevation frames selected.");
} finally {
  await browser.close();
}
