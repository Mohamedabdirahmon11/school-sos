import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiClient } from '../src/services/api.ts';

test('dynamic GET requests bypass the browser HTTP cache', async () => {
  const originalFetch = globalThis.fetch;
  const observed: Array<{ url: string; cache: RequestCache | undefined }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    observed.push({ url: String(input), cache: init?.cache });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }) as typeof fetch;

  try {
    await ApiClient.request('/auth/me');
    await ApiClient.request('/school/dashboard');
    await ApiClient.request('/classes');

    assert.deepEqual(
      observed.map(({ url, cache }) => ({ endpoint: url.replace('/api', ''), cache })),
      [
        { endpoint: '/auth/me', cache: 'no-store' },
        { endpoint: '/school/dashboard', cache: 'no-store' },
        { endpoint: '/classes', cache: 'no-cache' }
      ]
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
