import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Stroke } from '../js/handwriting/handwriting.js';

test('Stroke toJSON/fromJSON round trip', () => {
  const s = new Stroke({ id: 's1', points: [{ x: 1, y: 2, t: 3 }] });
  const s2 = Stroke.fromJSON(s.toJSON());
  assert.deepEqual(s2, s);
  assert.ok(typeof s2.id === 'string' && s2.id.length > 0);
});
