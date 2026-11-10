import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCHOOL_SETUP_ALLOWED_VIEWS,
  SCHOOL_SETUP_EXTRA_MODULES,
  SCHOOL_SETUP_STEP_TARGETS
} from '../src/lib/school-setup-navigation.ts';

test('School Admin setup can open fees, parents, attendance, exams, and all optional school modules', () => {
  assert.equal(SCHOOL_SETUP_ALLOWED_VIEWS.has(SCHOOL_SETUP_STEP_TARGETS.fees), true);
  for (const view of ['sch_parents', 'sch_attendance', 'sch_exams']) {
    assert.equal(SCHOOL_SETUP_ALLOWED_VIEWS.has(view), true, view);
  }
  for (const module of SCHOOL_SETUP_EXTRA_MODULES) {
    assert.equal(SCHOOL_SETUP_ALLOWED_VIEWS.has(module.view), true, module.view);
  }
});

test('School Admin setup still blocks the normal dashboard until completion', () => {
  assert.equal(SCHOOL_SETUP_ALLOWED_VIEWS.has('sch_dashboard'), false);
});
