import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { globSync } from 'node:fs';
import { homedir } from 'node:os';

const CANDIDATES = [
  process.env.NAGA_PATH,
  `${homedir()}/.cargo/bin/naga`,
  'naga',
].filter(Boolean);
let NAGA = null;
for (const c of CANDIDATES) {
  try { execFileSync(c, ['--version'], { stdio: 'ignore' }); NAGA = c; break; } catch { /* try next */ }
}
assert.ok(NAGA, 'naga binary not found; set NAGA_PATH or install naga-cli');

const SHADERS = globSync('js/gpu/shaders/*.wgsl', { cwd: process.cwd(), absolute: true });

test('wgsl: every shader in js/gpu/shaders validates with naga', () => {
  assert.ok(SHADERS.length > 0, 'expected at least one .wgsl shader');
  for (const shader of SHADERS) {
    let output = '';
    try {
      output = execFileSync(NAGA, [shader], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      const stderr = err.stderr ? err.stderr.toString() : '';
      const stdout = err.stdout ? err.stdout.toString() : '';
      assert.fail(`naga validation failed for ${shader}\nstdout: ${stdout}\nstderr: ${stderr}`);
    }
    assert.ok(output.includes('Validation successful'), `expected "Validation successful" for ${shader}`);
  }
});
