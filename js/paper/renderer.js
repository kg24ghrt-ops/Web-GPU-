/**
 * Paper renderer — canvas-based physical paper rendering.
 *
 * Renders a physical sheet of paper onto an HTML canvas using millimetre
 * measurements converted to CSS reference pixels (96 dpi). The canvas
 * bitmap matches the display size at 1:1 so handwriting and text
 * coordinates stay pixel-accurate to the sheet.
 *
 * Responsibilities (paper subsystem only):
 *   - Paper background colour
 *   - Horizontal ruled lines at exact baselines
 *   - Red vertical margin line
 *   - Grid / dot-grid patterns
 *   - Header/footer spacing
 *   - Binding margin offset
 *
 * Does NOT handle text editing, handwriting strokes, or page flow —
 * those are owned by the editor and handwriting subsystems.
 */

import { mmToPx, snapPx } from '../units.js';
import { getPaperSize } from './sizes.js';
import { resolvePaperSize } from './templates.js';

/**
 * Rendering context for a paper sheet.
 * @typedef {Object} PaperRenderRect
 * @property {number} x - Left edge in CSS px
 * @property {number} y - Top edge in CSS px
 * @property {number} w - Width in CSS px
 * @property {number} h - Height in CSS px
 * @property {number} widthMm - Physical width in mm
 * @property {number} heightMm - Physical height in mm
 */

/**
 * Render a paper sheet onto a canvas.
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
 * @param {PaperRenderRect} rect - Destination rect in CSS px
 * @param {import('./templates.js').PaperTemplate} template - Paper template
 * @param {import('./sizes.js').PaperSize | undefined} paperSize - Optional paper size override
 * @returns {PaperRenderRect} The rendered rect (same as input)
 */
export function renderPaper(ctx, rect, template, paperSize) {
  const { x, y, w, h } = rect;
  const size = paperSize || resolvePaperSize(template, getPaperSize(template.paperSizeId));

  // 1. Paper background
  ctx.fillStyle = template.bgColor;
  ctx.fillRect(x, y, w, h);

  if (template.type === 'blank') return;

  // 2. Compute writing area (margins subtracted from page)
  const leftMarginPx = snapPx(mmToPx(template.marginMm));
  const rightMarginPx = snapPx(mmToPx(template.marginMm));
  const topMarginPx = snapPx(mmToPx(template.topMarginMm));
  const bottomMarginPx = snapPx(mmToPx(template.bottomMarginMm));
  const bindingMarginPx = snapPx(mmToPx(template.bindingMarginMm || 0));

  const writeLeft = x + leftMarginPx + bindingMarginPx;
  const writeRight = x + w - rightMarginPx;
  const writeTop = y + topMarginPx;
  const writeBottom = y + h - bottomMarginPx;

  // 3. Ruled lines
  if (template.type === 'ruled' && template.lineSpacingMm > 0) {
    renderRuledLines(ctx, {
      x: writeLeft,
      y: writeTop,
      w: writeRight - writeLeft,
      h: writeBottom - writeTop,
    }, template);
  }

  // 4. Grid
  if (template.type === 'grid' && template.gridSpacingMm > 0) {
    renderGrid(ctx, {
      x: writeLeft,
      y: writeTop,
      w: writeRight - writeLeft,
      h: writeBottom - writeTop,
    }, template);
  }

  // 5. Dot grid
  if (template.type === 'dot' && template.gridSpacingMm > 0) {
    renderDotGrid(ctx, {
      x: writeLeft,
      y: writeTop,
      w: writeRight - writeLeft,
      h: writeBottom - writeTop,
    }, template);
  }

  // 6. Graph (grid with heavier major lines every 10 cells)
  if (template.type === 'graph' && template.gridSpacingMm > 0) {
    renderGraph(ctx, {
      x: writeLeft,
      y: writeTop,
      w: writeRight - writeLeft,
      h: writeBottom - writeTop,
    }, template);
  }

  // 7. Red margin line
  if (template.showMarginLine && template.marginLineColor !== 'transparent') {
    const mx = x + leftMarginPx + bindingMarginPx;
    ctx.strokeStyle = template.marginLineColor;
    ctx.lineWidth = snapPx(mmToPx(1.2));
    ctx.beginPath();
    ctx.moveTo(mx, y);
    ctx.lineTo(mx, y + h);
    ctx.stroke();
  }

  return rect;
}

/**
 * Render horizontal ruled lines across the writing area.
 */
function renderRuledLines(ctx, rect, template) {
  const { x, y, w, h } = rect;
  const spacingPx = snapPx(mmToPx(template.lineSpacingMm));
  const lineWidthPx = snapPx(mmToPx(0.5));

  ctx.strokeStyle = template.lineColor;
  ctx.lineWidth = lineWidthPx;

  ctx.beginPath();
  let ly = y;
  while (ly <= y + h) {
    ctx.moveTo(x, ly);
    ctx.lineTo(x + w, ly);
    ly += spacingPx;
  }
  ctx.stroke();
}

/**
 * Render a light grid across the writing area.
 */
function renderGrid(ctx, rect, template) {
  const { x, y, w, h } = rect;
  const spacingPx = snapPx(mmToPx(template.gridSpacingMm));
  const lineWidthPx = snapPx(mmToPx(0.3));

  ctx.strokeStyle = template.lineColor;
  ctx.lineWidth = lineWidthPx;

  ctx.beginPath();
  // Vertical lines
  let lx = x;
  while (lx <= x + w) {
    ctx.moveTo(lx, y);
    ctx.lineTo(lx, y + h);
    lx += spacingPx;
  }
  // Horizontal lines
  let ly = y;
  while (ly <= y + h) {
    ctx.moveTo(x, ly);
    ctx.lineTo(x + w, ly);
    ly += spacingPx;
  }
  ctx.stroke();
}

/**
 * Render a dot grid across the writing area.
 */
function renderDotGrid(ctx, rect, template) {
  const { x, y, w, h } = rect;
  const spacingPx = snapPx(mmToPx(template.gridSpacingMm));
  const dotRadiusPx = snapPx(mmToPx(0.4));

  ctx.fillStyle = template.lineColor;

  let lx = x;
  while (lx <= x + w) {
    let ly = y;
    while (ly <= y + h) {
      ctx.beginPath();
      ctx.arc(lx, ly, dotRadiusPx, 0, Math.PI * 2);
      ctx.fill();
      ly += spacingPx;
    }
    lx += spacingPx;
  }
}

/**
 * Render graph paper: light grid with heavier major lines every 10 cells.
 */
function renderGraph(ctx, rect, template) {
  const { x, y, w, h } = rect;
  const spacingPx = snapPx(mmToPx(template.gridSpacingMm));
  const minorWidthPx = snapPx(mmToPx(0.3));
  const majorWidthPx = snapPx(mmToPx(0.7));
  const majorInterval = 10;

  // Minor grid
  ctx.strokeStyle = template.lineColor;
  ctx.lineWidth = minorWidthPx;
  ctx.beginPath();

  let lx = x;
  let majorCount = 0;
  while (lx <= x + w) {
    ctx.moveTo(lx, y);
    ctx.lineTo(lx, y + h);
    lx += spacingPx;
    majorCount++;
  }

  let ly = y;
  while (ly <= y + h) {
    ctx.moveTo(x, ly);
    ctx.lineTo(x + w, ly);
    ly += spacingPx;
  }
  ctx.stroke();

  // Major lines (every 10th cell, heavier)
  ctx.lineWidth = majorWidthPx;
  ctx.beginPath();

  lx = x;
  majorCount = 0;
  while (lx <= x + w) {
    if (majorCount % majorInterval === 0) {
      ctx.moveTo(lx, y);
      ctx.lineTo(lx, y + h);
    }
    lx += spacingPx;
    majorCount++;
  }

  ly = y;
  majorCount = 0;
  while (ly <= y + h) {
    if (majorCount % majorInterval === 0) {
      ctx.moveTo(x, ly);
      ctx.lineTo(x + w, ly);
    }
    ly += spacingPx;
    majorCount++;
  }
  ctx.stroke();
}
