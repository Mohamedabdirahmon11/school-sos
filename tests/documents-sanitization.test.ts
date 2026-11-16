import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sanitizeDocumentHtml } from '../src/lib/documents/sanitize-html.ts';

test('document sanitizer removes scripts, event handlers and unsafe links', () => {
  const html = sanitizeDocumentHtml('<p onclick="alert(1)">Hello</p><script>alert(2)</script><a href="javascript:alert(3)">link</a><iframe src="https://evil.test"></iframe>');
  assert.equal(html,'<p>Hello</p><a>link</a>');
  assert.doesNotMatch(html,/script|onclick|javascript:|iframe/i);
});

test('document sanitizer keeps safe formatting and pasted tables', () => {
  const html = sanitizeDocumentHtml('<table><tr><td style="background-color:#ffeeaa;color:#111">A</td><td>B</td></tr></table><div class="document-page-break" data-page-break="true"></div>');
  assert.match(html,/<table>/);
  assert.match(html,/<td style="background-color:#ffeeaa;color:#111">A<\/td>/);
  assert.match(html,/class="document-page-break" data-page-break="true"/);
});

test('document sanitizer allows only private document image routes', () => {
  const html = sanitizeDocumentHtml('<img src="https://evil.test/a.png"><img src="/api/documents/images?path=school%2Fdocuments%2Ffile.png">');
  assert.equal(html,'<img><img src="/api/documents/images?path=school%2Fdocuments%2Ffile.png">');
});
