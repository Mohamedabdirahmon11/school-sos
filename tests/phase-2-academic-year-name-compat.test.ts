import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/20261121115757_phase2_academic_year_name_compat.sql', import.meta.url), 'utf8');

test('term linkage accepts academic-year labels that differ only by slash or hyphen', () => {
  assert.match(migration, /replace\\(ay\\.name,\\s*'\\/',\\s*'-'\\)\\s*=\\s*replace\\(NEW\\.academic_year,\\s*'\\/',\\s*'-'\\)/););
  assert.match(migration, /WHEN 'Semester 1' THEN ARRAY\['Semester 1', 'Term 1'\]/);
  assert.match(migration, /WHEN 'Semester 2' THEN ARRAY\['Semester 2', 'Term 2'\]/);
  assert.match(migration, /NEW\.term_id := v_term_id/);
});
