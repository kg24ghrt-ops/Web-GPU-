import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Storage } from '../js/storage/storage.js';
import { Notebook } from '../js/notebook/notebook.js';
import { AppError } from '../js/common/errors.js';

class MockStore {
  constructor() { this._ = new Map(); }
  getItem(k) { return this._.get(k) ?? null; }
  setItem(k, v) { this._.set(k, String(v)); }
  removeItem(k) { this._.delete(k); }
}

function makeStorage(store) { return new Storage({ store, key: 'test:v1', version: 1 }); }

test('Storage save/load round trip', () => {
  const store = new MockStore();
  const st = makeStorage(store);
  const n = new Notebook();
  const p = n.createPage({ title: 'T' });
  n.setText(p.id, 'Hello \u1000');
  n.setStrokes(p.id, [{ id: 's1', points: [{ x: 0, y: 0 }] }]);
  st.save(n);
  const loaded = Notebook.fromJSON(st.load());
  assert.equal(loaded.title, n.title);
  assert.equal(loaded.getText(p.id), 'Hello \u1000');
  assert.deepEqual(loaded.getStrokes(p.id), [{ id: 's1', points: [{ x: 0, y: 0 }] }]);
});

test('Storage load returns null when empty', () => {
  const st = makeStorage(new MockStore());
  assert.equal(st.load(), null);
});

test('Storage falls back to tmp when main is corrupt', () => {
  const store = new MockStore();
  const st = makeStorage(store);
  const n = new Notebook();
  const p = n.createPage();
  n.setText(p.id, 'original');
  st.save(n);
  // corrupt main, keep tmp valid
  store.setItem(st._key, '{not json');
  const loaded = Notebook.fromJSON(st.load());
  assert.equal(loaded.getText(p.id), 'original');
});

test('Storage throws AppError on corrupted data with no fallback', () => {
  const store = new MockStore();
  const st = makeStorage(store);
  store.setItem(st._key, '{not json');
  store.setItem(st._tmpKey(), '{also bad');
  assert.throws(() => st.load(), AppError);
});

test('Storage rejects unsupported schema version', () => {
  const store = new MockStore();
  const st = makeStorage(store);
  store.setItem(st._key, JSON.stringify({ version: 99 }));
  assert.throws(() => st.load(), AppError);
});

test('Storage throws when no backend', () => {
  assert.throws(() => new Storage({ store: null }), /no storage backend/);
});
