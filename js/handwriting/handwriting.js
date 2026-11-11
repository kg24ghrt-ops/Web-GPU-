import { logger } from '../common/logger.js';
export class Stroke {
  constructor({ id, points = [], color = '#111827', width = 2 } = {}) {
    this.id = id ?? (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());
    this.points = points;
    this.color = color;
    this.width = width;
  }
  static fromJSON(o) { return new Stroke(o); }
  toJSON() { return { id: this.id, points: this.points, color: this.color, width: this.width }; }
}
export class Handwriting {
  constructor(canvas) {
    this._canvas = canvas;
    this._ctx = canvas.getContext('2d');
    this._strokes = [];
    this._active = null;
    this._enabled = false;
    canvas.addEventListener('pointerdown', this._onDown.bind(this));
    canvas.addEventListener('pointermove', this._onMove.bind(this));
    canvas.addEventListener('pointerup', this._onUp.bind(this));
    canvas.addEventListener('pointercancel', this._onUp.bind(this));
  }
  enable(on) {
    this._enabled = on;
    this._canvas.style.pointerEvents = on ? 'auto' : 'none';
  }
  _onDown(e) {
    if (!this._enabled) return;
    this._active = new Stroke({ points: [this._pos(e)] });
    this._strokes.push(this._active);
    this._draw();
  }
  _onMove(e) {
    if (!this._active) return;
    this._active.points.push(this._pos(e));
    this._draw();
  }
  _onUp() { this._active = null; this._draw(); }
  _pos(e) {
    const r = this._canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, t: Date.now() };
  }
  _draw() {
    const c = this._ctx;
    const { width: w, height: h } = this._canvas;
    c.clearRect(0, 0, w, h);
    for (const s of this._strokes) this._renderStroke(s);
  }
  _renderStroke(s) {
    if (s.points.length < 1) return;
    const c = this._ctx;
    c.beginPath();
    c.lineWidth = s.width;
    c.strokeStyle = s.color;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    const p0 = s.points[0];
    c.moveTo(p0.x, p0.y);
    for (const p of s.points.slice(1)) c.lineTo(p.x, p.y);
    c.stroke();
  }
  getStrokes() { return this._strokes.map(s => s.toJSON()); }
  setStrokes(json) {
    try { this._strokes = (json || []).map(o => Stroke.fromJSON(o)); this._draw(); }
    catch (err) { logger.error('handwriting', 'restore strokes', err.message, { cause: err }); }
  }
  clear() { this._strokes = []; this._draw(); }
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const r = this._canvas.getBoundingClientRect();
    this._canvas.width = Math.max(1, r.width * dpr);
    this._canvas.height = Math.max(1, r.height * dpr);
    this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._draw();
  }
}
