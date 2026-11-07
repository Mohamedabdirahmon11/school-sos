import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatPasswordResetMailFailure, isPasswordResetMailConfigured, PasswordResetMailError, sendPasswordResetEmail } from '../src/server/mail-service.ts';

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


test('Gmail SMTP is selected only with complete server-side credentials', () => {
  const previous = {
    provider: process.env.MAIL_PROVIDER,
    user: process.env.GMAIL_SMTP_USER,
    password: process.env.GMAIL_APP_PASSWORD,
    from: process.env.MAIL_FROM
  };
  process.env.MAIL_PROVIDER = 'gmail';
  process.env.GMAIL_SMTP_USER = 'schoolos.test@gmail.com';
  process.env.GMAIL_APP_PASSWORD = 'test-app-password';
  process.env.MAIL_FROM = 'SchoolOS <schoolos.test@gmail.com>';
  try {
    assert.equal(isPasswordResetMailConfigured(), true);
  } finally {
    if (previous.provider === undefined) delete process.env.MAIL_PROVIDER; else process.env.MAIL_PROVIDER = previous.provider;
    if (previous.user === undefined) delete process.env.GMAIL_SMTP_USER; else process.env.GMAIL_SMTP_USER = previous.user;
    if (previous.password === undefined) delete process.env.GMAIL_APP_PASSWORD; else process.env.GMAIL_APP_PASSWORD = previous.password;
    if (previous.from === undefined) delete process.env.MAIL_FROM; else process.env.MAIL_FROM = previous.from;
  }
});

test('Gmail SMTP rejects a sender address that differs from the authenticated account', async () => {
  const previous = {
    provider: process.env.MAIL_PROVIDER,
    user: process.env.GMAIL_SMTP_USER,
    password: process.env.GMAIL_APP_PASSWORD,
    from: process.env.MAIL_FROM
  };
  process.env.MAIL_PROVIDER = 'gmail';
  process.env.GMAIL_SMTP_USER = 'schoolos.test@gmail.com';
  process.env.GMAIL_APP_PASSWORD = 'test-app-password';
  process.env.MAIL_FROM = 'SchoolOS <different.test@gmail.com>';
  try {
    await assert.rejects(
      () => sendPasswordResetEmail('admin@school.test', '123456', 'en'),
      (error: unknown) => error instanceof PasswordResetMailError && error.provider === 'gmail' && error.providerMessage === 'MAIL_FROM must use the authenticated Gmail address.'
    );
  } finally {
    if (previous.provider === undefined) delete process.env.MAIL_PROVIDER; else process.env.MAIL_PROVIDER = previous.provider;
    if (previous.user === undefined) delete process.env.GMAIL_SMTP_USER; else process.env.GMAIL_SMTP_USER = previous.user;
    if (previous.password === undefined) delete process.env.GMAIL_APP_PASSWORD; else process.env.GMAIL_APP_PASSWORD = previous.password;
    if (previous.from === undefined) delete process.env.MAIL_FROM; else process.env.MAIL_FROM = previous.from;
  }
});
