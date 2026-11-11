import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Notebook } from '../js/notebook/notebook.js';

test('Notebook page + text + strokes round trip', () => {
  const n = new Notebook();
  const p = n.createPage({ title: 'First', paperType: 'blank' });
  n.setText(p.id, 'Hello \u1000 world');
  n.setStrokes(p.id, [{ id: 's1', points: [{ x: 1, y: 2, t: 3 }], color: '#000', width: 2 }]);

  const n2 = Notebook.fromJSON(n.toJSON());
  assert.equal(n2.getText(p.id), 'Hello \u1000 world');
  assert.deepEqual(n2.getStrokes(p.id), [{ id: 's1', points: [{ x: 1, y: 2, t: 3 }], color: '#000', width: 2 }]);
  assert.equal(n2.currentPage().id, p.id);
});

test('Notebook removePage clears strokes and text', () => {
  const n = new Notebook();
  const p = n.createPage();
  n.setText(p.id, 'x');
  n.setStrokes(p.id, []);
  n.removePage(p.id);
  assert.equal(n.pages.list().length, 0);
  assert.equal(n.currentPage(), null);
});

test('Notebook getStrokes/getText default empty for unknown page', () => {
  const n = new Notebook();
  const p = n.createPage();
  assert.equal(n.getText(p.id), '');
  assert.deepEqual(n.getStrokes(p.id), []);
});
