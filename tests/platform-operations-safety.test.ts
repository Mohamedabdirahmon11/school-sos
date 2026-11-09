import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { sanitizePlatformBackupValue } from '../src/server/storage.ts';

const storage = readFileSync(new URL('../src/server/storage.ts', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
const billing = readFileSync(new URL('../src/components/superadmin/PlansBillingView.tsx', import.meta.url), 'utf8');
const backupWorkflow = readFileSync(new URL('../.github/workflows/supabase-backup.yml', import.meta.url), 'utf8');
const backupDocs = readFileSync(new URL('../docs/automated-backups.md', import.meta.url), 'utf8');

test('platform backup recursively excludes credentials, active sessions, and lockout state', () => {
  const source = {
    users: [{ id: 'u1', passwordHash: 'hash', pinHash: 'pin-hash', fullName: 'Test', twoFactorSecret: 'totp' }],
    communicationSettings: [{ provider: 'smtp', apiKey: 'key', apiSecret: 'secret', webhookUrl: 'https://secret.invalid' }],
    sessions: [{ token: 'session-token' }],
    lockoutCounterRows: [{ count: 8, lockedUntil: 'later' }]
  };
  assert.deepEqual(sanitizePlatformBackupValue(source), {
    users: [{ id: 'u1', fullName: 'Test' }],
    communicationSettings: [{ provider: 'smtp' }]
  });
});

test('platform backup manifest declares exclusions and does not query session or lockout tables', () => {
  assert.match(storage, /table === 'lockout_counters' \|\| table === 'user_sessions'/);
  assert.match(storage, /credentialsIncluded: false/);
  assert.match(storage, /activeSessionsIncluded: false/);
  assert.match(storage, /restoreSupport: 'School-scoped merge restore only; full-platform restore is not supported\.'/);
});

test('backup is checksummed after its final settings are attached and audit success is recorded only after generation', () => {
  const generate = api.indexOf('const backup = await db.generatePlatformBackup()');
  const checksum = api.indexOf("algorithm: 'sha256'", generate);
  const successAudit = api.indexOf("action: 'PLATFORM_BACKUP_DOWNLOADED'", generate);
  const catchBlock = api.indexOf("action: 'PLATFORM_BACKUP_FAILED'", generate);
  assert.ok(generate >= 0 && checksum > generate && successAudit > checksum && catchBlock > successAudit);
  assert.match(api, /lastBackupStatus: 'failed'/);
});

test('scheduled broadcasts catch up on startup and continue polling while the server is running', () => {
  assert.match(server, /runDueBroadcastCheck\(\)\.catch/);
  assert.match(server, /60 \* 1000/);
  assert.match(server, /publishDueBroadcasts\(\)/);
});

test('subscription invoice action is explicitly manual reconciliation, not a payment gateway charge', () => {
  assert.match(billing, /manual reconciliation after funds are received/);
  assert.match(billing, /No online payment was charged/);
  assert.match(billing, /Record Received/);
});

test('off-site backups follow the saved daily or weekly policy and use a private artifact', () => {
  assert.ok(backupWorkflow.includes("cron: '0 2 * * *'"));
  assert.ok(backupWorkflow.includes('secrets.SUPABASE_DB_URL'));
  assert.ok(backupWorkflow.includes('backup_schedule'));
  assert.ok(backupWorkflow.includes('weekly'));
  assert.ok(backupWorkflow.includes('aws s3 cp'));
  assert.ok(backupWorkflow.includes('--sse AES256'));
  assert.ok(backupWorkflow.includes('BACKUP_S3_BUCKET'));
  assert.ok(!backupWorkflow.includes('upload-artifact'));
  assert.ok(backupDocs.includes('private Amazon S3 bucket'));
  assert.ok(backupWorkflow.includes('SHA256SUMS'));
  assert.ok(backupDocs.includes('new/empty recovery project'));
  assert.ok(backupDocs.includes('do not back up Storage object bytes'));
});
