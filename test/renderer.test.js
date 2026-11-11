import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { renderPaper } from '../js/paper/renderer.js';
import { getTemplate } from '../js/paper/templates.js';
import { getPaperSize } from '../js/paper/sizes.js';
import { mmToPx } from '../js/units.js';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;

// Mock canvas 2D context since jsdom doesn't implement it
const mockCtx = {
  fillStyle: null,
  fillRect: () => {},
  strokeStyle: null,
  lineWidth: null,
  beginPath: () => {},
  moveTo: () => {},
  lineTo: () => {},
  stroke: () => {},
  arc: () => {},
  fill: () => {},
  clearRect: () => {},
  setTransform: () => {},
  getImageData: () => ({ data: [255, 255, 255, 255] }),
};
const mockCanvas = {
  getContext: () => mockCtx,
  width: 0,
  height: 0,
  style: {},
};
global.HTMLCanvasElement = class {
  constructor() { return mockCanvas; }
  get width() { return mockCanvas.width; }
  set width(v) { mockCanvas.width = v; }
  get height() { return mockCanvas.height; }
  set height(v) { mockCanvas.height = v; }
  getContext() { return mockCtx; }
  get style() { return mockCanvas.style; }
};
global.CanvasRenderingContext2D = mockCtx;

test('renderer: renders college-ruled paper without throwing', (t) => {
  const tmpl = getTemplate('college-ruled');
  const size = getPaperSize('us-letter');
  const w = mmToPx(size.widthMm);
  const h = mmToPx(size.heightMm);
  assert.doesNotThrow(() => {
    renderPaper(mockCtx, { x: 0, y: 0, w, h }, tmpl, size);
  });
});

test('renderer: renders blank paper without lines', (t) => {
  const tmpl = getTemplate('blank');
  const size = getPaperSize('a4');
  const w = mmToPx(size.widthMm);
  const h = mmToPx(size.heightMm);
  assert.doesNotThrow(() => {
    renderPaper(mockCtx, { x: 0, y: 0, w, h }, tmpl, size);
  });
});

test('renderer: renders grid paper with lines', (t) => {
  const tmpl = getTemplate('grid-5mm');
  const size = getPaperSize('a4');
  const w = mmToPx(size.widthMm);
  const h = mmToPx(size.heightMm);
  assert.doesNotThrow(() => {
    renderPaper(mockCtx, { x: 0, y: 0, w, h }, tmpl, size);
  });
});

test('renderer: renders graph paper', (t) => {
  const tmpl = getTemplate('graph-10mm');
  const size = getPaperSize('a4');
  const w = mmToPx(size.widthMm);
  const h = mmToPx(size.heightMm);
  assert.doesNotThrow(() => {
    renderPaper(mockCtx, { x: 0, y: 0, w, h }, tmpl, size);
  });
});

test('renderer: renders dot grid paper', (t) => {
  const tmpl = getTemplate('dot-grid-5mm');
  const size = getPaperSize('a5');
  const w = mmToPx(size.widthMm);
  const h = mmToPx(size.heightMm);
  assert.doesNotThrow(() => {
    renderPaper(mockCtx, { x: 0, y: 0, w, h }, tmpl, size);
  });
});
