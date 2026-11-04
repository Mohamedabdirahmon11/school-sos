import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration033 = readFileSync(new URL('../supabase/migrations/033_inventory_items_and_atomic_stock_movements.sql', import.meta.url), 'utf8');
const migration034 = readFileSync(new URL('../supabase/migrations/034_notification_queue_retry_worker.sql', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
const storage = readFileSync(new URL('../src/server/storage.ts', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../src/server/notification-worker.ts', import.meta.url), 'utf8');
const settingsUi = readFileSync(new URL('../src/components/schooladmin/SchoolSettingsView.tsx', import.meta.url), 'utf8');
const apiClient = readFileSync(new URL('../src/services/api.ts', import.meta.url), 'utf8');
const broadcastsUi = readFileSync(new URL('../src/components/superadmin/BroadcastsView.tsx', import.meta.url), 'utf8');
const inventoryUi = readFileSync(new URL('../src/components/schooladmin/ExtraModulesView.tsx', import.meta.url), 'utf8');
const auditUi = readFileSync(new URL('../src/components/superadmin/SupportAuditView.tsx', import.meta.url), 'utf8');
const sidebarUi = readFileSync(new URL('../src/components/layout/Sidebar.tsx', import.meta.url), 'utf8');

test('inventory movements are tenant-bound, serialized, and cannot create negative stock', () => {
  assert.match(migration033, /FOREIGN KEY \(item_id, school_id\) REFERENCES public\.inventory_items\(id, school_id\)/);
  assert.match(migration033, /FOR UPDATE/);
  assert.match(migration033, /item_row\.quantity_on_hand \+ delta < 0/);
  assert.match(migration033, /INSERT INTO public\.inventory_transactions/);
  assert.match(migration033, /GRANT EXECUTE ON FUNCTION public\.schoolos_adjust_inventory[\s\S]*TO service_role/);
  assert.match(api, /schoolId:\s*school\.id,\s*itemId:\s*req\.params\.id/);
  assert.ok(api.includes('Opening stock must be recorded as a stock-in transaction.'));
});

test('notification queue uses atomic claims, bounded attempts, delayed retry, and school-scoped manual retry', () => {
  assert.match(migration034, /FOR UPDATE SKIP LOCKED/);
  assert.match(migration034, /attempt_count < max_attempts/);
  assert.match(migration034, /interval '1 minute'/);
  assert.match(migration034, /interval '5 minutes'/);
  const migration036 = readFileSync(new URL('../supabase/migrations/036_recover_stale_notification_worker_claims.sql', import.meta.url), 'utf8');
  assert.match(migration036, /status = 'processing'/);
  assert.match(migration036, /last_attempt_at < now\(\) - interval '5 minutes'/);
  assert.match(migration034, /WHERE id = p_id AND school_id = p_school_id AND status = 'failed'/);
  assert.match(storage, /schoolos_claim_communication_queue/);
  assert.match(storage, /schoolos_complete_communication_queue/);
  assert.match(storage, /schoolos_retry_communication_queue/);
  assert.match(api, /communication\/queue\/:id\/retry/);
});

test('notification worker uses fixed provider hosts, international numbers, and bounded network timeouts', () => {
  assert.match(worker, /AbortSignal\.timeout\(15_000\)/);
  assert.match(worker, /api\.twilio\.com/);
  assert.ok(worker.includes('api\\.infobip\\.com'));
  assert.match(worker, /graph\.facebook\.com/);
  assert.match(worker, /SCHOOL_OS_LOCAL_GATEWAY_URL/);
  assert.match(worker, /target\.protocol !== 'https:'/);
  assert.match(worker, /phone must be in international format/i);
});

test('communication API never returns stored provider secrets and audit export is awaited', () => {
  assert.match(storage, /apiKeyConfigured: Boolean\(settings\.apiKey\)/);
  assert.match(storage, /apiSecretConfigured: Boolean\(settings\.apiSecret\)/);
  assert.match(api, /getPublicCommunicationSettings\(school\.id\)/);
  assert.match(api, /Twilio activation requires Account SID/);
  assert.match(api, /Infobip activation requires an API key/);
  assert.match(api, /WhatsApp Business activation requires an access token/);
  assert.match(api, /SCHOOL_OS_LOCAL_GATEWAY_URL/);
  assert.match(api, /const csv = await db\.exportAuditLogsCSV\(\)/);
  assert.ok(storage.includes('if (/^\\s*[=+@-]/.test(text))'));
});

test('broadcast feeds are tenant- and audience-scoped; scheduled broadcasts are published by the worker', () => {
  assert.match(storage, /target_school_id\.eq\.\$\{schoolId\},target_school_id\.is\.null/);
  assert.match(storage, /item\.status === 'sent'/);
  assert.match(storage, /item\.audience === 'school_admins'/);
  assert.match(storage, /item\.audience === 'teachers'/);
  assert.match(storage, /publishDueBroadcasts/);
  assert.match(api, /apiRouter\.get\('\/broadcasts'/);
  assert.match(api, /apiRouter\.post\('\/superadmin\/broadcasts\/:id\/send'/);
  assert.match(worker, /publishDueBroadcasts\(\)/);
});

test('reports exclude voided payments and use active student attendance denominators', () => {
  const migration = readFileSync(new URL('../supabase/migrations/037_reports_exclude_voided_and_inactive_records.sql', import.meta.url), 'utf8');
  assert.ok(migration.includes("status IN ('present', 'late')"));
  assert.match(migration, /status = 'excused'/);
  assert.match(migration, /active_student\.status = 'active'/);
  assert.match(migration, /WHERE school_id = p_school_id AND voided_at IS NULL/);
});

test('communication credentials are AES-GCM encrypted before persistence', () => {
  assert.match(storage, /aes-256-gcm/);
  assert.match(storage, /COMMUNICATION_CREDENTIALS_KEY/);
  assert.match(storage, /COMMUNICATION_SECRET_PREFIX/);
  assert.match(storage, /decryptCommunicationSecret/);
});

test('notification processing enum and retry completion use the database enum type', () => {
  const migration038 = readFileSync(new URL('../supabase/migrations/038_add_processing_notification_status.sql', import.meta.url), 'utf8');
  const migration039 = readFileSync(new URL('../supabase/migrations/039_cast_notification_status_enum_in_retry_rpc.sql', import.meta.url), 'utf8');
  assert.match(migration038, /ADD VALUE IF NOT EXISTS 'processing'/);
  assert.match(migration039, /END\)::public\.comm_status_enum/);
  assert.match(migration039, /GRANT EXECUTE ON FUNCTION public\.schoolos_complete_communication_queue/);
});

test('school settings UI supports safe credential updates and manual retries', () => {
  assert.match(settingsUi, /apiKeyConfigured/);
  assert.match(settingsUi, /apiSecretConfigured/);
  assert.match(settingsUi, /whatsapp_business/);
  assert.match(settingsUi, /Infobip HTTPS Base URL/);
  assert.match(settingsUi, /retryQueuedNotification/);
  assert.match(apiClient, /communication\/queue\//);
});

test('broadcast composer and API agree on immediate and scheduled delivery', () => {
  assert.match(api, /body\.sendNow === true \? 'draft' : body\.sendNow === false \? 'scheduled'/);
  assert.match(api, /immediate \? await db\.publishBroadcast\(created\.id\) : created/);
  assert.match(broadcastsUi, /sendNow: sendOption === 'now'/);
  assert.match(broadcastsUi, /scheduleDate\.toISOString\(\)/);
  assert.match(broadcastsUi, /Retry loading/);
});


test('inventory screen uses the persistent item API and stock movement ledger', () => {
  assert.match(apiClient, /getInventoryItems\(\)/);
  assert.match(apiClient, /createInventoryItem\(/);
  assert.match(apiClient, /createInventoryTransaction\(/);
  assert.match(inventoryUi, /ApiClient\.getInventoryItems\(\)/);
  assert.match(inventoryUi, /ApiClient\.createInventoryItem\(/);
  assert.match(inventoryUi, /ApiClient\.createInventoryTransaction\(/);
  assert.match(inventoryUi, /Movement history/);
  assert.match(inventoryUi, /Low stock/);
  assert.match(inventoryUi, /handleToggleInventoryItem/);
  assert.match(inventoryUi, /Archive/);
  assert.match(inventoryUi, /Reactivate/);
  assert.match(sidebarUi, /sch_inventory.*t\('inventory'\)/);
});

test('audit CSV export downloads the complete server-side export, not only the visible page', () => {
  assert.match(auditUi, /\/api\/superadmin\/audit-logs\/export-csv/);
  assert.match(auditUi, /response\.blob\(\)/);
  assert.match(storage, /Prevent spreadsheet formula execution/);
  assert.match(api, /exportAuditLogsCSV\(\)/);
});
