// Ink stroke shader.
// Renders handwriting strokes as variable-width geometry with pressure,
// pigment density, soft edges and absorption-like edge darkening. Output is
// premultiplied RGBA8 into an ink texture for later composition.
//
// Uniform layout (shared): 0 pageWidthPx, 1 pageHeightPx.
// Vertex layout (stride 36 bytes, tightly packed):
//   location(0) position  vec2   (offset 0)   actual corner position (page px)
//   location(1) halfWidth f32    (offset 8)   half-width at this vertex
//   location(2) signedDist f32   (offset 12)  signed distance from centreline
//   location(3) color     vec4   (offset 16)  pen colour (rgb, alpha) 0..1
//   location(4) pressure  f32    (offset 32)  0..1 pressure

struct Uniforms {
  pageWidthPx: f32,
  pageHeightPx: f32,
};

struct VertexInput {
  @location(0) position: vec2<f32>,
  @location(1) halfWidth: f32,
  @location(2) signedDist: f32,
  @location(3) color: vec4<f32>,
  @location(4) pressure: f32,
};

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) signedDist: f32,
  @location(1) halfWidth: f32,
  @location(2) color: vec4<f32>,
  @location(3) pressure: f32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@vertex
fn mainVs(in: VertexInput) -> VertexOutput {
  var out: VertexOutput;
  let clipX = 2.0 * in.position.x / uniforms.pageWidthPx - 1.0;
  let clipY = 1.0 - 2.0 * in.position.y / uniforms.pageHeightPx;
  out.position = vec4<f32>(clipX, clipY, 0.0, 1.0);
  out.signedDist = in.signedDist;
  out.halfWidth = in.halfWidth;
  out.color = in.color;
  out.pressure = in.pressure;
  return out;
}

@fragment
fn mainFs(@location(0) signedDist: f32,
          @location(1) halfWidth: f32,
          @location(2) color: vec4<f32>,
          @location(3) pressure: f32) -> @location(0) vec4<f32> {
  // across = normalised distance from centreline (0 = centre, 1 = edge).
  let across = abs(signedDist) / halfWidth;
  let soft = 0.35 + 0.30 * (1.0 - pressure);
  let coreAlpha = smoothstep(1.0, 0.0, across * 1.15);
  let edgeAlpha = smoothstep(0.5, 0.0, across);
  let alpha = mix(coreAlpha, edgeAlpha, soft);
  let density = 0.75 + 0.25 * alpha;
  let rgb = color.rgb * color.a * density * pressure;
  let edgeDark = 1.0 + 0.25 * (1.0 - alpha);
  return vec4<f32>(rgb * edgeDark, alpha);
}
