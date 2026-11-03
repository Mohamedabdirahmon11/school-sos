import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import { Router } from 'express';
import { apiErrorHandler, forwardAsyncErrors } from '../src/server/async-errors.ts';

const router = Router();
router.get('/async-throws', async () => {
  throw new Error('async failure');
});
router.get('/sync-throws', () => {
  throw new Error('sync failure');
});
router.get('/ok', (_req, res) => {
  res.json({ ok: true });
});
forwardAsyncErrors(router);

const app = express();
app.use('/api', router);
app.use(apiErrorHandler);

let server: ReturnType<typeof app.listen>;
let baseUrl: string;

before(async () => {
  server = app.listen(0);
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test HTTP server did not bind to a TCP port.');
  baseUrl = `http://127.0.0.1:${address.port}/api`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

test('async route rejections become JSON 500 responses instead of hanging', async () => {
  const response = await fetch(`${baseUrl}/async-throws`);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'An unexpected server error occurred. Please try again.' });
});

test('synchronous route throws become JSON 500 responses', async () => {
  const response = await fetch(`${baseUrl}/sync-throws`);
  assert.equal(response.status, 500);
  assert.equal(response.headers.get('content-type')?.includes('application/json'), true);
});

test('successful routes still respond normally after wrapping', async () => {
  const response = await fetch(`${baseUrl}/ok`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});
