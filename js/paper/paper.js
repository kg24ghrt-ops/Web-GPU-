// DEPRECATED — Canvas 2D paper path.
//
// This module is no longer used by the live renderer. The page image is now
// produced entirely by the WebGPU pipeline (js/gpu/renderer.js + WGSL shaders).
// Canvas 2D is not used as a primary or fallback renderer for the page.
//
// Kept only so existing unit tests (test/paper.test.js) continue to run;
// new code should import from js/paper/templates.js, js/paper/sizes.js and
// js/units.js instead.

const MM_TO_PX = 96 / 25.4;
const templates = {
  'asia-b5-ruled': { id: 'asia-b5-ruled', name: 'Asia B5 Ruled', widthMm: 182, heightMm: 257, marginMm: 25, topMarginMm: 25, bottomMarginMm: 20, lineSpacingMm: 8, lineColor: '#9ca3af', marginLineColor: '#b91c1c', bgColor: '#fdfbf7' },
  'school-ruled': { id: 'school-ruled', name: 'School Writing Paper', widthMm: 216, heightMm: 279, marginMm: 32, topMarginMm: 25, bottomMarginMm: 20, lineSpacingMm: 7.1, lineColor: '#bfdbfe', marginLineColor: '#b91c1c', bgColor: '#fdfbf7' },
  'blank': { id: 'blank', name: 'Blank Paper', widthMm: 216, heightMm: 279, marginMm: 0, lineSpacingMm: 0, lineColor: 'transparent', marginLineColor: 'transparent', bgColor: '#ffffff' },
};
export function getTemplate(id) {
  const t = templates[id];
  if (!t) throw new Error(`paper: unknown template "${id}"`);
  return { ...t };
}
export function listTemplates() {
  return Object.values(templates).map(t => ({ id: t.id, name: t.name }));
}
export function mmToPx(mm) { return mm * MM_TO_PX; }
export function renderPaper(ctx, rect, template) {
  const { x, y, w, h } = rect;
  ctx.fillStyle = template.bgColor;
  ctx.fillRect(x, y, w, h);
  if (template.lineSpacingMm <= 0) return;
  ctx.strokeStyle = template.lineColor;
  ctx.lineWidth = 1;
  const spacing = template.lineSpacingMm * MM_TO_PX;
  const topMargin = template.topMarginMm ?? 25;
  const bottomMargin = template.bottomMarginMm ?? 20;
  const leftMargin = template.marginMm;
  const bottom = y + h - bottomMargin * MM_TO_PX;
  let ly = y + topMargin * MM_TO_PX;
  ctx.beginPath();
  while (ly <= bottom) { ctx.moveTo(x, ly); ctx.lineTo(x + w, ly); ly += spacing; }
  ctx.stroke();
  ctx.beginPath();
  const mx = x + leftMargin * MM_TO_PX;
  ctx.strokeStyle = template.marginLineColor ?? template.lineColor;
  ctx.lineWidth = 1.2;
  ctx.moveTo(mx, y); ctx.lineTo(mx, y + h);
  ctx.stroke();
}
