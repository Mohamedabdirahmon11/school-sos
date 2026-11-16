import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeDocumentHtml } from '../src/lib/documents/sanitize-html.ts';

test('document verification QR image URLs are restricted to opaque UUID routes', () => {
  const token='123e4567-e89b-42d3-a456-426614174000';
  const safe=sanitizeDocumentHtml('<img src="/api/public/document-verification/'+token+'/qr" alt="QR">');
  assert.match(safe,new RegExp('/api/public/document-verification/'+token+'/qr'));
  assert.equal(sanitizeDocumentHtml('<img src="/api/public/document-verification/not-a-token/qr">'),'<img>');
  assert.equal(sanitizeDocumentHtml('<img src="/api/public/document-verification/'+token+'/qr?redirect=https://evil.test">'),'<img>');
});

test('document verification links do not permit script or protocol-relative destinations', () => {
  assert.equal(sanitizeDocumentHtml('<a href="javascript:alert(1)">verify</a>'),'<a>verify</a>');
  assert.equal(sanitizeDocumentHtml('<a href="//evil.test">verify</a>'),'<a>verify</a>');
});

test('document verification QR rejects malformed 36-character token strings', () => {
  assert.equal(sanitizeDocumentHtml('<img src="/api/public/document-verification/------------------------------------/qr">'),'<img>');
});

test('document sanitizer retains bounded image rotation and layer styles only', () => {
  assert.equal(sanitizeDocumentHtml('<img src="/api/documents/images?path=school/a.png" style="transform:rotate(90deg);z-index:2">'), '<img src="/api/documents/images?path=school/a.png" style="transform:rotate(90deg);z-index:2">');
  assert.equal(sanitizeDocumentHtml('<img src="/api/documents/images?path=school/a.png" style="transform:rotate(90deg);z-index:999">'), '<img src="/api/documents/images?path=school/a.png" style="transform:rotate(90deg)">');
  assert.equal(sanitizeDocumentHtml('<img src="/api/documents/images?path=school/a.png" style="transform:translateX(999px)">'), '<img src="/api/documents/images?path=school/a.png">');
});
test('document sanitizer permits bounded image positioning and alignment styles', () => {
  assert.equal(sanitizeDocumentHtml('<img src="/api/documents/images?path=school/a.png" style="position:relative;left:-12px;top:20px;margin-left:auto;margin-right:0">'), '<img src="/api/documents/images?path=school/a.png" style="position:relative;left:-12px;top:20px;margin-left:auto;margin-right:0">');
  assert.equal(sanitizeDocumentHtml('<img src="/api/documents/images?path=school/a.png" style="position:absolute;left:9999px;top:0px">'), '<img src="/api/documents/images?path=school/a.png" style="top:0px">');
});
test('document sanitizer permits positioned fields only with the explicit field marker', () => {
  const safe=sanitizeDocumentHtml('<div class="document-positioned-field" data-document-field="true" style="position:absolute;left:20px;top:30px;width:190px;z-index:1"><span class="document-field-drag-handle" contenteditable="false">⋮⋮</span>{student_name}</div>');
  assert.match(safe,/position:absolute/);
  assert.match(safe,/data-document-field="true"/);
  assert.equal(sanitizeDocumentHtml('<div style="position:absolute;left:20px;top:30px">unsafe</div>'),'<div style="left:20px;top:30px">unsafe</div>');
});
test('document sanitizer preserves only approved positioned-field attributes and safe class tokens', () => {
  const html='<div class="document-positioned-field document-positioned-field-selected" data-document-field="true" data-document-locked="false" tabindex="0" style="position:absolute;left:20px;top:30px;width:190px;z-index:1"><span class="document-field-drag-handle" contenteditable="false">move</span>{student_name}</div>';
  const safe=sanitizeDocumentHtml(html);
  assert.match(safe,/class="document-positioned-field document-positioned-field-selected"/);
  assert.match(safe,/data-document-field="true"/);
  assert.match(safe,/data-document-locked="false"/);
  assert.match(safe,/tabindex="0"/);
  assert.match(safe,/contenteditable="false"/);
});