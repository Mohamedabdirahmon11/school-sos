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
