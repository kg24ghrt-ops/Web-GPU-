/**
 * Paper templates — ruled, grid, dot-grid, graph, and blank formats.
 *
 * Each template defines: physical dimensions, margins, line spacing,
 * ruling positions, and colours. Templates reference a paper size but
 * carry their own margin/line/grid rules so the same paper size can
 * host multiple template styles.
 *
 * Ruled-paper measurements (verified against common school/stationery
 * specifications):
 *   - College ruled: 7.1 mm line spacing (9/32 in), 32 mm left margin
 *   - Wide ruled:    8.7 mm line spacing (11/32 in), 32 mm left margin
 *   - Narrow ruled:  6.4 mm line spacing (1/4 in),  25 mm left margin
 *   - Seyès (French): 8 mm heavy lines + 2 mm light guide lines
 *   - Asia notebook: ~8 mm line spacing
 *
 * Sources:
 *   - ISO 216:2007 / JIS P 0138:1998 (paper sizes)
 *   - Common stationery ruled-paper specifications
 */

import { getPaperSize } from './sizes.js';

/**
 * Paper template record.
 * @typedef {Object} PaperTemplate
 * @property {string} id - Unique identifier
 * @property {string} name - Human-readable name
 * @property {string} paperSizeId - Referenced paper size id
 * @property {string} type - 'ruled' | 'grid' | 'dot' | 'blank'
 * @property {number} marginMm - Left/right writing margin (mm)
 * @property {number} topMarginMm - Top margin (mm)
 * @property {number} bottomMarginMm - Bottom margin (mm)
 * @property {number} bindingMarginMm - Extra margin for binding (mm, default 0)
 * @property {number} lineSpacingMm - Baseline-to-baseline spacing for ruled (mm)
 * @property {number} gridSpacingMm - Grid cell size for grid/dot/graph (mm)
 * @property {string} lineColor - Colour of horizontal lines
 * @property {string} marginLineColor - Colour of the vertical margin line
 * @property {string} bgColor - Paper background colour
 * @property {boolean} showMarginLine - Whether to render the red margin line
 * @property {number} headerMarginMm - Space above first line (mm)
 * @property {number} footerMarginMm - Space below last line (mm)
 */

/**
 * College-ruled (7.1 mm / 9/32 in spacing, 32 mm left margin).
 * Standard for US college and high school notebooks.
 */
export const COLLEGE_RULED = {
  id: 'college-ruled',
  name: 'College Ruled',
  paperSizeId: 'us-letter',
  type: 'ruled',
  marginMm: 32,
  topMarginMm: 25,
  bottomMarginMm: 20,
  bindingMarginMm: 0,
  lineSpacingMm: 7.1,
  gridSpacingMm: 0,
  lineColor: '#bfdbfe',
  marginLineColor: '#b91c1c',
  bgColor: '#fdfbf7',
  showMarginLine: true,
  headerMarginMm: 10,
  footerMarginMm: 10,
};

/**
 * Wide-ruled (8.7 mm / 11/32 in spacing, 32 mm left margin).
 * Common in primary/elementary school notebooks.
 */
export const WIDE_RULED = {
  id: 'wide-ruled',
  name: 'Wide Ruled',
  paperSizeId: 'us-letter',
  type: 'ruled',
  marginMm: 32,
  topMarginMm: 25,
  bottomMarginMm: 20,
  bindingMarginMm: 0,
  lineSpacingMm: 8.7,
  gridSpacingMm: 0,
  lineColor: '#93c5fd',
  marginLineColor: '#b91c1c',
  bgColor: '#fdfbf7',
  showMarginLine: true,
  headerMarginMm: 10,
  footerMarginMm: 10,
};

/**
 * Narrow-ruled (6.4 mm / 1/4 in spacing, 25 mm left margin).
 * Used for compact note-taking.
 */
export const NARROW_RULED = {
  id: 'narrow-ruled',
  name: 'Narrow Ruled',
  paperSizeId: 'us-letter',
  type: 'ruled',
  marginMm: 25,
  topMarginMm: 20,
  bottomMarginMm: 15,
  bindingMarginMm: 0,
  lineSpacingMm: 6.4,
  gridSpacingMm: 0,
  lineColor: '#9ca3af',
  marginLineColor: '#b91c1c',
  bgColor: '#fdfbf7',
  showMarginLine: true,
  headerMarginMm: 8,
  footerMarginMm: 8,
};

/**
 * Asia B5 ruled (8 mm spacing, 25 mm margin).
 * Common JIS B5 notebook format used across East Asia.
 */
export const ASIA_B5_RULED = {
  id: 'asia-b5-ruled',
  name: 'Asia B5 Ruled',
  paperSizeId: 'jis-b5',
  type: 'ruled',
  marginMm: 25,
  topMarginMm: 25,
  bottomMarginMm: 20,
  bindingMarginMm: 0,
  lineSpacingMm: 8.0,
  gridSpacingMm: 0,
  lineColor: '#9ca3af',
  marginLineColor: '#b91c1c',
  bgColor: '#fdfbf7',
  showMarginLine: true,
  headerMarginMm: 10,
  footerMarginMm: 10,
};

/**
 * A4 college-ruled (7.1 mm spacing, 30 mm margin).
 * International A4 equivalent of college ruled.
 */
export const A4_COLLEGE_RULED = {
  id: 'a4-college-ruled',
  name: 'A4 College Ruled',
  paperSizeId: 'a4',
  type: 'ruled',
  marginMm: 30,
  topMarginMm: 25,
  bottomMarginMm: 20,
  bindingMarginMm: 0,
  lineSpacingMm: 7.1,
  gridSpacingMm: 0,
  lineColor: '#bfdbfe',
  marginLineColor: '#b91c1c',
  bgColor: '#fdfbf7',
  showMarginLine: true,
  headerMarginMm: 10,
  footerMarginMm: 10,
};

/**
 * Grid paper (5 mm grid).
 * Common for technical drawing and mathematics.
 */
export const GRID_5MM = {
  id: 'grid-5mm',
  name: '5 mm Grid',
  paperSizeId: 'a4',
  type: 'grid',
  marginMm: 20,
  topMarginMm: 20,
  bottomMarginMm: 20,
  bindingMarginMm: 0,
  lineSpacingMm: 0,
  gridSpacingMm: 5.0,
  lineColor: '#cbd5e1',
  marginLineColor: 'transparent',
  bgColor: '#ffffff',
  showMarginLine: false,
  headerMarginMm: 0,
  footerMarginMm: 0,
};

/**
 * Graph paper (10 mm grid with heavier 100 mm major lines).
 * Engineering/graph paper standard.
 */
export const GRAPH_10MM = {
  id: 'graph-10mm',
  name: '10 mm Graph',
  paperSizeId: 'a4',
  type: 'graph',
  marginMm: 20,
  topMarginMm: 20,
  bottomMarginMm: 20,
  bindingMarginMm: 0,
  lineSpacingMm: 0,
  gridSpacingMm: 10.0,
  lineColor: '#cbd5e1',
  marginLineColor: 'transparent',
  bgColor: '#ffffff',
  showMarginLine: false,
  headerMarginMm: 0,
  footerMarginMm: 0,
};

/**
 * Dot-grid paper (5 mm dots).
 * Popular for bullet journals and sketching.
 */
export const DOT_GRID_5MM = {
  id: 'dot-grid-5mm',
  name: '5 mm Dot Grid',
  paperSizeId: 'a5',
  type: 'dot',
  marginMm: 15,
  topMarginMm: 15,
  bottomMarginMm: 15,
  bindingMarginMm: 0,
  lineSpacingMm: 0,
  gridSpacingMm: 5.0,
  lineColor: '#cbd5e1',
  marginLineColor: 'transparent',
  bgColor: '#ffffff',
  showMarginLine: false,
  headerMarginMm: 0,
  footerMarginMm: 0,
};

/**
 * Blank paper — no ruling, no grid, no margin line.
 */
export const BLANK = {
  id: 'blank',
  name: 'Blank Paper',
  paperSizeId: 'a4',
  type: 'blank',
  marginMm: 0,
  topMarginMm: 0,
  bottomMarginMm: 0,
  bindingMarginMm: 0,
  lineSpacingMm: 0,
  gridSpacingMm: 0,
  lineColor: 'transparent',
  marginLineColor: 'transparent',
  bgColor: '#ffffff',
  showMarginLine: false,
  headerMarginMm: 0,
  footerMarginMm: 0,
};

/** All templates. */
export const ALL_TEMPLATES = [
  COLLEGE_RULED,
  WIDE_RULED,
  NARROW_RULED,
  ASIA_B5_RULED,
  A4_COLLEGE_RULED,
  GRID_5MM,
  GRAPH_10MM,
  DOT_GRID_5MM,
  BLANK,
];

/**
 * Look up a template by id.
 * @param {string} id - Template id
 * @returns {PaperTemplate | undefined}
 */
export function getTemplate(id) {
  return ALL_TEMPLATES.find(t => t.id === id);
}

/**
 * List all available templates.
 * @returns {PaperTemplate[]}
 */
export function listTemplates() {
  return ALL_TEMPLATES.map(t => ({ ...t }));
}

/**
 * Resolve the effective paper size for a template, falling back to the
 * template's declared paperSizeId.
 * @param {PaperTemplate} template - Template
 * @param {import('./sizes.js').PaperSize | undefined} overrideSize - Optional size override
 * @returns {import('./sizes.js').PaperSize | undefined}
 */
export function resolvePaperSize(template, overrideSize) {
  if (overrideSize) return overrideSize;
  return getPaperSize(template.paperSizeId);
}
