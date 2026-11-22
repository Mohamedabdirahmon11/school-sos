import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_SUBJECT_NAMES,
  OPTIONAL_SCHOOL_SUBJECTS,
  PRIMARY_SUBJECT_TEMPLATE_DEFAULTS,
  getDefaultPrimarySubjectTemplate,
  primarySubjectBandForGrade
} from '../src/server/subject-validation.ts';

test('Ethiopian primary templates contain the requested grade-band subjects', () => {
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

test('grade bands map only primary grades 1 through 8', () => {
  assert.equal(primarySubjectBandForGrade(1), '1-4');
  assert.equal(primarySubjectBandForGrade(4), '1-4');
  assert.equal(primarySubjectBandForGrade(5), '5-6');
  assert.equal(primarySubjectBandForGrade(6), '5-6');
  assert.equal(primarySubjectBandForGrade(7), '7-8');
  assert.equal(primarySubjectBandForGrade(8), '7-8');
  assert.equal(primarySubjectBandForGrade(0), null);
  assert.equal(primarySubjectBandForGrade(9), null);
  assert.equal(primarySubjectBandForGrade(12), null);
});

test('conduct is not a subject and Arabic/Islamic Studies are optional additions', () => {
  const allSubjects = Object.values(PRIMARY_SUBJECT_TEMPLATE_DEFAULTS).flat();
  assert.equal(allSubjects.some(name => /conduct|dabeecad/i.test(name)), false);
  assert.deepEqual(OPTIONAL_SCHOOL_SUBJECTS, ['Arabic', 'Islamic Studies/Quraan']);
  assert.equal(DEFAULT_SUBJECT_NAMES.includes('Arabic' as never), false);
});

test('template helper returns a school-editable copy, not the shared default array', () => {
  const copy = getDefaultPrimarySubjectTemplate('1-4');
  copy.push('School-specific elective');
  assert.equal(PRIMARY_SUBJECT_TEMPLATE_DEFAULTS['1-4'].includes('School-specific elective'), false);
});
