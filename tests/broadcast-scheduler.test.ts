import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const serverSource = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');

test('broadcast scheduler uses a lightweight request context', () => {
  const scheduler = serverSource.match(
    /const publishDueBroadcasts = async \(\) => \{([\s\S]*?)\n  \};/
  );

  assert.ok(scheduler, 'broadcast scheduler should be defined');
  assert.match(scheduler[1], /db\.createRequestContext\('broadcast-scheduler'\)/);
  assert.doesNotMatch(scheduler[1], /prepareRequestContext/);
});
