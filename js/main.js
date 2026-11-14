import { App } from './core/app.js';
import { logger } from './common/logger.js';
import { wrap } from './common/errors.js';
import { Settings } from './settings/settings.js';
import { Storage } from './storage/storage.js';
import { Notebook } from './notebook/notebook.js';
import { mmToPx } from './units.js';
import { getTemplate, listTemplates } from './paper/templates.js';
import { getPaperSize } from './paper/sizes.js';
import { ensureFonts, FONT_FAMILY, FONT_SIZE, LINE_HEIGHT } from './typography/typography.js';
import { TextEditor } from './editor/text-editor.js';
import { Stroke } from './handwriting/handwriting.js';
import { WebGpuRenderer, PEN_MATERIALS } from './gpu/renderer.js';
import { WebGL2Renderer } from './gpu/webgl2.js';

const $ = (sel, root = document) => root.querySelector(sel);
const status = $('#status');
function setStatus(msg, { error = false } = {}) {
  status.textContent = msg;
  status.style.color = error ? '#fca5a5' : '';
}

const settings = new Settings();
const storage = new Storage({ key: settings.get('storage.key'), version: settings.get('storage.version') });

let notebook = null;
let textEditor = null;
let renderer = null;
let gpuCanvas = null;
let saveTimer = null;
let currentPageId = null;
let currentPen = PEN_MATERIALS.ballpoint;
let exportInFlight = false;

const pageView = $('#page-view');
const pageList = $('.page-list__items');
const templateSelect = $('#paper-template');
const btnNew = $('[data-action="new-page"]');
const btnDel = $('[data-action="delete-page"]');
const btnText = $('[data-action="mode-text"]');
const btnHand = $('[data-action="mode-handwriting"]');
const btnExport = $('[data-action="export-png"]');

for (const t of listTemplates()) {
  const o = document.createElement('option');
  o.value = t.id;
  o.textContent = t.name;
  templateSelect.appendChild(o);
}
templateSelect.value = settings.get('paper.type');

function saveDebounced() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    persist();
  }, 300);
}
function persist() {
  try {
    storage.save(notebook);
    setStatus('Saved');
  } catch (err) {
    const e = wrap(err, { module: 'app', operation: 'persist', retryable: true });
    logger.error('app', 'persist', e.toJSON());
    setStatus('Save failed: ' + (e.cause || e.message), { error: true });
  }
}
function renderPageList() {
  pageList.innerHTML = '';
  for (const p of notebook.pages.list()) {
    const li = document.createElement('li');
    li.className = 'page-list__item' + (p.id === notebook.pages._currentId ? ' page-list__item--active' : '');
    li.textContent = p.title;
    li.title = p.paperType;
    li.addEventListener('click', () => switchPage(p.id));
    pageList.appendChild(li);
  }
}
async function switchPage(id) {
  notebook.switchPage(id);
  currentPageId = id;
  renderPageList();
  await renderPage(notebook.currentPage());
}
function writingAreaRect(template, paperSize, pageW, pageH) {
  const marginPx = mmToPx(template.marginMm);
  const topPx = mmToPx(template.topMarginMm);
  const bottomPx = mmToPx(template.bottomMarginMm);
  const bindingPx = mmToPx(template.bindingMarginMm || 0);
  return {
    x: marginPx + bindingPx,
    y: topPx,
    w: pageW - marginPx - mmToPx(template.marginMm) - bindingPx,
    h: pageH - topPx - bottomPx,
  };
}

async function initRenderer() {
  gpuCanvas = document.createElement('canvas');
  gpuCanvas.className = 'page__canvas';
  renderer = new WebGpuRenderer({
    canvas: gpuCanvas,
    onStatus: (msg) => setStatus(msg),
  });
  await renderer.init();
  if (renderer.available) return true;

  // WebGPU unavailable on this device (e.g. Android / Mali). Fall back to
  // WebGL 2.0 so the notebook still renders.
  try { renderer.destroy(); } catch { /* ignore */ }
  renderer = new WebGL2Renderer({ canvas: gpuCanvas, onStatus: setStatus });
  return await renderer.init();
}

async function renderPage(page) {
  if (!page) {
    pageView.innerHTML = '<div class="empty">No pages</div>';
    return;
  }
  pageView.innerHTML = '';

  const t = getTemplate(page.paperType || settings.get('paper.type'));
  const size = getPaperSize(t.paperSizeId);
  const pageW = mmToPx(size.widthMm);
  const pageH = mmToPx(size.heightMm);

  const pageEl = document.createElement('div');
  pageEl.className = 'page';
  pageEl.style.width = pageW + 'px';
  pageEl.style.height = pageH + 'px';
  pageView.appendChild(pageEl);

  gpuCanvas.width = pageW;
  gpuCanvas.height = pageH;
  gpuCanvas.style.position = 'absolute';
  gpuCanvas.style.top = '0';
  gpuCanvas.style.left = '0';
  gpuCanvas.style.width = '100%';
  gpuCanvas.style.height = '100%';
  gpuCanvas.style.display = 'block';
  pageEl.appendChild(gpuCanvas);

  const strokes = (notebook.getStrokes(page.id) || []).map((s) => Stroke.fromJSON(s));
  renderer.setDocument({
    pageW,
    pageH,
    template: t,
    size,
    strokes,
    pen: currentPen,
  });
  renderer.setStrokes(strokes);
  await renderer.render();

  const area = writingAreaRect(t, size, pageW, pageH);
  const lineHeightPx = mmToPx(t.lineSpacingMm > 0 ? t.lineSpacingMm : 7.1) * LINE_HEIGHT;

  textEditor = new TextEditor(
    {
      writeWidthPx: area.w,
      writeHeightPx: area.h,
      lineHeightPx,
      fontFamily: FONT_FAMILY,
      fontSizePx: mmToPx(parseFloat(FONT_SIZE)),
    },
    {
      onInput: (text) => {
        notebook.setText(page.id, text);
        saveDebounced();
        if (textEditor.isOverflowing()) {
          handleOverflow();
        }
      },
      onOverflow: handleOverflow,
    }
  );
  textEditor.mount(pageEl, page.id);
  textEditor.enable(settings.get('ui.mode') === 'text');
  textEditor.text(notebook.getText(page.id));
  if (settings.get('ui.mode') === 'text') textEditor.focus();

  attachHandwriting(gpuCanvas, page.id);
  currentPageId = page.id;
}

function handleOverflow() {
  const page = notebook.currentPage();
  if (!page) return;
  const next = notebook.createPage({ paperType: page.paperType || settings.get('paper.type') });
  renderPageList();
  renderPage(next).then(() => {
    setStatus('New page created (page full)');
    saveDebounced();
  });
}
function setMode(mode) {
  settings.set('ui.mode', mode);
  const text = mode === 'text';
  btnText.classList.toggle('active', text);
  btnHand.classList.toggle('active', !text);
  if (textEditor) textEditor.enable(text);
  gpuCanvas.style.pointerEvents = !text ? 'auto' : 'none';
  if (text && textEditor) textEditor.focus();
}

async function load() {
  setStatus('Loading…');
  let data;
  try {
    data = await Promise.resolve(storage.load());
  } catch (err) {
    const e = wrap(err, { module: 'storage', operation: 'load', retryable: true });
    logger.error('storage', 'load', e.toJSON());
    setStatus('Start failed: corrupted document (' + (e.cause || e.message) + ')', { error: true });
    data = null;
  }
  notebook = data ? Notebook.fromJSON(data) : new Notebook();
  if (!notebook.currentPage()) {
    notebook.createPage({ paperType: settings.get('paper.type') });
  }
  renderPageList();
  templateSelect.value = notebook.currentPage().paperType || settings.get('paper.type');
  let webgpuOk = false;
  try {
    webgpuOk = await initRenderer();
  } catch (err) {
    console.error('[gpu] initRenderer failed', err);
    const e = wrap(err, { module: 'gpu', operation: 'initRenderer', retryable: true });
    logger.error('gpu', 'initRenderer', e.toJSON());
    setStatus('WebGPU initialization failed: ' + (e.cause || e.message), { error: true });
  }
  if (!webgpuOk) {
    setStatus('WebGPU unavailable on this device', { error: true });
  }
  setMode(settings.get('ui.mode'));
  await renderPage(notebook.currentPage());
  if (webgpuOk) {
    setStatus('Ready');
  }
}

async function newPage() {
  const page = notebook.createPage({ paperType: templateSelect.value || settings.get('paper.type') });
  renderPageList();
  await renderPage(page);
  saveDebounced();
}
function deletePage() {
  const pages = notebook.pages.list();
  if (pages.length <= 1) {
    setStatus('Cannot delete the last page', { error: true });
    return;
  }
  notebook.removePage(notebook.currentPage().id);
  renderPageList();
  switchPage(notebook.currentPage().id);
  saveDebounced();
}

function attachHandwriting(canvas, pageId) {
  // Remove previously attached listeners (canvas is reused across pages).
  if (canvas._hw) {
    canvas.removeEventListener('pointerdown', canvas._hw.onDown);
    canvas.removeEventListener('pointermove', canvas._hw.onMove);
    canvas.removeEventListener('pointerup', canvas._hw.onUp);
    canvas.removeEventListener('pointercancel', canvas._hw.onUp);
  }
  let active = null;
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, t: Date.now() };
  };
  const onDown = (e) => {
    if (settings.get('ui.mode') !== 'handwriting') return;
    active = new Stroke({ points: [pos(e)], color: currentPen.color, width: currentPen.widthPx });
    notebook.setStrokes(pageId, [...(notebook.getStrokes(pageId) || []), active.toJSON()]);
    saveDebounced();
    renderStrokeLayer(pageId);
  };
  const onMove = (e) => {
    if (!active) return;
    active.points.push(pos(e));
    notebook.setStrokes(pageId, (notebook.getStrokes(pageId) || []).map((s) =>
      s.id === active.id ? active.toJSON() : s));
    renderStrokeLayer(pageId);
  };
  const onUp = () => {
    active = null;
    saveDebounced();
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas._hw = { onDown, onMove, onUp };
}

async function renderStrokeLayer(pageId) {
  const page = notebook.getPage(pageId);
  if (!page || !renderer) return;
  const strokes = (notebook.getStrokes(page.id) || []).map((s) => Stroke.fromJSON(s));
  renderer.setStrokes(strokes);
  await renderer.render();
}

async function exportPng() {
  if (!renderer || !renderer.available) {
    setStatus('WebGPU unavailable for export', { error: true });
    return;
  }
  if (exportInFlight) return;
  const page = notebook.currentPage();
  if (!page) return;
  exportInFlight = true;
  btnExport.disabled = true;
  setStatus('Exporting PNG…');
  try {
    const t = getTemplate(page.paperType || settings.get('paper.type'));
    const size = getPaperSize(t.paperSizeId);
    const dpi = 150;
    const scale = dpi / 96;
    const exportW = Math.max(1, Math.floor(mmToPx(size.widthMm) * scale));
    const exportH = Math.max(1, Math.floor(mmToPx(size.heightMm) * scale));
    const png = await renderer.exportPng(exportW, exportH);
    const blob = new Blob([png], { type: 'image/png' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'school-notebook-page.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatus('Exported ' + exportW + 'x' + exportH);
  } catch (err) {
    const e = wrap(err, { module: 'gpu', operation: 'exportPng', retryable: true });
    logger.error('gpu', 'exportPng', e.toJSON());
    setStatus('Export failed: ' + (e.cause || e.message), { error: true });
  } finally {
    exportInFlight = false;
    btnExport.disabled = false;
  }
}

btnNew.addEventListener('click', newPage);
btnDel.addEventListener('click', deletePage);
templateSelect.addEventListener('change', () => {
  const page = notebook.currentPage();
  if (!page) return;
  page.paperType = templateSelect.value;
  page.touch();
  renderPage(page).then(() => saveDebounced());
});
btnText.addEventListener('click', () => setMode('text'));
btnHand.addEventListener('click', () => setMode('handwriting'));
btnExport.addEventListener('click', exportPng);

window.addEventListener('error', (ev) => {
  logger.error('app', 'uncaught', wrap(ev.error || new Error(ev.message), { module: 'app', operation: 'uncaught', retryable: true }).toJSON());
  setStatus('Error: ' + (ev.message || 'unknown'), { error: true });
});
window.addEventListener('unhandledrejection', (ev) => {
  logger.error('app', 'unhandled rejection', wrap(ev.reason || new Error(ev.message), { module: 'app', operation: 'unhandledrejection', retryable: true }).toJSON());
  setStatus('Error: unhandled rejection', { error: true });
});

const app = new App({ modules: {} });
ensureFonts().then(() => {
  app.init().then(() => {
    app.start();
    load();
  }).catch((err) => {
    logger.error('core', 'init', err.message);
    setStatus('Failed to start: ' + err.message, { error: true });
  });
});
