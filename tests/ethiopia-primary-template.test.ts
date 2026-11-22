import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PRIMARY_SUBJECT_TEMPLATE_DEFAULTS, PRIMARY_SUBJECT_TEMPLATE_PERIODS, getDefaultSubjectPeriods } from '../src/server/subject-validation.ts';

const api = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');

test('Ethiopia Primary templates use the requested grade-band subjects and keep optional subjects separate', () => {
  assert.deepEqual(PRIMARY_SUBJECT_TEMPLATE_DEFAULTS['1-4'], ['Af-Hooyo (Af-Soomaali)','English','Xisaab','Environmental Science','Arts','Physical Education','Amharic','Moral Education']);
  assert.deepEqual(PRIMARY_SUBJECT_TEMPLATE_DEFAULTS['5-6'], ['Af-Hooyo (Af-Soomaali)','English','Xisaab','Environmental Science','Arts','Physical Education','Amharic','Civics & Ethical Education']);
  assert.deepEqual(PRIMARY_SUBJECT_TEMPLATE_DEFAULTS['7-8'], ['Af-Hooyo (Af-Soomaali)','English','Xisaab','Arts','Physical Education','Amharic','Civics & Ethical Education','Biology','Chemistry','Physics','Cilmi Bulsho','ICT']);
  assert.equal(PRIMARY_SUBJECT_TEMPLATE_DEFAULTS['7-8'].includes('Conduct'), false);
});

test('Ethiopia subject weekly periods match the reference template', () => {
  assert.equal(PRIMARY_SUBJECT_TEMPLATE_PERIODS['Af-Hooyo (Af-Soomaali)'], 5);
  assert.equal(PRIMARY_SUBJECT_TEMPLATE_PERIODS.English, 5);
  assert.equal(PRIMARY_SUBJECT_TEMPLATE_PERIODS.Xisaab, 5);
  assert.equal(PRIMARY_SUBJECT_TEMPLATE_PERIODS['Environmental Science'], 4);
  assert.equal(PRIMARY_SUBJECT_TEMPLATE_PERIODS.Arts, 1);
  assert.equal(PRIMARY_SUBJECT_TEMPLATE_PERIODS['Physical Education'], 2);
  assert.equal(PRIMARY_SUBJECT_TEMPLATE_PERIODS.Amharic, 3);
  assert.equal(PRIMARY_SUBJECT_TEMPLATE_PERIODS['Moral Education'], 1);
  assert.equal(PRIMARY_SUBJECT_TEMPLATE_PERIODS['Civics & Ethical Education'], 2);
  assert.equal(PRIMARY_SUBJECT_TEMPLATE_PERIODS.Biology, 2);
  assert.equal(PRIMARY_SUBJECT_TEMPLATE_PERIODS.Chemistry, 2);
  assert.equal(PRIMARY_SUBJECT_TEMPLATE_PERIODS.Physics, 2);
  assert.equal(PRIMARY_SUBJECT_TEMPLATE_PERIODS['Cilmi Bulsho'], 3);
  assert.equal(PRIMARY_SUBJECT_TEMPLATE_PERIODS.ICT, 1);
});

test('custom subject periods are normalized and bounded to 1–10', () => {
  assert.equal(getDefaultSubjectPeriods(' english ', { ENGLISH: 4 }), 4);
  assert.equal(getDefaultSubjectPeriods('Arabic'), 2);
  assert.equal(getDefaultSubjectPeriods('Unknown elective'), 2);
  assert.equal(getDefaultSubjectPeriods('English', { English: 0 }), 5);
});

test('template synchronization deactivates removed curriculum rows, clears teacher assignments, and preserves marks', () => {
  assert.match(api, /teacher_class_subject_assignments'[\s\S]*?\.delete\(\)/);
  assert.match(api, /\.update\(\{ is_active: false, teacher_id: null \}\)/);
  const dependencyFn = api.slice(api.indexOf('async function findCurriculumDependency'), api.indexOf('function primarySubjectBandForGrade'));
  assert.doesNotMatch(dependencyFn, /student_marks/);
  assert.match(api, /is_active: true/);
});

test('template synchronization enforces weekly capacity and preserves same-school scoping', () => {
  assert.match(api, /total > capacity\.weeklyCapacity/);
  assert.match(api, /\.eq\('school_id', school\.id\)/);
  assert.match(api, /res\.status\(422\)/);
  assert.match(api, /res\.status\(409\)/);
});

test('subject template APIs are restricted to school administrators and expose saved period defaults', () => {
  assert.match(api, /apiRouter\.get\('\/subjects\/template-periods'/);
  assert.match(api, /apiRouter\.put\('\/subjects\/template-periods'/);
  assert.match(api, /apiRouter\.put\('\/subjects\/templates'/);
  assert.match(api, /role !== 'school_admin' && role !== 'super_admin'/);
});
test('New class creation refuses to attach a grade template that exceeds the school weekly capacity', () => {
  const apply = api.slice(api.indexOf('async function applyPrimarySubjectTemplate'), api.indexOf('async function readClassCurriculumRows'));
  assert.match(apply, /const totalPeriods = selectedSubjects\.reduce/);
  assert.match(apply, /totalPeriods > capacity\.weeklyCapacity/);
  assert.match(apply, /error\.status = 422/);
});

test('Grade 7–8 Ethiopia starter template is explicitly recognized as 33 periods, above the 30-period reference cap', () => {
  const total = PRIMARY_SUBJECT_TEMPLATE_DEFAULTS['7-8'].reduce((sum, name) => sum + PRIMARY_SUBJECT_TEMPLATE_PERIODS[name], 0);
  assert.equal(total, 33);
  assert.equal(total > 30, true);
});

