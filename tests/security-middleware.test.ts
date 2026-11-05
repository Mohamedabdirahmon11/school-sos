import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import {
  createLoginRateLimiter,
  getTrustProxyHops,
  resetLoginRateLimit
} from '../src/server/security-middleware.ts';

const app = express();
app.set('trust proxy', 0);
app.use('/login', createLoginRateLimiter({ windowMs: 60_000, max: 2 }));
app.post('/login', (_req, res) => res.json({ ok: true }));

let server: ReturnType<typeof app.listen>;
let baseUrl: string;

before(async () => {
  resetLoginRateLimit();
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind to a TCP port.');
  baseUrl = `http://127.0.0.1:${address.port}/login`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  resetLoginRateLimit();
});

test('login rate limiter blocks requests after the configured threshold', async () => {
  const first = await fetch(baseUrl, { method: 'POST' });
  const second = await fetch(baseUrl, { method: 'POST' });
  const third = await fetch(baseUrl, { method: 'POST' });

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(third.status, 429);
  assert.equal(third.headers.get('ratelimit-limit'), '2');
  assert.ok(Number(third.headers.get('retry-after')) >= 1);
});

test('trust proxy hop configuration rejects unsafe or malformed values', () => {
  assert.equal(getTrustProxyHops('production', undefined), 1);
  assert.equal(getTrustProxyHops('development', undefined), 0);
  assert.equal(getTrustProxyHops('production', '0'), 0);
  assert.throws(() => getTrustProxyHops('production', '-1'), /TRUST_PROXY_HOPS/);
  assert.throws(() => getTrustProxyHops('production', '1.5'), /TRUST_PROXY_HOPS/);
});
