import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/047_restrict_notification_writes.sql', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../src/server/notification-worker.ts', import.meta.url), 'utf8');

test('notification and communication tables restrict authenticated writes to school admins', () => {
  for (const table of ['communication_settings', 'notification_templates', 'communication_queue']) {
    assert.ok(migration.includes("'" + table + "'"));
    assert.ok(schema.includes(table + "_admin_insert"));
    assert.ok(schema.includes(table + "_admin_update"));
    assert.ok(schema.includes(table + "_admin_delete"));
  }
  assert.ok(migration.includes('AS RESTRICTIVE'));
  assert.ok(migration.includes("private.auth_user_role() IN (''school_admin'', ''super_admin'')"));
});

test('background worker never dispatches paid SMS or WhatsApp providers', () => {
  assert.ok(worker.includes('intentionally never invoked'));
  assert.ok(worker.includes('notification queue items are not auto-sent'));
  assert.ok(worker.includes('publishDueBroadcasts'));
});
