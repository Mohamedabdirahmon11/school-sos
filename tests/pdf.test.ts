import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPdf } from '../src/server/pdf.ts';
import { rgbPngDataUrl } from './support/png.ts';

test('server document generator returns a valid multi-page PDF container', () => {
  const pdf = createPdf([['SchoolOS report card', 'Student: Pupil One'], ['Official cash receipt', 'Receipt: REC-2026-0001']]);
  const source = pdf.toString('ascii');
  assert.ok(source.startsWith('%PDF-1.4'));
  assert.match(source, /\/Type \/Pages \/Kids \[3 0 R 5 0 R\] \/Count 2/);
  assert.match(source, /xref\n0 8\n/);
  assert.ok(source.endsWith('%%EOF'));
});

test('PDF text escapes parentheses and backslashes and replaces non-ASCII characters', () => {
  const source = createPdf([['School (Main) \\ Campus', 'Café — 100%']]).toString('ascii');
  assert.ok(source.includes('(School \\(Main\\) \\\\ Campus) Tj'));
  assert.ok(source.includes('(Caf? ? 100%) Tj'));
  assert.ok(!source.includes('Café'));
});

test('PDF embeds supported PNG images as XObjects with placement commands', () => {
  const dataUrl = rgbPngDataUrl();
  const source = createPdf([{ lines: ['Report card with image'], images: [{ dataUrl, x: 48, y: 700, width: 44, height: 44 }] }]).toString('ascii');
  assert.match(source, /\/Subtype \/Image \/Width 1 \/Height 1 \/ColorSpace \/DeviceRGB \/BitsPerComponent 8 \/Filter \/FlateDecode/);
  assert.match(source, /\/XObject << \/Im0 \d+ 0 R >>/);
  assert.ok(source.includes('44 0 0 44 48 700 cm\n/Im0 Do'));
  assert.match(source, /48 748 Td/);
});

test('PDF ignores unsupported or malformed image data URLs', () => {
  const source = createPdf([{ lines: ['No image'], images: [{ dataUrl: 'data:image/webp;base64,AAAA', x: 0, y: 0, width: 10, height: 10 }, { dataUrl: 'not-an-image', x: 0, y: 0, width: 10, height: 10 }] }]).toString('ascii');
  assert.ok(!source.includes('/Subtype /Image'));
  assert.ok(!source.includes('/XObject'));
});
