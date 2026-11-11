const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
let level = LEVELS.info;
export const logger = {
  setLevel(name) { level = LEVELS[name] !== undefined ? LEVELS[name] : LEVELS.info; },
  log(sev, module, msg, meta = {}) {
    if (LEVELS[sev] === undefined || LEVELS[sev] < level) return;
    const entry = { time: new Date().toISOString(), level: sev, module, message: msg, ...meta };
    const out = JSON.stringify(entry);
    if (sev === 'error') console.error(out); else console.log(out);
  },
  debug(module, msg, meta) { this.log('debug', module, msg, meta); },
  info(module, msg, meta) { this.log('info', module, msg, meta); },
  warn(module, msg, meta) { this.log('warn', module, msg, meta); },
  error(module, msg, meta) { this.log('error', module, msg, meta); },
};
