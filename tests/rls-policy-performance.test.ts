import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20261122180000_supabase_duplicate_index_and_rls_policy_cleanup.sql', import.meta.url),
  'utf8'
);

test('RLS performance migration keeps one SELECT policy per protected table and preserves role scopes', () => {
  const reportCards = migration.slice(migration.indexOf('CREATE POLICY report_cards_read'), migration.indexOf('DROP POLICY IF EXISTS report_cards_admin_insert'));
  assert.match(reportCards, /FOR SELECT TO authenticated/);
  assert.match(reportCards, /school_admin','super_admin/);
  assert.match(reportCards, /published_at IS NOT NULL[\s\S]*?is_stale=false[\s\S]*?parent','student[\s\S]*?auth_can_access_student\(student_id\)/);
  assert.match(migration, /DROP POLICY IF EXISTS report_cards_parent_published_read ON public\.report_cards/);
  assert.doesNotMatch(migration, /CREATE POLICY report_cards_admin_read/);
  assert.doesNotMatch(migration, /CREATE POLICY report_cards_parent_published_read/);

  const policyCases: Array<{ name: string; table: string; roles: string[] }> = [
    { name: 'mark_components_read', table: 'mark_components', roles: ['school_admin', 'super_admin'] },
    { name: 'mark_structures_read', table: 'mark_structures', roles: ['school_admin', 'super_admin'] },
    { name: 'term_status_read', table: 'term_status', roles: ['school_admin', 'super_admin', 'teacher'] }
  ];
  for (const { name, table, roles } of policyCases) {
    const create = migration.indexOf(\`CREATE POLICY \${name}\`);
    const drop = migration.indexOf(\`DROP POLICY IF EXISTS \${name} ON public.\${table}\`);
    assert.ok(drop >= 0 && drop < create, \`\${name} must be dropped before recreation\`);
    assert.match(migration.slice(create, migration.indexOf(';', create)), /SELECT private\.auth_user_role\(\)/);
    for (const expectedRole of roles) assert.ok(migration.includes(\`'\${expectedRole}'\`), \`\${name} retains \${expectedRole}\`);
  }
});
