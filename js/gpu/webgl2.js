/**
 * WebGL 2.0 notebook renderer.
 *
 * Fallback renderer for devices without WebGPU (e.g. many Android / Mali
 * adapters). Reuses the same stroke-geometry builder as the WebGPU renderer
 * and reproduces the paper material (fibres, tooth, creases, stains, height
 * field), blue-grey ruling, red-brown margin line and premultiplied ink
 * compositing in GLSL ES 3.0.
 *
 * Three offscreen/pass stages:
 *   1. Paper — fullscreen quad into paper texture (rgb = colour, a = height).
 *   2. Ink   — stroke geometry into ink texture (premultiplied RGBA).
 *   3. Composite — fullscreen quad to canvas: lit paper + ruling + margin + ink.
 *
 * Mirrors the WebGpuRenderer interface (init/render/exportPng/destroy,
 * setDocument/setStrokes/setPen, `available` getter).
 */

import { logger } from '../common/logger.js';
import { wrap } from '../common/errors.js';
import { buildStrokeGeometry, PEN_MATERIALS, DEFAULT_RULING } from './renderer.js';

const MM_TO_PX = 96 / 25.4;

const PAPER_VS = `#version 300 es
in vec2 a_position;
void main() {
  // Fullscreen quad, clip space, Y-down to match page coords.
  float x = float(int(gl_VertexID) & 1) * 2.0 - 1.0;
  float y = float((int(gl_VertexID) >> 1) & 1) * 2.0 - 1.0;
  gl_Position = vec4(x, -y, 0.0, 1.0);
}`;

const PAPER_FS = `#version 300 es
precision highp float;
uniform vec2 u_resolution;
uniform float u_seed;
out vec4 fragColor;

float hash2(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash2(i + vec2(0.0, 0.0)), hash2(i + vec2(1.0, 0.0)), u.x),
    mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x),
    u.y);
}
float fbm2(vec2 p, int octaves) {
  float v = 0.0;
  float a = 0.5;
  vec2 pp = p;
  for (int i = 0; i < octaves; i++) {
    v += a * noise2(pp);
    pp *= 2.0;
    a *= 0.5;
  }
  return v;
}
float fibreFbm(vec2 p, vec2 dir, int octaves) {
  const float stretch = 8.0;
  vec2 perp = vec2(-dir.y, dir.x);
  vec2 q = vec2(dot(p, dir), dot(p, perp) * stretch);
  return fbm2(q, octaves);
}
float ridged2(vec2 p, int octaves) {
  float v = 1.0;
  float a = 0.5;
  vec2 pp = p;
  for (int i = 0; i < octaves; i++) {
    float n = noise2(pp);
    v *= 1.0 - abs(n * 2.0 - 1.0);
    pp *= 2.0;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float s = u_seed;

  // Base colour: warm off-white (cream), no blue cast.
  vec3 paperColour = vec3(0.985, 0.978, 0.955);

  // Large-scale faint mottling (< 2% brightness change).
  float mottle = 0.015 * fbm2(uv * 0.8 + s + 7000.0, 3);

  // Fibres: fine, short, randomly oriented fibres at low contrast.
  // A few orientations so it looks like fibre flecks, not streaks.
  vec2 fibreDirA = vec2(1.0, 0.4);
  vec2 fibreDirB = vec2(-0.4, 1.0);
  vec2 fibreDirC = vec2(1.0, -0.4);
  float fibreA = fibreFbm(uv * 60.0, fibreDirA, 2);
  float fibreB = fibreFbm(uv * 60.0, fibreDirB, 2);
  float fibreC = fibreFbm(uv * 60.0, fibreDirC, 2);
  float fibreMask = smoothstep(0.62, 0.78, (fibreA + fibreB + fibreC) / 3.0) * 0.25;

  // Paper tooth: fine bump texture for surface grain.
  float tooth = fbm2(uv * 150.0 + s + 3000.0, 2);

  // Surface height field.
  float crease = ridged2(uv * 2.0 + s + 6000.0, 4);
  float fibreHeight = 0.09 * fbm2(uv * 6.0 + s + 400.0, 5)
                   + 0.03 * fbm2(uv * 30.0 + s + 500.0, 3);
  float toothHeight = 0.012 * tooth;
  float height = 0.03 * crease + fibreHeight - 0.02 * fibreMask + toothHeight;

  // Output colour: warm cream with fibre flecks, subtle grain and mottling.
  float grain = fbm2(uv * 90.0 + s + 300.0, 2);
  vec3 outColour = paperColour * vec3(
    1.0 - 0.04 * fibreMask + 0.02 * grain + mottle,
    1.0 - 0.03 * fibreMask + 0.015 * grain + mottle,
    1.0 - 0.02 * fibreMask + 0.01 * grain + mottle);

  fragColor = vec4(outColour, clamp(0.5 + height * 4.0, 0.0, 1.0));
}`;

const INK_VS = `#version 300 es
in vec2 a_position;
in float a_halfWidth;
in float a_signedDist;
in vec4 a_color;
in float a_pressure;
uniform vec2 u_resolution;
out float v_signedDist;
out float v_halfWidth;
out vec4 v_color;
out float v_pressure;
void main() {
  float clipX = 2.0 * a_position.x / u_resolution.x - 1.0;
  float clipY = 1.0 - 2.0 * a_position.y / u_resolution.y;
  gl_Position = vec4(clipX, clipY, 0.0, 1.0);
  v_signedDist = a_signedDist;
  v_halfWidth = a_halfWidth;
  v_color = a_color;
  v_pressure = a_pressure;
}`;

const INK_FS = `#version 300 es
precision highp float;
in float v_signedDist;
in float v_halfWidth;
in vec4 v_color;
in float v_pressure;
out vec4 fragColor;
void main() {
  float across = abs(v_signedDist) / v_halfWidth;
  float soft = 0.35 + 0.30 * (1.0 - v_pressure);
  float coreAlpha = smoothstep(1.0, 0.0, across * 1.15);
  float edgeAlpha = smoothstep(0.5, 0.0, across);
  float alpha = mix(coreAlpha, edgeAlpha, soft);
  float density = 0.75 + 0.25 * alpha;
  vec3 rgb = v_color.rgb * v_color.a * density * v_pressure;
  float edgeDark = 1.0 + 0.25 * (1.0 - alpha);
  fragColor = vec4(rgb * edgeDark, alpha);
}`;

const COMPOSITE_VS = `#version 300 es
in vec2 a_position;
void main() {
  float x = float(int(gl_VertexID) & 1) * 2.0 - 1.0;
  float y = float((int(gl_VertexID) >> 1) & 1) * 2.0 - 1.0;
  gl_Position = vec4(x, -y, 0.0, 1.0);
}`;

const COMPOSITE_FS = `#version 300 es
precision highp float;
uniform vec2 u_resolution;
uniform float u_lineSpacingPx;
uniform float u_lineWidthPx;
uniform float u_lineOffsetPx;
uniform float u_marginXPx;
uniform float u_marginLineWidthPx;
uniform vec4 u_lineColor;
uniform vec4 u_marginLineColor;
uniform vec3 u_lightDir;
uniform float u_ambient;
uniform sampler2D u_paperTex;
uniform sampler2D u_inkTex;
out vec4 fragColor;

vec4 samplePaper(vec2 uv) {
  vec4 p = texture(u_paperTex, clamp(uv, 0.0, 1.0));
  p.a = (p.a - 0.5) / 4.0;
  return p;
}
vec4 sampleInk(vec2 uv) {
  return texture(u_inkTex, clamp(uv, 0.0, 1.0));
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec4 paper = samplePaper(uv);
  vec3 baseColour = paper.rgb;

  // Lighting from the paper height field.
  vec2 tx = vec2(1.0 / u_resolution.x, 0.0);
  vec2 ty = vec2(0.0, 1.0 / u_resolution.y);
  float h = samplePaper(uv).a;
  float hx = samplePaper(uv + tx).a - samplePaper(uv - tx).a;
  float hy = samplePaper(uv + ty).a - samplePaper(uv - ty).a;
  vec3 normal = normalize(vec3(-hx * 3.0, -hy * 3.0, 1.0));
  float grad = sqrt(hx * hx + hy * hy) * 0.5;
  float roughness = clamp(grad, 0.0, 1.0);
  vec3 lightDir = normalize(u_lightDir);
  float diffuse = max(dot(normal, lightDir), 0.0);
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  vec3 halfDir = normalize(lightDir + viewDir);
  float specDot = max(dot(normal, halfDir), 0.0);
  float specPower = 32.0 + 64.0 * (1.0 - roughness);
  float softSpec = pow(specDot, specPower) * 0.06 * (1.0 - roughness * 0.5);

  // Ambient occlusion from height field.
  float h0 = samplePaper(uv).a;
  float ao = 0.0;
  float weight = 1.0;
  float step = 1.0;
  for (int i = 0; i < 4; i++) {
    float angle = float(i) * 1.5708;
    vec2 dir = vec2(cos(angle), sin(angle));
    vec2 p = uv + dir * step * vec2(1.0 / u_resolution.x, 1.0 / u_resolution.y);
    float hd = samplePaper(p).a;
    if (hd < h0) ao += (h0 - hd) * weight;
    weight *= 0.5;
    step *= 2.0;
  }
  ao = clamp(ao * 0.5, 0.0, 1.0);
  float lighting = (u_ambient + (1.0 - u_ambient) * diffuse) * (1.0 - 0.4 * ao);
  vec3 lit = baseColour * lighting + vec3(softSpec);

  // Ruled lines.
  float py = gl_FragCoord.y;
  float rel = (py - u_lineOffsetPx) / u_lineSpacingPx;
  float phase = fract(rel);
  float lineDist = min(phase, 1.0 - phase) * u_lineSpacingPx;
  float lineHalf = u_lineWidthPx * 0.5;
  float lineAlpha = 1.0 - smoothstep(lineHalf - 0.4, lineHalf + 0.4, lineDist);

  // Margin line.
  float mx = gl_FragCoord.x;
  float marginDist = abs(mx - u_marginXPx);
  float marginHalf = u_marginLineWidthPx * 0.5;
  float marginAlpha = 1.0 - smoothstep(marginHalf - 0.4, marginHalf + 0.4, marginDist);

  float ruleMix = min(lineAlpha + marginAlpha, 1.0);
  float hPaper = paper.a;
  float ruleRelief = clamp(1.0 - hPaper * 1.5, 0.6, 1.0);
  vec3 lineColour = mix(u_lineColor.rgb, u_marginLineColor.rgb,
                        marginAlpha > lineAlpha ? 1.0 : 0.0);
  vec3 paperWithRule = mix(lit,
    lit * (1.0 - 0.6 * ruleMix) + lineColour * (0.6 * ruleMix * ruleRelief), ruleMix);

  // Ink layer: ink pools in fibre valleys (low height) and skips high tooth.
  vec4 ink = sampleInk(uv);
  float inkPool = mix(0.85, 1.0, clamp(0.5 - hPaper * 3.0, 0.0, 1.0));
  float inkAlpha = ink.a * inkPool;
  vec3 outColour = paperWithRule * (1.0 - inkAlpha) + ink.rgb * inkPool;
  float outAlpha = 1.0;

  // Edge vignette + thickness rim + directional curl.
  float d = distance(uv, vec2(0.5, 0.5));
  float vignette = 1.0 - smoothstep(0.55, 0.85, d) * 0.06;
  float edgeDist = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  float edgeRim = 1.0 - smoothstep(0.0, 0.05, edgeDist);
  float edgeGlow = edgeRim * 0.05;
  float curlDir = (uv.x - 0.5) + (uv.y - 0.5);
  float curlShade = edgeRim * curlDir * 0.015;
  outColour *= vignette * (1.0 + edgeGlow + curlShade);

  fragColor = vec4(outColour, outAlpha);
}`;

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error('shader compile failed: ' + info);
  }
  return shader;
}

function createProgram(gl, vsSource, fsSource) {
  const program = gl.createProgram();
  gl.attachShader(program, createShader(gl, gl.VERTEX_SHADER, vsSource));
  gl.attachShader(program, createShader(gl, gl.FRAGMENT_SHADER, fsSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error('program link failed: ' + info);
  }
  return program;
}

function createTexture(gl, w, h) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

function createFbo(gl, w, h) {
  const fbo = gl.createFramebuffer();
  const tex = createTexture(gl, w, h);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error('framebuffer incomplete: ' + status);
  }
  return { fbo, tex };
}

export class WebGL2Renderer {
  constructor({ canvas, onStatus } = {}) {
    this._canvas = canvas || null;
    this._gl = null;
    this._onStatus = onStatus || (() => {});
    this._available = false;
    this._initialized = false;

    // Programs / locations
    this._paperProg = null; this._paperLocs = null;
    this._inkProg = null; this._inkLocs = null;
    this._compositeProg = null; this._compositeLocs = null;

    // Resources
    this._paperFbo = null; this._paperTex = null;
    this._inkFbo = null; this._inkTex = null;
    this._quadVao = null; this._quadBuf = null;
    this._strokeVao = null; this._strokeBuf = null;
    this._strokeVertexCount = 0;

    // Document model
    this._pageW = 0; this._pageH = 0;
    this._template = null; this._strokes = [];
    this._pen = PEN_MATERIALS.ballpoint;
    this._dirty = true;
  }

  get available() { return this._available && this._initialized; }

  async init() {
    if (!this._canvas) {
      this._onStatus('WebGL2: no canvas');
      return false;
    }
    const gl = this._canvas.getContext('webgl2');
    if (!gl) {
      this._onStatus('WebGL2 context not available');
      return false;
    }
    this._gl = gl;
    try {
      this._createPrograms(gl);
      this._createQuad(gl);
      this._createdResourcesForSize(gl, this._pageW || 1, this._pageH || 1);
      this._initialized = true;
      this._available = true;
      this._onStatus('WebGL2 ready');
      logger.info('gpu', 'webgl2 renderer initialised');
      return true;
    } catch (err) {
      const e = wrap(err, { module: 'gpu', operation: 'webgl2Init' });
      logger.error('gpu', 'webgl2 init', e.toJSON());
      this._available = false;
      this._onStatus('WebGL2 unavailable: ' + (e.cause || e.message));
      return false;
    }
  }

  _createPrograms(gl) {
    this._paperProg = createProgram(gl, PAPER_VS, PAPER_FS);
    this._inkProg = createProgram(gl, INK_VS, INK_FS);
    this._compositeProg = createProgram(gl, COMPOSITE_VS, COMPOSITE_FS);

    const u = (prog) => {
      const loc = (name) => gl.getUniformLocation(prog, name);
      return {
        resolution: loc('u_resolution'),
        seed: loc('u_seed'),
        lineSpacingPx: loc('u_lineSpacingPx'),
        lineWidthPx: loc('u_lineWidthPx'),
        lineOffsetPx: loc('u_lineOffsetPx'),
        marginXPx: loc('u_marginXPx'),
        marginLineWidthPx: loc('u_marginLineWidthPx'),
        lineColor: loc('u_lineColor'),
        marginLineColor: loc('u_marginLineColor'),
        lightDir: loc('u_lightDir'),
        ambient: loc('u_ambient'),
        paperTex: loc('u_paperTex'),
        inkTex: loc('u_inkTex'),
      };
    };
    this._paperLocs = u(this._paperProg);
    this._inkLocs = u(this._inkProg);
    this._compositeLocs = u(this._compositeProg);
  }

  _createQuad(gl) {
    // Fullscreen quad, triangle strip.
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  1, -1, -1,  1,  1,  1,
    ]), gl.STATIC_DRAW);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this._quadVao = vao;
    this._quadBuf = buf;
  }

  _createdResourcesForSize(gl, w, h) {
    w = Math.max(1, Math.floor(w));
    h = Math.max(1, Math.floor(h));
    if (this._paperFbo && this._paperTexWidth === w && this._paperTexHeight === h) {
      return;
    }
    if (this._paperFbo) gl.deleteFramebuffer(this._paperFbo);
    if (this._paperTex) gl.deleteTexture(this._paperTex);
    if (this._inkFbo) gl.deleteFramebuffer(this._inkFbo);
    if (this._inkTex) gl.deleteTexture(this._inkTex);

    const pf = createFbo(gl, w, h);
    this._paperFbo = pf.fbo;
    this._paperTex = pf.tex;
    this._paperTexWidth = w;
    this._paperTexHeight = h;

    const inf = createFbo(gl, w, h);
    this._inkFbo = inf.fbo;
    this._inkTex = inf.tex;

    // Stroke geometry vertex buffer.
    const sbuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, sbuf);
    gl.bufferData(gl.ARRAY_BUFFER, 8192 * 4, gl.DYNAMIC_DRAW); // 8192 floats
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    if (this._strokeBuf) gl.deleteBuffer(this._strokeBuf);
    this._strokeBuf = sbuf;

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, sbuf);
    // layout: x,y,hw,sd,r,g,b,a,p  stride 36
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 36, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 36, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 36, 12);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 36, 16);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 36, 32);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    if (this._strokeVao) gl.deleteVertexArray(this._strokeVao);
    this._strokeVao = vao;
  }

  setDocument({ pageW, pageH, template, size, strokes, pen }) {
    this._pageW = pageW; this._pageH = pageH;
    this._template = template; this._strokes = strokes || [];
    this._pen = pen || PEN_MATERIALS.ballpoint;
    this._dirty = true;
  }

  setStrokes(strokes) { this._strokes = strokes || []; this._dirty = true; }
  setPen(pen) { this._pen = pen || PEN_MATERIALS.ballpoint; this._dirty = true; }

  _uploadStrokes() {
    let total = 0;
    const parts = [];
    for (const s of this._strokes) {
      const g = buildStrokeGeometry(s);
      parts.push(g);
      total += g.length / 9;
    }
    this._strokeVertexCount = total;
    const gl = this._gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._strokeBuf);
    if (total > 0) {
      const data = new Float32Array(total * 9);
      let o = 0;
      for (const g of parts) { data.set(g, o); o += g.length; }
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    } else {
      gl.bufferData(gl.ARRAY_BUFFER, 0, gl.DYNAMIC_DRAW);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  _writeUniforms(gl, w, h, lineSpacingPx, lineWidthPx, lineOffsetPx, marginXPx, marginLineWidthPx) {
    const lineColor = DEFAULT_RULING.lineColor;
    const marginLineColor = DEFAULT_RULING.marginLineColor;
    const lightDir = DEFAULT_RULING.lightDir;
    const ambient = DEFAULT_RULING.ambient;
    const loc = this._compositeLocs;
    gl.uniform2f(loc.resolution, w, h);
    gl.uniform1f(loc.lineSpacingPx, lineSpacingPx);
    gl.uniform1f(loc.lineWidthPx, lineWidthPx);
    gl.uniform1f(loc.lineOffsetPx, lineOffsetPx);
    gl.uniform1f(loc.marginXPx, marginXPx);
    gl.uniform1f(loc.marginLineWidthPx, marginLineWidthPx);
    gl.uniform4f(loc.lineColor, lineColor[0], lineColor[1], lineColor[2], lineColor[3]);
    gl.uniform4f(loc.marginLineColor, marginLineColor[0], marginLineColor[1], marginLineColor[2], marginLineColor[3]);
    gl.uniform3f(loc.lightDir, lightDir[0], lightDir[1], lightDir[2]);
    gl.uniform1f(loc.ambient, ambient);
  }

  render() {
    if (!this._available || !this._initialized) return;
    const gl = this._gl;
    const w = this._pageW; const h = this._pageH;
    if (!w || !h) return;
    this._createdResourcesForSize(gl, w, h);

    // 1. Paper pass -> paper FBO.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._paperFbo);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this._paperProg);
    gl.uniform2f(this._paperLocs.resolution, w, h);
    gl.uniform1f(this._paperLocs.seed, Math.random());
    gl.bindVertexArray(this._quadVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // 2. Ink pass -> ink FBO (blended).
    if (this._strokeVertexCount > 0) {
      if (this._dirty) {
        this._uploadStrokes();
        this._dirty = false;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, this._inkFbo);
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(this._inkProg);
      gl.uniform2f(this._inkLocs.resolution, w, h);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindVertexArray(this._strokeVao);
      gl.drawArrays(gl.TRIANGLES, 0, this._strokeVertexCount);
      gl.disable(gl.BLEND);
    }

    // 3. Composite -> canvas.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this._compositeProg);

    // Write composite uniforms now that the composite program is bound.
    const lineSpacingPx = this._template ? MM_TO_PX * this._template.lineSpacingMm : 8 * 3.7795;
    const lineWidthPx = this._template ? MM_TO_PX * DEFAULT_RULING.lineWidthMm : 0.5 * 3.7795;
    const lineOffsetPx = this._template ? MM_TO_PX * this._template.topMarginMm : 25 * 3.7795;
    const marginXPx = this._template ? MM_TO_PX * this._template.marginMm : 25 * 3.7795;
    const marginLineWidthPx = this._template ? MM_TO_PX * 1.2 : 1.2 * 3.7795;
    this._writeUniforms(gl, w, h, lineSpacingPx, lineWidthPx, lineOffsetPx, marginXPx, marginLineWidthPx);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._paperTex);
    gl.uniform1i(this._compositeLocs.paperTex, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this._inkTex);
    gl.uniform1i(this._compositeLocs.inkTex, 1);
    gl.bindVertexArray(this._quadVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    gl.useProgram(null);
  }

  async exportPng(exportW, exportH) {
    if (!this._available || !this._initialized) {
      throw new Error('gpu: renderer not available for export');
    }
    const gl = this._gl;

    // Clamp to device limits.
    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const scale = Math.min(1, maxTex / exportW, maxTex / exportH);
    let clampedW = exportW;
    let clampedH = exportH;
    if (scale < 1) {
      clampedW = Math.floor(exportW * scale);
      clampedH = Math.floor(exportH * scale);
      this._onStatus('Export clamped to ' + clampedW + 'x' + clampedH);
    }

    const w = Math.max(1, Math.floor(clampedW));
    const h = Math.max(1, Math.floor(clampedH));

    // Save canvas and page dimensions.
    const savedCanvasW = this._canvas.width;
    const savedCanvasH = this._canvas.height;
    const savedPageW = this._pageW;
    const savedPageH = this._pageH;

    let blob = null;
    try {
      // Resize canvas to export size.
      this._canvas.width = w;
      this._canvas.height = h;

      // Temporarily adopt export size for rendering.
      this._pageW = w;
      this._pageH = h;

      // Recreate resources at export size.
      this._createdResourcesForSize(gl, w, h);

      // Scale uniforms for export resolution.
      const sx = w / savedPageW;
      const sy = h / savedPageH;
      const lineSpacingPx = this._template ? MM_TO_PX * this._template.lineSpacingMm * sy : 8 * 3.7795 * sy;
      const lineWidthPx = this._template ? MM_TO_PX * DEFAULT_RULING.lineWidthMm * sy : 0.5 * 3.7795 * sy;
      const lineOffsetPx = this._template ? MM_TO_PX * this._template.topMarginMm * sy : 25 * 3.7795 * sy;
      const marginXPx = this._template ? MM_TO_PX * this._template.marginMm * sx : 25 * 3.7795 * sx;
      const marginLineWidthPx = this._template ? MM_TO_PX * 1.2 * sy : 1.2 * 3.7795 * sy;

      // 1. Paper pass -> paper FBO at export size.
      gl.bindFramebuffer(gl.FRAMEBUFFER, this._paperFbo);
      gl.viewport(0, 0, w, h);
      gl.useProgram(this._paperProg);
      gl.uniform2f(this._paperLocs.resolution, w, h);
      gl.uniform1f(this._paperLocs.seed, Math.random());
      gl.bindVertexArray(this._quadVao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // 2. Ink pass -> ink FBO at export size (scaled strokes).
      const savedStrokes = this._strokes;
      const savedCount = this._strokeVertexCount;
      try {
        const scaled = this._strokes.map(s => ({
          ...s,
          points: s.points.map(p => ({ x: p.x * sx, y: p.y * sy, t: p.t })),
          width: s.width * Math.sqrt(sx * sy),
        }));
        this._strokes = scaled;
        this._dirty = true;
        if (this._dirty) this._uploadStrokes();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this._inkFbo);
        gl.viewport(0, 0, w, h);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(this._inkProg);
        gl.uniform2f(this._inkLocs.resolution, w, h);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.bindVertexArray(this._strokeVao);
        gl.drawArrays(gl.TRIANGLES, 0, this._strokeVertexCount);
        gl.disable(gl.BLEND);
      } finally {
        this._strokes = savedStrokes;
        this._strokeVertexCount = savedCount;
      }

      // 3. Composite -> canvas at export size.
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(this._compositeProg);
      this._writeUniforms(gl, w, h, lineSpacingPx, lineWidthPx, lineOffsetPx, marginXPx, marginLineWidthPx);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this._paperTex);
      gl.uniform1i(this._compositeLocs.paperTex, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this._inkTex);
      gl.uniform1i(this._compositeLocs.inkTex, 1);
      gl.bindVertexArray(this._quadVao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Capture the frame while it is still on the canvas.
      blob = await new Promise((resolve) => {
        this._canvas.toBlob(resolve, 'image/png');
      });
      if (!blob) {
        blob = await new Promise((resolve) => {
          this._canvas.toBlob(resolve, 'image/jpeg', 0.95);
        });
      }
    } finally {
      // Restore on-screen canvas size and re-render.
      this._pageW = savedPageW;
      this._pageH = savedPageH;
      this._canvas.width = savedCanvasW;
      this._canvas.height = savedCanvasH;
      this._createdResourcesForSize(gl, savedPageW, savedPageH);
      this.render();
    }

    return blob;
  }

  resize() { this._dirty = true; }

  destroy() {
    const gl = this._gl;
    if (gl) {
      if (this._paperFbo) gl.deleteFramebuffer(this._paperFbo);
      if (this._paperTex) gl.deleteTexture(this._paperTex);
      if (this._inkFbo) gl.deleteFramebuffer(this._inkFbo);
      if (this._inkTex) gl.deleteTexture(this._inkTex);
      if (this._strokeBuf) gl.deleteBuffer(this._strokeBuf);
      if (this._strokeVao) gl.deleteVertexArray(this._strokeVao);
      if (this._quadVao) gl.deleteVertexArray(this._quadVao);
      if (this._quadBuf) gl.deleteBuffer(this._quadBuf);
      if (this._paperProg) gl.deleteProgram(this._paperProg);
      if (this._inkProg) gl.deleteProgram(this._inkProg);
      if (this._compositeProg) gl.deleteProgram(this._compositeProg);
    }
    this._initialized = false;
    this._available = false;
  }
}
