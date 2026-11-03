import { UserRole } from '../types/index.ts';

const ROLE_ALIASES: Record<string, UserRole> = {
  super_admin: 'super_admin', superadmin: 'super_admin', super_administrator: 'super_admin',
  school_admin: 'school_admin', schooladmin: 'school_admin', school_administrator: 'school_admin',
  accountant: 'accountant', finance: 'accountant',
  teacher: 'teacher', parent: 'parent', guardian: 'parent', student: 'student', pupil: 'student'
};

/** Normalize all persisted, imported, and requested role labels at one boundary. */
export function normalizeRole(value: unknown): UserRole | null {
  if (typeof value !== 'string') return null;
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return ROLE_ALIASES[key] || ROLE_ALIASES[key.replace(/_/g, ' ')] || null;
}
