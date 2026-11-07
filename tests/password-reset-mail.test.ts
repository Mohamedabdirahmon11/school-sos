import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatPasswordResetMailFailure, isPasswordResetMailConfigured, sendPasswordResetEmail } from '../src/server/mail-service.ts';

test('Resend receives plain text and HTML templates in Somali and Amharic', async () => {
  const previousKey = process.env.MAIL_PROVIDER_API_KEY;
  const previousFrom = process.env.MAIL_FROM;
  const previousFetch = globalThis.fetch;
  const requests: Array<{ url: string; body: any; headers: HeadersInit | undefined }> = [];
  process.env.MAIL_PROVIDER_API_KEY = 'test-resend-key';
  process.env.MAIL_FROM = 'SchoolOS <no-reply@example.test>';
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), body: JSON.parse(String(init?.body || '{}')), headers: init?.headers });
    return new Response(JSON.stringify({ id: 'test-email-id' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  try {
    assert.equal(isPasswordResetMailConfigured(), true);
    await sendPasswordResetEmail('admin@school.test', '123456', 'so');
    await sendPasswordResetEmail('admin@school.test', '654321', 'am');
    assert.equal(requests.length, 2);
    assert.equal(requests[0].url, 'https://api.resend.com/emails');
    assert.equal(requests[0].body.to[0], 'admin@school.test');
    assert.match(requests[0].body.subject, /SchoolOS/);
    assert.match(requests[0].body.text, /123456/);
    assert.match(requests[0].body.text, /10 daqiiqo/);
    assert.match(requests[0].body.text, /Haddii aadan codsan/);
    assert.match(requests[0].body.html, /123456/);
    assert.match(requests[1].body.subject, /SchoolOS/);
    assert.match(requests[1].body.text, /654321/);
    assert.match(requests[1].body.text, /10 ደቂቃ/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.MAIL_PROVIDER_API_KEY; else process.env.MAIL_PROVIDER_API_KEY = previousKey;
    if (previousFrom === undefined) delete process.env.MAIL_FROM; else process.env.MAIL_FROM = previousFrom;
  }
});

test('Resend service fails safely when mail configuration is absent', async () => {
  const previousKey = process.env.MAIL_PROVIDER_API_KEY;
  const previousFrom = process.env.MAIL_FROM;
  delete process.env.MAIL_PROVIDER_API_KEY;
  delete process.env.MAIL_FROM;
  try {
    assert.equal(isPasswordResetMailConfigured(), false);
    await assert.rejects(() => sendPasswordResetEmail('admin@school.test', '123456', 'en'), /not configured/);
  } finally {
    if (previousKey === undefined) delete process.env.MAIL_PROVIDER_API_KEY; else process.env.MAIL_PROVIDER_API_KEY = previousKey;
    if (previousFrom === undefined) delete process.env.MAIL_FROM; else process.env.MAIL_FROM = previousFrom;
  }
});


test('Resend failures expose safe provider diagnostics with email and code redacted', async () => {
  const previousKey = process.env.MAIL_PROVIDER_API_KEY;
  const previousFrom = process.env.MAIL_FROM;
  const previousFetch = globalThis.fetch;
  process.env.MAIL_PROVIDER_API_KEY = 'test-resend-key';
  process.env.MAIL_FROM = 'SchoolOS <no-reply@example.test>';
  globalThis.fetch = (async () => new Response(JSON.stringify({
    message: 'Invalid recipient admin@school.test; attempted code 123456'
  }), { status: 422, statusText: 'Unprocessable Entity', headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
  try {
    let failure: unknown;
    try {
      await sendPasswordResetEmail('admin@school.test', '123456', 'en');
    } catch (error) {
      failure = error;
    }
    const diagnostic = formatPasswordResetMailFailure(failure);
    assert.match(diagnostic, /provider=resend status=422/);
    assert.match(diagnostic, /Invalid recipient/);
    assert.doesNotMatch(diagnostic, /admin@school\.test/);
    assert.doesNotMatch(diagnostic, /123456/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.MAIL_PROVIDER_API_KEY; else process.env.MAIL_PROVIDER_API_KEY = previousKey;
    if (previousFrom === undefined) delete process.env.MAIL_FROM; else process.env.MAIL_FROM = previousFrom;
  }
});
