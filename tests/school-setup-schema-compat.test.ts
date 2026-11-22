import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('schools keeps the setup completion timestamp compatible with deployed API versions', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20261122164500_school_setup_completed_at_compat.sql', import.meta.url), 'utf8');
  assert.match(migration, /ALTER TABLE public\.schools[\s\S]*?ADD COLUMN IF NOT EXISTS setup_completed_at timestamptz/);
});
