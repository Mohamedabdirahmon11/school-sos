import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../src/server/storage.ts';

test('portal account and IP lockouts increase duration after each expired lock', () => {
  const originalNow = Date.now;
  let now = 1_900_000_000_000;
  Date.now = () => now;
  const key = `portal-backoff-${randomUUID()}`;
  try {
    for (let attempt = 0; attempt < 5; attempt += 1) db.recordLoginFailure(key, 5, 15);
    const firstLock = db.checkLoginLockout(key, 5, 15);
    assert.equal(firstLock.locked, true);
    assert.equal(firstLock.remainingMinutes, 15);

    now += 16 * 60 * 1000;
    assert.equal(db.checkLoginLockout(key, 5, 15).locked, false);
    for (let attempt = 0; attempt < 5; attempt += 1) db.recordLoginFailure(key, 5, 15);
    const secondLock = db.checkLoginLockout(key, 5, 15);
    assert.equal(secondLock.locked, true);
    assert.equal(secondLock.remainingMinutes, 30);
  } finally {
    Date.now = originalNow;
  }
});
