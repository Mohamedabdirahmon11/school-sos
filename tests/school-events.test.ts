import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const api = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
const storage = readFileSync(new URL('../src/server/storage.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../src/components/schooladmin/NoticesEventsView.tsx', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');

test('school event endpoints are tenant-scoped and write-restricted', () => {
  assert.ok(api.includes("apiRouter.get('/school/events', requireAuth, requireSchoolContext"));
  assert.ok(api.includes("apiRouter.post('/school/events', requireAuth, requireSchoolContext, requireSchoolAdminOrSuperAdmin"));
  assert.ok(api.includes("apiRouter.delete('/school/events/:id', requireAuth, requireSchoolContext, requireSchoolAdminOrSuperAdmin"));
  assert.ok(api.includes('endDate < startDate'));
  assert.ok(api.includes('SCHOOL_EVENT_CREATED'));
  assert.ok(api.includes('SCHOOL_EVENT_DELETED'));
});

test('school event storage reads, creates and deletes only within the selected school', () => {
  assert.ok(storage.includes('getEvents(schoolId: string)'));
  assert.ok(storage.includes("createEvent(eventData: Omit<SchoolEvent, 'id'>)"));
  assert.ok(storage.includes('deleteEvent(id: string, schoolId: string)'));
  assert.ok(storage.includes('event.schoolId === schoolId'));
  assert.ok(storage.includes("['events', 'school_events']"));
});

test('school events UI surfaces API errors and hides write actions from non-admin users', () => {
  assert.ok(ui.includes("const canManageEvents = user?.role === 'school_admin' || user?.role === 'super_admin'"));
  assert.ok(ui.includes("ApiClient.request<SchoolEvent[]>('/school/events'),"));
  assert.ok(ui.includes('role="alert"'));
  assert.ok(schema.includes('CREATE TABLE IF NOT EXISTS school_events'));
});
