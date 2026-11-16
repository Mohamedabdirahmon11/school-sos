import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canGenerateSchoolDocuments, canManageSchoolDocuments } from '../src/lib/documents/document-permissions.ts';

test('only School Admin and Super Admin manage school documents', () => {
  assert.equal(canManageSchoolDocuments('school_admin'),true);
  assert.equal(canManageSchoolDocuments('super_admin'),true);
  assert.equal(canManageSchoolDocuments('accountant'),false);
  assert.equal(canManageSchoolDocuments('teacher'),false);
});

test('teacher document generation requires an assigned class', () => {
  assert.equal(canGenerateSchoolDocuments('teacher'),false);
  assert.equal(canGenerateSchoolDocuments('school_admin'),true);
});
