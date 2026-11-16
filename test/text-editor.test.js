import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { TextEditor } from '../js/editor/text-editor.js';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;

test('text-editor: mounts and is contentEditable', (t) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const editor = new TextEditor(
    { writeWidthPx: 400, writeHeightPx: 500, lineHeightPx: 20, fontFamily: 'Arial', fontSizePx: 16 },
    {}
  );
  editor.mount(container, 'page-1');
  assert.ok(editor._el);
  assert.strictEqual(editor._el.getAttribute('contenteditable'), 'true');
  assert.strictEqual(editor._el.getAttribute('role'), 'textbox');
  assert.strictEqual(editor._el.getAttribute('aria-multiline'), 'true');
  assert.strictEqual(editor._el.style.pointerEvents, 'none');
  editor.destroy();
});

test('text-editor: enable allows editing, disable prevents it', (t) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const editor = new TextEditor(
    { writeWidthPx: 400, writeHeightPx: 500, lineHeightPx: 20, fontFamily: 'Arial', fontSizePx: 16 },
    {}
  );
  editor.mount(container, 'page-1');
  editor.enable(true);
  assert.strictEqual(editor._el.style.pointerEvents, 'auto');
  editor.enable(false);
  assert.strictEqual(editor._el.style.pointerEvents, 'none');
  editor.destroy();
});

test('text-editor: text get/set works', (t) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const editor = new TextEditor(
    { writeWidthPx: 400, writeHeightPx: 500, lineHeightPx: 20, fontFamily: 'Arial', fontSizePx: 16 },
    {}
  );
  editor.mount(container, 'page-1');
  editor.text('Hello \u1000\u1001\u1002 World');
  assert.strictEqual(editor.text(), 'Hello \u1000\u1001\u1002 World');
  editor.destroy();
});

test('text-editor: focus works when enabled', (t) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const editor = new TextEditor(
    { writeWidthPx: 400, writeHeightPx: 500, lineHeightPx: 20, fontFamily: 'Arial', fontSizePx: 16 },
    {}
  );
  editor.mount(container, 'page-1');
  editor.enable(true);
  editor.focus();
  assert.strictEqual(document.activeElement, editor._el);
  editor.destroy();
});

test('text-editor: input callback fires on text change', (t) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let captured = null;
  const editor = new TextEditor(
    { writeWidthPx: 400, writeHeightPx: 500, lineHeightPx: 20, fontFamily: 'Arial', fontSizePx: 16 },
    { onInput: (text) => { captured = text; } }
  );
  editor.mount(container, 'page-1');
  editor._el.textContent = 'Test input';
  editor._el.dispatchEvent(new window.InputEvent('input', { bubbles: true, cancelable: true }));
  assert.strictEqual(captured, 'Test input');
  editor.destroy();
});

test('text-editor: maxLines estimates from write area', (t) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const editor = new TextEditor(
    { writeWidthPx: 400, writeHeightPx: 400, lineHeightPx: 20, fontFamily: 'Arial', fontSizePx: 16 },
    {}
  );
  editor.mount(container, 'page-1');
  assert.strictEqual(editor.maxLines(), 20);
  editor.destroy();
});

test('text-editor: destroy removes from DOM', (t) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const editor = new TextEditor(
    { writeWidthPx: 400, writeHeightPx: 500, lineHeightPx: 20, fontFamily: 'Arial', fontSizePx: 16 },
    {}
  );
  editor.mount(container, 'page-1');
  assert.strictEqual(container.children.length, 1);
  editor.destroy();
  assert.strictEqual(container.children.length, 0);
});

test('text-editor: positioned at writing area origin with baseline offset', (t) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const editor = new TextEditor(
    {
      writeWidthPx: 400,
      writeHeightPx: 500,
      originXPx: 94,
      originYPx: 94,
      baselineOffsetPx: 13,
      lineHeightPx: 30,
      fontFamily: 'Arial',
      fontSizePx: 18,
    },
    {}
  );
  editor.mount(container, 'page-1');
  // Left inside margin, top shifted up by baseline offset so baseline sits on first rule.
  assert.strictEqual(editor._el.style.left, '94px');
  assert.strictEqual(editor._el.style.top, '81px'); // 94 - 13
  assert.strictEqual(editor._el.style.width, '400px');
  // Width equals write width, not running into margin.
  assert.strictEqual(editor._el.style.maxHeight, '500px');
  editor.destroy();
});

test('text-editor: line height equals one ruling interval', (t) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  // 8 mm spacing = about 30 px, lineHeightPx should equal that (not multiplied by LINE_HEIGHT).
  const editor = new TextEditor(
    { writeWidthPx: 400, writeHeightPx: 300, lineHeightPx: 30, fontFamily: 'Arial', fontSizePx: 18 },
    {}
  );
  editor.mount(container, 'page-1');
  assert.strictEqual(editor._el.style.lineHeight, '30px');
  assert.strictEqual(editor.maxLines(), 10); // 300 / 30
  editor.destroy();
});
