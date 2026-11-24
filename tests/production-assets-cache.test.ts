import assert from 'node:assert/strict';
import { test } from 'node:test';
import { productionAssetCacheControl } from '../src/server/production-assets.ts';

test('content-hashed Vite assets receive immutable one-year caching', () => {
  assert.equal(
    productionAssetCacheControl('assets/index-D8Z8kKp1.js'),
    'public, max-age=31536000, immutable'
  );
  assert.equal(
    productionAssetCacheControl('assets/app-a1b2c3d4.css'),
    'public, max-age=31536000, immutable'
  );
});

test('HTML and unhashed files always revalidate after deployment', () => {
  assert.equal(productionAssetCacheControl('index.html'), 'no-cache');
  assert.equal(productionAssetCacheControl('assets/logo.svg'), 'no-cache');
  assert.equal(productionAssetCacheControl('../index.html'), 'no-cache');
});
