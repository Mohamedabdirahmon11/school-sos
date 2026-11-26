import assert from 'node:assert/strict';
import test from 'node:test';
import { hasActiveClassIdentityConflict, hasActiveFormTeacherConflict } from '../src/server/class-setup-validation.ts';

const existing = [
  { id: 'c1', academicYear: '2026-2027', gradeLevel: 1, section: 'A', classTeacherId: 'teacher-1' },
  { id: 'c2', academicYear: '2026-2027', gradeLevel: 1, section: 'B', classTeacherId: null },
  { id: 'c3', academicYear: '2025-2026', gradeLevel: 1, section: 'A', classTeacherId: 'teacher-2' },
  { id: 'c4', academicYear: '2026-2027', gradeLevel: 2, section: 'A', classTeacherId: 'teacher-3' },
  { id: 'c5', academicYear: '2026-2027', gradeLevel: 1, section: 'C', classTeacherId: 'teacher-4', isArchived: true }
];

test('class identity uniqueness is case-insensitive and scoped to school/year/grade/section', () => {
  assert.equal(hasActiveClassIdentityConflict(existing, { academicYear: '2026-2027', gradeLevel: 1, section: ' a ' }), true);
  assert.equal(hasActiveClassIdentityConflict(existing, { academicYear: '2026-2027', gradeLevel: 1, section: 'B' }), true);
  assert.equal(hasActiveClassIdentityConflict(existing, { academicYear: '2025-2026', gradeLevel: 1, section: 'A' }), true);
  assert.equal(hasActiveClassIdentityConflict(existing, { academicYear: '2026-2027', gradeLevel: 2, section: 'A' }), true);
  assert.equal(hasActiveClassIdentityConflict(existing, { academicYear: '2026-2027', gradeLevel: 1, section: 'D' }), false);
  assert.equal(hasActiveClassIdentityConflict(existing, { academicYear: '2026-2027', gradeLevel: 1, section: 'C' }), false);
});

test('KG1, KG2 and KG3 are separate class identities for the same school year and section', () => {
  const kgRows = [
    { id: 'kg1', academicYear: '2026-2027', gradeLevel: 0, kindergartenLevel: 1, section: 'A' },
    { id: 'kg2', academicYear: '2026-2027', gradeLevel: 0, kindergartenLevel: 2, section: 'A' },
    { id: 'kg3', academicYear: '2026-2027', gradeLevel: 0, kindergartenLevel: 3, section: 'A' }
  ];
  assert.equal(hasActiveClassIdentityConflict(kgRows, { academicYear: '2026-2027', gradeLevel: 0, kindergartenLevel: 1, section: 'A' }), true);
  assert.equal(hasActiveClassIdentityConflict(kgRows, { academicYear: '2026-2027', gradeLevel: 0, kindergartenLevel: 2, section: 'B' }), false);
  assert.equal(hasActiveClassIdentityConflict(kgRows, { academicYear: '2026-2027', gradeLevel: 0, kindergartenLevel: 3, section: 'A' }), true);
});

test('class identity updates exclude their own row', () => {
  assert.equal(hasActiveClassIdentityConflict(existing, { academicYear: '2026-2027', gradeLevel: 1, section: 'A' }, 'c1'), false);
});

test('Form Teacher can own only one active class and archived classes do not block reuse', () => {
  assert.equal(hasActiveFormTeacherConflict(existing, 'teacher-1'), true);
  assert.equal(hasActiveFormTeacherConflict(existing, 'teacher-4'), false);
  assert.equal(hasActiveFormTeacherConflict(existing, null), false);
  assert.equal(hasActiveFormTeacherConflict(existing, 'teacher-1', 'c1'), false);
});
