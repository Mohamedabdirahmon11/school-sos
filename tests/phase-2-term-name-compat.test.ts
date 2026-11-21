import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/20261121115601_phase2_term_name_compat.sql', import.meta.url), 'utf8');

test('legacy Semester 1/2 marks resolve to configured Term 1/2 rows without changing marks', () => {
  assert.match(migration, /WHEN 'Semester 1' THEN ARRAY\['Semester 1', 'Term 1'\]/);
  assert.match(migration, /WHEN 'Semester 2' THEN ARRAY\['Semester 2', 'Term 2'\]/);
  assert.match(migration, /NEW\.term_id := v_term_id/);
  assert.match(migration, /UPDATE public\.student_marks sm/);
  assert.doesNotMatch(migration, /DELETE FROM public\.student_marks/);
});
