// Paper material compute shader.
// Generates a photorealistic procedural paper sheet: off-white base colour
// with nonuniform distribution, multi-scale fibres, paper tooth, crease /
// fold height variation, subtle staining, fine surface roughness and a
// detailed height field for lighting. Output texture: RGBA8Unorm
// rgb = base colour, a = height (surface).
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
@group(0) @binding(1) var paperTex: texture_storage_2d<rgba8unorm, write>;

fn hash2(p: vec2<f32>) -> f32 {
  let x = fract(sin(dot(p, vec2<f32>(12.9898, 78.233))) * 43758.5453);
  return x;
}

fn hash3(p: vec3<f32>) -> f32 {
  let x = fract(sin(dot(p, vec3<f32>(12.9898, 78.233, 45.164))) * 43758.5453);
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

// Ridged multifractal: emphasises ridges for sharper crease / fold structure.
fn ridged2(p: vec2<f32>, octaves: i32) -> f32 {
  var v = 1.0;
  var a = 0.5;
  var pp = p;
  for (var i = 0; i < octaves; i++) {
    let n = noise2(pp);
    v *= 1.0 - abs(n * 2.0 - 1.0);
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
  let s = uniforms.seed;

  // ---- Base colour: off-white with nonuniform distribution ----
  let base = fbm2(uv * 3.0 + s, 4);
  let colourShift = fbm2(uv * 7.0 + s + 100.0, 3);
  // Subtle yellowing / ageing variation across the sheet.
  let ageShift = fbm2(uv * 1.5 + s + 4000.0, 3);
  let paperColour = vec3<f32>(
    0.965 + 0.018 * base + 0.006 * colourShift + 0.004 * ageShift,
    0.958 + 0.014 * base + 0.005 * colourShift + 0.003 * ageShift,
    0.930 + 0.012 * base + 0.004 * colourShift + 0.002 * ageShift
  );

  // ---- Multi-scale fibres: fine + broad, orientation/density variation ----
  const fibreDir = vec2<f32>(0.92, 0.39);
  let fibreDensity = 0.55 + 0.25 * fbm2(uv * 2.0 + s + 200.0, 3);
  let fine = fibreFbm(uv * 40.0, fibreDir, 3);
  let broad = fibreFbm(uv * 10.0, fibreDir, 4);
  let fibreMask = smoothstep(0.52, 0.70, 0.5 * fine + 0.35 * broad) * fibreDensity;

  // ---- Paper tooth: fine bump texture for surface realism ----
  let tooth = fbm2(uv * 120.0 + s + 300.0, 2);

  // ---- Subtle staining / toner variation (low-frequency discoloration) ----
  let stain = fbm2(uv * 0.8 + s + 5000.0, 4);
  let stainMask = smoothstep(0.45, 0.65, stain);

  // ---- Surface height field for lighting ----
  // Large-scale crease / fold structure (ridged multifractal).
  let crease = ridged2(uv * 2.0 + s + 6000.0, 4);
  // Mid-scale fibre-driven depressions.
  let fibreHeight = 0.06 * fbm2(uv * 6.0 + s + 400.0, 5)
                 + 0.02 * fbm2(uv * 30.0 + s + 500.0, 3);
  // Fine tooth bumps.
  let toothHeight = 0.008 * tooth;
  let height = 0.03 * crease + fibreHeight - 0.015 * fibreMask + toothHeight;

  // ---- Output colour with fibre masking, grain and staining ----
  let grain = fbm2(uv * 90.0 + s + 300.0, 2);
  let outColour = paperColour * vec3<f32>(
    1.0 - 0.06 * fibreMask + 0.02 * grain - 0.02 * stainMask,
    1.0 - 0.04 * fibreMask + 0.02 * grain - 0.015 * stainMask,
    1.0 - 0.03 * fibreMask + 0.015 * grain - 0.01 * stainMask
  );

  textureStore(paperTex, id.xy, vec4<f32>(outColour, height));
}
