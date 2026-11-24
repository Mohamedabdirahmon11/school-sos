import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('font requests are preloaded once and applied without blocking the initial app script', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
  const fontStylesheets = html.match(/rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2\?/g) || [];
  const fontPreloads = html.match(/rel="preload" as="style" href="https:\/\/fonts\.googleapis\.com\/css2\?/g) || [];
  assert.equal(fontStylesheets.length, 1);
  assert.equal(fontPreloads.length, 1);
  assert.match(html, /media="print" data-font-stylesheet/);
  assert.match(html, /family=Inter:wght@400;500;600;700/);
  assert.match(html, /family=JetBrains\+Mono:wght@400;500;600/);
  assert.match(html, /display=swap/);
  assert.match(main, /fontStylesheet\.media = 'all'/);
  assert.doesNotMatch(css, /fonts\.googleapis\.com/);
});
