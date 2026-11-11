import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { containsMyanmar, fontCss, FONT_FAMILY } from '../js/typography/typography.js';

test('containsMyanmar detects Myanmar script', () => {
  assert.ok(containsMyanmar('\u1000\u1001'));
  assert.ok(containsMyanmar('Hello \u1000 Myanmar'));
  assert.ok(!containsMyanmar('Hello world'));
  assert.ok(!containsMyanmar(''));
});

test('fontCss includes font stack', () => {
  const css = fontCss();
  assert.ok(css.includes(FONT_FAMILY));
  assert.ok(css.includes('18px'));
});
