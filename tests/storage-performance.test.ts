import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateSubscriptionGraceEnd, shouldTouchSession } from '../src/server/storage.ts';

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
  const currentExpiry = new Date(now + 57_000).toISOString();

  assert.equal(shouldTouchSession(currentExpiry, new Date(now + 60_000 - 1).toISOString(), now), false);
  assert.equal(shouldTouchSession(currentExpiry, new Date(now + 60_000).toISOString(), now), true);
});

test('session expiry reductions and invalid stored expiries are persisted immediately', () => {
  const now = Date.UTC(2026, 10, 3, 12, 0, 0);
  assert.equal(
    shouldTouchSession(new Date(now + 60_000).toISOString(), new Date(now + 30_000).toISOString(), now),
    true
  );
  assert.equal(shouldTouchSession('invalid', new Date(now + 60_000).toISOString(), now), true);
});

test('subscription grace periods preserve an explicitly configured zero days', () => {
  const validUntil = '2026-11-03T00:00:00.000Z';
  assert.equal(calculateSubscriptionGraceEnd(validUntil, 0, 7).toISOString(), validUntil);
});

test('subscription grace periods use platform defaults only when school setting is absent', () => {
  const validUntil = '2026-11-03T00:00:00.000Z';
  assert.equal(calculateSubscriptionGraceEnd(validUntil, undefined, 3).toISOString(), '2026-11-06T00:00:00.000Z');
});
