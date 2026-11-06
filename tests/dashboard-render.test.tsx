import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { normalizeSchoolDashboardData } from '../src/components/schooladmin/SchoolDashboard.tsx';
import { ErrorState } from '../src/components/common/ErrorState.tsx';
import { ApiClient } from '../src/services/api.ts';
import { AuthProvider } from '../src/context/AuthContext.tsx';

test('School Dashboard handles an undefined response with zero metrics and empty lists', () => {
  const model = normalizeSchoolDashboardData(undefined);
  assert.deepEqual(model.stats, { totalStudents: 0, totalTeachers: 0, totalClasses: 0, attendanceRate: 0, todayCollection: 0, totalOutstanding: 0 });
  assert.deepEqual(model.recentPayments, []);
  assert.deepEqual(model.notices, []);
});

test('School Dashboard error state renders a 403 with a retry control', () => {
  const markup = renderToStaticMarkup(<AuthProvider><ErrorState error={Object.assign(new Error('Forbidden'), { status: 403 })} onRetry={() => undefined} /></AuthProvider>);
  assert.match(markup, /No permission/);
  assert.match(markup, /Retry/);
});

test('School Dashboard handles an empty response and malformed lists without crashing', () => {
  const model = normalizeSchoolDashboardData({ stats: null, recentPayments: null, notices: {} });
  const markup = renderToStaticMarkup(<div>{model.stats.totalStudents}:{model.stats.totalTeachers}:{model.recentPayments.length}:{model.notices.length}</div>);
  assert.match(markup, /0:0:0:0/);
});

test('School Dashboard API maps undefined array responses to safe zero stats', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response('null', { status: 200, headers: { 'Content-Type': 'application/json' } });
  const result = await ApiClient.getSchoolDashboard();
  assert.deepEqual(result.stats, { totalStudents: 0, totalTeachers: 0, totalClasses: 0, attendanceRate: 0, todayCollection: 0, totalOutstanding: 0 });
  assert.deepEqual(result.recentPayments, []);
  assert.deepEqual(result.notices, []);
});

test('School Dashboard 403 response is surfaced as an error state instead of a render crash', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  await assert.rejects(ApiClient.getSchoolDashboard(), (error: any) => error.status === 403);
  const markup = renderToStaticMarkup(<AuthProvider><ErrorState error={Object.assign(new Error('Forbidden'), { status: 403 })} onRetry={() => undefined} /></AuthProvider>);
  assert.match(markup, /No permission/);
  assert.match(markup, /Retry/);
});
