import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('school admin teacher directory exposes a prominent accessible Add Teacher action', () => {
  const source = readFileSync(new URL('../src/components/schooladmin/TeachersView.tsx', import.meta.url), 'utf8');
  assert.match(source, /data-testid="add-teacher-button"/);
  assert.match(source, /aria-label="Add Teacher"/);
  assert.match(source, /Add Teacher · Ku dar macallin/);
  assert.match(source, /setShowAddModal\(true\)/);
  assert.match(source, /APPOINT TEACHER MODAL/);
});

test('Add Teacher remains discoverable in read-only mode and explains why creation is blocked', () => {
  const source = readFileSync(new URL('../src/components/schooladmin/TeachersView.tsx', import.meta.url), 'utf8');
  assert.match(source, /if \(isReadOnly\) \{/);
  assert.match(source, /Dugsigan hadda waa read-only/);
  assert.doesNotMatch(source, /data-testid="add-teacher-button"[\s\S]{0,500}?disabled=\{isReadOnly\}/);
});
