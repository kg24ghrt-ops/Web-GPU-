# School-Lined Notebook — Photorealistic WebGPU Rendering Engine

A complete school-notebook rendering system built entirely on **WebGPU + WGSL**.
It renders realistic Asia B5 school-lined notebook paper with procedural fibres,
surface height variation, lighting, blue-grey ruling, a margin line, and
handwriting strokes that interact with the paper through a simulated ink
material (ballpoint and gel). Documents can be exported as print-resolution PNG.

## Primary success criterion: physical realism

The renderer is GPU-native (no Canvas 2D, no WebGL, no Three.js). Paper is
generated procedurally by a compute shader; handwriting is stroke geometry with
pressure, width and pigment variation; a composite pass lights the paper height
field and layers ruling, margin line and ink.

## Project structure

```
index.html             # Shell + toolbar (incl. Save PNG button)
css/index.css          # Styles
js/main.js             # App orchestration, page lifecycle, handwriting input, export
js/units.js            # mm <-> CSS px conversion
js/paper/*             # Paper sizes, templates (kept; document model)
js/handwriting/handwriting.js  # Stroke data model (Stroke)
js/notebook/notebook.js        # Document model (pages, strokes, text)
js/gpu/webgpu.js       # WebGPU detection, adapter/device, capability report
js/gpu/renderer.js     # WebGPU renderer: paper/ink/composite pipelines + PNG export
js/gpu/png.js          # Dependency-free PNG encoder (CompressionStream)
js/gpu/shaders/*.wgsl  # Paper (compute), ink (vertex+fragment), composite (fragment)
test/gpu/*.test.js     # PNG encoder + stroke-geometry unit tests (Node)
test/*.test.js         # Pre-existing unit tests (Node)
```

## How it works

### 1. Device & capability detection (`js/gpu/webgpu.js`)
- Detects `navigator.gpu`, requests an adapter (`high-performance`) and a
  device, inspects features/limits, and builds a `GpuReport`.
- Gracefully reports unsupported devices (no adapter, requestDevice failure,
  device loss) and degrades with a status message instead of crashing.

### 2. Paper material (`js/gpu/shaders/paper.wgsl`, compute)
- Off-white base colour with subtle nonuniform distribution (2 octaves of fBm).
- Multi-scale fibres (fine + broad) with orientation and density variation via
  anisotropic fBm stretched along a fibre direction.
- Fine micro grain.
- Surface height field for lighting; fibres slightly depress the surface.
- Output: RGBA16Float texture (`rgb` = colour, `a` = height).

### 3. Ink (`js/gpu/shaders/ink.wgsl`, vertex + fragment)
- Each handwriting stroke is rebuilt as variable-width geometry: one triangle
  pair (6 vertices) per segment, quad around the segment normal with per-end
  half-width.
- Vertex attributes: position, halfWidth, signedDist, color (float32x4),
  pressure.
- Pressure derived from point speed (slower = harder).
- Fragment: normalised distance from centreline -> soft edge; pigment density;
  absorption-like edge darkening. Premultiplied output into an RGBA8 ink
  texture.

### 4. Composite (`js/gpu/shaders/composite.wgsl`, fragment, full-screen quad)
- Lighting from the paper height field (diffuse-dominant matte paper, soft
  specular).
- Blue-grey horizontal ruling at exact line spacing, starting at the top
  margin, with soft edges.
- Red-brown vertical margin line at the left margin.
- Premultiplied ink composited over lit paper.
- Output: RGBA8.

### 5. Export / Save PNG (`js/gpu/renderer.js` + `js/gpu/png.js`)
- Renders the full document at an independent export resolution (default 150 dpi
  -> print quality) into offscreen paper/ink/output textures.
- Copies the output texture to a `GPUBufferUsage.COPY_DST | MAP_READ` buffer
  with correct 256-byte row alignment.
- `mapAsync()` reads pixels; row padding stripped; encoded to PNG via a
  dependency-free encoder (platform `CompressionStream`, deflate-raw, stored
  fallback).
- PNG Blob downloaded via a temporary anchor link with filename
  `school-notebook-page.png`.
- Disables the Save button mid-export, shows success/failure status, releases
  temporary GPU resources after export.

## Build / run / test

There is no build step (ES modules served directly).

- Open `index.html` in a WebGPU-capable browser (Chrome/Chromium desktop or
  Android Chrome on a compatible GPU).
- Commands (from `/public/html 1`):
  - `node --test`            — run the Node unit test suite
  - `node --test test/gpu/`  — run the new GPU/PNG/geometry tests

There is no lint/typecheck configuration in this repo. Tests use Node's built-in
`node:test` + `assert`.

## Dependencies

| Dependency | Justification |
|------------|---------------|
| WebGPU (native browser API) | Primary renderer, mandated by the task |
| WGSL | Shader language for WebGPU |
| `CompressionStream` (platform) | PNG deflate compression — no external dependency |
| None added to package.json | No npm dependencies were added for the renderer |

No third-party graphics library, no WASM, no Canvas 2D primary path.

## Browser & GPU compatibility report

- Target: Chrome and Chromium-based browsers (desktop + Android Chrome on
  compatible ARM GPUs).
- Firefox on Android is **not** assumed to support WebGPU; not every Mali GPU
  exposes a usable adapter.
- Detection path: `navigator.gpu` presence -> `requestAdapter` ->
  `requestDevice` -> inspect features/limits -> capability report.
- Adapter failure, device loss, shader-compile failure and allocation failure
  are handled; the app shows a status message and does not pretend WebGPU works
  on an unsupported device.
- Desktop GPU results are not assumed to represent Android Mali behaviour.

## Save PNG feature

- Visible "Save PNG" button in the right toolbar group.
- Disabled while an export is running; shows "Exporting PNG…" then "Exported
  WxH" or "Export failed: …".
- Filename: `school-notebook-page.png`.
- Default resolution: 150 dpi (print quality), preserving B5 proportions,
  fibres, ruling, margin line, handwriting, ink and shading.
- Works independently of viewport zoom/screen resolution (renders at export
  resolution into offscreen textures).
- Gracefully handles missing WebGPU devices and export errors.

## Known limitations

- Photorealism is procedural: fibres, grain and height are fBm-based, not
  derived from scanned paper. The result is physically plausible but not a
  scan reproduction; this is documented simulation, not captured data.
- Handwriting is a stroke-trajectory model with pressure/width/pigment
  variation, not a learned handwriting font; individual "handwriting identity"
  is approximated by stroke parameter variation, not by a trained model.
- Ink absorption/capillary spreading is approximated by edge darkening and
  pigment density, not a true fluid simulation.
- WebGPU availability varies by browser/GPU; unsupported devices get a graceful
  status message (no rendering). No Canvas 2D fallback is provided for the
  primary renderer, per the task requirements.
- The Node test suite cannot exercise WebGPU (no GPU in Node); shader correctness
  is validated on real browsers. PNG encoder and stroke geometry are unit-tested.
- Pre-existing test failures (`test/renderer.test.js`, `test/text-editor.test.js`,
  one `storage.test.js` case) are due to missing `jsdom`/pre-existing logic and
  are unrelated to the WebGPU work.

## Files added/changed

Added: `js/gpu/webgpu.js`, `js/gpu/renderer.js`, `js/gpu/png.js`,
`js/gpu/shaders/paper.wgsl`, `js/gpu/shaders/ink.wgsl`,
`js/gpu/shaders/composite.wgsl`, `test/gpu/png.test.js`,
`test/gpu/geometry.test.js`.

Changed: `index.html` (Save PNG button), `js/main.js` (WebGPU integration,
handwriting input, export), `css/index.css` (`.page__canvas`).
# Web-GPU-
