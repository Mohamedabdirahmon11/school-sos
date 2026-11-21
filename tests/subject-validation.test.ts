import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PRIMARY_SUBJECT_TEMPLATE_DEFAULTS, DEFAULT_SUBJECT_NAMES, normalizeSubjectCode, normalizeSubjectName, subjectNameExists } from '../src/server/subject-validation.ts';

test('subject names are trimmed and compared case-insensitively', () => {
  const subjects = [{ id: 'one', name: 'Soomaali' }];
  assert.equal(normalizeSubjectName('  Xisaab  '), 'Xisaab');
  assert.equal(subjectNameExists(subjects, ' soomaali '), true);
  assert.equal(subjectNameExists(subjects, 'SOOMAALI', 'one'), false);
  assert.equal(subjectNameExists(subjects, 'Carabi'), false);
});

test('subject codes are optional and normalized to uppercase', () => {
  assert.equal(normalizeSubjectCode(undefined), '');
  assert.equal(normalizeSubjectCode('  sci '), 'SCI');
});

test('default subjects contain the seven requested names', () => {
  assert.deepEqual(DEFAULT_SUBJECT_NAMES, ['Soomaali', 'Carabi', 'Ingiriis', 'Xisaab', 'Science', 'Tarbiyada Islaamka', 'Bulsho']);
});


test('Ethiopian primary templates are grouped by Grades 1–4, 5–6 and 7–8', () => {
  assert.deepEqual(Object.keys(PRIMARY_SUBJECT_TEMPLATE_DEFAULTS), ['1-4', '5-6', '7-8']);
  assert.ok(PRIMARY_SUBJECT_TEMPLATE_DEFAULTS['1-4'].includes('Xisaab'));
  assert.ok(PRIMARY_SUBJECT_TEMPLATE_DEFAULTS['5-6'].includes('General Science'));
  assert.ok(PRIMARY_SUBJECT_TEMPLATE_DEFAULTS['7-8'].includes('Agriculture'));
});
