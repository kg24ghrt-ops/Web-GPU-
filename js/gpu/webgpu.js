/**
 * WebGPU device and capability detection.
 *
 * Requests an adapter and device safely, inspects features/limits, and
 * produces a capability report. Never assumes hardware acceleration;
 * reports unsupported-device behavior so the app can degrade gracefully.
 */

import { logger } from '../common/logger.js';
import { wrap } from '../common/errors.js';

/** Capability report produced after adapter/device selection. */
export class GpuReport {
  constructor({
    available = false,
    adapter = null,
    device = null,
    reason = null,
    features = [],
    limits = {},
    preferredCanvasFormat = 'bgra8unorm',
  } = {}) {
    this.available = available;
    this.adapter = adapter;
    this.device = device;
    this.reason = reason;
    this.features = features;
    this.limits = limits;
    this.preferredCanvasFormat = preferredCanvasFormat;
  }
  toJSON() {
    return {
      available: this.available,
      reason: this.reason,
      features: this.features,
      limits: this.limits,
      preferredCanvasFormat: this.preferredCanvasFormat,
    };
  }
}

/** Required features for the notebook renderer. */
const REQUIRED_FEATURES = [];

/** Default feature set we request (none beyond core). */
const DEFAULT_FEATURES = [];

/**
 * Detect WebGPU support and build a capability report without creating a
 * device. Safe to call in any environment (returns unavailable report if
 * navigator.gpu is missing).
 */
export async function detectCapabilities() {
  const report = new GpuReport();
  if (typeof navigator === 'undefined' || !navigator.gpu) {
    report.reason = 'navigator.gpu is not available';
    logger.warn('gpu', 'WebGPU unavailable: navigator.gpu missing');
    return report;
  }
  try {
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: 'high-performance',
    });
    if (!adapter) {
      report.reason = 'no WebGPU adapter available';
      logger.warn('gpu', 'No WebGPU adapter');
      return report;
    }
    report.available = true;
    report.adapter = adapter;
    report.features = [...adapter.features];
    report.limits = {
      maxTextureDimension1D: adapter.limits.maxTextureDimension1D,
      maxTextureDimension2D: adapter.limits.maxTextureDimension2D,
      maxTextureDimension3D: adapter.limits.maxTextureDimension3D,
      maxStorageTextureBindingSize: adapter.limits.maxStorageTextureBindingSize,
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
      maxBindGroups: adapter.limits.maxBindGroups,
      maxBindingsPerBindGroup: adapter.limits.maxBindingsPerBindGroup,
    };
    report.preferredCanvasFormat = navigator.gpu.getPreferredCanvasFormat();
    logger.info('gpu', 'WebGPU adapter detected', {
      features: report.features,
      limits: report.limits,
    });
  } catch (err) {
    report.reason = err && (err.message || String(err));
    logger.error('gpu', 'detection failed', wrap(err, { module: 'gpu', operation: 'detect' }).toJSON());
  }
  return report;
}

/**
 * Request a WebGPU device with error handling. Returns { report, device }.
 * On failure the report carries the reason and device is null.
 */
export async function requestDevice(report) {
  if (!report.available || !report.adapter) {
    return { report, device: null };
  }
  try {
    const device = await report.adapter.requestDevice({
      requiredFeatures: DEFAULT_FEATURES,
    });
    device.lost.then(
      () => logger.warn('gpu', 'device lost'),
      (err) => logger.error('gpu', 'device lost: ' + (err && (err.message || String(err))))
    );
    report.device = device;
    logger.info('gpu', 'WebGPU device created');
    return { report, device };
  } catch (err) {
    const cause = err && (err.message || String(err));
    report.available = false;
    report.reason = 'device request failed: ' + cause;
    report.device = null;
    logger.error('gpu', 'device request failed', wrap(err, { module: 'gpu', operation: 'requestDevice', retryable: true }).toJSON());
    return { report, device: null };
  }
}

/**
 * Check whether a texture size is within device limits.
 */
export function withinLimits(device, width, height) {
  if (!device) return false;
  const { limits } = device;
  return (
    width > 0 &&
    height > 0 &&
    width <= limits.maxTextureDimension2D &&
    height <= limits.maxTextureDimension2D
  );
}
