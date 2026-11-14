// Composite fragment shader (full-screen quad).
// Combines the paper material (lit from its height field), the notebook
// ruling (blue-grey horizontal rules), the margin line (red-brown) and the
// ink layer into the final page image.
//
// Paper texture is rgba32float storage (not filterable on many devices,
// especially mobile), so all sampling uses textureLoad (exact texel fetch,
// no filtering required) with integer coords clamped to the texture bounds.
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

fn dims() -> vec2<f32> {
  return vec2<f32>(uniforms.pageWidthPx, uniforms.pageHeightPx);
}

fn texCoords(uv: vec2<f32>) -> vec2<i32> {
  return vec2<i32>(clamp(uv, vec2<f32>(0.0), vec2<f32>(1.0)) * dims());
}

fn sampleHeight(uv: vec2<f32>) -> f32 {
  return (textureLoad(paperTex, texCoords(uv), 0).a - 0.5) / 4.0;
}

fn normalAndRoughnessFromHeight(uv: vec2<f32>) -> vec3<f32> {
  let tx = vec2<f32>(1.0 / uniforms.pageWidthPx, 0.0);
  let ty = vec2<f32>(0.0, 1.0 / uniforms.pageHeightPx);
  let h = sampleHeight(uv);
  let hx = sampleHeight(uv + tx) - sampleHeight(uv - tx);
  let hy = sampleHeight(uv + ty) - sampleHeight(uv - ty);
  let normal = normalize(vec3<f32>(-hx * 3.0, -hy * 3.0, 1.0));
  let grad = sqrt(hx * hx + hy * hy) * 0.5;
  let roughness = clamp(grad, 0.0, 1.0);
  return vec3<f32>(normal.x, normal.y, roughness);
}

fn ambientOcclusion(uv: vec2<f32>) -> f32 {
  let h0 = sampleHeight(uv);
  var ao = 0.0;
  var weight = 1.0;
  var step = 1.0;
  for (var i = 0; i < 4; i++) {
    let angle = f32(i) * 1.5708;
    let dir = vec2<f32>(cos(angle), sin(angle));
    let p = uv + dir * step * 1.0 / dims();
    let hd = sampleHeight(p);
    if (hd < h0) {
      ao += (h0 - hd) * weight;
    }
    weight *= 0.5;
    step *= 2.0;
  }
  return clamp(ao * 0.5, 0.0, 1.0);
}

@vertex
fn mainVs(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4<f32> {
  // Full-screen quad, triangle strip, Y-down to match page coords.
  let x = f32(i32(vertexIndex) & 1) * 2.0 - 1.0;
  let y = f32((i32(vertexIndex) >> 1) & 1) * 2.0 - 1.0;
  return vec4<f32>(x, -y, 0.0, 1.0);
}

@fragment
fn mainFs(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
  let uv = fragCoord.xy / dims();
  let paper = textureLoad(paperTex, texCoords(uv), 0);
  let baseColour = paper.rgb;

  // ---- Lighting from the paper height field ----
  let nr = normalAndRoughnessFromHeight(uv);
  let normal = normalize(vec3<f32>(nr.x, nr.y, 1.0));
  let roughness = nr.z;
  let lightDir = normalize(vec3<f32>(uniforms.lightDirX, uniforms.lightDirY, uniforms.lightDirZ));

  // Diffuse (dominant for matte paper).
  let diffuse = max(dot(normal, lightDir), 0.0);

  // Roughness-modulated specular: rougher paper spreads the highlight.
  let viewDir = vec3<f32>(0.0, 0.0, 1.0);
  let halfDir = normalize(lightDir + viewDir);
  let specDot = max(dot(normal, halfDir), 0.0);
  let specPower = 32.0 + 64.0 * (1.0 - roughness);
  let softSpec = pow(specDot, specPower) * 0.06 * (1.0 - roughness * 0.5);

  // Ambient occlusion from height field: creases and fibres darken locally.
  let ao = ambientOcclusion(uv);
  let lighting = (uniforms.ambient + (1.0 - uniforms.ambient) * diffuse) * (1.0 - 0.4 * ao);
  let lit = baseColour * lighting + vec3<f32>(softSpec);

  // ---- Ruled lines: blue-grey horizontal rules starting at lineOffsetPx ----
  let py = fragCoord.y;
  let spacing = uniforms.lineSpacingPx;
  let rel = (py - uniforms.lineOffsetPx) / spacing;
  let phase = fract(rel);
  let lineDist = min(phase, 1.0 - phase) * spacing;
  let lineHalf = uniforms.lineWidthPx * 0.5;
  let lineAlpha = 1.0 - smoothstep(lineHalf - 0.4, lineHalf + 0.4, lineDist);

  // ---- Margin line: vertical red-brown line at the left margin ----
  let mx = fragCoord.x;
  let marginDist = abs(mx - uniforms.marginXPx);
  let marginHalf = uniforms.marginLineWidthPx * 0.5;
  let marginAlpha = 1.0 - smoothstep(marginHalf - 0.4, marginHalf + 0.4, marginDist);

  // ---- Ruling printed on the surface: height modulates line strength ----
  let h = sampleHeight(uv);
  let ruleRelief = clamp(0.5 - h * 1.5, 0.6, 1.0);
  let ruleMix = min(lineAlpha + marginAlpha, 1.0) * ruleRelief;
  let lineColour = mix(
    vec3<f32>(uniforms.lineColorR, uniforms.lineColorG, uniforms.lineColorB),
    vec3<f32>(uniforms.marginLineColorR, uniforms.marginLineColorG, uniforms.marginLineColorB),
    select(0.0, 1.0, marginAlpha > lineAlpha)
  );
  let paperWithRule = mix(
    lit,
    lit * (1.0 - 0.6 * ruleMix) + lineColour * (0.6 * ruleMix),
    ruleMix
  );

  // ---- Ink layer: ink pools in fibre valleys (low height) and skips high tooth ----
  let ink = textureSample(inkTex, inkSampler, uv);
  let inkPool = clamp(0.5 - h * 3.0, 0.0, 1.0);
  let inkAlpha = ink.a * inkPool;
  let outColour = paperWithRule * (1.0 - inkAlpha) + ink.rgb * inkPool;
  let outAlpha = 1.0;

  // ---- Edge vignette + soft page-edge rim (sheet thickness catches light) ----
  let d = distance(uv, vec2<f32>(0.5, 0.5));
  let vignette = 1.0 - smoothstep(0.55, 0.85, d) * 0.06;
  let edgeDist = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  let edgeRim = 1.0 - smoothstep(0.0, 0.05, edgeDist);
  let edgeGlow = edgeRim * 0.05;
  // Edge curl: directional shade across the outer edge so one corner lifts
  // (catching light) and the opposite casts a shadow.
  let curlDir = (uv.x - 0.5) + (uv.y - 0.5);
  let curlShade = edgeRim * curlDir * 0.07;
  let outColourVignette = outColour * vignette * (1.0 + edgeGlow + curlShade);

  return vec4<f32>(outColourVignette, outAlpha);
}
