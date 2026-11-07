import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { User, School } from '../types/index.ts';
import { db } from './storage.ts';
import { supabase } from './supabase.ts';
import { hashPassword, passwordPolicyError, verifyPassword } from './auth-security.ts';
import { formatPasswordResetMailFailure, isPasswordResetMailConfigured, sendPasswordResetEmail } from './mail-service.ts';

export const PASSWORD_RESET_NEUTRAL_MESSAGE = 'If an account exists for this email, a 6-digit code has been sent.';
export const PASSWORD_RESET_CODE_TTL_MS = 10 * 60 * 1000;
export const PASSWORD_RESET_EMAIL_LIMIT = 5;
export const PASSWORD_RESET_IP_LIMIT = 20;
export const PASSWORD_RESET_RATE_WINDOW_MINUTES = 60;

export interface PasswordResetRow {
  id: string;
  user_id: string | null;
  code_hash: string | null;
  request_email_hash: string;
  expires_at: string;
  used_at: string | null;
  attempts: number;
  created_at: string;
  request_ip: string | null;
}

export interface PasswordResetRepository {
  countRequests(emailHash: string, ip: string, since: string): Promise<{ emailCount: number; ipCount: number }>;
  insertRequest(row: Omit<PasswordResetRow, 'id' | 'created_at'>): Promise<PasswordResetRow>;
  invalidateUnusedCodes(userId: string, now: string): Promise<void>;
  findLatestUnusedCode(userId: string, emailHash: string): Promise<PasswordResetRow | null>;
  incrementAttempts(id: string, expectedAttempts: number, attempts: number, usedAt?: string): Promise<boolean>;
  markUsed(id: string, now: string): Promise<void>;
  consume(id: string, now: string): Promise<boolean>;
  cleanup(olderThan: string): Promise<void>;
}

class SupabasePasswordResetRepository implements PasswordResetRepository {
  private client() {
    if (!supabase) throw new Error('Password reset storage is unavailable.');
    return supabase;
  }

  async countRequests(emailHash: string, ip: string, since: string) {
    const client = this.client();
    const [byEmail, byIp] = await Promise.all([
      client.from('password_reset_codes').select('id', { count: 'exact', head: true })
        .eq('request_email_hash', emailHash).gte('created_at', since),
      client.from('password_reset_codes').select('id', { count: 'exact', head: true })
        .eq('request_ip', ip).gte('created_at', since)
    ]);
    if (byEmail.error || byIp.error) throw new Error('Password reset rate limit lookup failed.');
    return { emailCount: Number(byEmail.count || 0), ipCount: Number(byIp.count || 0) };
  }

  async insertRequest(row: Omit<PasswordResetRow, 'id' | 'created_at'>) {
    const { data, error } = await this.client().from('password_reset_codes').insert(row)
      .select('id,user_id,code_hash,request_email_hash,expires_at,used_at,attempts,created_at,request_ip').single();
    if (error || !data) throw new Error('Password reset request could not be stored.');
    return data as PasswordResetRow;
  }

  async invalidateUnusedCodes(userId: string, now: string) {
    const { error } = await this.client().from('password_reset_codes').update({ used_at: now })
      .eq('user_id', userId).is('used_at', null).not('code_hash', 'is', null);
    if (error) throw new Error('Previous password reset codes could not be invalidated.');
  }

  async findLatestUnusedCode(userId: string, emailHash: string) {
    const { data, error } = await this.client().from('password_reset_codes')
      .select('id,user_id,code_hash,request_email_hash,expires_at,used_at,attempts,created_at,request_ip')
      .eq('user_id', userId).eq('request_email_hash', emailHash).is('used_at', null)
      .not('code_hash', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error('Password reset code lookup failed.');
    return data as PasswordResetRow | null;
  }

  async incrementAttempts(id: string, expectedAttempts: number, attempts: number, usedAt?: string) {
    const updates: Record<string, unknown> = { attempts };
    if (usedAt) updates.used_at = usedAt;
    const { data, error } = await this.client().from('password_reset_codes').update(updates)
      .eq('id', id).eq('attempts', expectedAttempts).is('used_at', null).select('id').maybeSingle();
    if (error) throw new Error('Password reset attempt could not be recorded.');
    return Boolean(data);
  }

  async markUsed(id: string, now: string) {
    const { error } = await this.client().from('password_reset_codes').update({ used_at: now })
      .eq('id', id).is('used_at', null);
    if (error) throw new Error('Password reset code could not be invalidated.');
  }

  async consume(id: string, now: string) {
    const { data, error } = await this.client().from('password_reset_codes').update({ used_at: now })
      .eq('id', id).is('used_at', null).gt('expires_at', now).lt('attempts', 5)
      .select('id').maybeSingle();
    if (error) throw new Error('Password reset code could not be consumed.');
    return Boolean(data);
  }

  async cleanup(olderThan: string) {
    const { error } = await this.client().from('password_reset_codes').delete().lt('expires_at', olderThan);
    if (error) throw new Error('Expired password reset cleanup failed.');
  }
}

export type PasswordResetAudit = {
  action: string;
  user?: User | null;
  ip: string;
  details: string;
  severity: 'info' | 'warning' | 'critical';
};

export interface PasswordResetDependencies {
  repository: PasswordResetRepository;
  findUserByEmail(email: string): Promise<User | null>;
  getSchool(schoolId: string): Promise<School | null>;
  sendEmail(to: string, code: string, language: 'en' | 'so' | 'am', schoolName?: string): Promise<void>;
  mailConfigured(): boolean;
  updatePassword(user: User, passwordHash: string, changedAt: string): Promise<void>;
  revokeSessions(user: User): Promise<void>;
  checkRateLimit(key: string, threshold: number, durationMinutes: number, windowMinutes: number): boolean;
  recordRateLimit(key: string, threshold: number, durationMinutes: number, windowMinutes: number): Promise<void>;
  clearLockouts(email: string, ip: string): Promise<void>;
  audit(entry: PasswordResetAudit): Promise<void> | void;
  logError(message: string): void;
  logDevelopmentCode(email: string, code: string): void;
  isProduction: boolean;
  secret: string;
  now?: () => Date;
  generateCode?: () => string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function formatRateLimitWriteFailure(error: unknown): string {
  const failure = error as { table?: unknown; code?: unknown; message?: unknown } | null;
  const table = typeof failure?.table === 'string' ? failure.table : 'lockout_counters';
  const code = typeof failure?.code === 'string' ? failure.code : 'unknown';
  const rawMessage = typeof failure?.message === 'string' ? failure.message : error instanceof Error ? error.message : 'Unknown persistence error';
  const message = rawMessage.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]').replace(/\b\d{6}\b/g, '[redacted-code]').slice(0, 240);
  return `Password reset rate-limit write failed table=${table} code=${code} message="${message}"`;
}

function hmac(value: string, secret: string, purpose: string): string {
  if (!secret) throw new Error('SESSION_SECRET is required for password reset.');
  return createHmac('sha256', secret).update(`${purpose}:${value}`).digest('hex');
}

export function hashPasswordResetCode(code: string, secret = process.env.SESSION_SECRET || ''): string {
  return hmac(code, secret, 'schoolos-password-reset-code');
}

export function hashPasswordResetEmail(email: string, secret = process.env.SESSION_SECRET || ''): string {
  return hmac(normalizeEmail(email), secret, 'schoolos-password-reset-email');
}

export function verifyPasswordResetCode(code: string, storedHash: string, secret = process.env.SESSION_SECRET || ''): boolean {
  if (!/^\d{6}$/.test(code) || !/^[a-f0-9]{64}$/i.test(storedHash)) return false;
  const expected = Buffer.from(hashPasswordResetCode(code, secret), 'hex');
  const actual = Buffer.from(storedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function isPasswordResetRole(role: string): boolean {
  return role === 'super_admin' || role === 'school_admin' || role === 'accountant';
}

export function isPasswordResetSessionValid(passwordChangedAt?: string, tokenPasswordChangedAt?: number): boolean {
  if (!passwordChangedAt) return true;
  const changedAt = Date.parse(passwordChangedAt);
  return Number.isFinite(changedAt) && tokenPasswordChangedAt === changedAt;
}

export function createPasswordResetService(deps: PasswordResetDependencies) {
  const now = () => (deps.now ? deps.now() : new Date());
  const audit = async (action: string, user: User | null, ip: string, details: string, severity: PasswordResetAudit['severity']) => {
    await deps.audit({ action, user, ip, details, severity });
  };

  const eligibleAccount = async (email: string, preferredLanguage?: 'en' | 'so' | 'am'): Promise<{ user: User; language: 'en' | 'so' | 'am'; schoolName?: string } | null> => {
    const user = await deps.findUserByEmail(email);
    if (!user || !isPasswordResetRole(user.role) || user.isBlocked || !user.email) return null;
    if (user.role !== 'super_admin') {
      if (!user.schoolId) return null;
      const school = await deps.getSchool(user.schoolId);
      if (!school || school.subscription?.status === 'suspended') return null;
      const language = (school as any).language;
      return { user, language: preferredLanguage || (language === 'so' || language === 'am' ? language : 'en'), schoolName: school.name };
    }
    return { user, language: preferredLanguage || 'en' };
  };

  async function request(emailInput: string, ipInput: string, preferredLanguage?: 'en' | 'so' | 'am'): Promise<{ message: string; expiresInSeconds: number; retryAfterSeconds: number }> {
    const email = normalizeEmail(emailInput);
    const ip = ipInput || 'unknown';
    const timestamp = now();
    const createdAt = timestamp.toISOString();
    const emailHash = hashPasswordResetEmail(email, deps.secret);
    const emailLockKey = `pwreset-email:${emailHash}`;
    const ipLockKey = `pwreset-ip:${hmac(ip, deps.secret, 'schoolos-password-reset-ip')}`;
    const recordRateLimits = async (): Promise<boolean> => {
      try {
        await deps.recordRateLimit(emailLockKey, PASSWORD_RESET_EMAIL_LIMIT, PASSWORD_RESET_RATE_WINDOW_MINUTES, PASSWORD_RESET_RATE_WINDOW_MINUTES);
        await deps.recordRateLimit(ipLockKey, PASSWORD_RESET_IP_LIMIT, PASSWORD_RESET_RATE_WINDOW_MINUTES, PASSWORD_RESET_RATE_WINDOW_MINUTES);
        return true;
      } catch (error) {
        deps.logError(formatRateLimitWriteFailure(error));
        return false;
      }
    };
    if (deps.checkRateLimit(emailLockKey, PASSWORD_RESET_EMAIL_LIMIT, PASSWORD_RESET_RATE_WINDOW_MINUTES, PASSWORD_RESET_RATE_WINDOW_MINUTES)
      || deps.checkRateLimit(ipLockKey, PASSWORD_RESET_IP_LIMIT, PASSWORD_RESET_RATE_WINDOW_MINUTES, PASSWORD_RESET_RATE_WINDOW_MINUTES)) {
      await audit('PASSWORD_RESET_FAILED_TOO_MANY_ATTEMPTS', null, ip, 'Password reset request rate limit exceeded.', 'warning');
      return { message: PASSWORD_RESET_NEUTRAL_MESSAGE, expiresInSeconds: 600, retryAfterSeconds: 60 };
    }
    try {
      await deps.repository.cleanup(new Date(timestamp.getTime() - 60 * 60 * 1000).toISOString());
    } catch {
      // Cleanup is best-effort; the request still follows the normal safe response.
    }

    const counts = await deps.repository.countRequests(emailHash, ip, new Date(timestamp.getTime() - 60 * 60 * 1000).toISOString());
    if (counts.emailCount >= PASSWORD_RESET_EMAIL_LIMIT || counts.ipCount >= PASSWORD_RESET_IP_LIMIT) {
      await recordRateLimits();
      await audit('PASSWORD_RESET_FAILED_TOO_MANY_ATTEMPTS', null, ip, 'Password reset request rate limit exceeded.', 'warning');
      return { message: PASSWORD_RESET_NEUTRAL_MESSAGE, expiresInSeconds: 600, retryAfterSeconds: 60 };
    }
    if (!(await recordRateLimits())) return { message: PASSWORD_RESET_NEUTRAL_MESSAGE, expiresInSeconds: 600, retryAfterSeconds: 60 };

    const account = await eligibleAccount(email, preferredLanguage);
    const configured = deps.mailConfigured();
    const canIssueCode = Boolean(account && (configured || !deps.isProduction));
    let code: string | null = null;
    if (canIssueCode) code = (deps.generateCode || (() => String(randomInt(0, 1_000_000)).padStart(6, '0')))();

    if (account) await deps.repository.invalidateUnusedCodes(account.user.id, createdAt);
    const row = await deps.repository.insertRequest({
      user_id: account?.user.id || null,
      code_hash: code ? hashPasswordResetCode(code, deps.secret) : null,
      request_email_hash: emailHash,
      expires_at: new Date(timestamp.getTime() + PASSWORD_RESET_CODE_TTL_MS).toISOString(),
      used_at: null,
      attempts: 0,
      request_ip: ip
    });

    await audit('PASSWORD_RESET_REQUESTED', account?.user || null, ip, 'Password reset request received.', 'info');

    if (account && code) {
      if (configured) {
        try {
          const delivery = deps.sendEmail(account.user.email!, code, account.language, account.schoolName);
          void delivery.catch(async error => {
            try { await deps.repository.markUsed(row.id, now().toISOString()); } catch { /* fail closed */ }
            deps.logError(formatPasswordResetMailFailure(error));
          });
        } catch (error) {
          await deps.repository.markUsed(row.id, now().toISOString());
          deps.logError(formatPasswordResetMailFailure(error));
        }
      } else if (!deps.isProduction) {
        deps.logDevelopmentCode(email, code);
      }
    } else if (deps.isProduction && !configured) {
      deps.logError('Password reset email is not configured. No reset code was issued.');
    }

    return { message: PASSWORD_RESET_NEUTRAL_MESSAGE, expiresInSeconds: 600, retryAfterSeconds: 60 };
  }

  async function reset(emailInput: string, code: string, newPassword: string, ipInput: string): Promise<
    { ok: true } | { ok: false; reason: 'invalid_code' | 'too_many_attempts' | 'password_policy' | 'same_password' | 'unavailable'; message?: string }
  > {
    const email = normalizeEmail(emailInput);
    const ip = ipInput || 'unknown';
    const passwordError = passwordPolicyError(newPassword);
    if (passwordError) return { ok: false, reason: 'password_policy', message: passwordError };

    const account = await eligibleAccount(email);
    if (!account) return { ok: false, reason: 'invalid_code' };
    const { user } = account;
    const emailHash = hashPasswordResetEmail(email, deps.secret);
    const record = await deps.repository.findLatestUnusedCode(user.id, emailHash);
    if (!record || !record.code_hash || record.used_at) return { ok: false, reason: 'invalid_code' };

    const timestamp = now();
    if (Date.parse(record.expires_at) <= timestamp.getTime()) {
      await deps.repository.markUsed(record.id, timestamp.toISOString());
      return { ok: false, reason: 'invalid_code' };
    }
    if (record.attempts >= 5) {
      await deps.repository.markUsed(record.id, timestamp.toISOString());
      await audit('PASSWORD_RESET_FAILED_TOO_MANY_ATTEMPTS', user, ip, 'Password reset code exceeded the allowed verification attempts.', 'warning');
      return { ok: false, reason: 'too_many_attempts' };
    }

    if (!verifyPasswordResetCode(code, record.code_hash, deps.secret)) {
      const nextAttempts = record.attempts + 1;
      const locked = nextAttempts >= 5;
      const updated = await deps.repository.incrementAttempts(record.id, record.attempts, nextAttempts, locked ? timestamp.toISOString() : undefined);
      if (locked && updated) {
        await audit('PASSWORD_RESET_FAILED_TOO_MANY_ATTEMPTS', user, ip, 'Password reset code was invalidated after five incorrect attempts.', 'warning');
        return { ok: false, reason: 'too_many_attempts' };
      }
      return { ok: false, reason: 'invalid_code' };
    }

    if (verifyPassword(newPassword, user.passwordHash)) return { ok: false, reason: 'same_password' };

    const consumed = await deps.repository.consume(record.id, timestamp.toISOString());
    if (!consumed) return { ok: false, reason: 'invalid_code' };

    try {
      await deps.updatePassword(user, hashPassword(newPassword), timestamp.toISOString());
      await deps.revokeSessions(user);
      await deps.clearLockouts(email, ip);
      await audit('PASSWORD_RESET_SUCCEEDED', user, ip, 'Password was reset successfully; existing sessions were revoked.', 'info');
      return { ok: true };
    } catch {
      deps.logError('Password reset could not be completed after code consumption.');
      return { ok: false, reason: 'unavailable' };
    }
  }

  return { request, reset };
}

const passwordResetRepository = new SupabasePasswordResetRepository();

export const passwordResetService = createPasswordResetService({
  repository: passwordResetRepository,
  findUserByEmail: async email => {
    const matches = await db.queryPage<User>('users', { email }, 1, 2, undefined, '*');
    if (matches.total !== 1) return null;
    return db.findUserForLogin(email);
  },
  getSchool: schoolId => db.getSchoolById(schoolId),
  sendEmail: sendPasswordResetEmail,
  mailConfigured: isPasswordResetMailConfigured,
  updatePassword: async (user, passwordHash, changedAt) => {
    const updated = db.updateUser(user.id, {
      passwordHash,
      mustChangePassword: false,
      failedLoginAttempts: 0,
      lockedUntil: null,
      passwordChangedAt: changedAt
    });
    if (!updated) throw new Error('User account could not be updated.');
    await db.flush();
  },
  revokeSessions: async user => {
    const sessions = await db.getUserSessions(user.schoolId);
    await Promise.all(sessions.filter(session => session.userId === user.id).map(session => db.revokeSession(session.id)));
    await db.flush();
  },
  checkRateLimit: (key, threshold, durationMinutes, windowMinutes) => db.checkLoginLockout(key, threshold, durationMinutes, windowMinutes).locked,
  recordRateLimit: async (key, threshold, durationMinutes, windowMinutes) => {
    db.recordLoginFailure(key, threshold, durationMinutes, windowMinutes);
    await db.flush();
  },
  clearLockouts: async (email, ip) => {
    const emailHash = hashPasswordResetEmail(email, process.env.SESSION_SECRET || '');
    const ipHash = hmac(ip, process.env.SESSION_SECRET || '', 'schoolos-password-reset-ip');
    db.clearLoginFailures(`staff:${email.toLowerCase()}`);
    db.clearLoginFailures(`ip:${ip}`);
    db.clearLoginFailures(`pwreset-email:${emailHash}`);
    db.clearLoginFailures(`pwreset-ip:${ipHash}`);
    await db.flush();
  },
  audit: async entry => {
    try {
      db.logAudit({
        action: entry.action,
        category: 'auth',
        schoolId: entry.user?.schoolId,
        userId: entry.user?.id || 'unknown',
        userName: entry.user?.fullName || 'Unknown account',
        userRole: entry.user?.role || 'school_admin',
        details: entry.details,
        ipAddress: entry.ip,
        severity: entry.severity
      });
      await db.flush();
    } catch {
      console.error('[password-reset] Audit event could not be persisted.');
    }
  },
  logError: message => console.error(`[password-reset] ${message}`),
  logDevelopmentCode: (_email, code) => console.info(`[password-reset-development] code=${code}`),
  isProduction: process.env.NODE_ENV === 'production',
  secret: process.env.SESSION_SECRET || ''
});
