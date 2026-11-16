import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const api = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
const client = readFileSync(new URL('../src/services/api.ts', import.meta.url), 'utf8');
const view = readFileSync(new URL('../src/components/documents/DocumentsView.tsx', import.meta.url), 'utf8');

test('Phase 3 history, restore, locking, audit and permissions routes are authenticated and school-scoped', () => {
  for (const route of [
    "/documents/:id/versions",
    "/documents/:id/versions/:versionId/restore",
    "/documents/:id/lock",
    "/documents/:id/unlock",
    "/documents/:id/audit",
    "/documents/:id/permissions"
  ]) assert.ok(api.includes(route), 'missing route ' + route);
  assert.match(api, /hasDocumentGrant\(client,school\.id,user,req\.params\.id,'edit'\)/);
  assert.match(api, /hasDocumentGrant\(client,school\.id,user,data\.id,'view'\)/);
  assert.match(api, /DOCUMENT_LOCKED/);
  assert.match(api, /school_id:school\.id,student_id:student\.id/);
});

test('Phase 3 client and UI expose document history, permissions and student attachments', () => {
  for (const method of ['getDocumentVersions','restoreDocumentVersion','lockDocument','unlockDocument','getDocumentAudit','getDocumentPermissions','setDocumentPermission','uploadStudentDocumentAttachment','deleteStudentDocumentAttachment']) {
    assert.ok(client.includes(method), 'missing client method ' + method);
  }
  assert.match(view, /Taariikhda versions/);
  assert.match(view, /Ogolaanshaha dukumentiga/);
  assert.match(view, /Lifaaqyada ardayga/);
});
