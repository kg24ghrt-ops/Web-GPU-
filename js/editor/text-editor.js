/**
 * Text editor — page-aware contentEditable editor.
 *
 * Uses a native contentEditable div so the browser's platform text layout
 * engine handles:
 *   - Complex text shaping (Myanmar, Indic, Arabic, etc.)
 *   - Cursor movement and selection by grapheme cluster
 *   - IME input and mobile keyboards
 *   - Undo/redo
 *
 * Responsibilities (text subsystem only):
 *   - Text input, editing, selection, cursor behaviour
 *   - Constraining text to the page's writing area (margins respected)
 *   - Estimating line count and detecting page overflow
 *   - Storing/retrieving text content per page
 *
 * Does NOT handle paper rendering or handwriting strokes — those are
 * owned by the paper and handwriting subsystems.
 *
 * Myanmar Unicode support:
 *   - contentEditable delegates shaping to the OS (Uniscribe/CoreText/Pango)
 *   - CSS font-family includes Myanmar-capable fonts
 *   - overflow-wrap handles phrase-based line breaking (Myanmar has no word spaces)
 *   - white-space: pre-wrap preserves phrase spaces and ZWSP break opportunities
 */

import { mmToPx, snapPx } from '../units.js';

/**
 * Editor configuration.
 * @typedef {Object} EditorConfig
 * @property {number} writeWidthPx - Writing area width in CSS px
 * @property {number} writeHeightPx - Writing area height in CSS px
 * @property {number} originXPx - Writing area origin X in CSS px (left margin)
 * @property {number} originYPx - Writing area origin Y in CSS px (top margin / first rule)
 * @property {number} baselineOffsetPx - Approximate font ascent so glyph baseline sits on the first rule
 * @property {number} lineHeightPx - Line height in CSS px (for overflow estimation)
 * @property {string} fontFamily - CSS font-family string
 * @property {number} fontSizePx - Font size in CSS px
 */

/**
 * Editor event callbacks.
 * @typedef {Object} EditorCallbacks
 * @property {(text: string) => void} [onInput] - Fired when text changes
 * @property {() => void} [onOverflow] - Fired when text exceeds page capacity
 * @property {() => void} [onFocus] - Fired when editor gains focus
 * @property {() => void} [onBlur] - Fired when editor loses focus
 */

export class TextEditor {
  /**
   * @param {EditorConfig} config
   * @param {EditorCallbacks} callbacks
   */
  constructor(config, callbacks = {}) {
    this._el = null;
    this._config = {
      originXPx: 0,
      originYPx: 0,
      baselineOffsetPx: 0,
      ...config,
    };
    this._callbacks = callbacks;
    this._onInputBound = this._onInput.bind(this);
    this._onFocusBound = this._onFocus.bind(this);
    this._onBlurBound = this._onBlur.bind(this);
    this._enabled = false;
    this._pageId = null;
  }

  /**
   * Mount the editor into a container element.
   * @param {HTMLElement} container - Parent element
   * @param {string} pageId - Identifier of the page this editor belongs to
   * @returns {TextEditor}
   */
  mount(container, pageId) {
    if (this._el) return this;
    this._pageId = pageId;

    this._el = document.createElement('div');
    this._el.setAttribute('contenteditable', 'true');
    this._el.className = 'page__editor';
    this._el.setAttribute('role', 'textbox');
    this._el.setAttribute('aria-multiline', 'true');
    this._el.spellcheck = false;
    this._el.tabIndex = 0;
    this._el.autocomplete = 'off';
    this._el.autocapitalize = 'sentences';

    // Constrain text to the writing area. width is set explicitly so text
    // wraps at the right margin; height auto-grows so we can measure overflow.
    // Positioned at the writing area origin (inside margins). top is shifted
    // up by baselineOffsetPx so the glyph baseline (not the line-box top)
    // lands on the first ruling line.
    this._el.style.position = 'absolute';
    this._el.style.top = snapPx(this._config.originYPx - this._config.baselineOffsetPx) + 'px';
    this._el.style.left = snapPx(this._config.originXPx) + 'px';
    this._el.style.width = snapPx(this._config.writeWidthPx) + 'px';
    this._el.style.minHeight = snapPx(this._config.writeHeightPx) + 'px';
    this._el.style.maxHeight = snapPx(this._config.writeHeightPx) + 'px';
    this._el.style.overflowY = 'hidden';
    this._el.style.boxSizing = 'border-box';

    // Typography: Myanmar-capable font stack, pre-wrap for phrase spaces/ZWSP.
    this._el.style.fontFamily = this._config.fontFamily;
    this._el.style.fontSize = snapPx(this._config.fontSizePx) + 'px';
    this._el.style.lineHeight = snapPx(this._config.lineHeightPx) + 'px';
    this._el.style.whiteSpace = 'pre-wrap';
    this._el.style.wordWrap = 'break-word';
    this._el.style.overflowWrap = 'anywhere';
    this._el.style.color = '#1a3a5c';
    this._el.style.caretColor = '#1a3a5c';
    this._el.style.outline = 'none';

    // Disabled by default — enabled when text mode is active.
    this._el.style.pointerEvents = 'none';
    this._el.style.userSelect = 'none';

    this._el.addEventListener('input', this._onInputBound);
    this._el.addEventListener('focus', this._onFocusBound);
    this._el.addEventListener('blur', this._onBlurBound);

    container.appendChild(this._el);
    return this;
  }

  /**
   * Enable or disable text editing. When disabled, the editor is visually
   * present but not focusable or editable.
   * @param {boolean} on
   */
  enable(on) {
    if (!this._el) return;
    this._enabled = on;
    this._el.style.pointerEvents = on ? 'auto' : 'none';
    this._el.style.userSelect = on ? 'auto' : 'none';
    if (on) {
      this._el.focus();
    }
  }

  /**
   * Get or set the editor text content.
   * @param {string} [value] - New text content
   * @returns {string | TextEditor} Current text or this for chaining
   */
  text(value) {
    if (arguments.length === 0) {
      return this._el ? this._el.textContent : '';
    }
    if (this._el) {
      this._el.textContent = value;
    }
    return this;
  }

  /**
   * Focus the editor element. Only meaningful when enabled.
   */
  focus() {
    if (this._el && this._enabled) {
      this._el.focus();
    }
  }

  /**
   * Register an input change callback.
   * @param {(text: string) => void} cb
   * @returns {TextEditor}
   */
  onInput(cb) {
    this._callbacks.onInput = cb;
    return this;
  }

  /**
   * Register an overflow callback.
   * @param {() => void} cb
   * @returns {TextEditor}
   */
  onOverflow(cb) {
    this._callbacks.onOverflow = cb;
    return this;
  }

  /**
   * Check whether the current text exceeds the page's writing area capacity.
   * Estimates by comparing the editor's scrollHeight to the writing area height.
   * @returns {boolean} True if text overflows the page
   */
  isOverflowing() {
    if (!this._el) return false;
    return this._el.scrollHeight > this._config.writeHeightPx;
  }

  /**
   * Estimate how many lines of text fit in the writing area.
   * @returns {number} Max lines
   */
  maxLines() {
    if (!this._config.lineHeightPx || this._config.lineHeightPx <= 0) return 0;
    return Math.floor(this._config.writeHeightPx / this._config.lineHeightPx);
  }

  /**
   * Estimate the current line count based on scroll height.
   * @returns {number} Estimated lines
   */
  lineCount() {
    if (!this._el || !this._config.lineHeightPx || this._config.lineHeightPx <= 0) return 0;
    return Math.ceil(this._el.scrollHeight / this._config.lineHeightPx);
  }

  /**
   * Clear the editor content.
   * @returns {TextEditor}
   */
  clear() {
    if (this._el) this._el.textContent = '';
    return this;
  }

  /**
   * Destroy the editor and remove it from the DOM.
   */
  destroy() {
    if (!this._el) return;
    this._el.removeEventListener('input', this._onInputBound);
    this._el.removeEventListener('focus', this._onFocusBound);
    this._el.removeEventListener('blur', this._onBlurBound);
    if (this._el.parentNode) {
      this._el.parentNode.removeChild(this._el);
    }
    this._el = null;
    this._enabled = false;
    this._pageId = null;
  }

  // --- internal ---

  _onInput() {
    if (this._callbacks.onInput) {
      this._callbacks.onInput(this._el.textContent);
    }
  }

  _onFocus() {
    if (this._callbacks.onFocus) this._callbacks.onFocus();
  }

  _onBlur() {
    if (this._callbacks.onBlur) this._callbacks.onBlur();
  }
}
