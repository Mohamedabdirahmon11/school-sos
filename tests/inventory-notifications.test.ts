import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration033 = readFileSync(new URL('../supabase/migrations/033_inventory_items_and_atomic_stock_movements.sql', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
const storage = readFileSync(new URL('../src/server/storage.ts', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
const settingsUi = readFileSync(new URL('../src/components/schooladmin/SchoolSettingsView.tsx', import.meta.url), 'utf8');
const inventoryUi = readFileSync(new URL('../src/components/schooladmin/ExtraModulesView.tsx', import.meta.url), 'utf8');
const attendanceUi = readFileSync(new URL('../src/components/schooladmin/AttendanceView.tsx', import.meta.url), 'utf8');
const reportsUi = readFileSync(new URL('../src/components/schooladmin/ReportsView.tsx', import.meta.url), 'utf8');
const auditUi = readFileSync(new URL('../src/components/superadmin/SupportAuditView.tsx', import.meta.url), 'utf8');
const manualGuide = readFileSync(new URL('../docs/notification-providers.md', import.meta.url), 'utf8');

test('inventory movements are tenant-bound, serialized, and cannot create negative stock', () => {
  assert.match(migration033, /FOREIGN KEY \(item_id, school_id\) REFERENCES public\.inventory_items\(id, school_id\)/);
  assert.match(migration033, /FOR UPDATE/);
  assert.match(migration033, /item_row\.quantity_on_hand \+ delta < 0/);
  assert.match(migration033, /INSERT INTO public\.inventory_transactions/);
  assert.match(migration033, /GRANT EXECUTE ON FUNCTION public\.schoolos_adjust_inventory[\s\S]*TO service_role/);
  assert.match(api, /schoolId:\s*school\.id,\s*itemId:\s*req\.params\.id/);
  assert.ok(api.includes('Opening stock must be recorded as a stock-in transaction.'));
});

test('parent absence messages use the administrator WhatsApp account and require manual Send', () => {
  assert.match(settingsUi, /Official Telephone \/ WhatsApp maamulka/);
  assert.match(settingsUi, /maamuluhu ayaa riixaya Send/);
  assert.match(attendanceUi, /https:\/\/wa\.me\//);
  assert.match(attendanceUi, /parentWhatsAppNumber/);
  assert.match(attendanceUi, /window\.open\(url, '_blank'/);
  assert.match(attendanceUi, /encodeURIComponent\(message\)/);
  assert.match(attendanceUi, /state\.status === 'absent'/);
  assert.match(manualGuide, /administrator-owned WhatsApp account/);
  assert.match(manualGuide, /presses \*\*Send\*\* in WhatsApp/);
  assert.match(manualGuide, /does not send WhatsApp messages automatically/);
});

test('no paid messaging worker is started or required', () => {
  assert.equal(existsSync(new URL('../src/server/notification-worker.ts', import.meta.url)), false);
  assert.doesNotMatch(server, /notification-worker|startNotificationWorker/);
  assert.doesNotMatch(storage, /claimCommunicationQueueItem\(/);
});

test('inventory screen uses persistent item API and stock movement ledger', () => {
  assert.match(inventoryUi, /ApiClient\.getInventoryItems\(\)/);
  assert.match(inventoryUi, /ApiClient\.createInventoryItem\(/);
  assert.match(inventoryUi, /ApiClient\.createInventoryTransaction\(/);
  assert.match(inventoryUi, /Movement history/);
  assert.match(inventoryUi, /Low stock/);
  assert.match(inventoryUi, /handleToggleInventoryItem/);
  assert.match(inventoryUi, /Archive/);
  assert.match(inventoryUi, /Reactivate/);
});

test('reports exclude voided payments, preserve zero attendance, and describe configured pass marks', () => {
  const migration = readFileSync(new URL('../supabase/migrations/037_reports_exclude_voided_and_inactive_records.sql', import.meta.url), 'utf8');
  assert.ok(migration.includes("status IN ('present', 'late')"));
  assert.match(migration, /status = 'excused'/);
  assert.match(migration, /active_student\.status = 'active'/);
  assert.match(migration, /WHERE school_id = p_school_id AND voided_at IS NULL/);
  assert.match(storage, /studentPayments = payments\.filter\(p => p\.studentId === student\.id && !p\.voidedAt\)/);
  assert.match(storage, /const totalDue = studentPayments\.reduce/);
  assert.match(storage, /const totalRemaining = studentPayments\.reduce/);
  assert.ok(storage.includes('const totalCollected = payments.reduce((acc, p) => acc + (Number(p.amountPaid) || 0), 0);'));
  assert.ok(reportsUi.includes('0%'));
});

test('audit CSV export downloads the complete server-side export and protects spreadsheet formulas', () => {
  assert.match(auditUi, /\/api\/superadmin\/audit-logs\/export-csv/);
  assert.match(auditUi, /response\.blob\(\)/);
  assert.match(storage, /Prevent spreadsheet formula execution/);
  assert.match(api, /exportAuditLogsCSV\(\)/);
});
