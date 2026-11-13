#!/usr/bin/env node
/**
 * Stage the notebook frontend's runtime assets into `dist/`.
 *
 * Tauri packages `frontendDist` as the application's web assets. The
 * repository root contains development-only files (node_modules, .git,
 * test/, scripts, package manifests) that must NOT be shipped inside the
 * Android APK. This script copies only the runtime assets the page needs
 * at runtime, preserving their on-disk relative layout so the HTML/CSS/JS
 * references (css/index.css, js/main.js, js/gpu/shaders/*.wgsl) keep
 * working inside the bundled WebView.
 *
 * Output layout (mirrors the repo root):
 *   dist/index.html
 *   dist/css/index.css
 *   dist/js/**               (all JS + WGSL shader sources)
 *
 * This script is intentionally deterministic: it wipes dist/ and rebuilds
 * it from the source tree on every run, so repeated runs are identical.
 */

import { mkdir, cp, rm } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');

// Runtime-only entry points. Everything else (node_modules, .git, test/,
// scripts/, package*.json, README.md) is development-only and excluded.
const RUNTIME_ENTRIES = ['index.html', 'css', 'js'];

async function main() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  for (const entry of RUNTIME_ENTRIES) {
    const src = join(ROOT, entry);
    const dest = join(DIST, entry);
    await cp(src, dest, { recursive: true, dereference: true });
  }

  console.log(`Staged runtime frontend assets to ${DIST}/`);
  console.log('Included entries: ' + RUNTIME_ENTRIES.join(', '));
}

main().catch((err) => {
  console.error('stage-frontend failed:', err);
  process.exit(1);
});
