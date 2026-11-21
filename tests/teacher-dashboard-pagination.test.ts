import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('teacher dashboard pagination compatibility migration is additive and preserves the previous 100-row windows', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20261121115929_teacher_dashboard_pagination_parity.sql', import.meta.url), 'utf8');
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.teacher_dashboard_summary/);
  assert.match(migration, /ORDER BY id\s+LIMIT 100/);
  assert.match(migration, /AS first_page/);
  assert.match(migration, /first_page\.publish_date/);
  assert.match(migration, /first_page\.class_id/);
  assert.match(migration, /LIMIT 3/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|DELETE FROM/i);
});
