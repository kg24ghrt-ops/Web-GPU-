import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listTemplates, getTemplate, resolvePaperSize } from '../js/paper/templates.js';
import { getPaperSize } from '../js/paper/sizes.js';

test('templates: returns 9 templates', (t) => {
  const templates = listTemplates();
  assert.strictEqual(templates.length, 9);
});

test('templates: college-ruled has 7.1mm spacing and 32mm margin', (t) => {
  const tmpl = getTemplate('college-ruled');
  assert.ok(tmpl);
  assert.strictEqual(tmpl.lineSpacingMm, 7.1);
  assert.strictEqual(tmpl.marginMm, 32);
  assert.strictEqual(tmpl.marginLineColor, '#b91c1c');
  assert.strictEqual(tmpl.type, 'ruled');
  assert.strictEqual(tmpl.showMarginLine, true);
});

test('templates: blank has no lines or margin', (t) => {
  const tmpl = getTemplate('blank');
  assert.ok(tmpl);
  assert.strictEqual(tmpl.lineSpacingMm, 0);
  assert.strictEqual(tmpl.marginMm, 0);
  assert.strictEqual(tmpl.showMarginLine, false);
  assert.strictEqual(tmpl.type, 'blank');
});

test('templates: wide-ruled has 8.7mm spacing', (t) => {
  const tmpl = getTemplate('wide-ruled');
  assert.ok(tmpl);
  assert.strictEqual(tmpl.lineSpacingMm, 8.7);
});

test('templates: narrow-ruled has 6.4mm spacing', (t) => {
  const tmpl = getTemplate('narrow-ruled');
  assert.ok(tmpl);
  assert.strictEqual(tmpl.lineSpacingMm, 6.4);
});

test('templates: asia-b5-ruled has 8mm spacing', (t) => {
  const tmpl = getTemplate('asia-b5-ruled');
  assert.ok(tmpl);
  assert.strictEqual(tmpl.lineSpacingMm, 8.0);
});

test('templates: grid-5mm has 5mm grid spacing', (t) => {
  const tmpl = getTemplate('grid-5mm');
  assert.ok(tmpl);
  assert.strictEqual(tmpl.type, 'grid');
  assert.strictEqual(tmpl.gridSpacingMm, 5.0);
});

test('templates: dot-grid-5mm has 5mm dot spacing', (t) => {
  const tmpl = getTemplate('dot-grid-5mm');
  assert.ok(tmpl);
  assert.strictEqual(tmpl.type, 'dot');
  assert.strictEqual(tmpl.gridSpacingMm, 5.0);
});

test('templates: graph-10mm has graph type', (t) => {
  const tmpl = getTemplate('graph-10mm');
  assert.ok(tmpl);
  assert.strictEqual(tmpl.type, 'graph');
  assert.strictEqual(tmpl.gridSpacingMm, 10.0);
});

test('templates: unknown id returns undefined', (t) => {
  assert.strictEqual(getTemplate('nonexistent'), undefined);
});

test('templates: resolvePaperSize returns template paper size by default', (t) => {
  const tmpl = getTemplate('college-ruled');
  const size = resolvePaperSize(tmpl);
  assert.ok(size);
  assert.strictEqual(size.id, 'us-letter');
});

test('templates: resolvePaperSize honors override', (t) => {
  const tmpl = getTemplate('college-ruled');
  const a4 = getPaperSize('a4');
  const size = resolvePaperSize(tmpl, a4);
  assert.strictEqual(size.id, 'a4');
});
