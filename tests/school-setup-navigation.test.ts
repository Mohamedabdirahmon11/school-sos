import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCHOOL_SETUP_ALLOWED_VIEWS,
  SCHOOL_SETUP_STEP_TARGETS
} from '../src/lib/school-setup-navigation.ts';

test('School Admin setup can open fees and optional school modules before dashboard completion', () => {
  assert.equal(SCHOOL_SETUP_ALLOWED_VIEWS.has(SCHOOL_SETUP_STEP_TARGETS.fees), true);
  assert.equal(SCHOOL_SETUP_ALLOWED_VIEWS.has(SCHOOL_SETUP_STEP_TARGETS.modules), true);
});

test('School Admin setup still blocks the normal dashboard until completion', () => {
  assert.equal(SCHOOL_SETUP_ALLOWED_VIEWS.has('sch_dashboard'), false);
});
