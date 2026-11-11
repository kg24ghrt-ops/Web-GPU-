import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listPaperSizes, getPaperSize } from '../js/paper/sizes.js';

test('sizes: returns all 36 paper sizes', (t) => {
  const sizes = listPaperSizes();
  assert.strictEqual(sizes.length, 36);
});

test('sizes: A4 is 210x297mm', (t) => {
  const a4 = getPaperSize('a4');
  assert.ok(a4);
  assert.strictEqual(a4.widthMm, 210);
  assert.strictEqual(a4.heightMm, 297);
  assert.strictEqual(a4.series, 'iso-a');
});

test('sizes: JIS B5 is 182x257mm', (t) => {
  const b5 = getPaperSize('jis-b5');
  assert.ok(b5);
  assert.strictEqual(b5.widthMm, 182);
  assert.strictEqual(b5.heightMm, 257);
  assert.strictEqual(b5.series, 'jis-b');
});

test('sizes: ISO B5 is 176x250mm (differs from JIS B5)', (t) => {
  const b5 = getPaperSize('b5');
  assert.ok(b5);
  assert.strictEqual(b5.widthMm, 176);
  assert.strictEqual(b5.heightMm, 250);
  assert.strictEqual(b5.series, 'iso-b');
});

test('sizes: US Letter is 215.9x279.4mm', (t) => {
  const letter = getPaperSize('us-letter');
  assert.ok(letter);
  assert.strictEqual(letter.widthMm, 215.9);
  assert.strictEqual(letter.heightMm, 279.4);
  assert.strictEqual(letter.series, 'us');
});

test('sizes: unknown id returns undefined', (t) => {
  assert.strictEqual(getPaperSize('nonexistent'), undefined);
});
