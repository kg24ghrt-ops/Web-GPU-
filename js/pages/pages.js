import { AppError } from '../common/errors.js';
export class Page {
  constructor({ id, title, paperType = 'asia-b5-ruled', createdAt = Date.now(), updatedAt = Date.now() } = {}) {
    this.id = id;
    this.title = title;
    this.paperType = paperType;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
  static fromJSON(o) { return new Page(o); }
  toJSON() { return { id: this.id, title: this.title, paperType: this.paperType, createdAt: this.createdAt, updatedAt: this.updatedAt }; }
  touch() { this.updatedAt = Date.now(); }
}
export class PageManager {
  constructor() { this._pages = []; this._byId = new Map(); this._currentId = null; }
  add(page) {
    if (this._byId.has(page.id)) throw new AppError({ module: 'pages', operation: 'add', message: `page "${page.id}" already exists`, retryable: false });
    this._pages.push(page);
    this._byId.set(page.id, page);
    if (!this._currentId) this._currentId = page.id;
    return page;
  }
  create({ title = 'Untitled', paperType } = {}) {
    const id = 'page-' + Date.now() + '-' + Math.floor(Math.random() * 100000);
    return this.add(new Page({ id, title, paperType }));
  }
  get(id) {
    const p = this._byId.get(id);
    if (!p) throw new AppError({ module: 'pages', operation: 'get', message: `page "${id}" not found`, retryable: false });
    return p;
  }
  current() { return this._currentId ? this.get(this._currentId) : null; }
  switch(id) { this.get(id); this._currentId = id; return this.current(); }
  remove(id) {
    this.get(id);
    this._pages = this._pages.filter(p => p.id !== id);
    this._byId.delete(id);
    if (this._currentId === id) this._currentId = this._pages[0]?.id ?? null;
  }
  list() { return this._pages.map(p => ({ ...p })); }
  toJSON() { return { pages: this._pages.map(p => p.toJSON()), currentId: this._currentId }; }
  static fromJSON(json) {
    const m = new PageManager();
    for (const o of (json && json.pages || [])) m.add(Page.fromJSON(o));
    if (json && json.currentId) m._currentId = json.currentId;
    return m;
  }
}
