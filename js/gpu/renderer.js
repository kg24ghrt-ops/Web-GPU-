/**
 * WebGPU notebook renderer.
 *
 * Renders a photorealistic school-lined notebook page entirely on the GPU:
 *   1. Paper material — compute shader writes a procedural paper sheet
 *      (off-white colour, nonuniform distribution, multi-scale fibres,
 *      surface roughness + height field) into a paper texture.
 *   2. Ink — stroke geometry (variable width, pressure, pigment density)
 *      rendered into an ink texture.
 *   3. Composite — full-screen quad combines lit paper, blue-grey ruling,
 *      red-brown margin line and premultiplied ink into the page image.
 *
 * The document model (page size, template, strokes) is plain data kept
 * independent of GPU resources so it survives device loss.
 */

import { logger } from '../common/logger.js';
import { wrap } from '../common/errors.js';
import { detectCapabilities, requestDevice, withinLimits } from './webgpu.js';

const SHADER_DIR = 'js/gpu/shaders';

/** Pen material configurations (ballpoint vs gel). */
export const PEN_MATERIALS = {
  ballpoint: {
    id: 'ballpoint',
    name: 'Ballpoint',
    color: '#1a3a5c',
    widthPx: 1.6,
    pressureResponse: 0.9,
    description: 'Drier, slightly scratchy line with softer edges.',
  },
  gel: {
    id: 'gel',
    name: 'Gel Pen',
    color: '#0b3d62',
    widthPx: 1.2,
    pressureResponse: 1.2,
    description: 'Wetter, more saturated line with sharper edges.',
  },
};

export const DEFAULT_RULING = {
  lineSpacingMm: 8.0,
  lineWidthMm: 0.5,
  lineColor: [0.55, 0.68, 0.86, 0.75],   // blue-grey
  marginLineColor: [0.70, 0.18, 0.18, 0.9], // red-brown
  marginMm: 25,
  topMarginMm: 25,
  lightDir: [0.6, -0.8, 1.0],
  ambient: 0.82,
};

function loadWgsl(name) {
  return fetch(`${SHADER_DIR}/${name}.wgsl`).then((r) => {
    if (!r.ok) throw new Error(`gpu: failed to load shader ${name}.wgsl`);
    return r.text();
  });
}

function mmToPx(mm) { return mm * (96 / 25.4); }

/**
 * Build variable-width stroke geometry for a single stroke.
 * Returns Float32Array interleaved: position(x,y), halfWidth, signedDist,
 * color(r,g,b,a), pressure.  Stride = 9 floats = 36 bytes.
 *
 * Each segment becomes a quad (two triangles):
 *   A = p0 - w0*n, B = p1 - w1*n, C = p0 + w0*n, D = p1 + w1*n
 *   tri1: A B C   tri2: B D C
 * where n is the segment normal. In the fragment shader,
 * across = abs(signedDist)/halfWidth  (0 = centreline, 1 = edge).
 */
export function buildStrokeGeometry(stroke) {
  const pts = stroke.points || [];
  if (pts.length < 2) return new Float32Array(0);

  const color = stroke.color || '#111827';
  const c = parseCssColor(color);
  const baseWidth = (stroke.width || 1.5) / 2; // half-width in px

  const verts = [];
  const push = (x, y, hw, sd, r, g, b, a, p) => {
    verts.push(x, y, hw, sd, r, g, b, a, p);
  };

  // Per-point pressure derived from speed: slower (closer points) = harder.
  const pressures = [];
  for (let i = 0; i < pts.length; i++) {
    let p = 0.6;
    if (i > 0) {
      const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      const dt = Math.max(pts[i].t - pts[i - 1].t, 1);
      const speed = d / Math.max(dt, 1);
      p = 1.0 - Math.min(1.0, speed / 60); // slower -> higher pressure
      p = 0.4 + 0.6 * p;
    }
    pressures.push(p);
  }

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) continue;
    const nx = -dy / len;
    const ny = dx / len;

    const w0 = baseWidth * (0.85 + 0.3 * pressures[i]);
    const w1 = baseWidth * (0.85 + 0.3 * pressures[i + 1]);

    const r = c[0], g = c[1], b = c[2], a = c[3];
    // Two triangles per segment quad:
    //   A = p0 - w0*n, B = p1 - w1*n, C = p0 + w0*n, D = p1 + w1*n
    //   tri1: A B C   tri2: B D C
    push(p0.x - w0 * nx, p0.y - w0 * ny, w0, -w0, r, g, b, a, pressures[i]); // A
    push(p1.x - w1 * nx, p1.y - w1 * ny, w1, -w1, r, g, b, a, pressures[i + 1]); // B
    push(p0.x + w0 * nx, p0.y + w0 * ny, w0, w0, r, g, b, a, pressures[i]); // C
    push(p1.x - w1 * nx, p1.y - w1 * ny, w1, -w1, r, g, b, a, pressures[i + 1]); // B
    push(p1.x + w1 * nx, p1.y + w1 * ny, w1, w1, r, g, b, a, pressures[i + 1]); // D
    push(p0.x + w0 * nx, p0.y + w0 * ny, w0, w0, r, g, b, a, pressures[i]); // C
  }

  return new Float32Array(verts);
}

function parseCssColor(css) {
  const m = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(css);
  if (m) {
    return [
      parseInt(m[1], 16) / 255,
      parseInt(m[2], 16) / 255,
      parseInt(m[3], 16) / 255,
      1,
    ];
  }
  return [0.1, 0.1, 0.1, 1];
}

export class WebGpuRenderer {
  constructor({ canvas, device, report, onStatus }) {
    this._canvas = canvas;
    this._ctx = null;
    this._device = device || null;
    this._report = report || null;
    this._onStatus = onStatus || (() => {});
    this._pipelinePaper = null;
    this._pipelineInk = null;
    this._pipelineComposite = null;
    this._paperTexture = null;
    this._inkTexture = null;
    this._paperSampler = null;
    this._inkSampler = null;
    this._uniformBuffer = null;
    this._strokeBuffer = null;
    this._strokeVertexCount = 0;
    this._shaders = null;
    this._initialized = false;
    this._lost = false;
    this._canvasFormat = null;

    // Document model (plain data, GPU-independent).
    this._pageW = 0;
    this._pageH = 0;
    this._template = null;
    this._size = null;
    this._strokes = [];
    this._pen = PEN_MATERIALS.ballpoint;
    this._dirty = true;
  }

  get report() { return this._report; }
  get available() { return this._report && this._report.available && !!this._device; }
  get lost() { return this._lost; }

  async init() {
    if (typeof navigator === 'undefined' || !navigator.gpu) {
      this._report = { available: false, reason: 'navigator.gpu is not available' };
      this._onStatus('WebGPU unavailable');
      return;
    }

    this._onStatus('Initialising WebGPU…');
    let report = this._report;
    let device = this._device;
    if (!report) {
      report = await detectCapabilities();
      this._report = report;
    }
    if (!device && report.available) {
      const result = await requestDevice(report);
      report = result.report;
      device = result.device;
      this._report = report;
      this._device = device;
    }
    if (!device || !report.available) {
      this._onStatus('WebGPU unavailable: ' + (report && report.reason));
      this._lost = true;
      return;
    }

    console.info('[gpu] adapter ok');
    console.info('[gpu] device ok');

    const canvasFormat = this._report?.preferredCanvasFormat || 'rgba8unorm';
    this._canvasFormat = canvasFormat;

    try {
      await this._createPipelines(device, canvasFormat);
      console.info('[gpu] shaders loaded');
      console.info('[gpu] pipelines ok');
      this._createSamplers(device);
      this._createUniformBuffer(device);
      this._createdResourcesForSize(device, this._pageW || 1, this._pageH || 1);

      this._ctx = this._canvas.getContext('webgpu');
      this._ctx.configure({
        device,
        format: canvasFormat,
        alphaMode: 'premultiplied',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
      console.info('[gpu] context configured');
    } catch (err) {
      console.error('[gpu] init failed', err);
      this._report.available = false;
      this._report.reason = 'initialization failed: ' + (err && (err.message || String(err)));
      this._lost = true;
      this._onStatus('WebGPU unavailable: ' + this._report.reason);
      logger.error('gpu', 'initialization failed', wrap(err, { module: 'gpu', operation: 'init' }).toJSON());
      return;
    }

    this._initialized = true;
    this._lost = false;
    this._onStatus('Ready');
    logger.info('gpu', 'renderer initialised', { available: true });
  }

  async _createPipelines(device, canvasFormat) {
    const shaders = await Promise.all([
      loadWgsl('paper'),
      loadWgsl('ink'),
      loadWgsl('composite'),
    ]);
    this._shaders = shaders;

    this._pipelinePaper = device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: device.createShaderModule({ code: shaders[0] }),
        entryPoint: 'mainCs',
      },
    });

    this._pipelineInk = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: device.createShaderModule({ code: shaders[1] }),
        entryPoint: 'mainVs',
        buffers: [
          {
            arrayStride: 36,
            stepMode: 'vertex',
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x2' },   // position
              { shaderLocation: 1, offset: 8, format: 'float32' },     // halfWidth
              { shaderLocation: 2, offset: 12, format: 'float32' },    // signedDist
              { shaderLocation: 3, offset: 16, format: 'float32x4' },  // color
              { shaderLocation: 4, offset: 32, format: 'float32' },    // pressure
            ],
          },
        ],
      },
      fragment: {
        module: device.createShaderModule({ code: shaders[1] }),
        entryPoint: 'mainFs',
        targets: [{ format: 'rgba8unorm', blend: {
          color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          alpha: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        } }],
      },
      primitive: { topology: 'triangle-list' },
      depthStencil: null,
    });

    this._pipelineComposite = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: device.createShaderModule({ code: shaders[2] }),
        entryPoint: 'mainVs',
      },
      fragment: {
        module: device.createShaderModule({ code: shaders[2] }),
        entryPoint: 'mainFs',
        targets: [{ format: canvasFormat }],
      },
      primitive: { topology: 'triangle-strip' },
      depthStencil: null,
    });
  }

  _createSamplers(device) {
    this._paperSampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    this._inkSampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
  }

  _createUniformBuffer(device) {
    // 24 f32 = 96 bytes; pad to 256 for uniform-buffer alignment safety.
    this._uniformBuffer = device.createBuffer({
      size: 256,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  _createdResourcesForSize(device, w, h) {
    w = Math.max(1, Math.floor(w));
    h = Math.max(1, Math.floor(h));
    if (this._paperTexture && this._paperTexture.width === w && this._paperTexture.height === h) {
      return;
    }
    if (this._paperTexture) this._paperTexture.destroy();
    if (this._inkTexture) this._inkTexture.destroy();

    this._paperTexture = device.createTexture({
      size: [w, h, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
    });
    this._inkTexture = device.createTexture({
      size: [w, h, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
  }

  _paperBindGroup(device) {
    this._bindGroupPaper = device.createBindGroup({
      layout: this._pipelinePaper.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this._uniformBuffer } },
        { binding: 1, resource: this._paperTexture },
      ],
    });
    return this._bindGroupPaper;
  }

  _inkBindGroup(device) {
    this._bindGroupInk = device.createBindGroup({
      layout: this._pipelineInk.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this._uniformBuffer } },
      ],
    });
    return this._bindGroupInk;
  }

  _compositeBindGroup(device, paperTex, inkTex) {
    return device.createBindGroup({
      layout: this._pipelineComposite.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this._uniformBuffer } },
        { binding: 1, resource: paperTex },
        { binding: 2, resource: this._paperSampler },
        { binding: 3, resource: inkTex },
        { binding: 4, resource: this._inkSampler },
      ],
    });
  }

  /**
   * Set the document model (plain data). Call whenever the page changes.
   */
  setDocument({ pageW, pageH, template, size, strokes, pen }) {
    this._pageW = pageW;
    this._pageH = pageH;
    this._template = template;
    this._size = size;
    this._strokes = strokes || [];
    this._pen = pen || PEN_MATERIALS.ballpoint;
    this._dirty = true;
  }

  setStrokes(strokes) {
    this._strokes = strokes || [];
    this._dirty = true;
  }

  setPen(pen) {
    this._pen = pen || PEN_MATERIALS.ballpoint;
    this._dirty = true;
  }

  /** Render one display frame to the configured canvas. */
  async render() {
    if (!this._initialized || this._lost || !this._device) return;
    if (!this._pageW || !this._pageH) return;

    const device = this._device;
    const w = this._pageW;
    const h = this._pageH;
    this._createdResourcesForSize(device, w, h);

    // Write uniforms so the shaders receive page size, ruling, margin,
    // lighting and seed data on every display frame (not just PNG export).
    this._writeUniforms(device, w, h,
      this._template ? mmToPx(this._template.lineSpacingMm) : 8 * 3.7795,
      this._template ? mmToPx(DEFAULT_RULING.lineWidthMm) : 0.5 * 3.7795,
      this._template ? mmToPx(this._template.topMarginMm) : 25 * 3.7795,
      this._template ? mmToPx(this._template.marginMm) : 25 * 3.7795,
      this._template ? mmToPx(1.2) : 1.2 * 3.7795
    );

    if (this._dirty) {
      this._uploadStrokes(device);
      this._dirty = false;
    }

    const commandEncoder = device.createCommandEncoder();

    // 1. Paper: compute shader writes the paper texture.
    {
      const pass = commandEncoder.beginComputePass();
      pass.setPipeline(this._pipelinePaper);
      pass.setBindGroup(0, this._paperBindGroup(device));
      pass.dispatchWorkgroups(Math.ceil(w / 16), Math.ceil(h / 16));
      pass.end();
    }

    // 2. Ink: render strokes into the ink texture.
    if (this._strokeVertexCount > 0) {
      const rpd = {
        colorAttachments: [
          {
            view: this._inkTexture.createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      };
      const pass = commandEncoder.beginRenderPass(rpd);
      pass.setPipeline(this._pipelineInk);
      pass.setBindGroup(0, this._inkBindGroup(device));
      pass.setVertexBuffer(0, this._strokeBuffer);
      pass.draw(this._strokeVertexCount);
      pass.end();
    }

    // 3. Composite: full-screen quad to the canvas texture.
    const canvasTexture = this._ctx.getCurrentTexture();
    const rpd = {
      colorAttachments: [
        {
          view: canvasTexture.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    };
    const pass = commandEncoder.beginRenderPass(rpd);
    pass.setPipeline(this._pipelineComposite);
    pass.setBindGroup(0, this._compositeBindGroup(device, this._paperTexture, this._inkTexture));
    pass.draw(4);
    pass.end();

    device.queue.submit([commandEncoder.finish()]);
    await device.queue.onSubmittedWorkDone();
  }

  _uploadStrokes(device) {
    let total = 0;
    const perStroke = [];
    for (const s of this._strokes) {
      const g = buildStrokeGeometry(s);
      perStroke.push({ geometry: g, count: g.length / 9 });
      total += g.length / 9;
    }
    this._strokeVertexCount = total;

    if (!this._strokeBuffer || this._strokeBuffer.size < total * 36) {
      if (this._strokeBuffer) this._strokeBuffer.destroy();
      this._strokeBuffer = device.createBuffer({
        size: Math.max(4096, total * 36),
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    if (total > 0) {
      const data = new Float32Array(total * 9);
      let o = 0;
      for (const ps of perStroke) {
        data.set(ps.geometry, o);
        o += ps.geometry.length;
      }
      device.queue.writeBuffer(this._strokeBuffer, 0, data);
    }
  }

  /**
   * Write current uniforms to the uniform buffer based on target size + ruling.
   * A random seed is written each call so every render yields a slightly
   * different fibre / stain / crease pattern (hyper-realism variation).
   */
  _writeUniforms(device, width, height, lineSpacingPx, lineWidthPx, lineOffsetPx, marginXPx, marginLineWidthPx) {
    const lineColor = DEFAULT_RULING.lineColor;
    const marginLineColor = DEFAULT_RULING.marginLineColor;
    const lightDir = DEFAULT_RULING.lightDir;
    const ambient = DEFAULT_RULING.ambient;
    const data = new Float32Array(64); // 256 bytes / 4
    data[0] = width;
    data[1] = height;
    data[2] = lineSpacingPx;
    data[3] = lineWidthPx;
    data[4] = lineOffsetPx;
    data[5] = marginXPx;
    data[6] = marginLineWidthPx;
    data[7] = lineColor[0]; data[8] = lineColor[1]; data[9] = lineColor[2]; data[10] = lineColor[3];
    data[11] = marginLineColor[0]; data[12] = marginLineColor[1]; data[13] = marginLineColor[2]; data[14] = marginLineColor[3];
    data[15] = lightDir[0]; data[16] = lightDir[1]; data[17] = lightDir[2];
    data[18] = ambient;
    data[19] = Math.random(); // seed: random per render for variation
    data[20] = 0.0; // time
    device.queue.writeBuffer(this._uniformBuffer, 0, data);
  }

  /**
   * Export the complete rendered document at the given resolution using the
   * browser's built-in canvas.toBlob. Returns a Promise<Blob>.
   */
  async exportPng(exportW, exportH) {
    if (!this._initialized || this._lost || !this._device) {
      throw new Error('gpu: renderer not available for export');
    }
    const device = this._device;

    // Clamp to device limits.
    const maxTex = device.limits.maxTextureDimension2D;
    const scale = Math.min(1, maxTex / exportW, maxTex / exportH);
    let clampedW = exportW;
    let clampedH = exportH;
    if (scale < 1) {
      clampedW = Math.floor(exportW * scale);
      clampedH = Math.floor(exportH * scale);
      this._onStatus('Export clamped to ' + clampedW + 'x' + clampedH);
    }

    const w = Math.max(1, Math.floor(clampedW));
    const h = Math.max(1, Math.floor(clampedH));

    // Save canvas and page dimensions.
    const savedCanvasW = this._canvas.width;
    const savedCanvasH = this._canvas.height;
    const savedPageW = this._pageW;
    const savedPageH = this._pageH;

    let blob = null;
    try {
      // Resize canvas to export size.
      this._canvas.width = w;
      this._canvas.height = h;
      this._ctx.configure({
        device,
        format: this._canvasFormat,
        alphaMode: 'premultiplied',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });

      // Temporarily adopt export size for rendering.
      this._pageW = w;
      this._pageH = h;
      this._createdResourcesForSize(device, w, h);

      // Scale uniforms for export resolution.
      const sx = w / savedPageW;
      const sy = h / savedPageH;
      this._writeUniforms(device, w, h,
        this._template ? mmToPx(this._template.lineSpacingMm) * sy : 8 * 3.7795 * sy,
        this._template ? mmToPx(DEFAULT_RULING.lineWidthMm) * sy : 0.5 * 3.7795 * sy,
        this._template ? mmToPx(this._template.topMarginMm) * sy : 25 * 3.7795 * sy,
        this._template ? mmToPx(this._template.marginMm) * sx : 25 * 3.7795 * sx,
        this._template ? mmToPx(1.2) * sy : 1.2 * 3.7795 * sy
      );

      // Upload strokes at export scale.
      if (this._dirty) {
        this._uploadStrokes(device);
        this._dirty = false;
      }

      const commandEncoder = device.createCommandEncoder();

      // 1. Paper compute pass.
      {
        const pass = commandEncoder.beginComputePass();
        pass.setPipeline(this._pipelinePaper);
        pass.setBindGroup(0, this._paperBindGroup(device));
        pass.dispatchWorkgroups(Math.ceil(w / 16), Math.ceil(h / 16));
        pass.end();
      }

      // 2. Ink render pass.
      if (this._strokeVertexCount > 0) {
        const rpd = {
          colorAttachments: [{ view: this._inkTexture.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }],
        };
        const pass = commandEncoder.beginRenderPass(rpd);
        pass.setPipeline(this._pipelineInk);
        pass.setBindGroup(0, this._inkBindGroup(device));
        pass.setVertexBuffer(0, this._strokeBuffer);
        pass.draw(this._strokeVertexCount);
        pass.end();
      }

      // 3. Composite to canvas texture.
      const canvasTexture = this._ctx.getCurrentTexture();
      const rpd = {
        colorAttachments: [{ view: canvasTexture.createView(), clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
      };
      const pass = commandEncoder.beginRenderPass(rpd);
      pass.setPipeline(this._pipelineComposite);
      pass.setBindGroup(0, this._compositeBindGroup(device, this._paperTexture, this._inkTexture));
      pass.draw(4);
      pass.end();

      device.queue.submit([commandEncoder.finish()]);
      await device.queue.onSubmittedWorkDone();

      // Capture the frame while it is still on the canvas.
      blob = await new Promise((resolve) => {
        this._canvas.toBlob(resolve, 'image/png');
      });
      if (!blob) {
        blob = await new Promise((resolve) => {
          this._canvas.toBlob(resolve, 'image/jpeg', 0.95);
        });
      }
    } finally {
      // Restore on-screen canvas size and re-render.
      this._pageW = savedPageW;
      this._pageH = savedPageH;
      this._canvas.width = savedCanvasW;
      this._canvas.height = savedCanvasH;
      this._ctx.configure({
        device,
        format: this._canvasFormat,
        alphaMode: 'premultiplied',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
      await this.render();
    }

    return blob;
  }

  _buildStrokeBufferAt(device, strokes) {
    let total = 0;
    const parts = [];
    for (const s of strokes) {
      const g = buildStrokeGeometry(s);
      parts.push(g);
      total += g.length / 9;
    }
    let count = total;
    let buffer = this._strokeBuffer;
    if (!buffer || buffer.size < total * 36) {
      if (buffer) buffer.destroy();
      buffer = device.createBuffer({
        size: Math.max(4096, total * 36),
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    if (total > 0) {
      const data = new Float32Array(total * 9);
      let o = 0;
      for (const g of parts) { data.set(g, o); o += g.length; }
      device.queue.writeBuffer(buffer, 0, data);
    }
    return { buffer, count };
  }

  resize() {
    this._dirty = true;
  }

  destroy() {
    if (this._paperTexture) this._paperTexture.destroy();
    if (this._inkTexture) this._inkTexture.destroy();
    if (this._uniformBuffer) this._uniformBuffer.destroy();
    if (this._strokeBuffer) this._strokeBuffer.destroy();
    if (this._ctx) {
      try { this._ctx.configure({ device: null, format: null }); } catch { /* ignore */ }
    }
    this._initialized = false;
    this._lost = true;
  }
}
