import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('messages and notices surface request failures instead of displaying false empty states', () => {
  const messages = source('../src/components/schooladmin/MessagesView.tsx');
  const notices = source('../src/components/schooladmin/NoticesEventsView.tsx');
  assert.doesNotMatch(messages, /getMessages\(\{ page, pageSize: 20 \}\)\.catch\(\(\) => \[\]\)/);
  assert.doesNotMatch(messages, /getMessageContacts\(\)\.catch\(\(\) => \[\]\)/);
  assert.doesNotMatch(notices, /getNotices\(\{ page: noticePage, pageSize: 20 \}\)\.catch\(\(\) => \[\]\)/);
  assert.doesNotMatch(notices, /request<Array<\{ id: string; name: string \}>>\('\/classes'\)\.catch\(\(\) => \[\]\)/);
  assert.match(messages, /setError\(/);
  assert.match(messages, />Retry<\/button>/);
  assert.match(notices, /setError\(/);
  assert.match(notices, />Retry<\/button>/);
});

test('attendance and exams expose retryable errors and honest class context', () => {
  const attendance = source('../src/components/schooladmin/AttendanceView.tsx');
  const exams = source('../src/components/schooladmin/ExamsResultsView.tsx');
  assert.match(attendance, /const loadClasses = async/);
  assert.match(attendance, /setLoadError\(/);
  assert.match(attendance, /manually press Send in WhatsApp/);
  assert.doesNotMatch(attendance, /automatically trigger parent notifications/);
  assert.match(exams, /const loadExamSetup = async/);
  assert.match(exams, /Unable to load classes, subjects, or exam configuration/);
  assert.match(exams, /Current class:/);
  assert.match(exams, />Retry<\/button>/);
});

test('School Settings includes KG and does not expose SMS while provider is inactive', () => {
  const settings = source('../src/components/schooladmin/SchoolSettingsView.tsx');
  assert.match(settings, /defaultNotificationPreferences = \{ email: true, sms: false/);
  assert.match(settings, /defaultClassLevels = \[0, 1, 2/);
  assert.match(settings, /\[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12\]/);
  assert.match(settings, /level === 0 \? 'KG' : level/);
  assert.doesNotMatch(settings, /\['sms', 'SMS notifications'\]/);
  assert.match(settings, /notificationPreferences: \{ \.\.\.notificationPreferences, sms: false \}/);
});

test('existing school-scoped bulk PIN, teacher ID/PIN, and admission atomic workflows remain in place', () => {
  const students = source('../src/components/schooladmin/StudentsView.tsx');
  const teachers = source('../src/components/schooladmin/TeachersView.tsx');
  const api = source('../src/server/api.ts');
  assert.match(students, /BulkStudentPinResetWizard/);
  assert.match(teachers, /Teacher ID:/);
  assert.match(teachers, /Initial PIN:/);
  assert.match(api, /queryAllRows\('users', \{ school_id: school\.id \}, 'id,staff_id'\)/);
  assert.match(api, /db\.approveAdmissionAtomically\(/);
});
