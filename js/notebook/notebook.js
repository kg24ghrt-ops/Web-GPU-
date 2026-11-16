import { PageManager } from '../pages/pages.js';
import { DEFAULT_FONT } from '../typography/typography.js';
export class Notebook {
  constructor({ title = 'Notebook', pages, strokesByPage, textByPage, fontSettings } = {}) {
    this.title = title;
    this.pages = pages || new PageManager();
    this.strokesByPage = new Map(strokesByPage || []);
    this.textByPage = new Map(textByPage || []);
    this.fontSettings = { ...DEFAULT_FONT, ...(fontSettings || {}) };
  }

  fontChoice(script) {
    return this.fontSettings && this.fontSettings[script]
      ? this.fontSettings[script]
      : DEFAULT_FONT[script];
  }

  setFontChoice(script, id) {
    this.fontSettings = { ...this.fontSettings, [script]: id };
    this.pages.get(this.currentPage().id).touch();
    return this;
  }
  addPage(page) { this.pages.add(page); return page; }
  createPage(opts) { return this.pages.create(opts); }
  getPage(id) { return this.pages.get(id); }
  currentPage() { return this.pages.current(); }
  switchPage(id) { return this.pages.switch(id); }
  removePage(id) {
    this.pages.remove(id);
    this.strokesByPage.delete(id);
    this.textByPage.delete(id);
  }
  setStrokes(pageId, strokes) { this.pages.get(pageId); this.strokesByPage.set(pageId, strokes); this.pages.get(pageId).touch(); }
  getStrokes(pageId) { this.pages.get(pageId); return this.strokesByPage.get(pageId) || []; }
  setText(pageId, text) { this.pages.get(pageId); this.textByPage.set(pageId, text); this.pages.get(pageId).touch(); }
  getText(pageId) { this.pages.get(pageId); return this.textByPage.get(pageId) || ''; }
  toJSON() {
    return {
      title: this.title,
      pages: this.pages.toJSON(),
      strokesByPage: Object.fromEntries(this.strokesByPage),
      textByPage: Object.fromEntries(this.textByPage),
      fontSettings: this.fontSettings,
    };
  }
  static fromJSON(json) {
    const pages = PageManager.fromJSON(json && json.pages);
    const strokesByPage = new Map(Object.entries((json && json.strokesByPage) || {}));
    const textByPage = new Map(Object.entries((json && json.textByPage) || {}));
    const fontSettings = json && json.fontSettings ? { ...DEFAULT_FONT, ...json.fontSettings } : { ...DEFAULT_FONT };
    return new Notebook({ title: json && json.title, pages, strokesByPage, textByPage, fontSettings });
  }
}
