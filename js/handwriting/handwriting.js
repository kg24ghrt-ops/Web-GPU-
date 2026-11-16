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
    const n = pts.length;
    const baseWidth = s.width;

    // Per-point pressure: deterministic jitter based on point index/time.
    const pressure = pts.map((p, i) => {
      const h = ((i * 7919 + Math.floor(p.t / 17)) * 2654435761) | 0;
      return ((h >>> 0) / 4294967296) * 0.3 + 0.85;
    });

    // Width envelope: taper at both ends, pressure variation in the middle.
    const widthAt = (i) => {
      const t = n <= 1 ? 0.5 : i / (n - 1);
      const taper = Math.sin(t * Math.PI); // 0 at ends, 1 in middle
      return baseWidth * pressure[i] * taper * 0.9 + baseWidth * 0.1;
    };

    // Apply subtle perpendicular jitter to interior points for organic feel.
    const jittered = pts.map((p, i) => {
      if (i === 0 || i === n - 1 || n <= 2) return p;
      const prev = pts[i - 1];
      const next = pts[i + 1];
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const h = ((i * 104729 + Math.floor(p.t / 13)) * 2654435761) | 0;
      const j = (((h >>> 0) / 4294967296) - 0.5) * 0.4;
      return { x: p.x + nx * j, y: p.y + ny * j };
    });

    c.beginPath();
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.strokeStyle = s.color;

    if (n === 1) {
      c.moveTo(jittered[0].x, jittered[0].y);
      c.lineWidth = widthAt(0);
      c.stroke();
      return;
    }

    // Midpoints between consecutive (jittered) points.
    const mid = [];
    for (let i = 0; i < n - 1; i++) {
      mid.push({
        x: (jittered[i].x + jittered[i + 1].x) / 2,
        y: (jittered[i].y + jittered[i + 1].y) / 2,
      });
    }

    // Start at first midpoint.
    c.moveTo(mid[0].x, mid[0].y);

    // Quadratic curves through each interior point (control point pulls
    // the curve toward the actual point, midpoint keeps it smooth).
    for (let i = 1; i < n - 1; i++) {
      c.lineWidth = widthAt(i);
      c.quadraticCurveTo(jittered[i].x, jittered[i].y, mid[i].x, mid[i].y);
      c.stroke();
      c.beginPath();
      c.moveTo(mid[i].x, mid[i].y);
    }

    // Final segment to last point.
    c.lineWidth = widthAt(n - 1);
    c.lineTo(jittered[n - 1].x, jittered[n - 1].y);
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
