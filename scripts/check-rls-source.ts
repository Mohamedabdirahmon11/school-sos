import fs from 'node:fs';

const schema = fs.readFileSync('schema.sql', 'utf8');
const migration = fs.readFileSync('supabase/migrations/001_missing_tables.sql', 'utf8');
const migrationFiles = fs.readdirSync('supabase/migrations').filter(file => /^\d+_.+\.sql$/.test(file)).sort();
const storage = fs.readFileSync('src/server/storage.ts', 'utf8');
const liveCheck = fs.readFileSync('scripts/check-rls.sql', 'utf8');
const tables = [...schema.matchAll(/CREATE TABLE IF NOT EXISTS\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi)].map(match => match[1].toLowerCase());
const uniqueTables = [...new Set(tables)].sort();
const globalRlsEnable = /ALTER TABLE public\.%I ENABLE ROW LEVEL SECURITY/i.test(schema);
const genericTenantPolicy = /CREATE POLICY tenant_scope_v2 ON public\.%I/i.test(schema);
const genericPlatformPolicy = /CREATE POLICY platform_admin_v2 ON public\.%I/i.test(schema);
const checkQueryComplete = ['FROM pg_tables', 'LEFT JOIN pg_policies', 'AS rls_enabled', 'AS policy_count', 'AS status']
  .every(fragment => liveCheck.toLowerCase().includes(fragment.toLowerCase()));
const specificRules = [
  ['direct_messages', 'direct_messages_participants_read'],
  ['students', 'students_role_read'],
  ['classes', 'classes_role_read'],
  ['attendance_records', 'attendance_role_read'],
  ['student_marks', 'marks_role_read'],
  ['fee_payments', 'fees_role_read'],
  ['user_sessions', 'sessions_self_read']
];

let failed = false;
function auditIdempotency(source: string, label: string) {
  const violations: string[] = [];
  for (const match of source.matchAll(/\bCREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS\b)/gi)) violations.push('CREATE TABLE without IF NOT EXISTS');
  for (const match of source.matchAll(/\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?!IF\s+NOT\s+EXISTS\b)/gi)) violations.push('CREATE INDEX without IF NOT EXISTS');
  const hasDestructiveSql = /\bDROP\s+TABLE\b|\bTRUNCATE\b|\bDELETE\s+FROM\b/i.test(source);
  if (hasDestructiveSql) {
    // This migration defines a runtime deletion RPC; applying the migration only
    // creates the function. Execution is restricted to the server service role.
    const guardedSchoolDeletionMigration = label === '20261113120000_permanent_school_deletion.sql'
      && /create or replace function public\.delete_school_permanently\s*\(/i.test(source)
      && /security definer/i.test(source)
      && /revoke all on function public\.delete_school_permanently\s*\(\s*text\s*,\s*text\s*\)\s*from public\s*,\s*anon\s*,\s*authenticated/i.test(source)
      && /grant execute on function public\.delete_school_permanently\s*\(\s*text\s*,\s*text\s*\)\s*to service_role/i.test(source);
    if (!guardedSchoolDeletionMigration) violations.push('destructive table/data statement');
  }
  for (const match of source.matchAll(/\bCREATE\s+POLICY\s+([a-z_][a-z0-9_]*|%I_[a-z_]+)\s+ON\s+([a-z_.%I]+)/gi)) {
    const prefix = source.slice(Math.max(0, match.index! - 2500), match.index);
    const name = match[1];
    if (!new RegExp(`DROP\\s+POLICY\\s+IF\\s+EXISTS\\s+${name.replace('%I', '%I')}\\s+ON`, 'i').test(prefix)) {
      violations.push(`CREATE POLICY ${name} lacks a preceding DROP POLICY IF EXISTS`);
    }
  }
  const notify = /NOTIFY\s+pgrst\s*,\s*'reload schema'\s*;/i.test(source);
  if (label === 'schema.sql' && !notify) violations.push('missing PostgREST schema reload notification');
  const ok = violations.length === 0;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: rerun safety${violations.length ? ` (${violations.join('; ')})` : ''}`);
  if (!ok) failed = true;
}
auditIdempotency(schema, 'schema.sql');
for (const file of migrationFiles) auditIdempotency(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'), file);

const helperFunctions = ['auth_user_id', 'auth_school_id', 'auth_user_role', 'auth_can_access_student', 'auth_can_access_class'];
const firstPolicyIndex = schema.search(/\bCREATE\s+POLICY\b/i);
const undefinedHelpers = helperFunctions.filter(name => !schema.includes(`CREATE OR REPLACE FUNCTION private.${name}(`));
const lateHelpers = helperFunctions.filter(name => {
  const definitionIndex = schema.indexOf(`CREATE OR REPLACE FUNCTION private.${name}(`);
  return definitionIndex === -1 || (firstPolicyIndex !== -1 && definitionIndex > firstPolicyIndex);
});
const helperOrderOk = undefinedHelpers.length === 0 && lateHelpers.length === 0;
console.log(`${helperOrderOk ? 'PASS' : 'FAIL'} auth helper functions are defined before the first policy${helperOrderOk ? '' : ` (missing: ${undefinedHelpers.join(', ') || 'none'}; late: ${lateHelpers.join(', ') || 'none'})`}`);
if (!helperOrderOk) failed = true;

// Only inspect executable static SQL. Comments and quoted literals can contain ordinary
// English words such as "references a" that are not SQL foreign-key declarations.
const staticSchema = schema
  .replace(/--[^\n]*/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/'(?:''|[^'])*'/g, "''")
  .split('\n')
  .filter(line => !line.includes('%I'))
  .join('\n');
const tableCreationPositions = new Map<string, number>();
for (const match of staticSchema.matchAll(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi)) {
  if (!tableCreationPositions.has(match[1].toLowerCase())) tableCreationPositions.set(match[1].toLowerCase(), match.index!);
}
function findEarlyReferences(pattern: RegExp, label: string) {
  const early: string[] = [];
  for (const match of staticSchema.matchAll(pattern)) {
    const table = match[1].toLowerCase();
    const creation = tableCreationPositions.get(table);
    if (creation === undefined || creation > match.index!) early.push(`${label} on ${table}`);
  }
  return early;
}
const earlyForeignKeys: string[] = [];
for (const match of staticSchema.matchAll(/\bREFERENCES\s+(?:(public|auth)\.)?([a-z_][a-z0-9_]*)/gi)) {
  const referencedSchema = (match[1] || 'public').toLowerCase();
  if (referencedSchema === 'auth') continue; // Supabase-managed auth.users is not created by schema.sql.
  const table = match[2].toLowerCase();
  const creation = tableCreationPositions.get(table);
  if (creation === undefined || creation > match.index!) earlyForeignKeys.push(`foreign key on ${table}`);
}
const earlyTableReferences = [
  ...findEarlyReferences(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?[a-z_][a-z0-9_]*\s+ON\s+(?:public\.)?([a-z_][a-z0-9_]*)(?!\.%I)/gi, 'index'),
  ...findEarlyReferences(/ALTER\s+TABLE\s+(?:public\.)?([a-z_][a-z0-9_]*)(?!\.%I)/gi, 'alter'),
  ...findEarlyReferences(/CREATE\s+POLICY\s+[a-z_][a-z0-9_]*\s+ON\s+(?:public\.)?([a-z_][a-z0-9_]*)(?!\.%I)/gi, 'policy'),
  ...earlyForeignKeys
];
const tableOrderOk = earlyTableReferences.length === 0;
console.log(`${tableOrderOk ? 'PASS' : 'FAIL'} schema statements reference tables only after creation${tableOrderOk ? '' : ` (${[...new Set(earlyTableReferences)].join('; ')})`}`);
if (!tableOrderOk) failed = true;

const migrationTables = new Set(migrationFiles.flatMap(file =>
  [...fs.readFileSync(`supabase/migrations/${file}`, 'utf8').matchAll(/CREATE TABLE IF NOT EXISTS\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi)]
    .map(match => match[1].toLowerCase())
));
const tableMapStart = storage.indexOf('const tableMap:');
const tableMapEnd = storage.indexOf('];', tableMapStart);
const tableMapSource = storage.slice(tableMapStart, tableMapEnd);
const startupTables = new Set([...tableMapSource.matchAll(/\['(?:[^']+)',\s*'([a-z_][a-z0-9_]*)'\]/g)].map(match => match[1].toLowerCase()));
const schemaTables = new Set(uniqueTables);
const uncovered = [...startupTables].filter(table => !schemaTables.has(table) || (['school_branches','fee_ranges','bus_assignments','notification_templates','staff_members','admission_applications','library_books','transport_routes','lockout_counters','restore_test_records','promotion_history'].includes(table) && !migrationTables.has(table)));
console.log(`${uncovered.length ? 'FAIL' : 'PASS'} startup table check coverage in schema and missing-tables migration${uncovered.length ? ` (${uncovered.join(', ')})` : ''}`);
if (uncovered.length) failed = true;
for (const table of uniqueTables) {
  const hasSpecific = new RegExp(`CREATE POLICY [a-z_]+ ON ${table}\\b`, 'i').test(schema);
  const hasRlsPolicy = globalRlsEnable && (hasSpecific || genericTenantPolicy || genericPlatformPolicy);
  console.log(`${hasRlsPolicy ? 'PASS' : 'FAIL'} ${table}: RLS and policy coverage in schema source`);
  if (!hasRlsPolicy) failed = true;
}
for (const [table, policy] of specificRules) {
  const present = schema.includes(`CREATE POLICY ${policy} ON ${table}`);
  console.log(`${present ? 'PASS' : 'FAIL'} ${table}: required role-scoped policy ${policy}`);
  if (!present) failed = true;
}
console.log(`${checkQueryComplete ? 'PASS' : 'FAIL'} scripts/check-rls.sql reports RLS flag and policy count per public table`);
if (!checkQueryComplete) failed = true;
console.log(`Static source audit covered ${uniqueTables.length} declared tables. It does not query a live Supabase project.`);
if (failed) process.exitCode = 1;
