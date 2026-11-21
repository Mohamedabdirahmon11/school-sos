import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/20261121120000_phase2_term_helper_privileges.sql', import.meta.url), 'utf8');

test('term assignment helper is executable only by authenticated callers, not anon or public', () => {
  assert.match(migration, /REVOKE ALL ON FUNCTION private\.auth_has_term_assignment/);
  assert.match(migration, /FROM PUBLIC, anon/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION private\.auth_has_term_assignment/);
  assert.match(migration, /TO authenticated/);
});
