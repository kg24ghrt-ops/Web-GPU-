const DEFAULTS = {
  'paper.type': 'asia-b5-ruled',
  'paper.marginMm': 20,
  'paper.lineSpacingMm': 8,
  'typography.fontFamily': "'Noto Serif Myanmar','Noto Sans Myanmar','Myanmar Text','Segoe UI Symbol',Arial,sans-serif",
  'typography.fontSize': '18px',
  'typography.lineHeight': 1.6,
  'storage.key': 'notebook:v1',
  'storage.version': 1,
  'ui.mode': 'text',
};
export class Settings {
  constructor(values = {}) { this._ = { ...DEFAULTS, ...values }; }
  get(key) {
    if (!(key in this._)) throw new Error(`settings: unknown key "${key}"`);
    return this._[key];
  }
  set(key, value) {
    if (!(key in this._)) throw new Error(`settings: unknown key "${key}"`);
    this._[key] = value;
    return this;
  }
  toJSON() { return { ...this._ }; }
}
