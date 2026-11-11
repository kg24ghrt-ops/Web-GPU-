// Composite fragment shader (full-screen quad).
// Combines the paper material (lit from its height field), the notebook
// ruling (blue-grey horizontal rules), the margin line (red-brown) and the
// ink layer into the final page image.
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
@group(0) @binding(1) var paperTex: texture_2d<f32>;
@group(0) @binding(2) var paperSampler: sampler;
@group(0) @binding(3) var inkTex: texture_2d<f32>;
@group(0) @binding(4) var inkSampler: sampler;

@vertex
fn mainVs(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4<f32> {
  // Full-screen quad, triangle strip, Y-down to match page coords.
  let x = f32(i32(vertexIndex) & 1) * 2.0 - 1.0;
  let y = f32((i32(vertexIndex) >> 1) & 1) * 2.0 - 1.0;
  return vec4<f32>(x, -y, 0.0, 1.0);
}

fn normalFromHeight(uv: vec2<f32>) -> vec3<f32> {
  const eps = 1.0;
  let tx = vec2<f32>(1.0 / uniforms.pageWidthPx, 0.0);
  let ty = vec2<f32>(0.0, 1.0 / uniforms.pageHeightPx);
  let h = textureSample(paperTex, paperSampler, uv).a;
  let hx = textureSample(paperTex, paperSampler, uv + tx).a - textureSample(paperTex, paperSampler, uv - tx).a;
  let hy = textureSample(paperTex, paperSampler, uv + ty).a - textureSample(paperTex, paperSampler, uv - ty).a;
  return normalize(vec3<f32>(-hx * 0.5, -hy * 0.5, 1.0));
}

@fragment
fn mainFs(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
  let uv = fragCoord.xy / vec2<f32>(uniforms.pageWidthPx, uniforms.pageHeightPx);
  let paper = textureSample(paperTex, paperSampler, uv);
  let baseColour = paper.rgb;

  // Lighting from the paper height field (matte paper: diffuse dominant).
  let normal = normalFromHeight(uv);
  let lightDir = normalize(vec3<f32>(uniforms.lightDirX, uniforms.lightDirY, uniforms.lightDirZ));
  let diffuse = max(dot(normal, lightDir), 0.0);
  let lighting = uniforms.ambient + (1.0 - uniforms.ambient) * diffuse;
  let softSpec = pow(max(dot(normal, vec3<f32>(0.0, 0.0, 1.0)), 0.0), 24.0) * 0.06;
  let lit = baseColour * lighting + vec3<f32>(softSpec);

  // Ruled lines: blue-grey horizontal rules starting at lineOffsetPx.
  let py = fragCoord.y;
  let spacing = uniforms.lineSpacingPx;
  let rel = (py - uniforms.lineOffsetPx) / spacing;
  let phase = fract(rel);
  let lineDist = min(phase, 1.0 - phase) * spacing;
  let lineHalf = uniforms.lineWidthPx * 0.5;
  let lineAlpha = 1.0 - smoothstep(lineHalf - 0.4, lineHalf + 0.4, lineDist);

  // Margin line: vertical red-brown line at the left margin.
  let mx = fragCoord.x;
  let marginDist = abs(mx - uniforms.marginXPx);
  let marginHalf = uniforms.marginLineWidthPx * 0.5;
  let marginAlpha = 1.0 - smoothstep(marginHalf - 0.4, marginHalf + 0.4, marginDist);

  // Composite ruling over lit paper: tint paper toward line colour at rules.
  let ruleMix = min(lineAlpha + marginAlpha, 1.0);
  let lineColour = mix(
    vec3<f32>(uniforms.lineColorR, uniforms.lineColorG, uniforms.lineColorB),
    vec3<f32>(uniforms.marginLineColorR, uniforms.marginLineColorG, uniforms.marginLineColorB),
    marginAlpha > lineAlpha ? 1.0 : 0.0
  );
  let paperWithRule = mix(
    lit,
    lit * (1.0 - 0.6 * ruleMix) + lineColour * (0.6 * ruleMix),
    ruleMix
  );

  // Ink layer: premultiplied alpha over paper.
  let ink = textureSample(inkTex, inkSampler, uv);
  let outColour = paperWithRule * (1.0 - ink.a) + ink.rgb;
  let outAlpha = 1.0 - (1.0 - paper.a) * (1.0 - ink.a);

  return vec4<f32>(outColour, outAlpha);
}
