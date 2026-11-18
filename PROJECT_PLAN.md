# Project Plan v3: Hyperrealistic Notebook Paper & Handwriting (English + Burmese)

Status: planning document (v3). Written for the coding agent and the project owner.
Rule zero: anything marked **VERIFY** is unconfirmed against a primary source or a real
notebook. It is a hypothesis, not a fact. Confidence tags: [H] standard knowledge,
[M] plausible, [L] guess. The agent must upgrade every tag to "verified: <source>" or
"measured: <photo>" before the value ships in `data/`.

## Changelog v2 -> v3 (what changed and why)

- Added measurable success criteria (section 1) and a human evaluation protocol (section 10).
  v2 said "judge it by eye"; v3 defines whose eye, how many, and what score ships.
- Reordered milestones spike-first (section 12): Burmese skeleton feasibility and Mali
  device rendering are proven in the first 3 weeks, not at M6/M7.
- Replaced vague stages with concrete algorithms: skeleton pipeline (7.2),
  kinematic parameter design (7.4), drift recipes (7.5), line-fit math (8.4),
  line breaking without runtime ICU (8.3).
- Added hard budgets with arithmetic (section 3): tiles, memory, APK size, CI minutes.
- Added determinism engineering (5.4): bit-exact strokes across CI and device.
- Added risk register with fallback triggers (section 11).
- Every owner question (section 15) now has a recommended default; work never blocks.
- Added ruling *types* (grid, 4-line, Seyes) - v2 only had line spacing.
- Added missing-glyph policy (never render tofu - a tofu box is a font tell).
- Added measurement protocol, license ledger template, golden-image policy,
  fuzz/sanitizer testing, and a font-tell taxonomy with fixes.
- Kept every v2 decision that was sound. Nothing was reopened without a reason.

---

## 1. Mission and success criteria

Render a PNG that a human mistakes for a phone photo of a real notebook page with
real handwriting. English, Burmese (Unicode), and mixed lines must all work.

**Ship gate (all must pass):**

| # | Criterion | Target | How measured |
|---|-----------|--------|--------------|
| S1 | Human discrimination (2AFC, 10.2) | <= 70% detection (chance = 50%) | 10 naive viewers, 20 pairs, 5 s each |
| S2 | Automated not-a-font checks (10.1) | 7/7 pass at initial thresholds | `tools/eval/` in CI |
| S3 | Burmese correctness | 0 shaping errors on test corpus | HarfBuzz cluster diff vs reference + native review |
| S4 | Determinism | Bit-exact strokes, same seed, Linux x86_64 == Android arm64 | stroke hash test |
| S5 | Device performance | <= 3 s per A4 page @ 300 DPI on Mali-G610 | on-device timer |
| S6 | CI build | < 5 min both jobs | Actions timing |
| S7 | License cleanliness | 100% of shipped assets in ledger, obligations met | ledger lint in CI |

Stretch goal: S1 <= 60%. Honest expectation: v1 may land at 75-85% detection.
That is a *pass for iteration*, not for ship. The honesty report (section 16) must say so.

## 2. Scope and non-goals

In scope: PNG output; ruled/grid notebook paper (Asia-Pacific priority, plus ISO/US);
typed English + Burmese Unicode text, mixed on one line; synthetic handwriting only;
Android arm64 app (NDK, GLES3); headless Linux CI rendering.

Non-goals (v1): path tracing; 3D scenes; live pen input; Zawgyi (detect and refuse, 8.5);
owner data collection; other scripts (Chinese, Devanagari, Thai...); PDF/SVG export;
animation; cloud anything; runtime network access of any kind.

## 3. Constraints and budgets (with arithmetic)

Units: 1 in = 25.4 mm. 300 DPI = 11.811 px/mm.

| Item | Budget | Math / note |
|---|---|---|
| A4 @ 300 DPI | 2480 x 3508 px | 210x11.811, 297x11.811, rounded |
| Tile size | 1024 x 1024 | 3 cols x 4 rows = **12 tiles** per A4 (edge tiles 432x436) |
| Tile GPU memory | <= 48 MiB peak | 16F MSAA4x color 32 MiB + resolve 8 MiB + maps ~8 MiB |
| Full-page CPU buffer | 34.8 MB RGBA8 | 2480x3508x4; stitch here, never on GPU |
| Device time | <= 3 s/page | 12 tiles x ~150 ms + PBO readback + PNG encode ~1 s |
| CI render (llvmpipe) | <= 20 s @ 150 DPI | PR goldens at 1240x1754; 300 DPI nightly only |
| APK size | <= 20 MB (stretch <= 10) | hb ~1-2 MB + fonts ~0.5 MB + stroke bank ~3 MB + dict ~0.5 MB |
| CI build | < 5 min | hb amalgamation ~40 s; core/render ~30 s; tests ~60 s; Android ~2-3 min (preinstalled NDK, Gradle cache) |
| Shader loops | <= 32 iterations, fixed | Mali watchdog; keep each submit < ~100 ms |
| Dependencies | harfbuzz, stb, glm only at runtime | Anything else needs owner approval + ledger entry |

## 4. Locked decisions (do not reopen without a written reason)

| Decision | Choice | Why |
|---|---|---|
| Renderer | GLES 3.0 baseline via EGL, offscreen pbuffer+FBO, custom GLSL ES | NDK-ships, documented, full control |
| Not using | Vulkan, Filament, Godot, Unreal, on-device Blender, Canvas | v2 reasons stand |
| Writing engine | C99, zero deps, own PRNG + own sin/cos/exp | Determinism (5.4), portability |
| Handwriting data | Synthetic factory (offline Python), open-license fonts only | Owner collects nothing |
| Shaping | HarfBuzz, compiled as amalgamation `src/harfbuzz.cc` | Myanmar shaper exists; one TU ~ 40 s build |
| Line breaking | Offline-compiled Myanmar dictionary + cost-based breaker in C | **No runtime ICU** (size + build time break budgets) |
| Zawgyi detection | Port of google/myanmar-tools detector model (Apache-2.0, VERIFY) or rule heuristic | Small, offline, no ML runtime |
| Image I/O | stb_image / stb_image_write | Zero build cost; PNG metadata via sidecar JSON (stb writes no tEXt) |
| Math (renderer) | glm, C++ header-only, renderer only | Zero build cost |
| CI | GitHub Actions; Mesa llvmpipe + EGL surfaceless; Android via runner-preinstalled NDK | No GPU/display needed; no NDK download |
| Offline art | Blender + Python photometric stereo on dev machine only | Never shipped |
| Coordinate system | Page mm, origin top-left, +x right, +y down; baseline y per line | One convention everywhere; mm->px only at raster |
| Determinism | Core: float32, `-ffp-contract=off`, no fast-math, no threads, fixed op order | Bit-exact cross-platform strokes |
| Missing glyphs | Never tofu. Gap + warning (unknown codepoint) or base+mark fallback (missing variant) | A tofu box is an instant font tell |
| minSdk | 26 (default, section 15), `glEsVersion 0x00030000`, arm64-v8a only | GLES3 effectively universal there |

## 5. Architecture

```
OFFLINE (dev terminal, Python - outputs committed, tools not shipped)
  open-license fonts -> skeletonize -> stroke-order -> kinematic profiles
        -> allograph variants -> data/strokes/*.hwb  (+ OFL text per font)
  Myanmar corpus -> word dictionary -> data/dict/myanmar.dawg
  paper photos / CC0 maps -> data/materials/*   (photometric stereo, 6.4)

RUNTIME (shipped)
  UTF-8 + page spec + style + seed
    |
    +- [layout]   HarfBuzz runs -> clusters; cost-based line break; ruled grid;
    |             per-script line-fit (8.4); Zawgyi gate (8.5)
    +- [core]     variant choice + correlated drift + kinematics
    |             -> hw_stroke_list (x,y,t,width,darkness) in page mm
    +- [raster]   strokes -> coverage / thickness / direction maps (per tile)
    +- [render]   paper PBR + ink + light (1 pass/tile) -> post (1 pass/tile)
    |             -> PBO readback -> CPU stitch
    +- PNG + manifest.json (seed, git hash, data hash, style, timings)
```

### 5.1 Module contracts

- `core/` - C99, no deps, no I/O, no globals, not thread-safe (caller serializes).
  Owns: PRNG, noise, variant sampling, drift, kinematics, stroke emission.
- `layout/` - C++ (HarfBuzz is C++-built, C API used). Owns: shaping, clusters,
  breaking, grid, line-fit. Emits `hw_layout` consumed by core.
- `render/` - C++ + glm + stb. Owns: EGL, FBOs, shaders, raster of strokes into
  maps, tiling, readback, PNG. Consumes stroke lists; never modifies them.
- `tools/` - Python, offline. Never imported by runtime.

### 5.2 Engine API (C99)

```c
typedef struct { float x_mm, y_mm, t_s, width_mm, darkness; } hw_point;
typedef struct { hw_point *pts; size_t n; } hw_stroke;
typedef struct { hw_stroke *s; size_t n; } hw_stroke_list;

/* All return 0 on success, negative hw_error on failure. Caller frees via
   hw_stroke_list_free. Same (style, layout, utf8, seed) => bit-identical output. */
int  hw_style_load(const char *json, hw_style *out);
int  hw_layout_build(const hw_page *page, const char *utf8, hw_layout *out);
int  hw_synthesize(const hw_style*, const hw_layout*, const char *utf8,
                   uint64_t seed, hw_stroke_list *out);
void hw_stroke_list_free(hw_stroke_list*);
uint64_t hw_stroke_hash(const hw_stroke_list*);   /* determinism test */
```

### 5.3 Data formats (versioned; bump on any breaking change)

- `data/paper/sizes.json`, `rulings.json` - every entry:
  `{ id, nominal_mm:[w,h], measured_mm:[w,h]|null, source:{url|product|photo_hash},
     confidence:"verified|measured|VERIFY", notes }`
- `data/styles/*.json` - writer habit: slant_mean/range, size_mean/cv, pressure,
  baseline_offset, spacing_cv, fatigue_rate, connect_tendency, ink_color.
- `data/strokes/<bank>.hwb` - binary: magic `HWBK`, u16 version, u16 script,
  per glyph: cluster key (shaped glyph sequence hash), N variants; variant =
  cubic Bezier control points (float32 mm, normalized to x-height=1), width
  samples, pen-lift flags, stroke order index. Keyed by **shaped glyph IDs**,
  not codepoints (Burmese stacks are multi-glyph).
- `data/dict/myanmar.dawg` - compact word trie, longest-match at runtime.
- `manifest.json` sidecar per render - reproducibility record.

### 5.4 Determinism recipe

- Seed expansion: splitmix64; independent PCG32 streams for habit, per-line
  drift, variant choice, kinematics. Stream IDs fixed.
- Core implements its own sin/cos/exp/log (minimax polynomials, float32).
  No libm in core - libm differs across platforms.
- Compile core with `-ffp-contract=off`, no `-ffast-math`, no auto-vectorized
  reassociation. Single-threaded. Fixed evaluation order.
- CI test S4: render stroke hash on Linux and on device; must match exactly.
- GPU output is *not* bit-exact across drivers -> golden tolerances (13.2).

## 6. Paper data

### 6.1 Page sizes (mm)

| Region | Name | Size | Confidence |
|---|---|---|---|
| ISO 216 | A4 / A5 / A6 | 210x297 / 148x210 / 105x148 | [H] cite ISO 216 |
| ISO 216 | B5 | 176x250 | [H] |
| JIS P 0138 | B5 | 182x257 | [H] cite JIS; differs from ISO B5 |
| GB/T 148 | D4 ("~16K") | 188x260 | [L] VERIFY; commercial 16K also 185x260 / 210x285 |
| GB/T 148 | D5 ("~32K") | 130x184 | [L] VERIFY; commercial 32K also 130x185 |
| TW | 16K | ~190x260 | [L] VERIFY, varies by vendor |
| US | Letter / Legal | 215.9x279.4 / 215.9x355.6 | [H] |
| US | Junior Legal | 127x203.2 | [H] 5x8 in |
| US | Composition | 190.5x247.65 | [H] 7.5x9.75 in |

Store nominal **and** measured (cover vs inner sheet differ). Measurement wins.

### 6.2 Rulings - spacing AND type

v2 only had spacing. Real notebooks also differ by ruling *type*. Ship types:
`lined`, `grid` (e.g., 5 mm), `seyes`, `four_line` (English practice, India),
`blank`, `practice_grid` (CN tianzige - paper only; CN text out of scope).

| Ruling | Spacing | Confidence |
|---|---|---|
| US narrow / college / wide | 6.35 (1/4") / 7.14 (9/32") / 8.73 (11/32") | [H]; the "12.7 mm wide" claim is wrong or refers to primary ruling - MEASURE |
| US primary (K-2) | ~12.7 mm with dashed midline | [M] VERIFY |
| FR Seyes | 8 mm majors, 3 feints @ 2 mm; verticals 8 mm, first ~16 mm from edge | [M] VERIFY margin |
| UK / RU lined | 8 mm | [M] VERIFY |
| RU grid ("kletka") | 5x5 mm | [H] common |
| DE | Lineatur system, varies by grade (~5 mm from grade 5) | [L] VERIFY per Lineatur |
| JP | Kokuyo Campus A-rule 6 mm / B-rule 7 mm; 5 mm grid | [M] VERIFY via product page |
| Margin line | 24-32 mm | [L] MEASURE per product |

### 6.3 Asia-Pacific research task (owner scope in section 15, default: MY, JP, IN)

Per country record: page size, ruling type+spacing, margins, header boxes,
paper tone, binding. Method, in priority order:
1. Manufacturer product pages with dimensions (Kokuyo JP; Classmate/Navneet IN;
   local MY brands - find via stationery shop photos).
2. Product photos containing a ruler -> perspective-correct, measure >= 10 line
   gaps, average, tolerance +/-0.2 mm.
3. Owner buys one notebook per country (optional, cheap; this is *not*
   handwriting data collection and does not violate the zero-collection rule).
Until then every Asia value stays `VERIFY` and goldens use it only as placeholder.
Log everything in `docs/measurements.md` with photo hash.

### 6.4 Paper material (the realism source)

- Best: own phone photos. **Photometric stereo pipeline** (`tools/photo/`,
  ~100 lines numpy): page flat, phone fixed, flashlight at 4 raking angles ->
  solve normals + integrate height. Derive albedo from cross-polarized or
  ambient shot. No license problem, no new hardware.
- Fallback: Poly Haven / ambientCG CC0 - VERIFY a usable paper set exists
  before relying on it.
- Last resort: procedural fiber (anisotropic value noise + streaks) - acceptable
  for M1/M2, must be replaced or supplemented before S1 evaluation.

## 7. Handwriting synthesis (zero collection)

### 7.1 Sources and licenses

- Burmese: Noto Sans Myanmar, Padauk - both OFL [H]. RFN status: VERIFY each.
- Latin: Hershey single-stroke vectors (attribution-style license, VERIFY exact
  text) + OFL handwriting fonts as shape priors. Candidates (VERIFY each):
  Caveat, Patrick Hand, Gochi Hand, Architects Daughter, Shadows Into Light, Kalam.
- **OFL handling:** stroke banks are derivatives (outline->centerline is a
  modification, not a "document"). Ship OFL text + attribution beside each bank;
  rename bank files away from any Reserved Font Name; ledger row per font.
  VERIFY against OFL FAQ (derivatives vs documents) before M4 ships.
- Excluded by default: IAM On-Line (non-commercial research only). BHDD /
  Myanmar Numeral Glyphs are digit *images*, not trajectories - not useful here.

### 7.2 Skeleton pipeline (offline, per glyph) - this is the hard part

Naive medial axis produces spurs at every corner. Pipeline:
1. Rasterize outline at 8x target resolution; Euclidean distance transform.
2. Medial axis (`skimage.morphology.medial_axis`), width = 2x DT at each pixel.
3. Graph extraction -> prune branches shorter than 0.3x local width -> merge
   near-junctions -> simplify (Ramer-Douglas-Peucker eps=0.05x x-height).
4. Fit cubic Beziers; store width samples along each stroke.
5. **Stroke order + pen lifts:** rule table per script (Latin: top-to-bottom,
   left-to-right, loops before stems; Myanmar: base circle first, then stems,
   then above/below marks). Order affects joins and kinematics - it is data,
   not an afterthought.
6. Quality gate: re-render skeleton with stored widths, SSIM vs original
   raster >= 0.90, else flag glyph for manual rule fix. Report worst 20 glyphs.
   **Burmese stacked marks are the highest-risk glyphs - spike them first (M3).**

### 7.3 Allograph bank

- N = 12 variants per grapheme (range 8-16), from smooth correlated warps of
  control points: affine (slant, aspect) + 2nd-order polynomial field + per-
  stroke phase shift (start/end positions, loop openness). Never per-point noise.
- Multiple source fonts = multiple "hands"; a writer style samples a *mixture*
  so no single font signature dominates. Variant choice at runtime is seeded,
  with a no-immediate-repeat constraint.

### 7.4 Kinematic layer (Sigma-Lognormal, designed not fitted)

- Per stroke: velocity = sum of 3-7 lognormal pulses Lambda(t; mu, sigma, D).
- Parameter design from geometry: pulse count proportional to arc length / x-height;
  mu spaced along arc; sigma proportional to local curvature (tight curve -> slower,
  wider pulse); amplitude D proportional to segment length. Pen-up flights between
  strokes get their own small pulse.
- Ink mapping: width = w0*(v0/(v+eps))^gamma clipped to [0.5*w0, 2*w0]; darkness
  proportional to dwell time; landing blob (1.2-2x width, 0.1-0.3 mm); lift taper
  (0.3-1 mm); skips where pressure noise < tau.
- **Honest caveat (kept from v2):** published work *fits* these models to real
  samples; we *design* parameters from path shape. This is our adaptation.
  Judge by section 10, not by the paper's claims.

### 7.5 Page-level correlated drift (runtime, C)

Recipes (initial values, calibrate against section 10):
- Baseline: sum of 2-3 sines + value noise, sigma 0.2-0.5 mm, correlation length
  15-40 mm. Never white noise, never zero.
- Slant: page habit in [-2 deg, +12 deg], drift sigma 1.5-4 deg, correlation >= 20 mm.
- Size: CV 3-8% along line; spacing CV 5-12%, correlated with size (rho >= 0.4).
- Fatigue: size +3%/page, speed -5%/page, looseness +.
- Per-writer habit constant per page (from style + seed).
- Joins: Latin cursive tendency parameter adds short connecting strokes where
  the script allows; Burmese letters stand apart - drift only.

## 8. Text pipeline

### 8.1 Shaping

HarfBuzz, itemize by script (`hb_segment_properties`), shape runs separately,
merge. Engine works per **grapheme cluster**, never per code point. Ship one
Myanmar font + one Latin font *for shaping metrics only* (we render strokes,
not glyphs). Myanmar specifics the bank must cover: U+1031 reordering; stacking
via U+1039; medials U+103B-103E; kinzi (1004 103A 1039 + C); asat 103A; tone
marks 1037/1038. Blocks: U+1000-109F core; Extended-A/B (AA60-AA7F, A9E0-A9FF)
warn-and-skip in v1.

### 8.2 Reference corpus

`tests/corpus/myanmar.txt`: >= 200 strings covering every cluster type, digits
U+1040-1049, punctuation, mixed EN+MY lines, long words, tall stacks. Shaping
output diffed against HarfBuzz reference dumps; native speaker review at M7.

### 8.3 Line breaking (no runtime ICU)

Myanmar has no inter-word spaces; UAX #14 classifies it SA (dictionary-based).
- Offline: compile word dictionary -> DAWG (`data/dict/`). Source corpus license
  must be ledger-clean (VERIFY; avoid share-alike sources).
- Runtime: Knuth-Plass-lite cost breaker over clusters:
  `cost = raggedness^2 + lambda_syllable*(syllable breaks) - lambda_word*(word breaks)`,
  longest-match DAWG for word boundaries; syllable fallback = cluster boundaries
  (acceptable in Myanmar typesetting when no dictionary - VERIFY against UAX #14).
- English: standard space/hyphen breaking, same cost framework.

### 8.4 Line-fit (mixed scripts on one ruling)

Per line: from bank, compute max ink extent above/below baseline across clusters.
`required = maxAbove + maxBelow; available = ruling - 0.8 mm guard;
scale = min(1, available/required)`. Apply per-line scale. Writer habit may
compress below-baseline stacks 10-20% (real writers do). Latin x-height target
0.45-0.55x ruling; Myanmar base consonant ~0.5x ruling; common baseline.
Test matrix: every ruling x {EN, MY, mixed} x {short, long, tall-stack} goldens.

### 8.5 Zawgyi gate

Detect before shaping (myanmar-tools model port or rules: U+1031 stored before
consonant, medial ordering violations, U+1039/103A misuse). Confidence > 0.9 ->
refuse with "Zawgyi detected - convert to Unicode" + guidance. **Never silently
transcode** (corruption risk). Log detection stats.

## 9. Renderer

### 9.1 Passes (per tile, 1024^2)

1. **Composite pass** -> RGBA16F MSAA4x: paper albedo/normal/roughness/height +
   ink maps; analytic env gradient + one key light; height self-shadow (16-step
   march, 0.15 mm steps); cheap AO (blurred-height minus local); wrap-diffuse
   translucency. Single pass, no discard, no alpha overdraw.
2. **Post pass** -> RGBA8: 8-tap Poisson DoF (focus plane = page, slight tilt),
   blue-noise grain, vignette, lift/gamma/gain grade, optional homography warp
   for phone-photo perspective, sRGB out.
3. Resolve -> PBO `glReadPixels` + `glFenceSync` (overlap tiles) -> CPU stitch.

### 9.2 Ink model (initial constants, calibrate)

Coverage alpha from width-varying polyline SDF; thickness T = alpha*w*pressure.
- Absorption: `C = paper * exp(-k*T)` (Beer-Lambert), k per ink color.
- Edge darkening: `+ k_edge*|grad(alpha)|`.
- Bleed: anisotropic blur of T along paper fiber (sigma_par 0.12 mm, sigma_perp 0.04 mm).
- Pooling: `T *= 1 + a*max(0, h_blur - h_local)` (valleys pool, peaks thin).
- Gloss: GGX, roughness = mix(0.5, 0.15, T) where T > tau.
- Skips: pressure noise < tau_skip -> alpha * 0.2.

### 9.3 Mali rules (non-negotiable, kept from v2 + additions)

`precision highp float` everywhere (mediump = fp16 on Mali). Tile + CPU stitch
(watchdog). Fixed loops <= 32; short shaders; split heavy work. Query
`EXT_color_buffer_float` / `EXT_color_buffer_half_float`; prefer RGBA16F, else
RGBA8 + dither; never rely on 32F linear filtering. Clear every target at pass
start; `glInvalidateFramebuffer` after. GLES 3.0 baseline, graceful fallbacks.
Log `GL_RENDERER`, `GL_VERSION`, full compile logs every run. **Additions:**
PBO readback; 4x MSAA (cheap on Mali); small UBOs; no dependent texture reads
in shadow loop. ANGLE-on-Vulkan is the last-resort fallback only.

### 9.4 CI parity

llvmpipe != Mali. Two golden sets: llvmpipe (authoritative for PRs, tight
tolerance) and device (manual nightly, looser). At least one real Mali-G610
device tested from **M2 onward**, not M7.

## 10. Realism evaluation

### 10.1 Automated not-a-font checks (initial thresholds - calibrate, don't worship)

| # | Check | Metric | Initial target |
|---|---|---|---|
| 1 | No identical repeats | resample 64 pts, Procrustes align, min pairwise RMSD per grapheme | >= 0.05 x x-height |
| 2 | Baseline wander | residual RMS; spectral energy < 0.15 cyc/mm | 0.15-0.5 mm; >= 85% |
| 3 | Slant/size drift | sigma + correlation length | slant sigma 1.5-4 deg, >= 20 mm; size CV 3-8% |
| 4 | Width/darkness vary | within-stroke CV; blob/taper present | CV >= 0.12 |
| 5 | Spacing varies | CV, correlation with size | 5-12%, rho >= 0.4 |
| 6 | Off the ruled line | mean offset per writer | 0.1-0.8 mm, consistent + drift |
| 7 | No tofu / no shaping errors | corpus diff | 0 |

### 10.2 Human protocol (the real judge)

2AFC: 20 pairs (real photo crop vs synthetic crop, matched content/size),
10 naive viewers, 5 s per pair, randomized. Report detection rate + the single
worst tell per viewer. Ship gate <= 70%; > 80% blocks release. Owner's optional
handwriting photos (section 15) are the reference crops; without them, use any
license-clean real handwriting photos.

### 10.3 Font-tell taxonomy (fix in this order)

| Tell | Cause | Fix |
|---|---|---|
| Identical letters | no variants | bank + seeded choice (7.3) |
| Ruler-straight baseline | no drift | 7.5 |
| Uniform stroke width | font rendering | kinematics (7.4) |
| Mechanical spacing | grid layout | correlated jitter |
| Too-perfect curves | Bezier smoothness | curvature noise |
| Flat uniform ink | constant color | thickness model (9.2) |
| Paper too clean | no fiber/stains | material pipeline (6.4) |
| Flat lighting | no normals | raking-light maps |

## 11. Risk register

| Risk | L | I | Mitigation | Fallback trigger |
|---|---|---|---|---|
| Realism plateau | H | H | section 10 loop from M5; fix worst tell first | S1 > 80% after 2 rounds -> owner photos / learned model (M9) |
| Myanmar skeletons poor (stacks) | M | H | M3 spike before factory investment | SSIM < 0.90 on stacks -> manual stroke rules per glyph; reduce v1 cluster set |
| OFL derivative ambiguity | M | H | ledger + rename + OFL text; VERIFY FAQ at M0 | owner rejects -> Hershey-only Latin + commissioned strokes |
| Mali driver quirks | M | H | device smoke test at M2 | broken driver -> ANGLE (owner approval) |
| GPU watchdog kills | M | M | tiles, short submits | smaller tiles (512) |
| CI budget blown | M | M | hb amalgamation, preinstalled NDK, 150 DPI PR goldens | split nightly; still < 5 min PR |
| Dictionary license dirty | M | M | vet corpus at M0 | syllable-only breaking (acceptable, VERIFY) |
| Determinism drift | L | H | 5.4 + hash test every PR | freeze core math, re-baseline goldens |
| Asia data unverifiable | H | M | 6.3 protocol; placeholders flagged | ship ISO/US verified + MY/JP measured only |
| No human reviewers | M | M | recruit 10 at M5 | owner + agent side-by-side, lower confidence, say so |

## 12. Milestones (spike-first; rough effort)

| # | Milestone | Done when | Est. |
|---|---|---|---|
| M0 | Repo + CI + ledger skeleton | both jobs < 5 min; schemas land; OFL FAQ + dictionary license VERIFIED | 0.5 wk |
| M1 | Paper data + flat PNG | every size/ruling renders correct in mm @ 300 DPI (CPU); measurement protocol doc | 0.5 wk |
| M2 | Headless GLES paper **+ device smoke test** | lit normal-mapped paper on llvmpipe AND one real Mali-G610; tiles stitch; watchdog-safe | 1 wk |
| M3 | **Feasibility spike** | skeletonize 1 Latin font + Noto Myanmar; shape 20 mixed strings; quality report; GO/NO-GO on stack glyphs | 1 wk |
| M4 | Factory v0 (Latin) | 12-variant bank, kinematic profiles, ledger complete, OFL obligations met | 1.5 wk |
| M5 | Engine v0 | EN text -> strokes; checks 1-6 pass; goldens; determinism hash test green | 1.5 wk |
| M6 | Ink + post | 9.2 in shader; human round 1; honesty report names worst tell | 1 wk |
| M7 | Burmese + mixed | bank + line-fit + dictionary breaking + Zawgyi gate; full test matrix; human round 2; S3 = 0 errors | 1.5 wk |
| M8 | Android app | UI (EN+MY), seed/style controls, SAF save, <= 3 s/page, device goldens | 1 wk |
| M9 | Optional upgrade | only if owner supplies photos/data, or S1 stalls | - |

M3 is a gate: if Burmese skeletons fail quality, fix rules *before* building the
full factory, not after. M2 pulls device risk forward by 5 milestones vs v2.

## 13. CI and testing

### 13.1 Workflows

- `pr.yml`: Linux build + tests + 150 DPI goldens; Android assemble (preinstalled
  NDK, Gradle cache, ccache for hb); ledger lint (every asset row complete);
  determinism hash test.
- `nightly.yml`: 300 DPI goldens; ASan/UBSan + libFuzzer on `hw_synthesize`
  (10 min); device-test checklist issue.

### 13.2 Golden policy

llvmpipe set: >= 99.9% pixels |delta| <= 1, max <= 4, SSIM >= 0.99 (same driver should
be near-exact). Device set: >= 99.5% |delta| <= 2, max <= 8, SSIM >= 0.985. Every
renderer PR updates goldens + diff report or states why not. Golden updates
require review, never auto-commit.

## 14. Repo layout and ledger

```
/docs/        plan, LICENSES.md, measurements.md, honesty reports
/data/        paper/ styles/ strokes/ dict/ materials/
/tools/       synth/ eval/ photo/
/core/        C99 engine        /layout/  HarfBuzz glue
/render/      EGL+FBO+GLSL      /android/ Gradle+CMake+NDK
/tests/       corpus/ golden/   /third_party/ harfbuzz, stb, glm
/.github/workflows/
```

Ledger row template (lint-enforced):
`Asset | Type | Source URL | License | RFN | Derivative? | Obligations | Status`
Pre-fill: Noto Sans Myanmar, Padauk, Hershey, each Latin candidate font, stb,
glm, HarfBuzz, dictionary corpus, myanmar-tools, every texture. IAM On-Line
row exists with status **EXCLUDED**.

## 15. Owner decisions (defaults let the agent proceed; confirm or override)

| Question | Recommended default |
|---|---|
| Asia-Pacific scope v1 | Myanmar + Japan + India; China/TW in v1.1 |
| Ship OFL-derived stroke data | Yes, with ledger + rename + OFL text |
| minSdk / test device | 26; any Dimensity 8100 phone (e.g., Redmi Note 11T Pro / K50i class, VERIFY availability) |
| Resolution / time | 300 DPI; <= 3 s device, <= 20 s CI |
| Handwriting reference photos | Optional, ~10 min: 1 EN page + 1 MY page. Unlocks S1 reference crops and 6.4 photometric stereo |

## 16. Agent working rules

1. Verify every `data/` value; record source or measurement beside it.
2. Ledger before use. Never commit anything we can't redistribute.
3. Features small enough for < 5 min CI. Factory runs offline; outputs committed.
4. Every renderer change -> updated goldens + diff report.
5. No new runtime deps, no Vulkan, no engines without owner approval.
6. Measurement beats spec; update this file when it does.
7. **Honesty report every milestone:** what looks fake, the single largest
   remaining font tell, current S1 estimate, what you'd fix next. No optimism
   without evidence.
8. Spike gates (M3) are real gates. Do not build on an unproven foundation.

## 17. Sources (reliability-tagged; upgrade tags as verified)

Primary docs to consult first: ISO 216 / JIS P 0138 / GB/T 148 (sizes);
UAX #14 (breaking); HarfBuzz docs (Myanmar shaper); scripts.sil.org/OFL + FAQ;
ICU boundary analysis (offline reference); developer.arm.com Mali best practices;
github.com/google/myanmar-tools (Zawgyi detector); github.com/nothings/stb;
github.com/g-truc/glm.

Kept from v2 (tags added):
- Sigma-Lognormal synthesis (ICFHR2014) [paper] - iapr.org/archives/icfhr2014/.../ICFHR2014-Albo.pdf
- Trajectory design (IGS2017) [paper] - eprints-gro.gold.ac.uk/20757/...
- Human vs machine kinematics [paper, VERIFY peer-review] - arxiv.org/pdf/2601.11700v1
- GANwriting [paper] - ecva.net/papers/eccv_2020/.../123680273.pdf
- Font-based synthesis [thesis] - ddd.uab.cat/pub/tfg/2018/...
- Practical wobble notes [blog, low] - dev.to/alphashark/...
- Noto Sans Myanmar / Padauk OFL [primary] - fontsource.org/...; tug.ctan.org/fonts/padauk/README
- IAM On-Line terms [primary] - fki.tic.heia-fr.ch/... (EXCLUDED)
- BHDD / Myanmar Numeral Glyphs [dataset pages] - digits only, not trajectories
- Ruled paper [wiki/blog, low - replace by measurement] - en.wikipedia.org/wiki/Ruled_paper; madegooddesigns.com; help.tradeprint.co.uk
- Paper sizes [blog, low - replace by standards] - papersizes-net.pages.dev/chinese; leatai.com; blog.phidonpens.com; shinyyoustationery.com
- CC0 textures [list, low - verify per asset] - lilachbullock.com/...
- Mali specs/watchdog/framebuffers [secondary + primary Arm] - notebookcheck.net/...; community.arm.com/...; developer.arm.com/...
- GLES float caveats [docs] - doc.magnum.graphics/magnum/platforms-gl.html
- Headless EGL [PR, low] - github.com/commaai/raylib/pull/23

## Appendix A: glossary

Allograph (variant shape of a letter) - grapheme cluster - kinzi - Sigma-Lognormal -
Seyes - ruling - RFN (Reserved Font Name) - 2AFC (two-alternative forced choice) -
PBR - FBO - PBO - DAWG - SA (UAX #14 line-break class).
