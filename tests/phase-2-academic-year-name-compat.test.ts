import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/20261121115757_phase2_academic_year_name_compat.sql', import.meta.url), 'utf8');

test('term linkage accepts academic-year labels that differ only by slash or hyphen', () => {
  assert.ok(migration.includes("replace(ay.name,'/','-')=replace(NEW.academic_year,'/','-')"));
  assert.ok(migration.includes("WHEN 'Semester 1' THEN ARRAY['Semester 1','Term 1']"));
  assert.ok(migration.includes("WHEN 'Semester 2' THEN ARRAY['Semester 2','Term 2']"));
  assert.ok(migration.includes('NEW.term_id:=v_term_id'));
});
