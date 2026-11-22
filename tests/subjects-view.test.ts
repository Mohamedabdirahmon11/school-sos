import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const view = readFileSync(new URL('../src/components/schooladmin/SubjectsView.tsx', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');

test('Subjects page loads real subjects, grade-band templates and school period settings', () => {
  assert.match(view, /ApiClient\.getSubjects\(\)/);
  assert.match(view, /ApiClient\.getPrimarySubjectTemplates\(\)/);
  assert.match(view, /ApiClient\.getPrimarySubjectTemplatePeriods\(\)/);
  assert.doesNotMatch(view, /localStorage|STD_SUBJECTS|demo data/i);
});

test('Subjects page uses the reference table and editable grade-band checkboxes', () => {
  for (const label of ['Subjects', 'Levels', 'Periods / week', 'Grade 1–4', 'Grade 5–6', 'Grade 7–8', 'Reset to Ethiopia standard']) assert.ok(view.includes(label));
  assert.match(view, /type="checkbox"/);
  assert.match(view, /aria-label=/);
});

test('Template save synchronizes only changed bands and preserves historical marks', () => {
  assert.match(view, /savePrimarySubjectTemplates\(nextTemplates, nextPeriods, bands\)/);
  assert.match(api, /teacher_class_subject_assignments'[\s\S]*?\.delete\(\)/);
  assert.match(api, /\.update\(\{ is_active: false, teacher_id: null \}\)/);
  const dependencyFn = api.slice(api.indexOf('async function findCurriculumDependency'), api.indexOf('function primarySubjectBandForGrade'));
  assert.doesNotMatch(dependencyFn, /student_marks/);
});

test('Removing a subject first removes it from grade templates and keeps history when deletion is blocked', () => {
  assert.match(view, /Remove \$\{subject\.name\} from all grade-band templates/);
  assert.match(view, /Historical marks will be preserved/);
  assert.match(view, /diiwaanka waxaa loo reebay ilaalinta natiijooyinkii hore/);
});

test('Subject template API enforces 30-period cap and administrator-only writes', () => {
  assert.match(api, /apiRouter\.put\('\/subjects\/templates'/);
  assert.match(api, /requestedBands as PrimarySubjectGradeBand\[\]/);
  assert.match(api, /total > capacity\.weeklyCapacity/);
  assert.match(api, /res\.status\(422\)/);
});
