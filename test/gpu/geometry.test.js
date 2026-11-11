import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildStrokeGeometry } from '../../js/gpu/renderer.js';

test('stroke geometry: single segment yields 6 vertices (triangle list)', () => {
  const g = buildStrokeGeometry({
    points: [{ x: 0, y: 0, t: 0 }, { x: 10, y: 0, t: 10 }],
    width: 2,
    color: '#111827',
  });
  assert.equal(g.length, 6 * 9); // 6 vertices * 9 floats
  assert.equal(g.length / 9, 6);
});

test('stroke geometry: two segments yield 12 vertices', () => {
  const g = buildStrokeGeometry({
    points: [{ x: 0, y: 0, t: 0 }, { x: 10, y: 0, t: 5 }, { x: 10, y: 10, t: 10 }],
    width: 2,
    color: '#000000',
  });
  assert.equal(g.length / 9, 12);
});

test('stroke geometry: fewer than 2 points yields empty', () => {
  assert.equal(buildStrokeGeometry({ points: [{ x: 1, y: 2, t: 3 }] }).length, 0);
  assert.equal(buildStrokeGeometry({ points: [] }).length, 0);
});

test('stroke geometry: color parsed to 0..1 floats', () => {
  const g = buildStrokeGeometry({
    points: [{ x: 0, y: 0, t: 0 }, { x: 10, y: 0, t: 10 }],
    width: 2,
    color: '#ff0000',
  });
  // color floats at indices 4,5,6,7 of each vertex (x,y,hw,sd,r,g,b,a,p)
  const red = g.subarray(4, 8);
  assert.ok(red[0] > 0.9, 'red channel high');
  assert.ok(red[1] < 0.1, 'green channel low');
  assert.ok(red[2] < 0.1, 'blue channel low');
  assert.equal(red[3], 1, 'alpha one');
});
