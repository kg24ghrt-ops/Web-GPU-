import { App } from './core/app.js';
import { logger } from './common/logger.js';
import { wrap } from './common/errors.js';
import { Settings } from './settings/settings.js';
import { Storage } from './storage/storage.js';
import { Notebook } from './notebook/notebook.js';
import { mmToPx } from './units.js';
import { getTemplate, listTemplates } from './paper/templates.js';
import { getPaperSize } from './paper/sizes.js';
import { ensureFonts, FONT_SPEC, FONT_SIZE, loadFonts, resolveFont, fontIdForScript, DEFAULT_FONT, layoutText, containsMyanmar } from './typography/typography.js';
import { createTextCanvas, rasterizeText, caretAt } from './gpu/text-layer.js';
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
let fontSelectEn = null;
let fontSelectMy = null;

// Text layer state (owned by the GPU layer; the contenteditable is invisible).
let textCanvas = null;
let blinkTimer = null;
let caretVisible = true;
let currentText = null; // { text, fontSpec, widthPx, lineHeightPx, originX, originY, caretX, caretLineY }
const BLINK_MS = 500;

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

function fontOptions(script) {
  const frag = document.createDocumentFragment();
  for (const [id, spec] of Object.entries(FONT_SPEC)) {
    if (spec.script !== script) continue;
    const o = document.createElement('option');
    o.value = id;
    o.textContent = spec.label;
    frag.appendChild(o);
  }
  return frag;
}

function setupFontPickers() {
  const group = document.createElement('div');
  group.className = 'toolbar__group';
  group.style.fontSize = '12px';

  const labEn = document.createElement('label');
  labEn.textContent = 'English: ';
  fontSelectEn = document.createElement('select');
  fontSelectEn.appendChild(fontOptions('latin'));
  fontSelectEn.value = notebook ? notebook.fontChoice('english') : DEFAULT_FONT.english;
  labEn.appendChild(fontSelectEn);
  group.appendChild(labEn);

  const labMy = document.createElement('label');
  labMy.textContent = 'Myanmar: ';
  fontSelectMy = document.createElement('select');
  fontSelectMy.appendChild(fontOptions('myanmar'));
  fontSelectMy.value = notebook ? notebook.fontChoice('myanmar') : DEFAULT_FONT.myanmar;
  labMy.appendChild(fontSelectMy);
  group.appendChild(labMy);

  const applyFont = () => {
    if (!notebook) return;
    const en = fontSelectEn.value;
    const my = fontSelectMy.value;
    notebook.setFontChoice('english', en);
    notebook.setFontChoice('myanmar', my);
    loadFonts(notebook.fontSettings).then(() => {
      renderPage(notebook.currentPage()).then(() => saveDebounced());
    });
  };
  fontSelectEn.addEventListener('change', applyFont);
  fontSelectMy.addEventListener('change', applyFont);

  const toolbar = document.querySelector('.toolbar');
  if (toolbar) toolbar.appendChild(group);
}

setupFontPickers();

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
    x: marginPx + bindingPx + mmToPx(3),
    y: topPx,
    w: pageW - marginPx - mmToPx(template.marginMm) - bindingPx - mmToPx(3),
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

  const area = writingAreaRect(t, size, pageW, pageH);
  const lineHeightPx = mmToPx(t.lineSpacingMm > 0 ? t.lineSpacingMm : 7.1);

  // Choose the font for this page's text by script, so English uses the
  // chosen handwriting font and Myanmar uses the chosen Myanmar font. Both
  // choices are stored per notebook.
  const pageText = notebook.getText(page.id);
  const script = containsMyanmar(pageText) ? 'myanmar' : 'english';
  const fontId = notebook.fontChoice(script);
  const fontSpec = resolveFont(fontId, parseFloat(FONT_SIZE));

  // --- GPU text layer: rasterize wrapped text to an offscreen canvas -------
  stopBlink();
  textCanvas = createTextCanvas(pageW, pageH);
  const caretOffset = 0;
  const caretPos = caretAt(pageText, fontSpec, area.w, lineHeightPx, area.x, area.y, caretOffset);
  rasterizeText(textCanvas, pageText, fontSpec, area.w, lineHeightPx, area.x, area.y,
    caretPos ? caretPos.x : null, caretPos ? caretPos.y : null, caretVisible);
  renderer.setTextImage(textCanvas);
  currentText = {
    text: pageText, fontSpec, widthPx: area.w, lineHeightPx,
    originX: area.x, originY: area.y, caretOffset,
  };

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
  startBlink();

  textEditor = new TextEditor(
    {
      writeWidthPx: area.w,
      writeHeightPx: area.h,
      originXPx: area.x,
      originYPx: area.y,
      baselineOffsetPx: parseFloat(FONT_SIZE) * 0.75,
      lineHeightPx,
      fontFamily: fontSpec.family,
      fontSizePx: parseFloat(FONT_SIZE),
    },
    {
      onInput: (text) => {
        notebook.setText(page.id, text);
        if (currentText) {
          currentText.text = text;
          const sc = containsMyanmar(text) ? 'myanmar' : 'english';
          currentText.fontSpec = resolveFont(notebook.fontChoice(sc), parseFloat(FONT_SIZE));
        }
        saveDebounced();
        handleOverflow();
        if (textEditor) currentText.caretOffset = textEditor.caretOffset();
        redrawTextLayer();
      },
      onOverflow: handleOverflow,
    }
  );
  textEditor.mount(pageEl, page.id);
  textEditor.enable(settings.get('ui.mode') === 'text');
  textEditor.text(notebook.getText(page.id));
  if (settings.get('ui.mode') === 'text') textEditor.focus();
  if (currentText) currentText.caretOffset = textEditor.caretOffset();

  attachHandwriting(gpuCanvas, page.id);
  currentPageId = page.id;
  startBlink();
}

function overflowLinesFor(page) {
  const t = getTemplate(page.paperType || settings.get('paper.type'));
  const size = getPaperSize(t.paperSizeId);
  const pageW = mmToPx(size.widthMm);
  const pageH = mmToPx(size.heightMm);
  const area = writingAreaRect(t, size, pageW, pageH);
  const lineHeightPx = mmToPx(t.lineSpacingMm > 0 ? t.lineSpacingMm : 7.1);
  const maxLines = Math.floor(area.h / lineHeightPx);
  const text = notebook.getText(page.id);
  const script = containsMyanmar(text) ? 'myanmar' : 'english';
  const fontSpec = resolveFont(notebook.fontChoice(script), parseFloat(FONT_SIZE));
  const { lines } = layoutText(text, fontSpec, area.w);
  return { lines, maxLines, area, lineHeightPx, fontSpec };
}

function handleOverflow() {
  const page = notebook.currentPage();
  if (!page) return;
  const { lines, maxLines } = overflowLinesFor(page);
  if (maxLines <= 0 || lines.length <= maxLines) return; // nothing overflows

  // Move text that does not fit on the current page to the new page. The
  // split is based on the wrapped lines from layoutText (not newline splits).
  const next = notebook.createPage({ paperType: page.paperType || settings.get('paper.type') });
  const keep = lines.slice(0, maxLines).map((l) => l.text).join('\n');
  const move = lines.slice(maxLines).map((l) => l.text).join('\n');
  notebook.setText(page.id, keep);
  notebook.setText(next.id, move);
  saveDebounced();

  renderPageList();
  renderPage(next).then(() => {
    setStatus('New page created (page full)');
    saveDebounced();
  });
}

function redrawTextLayer() {
  if (!currentText || !renderer || !renderer.available || !textCanvas) return;
  const { text, fontSpec, widthPx, lineHeightPx, originX, originY, caretOffset } = currentText;
  const caretPos = caretAt(text, fontSpec, widthPx, lineHeightPx, originX, originY, caretOffset);
  rasterizeText(textCanvas, text, fontSpec, widthPx, lineHeightPx, originX, originY,
    caretPos ? caretPos.x : null, caretPos ? caretPos.y : null, caretVisible);
  renderer.setTextImage(textCanvas);
  renderer.render();
}

function startBlink() {
  stopBlink();
  caretVisible = true;
  if (settings.get('ui.mode') !== 'text') return;
  blinkTimer = setInterval(() => {
    caretVisible = !caretVisible;
    redrawTextLayer();
  }, BLINK_MS);
}

function stopBlink() {
  if (blinkTimer) { clearInterval(blinkTimer); blinkTimer = null; }
  caretVisible = true;
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
  if (fontSelectEn) fontSelectEn.value = notebook.fontChoice('english');
  if (fontSelectMy) fontSelectMy.value = notebook.fontChoice('myanmar');
  await loadFonts(notebook.fontSettings);
  let webgpuOk = false;
  let webgl2Fallback = false;
  try {
    webgpuOk = await initRenderer();
    // If WebGPU itself isn't available but initRenderer returned true,
    // we fell back to WebGL2.
    if (webgpuOk && renderer && renderer.constructor.name === 'WebGL2Renderer') {
      webgl2Fallback = true;
    }
  } catch (err) {
    console.error('[gpu] initRenderer failed', err);
    const e = wrap(err, { module: 'gpu', operation: 'initRenderer', retryable: true });
    logger.error('gpu', 'initRenderer', e.toJSON());
    setStatus('GPU initialization failed: ' + (e.cause || e.message), { error: true });
  }
  if (!webgpuOk) {
    setStatus('WebGPU and WebGL2 both unavailable on this device', { error: true });
  } else if (webgl2Fallback) {
    setStatus('WebGPU unavailable (secure context required); using WebGL2 fallback');
  } else {
    setStatus('Ready');
  }
  setMode(settings.get('ui.mode'));
  await renderPage(notebook.currentPage());
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

    // Render the text layer at export resolution so Save PNG includes the text.
    stopBlink();
    const displayText = currentText;
    if (displayText) {
      const exportCanvas = createTextCanvas(exportW, exportH);
      const sx = exportW / mmToPx(size.widthMm);
      const sy = exportH / mmToPx(size.heightMm);
      const scaledFont = { ...displayText.fontSpec, sizePx: displayText.fontSpec.sizePx * scale };
      rasterizeText(exportCanvas, displayText.text, scaledFont,
        displayText.widthPx * sx, displayText.lineHeightPx * sy,
        displayText.originX * sx, displayText.originY * sy,
        displayText.caretOffset != null ? (displayText.caretX != null ? displayText.caretX * sx : null) : null,
        displayText.caretLineY != null ? displayText.caretLineY * sy : null,
        caretVisible);
      renderer.setTextImage(exportCanvas);
    }

    const blob = await renderer.exportPng(exportW, exportH);

    // Restore the display text layer and re-render the on-screen page.
    if (displayText) {
      renderer.setTextImage(textCanvas);
      redrawTextLayer();
      startBlink();
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const isJpeg = blob.type === 'image/jpeg';
    a.href = url;
    a.download = isJpeg ? 'school-notebook-page.jpg' : 'school-notebook-page.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatus('Exported ' + exportW + 'x' + exportH + ' (' + (isJpeg ? 'JPEG fallback' : 'PNG') + ')');
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
