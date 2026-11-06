import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/048_part3_foreign_key_indexes.sql', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');

const indexes = [
  'idx_bus_assignments_route_school',
  'idx_bus_assignments_student_school',
  'idx_discipline_incidents_recorded_by',
  'idx_library_loans_issued_by',
  'idx_library_loans_returned_by'
];

test('Part 3 foreign keys have matching migration and canonical schema indexes', () => {
  for (const index of indexes) {
    assert.match(migration, new RegExp('CREATE INDEX IF NOT EXISTS ' + index));
    assert.match(schema, new RegExp('CREATE INDEX IF NOT EXISTS ' + index));
  }
});
