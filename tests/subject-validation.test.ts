import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PRIMARY_SUBJECT_TEMPLATE_DEFAULTS,
  DEFAULT_SUBJECT_NAMES,
  normalizeSubjectCode,
  normalizeSubjectName,
  subjectNameExists
} from '../src/server/subject-validation.ts';

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

test('legacy generic defaults remain backward compatible', () => {
  assert.deepEqual(DEFAULT_SUBJECT_NAMES, [
    'Soomaali', 'Carabi', 'Ingiriis', 'Xisaab', 'Science', 'Tarbiyada Islaamka', 'Bulsho'
  ]);
});

test('Ethiopian primary templates use the specified grade-band subjects', () => {
  assert.deepEqual(Object.keys(PRIMARY_SUBJECT_TEMPLATE_DEFAULTS), ['1-4', '5-6', '7-8']);
  assert.deepEqual(PRIMARY_SUBJECT_TEMPLATE_DEFAULTS['1-4'], [
    'Af-Hooyo (Af-Soomaali)', 'English', 'Xisaab', 'Environmental Science',
    'Arts', 'Physical Education', 'Amharic', 'Moral Education'
  ]);
  assert.deepEqual(PRIMARY_SUBJECT_TEMPLATE_DEFAULTS['5-6'], [
    'Af-Hooyo (Af-Soomaali)', 'English', 'Xisaab', 'Environmental Science',
    'Arts', 'Physical Education', 'Amharic', 'Civics & Ethical Education'
  ]);
  assert.deepEqual(PRIMARY_SUBJECT_TEMPLATE_DEFAULTS['7-8'], [
    'Af-Hooyo (Af-Soomaali)', 'English', 'Xisaab', 'Arts', 'Physical Education',
    'Amharic', 'Civics & Ethical Education', 'Biology', 'Chemistry', 'Physics',
    'Cilmi Bulsho', 'ICT'
  ]);
});
