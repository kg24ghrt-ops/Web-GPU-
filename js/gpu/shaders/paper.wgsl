// Paper material compute shader.
// Generates a procedural paper sheet: off-white base colour with subtle
// nonuniform distribution, multi-scale fibres, fibre orientation/density
// variation, fine surface roughness and a height field for lighting.
// Output texture: RGBA16Float  rgb = base colour, a = height (surface).
//
// Uniform layout (shared, 24 x f32 = 96 bytes):
//  0 pageWidthPx  1 pageHeightPx  2 lineSpacingPx  3 lineWidthPx
//  4 lineOffsetPx 5 marginXPx  6 marginLineWidthPx
//  7-10 lineColor RGBA  11-14 marginLineColor RGBA
//  15 lightDirX 16 lightDirY 17 lightDirZ  18 ambient  19 seed  20 time
//  21-23 pad

struct Uniforms {
  pageWidthPx: f32,
  pageHeightPx: f32,
  lineSpacingPx: f32,
  lineWidthPx: f32,
  lineOffsetPx: f32,
  marginXPx: f32,
  marginLineWidthPx: f32,
  lineColorR: f32,
  lineColorG: f32,
  lineColorB: f32,
  lineColorA: f32,
  marginLineColorR: f32,
  marginLineColorG: f32,
  marginLineColorB: f32,
  marginLineColorA: f32,
  lightDirX: f32,
  lightDirY: f32,
  lightDirZ: f32,
  ambient: f32,
  seed: f32,
  time: f32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var paperTex: texture_storage_2d<rgba16float, write>;

fn hash2(p: vec2<f32>) -> f32 {
  let x = fract(sin(dot(p, vec2<f32>(12.9898, 78.233))) * 43758.5453);
  return x;
}

fn noise2(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash2(i + vec2<f32>(0.0, 0.0)), hash2(i + vec2<f32>(1.0, 0.0)), u.x),
    mix(hash2(i + vec2<f32>(0.0, 1.0)), hash2(i + vec2<f32>(1.0, 1.0)), u.x),
    u.y
  );
}

fn fbm2(p: vec2<f32>, octaves: i32) -> f32 {
  var v = 0.0;
  var a = 0.5;
  var pp = p;
  for (var i = 0; i < octaves; i++) {
    v += a * noise2(pp);
    pp = pp * 2.0;
    a = a * 0.5;
  }
  return v;
}

// Anisotropic (directional) fbm: stretches noise to form fibres aligned to dir.
fn fibreFbm(p: vec2<f32>, dir: vec2<f32>, octaves: i32) -> f32 {
  const stretch = 8.0;
  let perp = vec2<f32>(-dir.y, dir.x);
  let q = vec2<f32>(dot(p, dir), dot(p, perp) * stretch);
  return fbm2(q, octaves);
}

@compute @workgroup_size(16, 16)
fn mainCs(@builtin(global_invocation_id) id: vec3<u32>) {
  let w = uniforms.pageWidthPx;
  let h = uniforms.pageHeightPx;
  let x = f32(id.x);
  let y = f32(id.y);
  if (x >= w || y >= h) { return; }

  let uv = vec2<f32>(x, y) / vec2<f32>(w, h);

  // Off-white paper base with subtle nonuniform colour distribution.
  let base = fbm2(uv * 3.0 + uniforms.seed, 4);
  let colourShift = fbm2(uv * 7.0 + uniforms.seed + 100.0, 3);
  let paperColour = vec3<f32>(
    0.965 + 0.018 * base + 0.006 * colourShift,
    0.958 + 0.014 * base + 0.005 * colourShift,
    0.930 + 0.012 * base + 0.004 * colourShift
  );

  // Multi-scale fibres: fine + broad, orientation/density variation.
  const fibreDir = vec2<f32>(0.92, 0.39);
  let fibreDensity = 0.55 + 0.25 * fbm2(uv * 2.0 + uniforms.seed + 200.0, 3);
  let fine = fibreFbm(uv * 40.0, fibreDir, 3);
  let broad = fibreFbm(uv * 10.0, fibreDir, 4);
  let fibreMask = smoothstep(0.52, 0.70, 0.5 * fine + 0.35 * broad) * fibreDensity;

  // Fine surface roughness (micro grain).
  let grain = fbm2(uv * 90.0 + uniforms.seed + 300.0, 2);

  // Surface height field for lighting; fibres depress the surface slightly.
  let height = 0.06 * fbm2(uv * 6.0 + uniforms.seed + 400.0, 5)
             + 0.02 * fbm2(uv * 30.0 + uniforms.seed + 500.0, 3);
  let heightWithFibre = height - 0.015 * fibreMask;

  let outColour = paperColour * vec3<f32>(
    1.0 - 0.06 * fibreMask + 0.02 * grain,
    1.0 - 0.04 * fibreMask + 0.02 * grain,
    1.0 - 0.03 * fibreMask + 0.015 * grain
  );

  textureStore(paperTex, id.xy, vec4<f32>(outColour, heightWithFibre));
}
