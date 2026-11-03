import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shouldTouchSession } from '../src/server/storage.ts';

test('session refresh persistence is throttled to at most once per minute', () => {
  const now = Date.UTC(2026, 10, 3, 12, 0, 0);
  const currentExpiry = new Date(now + 60 * 60 * 1000).toISOString();

  assert.equal(
    shouldTouchSession(currentExpiry, new Date(now + 60 * 60 * 1000 + 59_999).toISOString(), now),
    false
  );
  assert.equal(
    shouldTouchSession(currentExpiry, new Date(now + 60 * 60 * 1000 + 60_000).toISOString(), now),
    true
  );
});

test('short session timeouts use a proportionate refresh window', () => {
  const now = Date.UTC(2026, 10, 3, 12, 0, 0);
  const currentExpiry = new Date(now + 60_000).toISOString();

  assert.equal(shouldTouchSession(currentExpiry, new Date(now + 63_000 - 1).toISOString(), now), false);
  assert.equal(shouldTouchSession(currentExpiry, new Date(now + 63_000).toISOString(), now), true);
});

test('session expiry reductions and invalid stored expiries are persisted immediately', () => {
  const now = Date.UTC(2026, 10, 3, 12, 0, 0);
  assert.equal(
    shouldTouchSession(new Date(now + 60_000).toISOString(), new Date(now + 30_000).toISOString(), now),
    true
  );
  assert.equal(shouldTouchSession('invalid', new Date(now + 60_000).toISOString(), now), true);
});
