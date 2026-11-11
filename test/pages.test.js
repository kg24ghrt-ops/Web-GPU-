import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Page, PageManager } from '../js/pages/pages.js';
import { AppError } from '../js/common/errors.js';

test('Page toJSON/fromJSON round trip', () => {
  const p = new Page({ id: 'p1', title: 'T', paperType: 'blank' });
  const p2 = Page.fromJSON(p.toJSON());
  assert.deepEqual(p2, p);
});

test('PageManager add/get/current/switch/remove', () => {
  const m = new PageManager();
  assert.equal(m.current(), null);
  const a = m.create({ title: 'A', paperType: 'asia-b5-ruled' });
  const b = m.create({ title: 'B' });
  assert.equal(m.current().id, a.id);
  assert.equal(m.get(a.id).title, 'A');
  m.switch(b.id);
  assert.equal(m.current().id, b.id);
  assert.equal(m.list().length, 2);
  m.remove(a.id);
  assert.equal(m.list().length, 1);
  assert.equal(m.current().id, b.id);
  assert.throws(() => m.get(a.id), AppError);
  assert.throws(() => m.add(new Page({ id: b.id })), /already exists/);
});

test('PageManager removes last page clears current', () => {
  const m = new PageManager();
  const a = m.create();
  m.remove(a.id);
  assert.equal(m.current(), null);
  assert.equal(m.list().length, 0);
});

test('PageManager fromJSON restores pages and current', () => {
  const m = new PageManager();
  m.create({ title: 'A' });
  m.create({ title: 'B' });
  m.switch(m.list()[1].id);
  const restored = PageManager.fromJSON(m.toJSON());
  assert.equal(restored.list().length, 2);
  assert.equal(restored.current().id, m.current().id);
});
