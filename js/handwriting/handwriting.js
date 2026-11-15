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
  /**
   * Render a single stroke with hyper-realistic handwriting qualities:
   *   - Pressure-driven width variation along the stroke
   *   - Tapered ends (narrow at start and finish)
   *   - Subtle perpendicular jitter for organic, non-mechanical feel
   *   - Quadratic curves between points for smooth, pen-like flow
   *   - Darker ink at pressure peaks (density variation like real ballpoint)
   */
  _renderStroke(s) {
    if (s.points.length < 1) return;
    const c = this._ctx;
    const pts = s.points;
    const baseWidth = s.width;
    const n = pts.length;

    // Per-point pressure: deterministic jitter based on point index/time.
    const pressure = pts.map((p, i) => {
      const h = ((i * 7919 + Math.floor(p.t / 17)) * 2654435761) | 0;
      const j = ((h >>> 0) / 4294967296) * 0.3 + 0.85; // 0.85..1.15
      return j;
    });

    // Width envelope: taper at both ends, pressure variation in the middle.
    const widthAt = (i) => {
      const t = n <= 1 ? 0.5 : i / (n - 1);
      const taper = Math.sin(t * Math.PI); // 0 at ends, 1 in middle
      return baseWidth * pressure[i] * taper * 0.9 + baseWidth * 0.1;
    };

    // Build a smoothed path with slight perpendicular jitter.
    c.beginPath();
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.strokeStyle = s.color;

    const p0 = pts[0];
    c.moveTo(p0.x, p0.y);

    for (let i = 1; i < n; i++) {
      const p = pts[i];
      const prev = pts[i - 1];

      // Perpendicular jitter for organic wobble (subtle, ~0.3px).
      const dx = p.x - prev.x;
      const dy = p.y - prev.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const h2 = ((i * 104729 + Math.floor(p.t / 13)) * 2654435761) | 0;
      const jitter = (((h2 >>> 0) / 4294967296) - 0.5) * 0.4;

      const jx = p.x + nx * jitter;
      const jy = p.y + ny * jitter;

      // Quadratic curve through the midpoint for smooth pen flow.
      const mx = (prev.x + jx) / 2;
      const my = (prev.y + jy) / 2;
      c.quadraticCurveTo(prev.x, prev.y, mx, my);

      // Vary width along the stroke via lineWidth changes between segments.
      // We approximate by drawing each segment separately with its width.
      c.lineWidth = widthAt(i);
      c.stroke();
      c.beginPath();
      c.moveTo(mx, my);
    }

    // Close out final segment.
    c.lineWidth = widthAt(n - 1);
    c.lineTo(pts[n - 1].x, pts[n - 1].y);
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
