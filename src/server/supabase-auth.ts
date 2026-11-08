import { createHash, createHmac } from 'node:crypto';
import { createClient, type Session } from '@supabase/supabase-js';
import type { User } from '../types/index.ts';
import { db } from './storage.ts';
import { verifyPassword, verifyPin } from './auth-security.ts';
import { supabase, supabaseUrl, supabaseKey, supabaseAnonKey } from './supabase.ts';

function createAuthClient() {
  const apiKey = supabaseAnonKey || supabaseKey;
  if (!supabaseUrl || !apiKey) throw new Error('Supabase Auth is not configured on the server.');
  return createClient(supabaseUrl, apiKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

function createAdminAuthClient() {
  if (!supabaseUrl || !supabaseKey) throw new Error('Supabase Auth administration is not configured on the server.');
  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

function authEmailForUser(user: User): string {
  const existingEmail = String(user.email || '').trim().toLowerCase();
  if (existingEmail) return existingEmail;
  const stableAlias = createHash('sha256').update(user.id).digest('hex').slice(0, 32);
  return `schoolos-${stableAlias}@accounts.schoolos.invalid`;
}

function authPasswordForPin(user: User): string {
  const secret = process.env.SESSION_SECRET || '';
  if (secret.length < 32) throw new Error('SESSION_SECRET must be configured to protect PIN-based Auth credentials.');
  const digest = createHmac('sha256', secret).update(`schoolos-pin-auth:${user.id}`).digest('hex');
  // The PIN is verified against its current scrypt hash on every login. Auth
  // receives a server-only high-entropy identity secret, never the short PIN.
  return `SchoolOS-${digest}-9A`;
}

/**
 * Verify credentials with Supabase Auth. For legacy users, verify the existing
 * scrypt hash when needed, provision an Auth identity with a protected credential,
 * then persist only the Auth UUID mapping. No passwords are copied or generated.
 */
export async function signInSchoolOSUser(
  user: User,
  credential: string,
  credentialType: 'password' | 'pin'
): Promise<{ session: Session; authUserId: string } | null> {
  if (!credential || user.isBlocked) return null;
  const authClient = createAuthClient();
  const adminClient = createAdminAuthClient();
  let authUserId = user.authUserId;
  let email: string;
  // Teacher IDs may authenticate with either their school password or PIN.
  // Both are checked against current SchoolOS hashes; Auth holds a server-only
  // identity secret for this PIN-style login, not either raw credential.
  const usePinCredential = credentialType === 'pin' || user.role === 'teacher';

  if (authUserId) {
    const { data, error } = await adminClient.auth.admin.getUserById(authUserId);
    if (error || !data.user?.email || data.user.banned_until && Date.parse(data.user.banned_until) > Date.now()) return null;
    email = data.user.email;
    if (usePinCredential) {
      const validCredential = user.role === 'teacher'
        ? verifyPassword(credential, String(user.passwordHash || '')) || verifyPin(credential, String(user.pin || ''))
        : verifyPin(credential, String(user.pin || ''));
      if (!validCredential) return null;
    }
  } else {
    const validLegacyPassword = credentialType === 'password' && verifyPassword(credential, String(user.passwordHash || ''));
    const validLegacyPin = (credentialType === 'pin' || user.role === 'teacher')
      && verifyPin(credential, String(user.pin || ''));
    if (!validLegacyPassword && !validLegacyPin) return null;

    email = authEmailForUser(user);
    const authPassword = usePinCredential ? authPasswordForPin(user) : credential;
    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password: authPassword,
      email_confirm: true
    });
    if (error || !data.user) {
      // A manually created Auth account is linked only after the submitted
      // legacy credential also successfully authenticates that exact email.
      const existingAuth = await authClient.auth.signInWithPassword({ email, password: authPassword });
      if (existingAuth.error || !existingAuth.data.user || !existingAuth.data.session) {
        throw new Error('This account needs administrator-assisted Supabase Auth linking before it can sign in.');
      }
      authUserId = existingAuth.data.user.id;
      const linked = db.updateUser(user.id, { authUserId });
      if (!linked) throw new Error('The SchoolOS account could not be linked to Supabase Auth.');
      await db.flush();
      return { session: existingAuth.data.session, authUserId };
    }

    authUserId = data.user.id;
    const updated = db.updateUser(user.id, { authUserId });
    if (!updated) {
      await adminClient.auth.admin.deleteUser(authUserId);
      throw new Error('The SchoolOS account could not be linked to Supabase Auth.');
    }
    try {
      await db.flush();
    } catch (error) {
      await adminClient.auth.admin.deleteUser(authUserId);
      throw error;
    }
  }

  const authPasswords = usePinCredential ? [authPasswordForPin(user)] : [credential];
  for (const authPassword of authPasswords) {
    const { data, error } = await authClient.auth.signInWithPassword({ email, password: authPassword });
    if (!error && data.user && data.session && data.user.id === authUserId) {
      return { session: data.session, authUserId };
    }
  }
  return null;
}

/** Validate a Supabase access token without mutating the shared service client session. */
export async function getSupabaseAuthUser(accessToken: string) {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser(accessToken);
  return error ? null : data.user;
}

export async function refreshSupabaseAuthSession(refreshToken: string): Promise<Session | null> {
  if (!refreshToken) return null;
  const client = createAuthClient();
  const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
  return error ? null : data.session;
}

export async function revokeSupabaseAuthSession(accessToken: string, refreshToken: string): Promise<void> {
  if (!accessToken || !refreshToken) return;
  const client = createAuthClient();
  await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  await client.auth.signOut({ scope: 'local' });
}

export async function updateSupabaseAuthPassword(authUserId: string, password: string): Promise<void> {
  if (!authUserId) throw new Error('This account is not linked to Supabase Auth.');
  const client = createAdminAuthClient();
  const { error } = await client.auth.admin.updateUserById(authUserId, { password });
  if (error) throw new Error('Supabase Auth could not update the account password.');
}
