import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { assertProductionAssets } from '../src/server/production-assets.ts';

test('production startup accepts a complete frontend build', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'schoolos-production-assets-'));
  try {
    const dist = path.join(root, 'dist');
    mkdirSync(dist);
    writeFileSync(path.join(dist, 'index.html'), '<!doctype html><html></html>');
    assert.doesNotThrow(() => assertProductionAssets(dist));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('production startup rejects a missing frontend build directory', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'schoolos-production-assets-'));
  try {
    assert.throws(() => assertProductionAssets(path.join(root, 'dist')), /npm run build/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('production startup rejects a build without index.html', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'schoolos-production-assets-'));
  try {
    const dist = path.join(root, 'dist');
    mkdirSync(dist);
    assert.throws(() => assertProductionAssets(dist), /index.html|incomplete/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
