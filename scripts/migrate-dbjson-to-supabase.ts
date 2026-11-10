import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { hashPassword, hashPin } from '../src/server/auth-security.ts';

const sourcePath = path.resolve('data/db.json');
const backupPath = path.resolve('data/db.json.bak');
if (!fs.existsSync(backupPath)) throw new Error('Create data/db.json.bak before migration.');
if (!fs.existsSync(sourcePath)) throw new Error('data/db.json was not found.');

const dryRun = process.argv.includes('--dry-run');
const url = process.env.SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!dryRun && !url) throw new Error('SUPABASE_URL is required.');
if (!dryRun && !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required.');

const raw = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const schemaSource = fs.readFileSync(path.resolve('schema.sql'), 'utf8');
if (!Array.isArray(raw.users)) throw new Error('Source data has no users array.');
const adminCandidates = raw.users.filter((user: any) => user.id === 'usr-super-admin-01' || user.role === 'super_admin');
const legacyAdmin = adminCandidates[adminCandidates.length - 1];
if (!legacyAdmin) throw new Error('Source data has no Super Admin record.');
const sourceUsers: any[] = raw.users;
legacyAdmin.role = 'super_admin';
legacyAdmin.twoFactorEnabled = false;
delete legacyAdmin.two_factor_enabled;
delete legacyAdmin.twoFactorSecret;
delete legacyAdmin.two_factor_secret;
delete legacyAdmin.pendingTwoFactorSecret;
delete legacyAdmin.pending_two_factor_secret;
legacyAdmin.mustSetup2FA = true;
legacyAdmin.mustChangePassword = true;
raw.users = raw.users.filter((user: any) => user === legacyAdmin || (user.id !== 'usr-super-admin-01' && user.role !== 'super_admin'));

for (const user of raw.users) {
  if (user.passwordHash && !String(user.passwordHash).startsWith('scrypt:')) user.passwordHash = hashPassword(String(user.passwordHash));
  if (user.pin && !String(user.pin).startsWith('pin_scrypt:')) user.pin = hashPin(String(user.pin));
}
for (const student of raw.students || []) {
  if (student.pin && !student.pinHash) student.pinHash = hashPin(String(student.pin));
  else if (student.pinHash && !String(student.pinHash).startsWith('pin_scrypt:')) student.pinHash = hashPin(String(student.pinHash));
  delete student.pin;
}

const aliases: Record<string, string> = { requireSuperAdmin2FA: 'require_super_admin_2fa', mustSetup2FA: 'must_setup_2fa', count: 'attempt_count' };
const camelToSnake = (key: string) => aliases[key] || key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
function convert(value: any, includePinHash = false): any {
  if (Array.isArray(value)) return value.map(item => convert(item, includePinHash));
  if (!value || typeof value !== 'object') return value;
  const result: Record<string, any> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === 'subscription') continue;
    if (key === 'pin' && !includePinHash) continue;
    const target = key === 'pin' ? 'pin_hash' : camelToSnake(key);
    // A legacy object may contain both camelCase and snake_case versions. Keep one
    // deterministic field and let the explicit snake_case field take precedence.
    if (!(target in result) || key === target) result[target] = convert(child, includePinHash);
  }
  return result;
}

type ColumnInfo = { notNull: boolean; defaultSql?: string; primaryKey: boolean; checks: string[]; enumValues?: string[] };
type TableInfo = Map<string, ColumnInfo>;
const tableInfo = new Map<string, TableInfo>();
const enumTypes = new Map<string, string[]>();
for (const match of schemaSource.matchAll(/CREATE\s+TYPE\s+([a-z_][a-z0-9_]*)\s+AS\s+ENUM\s*\(([^)]*)\)/gi)) {
  enumTypes.set(match[1].toLowerCase(), [...match[2].matchAll(/'((?:[^']|'')*)'/g)].map(item => item[1].replace(/''/g, "'")));
}
function splitDefinitions(body: string): string[] {
  const result: string[] = [];
  let start = 0;
  let depth = 0;
  let quote = false;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "'") {
      if (quote && body[i + 1] === "'") { i++; continue; }
      quote = !quote;
    } else if (!quote && body[i] === '(') depth++;
    else if (!quote && body[i] === ')') depth--;
    else if (!quote && depth === 0 && body[i] === ',') { result.push(body.slice(start, i).trim()); start = i + 1; }
  }
  result.push(body.slice(start).trim());
  return result;
}
function parseSchema() {
  for (const match of schemaSource.matchAll(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+([a-z_]+)\s*\(([\s\S]*?)\n\);/gi)) {
    const table = match[1].toLowerCase();
    const info: TableInfo = new Map();
    for (const definition of splitDefinitions(match[2])) {
      const col = definition.match(/^([a-z_][a-z0-9_]*)\s+([\s\S]+)$/i);
      if (!col || /^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)\b/i.test(col[1])) continue;
      const rest = col[2];
      const typeName = rest.match(/^([a-z_][a-z0-9_]*)/i)?.[1]?.toLowerCase();
      const defaultMatch = rest.match(/\bDEFAULT\s+([\s\S]+?)(?=\s+(?:NOT\s+NULL|NULL|PRIMARY\s+KEY|UNIQUE|REFERENCES|CHECK)\b|$)/i);
      info.set(col[1].toLowerCase(), {
        notNull: /\bNOT\s+NULL\b/i.test(rest) || /\bPRIMARY\s+KEY\b/i.test(rest),
        primaryKey: /\bPRIMARY\s+KEY\b/i.test(rest),
        defaultSql: defaultMatch?.[1]?.trim(),
        checks: [...rest.matchAll(/CHECK\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)/gi)].map(item => item[1].trim()),
        enumValues: typeName ? enumTypes.get(typeName) : undefined
      });
    }
    tableInfo.set(table, info);
  }
  // Include metadata for columns introduced after initial CREATE TABLE statements.
  for (const match of schemaSource.matchAll(/ALTER\s+TABLE\s+([a-z_]+)\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+([a-z_]+)\s+([\s\S]*?);/gi)) {
    const [, tableName, columnName, rest] = match;
    const info = tableInfo.get(tableName.toLowerCase());
    if (!info) continue;
    const defaultMatch = rest.match(/\bDEFAULT\s+([\s\S]+?)(?=\s+(?:NOT\s+NULL|NULL|PRIMARY\s+KEY|UNIQUE|REFERENCES|CHECK)\b|$)/i);
    info.set(columnName.toLowerCase(), { notNull: /\bNOT\s+NULL\b/i.test(rest), primaryKey: false, defaultSql: defaultMatch?.[1]?.trim(), checks: [] });
  }
}
parseSchema();

function safeDefault(sql: string | undefined): { found: boolean; value?: any } {
  if (!sql) return { found: false };
  const original = sql.trim();
  if (/^ARRAY\[\]\s*::\s*[a-z_][a-z0-9_]*\[\]$/i.test(original)) return { found: true, value: [] };
  if (/::jsonb\s*$/i.test(original)) {
    const jsonLiteral = original.replace(/::jsonb\s*$/i, '').trim();
    if (/^'(?:[^']|'')*'$/.test(jsonLiteral)) {
      try { return { found: true, value: JSON.parse(jsonLiteral.slice(1, -1).replace(/''/g, "'")) }; } catch { return { found: false }; }
    }
  }
  const array = original.match(/^ARRAY\[([\s\S]*)\](?:::[a-z_][a-z0-9_]*(?:\[\])?)?$/i);
  if (array) {
    if (!array[1].trim()) return { found: true, value: [] };
    const values = splitDefinitions(array[1]).map(item => safeDefault(item));
    return values.every(item => item.found) ? { found: true, value: values.map(item => item.value) } : { found: false };
  }
  const value = sql.trim().replace(/::[a-z_][a-z0-9_]*(?:\[\])?/gi, '').trim();
  if (/^(true|false)$/i.test(value)) return { found: true, value: value.toLowerCase() === 'true' };
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return { found: true, value: Number(value) };
  if (/^'(?:[^']|'')*'$/.test(value)) return { found: true, value: value.slice(1, -1).replace(/''/g, "'") };
  if (/^(now|current_timestamp)\(\)$/i.test(value) || /^now\(\)$/i.test(value)) return { found: true, value: new Date().toISOString() };
  if (/^current_date$/i.test(value)) return { found: true, value: new Date().toISOString().slice(0, 10) };
  if (/^array\[\]$/i.test(value)) return { found: true, value: [] };
  if (/^'\{[^']*\}'$/.test(value)) return { found: true, value: value.slice(2, -2) ? value.slice(2, -2).split(',') : [] };
  return { found: false };
}

type SourceTable = { source: string; table: string; rows: any[] };
const schools = (raw.schools || []).map((school: any) => {
  const { subscription, ...record } = school;
  return record;
});
const subscriptions = (raw.schools || []).filter((school: any) => school.subscription).map((school: any) => ({ id: school.id, schoolId: school.id, ...school.subscription }));
// Parent tables precede dependants; the sequence also resolves the schema's
// intentional cycles by inserting the nullable references only after parents exist.
const tableOrder: Array<[string, string]> = [
  ['plans', 'plans'], ['schools', 'schools'], ['branches', 'school_branches'], ['subscriptions', 'school_subscriptions'],
  ['users', 'users'], ['sessions', 'user_sessions'], ['classes', 'classes'], ['subjects', 'subjects'],
  ['students', 'students'], ['teachers', 'teachers'], ['timetable', 'timetable_slots'], ['attendance', 'attendance_records'],
  ['examConfigs', 'exam_configs'], ['marks', 'student_marks'], ['promotions', 'promotions'], ['feeStructures', 'fee_structures'],
  ['feePayments', 'fee_payments'], ['reportCardDesigns', 'report_card_templates'], ['communicationSettings', 'communication_settings'],
  ['communicationQueue', 'communication_queue'], ['notices', 'school_notices'], ['events', 'school_events'],
  ['messages', 'direct_messages'], ['broadcasts', 'platform_broadcasts'], ['tickets', 'support_tickets'],
  ['invoices', 'subscription_invoices'], ['auditLogs', 'audit_logs'], ['assignments', 'assignments'],
  ['assignmentSubmissions', 'assignment_submissions'], ['staffMembers', 'staff_members'], ['libraryBooks', 'library_books'],
  ['transportRoutes', 'transport_routes'], ['admissionApplications', 'admission_applications'], ['feeRanges', 'fee_ranges'],
  ['busAssignments', 'bus_assignments'], ['notificationTemplates', 'notification_templates'], ['promotionHistory', 'promotion_history'],
  ['restoreTestRecords', 'restore_test_records'], ['lockoutCounters', 'lockout_counters']
];
const sources: SourceTable[] = [{ source: 'settings', table: 'super_admin_settings', rows: raw.settings ? [{ id: 'default', ...raw.settings }] : [] }];
for (const [source, table] of tableOrder) {
  const rows = source === 'schools' ? schools
    : source === 'subscriptions' ? subscriptions
      : source === 'lockoutCounters' ? Object.entries(raw.lockoutCounters || {}).map(([id, state]: [string, any]) => ({ id, ...state }))
        : (raw[source] || []);
  sources.push({ source, table, rows });
}

function prepare(entry: SourceTable): any[] {
  const info = tableInfo.get(entry.table);
  if (!info) throw new Error(`Migration target ${entry.table} is absent from schema.sql.`);
  const payload = entry.rows.map((row: any) => convert(row, entry.source === 'users'));
  const missing = new Set<string>();
  for (const row of payload) for (const field of Object.keys(row)) if (!info.has(field)) missing.add(field);
  if (missing.size) throw new Error(`Migration target ${entry.table} has unmapped schema columns: ${[...missing].sort().join(', ')}.`);
  for (const row of payload) {
    if (entry.table === 'fee_payments' && row.payment_method !== 'Cash') {
      const original = String(row.payment_method ?? '');
      row.payment_method = 'Cash';
      row.notes = [row.notes, `Legacy method: ${original}`].filter(Boolean).join(' | ');
    }
    if (entry.table === 'fee_payments' && typeof row.recorded_by === 'string') {
      const legacyName = row.recorded_by.trim();
      const matchingUser = sourceUsers.find(user => String(user.fullName ?? '').trim() === legacyName);
      if (matchingUser) {
        row.recorded_by = matchingUser.id;
      } else {
        const schoolAdmin = sourceUsers.find(user => user.schoolId === row.school_id && user.role === 'school_admin');
        row.recorded_by = null;
        row.notes = [row.notes, `Legacy recorded by: ${legacyName}`].filter(Boolean).join(' | ');
        if (schoolAdmin) row.recorded_by = schoolAdmin.id;
      }
    }
    if (entry.table === 'users') {
      // A stored secret alone does not prove enrollment. Only the explicit enabled
      // state paired with a secret is treated as a verified TOTP enrollment.
      row.two_factor_enabled = row.two_factor_enabled === true && Boolean(row.two_factor_secret);
    }
    for (const [column, definition] of info) {
      if (!definition.notNull || (row[column] !== null && row[column] !== undefined)) continue;
      const fallback = safeDefault(definition.defaultSql);
      if (fallback.found) row[column] = fallback.value;
    }
  }
  return payload;
}
const prepared = sources.map(entry => ({ ...entry, payload: prepare(entry) }));
function checkPasses(value: any, expression: string): boolean {
  const expr = expression.trim();
  const inMatch = expr.match(/^([a-z_][a-z0-9_]*)\s+IN\s*\((.*)\)$/i);
  if (inMatch) return value == null || [...inMatch[2].matchAll(/'((?:[^']|'')*)'/g)].some(item => value === item[1].replace(/''/g, "'"));
  const eqMatch = expr.match(/^([a-z_][a-z0-9_]*)\s*=\s*'((?:[^']|'')*)'$/i);
  if (eqMatch) return value == null || value === eqMatch[2].replace(/''/g, "'");
  const betweenMatch = expr.match(/^([a-z_][a-z0-9_]*)\s+BETWEEN\s+(-?\d+(?:\.\d+)?)\s+AND\s+(-?\d+(?:\.\d+)?)$/i);
  if (betweenMatch) return value == null || (Number(value) >= Number(betweenMatch[2]) && Number(value) <= Number(betweenMatch[3]));
  const compareMatch = expr.match(/^([a-z_][a-z0-9_]*)\s*(>=|<=|>|<)\s*(-?\d+(?:\.\d+)?)$/i);
  if (compareMatch) {
    if (value == null) return true;
    const n = Number(value), limit = Number(compareMatch[3]);
    return compareMatch[2] === '>=' ? n >= limit : compareMatch[2] === '<=' ? n <= limit : compareMatch[2] === '>' ? n > limit : n < limit;
  }
  return true;
}
const violations = prepared.map(({ table, payload }) => ({ table, rows: payload.flatMap((row, index) => {
  const fields: string[] = [];
  for (const [column, info] of tableInfo.get(table) || []) {
    const value = row[column];
    if (info.notNull && (value === null || value === undefined)) fields.push(`${column} NOT NULL`);
    if (value !== null && value !== undefined && info.enumValues && !info.enumValues.includes(value)) fields.push(`${column} enum (${info.enumValues.join('|')})`);
    if (value !== null && value !== undefined && info.checks.some(check => !checkPasses(value, check))) fields.push(`${column} CHECK`);
  }
  return fields.length ? [{ record: index + 1, fields }] : [];
}) })).filter(item => item.rows.length);
if (dryRun) {
  console.log('Schema validation (NOT NULL, CHECK, and enum constraints; no database writes):');
  for (const { table, payload } of prepared) {
    const tableViolations = violations.find(item => item.table === table)?.rows || [];
    console.log(`${table}: ${tableViolations.length ? tableViolations.map(row => `record ${row.record} [${row.fields.join(', ')}]`).join('; ') : 'no remaining violations'} (${payload.length} records)`);
  }
}
if (violations.length) throw new Error(`Migration stopped: ${violations.length} table(s) have unresolved schema constraint violations.`);

const client: SupabaseClient | null = !dryRun && url && key
  ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;
async function upsert(table: string, rows: any[]) {
  if (!rows.length || dryRun) return;
  const primary = [...(tableInfo.get(table) || [])].filter(([, column]) => column.primaryKey).map(([name]) => name);
  if (primary.length !== 1) throw new Error(`Cannot determine a single primary key for ${table}.`);
  const { error } = await client!.from(table).upsert(rows, { onConflict: primary[0] });
  if (error) throw new Error(`Import failed for ${table}: ${error.message}`);
}

for (const item of prepared) {
  if (!item.payload.length) continue;
  await upsert(item.table, item.payload);
  console.log(`${item.table}: ${dryRun ? 'validated' : 'imported'} ${item.payload.length} records`);
}
console.log(dryRun ? 'Dry run complete; no rows were written.' : 'Migration requests completed. Verify row counts and login before removing JSON backups.');
