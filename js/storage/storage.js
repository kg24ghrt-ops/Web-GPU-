import { AppError, wrap } from '../common/errors.js';
import { logger } from '../common/logger.js';
export class Storage {
  constructor({ store = null, key = 'notebook:v1', version = 1 } = {}) {
    this._store = store ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    this._key = key;
    this._version = version;
    if (!this._store) throw new AppError({ module: 'storage', operation: 'construct', message: 'no storage backend available', retryable: false });
  }
  _tmpKey() { return this._key + ':tmp'; }
  serialize(notebook) { return JSON.stringify({ version: this._version, ...notebook.toJSON() }); }
  deserialize(text) {
    let obj;
    try { obj = JSON.parse(text); }
    catch (err) { throw new AppError({ module: 'storage', operation: 'parse', message: 'document data is corrupted', cause: err, retryable: true }); }
    if (obj.version !== this._version) throw new AppError({ module: 'storage', operation: 'migrate', message: `schema version ${obj.version} unsupported (current ${this._version})`, retryable: false });
    return obj;
  }
  save(notebook) {
    try {
      const text = this.serialize(notebook);
      this._store.setItem(this._tmpKey(), text);
      this._store.setItem(this._key, text);
      this._store.removeItem(this._tmpKey());
    } catch (err) { throw wrap(err, { module: 'storage', operation: 'save', retryable: true }); }
  }
  load() {
    let last;
    for (const k of [this._key, this._tmpKey()]) {
      let raw;
      try { raw = this._store.getItem(k); }
      catch (err) { last = wrap(err, { module: 'storage', operation: 'load', retryable: true }); continue; }
      if (raw === null) continue;
      try { return this.deserialize(raw); }
      catch (err) { last = err; continue; }
    }
    if (last) throw last;
    return null;
  }
  clear() { this._store.removeItem(this._key); this._store.removeItem(this._tmpKey()); }
}
