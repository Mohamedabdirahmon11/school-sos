import assert from 'node:assert/strict';
import { test } from 'node:test';
import { API_QUERY_BUDGETS, getApiQueryBudget, isApiQueryBudgetExceeded } from '../src/server/query-budgets.ts';

test('high-frequency school endpoints have explicit query ceilings', () => {
  for (const route of [
    'POST /auth/login',
    'GET /auth/me',
    'GET /superadmin/dashboard',
    'GET /parent/children',
    'GET /student/me',
    'GET /students',
    'GET /teachers',
    'GET /classes',
    'GET /attendance',
    'POST /attendance',
    'GET /exams/marks',
    'POST /exams/marks',
    'GET /term-marks/entry',
    'POST /term-marks/entry',
    'GET /assignments',
    'GET /notices',
    'GET /messages',
    'GET /timetable',
    'GET /school/dashboard',
    'GET /school/setup-progress',
    'GET /teacher-assignments'
  ]) assert.ok(API_QUERY_BUDGETS[route] > 0, `missing query ceiling for ${route}`);
});

test('query budgets match route templates exactly and are case insensitive for methods', () => {
  assert.equal(getApiQueryBudget('get', '/students'), 20);
  assert.equal(getApiQueryBudget('GET', '/api/students'), 20);
  assert.equal(getApiQueryBudget('GET', '/students/:id'), null);
  assert.equal(getApiQueryBudget('GET', '/unknown'), null);
});

test('query budget guard trips only above the configured ceiling', () => {
  assert.equal(isApiQueryBudgetExceeded('GET', '/students', 20), false);
  assert.equal(isApiQueryBudgetExceeded('GET', '/students', 21), true);
  assert.equal(isApiQueryBudgetExceeded('GET', '/unknown', 999), false);
});
