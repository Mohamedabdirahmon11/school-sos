import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import type { User, School } from '../src/types/index.ts';
import {
  createPasswordResetService,
  hashPasswordResetEmail,
  hashPasswordResetCode,
  isPasswordResetRole,
  isPasswordResetSessionValid,
  PASSWORD_RESET_NEUTRAL_MESSAGE,
  type PasswordResetRepository,
  type PasswordResetRow,
  type PasswordResetAudit
} from '../src/server/password-reset-service.ts';
import { hashPassword, verifyPassword } from '../src/server/auth-security.ts';

class MemoryResetRepository implements PasswordResetRepository {
  rows: PasswordResetRow[] = [];
  private nextId = 0;
  constructor(private now: () => Date) {}

  async countRequests(emailHash: string, ip: string, since: string) {
    const matches = this.rows.filter(row => row.created_at >= since);
    return {
      emailCount: matches.filter(row => row.request_email_hash === emailHash).length,
      ipCount: matches.filter(row => row.request_ip === ip).length
    };
  }

  async insertRequest(row: Omit<PasswordResetRow, 'id' | 'created_at'>) {
    const record: PasswordResetRow = { ...row, id: `reset-${++this.nextId}`, created_at: this.now().toISOString() };
    this.rows.push(record);
    return record;
  }

  async invalidateUnusedCodes(userId: string, now: string) {
    for (const row of this.rows) {
      if (row.user_id === userId && row.code_hash && !row.used_at) row.used_at = now;
    }
  }

  async findLatestUnusedCode(userId: string, emailHash: string) {
    return this.rows.filter(row => row.user_id === userId && row.request_email_hash === emailHash && row.code_hash && !row.used_at)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] || null;
  }

  async incrementAttempts(id: string, expectedAttempts: number, attempts: number, usedAt?: string) {
    const row = this.rows.find(item => item.id === id && item.attempts === expectedAttempts && !item.used_at);
    if (!row) return false;
    row.attempts = attempts;
    if (usedAt) row.used_at = usedAt;
    return true;
  }

  async markUsed(id: string, now: string) {
    const row = this.rows.find(item => item.id === id);
    if (row && !row.used_at) row.used_at = now;
  }

  async consume(id: string, now: string) {
    const row = this.rows.find(item => item.id === id && !item.used_at && Date.parse(item.expires_at) > Date.parse(now) && item.attempts < 5);
    if (!row) return false;
    row.used_at = now;
    return true;
  }

  async cleanup(olderThan: string) {
    this.rows = this.rows.filter(row => row.expires_at >= olderThan);
  }
}

const SECRET = 'test-session-secret-that-is-long-enough';
const EMAIL = 'admin@school.test';
const IP = '203.0.113.10';
const OLD_PASSWORD = 'OldSchoolPassword123';
const NEW_PASSWORD = 'NewSchoolPassword456';

function fixture(options: { suspended?: boolean; exists?: boolean; production?: boolean; mailConfigured?: boolean; mailFailure?: boolean; rateLimitFailure?: boolean } = {}) {
  let clock = new Date('2026-11-07T12:00:00.000Z');
  const user: User = {
    id: 'usr-school-admin-1',
    schoolId: 'school-1',
    role: 'school_admin',
    fullName: 'School Administrator',
    email: EMAIL,
    passwordHash: hashPassword(OLD_PASSWORD),
    isBlocked: false,
    failedLoginAttempts: 4,
    lockedUntil: '2026-11-07T12:15:00.000Z',
    createdAt: clock.toISOString()
  };
  const repository = new MemoryResetRepository(() => clock);
  const sentCodes: string[] = [];
  const sentLanguages: string[] = [];
  const devCodes: string[] = [];
  const audits: PasswordResetAudit[] = [];
  const logs: string[] = [];
  const rateLocks = new Map<string, { count: number; lockedUntil: number }>();
  let revoked = 0;
  let cleared = 0;
  let updated = 0;
  let nextCode = '123456';
  const service = createPasswordResetService({
    repository,
    findUserByEmail: async email => options.exists === false || email !== EMAIL ? null : user,
    getSchool: async () => ({ id: 'school-1', language: 'so', subscription: { status: options.suspended ? 'suspended' : 'active' } } as unknown as School),
    sendEmail: async (_to, code, language) => { if (options.mailFailure) throw new Error('delivery failed'); sentCodes.push(code); sentLanguages.push(language); },
    mailConfigured: () => options.mailConfigured ?? true,
    updatePassword: async (_account, passwordHash, changedAt) => {
      user.passwordHash = passwordHash;
      user.passwordChangedAt = changedAt;
      user.mustChangePassword = false;
      user.failedLoginAttempts = 0;
      user.lockedUntil = null;
      updated += 1;
    },
    revokeSessions: async () => { revoked += 1; },
    checkRateLimit: (key, _threshold, _durationMinutes) => {
      const entry = rateLocks.get(key);
      if (!entry) return false;
      if (entry.lockedUntil > clock.getTime()) return true;
      if (entry.lockedUntil && entry.lockedUntil <= clock.getTime()) rateLocks.delete(key);
      return false;
    },
    recordRateLimit: async (key, threshold, durationMinutes) => {
      if (options.rateLimitFailure) {
        throw Object.assign(new Error('null value in column attempt_count violates not-null constraint'), { table: 'lockout_counters', code: '23502' });
      }
      const entry = rateLocks.get(key) || { count: 0, lockedUntil: 0 };
      entry.count += 1;
      if (entry.count >= threshold) entry.lockedUntil = clock.getTime() + durationMinutes * 60 * 1000;
      rateLocks.set(key, entry);
    },
    clearLockouts: async () => { cleared += 1; rateLocks.clear(); },
    audit: entry => { audits.push(entry); },
    logError: message => { logs.push(message); },
    logInfo: message => { logs.push(message); },
    logDevelopmentCode: (_email, code) => { devCodes.push(code); },
    isProduction: options.production ?? true,
    secret: SECRET,
    now: () => new Date(clock),
    generateCode: () => nextCode
  });
  return {
    service, repository, user, sentCodes, sentLanguages, devCodes, audits, logs, rateLocks,
    get revoked() { return revoked; },
    get cleared() { return cleared; },
    get updated() { return updated; },
    setCode(value: string) { nextCode = value; },
    advance(ms: number) { clock = new Date(clock.getTime() + ms); },
    get now() { return clock; }
  };
}

test('password reset HMAC stores a digest and verifies the code in constant-time comparison helper', () => {
  const digest = hashPasswordResetCode('123456', SECRET);
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.notEqual(digest, '123456');
  assert.equal(hashPasswordResetCode('123456', SECRET), digest);
  assert.equal(hashPasswordResetEmail(EMAIL, SECRET), hashPasswordResetEmail(EMAIL.toUpperCase(), SECRET));
});

test('only email-password roles are eligible for password reset', () => {
  assert.equal(isPasswordResetRole('super_admin'), true);
  assert.equal(isPasswordResetRole('school_admin'), true);
  assert.equal(isPasswordResetRole('accountant'), true);
  assert.equal(isPasswordResetRole('teacher'), false);
  assert.equal(isPasswordResetRole('parent'), false);
  assert.equal(isPasswordResetRole('student'), false);
});

test('successful reset hashes the new password, clears lockout, and revokes sessions', async () => {
  const f = fixture();
  const response = await f.service.request(EMAIL, IP);
  assert.equal(response.message, PASSWORD_RESET_NEUTRAL_MESSAGE);
  assert.deepEqual(f.sentCodes, ['123456']);
  assert.deepEqual(f.sentLanguages, ['so']);
  assert.ok(f.logs.includes('Password reset email delivery succeeded.'));
  const result = await f.service.reset(EMAIL, '123456', NEW_PASSWORD, IP);
  assert.deepEqual(result, { ok: true });
  assert.equal(verifyPassword(NEW_PASSWORD, f.user.passwordHash), true);
  assert.equal(verifyPassword(OLD_PASSWORD, f.user.passwordHash), false);
  assert.equal(f.user.mustChangePassword, false);
  assert.equal(f.user.failedLoginAttempts, 0);
  assert.equal(f.user.lockedUntil, null);
  assert.equal(f.updated, 1);
  assert.equal(f.revoked, 1);
  assert.equal(f.cleared, 1);
  assert.ok(f.audits.some(item => item.action === 'PASSWORD_RESET_SUCCEEDED'));
});

test('wrong code increments attempts and invalidates the code after five failures', async () => {
  const f = fixture();
  await f.service.request(EMAIL, IP);
  for (let i = 0; i < 4; i++) {
    const result = await f.service.reset(EMAIL, '000000', NEW_PASSWORD, IP);
    assert.deepEqual(result, { ok: false, reason: 'invalid_code' });
  }
  const fifth = await f.service.reset(EMAIL, '000000', NEW_PASSWORD, IP);
  assert.deepEqual(fifth, { ok: false, reason: 'too_many_attempts' });
  assert.equal(f.repository.rows[0].attempts, 5);
  assert.ok(f.repository.rows[0].used_at);
  assert.ok(f.audits.some(item => item.action === 'PASSWORD_RESET_FAILED_TOO_MANY_ATTEMPTS'));
});

test('expired reset code is rejected and marked used', async () => {
  const f = fixture();
  await f.service.request(EMAIL, IP);
  f.advance(10 * 60 * 1000 + 1);
  const result = await f.service.reset(EMAIL, '123456', NEW_PASSWORD, IP);
  assert.deepEqual(result, { ok: false, reason: 'invalid_code' });
  assert.ok(f.repository.rows[0].used_at);
});

test('a reset code can only be used once', async () => {
  const f = fixture();
  await f.service.request(EMAIL, IP);
  assert.deepEqual(await f.service.reset(EMAIL, '123456', NEW_PASSWORD, IP), { ok: true });
  assert.deepEqual(await f.service.reset(EMAIL, '123456', 'AnotherNewPassword789', IP), { ok: false, reason: 'invalid_code' });
});

test('a new request invalidates the earlier unused code', async () => {
  const f = fixture();
  await f.service.request(EMAIL, IP);
  f.setCode('654321');
  f.advance(1000);
  await f.service.request(EMAIL, IP);
  assert.ok(f.repository.rows[0].used_at);
  assert.ok(f.logs.every(message => !message.includes('123456')));
  assert.deepEqual(await f.service.reset(EMAIL, '123456', NEW_PASSWORD, IP), { ok: false, reason: 'invalid_code' });
  assert.deepEqual(await f.service.reset(EMAIL, '654321', NEW_PASSWORD, IP), { ok: true });
});

test('per-email request rate limit returns the same neutral response and stops additional delivery', async () => {
  const f = fixture();
  const responses = [];
  for (let i = 0; i < 6; i++) {
    responses.push(await f.service.request(EMAIL, IP));
    f.advance(1000);
  }
  assert.ok(responses.every(response => response.message === PASSWORD_RESET_NEUTRAL_MESSAGE));
  assert.equal(f.sentCodes.length, 5);
  assert.equal(responses[5].message, PASSWORD_RESET_NEUTRAL_MESSAGE);
  assert.ok(f.audits.some(item => item.action === 'PASSWORD_RESET_FAILED_TOO_MANY_ATTEMPTS'));
});

test('already-reached database request limit does not increment lockout counters again', async () => {
  const f = fixture({ exists: false });
  const emailHash = hashPasswordResetEmail(EMAIL, SECRET);
  for (let i = 0; i < 5; i++) {
    f.repository.rows.push({
      id: `existing-${i}`,
      user_id: null,
      code_hash: null,
      request_email_hash: emailHash,
      expires_at: '2026-11-07T13:00:00.000Z',
      used_at: null,
      attempts: 0,
      created_at: f.now.toISOString(),
      request_ip: IP
    });
  }
  const response = await f.service.request(EMAIL, IP);
  assert.equal(response.message, PASSWORD_RESET_NEUTRAL_MESSAGE);
  assert.equal(f.rateLocks.size, 0);
  assert.equal(f.repository.rows.length, 5);
  assert.equal(f.sentCodes.length, 0);
});

test('password reset creates finite integer lockout counters and increments them', async () => {
  const f = fixture({ exists: false });
  const emailKey = `pwreset-email:${hashPasswordResetEmail(EMAIL, SECRET)}`;
  await f.service.request(EMAIL, IP);
  assert.equal(f.rateLocks.get(emailKey)?.count, 1);
  const ipKey = [...f.rateLocks.keys()].find(key => key.startsWith('pwreset-ip:'));
  assert.ok(ipKey);
  assert.equal(f.rateLocks.get(ipKey!)?.count, 1);
  await f.service.request(EMAIL, IP);
  assert.equal(f.rateLocks.get(emailKey)?.count, 2);
  assert.equal(f.rateLocks.get(ipKey!)?.count, 2);
  assert.ok(Number.isSafeInteger(f.rateLocks.get(emailKey)?.count));
});

test('password reset lockout counter resets after its 60-minute window expires', async () => {
  const f = fixture({ exists: false });
  const emailKey = `pwreset-email:${hashPasswordResetEmail(EMAIL, SECRET)}`;
  for (let i = 0; i < 5; i++) {
    await f.service.request(EMAIL, IP);
    f.advance(1000);
  }
  assert.equal(f.rateLocks.get(emailKey)?.count, 5);
  f.advance(60 * 60 * 1000 + 1);
  await f.service.request(EMAIL, IP);
  assert.equal(f.rateLocks.get(emailKey)?.count, 1);
});

test('password reset lockout keys do not collide with login lockout keys', async () => {
  const f = fixture({ exists: false });
  f.rateLocks.set(`ip:${IP}`, { count: 4, lockedUntil: 0 });
  await f.service.request(EMAIL, IP);
  assert.equal(f.rateLocks.get(`ip:${IP}`)?.count, 4);
  const resetIpKey = [...f.rateLocks.keys()].find(key => key.startsWith('pwreset-ip:'));
  assert.ok(resetIpKey);
  assert.notEqual(resetIpKey, `ip:${IP}`);
  assert.equal(f.rateLocks.get(resetIpKey!)?.count, 1);
  assert.ok([...f.rateLocks.keys()].some(key => key.startsWith('pwreset-email:')));
});

test('lockout counter write failure logs database diagnostics and safely skips email delivery', async () => {
  const f = fixture({ rateLimitFailure: true });
  const response = await f.service.request(EMAIL, IP);
  assert.equal(response.message, PASSWORD_RESET_NEUTRAL_MESSAGE);
  assert.equal(f.sentCodes.length, 0);
  assert.equal(f.repository.rows.length, 0);
  assert.ok(f.logs.some(message => message.includes('table=lockout_counters') && message.includes('code=23502') && message.includes('attempt_count')));
  assert.ok(f.logs.every(message => !message.includes(EMAIL) && !message.includes('123456')));
});

test('unknown email receives the exact same neutral request response and no code', async () => {
  const existing = fixture();
  const existingResponse = await existing.service.request(EMAIL, IP);
  const f = fixture({ exists: false });
  const response = await f.service.request('unknown@school.test', IP);
  assert.deepEqual(response, existingResponse);
  assert.equal(response.message, PASSWORD_RESET_NEUTRAL_MESSAGE);
  assert.equal(f.sentCodes.length, 0);
  assert.equal(f.repository.rows[0].user_id, null);
  assert.equal(f.repository.rows[0].code_hash, null);
  assert.ok(f.logs.includes('Password reset request has no eligible account; no email was sent.'));
});

test('suspended school account receives no reset code', async () => {
  const f = fixture({ suspended: true });
  const response = await f.service.request(EMAIL, IP);
  assert.equal(response.message, PASSWORD_RESET_NEUTRAL_MESSAGE);
  assert.equal(f.sentCodes.length, 0);
  assert.equal(f.repository.rows[0].user_id, null);
  assert.equal(f.repository.rows[0].code_hash, null);
});

test('session timestamp invalidates old cookies after password reset', () => {
  const changedAt = '2026-11-07T12:00:00.000Z';
  assert.equal(isPasswordResetSessionValid(changedAt, undefined), false);
  assert.equal(isPasswordResetSessionValid(changedAt, Date.parse('2026-11-07T11:00:00.000Z')), false);
  assert.equal(isPasswordResetSessionValid(changedAt, Date.parse(changedAt)), true);
  assert.equal(isPasswordResetSessionValid(undefined, undefined), true);
});

test('password policy is enforced and a current password cannot be reused', async () => {
  const f = fixture();
  await f.service.request(EMAIL, IP);
  assert.deepEqual(await f.service.reset(EMAIL, '123456', 'Short1A', IP), { ok: false, reason: 'password_policy', message: 'Password must contain at least 12 characters.' });
  assert.deepEqual(await f.service.reset(EMAIL, '123456', OLD_PASSWORD, IP), { ok: false, reason: 'same_password' });
  assert.equal(f.updated, 0);
});

test('plain code is never stored in the database row or audit details', async () => {
  const f = fixture();
  await f.service.request(EMAIL, IP);
  const row = f.repository.rows[0];
  assert.notEqual(row.code_hash, '123456');
  assert.match(row.code_hash || '', /^[a-f0-9]{64}$/);
  assert.ok(f.audits.every(item => !item.details.includes('123456')));
  assert.equal(f.devCodes.length, 0);
  assert.ok(f.logs.every(message => !message.includes('123456')));
});

test('per-IP request rate limit also applies across different unknown email addresses', async () => {
  const f = fixture({ exists: false });
  for (let i = 0; i < 20; i++) {
    await f.service.request(`unknown${i}@school.test`, IP);
    f.advance(1000);
  }
  const blocked = await f.service.request('another@school.test', IP);
  assert.equal(blocked.message, PASSWORD_RESET_NEUTRAL_MESSAGE);
  assert.equal(f.repository.rows.length, 20);
  assert.ok(f.audits.some(item => item.action === 'PASSWORD_RESET_FAILED_TOO_MANY_ATTEMPTS'));
});

test('production with no mail provider never creates a usable code', async () => {
  const f = fixture({ mailConfigured: false, production: true });
  const response = await f.service.request(EMAIL, IP);
  assert.equal(response.message, PASSWORD_RESET_NEUTRAL_MESSAGE);
  assert.equal(f.sentCodes.length, 0);
  assert.equal(f.repository.rows[0].code_hash, null);
  assert.equal(f.devCodes.length, 0);
  assert.ok(f.logs.some(message => message.includes('not configured')));
  assert.ok(f.logs.every(message => !message.includes('123456')));
});

test('lockout rows restore and persist a finite attempt_count integer', () => {
  const storageSource = readFileSync(new URL('../src/server/storage.ts', import.meta.url), 'utf8');
  assert.match(storageSource, /const count = Number\(row\.count \?\? row\.attemptCount \?\? 0\)/);
  assert.doesNotMatch(storageSource, /count:\s*row\.attemptCount/);
  assert.match(storageSource, /Number\.isSafeInteger\(previousCount\).*\? previousCount : 0/);
});

test('the environment-configured Super Admin is seeded into the database user store', () => {
  const storageSource = readFileSync(new URL('../src/server/storage.ts', import.meta.url), 'utf8');
  assert.match(storageSource, /process\.env\.SUPER_ADMIN_EMAIL/);
  assert.match(storageSource, /role: 'super_admin'/);
  assert.match(storageSource, /this\.data\.users\.push\(superAdminUser\)/);
  const serviceSource = readFileSync(new URL('../src/server/password-reset-service.ts', import.meta.url), 'utf8');
  assert.match(serviceSource, /db\.queryPage<User>\('users', \{ email \}/);
  assert.match(serviceSource, /return db\.findUserForLogin\(email\)/);
});


test('explicit user language overrides the school default for reset email', async () => {
  const f = fixture();
  await f.service.request(EMAIL, IP, 'am');
  assert.deepEqual(f.sentLanguages, ['am']);
});


test('development fallback prints the code only in non-production mode', async () => {
  const f = fixture({ production: false, mailConfigured: false });
  const response = await f.service.request(EMAIL, IP);
  assert.equal(response.message, PASSWORD_RESET_NEUTRAL_MESSAGE);
  assert.deepEqual(f.devCodes, ['123456']);
  assert.equal(f.sentCodes.length, 0);
  assert.notEqual(f.repository.rows[0].code_hash, '123456');
});

test('failed Resend delivery logs provider diagnostics without email or code and invalidates the code', async () => {
  const f = fixture({ mailFailure: true });
  const response = await f.service.request(EMAIL, IP);
  assert.equal(response.message, PASSWORD_RESET_NEUTRAL_MESSAGE);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.ok(f.repository.rows[0].used_at);
  assert.ok(f.logs.some(message => message.includes('provider=unknown') && message.includes('message=') && message.includes('delivery failed')));
  assert.ok(f.logs.every(message => !message.includes(EMAIL) && !message.includes('123456')));
  assert.deepEqual(await f.service.reset(EMAIL, '123456', NEW_PASSWORD, IP), { ok: false, reason: 'invalid_code' });
});

