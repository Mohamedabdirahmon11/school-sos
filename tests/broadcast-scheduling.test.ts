import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
const storage = readFileSync(new URL('../src/server/storage.ts', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../src/components/superadmin/BroadcastsView.tsx', import.meta.url), 'utf8');

test('scheduled broadcasts are checked immediately and periodically by the server', () => {
  assert.match(server, /prepareRequestContext\(false, 'broadcast-scheduler'\)/);
  assert.match(server, /runDueBroadcastCheck\(\)\.catch/);
  assert.match(server, /setInterval\(\(\) => \{\s*void runDueBroadcastCheck\(\)\.catch/);
  assert.match(server, /60 \* 1000/);
  assert.match(server, /broadcastTimer\.unref\(\)/);
});

test('due broadcasts publish once and create a system audit record', () => {
  assert.match(storage, /queryRows<PlatformBroadcast>\('platform_broadcasts', \{ status: 'scheduled' \}\)/);
  assert.match(storage, /Date\.parse\(item\.scheduledFor\) > now/);
  assert.match(storage, /\.in\('status', \['draft', 'scheduled'\]\)/);
  assert.match(storage, /PLATFORM_BROADCAST_AUTO_PUBLISHED/);
  assert.match(storage, /SchoolOS Scheduler/);
});

test('platform broadcast management is Super Admin-only and UI exposes retry on load errors', () => {
  assert.match(api, /apiRouter\.post\('\\/superadmin\\/broadcasts', requireAuth, requireSuperAdmin/);
  assert.match(api, /apiRouter\.get\('\\/superadmin\\/broadcasts', requireAuth, requireSuperAdmin/);
  assert.match(ui, /loadError/);
  assert.match(ui, /Retry loading/);
});
