import { logger } from '../common/logger.js';
import { wrap } from '../common/errors.js';
export class App {
  constructor({ modules = {} } = {}) {
    this._modules = modules;
    this._started = false;
  }
  async init() {
    for (const [name, mod] of Object.entries(this._modules)) {
      if (mod && typeof mod.init === 'function') {
        try { await mod.init(); logger.info('core', `module "${name}" initialized`); }
        catch (err) { logger.error('core', `init module "${name}"`, wrap(err, { module: 'core', operation: `init:${name}` }).toJSON()); throw err; }
      }
    }
  }
  start() { this._started = true; logger.info('core', 'app started'); }
  destroy() {
    for (const mod of Object.values(this._modules)) {
      if (mod && typeof mod.destroy === 'function') {
        try { mod.destroy(); }
        catch (err) { logger.warn('core', `destroy module`, err.message); }
      }
    }
    this._started = false;
  }
  get started() { return this._started; }
}
