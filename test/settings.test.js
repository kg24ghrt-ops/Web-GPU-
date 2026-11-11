import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Settings } from '../js/settings/settings.js';

test('Settings defaults and get/set', () => {
  const s = new Settings();
  assert.equal(s.get('paper.type'), 'asia-b5-ruled');
  assert.equal(s.get('storage.version'), 1);
  s.set('paper.type', 'blank');
  assert.equal(s.get('paper.type'), 'blank');
});

test('Settings throws on unknown key', () => {
  const s = new Settings();
  assert.throws(() => s.get('nope.key'), /unknown key/);
  assert.throws(() => s.set('nope.key', 1), /unknown key/);
});

test('Settings constructor overrides defaults', () => {
  const s = new Settings({ 'paper.type': 'school-ruled' });
  assert.equal(s.get('paper.type'), 'school-ruled');
});
