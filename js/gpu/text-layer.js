/**
 * GPU text layer — rasterizes wrapped page text (and the blinking caret) to a
 * 2D canvas that is uploaded as a texture and composited over the lit paper.
 *
 * The text canvas matches the render target resolution (page size for display,
 * export resolution for Save PNG) so text stays aligned with the ruling and
 * crisp relative to the rest of the page. Text is redrawn only when the text,
 * font, page size or caret visibility changes — not every frame.
 *
 * The same layoutText() used for rendering drives the caret position, so the
 * caret always sits exactly where a glyph is drawn.
 *
 * Mixed-script rendering: each line is segmented into script runs. Myanmar
 * runs are drawn whole so the canvas shaping engine correctly stacks
 * consonants, vowels, and diacritics (clusters are never split). Latin runs
 * are drawn cluster-by-cluster with per-glyph density variation for
 * handwritten realism.
 */

import { layoutText, caretPosition, graphemeClusters, containsMyanmar, isMyanmarCluster } from '../typography/typography.js';
import { PEN_MATERIALS } from './renderer.js';

/** Ink colour used for text and caret — same blue-black as the pen. */
export const TEXT_INK_COLOR = PEN_MATERIALS.ballpoint.color; // '#1a3a5c'

/**
 * Tiny deterministic hash from a position → 0..1, used for per-glyph variation
 * so repeated letters are not identical and redraws are stable.
 */
function glyphHash(x, y, i) {
  let h = (Math.floor(x) * 7391 + Math.floor(y) * 193 + i * 9773) | 0;
  h = (h ^ (h >> 16)) * 0x45d9f3b;
  h = (h ^ (h >> 16)) * 0x45d9f3b;
  h = h ^ (h >> 16);
  return (h >>> 0) / 4294967296;
}

/** Density range for per-glyph variation (kept subtle). */
const GLYPH_DENSITY_MIN = 0.90;
const GLYPH_DENSITY_MAX = 1.00;

/** Baseline drift range per glyph (px), varying slowly along the row. */
const BASELINE_DRIFT_MIN = 0.3;
const BASELINE_DRIFT_MAX = 0.8;

/** Slant range per glyph (degrees). */
const SLANT_MIN = -1.0;
const SLANT_MAX = 1.0;

/** Size jitter range per glyph (fraction of nominal size). */
const SIZE_MIN = 0.97;
const SIZE_MAX = 1.03;

/** Pressure range per glyph (fraction of nominal opacity). */
const PRESSURE_MIN = 0.85;
const PRESSURE_MAX = 1.00;

/**
 * Create an offscreen canvas for the text layer at the given CSS px size.
 * @param {number} w - Page width in CSS px
 * @param {number} h - Page height in CSS px
 * @returns {HTMLCanvasElement}
 */
export function createTextCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(w));
  canvas.height = Math.max(1, Math.floor(h));
  return canvas;
}

/**
 * Draw a run of clusters at (x, y). Myanmar runs are drawn whole to preserve
 * complex-script shaping; Latin runs are drawn cluster-by-cluster with
 * per-glyph density variation. Fractions (digit/digit) are rendered as stacked
 * glyphs: numerator above, slanted bar, denominator below.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text - Full line text (for slicing runs)
 * @param {number} x - Current x position
 * @param {number} y - Baseline y
 * @param {number} lineHeightPx - Line height for fraction stacking
 * @param {Array} clusters - Grapheme clusters of the line
 * @param {number} startIdx - First cluster index of the run
 * @param {number} endIdx - One-past-last cluster index of the run
 * @param {boolean} myanmar - Whether this run is Myanmar
 * @param {number} clusterIdx - Running cluster index (for density hash)
 * @returns {{x: number, clusterIdx: number}}
 */
function drawRun(ctx, text, x, y, lineHeightPx, lineOffsetPx, lineSpacingPx, clusters, startIdx, endIdx, myanmar, clusterIdx) {
  if (myanmar) {
    // Draw the whole Myanmar run at once so shaping (stacking, reordering)
    // is preserved and clusters are never split ("don't break the knees").
    const runText = text.slice(clusters[startIdx].start, clusters[endIdx - 1].end);
    ctx.fillText(runText, x, y);
    const gw = ctx.measureText(runText).width;
    return { x: x + gw, clusterIdx: clusterIdx + (endIdx - startIdx) };
  }

  // Check if this run is a fraction: digit / digit (3 clusters: num, /, den).
  if (endIdx - startIdx === 3) {
    const c0 = clusters[startIdx].text;
    const c1 = clusters[startIdx + 1].text;
    const c2 = clusters[startIdx + 2].text;
    if (/\d/.test(c0) && c1 === '/' && /\d/.test(c2)) {
      return drawFraction(ctx, c0, c2, x, y, lineHeightPx, lineOffsetPx, lineSpacingPx, clusterIdx);
    }
  }

  // Latin: draw cluster-by-cluster with realistic handwriting variation:
  // baseline drift, slant, size jitter, and pressure (opacity) per glyph.
  const fontSizePx = parseFloat(ctx.font) || 18;
  for (let j = startIdx; j < endIdx; j++) {
    const c = clusters[j];
    const gw = ctx.measureText(c.text).width;

    // Seeded per-glyph variation, stable across redraws.
    const density = GLYPH_DENSITY_MIN + glyphHash(x, y, clusterIdx) * (GLYPH_DENSITY_MAX - GLYPH_DENSITY_MIN);
    const drift = BASELINE_DRIFT_MIN + glyphHash(x + 1, y + 7, clusterIdx) * (BASELINE_DRIFT_MAX - BASELINE_DRIFT_MIN);
    const slantDeg = SLANT_MIN + glyphHash(x + 2, y + 13, clusterIdx) * (SLANT_MAX - SLANT_MIN);
    const size = SIZE_MIN + glyphHash(x + 3, y + 19, clusterIdx) * (SIZE_MAX - SIZE_MIN);
    const pressure = PRESSURE_MIN + glyphHash(x + 4, y + 25, clusterIdx) * (PRESSURE_MAX - PRESSURE_MIN);

    const glyphY = y + drift;
    const slantRad = (slantDeg * Math.PI) / 180.0;

    ctx.save();
    ctx.translate(x, glyphY);
    ctx.rotate(slantRad);
    ctx.scale(size, size);
    ctx.globalAlpha = density * pressure;
    ctx.fillText(c.text, 0, 0);
    ctx.restore();

    x += gw;
    clusterIdx++;
  }
  return { x, clusterIdx };
}

/**
 * Render a stacked fraction a/b: numerator above, slanted bar, denominator below.
 * The bar sits exactly on the nearest ruled line (computed from lineOffsetPx and
 * lineSpacingPx, the same values the ruling shader uses).
 * @returns {{x: number, clusterIdx: number}}
 */
function drawFraction(ctx, num, den, x, y, lineHeightPx, lineOffsetPx, lineSpacingPx, clusterIdx) {
  const scale = 0.68;
  const fontSizePx = parseFloat(ctx.font) || 18;
  const scaledSize = fontSizePx * scale;

  // Measure at full size, scale down for fraction (measureText scales linearly).
  const numW = ctx.measureText(num).width * scale;
  const denW = ctx.measureText(den).width * scale;
  const barW = Math.max(numW, denW) * 1.25;
  const barH = 1.2;

  // Snap barY to the nearest ruled line (same rule computation as the shader).
  const ruleY = lineOffsetPx + Math.round((y - lineOffsetPx) / lineSpacingPx) * lineSpacingPx;
  const barY = ruleY; // drift = 0: bar sits exactly on the rule

  // Ink realism: per-fraction variation (seeded by position).
  const density = GLYPH_DENSITY_MIN + glyphHash(x, y, clusterIdx) * (GLYPH_DENSITY_MAX - GLYPH_DENSITY_MIN);
  const slantDeg = SLANT_MIN + glyphHash(x + 2, y + 13, clusterIdx) * (SLANT_MAX - SLANT_MIN);
  const size = SIZE_MIN + glyphHash(x + 3, y + 19, clusterIdx) * (SIZE_MAX - SIZE_MIN);
  const pressure = PRESSURE_MIN + glyphHash(x + 4, y + 25, clusterIdx) * (PRESSURE_MAX - PRESSURE_MIN);
  const slantRad = (slantDeg * Math.PI) / 180.0;

  const gap = 2;
  const numY = barY - gap; // numerator baseline about one gap above the bar
  const denY = barY + scaledSize * 0.55 + gap; // denominator baseline below the bar

  // Numerator (right-aligned over bar).
  ctx.save();
  ctx.translate(x + barW - numW, numY);
  ctx.rotate(slantRad);
  ctx.scale(size, size);
  ctx.globalAlpha = density * pressure;
  ctx.fillText(num, 0, 0);
  ctx.restore();

  // Slanted bar on the rule line.
  ctx.save();
  ctx.translate(x, barY);
  ctx.rotate(slantRad);
  ctx.globalAlpha = density * pressure;
  ctx.fillRect(0, -barH / 2, barW, barH);
  ctx.restore();

  // Denominator (right-aligned under bar).
  ctx.save();
  ctx.translate(x + barW - denW, denY);
  ctx.rotate(slantRad);
  ctx.scale(size, size);
  ctx.globalAlpha = density * pressure;
  ctx.fillText(den, 0, 0);
  ctx.restore();

  return { x: x + barW, clusterIdx: clusterIdx + 3 };
}

/**
 * Rasterize wrapped text (and optionally the caret) onto the text canvas.
 * @param {HTMLCanvasElement} canvas - Offscreen text canvas
 * @param {string} text - Page text
 * @param {Object} fontSpec - { family, sizePx }
 * @param {number} widthPx - Wrap width in CSS px
 * @param {number} lineHeightPx - Line height in CSS px (one ruling interval)
 * @param {number} originX - Writing area origin X in CSS px
 * @param {number} originY - Writing area origin Y in CSS px (first baseline)
 * @param {number} [caretX] - Caret X in CSS px (null to hide caret)
 * @param {number} [caretLineY] - Caret baseline Y in CSS px
 * @param {boolean} [caretVisible] - Whether the caret is currently visible
 */
export function rasterizeText(canvas, text, fontSpec, widthPx, lineHeightPx, lineOffsetPx, lineSpacingPx, originX, originY,
                              caretX = null, caretLineY = null, caretVisible = true) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const { lines } = layoutText(text, fontSpec, widthPx);
  const sizePx = fontSpec.sizePx || 18;
  ctx.font = sizePx + 'px "' + fontSpec.family + '"';
  ctx.fillStyle = TEXT_INK_COLOR;
  ctx.textBaseline = 'alphabetic';

  let idx = 0;
  for (const line of lines) {
    const y = originY + idx * lineHeightPx;
    const clusters = graphemeClusters(line.text);

    // Segment line into script runs and draw each appropriately.
    let runStart = 0;
    let runIsMy = clusters.length > 0 ? isMyanmarCluster(clusters[0].text) : false;
    let x = originX;
    let clusterIdx = 0;

    for (let j = 0; j < clusters.length; j++) {
      const cMy = isMyanmarCluster(clusters[j].text);
      if (cMy !== runIsMy) {
        // End current run, start a new one.
        const res = drawRun(ctx, line.text, x, y, lineHeightPx, lineOffsetPx, lineSpacingPx, clusters, runStart, j, runIsMy, clusterIdx);
        x = res.x;
        clusterIdx = res.clusterIdx;
        runStart = j;
        runIsMy = cMy;
      }
    }
    // Draw the final run.
    if (clusters.length > 0) {
      const res = drawRun(ctx, line.text, x, y, lineHeightPx, lineOffsetPx, lineSpacingPx, clusters, runStart, clusters.length, runIsMy, clusterIdx);
      x = res.x;
    }

    idx++;
  }

  // Caret: vertical line centred on the current line's baseline, blinking via caretVisible.
  if (caretVisible && caretX != null && caretLineY != null) {
    const caretWidth = 1.5;
    const caretHeight = Math.max(6, lineHeightPx * 0.85);
    const caretY = caretLineY - caretHeight * 0.75;
    ctx.fillRect(caretX, caretY, caretWidth, caretHeight);
  }

  return canvas;
}

/**
 * Recompute caret X/Y from the same layout used for rendering.
 * @returns {{x:number,y:number,lineIndex:number} | null}
 */
export function caretAt(text, fontSpec, widthPx, lineHeightPx, originX, originY, offset) {
  return caretPosition(text, fontSpec, widthPx, lineHeightPx, originX, originY, offset);
}
