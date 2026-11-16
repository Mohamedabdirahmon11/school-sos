import test from 'node:test';
import assert from 'node:assert/strict';
import { VerificationRateLimiter } from '../src/lib/documents/verification-rate-limit.ts';

test('verification rate limiter allows requests up to the configured limit', () => {
  const limiter = new VerificationRateLimiter(2, 1_000);
  assert.equal(limiter.consume('client-a', 10).allowed, true);
  assert.equal(limiter.consume('client-a', 11).allowed, true);
  const blocked = limiter.consume('client-a', 12);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 1);
});

test('verification rate limiter resets an expired client window', () => {
  const limiter = new VerificationRateLimiter(1, 1_000);
  assert.equal(limiter.consume('client-a', 100).allowed, true);
  assert.equal(limiter.consume('client-a', 200).allowed, false);
  assert.equal(limiter.consume('client-a', 1_100).allowed, true);
});

test('verification rate limiter keeps client buckets bounded', () => {
  const limiter = new VerificationRateLimiter(1, 1_000, 2);
  limiter.consume('client-a', 0);
  limiter.consume('client-b', 0);
  limiter.consume('client-c', 0);
  assert.equal(limiter.consume('client-c', 1).allowed, false);
  assert.equal(limiter.consume('client-a', 1).allowed, true);
});
