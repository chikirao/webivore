import type { Room } from "./rooms";
import { crtSettings } from "../crt/settings";

/**
 * Relights the room plate in WebGL instead of painting gradients over it.
 * Light multiplies the photo's own colours (so dark wood stays dark and the
 * beige plastic catches light), plus a little scatter:
 *  - lamp: warm, from off-frame left, with living sensor grain;
 *  - TV: cold, from off-frame right, cutting between colours, with grain and a
 *    narrow glossy streak down the right edge of the monitor's plastic;
 *  (the monitor's own spill stays the CSS glow in the prelude);
 *  - window: moonlight lifts the blue between the slats, a cloud dims it all.
 */
export type LightState = {
  screen: [number, number, number];
  screenLevel: number;
  tv: [number, number, number];
  tvLevel: number;
  lamp: number;
  moon: number;
  /** Cloud centre in plate px, drifting behind the window. */
  cloud: [number, number];
  cover: number;
};

/** Shared between the prelude's render loops (screen, ambience, glass). */
export const roomLight: LightState = {
  screen: [0, 0, 0],
  screenLevel: 0,
  tv: [120, 150, 255],
  tvLevel: 0.6,
  lamp: 1,
  moon: 0.7,
  cloud: [-9999, 0],
  cover: 0,
};

const VERT = `#version 300 es
in vec2 p; out vec2 uv;
void main(){ uv = vec2(p.x * .5 + .5, .5 - p.y * .5); gl_Position = vec4(p, 0., 1.); }`;

const FRAG = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D base, spill;
uniform vec2 size;
uniform float t;
uniform vec3 lampPos, tvPos;          // x, y, radius (plate px)
uniform vec3 lampCol, tvCol, screenCol;
uniform float lampLevel, tvLevel, screenLevel;
uniform float grain, grainPx, grainShadows, grainColor;
uniform uint grainFrame;
uniform float cloudDark, windowDim;
uniform float kLamp, kTv, kSpill, kReflect, kMoon;
uniform vec4 housing, win;            // x, y, w, h
uniform vec3 moon;
uniform float moonLevel, cover, hasWindow;
uniform vec4 cloud;                   // x, y, rx, ry
// integer hash: sin()-based hashes lose precision on big pixel/time inputs
// and turn into drifting stripes
uvec3 pcg(uvec3 v){
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
vec3 rnd3(uvec3 v){ return vec3(pcg(v)) * (1. / 4294967295.); }
float soft(vec2 p, vec4 r, float f){
  vec2 a = smoothstep(r.xy - f, r.xy + f, p) * (1. - smoothstep(r.xy + r.zw - f, r.xy + r.zw + f, p));
  return a.x * a.y;
}
void main(){
  vec4 b = texture(base, uv);
  vec3 alb = b.rgb;
  vec2 px = uv * size;
  float lum = dot(alb, vec3(.3, .59, .11));

  // point-ish lights with a long smooth falloff (no visible disc)
  float dl = length(px - lampPos.xy) / lampPos.z;
  float lamp = lampLevel * exp(-dl * dl * 2.8);
  float dt = length((px - tvPos.xy) * vec2(1., 1.25)) / tvPos.z;
  float tv = tvLevel * exp(-dt * dt * 1.9);
  float scr = texture(spill, uv).a * screenLevel;

  vec3 light = lampCol * lamp * kLamp + tvCol * tv * kTv + screenCol * scr * kSpill;
  vec3 col = alb * (1. + light);
  // scatter in the air near the sources
  col += lampCol * lamp * .025 + tvCol * tv * .03;
  // the monitor's plastic catches the TV as a narrow glossy streak down its
  // right edge (a curved surface turning towards the light), fading top/bottom
  vec2 hp = (px - housing.xy) / housing.zw;
  float inside = soft(px, housing, 10.);
  float streak = exp(-pow((hp.x - .93) / .045, 2.)) * smoothstep(0., .25, hp.y) * smoothstep(1., .6, hp.y);
  float plastic = smoothstep(.18, .55, lum);
  col += tvCol * tvLevel * inside * streak * plastic * kReflect;

  // moonlight lifts the sky between the slats; the cloud lives out there
  // too, so it only darkens sky pixels and never crosses the blinds
  if (hasWindow > .5) {
    float w = soft(px, win, 30.);
    float sky = clamp((alb.b - max(alb.r, alb.g)) * 3., 0., 1.) * w;
    vec2 cd = (px - cloud.xy) / cloud.zw;
    float cl = exp(-dot(cd, cd) * 1.4) * (.75 + .25 * sin(cd.x * 3. + cd.y * 5.));
    col += vec3(.35, .5, 1.) * sky * moonLevel * kMoon * (1. - cover * windowDim);
    // the cloud eats the sky where it passes and dims the slats a bit too
    col *= 1. - clamp(cl, 0., 1.) * w * cloudDark * (.35 + .65 * sky);
    // covering the moon, the whole window goes dark
    col *= 1. - cover * windowDim * w;
    float dm = length(px - moon.xy) / (moon.z * 7.);
    col += vec3(.65, .78, 1.) * exp(-dm * dm * 3.) * moonLevel * (1. - cover) * .35 * w;
  }

  // film grain per screen pixel cell, roughly gaussian, stronger where light is
  uvec2 cell = uvec2(gl_FragCoord.xy / grainPx);
  vec3 a = rnd3(uvec3(cell, grainFrame)), c = rnd3(uvec3(cell, grainFrame + 7919u));
  vec3 g3 = (a + c) - 1.;
  vec3 g = mix(vec3(g3.x), g3, grainColor);
  col += g * grain * (lamp * .9 + tv * 1.1 + grainShadows);

  // soft shoulder instead of clipping: highlights roll off like film
  col = col / (1. + max(col - .8, 0.) * 1.4);
  o = vec4(clamp(col, 0., 1.) * b.a, b.a);
}`;

function compile(gl: WebGL2RenderingContext) {
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "room light");
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.bindAttribLocation(p, 0, "p");
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "room light link");
  gl.useProgram(p);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  return p;
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export class RoomLight {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private u = new Map<string, WebGLUniformLocation | null>();
  ready = false;
  /** Canvas pixels per CSS pixel, so grain size is in screen px. */
  private backingPerCss = 1;
  private displayScale = 0.625;

  constructor(
    private canvas: HTMLCanvasElement,
    private room: Room,
    baseUrl: string,
    spillUrl: string,
  ) {
    const gl = canvas.getContext("webgl2", { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!gl) throw new Error("WebGL2 unavailable");
    this.gl = gl;
    this.prog = compile(gl);
    void Promise.all([loadImage(baseUrl), loadImage(spillUrl)]).then(([base, spill]) => {
      this.texture(0, base);
      this.texture(1, spill);
      gl.uniform1i(this.loc("base"), 0);
      gl.uniform1i(this.loc("spill"), 1);
      this.ready = true;
    });
  }

  private loc(name: string) {
    if (!this.u.has(name)) this.u.set(name, this.gl.getUniformLocation(this.prog, name));
    return this.u.get(name)!;
  }

  private texture(unit: number, img: HTMLImageElement) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /** Backing store: what is on screen, capped at the plate's own size. */
  resize(displayScale: number) {
    const [W, H] = this.room.size;
    const k = Math.min(1, displayScale * Math.min(2, devicePixelRatio || 1));
    const w = Math.round(W * k),
      h = Math.round(H * k);
    this.backingPerCss = displayScale > 0 ? k / displayScale : 1;
    this.displayScale = displayScale;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  render(t: number, reduced: boolean) {
    if (!this.ready) return;
    const k = crtSettings.room;
    const gl = this.gl;
    const a = this.room.ambience,
      L = roomLight;
    const c = (v: [number, number, number]) => v.map((x) => x / 255) as [number, number, number];
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.loc("size"), ...this.room.size);
    gl.uniform1f(this.loc("t"), t);
    gl.uniform3f(this.loc("lampPos"), a.lamp.x, a.lamp.y, a.lamp.r);
    gl.uniform3f(this.loc("tvPos"), a.tv.x, a.tv.y, a.tv.r);
    gl.uniform3f(this.loc("lampCol"), 1, 0.68, 0.36);
    gl.uniform3f(this.loc("tvCol"), ...c(L.tv));
    gl.uniform3f(this.loc("screenCol"), ...c(L.screen));
    gl.uniform1f(this.loc("lampLevel"), L.lamp);
    gl.uniform1f(this.loc("tvLevel"), L.tvLevel);
    gl.uniform1f(this.loc("screenLevel"), L.screenLevel);
    // Grain is tuned on 1920 × 1080, where the landscape room is ~1920 css px
    // wide. Elsewhere the cell keeps its share of the picture; once that falls
    // under one device pixel, the amount fades the way finer grain would.
    const roomCss = this.room.size[0] * this.displayScale;
    const cell = k.grainSize * (roomCss / 1920) * this.backingPerCss;
    gl.uniform1f(this.loc("grain"), reduced ? 0 : k.grain * Math.min(1, Math.sqrt(cell)));
    gl.uniform1f(this.loc("grainPx"), Math.max(1, cell));
    gl.uniform1f(this.loc("grainShadows"), k.grainShadows);
    gl.uniform1f(this.loc("grainColor"), k.grainColor);
    gl.uniform1ui(this.loc("grainFrame"), Math.floor(t * k.grainFps) % 65536);
    gl.uniform1f(this.loc("cloudDark"), k.cloudDark);
    gl.uniform1f(this.loc("windowDim"), k.windowDim);
    gl.uniform1f(this.loc("kLamp"), k.lamp);
    gl.uniform1f(this.loc("kTv"), k.tv);
    gl.uniform1f(this.loc("kSpill"), k.spill);
    gl.uniform1f(this.loc("kReflect"), k.tvReflect);
    gl.uniform1f(this.loc("kMoon"), k.moon);
    const h = a.housing;
    gl.uniform4f(this.loc("housing"), h.x, h.y, h.w, h.h);
    const w = a.window;
    gl.uniform1f(this.loc("hasWindow"), w ? 1 : 0);
    if (w) gl.uniform4f(this.loc("win"), w.x, w.y, w.w, w.h);
    if (a.moon) gl.uniform3f(this.loc("moon"), a.moon.x, a.moon.y, a.moon.r);
    gl.uniform1f(this.loc("moonLevel"), L.moon);
    gl.uniform1f(this.loc("cover"), L.cover);
    const r = a.moon?.r ?? 26;
    gl.uniform4f(this.loc("cloud"), L.cloud[0], L.cloud[1], r * 9 * k.cloudSize, r * 4 * k.cloudSize);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  destroy() {
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
