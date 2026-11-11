import { logger } from '../common/logger.js';
export class Editor {
  constructor() { this._el = null; this._onInput = null; }
  mount(container) {
    if (this._el) return this;
    this._el = document.createElement('div');
    this._el.setAttribute('contenteditable', 'true');
    this._el.contentEditable = 'true';
    this._el.className = 'page__editor';
    this._el.spellcheck = false;
    this._el.tabIndex = 0;
    this._el.autocomplete = 'off';
    this._el.autocapitalize = 'sentences';
    this._el.setAttribute('role', 'textbox');
    this._el.setAttribute('aria-multiline', 'true');
    this._el.addEventListener('input', () => {
      if (this._onInput) this._onInput(this._el.textContent);
    });
    container.appendChild(this._el);
    return this;
  }
  text(value) {
    if (arguments.length === 0) return this._el ? this._el.textContent : '';
    if (this._el) this._el.textContent = value;
    return this;
  }
  focus() { if (this._el) this._el.focus(); }
  onInput(cb) { this._onInput = cb; return this; }
  enable(on) { if (this._el) this._el.classList.toggle('page__editor--active', on); }
  destroy() { if (this._el && this._el.parentNode) this._el.parentNode.removeChild(this._el); this._el = null; }
}
