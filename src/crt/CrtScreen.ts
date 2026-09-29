/**
 * A tube in WebGL2. Two passes:
 *  1. phosphor: the source signal is merged with the previous frame, which
 *     decays per channel (green lingers longest), giving trails on motion;
 *  2. glass: barrel distortion, convergence error, beam-width scanlines that
 *     fatten on bright lines, an aperture grille, halation from the mip chain,
 *     flicker, a slow roll bar, noise, vignette and a faint reflection of the
 *     room lamp on the glass that is visible even when the tube is off.
 * `power` drives the classic switch-on: a dot, a line, then the raster opens
 * with an overexposed flash and settles. Negative time runs it in reverse.
 */
import { crtSettings } from "./settings";

const VERT = `#version 300 es
in vec2 p; out vec2 uv;
void main(){ uv = p * .5 + .5; gl_Position = vec4(p, 0., 1.); }`;

const PHOSPHOR = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D src, prev;
uniform float decay;
void main(){
  vec3 s = texture(src, vec2(uv.x, 1. - uv.y)).rgb;
  vec3 p = texture(prev, uv).rgb * vec3(decay * .82, decay, decay * .7);
  o = vec4(max(s, p), 1.);
}`;

const GLASS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D sig;
uniform vec2 res;       // output pixels
uniform float t, power, lines, curve, grille, noiseAmt, wobble, flash, gain;
uniform float overscan, scanAmt, halation, convergence;
uniform vec3 tvCol;
uniform float tvLevel, inset, insetWidth, white;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec2 barrel(vec2 u){
  vec2 c = u * 2. - 1.;
  c *= 1. + curve * dot(c, c) * vec2(.9, 1.15);
  return c * .5 + .5;
}
vec3 sampleSig(vec2 u, float lod){ return textureLod(sig, clamp(u, .001, .999), lod).rgb; }
void main(){
  // gentle bulge, and the raster is overscanned so the picture runs under the
  // bezel instead of ending in a black frame
  vec2 u = (barrel(uv) - .5) / overscan + .5;
  // switch-on: a point, a horizontal line, then the raster opens vertically
  float pw = clamp(power, 0., 1.);
  float openX = smoothstep(.04, .32, pw), openY = smoothstep(.3, .62, pw);
  vec2 c = u - .5;
  float sx = mix(.004, 1., openX), sy = mix(.003, 1., openY);
  vec2 su = c / vec2(sx, sy) + .5;
  vec2 w = abs(uv - .5) / vec2(sx, sy);
  float inside = pw >= .62 ? 1. : step(w.x, .5) * step(w.y, .5);
  // line jitter and degauss wobble
  float row = floor(su.y * lines);
  su.x += (hash(vec2(row, floor(t * 30.))) - .5) * .0016 * (1. + wobble * 6.);
  su.x += sin(su.y * 40. + t * 18.) * .003 * wobble;
  // convergence: channels drift apart towards the edges
  vec2 cc = su - .5;
  float conv = (.0018 + .0025 * dot(cc, cc) * 4.) * convergence + wobble * .006;
  vec3 col;
  col.r = sampleSig(su + cc * conv, 0.).r;
  col.g = sampleSig(su, 0.).g;
  col.b = sampleSig(su - cc * conv, 0.).b;
  // horizontal beam spread
  vec2 px = vec2(1. / (lines * 1.333), 0.);
  col = col * .6 + (sampleSig(su + px, 0.) + sampleSig(su - px, 0.)) * .2;
  // scanlines: gaussian beam per source line, brighter lines are fatter
  float f = fract(su.y * lines) - .5;
  float lum = dot(col, vec3(.3, .59, .11));
  float width = mix(.22, .5, clamp(lum, 0., 1.));
  float beam = exp(-f * f / (2. * width * width));
  col *= mix(1., beam * 1.55, scanAmt);
  // halation: light bleeding inside the glass
  vec3 halo = sampleSig(su, 3.5) * .55 + sampleSig(su, 5.) * .35;
  col += halo * halation;
  // aperture grille in output pixels
  float m = mod(gl_FragCoord.x, 3.);
  vec3 mask = m < 1. ? vec3(1., .72, .72) : m < 2. ? vec3(.72, 1., .72) : vec3(.72, .72, 1.);
  col *= mix(vec3(1.), mask * 1.18, grille);
  // flicker, roll bar, noise
  col *= .97 + .03 * sin(t * 120.);
  col *= 1. + .06 * smoothstep(.12, 0., abs(fract(su.y * .5 - t * .07) - .5));
  col += (hash(uv * res + fract(t * 7.)) - .5) * noiseAmt;
  // switch-on overexposure and the bright dot/line before the raster opens
  col = col * inside * smoothstep(.3, .7, pw);
  vec2 sc = c / vec2(max(sx, .02), max(sy, .004));
  float spot = exp(-dot(sc, sc) * 2.);
  col += vec3(.85, .95, 1.) * spot * (1. - openY) * step(.01, pw) * 1.6;
  col *= gain;
  col += flash * vec3(1., .97, .95);
  col *= 1. + (1. - smoothstep(.62, 1., pw)) * step(.62, pw) * .9;
  // soft falloff only; the overscanned raster runs under the bezel
  col *= 1. - dot(uv - .5, uv - .5) * .45;
  // dark glass with a warm lamp reflection
  vec3 glass = vec3(.028, .03, .03) + vec3(.1, .065, .035) * smoothstep(.55, 0., length(uv - vec2(.12, .88))) * .6;
  // the TV beyond the right edge, caught in the curved glass: a soft window
  // shaped reflection near the right edge, stronger where the picture is dark
  vec2 rv = (uv - vec2(.9, .45)) * vec2(3.2, 1.6);
  float refl = exp(-dot(rv, rv)) * (1. - clamp(dot(col, vec3(.33)), 0., 1.) * .6);
  glass += tvCol * tvLevel * refl * .16;
  // the glass sits recessed in the plastic: a dark seam right at the edge,
  // soft shadow inside the rim, heavier under the overhanging top lip
  vec2 q = abs(uv - .5) * 2.;
  float rr = .07;
  float sd = length(max(q - (1. - rr), 0.)) + min(max(q.x, q.y) - (1. - rr), 0.) - rr;
  float fromEdge = -sd * .5; // 0 at the rim, grows inwards (uv units)
  float rim = smoothstep(0., insetWidth, fromEdge);
  float overhang = smoothstep(1. - insetWidth * 2.2, 1., uv.y);
  float seam = smoothstep(.006, 0., fromEdge);
  float shade = mix(1., rim, inset * .75) * (1. - inset * .45 * overhang) * (1. - inset * .8 * seam);
  // the tube's peak white sits below the lamp-lit plastic around it
  o = vec4((col * white + glass) * shade, 1.);
}`;

function shader(gl: WebGL2RenderingContext, type: number, source: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, source);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(s) ?? "CRT shader failed");
  return s;
}
function program(gl: WebGL2RenderingContext, frag: string) {
  const p = gl.createProgram()!;
  gl.attachShader(p, shader(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, shader(gl, gl.FRAGMENT_SHADER, frag));
  gl.bindAttribLocation(p, 0, "p");
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(p) ?? "CRT link failed");
  return p;
}

type Target = { tex: WebGLTexture; fb: WebGLFramebuffer };

export class CrtScreen {
  readonly gl: WebGL2RenderingContext;
  private phosphor: WebGLProgram;
  private glass: WebGLProgram;
  private srcTex: WebGLTexture;
  private targets: Target[];
  private flip = 0;
  private size = [0, 0];
  private u: Record<string, WebGLUniformLocation | null> = {};
  power = 0;
  wobble = 0;
  flash = 0;
  /** Mains flicker, ~1. */
  gain = 1;
  /** Colour and level of the TV reflected in the glass. */
  tv: [number, number, number] = [0, 0, 0];
  tvLevel = 0;
  /** Phosphor persistence per frame. */
  decay = 0.72;

  constructor(
    private canvas: HTMLCanvasElement,
    private source: HTMLCanvasElement,
  ) {
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, premultipliedAlpha: false });
    if (!gl) throw new Error("WebGL2 unavailable");
    this.gl = gl;
    this.phosphor = program(gl, PHOSPHOR);
    this.glass = program(gl, GLASS);
    for (const name of ["sig", "res", "t", "power", "lines", "curve", "grille", "noiseAmt", "wobble", "flash", "gain", "overscan", "scanAmt", "halation", "convergence", "tvCol", "tvLevel", "inset", "insetWidth", "white"])
      this.u[name] = gl.getUniformLocation(this.glass, name);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.srcTex = this.texture(source.width, source.height);
    this.targets = [0, 1].map(() => this.target(source.width, source.height));
  }

  private texture(w: number, h: number) {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }
  private target(w: number, h: number): Target {
    const gl = this.gl;
    const tex = this.texture(w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fb };
  }

  /** Backing-store size in device pixels. */
  resize(w: number, h: number) {
    w = Math.max(2, Math.round(w));
    h = Math.max(2, Math.round(h));
    if (this.size[0] === w && this.size[1] === h) return;
    this.size = [w, h];
    this.canvas.width = w;
    this.canvas.height = h;
  }

  render(time: number) {
    const gl = this.gl;
    const [w, h] = this.size;
    if (!w) return;
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.source);
    const read = this.targets[this.flip],
      write = this.targets[1 - this.flip];
    this.flip = 1 - this.flip;
    // pass 1: phosphor persistence
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fb);
    gl.viewport(0, 0, this.source.width, this.source.height);
    gl.useProgram(this.phosphor);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, read.tex);
    gl.uniform1i(gl.getUniformLocation(this.phosphor, "src"), 0);
    gl.uniform1i(gl.getUniformLocation(this.phosphor, "prev"), 1);
    gl.uniform1f(gl.getUniformLocation(this.phosphor, "decay"), this.decay);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindTexture(gl.TEXTURE_2D, write.tex);
    gl.generateMipmap(gl.TEXTURE_2D);
    // pass 2: glass
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.glass);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, write.tex);
    const s = crtSettings.screen;
    gl.uniform1i(this.u.sig, 0);
    gl.uniform2f(this.u.res, w, h);
    gl.uniform1f(this.u.t, time);
    gl.uniform1f(this.u.power, this.power);
    gl.uniform1f(this.u.lines, s.lines);
    gl.uniform1f(this.u.curve, s.curve);
    gl.uniform1f(this.u.grille, s.grille);
    gl.uniform1f(this.u.noiseAmt, s.noise);
    gl.uniform1f(this.u.wobble, this.wobble);
    gl.uniform1f(this.u.flash, this.flash);
    gl.uniform1f(this.u.gain, this.gain);
    gl.uniform1f(this.u.overscan, s.overscan);
    gl.uniform1f(this.u.scanAmt, s.scanlines);
    gl.uniform1f(this.u.halation, s.halation);
    gl.uniform1f(this.u.convergence, s.convergence);
    gl.uniform3f(this.u.tvCol, this.tv[0] / 255, this.tv[1] / 255, this.tv[2] / 255);
    gl.uniform1f(this.u.tvLevel, this.tvLevel);
    gl.uniform1f(this.u.inset, s.inset);
    gl.uniform1f(this.u.insetWidth, s.insetWidth);
    gl.uniform1f(this.u.white, s.white);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  destroy() {
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
