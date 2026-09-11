import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Rabbit, RABBIT } from "./rabbit";

/**
 * Diagnostic contact sheet: the rig from 8 azimuths × 3 camera elevations with
 * the page floor and a ball, using the game's perspective camera. Each cell is
 * measured, not eyeballed: silhouette connectivity, floor penetration and how
 * much of the head stays readable when the ball is in the way.
 */
export type LabCell = {
  azimuth: number;
  elevation: number;
  components: number;
  floorLoss: number;
  headVisible: number;
  pass: boolean;
};
export type LabResult = { radius: number; cells: LabCell[]; passed: boolean; sheet?: string };
const PITCHES = [0.32, 0.88, 1.43];
const SIZE = 256;
declare global {
  interface Window {
    __rabbitLab?: LabResult[];
  }
}

function components(data: Uint8ClampedArray, w: number, h: number, test: (i: number) => boolean) {
  const seen = new Uint8Array(w * h);
  const sizes: number[] = [];
  for (let n = 0; n < w * h; n++) {
    if (seen[n] || !test(n)) continue;
    let count = 0;
    const stack = [n];
    seen[n] = 1;
    while (stack.length) {
      const at = stack.pop()!;
      count++;
      const x = at % w;
      for (const next of [at - w, at + w, x > 0 ? at - 1 : -1, x < w - 1 ? at + 1 : -1])
        if (next >= 0 && next < w * h && !seen[next] && test(next)) {
          seen[next] = 1;
          stack.push(next);
        }
    }
    if (count > 12) sizes.push(count);
  }
  void data;
  return sizes;
}

export function labRenderer() {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(SIZE, SIZE);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}
export async function runRabbitLab(renderer: THREE.WebGLRenderer, radius: number, speedPhase = 0.3): Promise<{ result: LabResult; canvases: HTMLCanvasElement[] }> {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight("#ffffff", "#777777", 2.6));
  const light = new THREE.DirectionalLight("#ffffff", 3);
  light.position.set(-300, 700, 300);
  scene.add(light);
  const rabbit = new Rabbit();
  await rabbit.ready;
  const character = new THREE.Group();
  character.add(rabbit.root);
  const scale = 1 + Math.min(0.8, radius / 380);
  character.scale.setScalar(scale);
  scene.add(character);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 4000),
    new THREE.MeshBasicMaterial({ color: 0xff00ff }),
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(Math.max(1, radius), 40, 28),
    new THREE.MeshBasicMaterial({ color: 0x00ffff }),
  );
  ball.position.set(0, Math.max(12, radius), RABBIT.ballGap * scale + radius);
  ball.visible = radius > 0;
  scene.add(ball);
  const camera = new THREE.PerspectiveCamera(48, 1, 1, 30000);
  const canvases: HTMLCanvasElement[] = [];
  const cells: LabCell[] = [];
  const read = () => {
    const c = document.createElement("canvas");
    c.width = c.height = SIZE;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(renderer.domElement, 0, 0);
    return { canvas: c, data: ctx.getImageData(0, 0, SIZE, SIZE).data };
  };
  for (const pitch of PITCHES)
    for (let a = 0; a < 8; a++) {
      const yaw = (a * Math.PI) / 4;
      // Framed on the rabbit (the game camera sits further back); the ball stays partly in view.
      const distance = 150 * scale + radius * 0.55;
      const target = new THREE.Vector3(0, 34 * scale, 0);
      camera.position.set(
        Math.sin(yaw) * Math.cos(pitch) * distance,
        Math.sin(pitch) * distance + target.y,
        Math.cos(yaw) * Math.cos(pitch) * distance,
      );
      camera.lookAt(target);
      rabbit.update(camera, 0, radius, scale, speedPhase, 200);
      // Pass 1: rabbit alone, floating hands hidden → the composed head/body sheet must be one piece.
      floor.visible = false;
      ball.visible = false;
      renderer.setClearColor(0, 0);
      for (const h of rabbit.hands) h.visible = false;
      renderer.render(scene, camera);
      for (const h of rabbit.hands) h.visible = true;
      const alone = read();
      const opaque = (i: number) => alone.data[i * 4 + 3] > 128;
      const comps = components(alone.data, SIZE, SIZE, opaque);
      const silhouette = comps.reduce((n, c) => n + c, 0);
      // Pass 2: with the floor → rabbit pixels that turned magenta sank below it.
      floor.visible = true;
      renderer.render(scene, camera);
      const withFloor = read();
      let lost = 0;
      for (let i = 0; i < SIZE * SIZE; i++)
        if (opaque(i) && withFloor.data[i * 4] > 240 && withFloor.data[i * 4 + 1] < 20 && withFloor.data[i * 4 + 2] > 240) lost++;
      // Pass 3: the head zone is the upper half of the silhouette's bounding box; pass 4: full scene.
      let top = SIZE, bottom = 0;
      for (let i = 0; i < SIZE * SIZE; i++)
        if (opaque(i)) {
          top = Math.min(top, Math.floor(i / SIZE));
          bottom = Math.max(bottom, Math.floor(i / SIZE));
        }
      const headEnd = top + (bottom - top) * 0.5;
      ball.visible = radius > 0;
      floor.visible = true;
      renderer.setClearColor(0xffffff, 1);
      renderer.render(scene, camera);
      const full = read();
      let headPixels = 0, headSeen = 0;
      for (let i = 0; i < SIZE * SIZE; i++) {
        if (!opaque(i) || Math.floor(i / SIZE) > headEnd) continue;
        headPixels++;
        const r = full.data[i * 4], g = full.data[i * 4 + 1], b = full.data[i * 4 + 2];
        const cyan = r < 30 && g > 225 && b > 225;
        if (!cyan) headSeen++;
      }
      const cell: LabCell = {
        azimuth: a * 45,
        elevation: Math.round((pitch * 180) / Math.PI),
        components: comps.length,
        floorLoss: silhouette ? lost / silhouette : 1,
        headVisible: headPixels ? headSeen / headPixels : 0,
        pass: false,
      };
      cell.pass = cell.components === 1 && cell.floorLoss < 0.004 && cell.headVisible > 0.9;
      cells.push(cell);
      canvases.push(full.canvas);
    }
  rabbit.dispose();
  floor.geometry.dispose();
  ball.geometry.dispose();
  // One flat contact sheet per block (data URL) so CLI runs can save exactly what was measured.
  const sheet = document.createElement("canvas");
  sheet.width = SIZE * 8;
  sheet.height = SIZE * 3;
  const sctx = sheet.getContext("2d")!;
  canvases.forEach((c, i) => sctx.drawImage(c, (i % 8) * SIZE, Math.floor(i / 8) * SIZE));
  return { result: { radius, cells, passed: cells.every((c) => c.pass), sheet: sheet.toDataURL() }, canvases };
}

export function RabbitLab() {
  const grid = useRef<HTMLDivElement>(null);
  const [results, setResults] = useState<LabResult[]>([]);
  useEffect(() => {
    const renderer = labRenderer();
    void (async () => {
    const all: LabResult[] = [];
    const host = grid.current!;
    host.replaceChildren();
    for (const radius of [0, 60, 200, 360]) {
      const { result, canvases } = await runRabbitLab(renderer, radius);
      all.push(result);
      const title = document.createElement("h2");
      title.textContent = `ball radius ${radius} — ${result.passed ? "PASS" : "FAIL"}`;
      host.append(title);
      const sheet = document.createElement("div");
      sheet.className = "lab-sheet";
      canvases.forEach((c, i) => {
        const cell = result.cells[i];
        const box = document.createElement("figure");
        box.className = cell.pass ? "ok" : "bad";
        box.append(c);
        const cap = document.createElement("figcaption");
        cap.textContent = `${cell.azimuth}° / ${cell.elevation}° · parts ${cell.components} · floor ${(cell.floorLoss * 100).toFixed(2)}% · head ${(cell.headVisible * 100).toFixed(0)}%`;
        box.append(cap);
        sheet.append(box);
      });
      host.append(sheet);
    }
    window.__rabbitLab = all;
    setResults(all);
    })();
    return () => renderer.dispose();
  }, []);
  return (
    <main className="lab">
      <h1>
        Rabbit rig lab — {results.length ? (results.every((r) => r.passed) ? "PASS" : "FAIL") : "measuring…"}
      </h1>
      <p>
        8 azimuths × 3 elevations (18°, 50°, 82°) with the page floor (magenta) and the ball (cyan). A cell passes
        when the silhouette is one connected piece, under 0.4% of it is swallowed by the floor and over 90% of the head
        stays readable, solid or as the x-ray ghost.
      </p>
      <div ref={grid} />
    </main>
  );
}
