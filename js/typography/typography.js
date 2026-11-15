/**
 * Typography — font loading and a single shared text layout algorithm.
 *
 * Fonts (SIL Open Font License 1.1, licence text next to each file in /fonts):
 *   - Handlee (Regular)            — English handwriting (default)
 *   - Patrick Hand (Regular)       — English handwriting alternative
 *   - Padauk (Regular / Bold)      — Myanmar (default)
 *   - Noto Sans Myanmar (Regular)  — Myanmar alternative
 *
 * One layout function, layoutText(text, fontSpec, widthPx), wraps lines using
 * canvas measureText and is used for BOTH the GPU-rendered text and the caret
 * position, so they always match.
 *
 * Wrapping rules:
 *   - English: break at spaces.
 *   - Myanmar: no spaces between words. Break at phrase boundaries (spaces and
 *     zero-width spaces) and fall back to grapheme breaks via Intl.Segmenter.
 *   - Never break inside a grapheme cluster.
 *   - Mixed English+Myanmar lines: each script run is measured appropriately
 *     (Latin per-cluster, Myanmar cumulatively) so both scripts wrap and
 *     render correctly on the same line.
 */

import { mmToPx } from '../units.js';

const FONT_BASE = 'fonts';

/** Registered web fonts. */
export const FONT_SPEC = {
  handlee: {
    id: 'handlee',
    label: 'Handwriting (English)',
    family: 'Handlee',
    file: `${FONT_BASE}/handlee-regular.woff2`,
    weight: 400,
    script: 'latin',
  },
  'patrick-hand': {
    id: 'patrick-hand',
    label: 'Patrick Hand',
    family: 'Patrick Hand',
    file: `${FONT_BASE}/patrick-hand-regular.woff2`,
    weight: 400,
    script: 'latin',
  },
  padauk: {
    id: 'padauk',
    label: 'Myanmar',
    family: 'Padauk',
    file: `${FONT_BASE}/padauk-regular.woff2`,
    weight: 400,
    script: 'myanmar',
  },
  'padauk-bold': {
    id: 'padauk-bold',
    label: 'Padauk Bold',
    family: 'Padauk',
    file: `${FONT_BASE}/padauk-bold.woff2`,
    weight: 700,
    script: 'myanmar',
  },
  'noto-sans-myanmar': {
    id: 'noto-sans-myanmar',
    label: 'Noto Sans Myanmar',
    family: 'Noto Sans Myanmar',
    file: `${FONT_BASE}/noto-sans-myanmar-regular.woff2`,
    weight: 400,
    script: 'myanmar',
  },
};

/** Default font choice per language, stored per notebook. */
export const DEFAULT_FONT = { english: 'handlee', myanmar: 'padauk' };

/** Legacy defaults kept for the hidden contenteditable fallback stack. */
export const FONT_SIZE = '18px';
export const LINE_HEIGHT = 1.6;
export const FONT_FAMILY = "'Noto Serif Myanmar','Noto Sans Myanmar','Myanmar Text','Segoe UI Symbol',Arial,sans-serif";

export function fontCss() {
  return `font-family:${FONT_FAMILY};font-size:${FONT_SIZE};line-height:${LINE_HEIGHT};`;
}

const MYANMAR = /[\u1000-\u109F\uA9E0-\uA9FF]/;
export function containsMyanmar(text) {
  return MYANMAR.test(String(text));
}

/** True if a single character is in the Myanmar Unicode block. */
export function isMyanmarChar(ch) {
  return MYANMAR.test(String(ch));
}

/** True if a grapheme cluster contains any Myanmar character. */
export function isMyanmarCluster(clusterText) {
  return MYANMAR.test(String(clusterText));
}

/** Resolve a font spec object from a font id (+ optional override size). */
export function resolveFont(id, sizePx) {
  const spec = FONT_SPEC[id] || FONT_SPEC.handlee;
  return { ...spec, sizePx: sizePx != null ? sizePx : 18 };
}

/** Pick the font id for a script given the user's per-notebook choice. */
export function fontIdForScript(script, fontChoice) {
  if (fontChoice && FONT_SPEC[fontChoice]) return fontChoice;
  return script === 'myanmar' ? DEFAULT_FONT.myanmar : DEFAULT_FONT.english;
}

let _fontsRegistered = false;

/** Inject @font-face rules (font-display: block) into the document head. */
export function registerFonts() {
  if (_fontsRegistered || typeof document === 'undefined') return;
  _fontsRegistered = true;
  const rules = Object.values(FONT_SPEC).map((s) => {
    const url = String(s.file).replace(/"/g, '\\"');
    return (
      '@font-face {\n' +
      `  font-family: "${s.family}";\n` +
      `  font-style: normal;\n` +
      `  font-weight: ${s.weight};\n` +
      '  font-display: block;\n' +
      `  src: url("${url}") format("woff2");\n` +
      '}'
    );
  }).join('\n');
  const style = document.createElement('style');
  style.textContent = rules;
  document.head.insertBefore(style, document.head.firstChild);
}

/** Load the user's chosen English + Myanmar fonts and wait for both. */
export async function loadFonts(fontChoice = DEFAULT_FONT) {
  registerFonts();
  if (typeof document === 'undefined' || !document.fonts) return;
  const size = FONT_SIZE;
  const tasks = [];
  for (const key of ['english', 'myanmar']) {
    const id = fontChoice && fontChoice[key] ? fontChoice[key] : DEFAULT_FONT[key];
    const spec = FONT_SPEC[id];
    if (spec) {
      tasks.push(document.fonts.load(`${size} "${spec.family}"`).catch(() => {
        // Font unavailable; continue with the fallback stack.
      }));
    }
  }
  await Promise.all(tasks);
}

/** Backwards-compatible loader kept for callers that only need fonts ready. */
export async function ensureFonts() {
  if (typeof document === 'undefined' || !document.fonts) return;
  try { await document.fonts.ready; } catch { /* fonts unavailable; continue */ }
}

/* ------------------------------------------------------------------ */
/* Text measurement                                                   */
/* ------------------------------------------------------------------ */

let _canvas = null;
let _measureOverride = null;

/** Inject a deterministic measurer (used by unit tests without a canvas). */
export function setTextMeasurer(fn) { _measureOverride = fn; }

function measureContext() {
  if (!_canvas) _canvas = document.createElement('canvas');
  return _canvas.getContext('2d');
}

function measureText(text, fontSpec) {
  if (_measureOverride) return _measureOverride(text, fontSpec);
  const ctx = measureContext();
  ctx.font = `${fontSpec.sizePx || 18}px "${fontSpec.family}"`;
  return ctx.measureText(String(text)).width;
}

/* ------------------------------------------------------------------ */
/* Grapheme segmentation                                              */
/* ------------------------------------------------------------------ */

// Break-opportunity characters: spaces, zero-width spaces, and Myanmar
// phrase-boundary punctuation (comma U+104A, full stop U+104B). Myanmar has no
// inter-word spaces, so these punctuation marks are the primary break points.
// The break happens AFTER the punctuation character (it stays on the current line).
const BREAK_CHARS = /[\u0020\u200B\u104A\u104B]/;

export function graphemeClusters(text) {
  const clusters = [];
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    try {
      // Use Burmese locale for Myanmar text so complex-script clusters
      // (stacked consonants, vowels, diacritics) segment correctly.
      const locale = containsMyanmar(text) ? 'my' : 'en';
      const segmenter = new Intl.Segmenter(locale, { granularity: 'grapheme' });
      let pos = 0;
      for (const { segment, index } of segmenter.segment(text)) {
        const start = index != null ? index : pos;
        clusters.push({ text: segment, start, end: start + segment.length });
        pos = start + segment.length;
      }
      if (clusters.length > 0) return clusters;
    } catch { /* fall back to code-point splitting below */ }
  }
  let pos = 0;
  for (const ch of Array.from(String(text))) {
    clusters.push({ text: ch, start: pos, end: pos + ch.length });
    pos += ch.length;
  }
  return clusters;
}

/* ------------------------------------------------------------------ */
/* Line wrapping                                                      */
/* ------------------------------------------------------------------ */

/** Wrap a single hard line (no embedded newlines) into visual lines. */
function wrapHard(text, widthPx, font) {
  if (text.length === 0) return [{ text: '', width: 0, start: 0, end: 0 }];
  const clusters = graphemeClusters(text);
  const lines = [];
  let lineStart = 0;          // character offset where current line begins
  let lineText = '';
  let lineWidth = 0;
  let lastBreak = -1;         // character offset (exclusive) after last break opp.
  let lastBreakText = '';
  let lastBreakWidth = 0;

  // Script-run tracking for mixed-script lines.
  // baseWidth  = locked-in width of all completed script runs before current run
  // runStart   = character offset where current script run begins
  // runIsMy    = whether current run is Myanmar
  // runWidth   = width of current script run (measured appropriately per script)
  let baseWidth = 0;
  let runStart = 0;
  let runIsMy = false;
  let runWidth = 0;

  let i = 0;
  while (i < clusters.length) {
    const c = clusters[i];
    const cMy = isMyanmarCluster(c.text);

    // When script changes, lock in the previous run and start a new one.
    if (i > 0 && cMy !== runIsMy) {
      baseWidth += runWidth;
      runStart = c.start;
      runIsMy = cMy;
      runWidth = measureText(c.text, font);
    } else if (cMy) {
      // Myanmar: measure cumulatively from run start (complex-script shaping).
      runWidth = measureText(text.slice(runStart, c.end), font);
    } else {
      // Latin: add individual cluster width.
      runWidth += measureText(c.text, font);
    }

    lineWidth = baseWidth + runWidth;

    const isBreak = BREAK_CHARS.test(c.text);
    if (lineWidth <= widthPx || lineText === '') {
      lineText += c.text;
      if (isBreak) {
        lastBreak = c.end;
        lastBreakText = lineText;
        lastBreakWidth = lineWidth;
      }
      i++;
    } else if (lastBreak > lineStart) {
      // Break at the last phrase/space/punctuation opportunity.
      const breakTarget = lastBreak;
      lines.push({ text: lastBreakText, width: lastBreakWidth, start: lineStart, end: breakTarget });
      lineStart = breakTarget;
      lineText = '';
      lineWidth = 0;
      lastBreak = -1;
      baseWidth = 0;
      runStart = lineStart;
      runIsMy = false;
      runWidth = 0;
      // Re-process from the break target on the fresh line.
      i = clusters.findIndex(cl => cl.start >= breakTarget);
      if (i === -1) i = clusters.length;
    } else if (isBreak) {
      // The break character itself doesn't fit on this line and there is no
      // earlier break point: include it on this line and break after it.
      lineText += c.text;
      lines.push({ text: lineText, width: lineWidth, start: lineStart, end: c.end });
      lineStart = c.end;
      lineText = '';
      lineWidth = 0;
      lastBreak = -1;
      baseWidth = 0;
      runStart = lineStart;
      runIsMy = false;
      runWidth = 0;
      i++;
    } else {
      // No break opportunity on this line: finalise it and start a new line
      // with the current cluster (breaks at grapheme boundaries only).
      lines.push({ text: lineText, width: lineWidth, start: lineStart, end: c.start });
      lineStart = c.start;
      lineText = '';
      lineWidth = 0;
      lastBreak = -1;
      baseWidth = 0;
      runStart = lineStart;
      runIsMy = false;
      runWidth = 0;
    }
  }
  if (lineText !== '' || lines.length === 0) {
    lines.push({ text: lineText, width: lineWidth, start: lineStart, end: text.length });
  }
  return lines;
}

/**
 * Wrap text into visual lines using canvas measureText.
 * @param {string} text - Source text (may contain '\n' hard breaks).
 * @param {Object} fontSpec - { family, sizePx } used for measurement.
 * @param {number} widthPx - Max line width in CSS px.
 * @returns {Object} { lines: [{ text, width, start, end }], lineCount, widthPx, fontSpec }
 */
export function layoutText(text, fontSpec, widthPx) {
  const font = fontSpec || { family: FONT_FAMILY, sizePx: 18 };
  const width = Math.max(1, Math.floor(widthPx));
  const hardLines = String(text).split('\n');
  const lines = [];
  let charBase = 0;
  for (const hard of hardLines) {
    const wrapped = wrapHard(hard, width, font);
    for (const w of wrapped) {
      lines.push({ text: w.text, width: w.width, start: charBase + w.start, end: charBase + w.end });
    }
    charBase += hard.length + 1; // +1 accounts for the split '\n'
  }
  return { lines, lineCount: lines.length, widthPx: width, fontSpec: font };
}

/**
 * Caret position for a character offset, computed from the same layout used to
 * render, so the caret always sits where the glyph is.
 * @returns {Object} { x, y, lineIndex, lineHeightPx } or null when offset is out of range.
 */
export function caretPosition(text, fontSpec, widthPx, lineHeightPx, originX, originY, offset) {
  const { lines } = layoutText(text, fontSpec, widthPx);
  const n = String(text).length;
  const o = Math.min(Math.max(offset, 0), n);
  let lineIndex = 0;
  let target = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (o >= line.start && o <= line.end) {
      target = line;
      lineIndex = i;
      break;
    }
  }
  if (!target) return null;
  const before = String(text).slice(target.start, o);
  const x = originX + measureText(before, fontSpec);
  const y = originY + lineIndex * lineHeightPx;
  return { x, y, lineIndex, lineHeightPx };
}
