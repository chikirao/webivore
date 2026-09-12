import { writeFileSync } from "node:fs";
export async function captureBall(page, path) {
  const data = await page.evaluate(async () => {
    const g = window.__game,
      THREE = await import("/node_modules/.vite/deps/three.js");
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(700, 700);
    renderer.setClearColor(0xffffff, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene(),
      ball = new THREE.Group();
    for (const mesh of g.collection.renderMeshes)
      ball.add(new THREE.Mesh(mesh.geometry, mesh.material));
    scene.add(ball, new THREE.HemisphereLight(0xffffff, 0x888888, 2.4));
    const light = new THREE.DirectionalLight(0xffffff, 2.5);
    light.position.set(-200, 400, 400);
    scene.add(light);
    const r = g.radius * 1.1,
      camera = new THREE.OrthographicCamera(-r, r, r, -r, 0.1, r * 20);
    camera.position.set(0, r * 0.3, r * 4);
    camera.lookAt(0, 0, 0);
    const sheet = document.createElement("canvas");
    sheet.width = 2800;
    sheet.height = 700;
    const ctx = sheet.getContext("2d");
    for (let i = 0; i < 4; i++) {
      ball.rotation.set(0.15, (i * Math.PI) / 2, 0);
      renderer.render(scene, camera);
      ctx.drawImage(renderer.domElement, i * 700, 0);
    }
    const result = sheet.toDataURL();
    renderer.dispose();
    scene.clear();
    return result;
  });
  writeFileSync(path, Buffer.from(data.split(",")[1], "base64"));
}
