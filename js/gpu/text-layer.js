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
 */

import { layoutText, caretPosition, graphemeClusters, containsMyanmar } from '../typography/typography.js';
import { PEN_MATERIALS } from './renderer.js';

/** Ink colour used for text and caret — same blue-black as the pen. */
export const TEXT_INK_COLOR = PEN_MATERIALS.ballpoint.color; // '#1a3a5c'

/**
 * Tiny deterministic hash from a position → 0..1, used for per-glyph density
 * variation so repeated letters are not identical.
 */
function glyphHash(x, y, i) {
  let h = (Math.floor(x) * 7391 + Math.floor(y) * 193 + i * 9773) | 0;
  h = (h ^ (h >> 16)) * 0x45d9f3b;
  h = (h ^ (h >> 16)) * 0x45d9f3b;
  h = h ^ (h >> 16);
  return (h >>> 0) / 4294967296;
}

/** Density range for per-glyph variation (kept subtle). */
const GLYPH_DENSITY_MIN = 0.93;
const GLYPH_DENSITY_MAX = 1.00;

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
export function rasterizeText(canvas, text, fontSpec, widthPx, lineHeightPx, originX, originY,
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

  const myanmar = containsMyanmar(text);

  let idx = 0;
  for (const line of lines) {
    const y = originY + idx * lineHeightPx;
    if (myanmar) {
      // Draw the whole line at once so the canvas shaping engine can correctly
      // stack and position Myanmar consonants, vowels, and diacritics.
      ctx.fillText(line.text, originX, y);
    } else {
      // Latin: draw cluster-by-cluster for per-glyph density variation.
      let x = originX;
      const clusters = graphemeClusters(line.text);
      clusters.forEach((c, clusterIdx) => {
        const density = GLYPH_DENSITY_MIN + glyphHash(x, y, clusterIdx) * (GLYPH_DENSITY_MAX - GLYPH_DENSITY_MIN);
        const gw = ctx.measureText(c.text).width;
        ctx.globalAlpha = density;
        ctx.fillText(c.text, x, y);
        ctx.globalAlpha = 1.0;
        x += gw;
      });
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
