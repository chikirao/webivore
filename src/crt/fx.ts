import "./crt.css";
import { crtSettings, onCrtSettings } from "./settings";

/**
 * The page lives inside the monitor after the prelude dives in.
 *
 * Optics are drawn by one small WebGL shader into two fullscreen,
 * non-interactive canvases: a multiply layer (scanlines, aperture grille,
 * curvature shading, vignette, rounded tube corners, dark burst bands) and a
 * screen layer (glare, coloured burst bands, the power-on line).
 * Real RGB separation of the page itself comes from SVG filters on #root:
 * a resting one that splits R and B radially near the edges only, and a burst
 * one that adds horizontal tearing driven by animated turbulence.
 */
type Transition = "switch" | "power-on" | "reveal";

const VERT = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }`;
const FRAG = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 res;
uniform float t, dpr, mode;
uniform float scan, linePx, grille, vignette, corner, noiseAmt, flicker, glare;
uniform float strength, burst, seed, power;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float band(float y, float s){ return hash(vec2(floor(y), s)); }
void main(){
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = frag / res;
  vec2 c = uv - .5;
  vec2 asp = vec2(res.x / res.y, 1.);
  // distance to the frame, 0 at the border, in viewport-height units
  vec2 e = (.5 - abs(c)) * asp;
  float edge = min(e.x, e.y);
  float edgeness = 1. - smoothstep(.0, .22, edge);
  float row = floor(frag.y / (linePx * dpr));
  float b = burst;
  if (mode < .5) {
    // ---------- multiply layer ----------
    vec3 m = vec3(1.);
    float ph = fract(frag.y / (linePx * dpr));
    float line = .5 + .5 * cos(6.2832 * ph);
    float amt = scan * (.45 + .55 * edgeness) + strength * .45 + b * .25;
    m *= 1. - clamp(amt, 0., .95) * (1. - line);
    float px = mod(floor(frag.x), 3.);
    vec3 mask = px < 1. ? vec3(1., .78, .78) : px < 2. ? vec3(.78, 1., .78) : vec3(.78, .78, 1.);
    m *= mix(vec3(1.), mask, clamp(grille + strength * .3, 0., 1.));
    // curvature: the glass darkens towards the frame, harder at the corners
    vec2 q = abs(c) * 2.;
    float r2 = dot(q, q);
    m *= 1. - vignette * (1. + strength) * pow(r2 * .5, 1.6);
    float cornerR = mix(.035, .09, strength);
    vec2 d = max(q - (1. - cornerR * vec2(1., asp.x)), 0.) / (cornerR * vec2(1., asp.x));
    float rc = length(d);
    m *= 1. - smoothstep(.82, 1., rc) * corner;
    m *= 1. - smoothstep(.0, .05, .05 - edge) * corner * .5;
    m *= 1. - noiseAmt * hash(frag + fract(t * 13.1)) ;
    m *= 1. - flicker * (.5 + .5 * sin(t * 113.));
    // burst: dark torn bands
    float bn = band(row / (6. + 20. * hash(vec2(seed))), floor(t * 24.) + seed);
    m *= 1. - b * step(.72, bn) * .55;
    // power-on: only a widening slit is lit
    if (power < 1.) {
      float open = smoothstep(.3, 1., power);
      float h = mix(.002, .5, open * open);
      float w = mix(.0, .5, smoothstep(0., .35, power));
      float inside = step(abs(c.y), h) * step(abs(c.x), w);
      m *= inside;
    }
    o = vec4(clamp(m, 0., 1.), 1.);
  } else {
    // ---------- screen (light) layer ----------
    vec3 l = vec3(0.);
    l += glare * smoothstep(.6, 0., length((uv - vec2(.18, .85)) * vec2(1., 1.6)));
    // burst: coloured scan bands, a hot line and snow
    if (b > 0.) {
      float s = floor(t * 30.) + seed;
      float bn = band(row / (3. + 12. * hash(vec2(s, 1.))), s);
      vec3 tint = bn > .9 ? vec3(1., .1, .2) : bn > .82 ? vec3(.1, .9, 1.) : bn > .76 ? vec3(.3, .4, 1.) : vec3(0.);
      l += tint * b * .5;
      float hot = fract(hash(vec2(s, 7.)) + t * 1.7);
      l += vec3(.9, .95, 1.) * b * smoothstep(.006, 0., abs(uv.y - hot)) * .8;
      l += vec3(hash(frag * .5 + s)) * b * .22;
    }
    if (power < 1.) {
      float open = smoothstep(.3, 1., power);
      float h = mix(.002, .5, open * open);
      float w = mix(.0, .5, smoothstep(0., .35, power));
      float lineGlow = smoothstep(h + .01, h, abs(c.y)) * step(abs(c.x), w) * (1. - open) * 1.4;
      l += vec3(.85, .95, 1.) * lineGlow;
    }
    o = vec4(l, 1.);
  }
}`;

function compile(gl: WebGL2RenderingContext) {
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "crt overlay");
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.bindAttribLocation(p, 0, "p");
  gl.linkProgram(p);
  gl.useProgram(p);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const u = (n: string) => gl.getUniformLocation(p, n);
  return u;
}

type Layer = { canvas: HTMLCanvasElement; gl: WebGL2RenderingContext; u: (n: string) => WebGLUniformLocation | null; mode: number };

const state = {
  /** Overlay opacity; ramps in during the prelude's dive. */
  opacity: 1,
  /** True from the dive until the tube has settled: shown even over the prelude. */
  revealing: false,
  strength: 0,
  burst: 0,
  seed: 0,
  power: 1,
};
let installed = false;
let layers: Layer[] = [];
let raf = 0;
let svg: SVGSVGElement | null = null;
let animating: { until: number; step: (p: number) => void; done?: () => void; start: number; ms: number } | null = null;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarse = () => matchMedia("(pointer: coarse)").matches;
const root = () => document.getElementById("root");

// ---------- SVG filters ----------

/** Radial displacement field, neutral in the middle, pushing outwards near the frame. */
function edgeMap() {
  const n = 128;
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(n, n);
  const w = crtSettings.overlay.edgeWidth;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const dx = (x + 0.5) / n - 0.5,
        dy = (y + 0.5) / n - 0.5;
      const edge = 0.5 - Math.min(0.5 - Math.abs(dx), 0.5 - Math.abs(dy));
      const k = Math.pow(Math.max(0, (edge - (0.5 - w)) / w), 1.6);
      const r = Math.hypot(dx, dy) || 1;
      const i = (y * n + x) * 4;
      img.data[i] = 128 + (dx / r) * k * 127;
      img.data[i + 1] = 128 + (dy / r) * k * 127;
      img.data[i + 2] = 128;
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

const keep = (ch: "r" | "g" | "b") =>
  ({
    r: "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0",
    g: "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0",
    b: "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0",
  })[ch];

function buildSvg() {
  const ns = "http://www.w3.org/2000/svg";
  svg = document.createElementNS(ns, "svg") as SVGSVGElement;
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.style.position = "absolute";
  // Resting: R and B pushed apart radially near the frame only.
  // Burst: the whole picture's R and B slide sideways, and blocky slices tear.
  const split = (id: string, burst: boolean) => `
    <filter id="${id}" x="0" y="0" width="100%" height="100%" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feImage class="crt-map" preserveAspectRatio="none" x="0" y="0" result="map"/>
      ${
        burst
          ? `<feTurbulence class="crt-turb" type="fractalNoise" baseFrequency="0.00001 0.018" numOctaves="1" seed="1" result="turb"/>
             <feComponentTransfer in="turb" result="steps">
               <feFuncR type="discrete" tableValues="0.5 0.5 0.12 0.5 0.5 0.86 0.5 0.3 0.5 0.5 0.7 0.5"/>
               <feFuncG type="discrete" tableValues="0.5"/>
             </feComponentTransfer>
             <feDisplacementMap class="crt-tear" in="SourceGraphic" in2="steps" scale="0" xChannelSelector="R" yChannelSelector="G" result="torn"/>`
          : `<feOffset in="SourceGraphic" dx="0" dy="0" result="torn"/>`
      }
      <feDisplacementMap class="crt-barrel" in="torn" in2="map" scale="0" xChannelSelector="R" yChannelSelector="G" result="src"/>
      <feDisplacementMap class="crt-r" in="src" in2="map" scale="0" xChannelSelector="R" yChannelSelector="G" result="rd"/>
      <feOffset class="crt-rx" in="rd" dx="0" dy="0" result="rs"/>
      <feColorMatrix in="rs" values="${keep("r")}" result="r"/>
      <feColorMatrix in="src" values="${keep("g")}" result="g"/>
      <feDisplacementMap class="crt-b" in="src" in2="map" scale="0" xChannelSelector="R" yChannelSelector="G" result="bd"/>
      <feOffset class="crt-bx" in="bd" dx="0" dy="0" result="bs"/>
      <feColorMatrix in="bs" values="${keep("b")}" result="b"/>
      <feComposite in="r" in2="g" operator="arithmetic" k2="1" k3="1" result="rg"/>
      <feComposite in="rg" in2="b" operator="arithmetic" k2="1" k3="1"/>
    </filter>`;
  svg.innerHTML = split("crt-edge", false) + split("crt-burst", true);
  document.body.appendChild(svg);
  refreshSvg();
}

function refreshSvg() {
  if (!svg) return;
  const href = edgeMap();
  for (const img of svg.querySelectorAll(".crt-map")) {
    img.setAttribute("href", href);
    img.setAttribute("width", String(innerWidth));
    img.setAttribute("height", String(innerHeight));
  }
  for (const f of svg.querySelectorAll("filter")) {
    f.setAttribute("width", String(innerWidth));
    f.setAttribute("height", String(innerHeight));
  }
  applyFilter(0);
}

/** Split in px, tear in px; 0/0 at rest uses the resting edge filter (or none). */
function applyFilter(split: number, tear = 0) {
  const r = root();
  if (!svg || !r) return;
  const o = crtSettings.overlay;
  const inPrelude = !!document.querySelector(".prelude");
  const resting = o.enabled && !inPrelude && !coarse() && (o.edgeRgb > 0 || o.barrel > 0);
  const bursting = split > 0.01 || tear > 0.01;
  const id = bursting ? "crt-burst" : resting ? "crt-edge" : "";
  const f = id && svg.querySelector(`#${id}`);
  if (f) {
    const s = (bursting ? split : 0) + o.edgeRgb * 2;
    f.querySelector(".crt-r")!.setAttribute("scale", String(s));
    f.querySelector(".crt-b")!.setAttribute("scale", String(-s));
    f.querySelector(".crt-barrel")!.setAttribute("scale", String(-o.barrel * 2));
    // the whole frame's channels slide apart, with a little vertical jolt
    const jolt = bursting ? (Math.random() - 0.5) * split * 0.25 : 0;
    f.querySelector(".crt-rx")!.setAttribute("dx", String(bursting ? split : 0));
    f.querySelector(".crt-rx")!.setAttribute("dy", String(jolt));
    f.querySelector(".crt-bx")!.setAttribute("dx", String(bursting ? -split * 0.8 : 0));
    f.querySelector(".crt-bx")!.setAttribute("dy", String(-jolt));
    const t = f.querySelector(".crt-tear");
    if (t) t.setAttribute("scale", String(tear));
    const turb = f.querySelector(".crt-turb");
    if (turb) turb.setAttribute("seed", String((Math.random() * 1000) | 0));
  }
  r.style.filter = id ? `url(#${id})` : "";
}

// ---------- overlay ----------

export function installCrt() {
  if (installed) return;
  installed = true;
  // Each canvas sits directly in <body>: a wrapper would be its own stacking
  // context and the blend modes would only mix with the empty wrapper.
  for (const mode of [0, 1]) {
    const canvas = document.createElement("canvas");
    canvas.className = `crt-layer ${mode ? "crt-light" : "crt-shade"}`;
    canvas.setAttribute("aria-hidden", "true");
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, premultipliedAlpha: false });
    if (!gl) continue;
    try {
      layers.push({ canvas, gl, u: compile(gl), mode });
      document.body.appendChild(canvas);
    } catch {
      /* no overlay, page still works */
    }
  }
  buildSvg();
  addEventListener("resize", () => {
    refreshSvg();
  });
  onCrtSettings(() => refreshSvg());
  const loop = () => {
    draw();
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
}

function draw() {
  const now = performance.now();
  if (animating) {
    const p = Math.min(1, (now - animating.start) / animating.ms);
    animating.step(p);
    if (p >= 1) {
      const done = animating.done;
      animating = null;
      state.burst = 0;
      applyFilter(0);
      done?.();
    }
  }
  const o = crtSettings.overlay;
  const hidden = !o.enabled || (!!document.querySelector(".prelude") && !state.revealing);
  for (const L of layers) {
    L.canvas.style.display = hidden ? "none" : "";
    L.canvas.style.opacity = String(state.opacity);
  }
  if (hidden) return;
  const dpr = Math.min(2, devicePixelRatio || 1);
  const w = Math.round(innerWidth * dpr),
    h = Math.round(innerHeight * dpr);
  for (const L of layers) {
    const { gl, canvas, u } = L;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.uniform2f(u("res"), w, h);
    gl.uniform1f(u("t"), now / 1000);
    gl.uniform1f(u("dpr"), dpr);
    gl.uniform1f(u("mode"), L.mode);
    gl.uniform1f(u("scan"), o.scanlines);
    gl.uniform1f(u("linePx"), o.linePx);
    gl.uniform1f(u("grille"), o.grille);
    gl.uniform1f(u("vignette"), o.vignette);
    gl.uniform1f(u("corner"), o.corner);
    gl.uniform1f(u("noiseAmt"), o.noise);
    gl.uniform1f(u("flicker"), reduced() ? 0 : o.flicker);
    gl.uniform1f(u("glare"), o.glare);
    gl.uniform1f(u("strength"), state.strength);
    gl.uniform1f(u("burst"), state.burst);
    gl.uniform1f(u("seed"), state.seed);
    gl.uniform1f(u("power"), state.power);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

function animate(ms: number, step: (p: number) => void, done?: () => void) {
  if (animating?.done) animating.done();
  const start = performance.now();
  animating = { start, ms, until: start + ms, step, done };
}

/** 0 = resting tube, 1 = full CRT look across the whole page. */
export function setCrtStrength(v: number) {
  state.strength = Math.max(0, Math.min(1, v));
}

/** Envelope that hits fast and decays with a couple of aftershocks. */
const shock = (p: number) => Math.max(0, Math.sin(Math.min(1, p * 5) * Math.PI * 0.5)) * Math.pow(1 - p, 1.6) * (0.75 + 0.25 * Math.cos(p * 38));

/**
 * `lead` (reveal only): ms of camera dive still to come. The tube fades in
 * over the dive so it is already on when the white flash clears.
 */
export function crtTransition(kind: Transition = "switch", lead = 0) {
  installCrt();
  const b = crtSettings.burst;
  state.seed = Math.random() * 100;
  if (reduced()) {
    state.power = 1;
    return;
  }
  if (kind === "switch") {
    animate(b.switchMs, (p) => {
      const k = shock(p);
      state.burst = k * 1.1;
      state.seed = Math.floor(p * 14) + 3;
      applyFilter(b.rgbSplit * k * 1.4, b.tear * k * 1.3);
    });
  } else if (kind === "power-on") {
    state.power = 0;
    animate(
      700,
      (p) => {
        state.power = p;
        const k = p > 0.55 ? shock((p - 0.55) / 0.45) : 0;
        state.burst = k * 0.6;
        applyFilter(b.rgbSplit * k, b.tear * k * 0.5);
      },
      () => (state.power = 1),
    );
  } else {
    // prelude handoff: fade in during the dive, hold the full tube through the
    // flash, then relax into the resting edges
    const hold = lead + 420,
      settle = 1500;
    state.revealing = true;
    state.opacity = lead ? 0 : 1;
    setCrtStrength(1);
    animate(
      hold + settle,
      (p) => {
        const ms = p * (hold + settle);
        if (lead) state.opacity = Math.min(1, ms / (lead * 0.75));
        setCrtStrength(ms < hold ? 1 : Math.pow(1 - (ms - hold) / settle, 2.2));
        const k = Math.max(0, 1 - Math.abs(ms - lead) / 260);
        state.burst = k * 0.45;
        applyFilter(b.rgbSplit * 0.6 * k, b.tear * 0.3 * k);
      },
      () => {
        setCrtStrength(0);
        state.opacity = 1;
        state.revealing = false;
      },
    );
  }
}

let lastKick = 0;
/** A short RGB jolt for big moments; throttled so streaks do not spam it. */
export function crtKick(power = 1) {
  installCrt();
  const now = performance.now();
  if (now - lastKick < 900 || reduced() || animating) return;
  lastKick = now;
  const b = crtSettings.burst;
  const amp = b.kick * (power > 1 ? 1.25 : 0.85);
  state.seed = Math.random() * 100;
  animate(b.kickMs * (power > 1 ? 1.2 : 1), (p) => {
    const k = shock(p) * amp;
    state.burst = k * b.bands;
    applyFilter(b.rgbSplit * k, b.tear * k * 0.6);
  });
}

/** Dev: freeze a burst at strength k (0 releases it) to inspect a frame. */
export function crtHold(k: number) {
  installCrt();
  animating = null;
  const b = crtSettings.burst;
  state.burst = k * b.bands;
  state.seed = 7;
  applyFilter(b.rgbSplit * k, b.tear * k);
}

if (import.meta.env.DEV)
  (window as unknown as { __crt: object }).__crt = { transition: crtTransition, kick: crtKick, hold: crtHold, settings: crtSettings };
