import test from 'node:test';
import assert from 'node:assert/strict';
import { applySchoolBrandColor } from '../src/lib/documents/brand-color.ts';

test('uses a valid school brand color for template accents and readable text', () => {
  const html = '<h1 style="color:#0f766e">Title</h1><div style="border:2px solid #0f766e"></div>';
  const result = applySchoolBrandColor(html, '#123456');
  assert.match(result, /color:#123456/i);
  assert.match(result, /border:2px solid #123456/i);
});

test('keeps text contrast readable when the school brand color is too light', () => {
  const html = '<h1 style="color:#0f766e">Title</h1><div style="border:2px solid #0f766e"></div>';
  const result = applySchoolBrandColor(html, '#EEEEEE');
  assert.match(result, /color:#0F172A/i);
  assert.match(result, /border:2px solid #EEEEEE/i);
});

test('falls back to the default brand color for invalid input', () => {
  const result = applySchoolBrandColor('<h1 style="color:#0f766e">Title</h1>', 'url(javascript:alert(1))');
  assert.match(result, /color:#0F766E/i);
  assert.doesNotMatch(result, /javascript:/i);
});
