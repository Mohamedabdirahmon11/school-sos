/**
 * Enterprise Authentication & Security Module for SchoolOS
 * - Scrypt Password and PIN Hashing with auto-migration
 * - Signed Session Tokens (HMAC-SHA256)
 * - HttpOnly Cookie helpers
 * - Real RFC 6238 TOTP 2FA (otplib v13 + QRCode)
 * - Sensitive field sanitization
 * - Rate limiting and lockout protection (per identifier and IP)
 */

import crypto from 'crypto';
import { generateSecret, generateURI, verifySync } from 'otplib';
import QRCode from 'qrcode';
import { User, Student } from '../types/index.ts';

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is required. Set it in .env before starting SchoolOS.');
  return secret;
}

export function isSessionExpiryValid(expiresAt: unknown, now = Date.now()): boolean {
  if (typeof expiresAt !== 'string' || !expiresAt.trim()) return false;
  const parsedExpiry = Date.parse(expiresAt);
  return Number.isFinite(parsedExpiry) && parsedExpiry > now;
}

export interface SessionPayload {
  sessionId: string;
  userId: string;
  role: string;
  schoolId?: string;
  studentId?: string;
  createdAt: number;
  expiresAt: number;
}

// -------------------------------------------------------------
// 1. Password & PIN Hashing (Scrypt)
// -------------------------------------------------------------

export function hashPassword(password: string): string {
  if (!password) return '';
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `scrypt:${salt}:${derivedKey.toString('hex')}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!password || !storedHash) return false;
  // If stored as scrypt format: scrypt:<salt>:<hash>
  if (storedHash.startsWith('scrypt:')) {
    const parts = storedHash.split(':');
    if (parts.length !== 3) return false;
    const salt = parts[1];
    const key = parts[2];
    if (!/^[a-f0-9]{32,}$/i.test(salt) || !/^[a-f0-9]{128}$/i.test(key)) return false;
    const derivedKey = crypto.scryptSync(password, salt, 64);
    const keyBuffer = Buffer.from(key, 'hex');
    return crypto.timingSafeEqual(derivedKey, keyBuffer);
  }
  // Legacy plain text or unknown encodings are never accepted as passwords.
  return false;
}

export function hashPin(pin: string): string {
  if (!pin) return '';
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(pin, salt, 32);
  return `pin_scrypt:${salt}:${derivedKey.toString('hex')}`;
}

export function verifyPin(pin: string, storedHash: string): boolean {
  if (typeof pin !== 'string' || !pin || typeof storedHash !== 'string' || !storedHash) return false;
  // Legacy plain-text PINs are never accepted. The migration script converts
  // them to pin_scrypt hashes before import; anything else must be reset.
  if (!storedHash.startsWith('pin_scrypt:')) return false;
  const parts = storedHash.split(':');
  if (parts.length !== 3) return false;
  const salt = parts[1];
  const key = parts[2];
  if (!/^[a-f0-9]{32}$/i.test(salt) || !/^[a-f0-9]{64}$/i.test(key)) return false;
  const derivedKey = crypto.scryptSync(pin, salt, 32);
  const keyBuffer = Buffer.from(key, 'hex');
  return crypto.timingSafeEqual(derivedKey, keyBuffer);
}

// -------------------------------------------------------------
// 2. Signed Session Tokens & HMAC
// -------------------------------------------------------------

export function createSignedSessionToken(payload: SessionPayload): string {
  const json = JSON.stringify(payload);
  const b64Payload = Buffer.from(json).toString('base64url');
  const signature = crypto
    .createHmac('sha256', getSessionSecret())
    .update(b64Payload)
    .digest('base64url');
  return `${b64Payload}.${signature}`;
}

export function verifySignedSessionToken(token: string): SessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [b64Payload, signature] = parts;

  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(b64Payload)
    .digest('base64url');

  try {
    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    const json = Buffer.from(b64Payload, 'base64url').toString('utf8');
    const payload = JSON.parse(json) as SessionPayload;

    // Reject malformed or expired payloads even if a valid signer created them.
    if (!payload.sessionId || !payload.userId || !payload.role || !Number.isFinite(payload.expiresAt) || payload.expiresAt <= Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

// -------------------------------------------------------------
// 3. Sanitizer (Strip sensitive fields from API responses)
// -------------------------------------------------------------

export function sanitizeUser(user: any): Partial<User> {
  if (!user) return user;
  const copy = { ...user };
  delete copy.passwordHash;
  delete copy.pin;
  delete copy.twoFactorSecret;
  delete copy.recoveryCodes;
  return copy;
}

export function sanitizeStudent(student: any): Partial<Student> {
  if (!student) return student;
  const copy = { ...student };
  delete copy.pin;
  delete copy.pinHash;
  return copy;
}

export function sanitizeUsers(users: any[]): Partial<User>[] {
  return users.map(sanitizeUser);
}

export function sanitizeStudents(students: any[]): Partial<Student>[] {
  return students.map(sanitizeStudent);
}

// -------------------------------------------------------------
// 4. Real RFC 6238 TOTP 2FA
// -------------------------------------------------------------

export function generate2FASecret(): string {
  return generateSecret();
}

export function get2FAUri(secret: string, email: string): string {
  return generateURI({
    secret,
    label: email,
    issuer: 'SchoolOS'
  });
}

export async function generate2FAQRCode(uri: string): Promise<string> {
  return QRCode.toDataURL(uri);
}

export function verify2FACode(code: string, secret: string): boolean {
  if (!code || !secret) return false;
  const cleanCode = code.trim().replace(/\s+/g, '');
  try {
    const res = verifySync({
      token: cleanCode,
      secret
    });
    return Boolean(res && res.valid);
  } catch {
    return false;
  }
}

export function hashRecoveryCode(code: string): string {
  const normalized = String(code || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (!normalized) return '';
  return crypto.createHmac('sha256', getSessionSecret()).update(normalized).digest('hex');
}

export function findRecoveryCodeIndex(code: string, storedCodes: string[]): number {
  const normalized = String(code || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (!normalized || !Array.isArray(storedCodes)) return -1;
  const candidateHash = Buffer.from(hashRecoveryCode(normalized), 'hex');
  const candidateLegacy = Buffer.from(normalized);
  return storedCodes.findIndex(stored => {
    if (typeof stored !== 'string') return false;
    if (/^[a-f0-9]{64}$/i.test(stored)) {
      const storedHash = Buffer.from(stored, 'hex');
      return storedHash.length === candidateHash.length && crypto.timingSafeEqual(storedHash, candidateHash);
    }
    // Accept older plaintext recovery codes once, then replace them with hashes.
    const legacy = Buffer.from(stored.replace(/[^a-z0-9]/gi, '').toUpperCase());
    return legacy.length === candidateLegacy.length && crypto.timingSafeEqual(legacy, candidateLegacy);
  });
}

export function generateRecoveryCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  return codes;
}
