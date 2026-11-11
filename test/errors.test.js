import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { AppError, wrap } from '../js/common/errors.js';

test('AppError carries module, operation, cause, retryable', () => {
  const cause = new TypeError('boom');
  const err = new AppError({ module: 'storage', operation: 'save', message: 'failed', cause, retryable: true });
  assert.equal(err.module, 'storage');
  assert.equal(err.operation, 'save');
  assert.equal(err.retryable, true);
  assert.equal(err.cause, cause);
  assert.ok(err.stack.includes('Caused by:'));
  const json = err.toJSON();
  assert.equal(json.module, 'storage');
  assert.equal(json.retryable, true);
});

test('wrap converts plain error to AppError', () => {
  const plain = new Error('nope');
  const e = wrap(plain, { module: 'paper', operation: 'render' });
  assert.ok(e instanceof AppError);
  assert.equal(e.module, 'paper');
  assert.equal(e.operation, 'render');
  assert.equal(e.retryable, false);
  assert.equal(e.cause, plain);
});

test('wrap passes through AppError unchanged', () => {
  const a = new AppError({ module: 'x', operation: 'y', message: 'm' });
  assert.equal(wrap(a, { module: 'q' }), a);
});
