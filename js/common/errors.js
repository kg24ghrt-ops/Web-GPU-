export class AppError extends Error {
  constructor({ module, operation, message, cause, retryable = false } = {}) {
    super(message);
    this.name = 'AppError';
    this.module = module;
    this.operation = operation;
    this.cause = cause;
    this.retryable = retryable;
    this.timestamp = Date.now();
    if (cause) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack || String(cause)}`;
    }
  }
  toJSON() {
    return {
      name: this.name,
      module: this.module,
      operation: this.operation,
      message: this.message,
      cause: this.cause && (this.cause.message || String(this.cause)),
      retryable: this.retryable,
      timestamp: this.timestamp,
    };
  }
}
export function wrap(err, { module, operation, retryable = false } = {}) {
  if (err instanceof AppError) return err;
  return new AppError({ module, operation, message: err && (err.message || String(err)), cause: err, retryable });
}
