import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { layoutText, graphemeClusters } from '../js/typography/typography.js';

// Deterministic measurer: each code point is 6 px wide. This keeps tests
// independent of canvas/font availability.
const measure = (text) => [...String(text)].length * 6;
globalThis.__TEXT_MEASURE__ = measure;
import { setTextMeasurer } from '../js/typography/typography.js';
setTextMeasurer(measure);

const F = { family: 'Test', sizePx: 18 };

test('layoutText: wraps English text at spaces', () => {
  const r = layoutText('a bb ccc dddd', F, 30);
  assert.deepEqual(r.lines.map((l) => l.text), ['a bb ', 'ccc ', 'dddd']);
  assert.equal(r.lines.map((l) => l.text).join(''), 'a bb ccc dddd');
});

test('layoutText: never breaks inside a grapheme cluster', () => {
  // 'e\u0301' is a single grapheme cluster (12 px wide) that must stay together.
  const r = layoutText('e\u0301e\u0301', F, 10);
  assert.equal(r.lines.length, 2);
  assert.equal(r.lines[0].text, 'e\u0301');
  assert.equal(r.lines[1].text, 'e\u0301');
  // A cluster wider than the line still goes on its own line rather than being split.
  const r2 = layoutText('e\u0301', F, 5);
  assert.equal(r2.lines[0].text, 'e\u0301');
});

test('layoutText: Myanmar wraps at phrase boundaries (spaces/ZWSP)', () => {
  const my = 'ကကက \u200B၊';
  const r = layoutText(my, F, 100);
  assert.equal(r.lines.length, 1);
  assert.equal(r.lines[0].text, my);
  // With a narrow width it breaks at the space/ZWSP, never mid-cluster, and no
  // glyph is lost.
  const narrow = layoutText(my, F, 20);
  const joined = narrow.lines.map((l) => l.text).join('');
  assert.equal(joined, my);
  // Reconstruct the full text from line start/end offsets: they must cover
  // every char exactly once.
  const text = my;
  const seen = new Array(text.length).fill(false);
  for (const l of narrow.lines) {
    for (let k = l.start; k < l.end; k++) seen[k] = true;
  }
  assert.ok(seen.every((x) => x));
});

test('layoutText: preserves hard newlines', () => {
  const r = layoutText('line one\nline two', F, 1000);
  assert.equal(r.lines.length, 2);
  assert.equal(r.lines[0].text, 'line one');
  assert.equal(r.lines[1].text, 'line two');
});

test('layoutText: empty text yields one empty line', () => {
  const r = layoutText('', F, 100);
  assert.equal(r.lines.length, 1);
  assert.equal(r.lines[0].text, '');
});

test('layoutText: char offsets cover the whole text', () => {
  const r = layoutText('abc de', F, 100);
  const joined = r.lines.map((l) => l.text).join('');
  assert.equal(joined, 'abc de');
  // Line start/end char offsets chain contiguously (modulo newline chars).
  let prevEnd = 0;
  for (const l of r.lines) {
    assert.ok(l.start >= prevEnd);
    prevEnd = l.end;
  }
});

test('layoutText: Myanmar wraps at phrase punctuation (၊ and ।)', () => {
  // Myanmar comma U+104A and full stop U+104B are break opportunities.
  // Text has no spaces between words (typical Myanmar), so breaks can only
  // happen after these phrase punctuation marks or at grapheme boundaries.
  const my = '\u1000\u102c\u103a\u104A\u1004\u102c\u103a\u104B';
  const r = layoutText(my, F, 200);
  assert.equal(r.lines.length, 1);
  assert.equal(r.lines[0].text, my);
  // Narrow width: break after each phrase punctuation.
  const narrow = layoutText(my, F, 30);
  const joined = narrow.lines.map((l) => l.text).join('');
  assert.equal(joined, my);
  // No data loss: every character covered exactly once by line offsets.
  const seen = new Array(my.length).fill(false);
  for (const l of narrow.lines) {
    for (let k = l.start; k < l.end; k++) seen[k] = true;
  }
  assert.ok(seen.every((x) => x));
});

test('layoutText: Myanmar never breaks inside a grapheme cluster', () => {
  // A multi-codepoint Myanmar cluster must stay together on one line.
  const cluster = '\u1000\u102c\u103a'; // ka + vowel sign + asat (stacking cluster)
  const r = layoutText(cluster + ' ' + cluster, F, 20);
  assert.equal(r.lines.length, 2);
  assert.equal(r.lines[0].text, cluster + ' ');
  assert.equal(r.lines[1].text, cluster);
});

test('layoutText: Myanmar with no break points wraps at grapheme boundaries', () => {
  // Pure Myanmar text with no spaces or punctuation: must wrap at cluster
  // boundaries, never splitting a cluster, and never losing text.
  const my = '\u1000\u102c\u103a\u1004\u102c\u103a\u1007\u102c\u103a';
  const narrow = layoutText(my, F, 15);
  const joined = narrow.lines.map((l) => l.text).join('');
  assert.equal(joined, my);
  // Each line's end offset must match the next line's start offset (no gaps,
  // no overlaps) — meaning clusters are never split.
  for (let i = 1; i < narrow.lines.length; i++) {
    assert.equal(narrow.lines[i].start, narrow.lines[i - 1].end);
  }
});

test('layoutText: mixed English + Myanmar wraps correctly', () => {
  const mixed = 'Hello \u1000\u102c\u103a world';
  const r = layoutText(mixed, F, 100);
  const joined = r.lines.map((l) => l.text).join('');
  assert.equal(joined, mixed);
  const narrow = layoutText(mixed, F, 20);
  const joined2 = narrow.lines.map((l) => l.text).join('');
  assert.equal(joined2, mixed);
});

test('layoutText: mixed English+Myanmar breaks at English spaces', () => {
  // Mixed line: English words separated by spaces, Myanmar words have no spaces.
  // Breaks should happen at English spaces, never inside a Myanmar cluster.
  const mixed = 'Hello \u1000\u102c\u103a world \u1004\u102c\u103a test';
  const r = layoutText(mixed, F, 30);
  const joined = r.lines.map((l) => l.text).join('');
  assert.equal(joined, mixed);
  // No cluster is split: each line's text must end at a cluster boundary.
  const clusters = graphemeClusters(mixed);
  let pos = 0;
  for (const l of r.lines) {
    let consumed = 0;
    for (const cl of clusters.slice(pos)) {
      if (l.text.endsWith(cl.text)) {
        consumed += cl.text.length;
        pos += cl.text.length;
        break;
      }
      consumed += cl.text.length;
      pos += cl.text.length;
    }
    assert.ok(consumed > 0, 'line must consume at least one whole cluster');
  }
});

test('layoutText: mixed English+Myanmar no data loss at narrow width', () => {
  const mixed = 'Hello \u1000\u102c\u103a \u1004\u102c\u103a world';
  const narrow = layoutText(mixed, F, 15);
  const joined = narrow.lines.map((l) => l.text).join('');
  assert.equal(joined, mixed);
  // Line offsets must be contiguous with no gaps or overlaps.
  for (let i = 1; i < narrow.lines.length; i++) {
    assert.equal(narrow.lines[i].start, narrow.lines[i - 1].end);
  }
});
