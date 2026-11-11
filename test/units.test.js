import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mmToPx, pxToMm, PX_PER_MM, MM_PER_PX, snapPx } from '../js/units.js';

test('units: mmToPx and pxToMm are inverse operations', (t) => {
  assert.strictEqual(PX_PER_MM, 96 / 25.4);
  assert.strictEqual(MM_PER_PX, 25.4 / 96);
  const mm = 100;
  const px = mmToPx(mm);
  const back = pxToMm(px);
  assert.ok(Math.abs(back - mm) < 0.001, 'round trip should preserve mm');
});

test('units: snapPx rounds to 3 decimal places', (t) => {
  assert.strictEqual(snapPx(1.234567), 1.235);
  assert.strictEqual(snapPx(0), 0);
});
