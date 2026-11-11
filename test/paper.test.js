import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { getTemplate, listTemplates, mmToPx } from '../js/paper/paper.js';

test('getTemplate returns known templates', () => {
  const b5 = getTemplate('asia-b5-ruled');
  assert.equal(b5.id, 'asia-b5-ruled');
  assert.equal(b5.widthMm, 182);
  assert.equal(b5.heightMm, 257);
  assert.equal(b5.lineSpacingMm, 8);
  const blank = getTemplate('blank');
  assert.equal(blank.lineSpacingMm, 0);
  assert.equal(blank.marginMm, 0);
});

test('getTemplate throws for unknown template', () => {
  assert.throws(() => getTemplate('nope'), /unknown template/);
});

test('listTemplates returns all three', () => {
  const ids = listTemplates().map(t => t.id);
  assert.deepEqual(ids.sort(), ['asia-b5-ruled', 'blank', 'school-ruled']);
  for (const t of listTemplates()) {
    assert.ok(t.id && t.name);
  }
});

test('mmToPx converts', () => {
  assert.equal(mmToPx(25.4), 96);
});
