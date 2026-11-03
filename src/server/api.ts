/**
 * Express API Router for SchoolOS Multi-School SaaS
 * Strictly isolates tenants, enforces subscription states, rate limits failed logins,
 * handles Cash-Only student fees, once-per-day attendance, small/big exam marks,
 * and comprehensive audit trails.
 */

import { Router, Request, Response } from 'express';
import express from 'express';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { db } from './storage.ts';
import { createPdf, PdfPageInput } from './pdf.ts';
import { buildReportCardPdfPage, sanitizeReportCardDesign } from './report-card.ts';
import { User, UserRole, School, Student, TimetableSlot, StaffPayrollRecord } from '../types/index.ts';
import {
  createSignedSessionToken,
  verifySignedSessionToken,
  isSessionExpiryValid,
  sanitizeUser,
  sanitizeUsers,
  sanitizeStudent,
  sanitizeStudents,
  verifyPassword,
  verifyPin,
  hashPassword,
  generate2FASecret,
  get2FAUri,
  generate2FAQRCode,
  verify2FACode,
  hashRecoveryCode,
  findRecoveryCodeIndex,
  generateRecoveryCodes
} from './auth-security.ts';
import { hashPin } from './auth-security.ts';
import { normalizeRole } from '../lib/roles.ts';
import { formatMoney } from '../lib/money.ts';
import { extractImportFile, IMPORT_COLUMNS, isExampleImportRow, parseSchoolImport, SchoolImportRow, splitStudentName, validImportPhone } from './school-import.ts';
import { sanitizeBranchInput, sanitizeExamConfigSettings, sanitizeSchoolSettings, sanitizeTimetableSettings } from './school-settings.ts';
import { forwardAsyncErrors } from './async-errors.ts';

export const apiRouter = Router();

const LIST_QUERY_COLUMNS: Record<string, string> = {
  school_branches: 'id,school_id,name,address,phone,email,is_main,created_at',
  classes: 'id,school_id,branch_id,name,grade_level,section,room_number,capacity,class_teacher_id,monthly_fee,is_archived,created_at',
  subjects: 'id,school_id,name,code,credit_units,department,assigned_teacher_ids,created_at',
  class_subjects: 'id,school_id,class_id,subject_id,teacher_id,periods_per_week,small_exam_enabled,big_exam_enabled,is_active,created_at',
  students: 'id,school_id,branch_id,student_id,first_name,middle_name,last_name,gender,admission_date,date_of_birth,student_phone,father_phone,mother_phone,class_id,section,status',
  teachers: 'id,school_id,user_id,staff_id,full_name,email,phone,gender,qualification,department,assigned_classes,assigned_subjects,status,joined_date,monthly_salary',
  fee_payments: 'id,school_id,student_id,receipt_number,reference_number,academic_year,month,fee_type,fee_structure_id,amount_due,amount_paid,remaining_amount,payment_method,status,date,recorded_by,notes,voided_at,voided_by,void_reason',
  payroll_records: 'id,school_id,user_id,staff_id,staff_name,payroll_month,base_salary,allowances,allowance_total,deductions,deduction_total,net_salary,status,created_by,approved_by,paid_by,created_at,approved_at,paid_at',
  attendance_records: 'id,school_id,class_id,student_id,date,status,note,recorded_by,recorded_at',
  school_notices: 'id,school_id,title,content,audience,class_id,is_active,is_pinned,publish_date,author_name,author_role,created_at',
  direct_messages: 'id,school_id,sender_id,sender_name,sender_role,recipient_id,recipient_name,recipient_role,content,timestamp,is_read',
  communication_queue: 'id,school_id,recipient_phone,recipient_name,student_id,message_type,channel,content,status,error_message,created_at,sent_at',
  support_tickets: 'id,ticket_number,school_id,school_name,created_by_user_id,created_by_name,created_by_role,subject,description,priority,status,messages,created_at,updated_at',
  audit_logs: 'id,timestamp,action,category,school_id,school_name,user_id,user_name,user_role,details,ip_address,severity',
  users: 'id,school_id,role,full_name,email,phone,staff_id,student_id,parent_phone,must_change_password,is_blocked,failed_login_attempts,locked_until,permissions,assigned_class_ids,assigned_subject_ids,linked_student_ids,branch_id,created_at,last_login_at'
};
const CACHED_LIST_TABLES = new Set(['school_branches', 'classes', 'subjects', 'teachers']);
const LIST_CACHE_TABLE_KEYS: Record<string, string> = {
  school_branches: 'branches',
  classes: 'classes',
  subjects: 'subjects',
  teachers: 'teachers'
};
const LIST_CACHE_TTL_MS = 60_000;
const serverListCache = new Map<string, {
  table: string;
  body: any[];
  page: number;
  pageSize: number;
  total: number;
  etag: string;
  expiresAt: number;
}>();

function invalidateListCache(table?: string) {
  const cacheTable = table ? LIST_CACHE_TABLE_KEYS[table] || table : undefined;
  for (const [key, entry] of serverListCache) {
    if (!cacheTable || entry.table === cacheTable) serverListCache.delete(key);
  }
}

function onboardingFieldErrors(body: Record<string, unknown>): string[] {
  const fields: Array<[string, string]> = [
    ['name', 'name'], ['code', 'code'], ['email', 'email'], ['adminEmail', 'adminEmail'], ['adminPassword', 'adminPassword']
  ];
  const missing = fields.filter(([key]) => typeof body[key] !== 'string' || !(body[key] as string).trim()).map(([, label]) => label);
  if (body.adminEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.adminEmail).trim())) missing.push('adminEmail (invalid email)');
  return missing;
}

function sendPdf(res: Response, filename: string, pages: PdfPageInput[]) {
  const safeName = filename.replace(/[^a-z0-9_-]/gi, '_');
  res.status(200).set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${safeName}.pdf"` }).send(createPdf(pages));
}

// Production requests get an empty request context; domain methods fetch only
// the required Supabase rows. Test routers install their explicit adapter.
apiRouter.use((req, res, next) => {
  const storage = db as any;
  res.once('finish', () => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && res.statusCode < 400) {
      if (/^\/branches(?:\/|$)/.test(req.path)) invalidateListCache('school_branches');
      if (/^\/classes(?:\/|$)/.test(req.path)) invalidateListCache('classes');
      if (/^\/subjects(?:\/|$)/.test(req.path)) invalidateListCache('subjects');
      if (/^\/teachers(?:\/|$)/.test(req.path)) invalidateListCache('teachers');
    }
  });
  if (typeof storage.prepareRequestContext !== 'function') { next(); return; }
  const requestStarted = process.env.NODE_ENV === 'development' ? performance.now() : 0;
  res.once('finish', () => {
    if (process.env.NODE_ENV !== 'development') return;
    const metrics = storage.getRequestQueryMetrics?.() || { count: 0, durationMs: 0 };
    console.info(`[api-perf] ${req.method} ${req.path} ${res.statusCode} ${Math.round(performance.now() - requestStarted)}ms queries=${metrics.count} supabase=${metrics.durationMs}ms`);
  });
  void storage.prepareRequestContext(req.path === '/auth/login', `${req.method} ${req.path}`).then((context: any) => {
    storage.runWithRequestContext(context, next);
  }).catch(() => {
    if (!res.headersSent) res.status(503).json({ error: 'Unable to load SchoolOS data from Supabase. Check the database schema and service role access.' });
  });
});

function forbiddenReasonCode(body: any): string {
  if (typeof body?.code === 'string' && body.code) return body.code;
  const message = String(body?.error || '').toLowerCase();
  if (message.includes('password change is required')) return 'MUST_CHANGE_PASSWORD';
  if (message.includes('complete the required password change')) return 'BOOTSTRAP_PASSWORD_CHANGE_REQUIRED';
  if (message.includes('cross-school')) return 'CROSS_SCHOOL_ACCESS_DENIED';
  if (message.includes('read-only')) return 'SCHOOL_READ_ONLY';
  if (message.includes('suspended')) return 'SCHOOL_SUSPENDED';
  if (message.includes('student portal access')) return 'STUDENT_ACCESS_DISABLED';
  if (message.includes('2fa feature is disabled')) return 'TWO_FACTOR_FEATURE_DISABLED';
  if (message.includes('staff account does not have permission')) return 'STAFF_PERMISSION_REQUIRED';
  if (message.includes('super administrator privilege')) return 'SUPER_ADMIN_REQUIRED';
  if (message.includes('school administrator privilege')) return 'SCHOOL_ADMIN_REQUIRED';
  if (message.includes('assigned classes')) return 'TEACHER_CLASS_SCOPE_DENIED';
  if (message.includes('passwords can be reset')) return 'STAFF_PASSWORD_RESET_FORBIDDEN';
  if (message.includes('student') || message.includes('attendance') || message.includes('results record') || message.includes('fee record')) return 'RECORD_ACCESS_DENIED';
  if (message.includes('import requires') || message.includes('imports are blocked')) return 'IMPORT_ACCESS_DENIED';
  return 'ACCESS_FORBIDDEN';
}

// Ensure every forbidden response has a stable reason code for translated UI handling.
apiRouter.use((req, res, next) => {
  const json = res.json.bind(res);
  res.json = ((body: any) => json(res.statusCode === 403 && body && typeof body === 'object'
    ? { ...body, code: forbiddenReasonCode(body) }
    : body)) as Response['json'];
  next();
});

function sendPaginated(req: Request, res: Response, items: any[]) {
  const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(req.query.pageSize ?? '20'), 10) || 20));
  const total = items.length;
  res.set({ 'X-Page': String(page), 'X-Page-Size': String(pageSize), 'X-Total-Count': String(total), 'X-Total-Pages': String(Math.ceil(total / pageSize)) });
  res.json(items.slice((page - 1) * pageSize, page * pageSize));
}

async function sendDatabasePage(req: Request, res: Response, table: string, filters: Record<string, string | string[] | undefined>, orFilter?: string, sanitize: (items: any[]) => any[] = items => items) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    const cacheScope = table === 'teachers' ? normalizeRole((req as any).user?.role) : undefined;
    const cacheKey = `${table}:${JSON.stringify({ filters, page, pageSize, orFilter, cacheScope })}`;
    if (CACHED_LIST_TABLES.has(table)) {
      const cached = serverListCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        res.set({ 'Cache-Control': 'private, no-cache', ETag: cached.etag });
        const ifNoneMatch = req.get('If-None-Match');
        if (ifNoneMatch?.split(',').some(tag => tag.trim() === '*' || tag.trim() === cached.etag || tag.trim() === `W/${cached.etag}`)) {
          res.status(304).end();
          return;
        }
        res.set({
          'X-Page': String(cached.page),
          'X-Page-Size': String(cached.pageSize),
          'X-Total-Count': String(cached.total),
          'X-Total-Pages': String(Math.ceil(cached.total / cached.pageSize))
        });
        res.json(cached.body);
        return;
      }
      if (cached) serverListCache.delete(cacheKey);
    }
    const result = await db.queryPage(table, filters, page, pageSize, orFilter, LIST_QUERY_COLUMNS[table] || '*');
    const body = sanitize(result.items);
    if (CACHED_LIST_TABLES.has(table)) {
      const etag = `"${createHash('sha256').update(JSON.stringify({ body, total: result.total, page: result.page, pageSize: result.pageSize })).digest('hex')}"`;
      serverListCache.set(cacheKey, {
      table: LIST_CACHE_TABLE_KEYS[table] || table, body, page: result.page, pageSize: result.pageSize, total: result.total,
        etag, expiresAt: Date.now() + LIST_CACHE_TTL_MS
      });
      while (serverListCache.size > 200) serverListCache.delete(serverListCache.keys().next().value!);
      res.set({ 'Cache-Control': 'private, no-cache', ETag: etag });
    }
    res.set({ 'X-Page': String(result.page), 'X-Page-Size': String(result.pageSize), 'X-Total-Count': String(result.total), 'X-Total-Pages': String(Math.ceil(result.total / result.pageSize)) });
    res.json(body);
  } catch {
    res.status(503).json({ error: 'Unable to load this list from the database.' });
  }
}

type ImportValidation = { row: number; data: SchoolImportRow; status: 'valid' | 'error' | 'skipped'; reasons: string[]; classId?: string; branchId?: string };

async function validateSchoolImport(rows: SchoolImportRow[], schoolId: string): Promise<{ rows: ImportValidation[]; totals: { total: number; valid: number; errors: number; skipped: number } }> {
  const [classes, students, branches] = await Promise.all([db.getClasses(schoolId), db.getStudents(schoolId), db.getBranches(schoolId)]);
  const byClass = new Map(classes.map(item => [`${item.name.trim().toLowerCase()}\u0000${item.section.trim().toLowerCase()}`, item]));
  const branchByName = new Map(branches.map(item => [item.name.trim().toLowerCase(), item]));
  const seen = new Set<string>();
  const capacityUse = new Map<string, number>();
  for (const student of students) capacityUse.set(student.classId, (capacityUse.get(student.classId) || 0) + 1);
  const results: ImportValidation[] = rows.map((source, index) => {
    const data = Object.fromEntries(IMPORT_COLUMNS.map(column => [column, String((source as any)?.[column] ?? '').trim()])) as unknown as SchoolImportRow;
    data.fatherPhone = data.fatherPhone || data.parentPhone;
    const reasons: string[] = [];
    if (isExampleImportRow(data)) return { row: index + 2, data, status: 'skipped', reasons: ['Example row is skipped.'] };
    for (const column of ['className', 'section', 'studentName', 'gender'] as const) {
      if (!data[column].trim()) reasons.push(`${column} is required.`);
    }
    if (!data.fatherPhone) reasons.push('fatherPhone or legacy parentPhone is required.');
    if (data.fatherPhone && !data.parentName) reasons.push('parentName is required when fatherPhone is provided.');
    if (data.studentName && (() => { try { splitStudentName(data.studentName); return false; } catch { return true; } })()) reasons.push('studentName must contain at least two names.');
    if (data.gender && !['male', 'female'].includes(data.gender.toLowerCase())) reasons.push('gender must be male or female.');
    if (data.dateOfBirth && (!/^\d{4}-\d{2}-\d{2}$/.test(data.dateOfBirth) || Number.isNaN(Date.parse(`${data.dateOfBirth}T00:00:00Z`)))) reasons.push('dateOfBirth must use YYYY-MM-DD.');
    if (data.parentPhone && !validImportPhone(data.parentPhone)) reasons.push('parentPhone must be a valid international phone number.');
    if (data.fatherPhone && !validImportPhone(data.fatherPhone)) reasons.push('fatherPhone must be a valid international phone number.');
    if (data.motherPhone && !validImportPhone(data.motherPhone)) reasons.push('motherPhone must be a valid international phone number.');
    if (data.studentPhone && !validImportPhone(data.studentPhone)) reasons.push('studentPhone must be a valid international phone number.');
    const branch = data.branch ? branchByName.get(data.branch.trim().toLowerCase()) : undefined;
    if (data.branch && !branch) reasons.push(`Unknown branch: ${data.branch}.`);
    const key = `${data.className.trim().toLowerCase()}\u0000${data.section.trim().toLowerCase()}`;
    const existingClass = byClass.get(key);
    if (branch && existingClass?.branchId && existingClass.branchId !== branch.id) reasons.push('branch does not match the existing class branch.');
    const identity = `${data.studentName.trim().toLowerCase()}\u0000${key}\u0000${data.fatherPhone.replace(/[\s()-]/g, '')}`;
    if (seen.has(identity) || students.some(student => {
      const fullName = `${student.firstName} ${student.middleName || ''} ${student.lastName}`.replace(/\s+/g, ' ').trim().toLowerCase();
      return fullName === data.studentName.trim().replace(/\s+/g, ' ').toLowerCase() && student.classId === existingClass?.id && (student.fatherPhone || '').replace(/[\s()-]/g, '') === data.fatherPhone.replace(/[\s()-]/g, '');
    })) reasons.push('Duplicate student with the same name, class, and parentPhone.');
    seen.add(identity);
    const capacityKey = existingClass?.id || key;
    const used = capacityUse.get(capacityKey) || 0;
    if (used >= (existingClass?.capacity || 40)) reasons.push(`Class capacity exceeded for ${data.className} / ${data.section}.`);
    if (reasons.length === 0) capacityUse.set(capacityKey, used + 1);
    return { row: index + 2, data, status: reasons.length ? 'error' : 'valid', reasons, classId: existingClass?.id, branchId: existingClass?.branchId || branch?.id };
  });
  return { rows: results, totals: { total: rows.length, valid: results.filter(row => row.status === 'valid').length, errors: results.filter(row => row.status === 'error').length, skipped: results.filter(row => row.status === 'skipped').length } };
}

// Redact sensitive properties at the HTTP boundary, including later-added routes.
apiRouter.use((req, res, next) => {
  const json = res.json.bind(res);
  res.json = ((body: any) => {
    const redact = (value: any): any => {
      if (Array.isArray(value)) return value.map(redact);
      if (!value || typeof value !== 'object') return value;
      const clean: Record<string, any> = {};
      for (const [key, child] of Object.entries(value)) {
        if (['passwordHash', 'pin', 'pinHash', 'twoFactorSecret', 'pendingTwoFactorSecret'].includes(key)
          && !(key === 'pin' && req.method === 'POST' && req.path === '/import/confirm')) continue;
        if (key === 'recoveryCodes' && req.path !== '/auth/2fa/setup') continue;
        clean[key] = redact(child);
      }
      return clean;
    };
    const safeBody = redact(body);
    const flush = (db as any).flush;
    if (typeof flush !== 'function') return json(safeBody);
    void flush.call(db).then(() => {
      if (!res.headersSent) json(safeBody);
    }).catch((failure: any) => {
      const code = typeof failure?.code === 'string' ? failure.code : '';
      const message = typeof failure?.message === 'string' ? failure.message : '';
      const missingColumn = message.match(/column ["']([^"']+)["']/i)?.[1];
      let response = 'Supabase could not save this change. Please retry.';
      let status = 503;
      if (code === '23505' || /duplicate key|unique constraint/i.test(message)) { response = /email/i.test(message) || (failure?.table === 'users' && failure?.payloadKeys?.includes('email')) ? 'A sign-in account already uses this email.' : 'A record with this ID or code already exists.'; status = 409; }
      else if (code === '23502' || /not-null constraint/i.test(message)) { response = missingColumn ? `Missing required field: ${missingColumn}.` : 'A required field is missing. Check the form and try again.'; status = 400; }
      else if (code === '23503' || /foreign key constraint/i.test(message)) { response = 'A selected school record no longer exists. Refresh and try again.'; status = 400; }
      else if (code === '23514' || /check constraint/i.test(message)) { response = 'One or more values are not allowed. Check the form and try again.'; status = 400; }
      if (!res.headersSent) res.status(status).json({ error: response, code: code || 'STORAGE_WRITE_FAILED' });
    });
    return res;
  }) as Response['json'];
  next();
});

// Reject cross-tenant identifiers globally, including routes that do not use requireSchoolContext.
apiRouter.use(async (req, res, next) => {
  const user = await getAuthenticatedUser(req);
  const requestedSchoolId = String(req.headers['x-school-id'] || req.query.schoolId || req.body?.schoolId || '');
  if (user && user.role !== 'super_admin' && requestedSchoolId && requestedSchoolId !== user.schoolId) {
    res.status(403).json({ error: 'Cross-school access denied.' });
    return;
  }
  next();
});

// Helper: Extract current user from signed HttpOnly cookie or Authorization header
const authenticatedRequestCache = new WeakMap<Request, { token: string; promise: Promise<User | null>; bootstrapAllowed: boolean }>();
const requestLookupCache = new WeakMap<Request, Map<string, Promise<any>>>();

function invalidateAuthenticatedSnapshot(_userId?: string, _sessionId?: string, _schoolId?: string) {}

function requestLookup<T>(req: Request, key: string, load: () => Promise<T>): Promise<T> {
  let cache = requestLookupCache.get(req);
  if (!cache) { cache = new Map(); requestLookupCache.set(req, cache); }
  let value = cache.get(key);
  if (!value) { value = load(); cache.set(key, value); }
  return value as Promise<T>;
}

function getSchoolForRequest(req: Request, schoolId: string): Promise<School | null> {
  return requestLookup(req, `school:${schoolId}`, () => db.getSchoolById(schoolId));
}

function cacheSchoolForRequest(req: Request, schoolId: string | undefined, school: School | null | undefined) {
  if (!schoolId || !school) return;
  let cache = requestLookupCache.get(req);
  if (!cache) { cache = new Map(); requestLookupCache.set(req, cache); }
  cache.set(`school:${schoolId}`, Promise.resolve(school));
}

function getStaffForRequest(req: Request, userId: string, schoolId: string) {
  return requestLookup(req, `staff:${schoolId}:${userId}`, () => db.getStaffMemberByUserId(userId, schoolId));
}

async function getNoticeClassIds(schoolId: string, user: User): Promise<string[]> {
  if (user.role === 'teacher') return user.assignedClassIds || [];
  if (!['parent', 'student'].includes(user.role)) return [];
  const students = await db.getStudents(schoolId);
  return students.filter(student => user.role === 'parent'
    ? user.linkedStudentIds?.includes(student.id) || [user.phone, user.parentPhone].includes(student.fatherPhone || '') || [user.phone, user.parentPhone].includes(student.motherPhone || '')
    : student.studentId === user.studentId || student.id === user.id.replace(/^usr-student-/, 'std-')
  ).map(student => student.classId);
}

async function getAuthenticatedUser(req: Request, allowBootstrap = false): Promise<User | null> {
  let token = req.cookies?.schoolos_session;
  if (!token && req.headers.authorization) {
    token = req.headers.authorization.replace(/^Bearer\s+/, '').trim();
  }
  if (!token) return null;
  const cached = authenticatedRequestCache.get(req);
  const bootstrapToken = Boolean(verifySignedSessionToken(token)?.sessionId.startsWith('bootstrap-'));
  if (cached && cached.token === token && (cached.bootstrapAllowed || !allowBootstrap || !bootstrapToken)) return cached.promise;
  const promise = loadAuthenticatedUser(req, token, allowBootstrap);
  authenticatedRequestCache.set(req, { token, promise, bootstrapAllowed: allowBootstrap });
  return promise;
}

async function loadAuthenticatedUser(req: Request, token: string, allowBootstrap: boolean): Promise<User | null> {
  // Verify HMAC-SHA256 signature, expiry, and structure
  const payload = verifySignedSessionToken(token);
  if (!payload) return null;

  let session: any = null;
  let storedUser: User | null = null;
  if (typeof (db as any).getSessionAndUserById === 'function') {
    const authContext = await (db as any).getSessionAndUserById(payload.sessionId, payload.userId, payload.schoolId);
    session = authContext?.session || null;
    storedUser = authContext?.user || null;
    cacheSchoolForRequest(req, storedUser?.schoolId, authContext?.school);
  } else {
    [session, storedUser] = await Promise.all([
      db.getSessionById(payload.sessionId),
      db.getUserById(payload.userId, payload.schoolId)
    ]);
  }
  if (!storedUser && allowBootstrap && payload.sessionId.startsWith('bootstrap-')) storedUser = await db.getUserById(payload.userId, payload.schoolId);
  if (!storedUser || storedUser.isBlocked) return null;
  const normalizedRole = normalizeRole(storedUser.role);
  if (!normalizedRole) return null;
  const user: User = { ...storedUser, role: normalizedRole };
  const isBootstrap = !session && allowBootstrap && payload.sessionId.startsWith('bootstrap-') && user.role === 'super_admin';
  if (!session && !isBootstrap) return null;
  if (session && !isSessionExpiryValid(session.expiresAt)) return null;
  // Non-super-admin sessions must remain bound to the user's current tenant.
  // Super admins may have a selected school in the session while their account
  // itself is platform-wide and therefore has no permanent schoolId.
  if (session && user.role !== 'super_admin' && session.schoolId !== user.schoolId) return null;
  if (user.role === 'accountant') {
    const staffAccount = await getStaffForRequest(req, user.id, user.schoolId || '');
    if (!staffAccount || staffAccount.status !== 'active') return null;
  }

  // Check if school is suspended (blocks non-Super Admins)
  if (user.schoolId && user.role !== 'super_admin') {
    const school = await getSchoolForRequest(req, user.schoolId);
    if (school?.subscription?.status === 'suspended') {
      return null;
    }
  }

  return user;
}

// Middleware: Require Authenticated User
async function requireAuth(req: Request, res: Response, next: () => void) {
  const user = await getAuthenticatedUser(req, true);
  if (!user) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  const token = req.cookies?.schoolos_session || req.headers.authorization?.replace(/^Bearer\s+/, '').trim();
  const payload = token ? verifySignedSessionToken(token) : null;
  const isBootstrap = Boolean(payload?.sessionId.startsWith('bootstrap-'));
  const firstLoginAllowedRoutes = ['/auth/me', '/auth/change-password', '/auth/logout'];
  if (isBootstrap) {
    if (user.role !== 'super_admin' || !user.mustChangePassword || !firstLoginAllowedRoutes.includes(req.path)) {
      res.status(403).json({ error: 'Complete the required password change before continuing.' }); return;
    }
  }
  if (user.mustChangePassword && !firstLoginAllowedRoutes.includes(req.path)) {
    res.status(403).json({ error: 'Password change is required before using SchoolOS.', code: 'MUST_CHANGE_PASSWORD' });
    return;
  }
  if (payload && !isBootstrap) await refreshSessionCookie(res, user, payload);
  (req as any).user = user;
  next();
}

// Middleware: Require Super Admin Role
function requireSuperAdmin(req: Request, res: Response, next: () => void) {
  const user = (req as any).user as User;
  if (!user || user.role !== 'super_admin') {
    res.status(403).json({ error: 'Access denied. Super Administrator privilege required.' });
    return;
  }
  next();
}

function requireSchoolAdminOrSuperAdmin(req: Request, res: Response, next: () => void) {
  const user = (req as any).user as User;
  if (!user || !['super_admin', 'school_admin'].includes(user.role)) {
    res.status(403).json({ error: 'School Administrator privilege required.' });
    return;
  }
  next();
}

function requireAccountantOrSuperAdmin(req: Request, res: Response, next: () => void) {
  const user = (req as any).user as User;
  if (!user || !['accountant', 'super_admin'].includes(user.role)) {
    res.status(403).json({ error: 'School Accountant privilege required for money records.' });
    return;
  }
  next();
}

function requireImportSchoolAccess(req: Request, res: Response, next: () => void) {
  const user = (req as any).user as User;
  const school = (req as any).school as School;
  if (!user.schoolId || user.schoolId !== school.id) { res.status(403).json({ error: 'Import requires a school scope bound to your signed-in session.' }); return; }
  if (['read_only', 'suspended'].includes(school.subscription?.status || 'read_only')) { res.status(403).json({ error: 'Imports are blocked for read-only or suspended schools.' }); return; }
  next();
}

function requireSchoolStaff(req: Request, res: Response, next: () => void) {
  const user = (req as any).user as User;
  if (!user || !['school_admin', 'super_admin', 'teacher', 'accountant'].includes(user.role)) {
    res.status(403).json({ error: 'School staff access required.' });
    return;
  }
  next();
}

async function canAccessTeachingClass(req: Request, res: Response, classId: string): Promise<boolean> {
  const user = (req as any).user as User;
  const school = (req as any).school as School;
  const klass = await db.getClassById(classId, school.id);
  if (!klass) {
    res.status(404).json({ error: 'Class not found in this school.' });
    return false;
  }
  if (user.role === 'teacher' && !user.assignedClassIds?.includes(classId)) {
    res.status(403).json({ error: 'You may only access your assigned classes.' });
    return false;
  }
  return true;
}

async function canAccessStudentRecord(user: User, studentId: string): Promise<boolean> {
  const student = await db.getStudentById(studentId, user.schoolId);
  if (!student || (user.schoolId && student.schoolId !== user.schoolId)) return false;
  if (user.role === 'super_admin' || user.role === 'school_admin' || user.role === 'accountant') return true;
  if (user.role === 'teacher') return Boolean(user.assignedClassIds?.includes(student.classId));
  if (user.role === 'parent') {
    const parentPhones = [user.phone, user.parentPhone].filter((phone): phone is string => Boolean(phone));
    return Boolean(user.linkedStudentIds?.includes(student.id) || parentPhones.includes(student.fatherPhone || '') || parentPhones.includes(student.motherPhone || ''));
  }
  if (user.role === 'student') return Boolean(user.studentId === student.studentId || student.id === user.id.replace(/^usr-student-/, 'std-'));
  return false;
}

// Middleware: Require School Tenant Context and enforce subscription gates & cross-school isolation
async function requireSchoolContext(req: Request, res: Response, next: () => void) {
  const user = (req as any).user as User;
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // Tenant selection comes only from an explicit request header/query or the
  // authenticated account. A body field is mutable business data and must
  // never silently switch the request's school context.
  let requestedSchoolId = (
    req.headers['x-school-id'] ||
    req.query.schoolId
  ) as string;

  // STRICT ENFORCEMENT: If non-super-admin tries to pass or touch a different schoolId, DENY with 403 Forbidden!
  if (user.role !== 'super_admin') {
    if (requestedSchoolId && requestedSchoolId !== user.schoolId) {
      res.status(403).json({ error: 'Cross-school access denied. Tenant violation detected.' });
      return;
    }
    // Always lock non-super-admins strictly to their authenticated school
    requestedSchoolId = user.schoolId!;
  } else {
    // Super admin uses requested school or their own
    requestedSchoolId = requestedSchoolId || user.schoolId || '';
  }

  if (!requestedSchoolId) {
    res.status(400).json({ error: 'School context required.' });
    return;
  }

  const school = await getSchoolForRequest(req, requestedSchoolId);
  if (!school) {
    res.status(404).json({ error: 'School not found.' });
    return;
  }

  // Suspension blocks non-Super Admins
  const subscriptionStatus = school.subscription?.status || 'read_only';
  if (subscriptionStatus === 'suspended' && user.role !== 'super_admin') {
    res.status(403).json({ 
      error: 'Access suspended. Your school subscription has been suspended by the platform administrator.',
      subscriptionStatus: 'suspended'
    });
    return;
  }

  // Read-only blocks all tenant mutations in the backend.
  if (subscriptionStatus === 'read_only' && user.role !== 'super_admin') {
    const isMutation = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method);
    if (isMutation) {
      res.status(403).json({ 
        error: 'School is currently in Read-Only mode due to expired subscription. Changes are blocked.',
        subscriptionStatus: 'read_only'
      });
      return;
    }
  }

  if (user.role === 'accountant') {
    const path = req.path.toLowerCase();
    const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    const requiredPermission = path.startsWith('/fees') ? 'fees_manage'
      : (path.startsWith('/admissions') || path.startsWith('/school/admissions')) ? 'admissions_manage'
        : path.startsWith('/attendance') && isWrite ? 'attendance_manage'
          : (path.startsWith('/marks') || path.startsWith('/exams') || path.startsWith('/rankings')) && isWrite ? 'grades_manage'
            : path.startsWith('/library') ? 'library_manage'
              : path.startsWith('/transport') ? 'transport_manage'
        : (path.startsWith('/reports') || path.startsWith('/school/reports')) ? 'reports_export'
                  : null;
    if (requiredPermission) {
      const staffAccount = await getStaffForRequest(req, user.id, school.id);
      if (!staffAccount?.permissions?.includes(requiredPermission)) {
        res.status(403).json({ error: 'Your staff account does not have permission for this action.' });
        return;
      }
    }
  }

  (req as any).school = school;
  next();
}

async function requireSchoolContextForSupportWrite(req: Request, res: Response, next: () => void) {
  if ((req as any).user?.role === 'super_admin') {
    next();
    return;
  }
  await requireSchoolContext(req, res, next);
}

// Helper: Issue signed cookie session
async function issueSessionCookie(res: Response, user: User, req: Request, schoolId?: string): Promise<void> {
  const settings = db.getSettings();
  const timeoutMinutes = settings.sessionTimeoutMinutes || 60;
  const expiresAt = Date.now() + timeoutMinutes * 60 * 1000;

  const sessionId = randomUUID();
  const createdAt = Date.now();
  const signedToken = createSignedSessionToken({
    sessionId,
    userId: user.id,
    role: user.role,
    schoolId: user.schoolId || schoolId,
    createdAt,
    expiresAt
  });

  await db.createSession({
    id: sessionId,
    userId: user.id,
    userRole: user.role,
    schoolId: user.schoolId || schoolId,
    ipAddress: req.ip || '',
    userAgent: String(req.headers['user-agent'] || ''),
    createdAt: new Date(createdAt).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    lastActivityAt: new Date(createdAt).toISOString()
  });

  res.cookie('schoolos_session', signedToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: timeoutMinutes * 60 * 1000
  });

}

async function refreshSessionCookie(res: Response, user: User, previous: ReturnType<typeof verifySignedSessionToken>): Promise<void> {
  if (!previous) return;
  const timeoutMinutes = db.getSettings().sessionTimeoutMinutes || 60;
  const expiresAt = Date.now() + timeoutMinutes * 60 * 1000;
  await db.touchSession(previous.sessionId, new Date(expiresAt).toISOString());
  const token = createSignedSessionToken({ ...previous, role: user.role, schoolId: user.schoolId || previous.schoolId, expiresAt });
  res.cookie('schoolos_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: timeoutMinutes * 60 * 1000
  });
}

// ==============================================================================
// 1. AUTHENTICATION & LOGIN (PASSWORD, STAFF FIRST-LOGIN, STUDENT/PARENT PIN)
// ==============================================================================

apiRouter.post('/auth/login', async (req, res) => {
  const { email, phone, schoolCode, pin, password } = req.body;
  const requestedRole = normalizeRole(req.body?.role);
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const settings = db.getSettings();
  const threshold = settings.lockoutThreshold || 5;
  const ipThreshold = threshold * 10;
  const durationMins = settings.lockoutDurationMinutes || 15;

  // A. STUDENT & PARENT LOGIN (School Code + Phone Number + PIN)
  if (requestedRole === 'student' || requestedRole === 'parent') {
    const role = requestedRole;
    if (!schoolCode || !phone || !pin) {
      res.status(400).json({ error: 'School code, phone number, and PIN are required.' });
      return;
    }

    // Rate Limiting & Lockout for Student/Parent
    const lockKey = `sp:${schoolCode}:${phone.trim()}`;
    const ipKey = `ip:${clientIp}`;
    const lockCheck = db.checkLoginLockout(lockKey, threshold, durationMins);
    const ipCheck = db.checkLoginLockout(ipKey, ipThreshold, durationMins);

    if (lockCheck.locked || ipCheck.locked) {
      const waitMins = lockCheck.remainingMinutes || ipCheck.remainingMinutes || 15;
      res.status(429).json({ error: `Account locked due to multiple failed logins. Try again in ${waitMins} minutes.` });
      return;
    }

    const school = await db.getSchoolByCode(schoolCode);
    if (!school) {
      const failed = db.recordLoginFailure(lockKey, threshold, durationMins);
      db.recordLoginFailure(ipKey, ipThreshold, durationMins);
      db.logAudit({
        action: 'FAILED_LOGIN_UNKNOWN_SCHOOL', category: 'auth', userId: 'unknown',
        userName: 'Unknown account', userRole: role,
        details: `Student/parent login failed for an unknown school code from IP ${clientIp}.`,
        severity: failed.newlyLocked ? 'critical' : 'warning'
      });
      res.status(failed.newlyLocked ? 429 : 404).json({ error: failed.newlyLocked ? `Too many failed attempts. Try again in ${durationMins} minutes.` : 'Invalid school code. School does not exist.' });
      return;
    }

    // Check if student access is enabled for this school
    if (role === 'student' && school.studentAccessEnabled === false) {
      res.status(403).json({ error: 'Student portal access is currently disabled for this school.' });
      return;
    }

    const matchingUsers = await db.findUsersByPhoneInSchool(phone, school.id);
    const candidateUsers = matchingUsers.filter(u => normalizeRole(u.role) === role).map(u => ({ ...u, role }));

    if (candidateUsers.length === 0) {
      // Check if student or parent exists in student records
      const students = await db.getStudents(school.id);
      const matchedStudents = students.filter(student =>
        role === 'student'
          ? student.studentPhone === phone || student.fatherPhone === phone
          : student.fatherPhone === phone || student.motherPhone === phone
      );
      const matchStd = matchedStudents[0];

      if (!matchStd) {
        const failed = db.recordLoginFailure(lockKey, threshold, durationMins);
        db.recordLoginFailure(ipKey, ipThreshold, durationMins);
        db.logAudit({
          action: 'FAILED_LOGIN_NOT_FOUND',
          category: 'auth',
          schoolId: school.id,
          schoolName: school.name,
          userId: 'unknown',
          userName: 'Unknown account',
          userRole: role,
          details: `Login failed for non-existent ${role} with phone ${phone} from IP ${clientIp}.`,
          severity: 'warning'
        });
        if (failed.newlyLocked) {
          res.status(429).json({ error: `Too many failed attempts. Account locked for ${durationMins} minutes.` });
          return;
        }
        res.status(401).json({ error: `No ${role} record found for phone ${phone} at school ${school.name}.` });
        return;
      }

      // Check PIN using scrypt verifyPin
      const isValidPin = verifyPin(pin, matchStd.pinHash || (matchStd as any).pin);
      if (!isValidPin) {
        const failedResult = db.recordLoginFailure(lockKey, threshold, durationMins);
        db.recordLoginFailure(ipKey, ipThreshold, durationMins);
        db.logAudit({
          action: 'FAILED_LOGIN_PIN',
          category: 'auth',
          schoolId: school.id,
          schoolName: school.name,
          userId: 'unknown',
          userName: 'Unknown account',
          userRole: role,
          details: `Incorrect PIN attempt for ${role} (student ${matchStd.studentId}) from IP ${clientIp}. Attempt ${failedResult.count}/${threshold}.`,
          severity: failedResult.newlyLocked ? 'critical' : 'warning'
        });

        if (failedResult.newlyLocked) {
          res.status(429).json({ error: `Too many failed attempts. Account locked for ${durationMins} minutes.` });
          return;
        }
        res.status(401).json({ error: `Incorrect 4-digit PIN. ${threshold - failedResult.count} attempts remaining.` });
        return;
      }

      // Successful verification -> Clear rate limits
      db.clearLoginFailures(lockKey);

      // Find or create user session
      let existingUser = (await db.getUsers(school.id)).find(u => u.role === role && (u.phone === phone || u.parentPhone === phone));
      if (!existingUser) {
        existingUser = db.createUser({
          schoolId: school.id,
          role,
          fullName: role === 'parent' ? `Parent of ${matchStd.firstName}` : `${matchStd.firstName} ${matchStd.lastName}`,
          phone,
          studentId: matchStd.studentId,
          passwordHash: '',
          pin: matchStd.pinHash,
          isBlocked: false,
          failedLoginAttempts: 0,
          linkedStudentIds: role === 'parent' ? matchedStudents.map(student => student.id) : [matchStd.id]
        });
      }

      await issueSessionCookie(res, existingUser, req, school.id);
      db.logAudit({
        action: 'USER_LOGIN_SUCCESS',
        category: 'auth',
        schoolId: school.id,
        schoolName: school.name,
        userId: existingUser.id,
        userName: existingUser.fullName,
        userRole: existingUser.role,
        details: `${role} authenticated successfully via PIN from IP ${clientIp}.`,
        severity: 'info'
      });

      res.json({
        user: sanitizeUser(existingUser),
        school,
        sessionTimeoutMinutes: settings.sessionTimeoutMinutes || 60,
        linkedStudents: role === 'parent' ? sanitizeStudents(matchedStudents) : undefined
      });
      return;
    }

    if (candidateUsers.length > 1) {
      res.status(400).json({ error: 'Multiple accounts linked to this phone. Please contact your school administrator.' });
      return;
    }

    const targetUser = candidateUsers[0];

    // Check user record lockout
    if (targetUser.lockedUntil && new Date(targetUser.lockedUntil) > new Date()) {
      const waitMins = Math.ceil((new Date(targetUser.lockedUntil).getTime() - Date.now()) / 60000);
      res.status(429).json({ error: `Account locked due to multiple failed logins. Try again in ${waitMins} minutes.` });
      return;
    }

    const isValidUserPin = verifyPin(pin, targetUser.pin || '');
    if (!isValidUserPin) {
    const lockResult = await db.handleFailedLogin(targetUser.id);
      db.recordLoginFailure(lockKey, threshold, durationMins);
      db.recordLoginFailure(ipKey, ipThreshold, durationMins);
      db.logAudit({
        action: 'FAILED_LOGIN_PIN',
        category: 'auth',
        schoolId: school.id,
        schoolName: school.name,
        userId: targetUser.id,
        userName: targetUser.fullName,
        userRole: targetUser.role,
        details: `Incorrect PIN for ${role} account from IP ${clientIp}.`,
        severity: lockResult.locked ? 'critical' : 'warning'
      });

      if (lockResult.locked) {
        res.status(429).json({ error: `Too many incorrect attempts. Account locked for ${durationMins} minutes.` });
        return;
      }
      res.status(401).json({ error: `Incorrect PIN. ${threshold - lockResult.attempts} attempts remaining.` });
      return;
    }

    // Success -> Clear failed attempts
    db.handleSuccessfulLogin(targetUser.id);
    db.clearLoginFailures(lockKey);

    // Linked children for parent
    let linkedStudents: any[] = [];
    if (role === 'parent') {
      const allStudents = await db.getStudents(school.id);
      linkedStudents = allStudents.filter(s => 
        (targetUser.linkedStudentIds && targetUser.linkedStudentIds.includes(s.id)) ||
        s.fatherPhone === phone || 
        s.motherPhone === phone
      );
    }

    await issueSessionCookie(res, targetUser, req, school.id);
    db.logAudit({
      action: 'USER_LOGIN_SUCCESS',
      category: 'auth',
      schoolId: school.id,
      schoolName: school.name,
      userId: targetUser.id,
      userName: targetUser.fullName,
      userRole: targetUser.role,
      details: `${role} signed in successfully via PIN from IP ${clientIp}.`,
      severity: 'info'
    });

    res.json({
      user: sanitizeUser(targetUser),
      school,
      sessionTimeoutMinutes: settings.sessionTimeoutMinutes || 60,
      linkedStudents: role === 'parent' ? sanitizeStudents(linkedStudents) : undefined
    });
    return;
  }

  // B. SUPER ADMIN, SCHOOL ADMIN, TEACHER, ACCOUNTANT
  // Teachers use their school-issued staff ID and either password or PIN.
  const identifier = typeof email === 'string' ? email.trim() : '';
  if (!identifier || !password) {
    res.status(400).json({ error: requestedRole === 'teacher' ? 'Teacher ID and password or PIN are required.' : 'Email or phone and password are required.' });
    return;
  }
  if (requestedRole === 'teacher' && !validStaffId(normalizeStaffId(identifier))) {
    res.status(400).json({ error: 'Enter the Teacher ID provided by your School Admin.' });
    return;
  }

  const staffLockKey = `staff:${identifier.trim().toLowerCase()}`;
  const ipKey = `ip:${clientIp}`;
  const lockCheck = db.checkLoginLockout(staffLockKey, threshold, durationMins);
  const ipCheck = db.checkLoginLockout(ipKey, ipThreshold, durationMins);

  if (lockCheck.locked || ipCheck.locked) {
    const waitMins = lockCheck.remainingMinutes || ipCheck.remainingMinutes || 15;
    res.status(429).json({ error: `Account temporarily locked due to multiple failed logins. Try again in ${waitMins} minutes.` });
    return;
  }

  const storedUser = await db.findUserForLogin(identifier);
  if (!storedUser) {
    db.recordLoginFailure(staffLockKey, threshold, durationMins);
    db.recordLoginFailure(ipKey, ipThreshold, durationMins);
    db.logAudit({
      action: 'FAILED_LOGIN_NOT_FOUND',
      category: 'auth',
      userId: 'unknown',
      userName: 'Unknown account',
      userRole: 'school_admin',
      details: `Failed sign-in attempt for unknown account ${identifier} from IP ${clientIp}.`,
      severity: 'warning'
    });
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }
  const normalizedRole = normalizeRole(storedUser.role);
  if (!normalizedRole || (requestedRole && normalizedRole !== requestedRole) || (requestedRole === 'teacher' && normalizeStaffId(storedUser.staffId) !== normalizeStaffId(identifier))) {
    db.recordLoginFailure(staffLockKey, threshold, durationMins);
    db.recordLoginFailure(ipKey, ipThreshold, durationMins);
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }
  const user: User = { ...storedUser, role: normalizedRole };

  // Check lockout on user document
  if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
    const waitMins = Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 60000);
    res.status(429).json({ error: `Account locked due to multiple failed logins. Try again in ${waitMins} minutes.` });
    return;
  }

  // Verify Scrypt Password Hash
  const isPasswordValid = verifyPassword(password, user.passwordHash) || (user.role === 'teacher' && verifyPin(password, String(user.pin || (user as any).pinHash || '')));
  if (!isPasswordValid) {
    const lockResult = await db.handleFailedLogin(user.id);
    db.recordLoginFailure(staffLockKey, threshold, durationMins);
    db.recordLoginFailure(ipKey, ipThreshold, durationMins);

    db.logAudit({
      action: 'FAILED_LOGIN_PASSWORD',
      category: 'auth',
      schoolId: user.schoolId,
      userId: user.id,
      userName: user.fullName,
      userRole: user.role,
      details: `Invalid password attempt for ${user.email || user.phone} from IP ${clientIp}. Attempt ${lockResult.attempts}/${threshold}.`,
      severity: lockResult.locked ? 'critical' : 'warning'
    });

    if (lockResult.locked) {
      res.status(429).json({ error: `Too many failed login attempts. Account locked for ${durationMins} minutes.` });
      return;
    }
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  // Super Admin first-login password change
  if (user.role === 'super_admin' && user.mustChangePassword) {
    const challengeToken = createSignedSessionToken({
      sessionId: `bootstrap-${randomUUID()}`,
      userId: user.id,
      role: user.role,
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000
    });
    res.json({ requirePasswordChange: true, challengeToken });
    return;
  }

  // Login is password-only; stored TOTP settings do not affect sign-in.

  // Success -> Reset failed attempts
  await db.handleSuccessfulLogin(user.id);
  db.clearLoginFailures(staffLockKey);

  await issueSessionCookie(res, user, req);
  const school = user.schoolId ? await db.getSchoolById(user.schoolId) : null;

  db.logAudit({
    action: 'USER_LOGIN_SUCCESS',
    category: 'auth',
    schoolId: user.schoolId,
    schoolName: school?.name,
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    details: `${user.role} user logged in successfully from IP ${clientIp}.`,
    severity: 'info'
  });

  res.json({
    user: sanitizeUser(user),
    school,
    sessionTimeoutMinutes: settings.sessionTimeoutMinutes || 60,
    mustChangePassword: user.mustChangePassword || false
  });
});

// Logout endpoint (clears HttpOnly cookie)
apiRouter.post('/auth/logout', async (req, res) => {
  const token = req.cookies?.schoolos_session || req.headers.authorization?.replace(/^Bearer\s+/, '').trim();
  const payload = token ? verifySignedSessionToken(token) : null;
  if (payload) { await db.revokeSession(payload.sessionId); invalidateAuthenticatedSnapshot(undefined, payload.sessionId); }
  res.clearCookie('schoolos_session', { path: '/' });
  res.json({ success: true, message: 'Signed out successfully.' });
});

// Super Admin 2FA Setup Flow (Generate QR code & Secret)
apiRouter.post('/auth/2fa/setup', requireAuth, requireSuperAdmin, async (req, res) => {
  if (!db.getSettings().requireSuperAdmin2FA) { res.status(403).json({ error: 'The 2FA feature is disabled.' }); return; }
  const user = (req as any).user as User;
  const secret = generate2FASecret();
  const uri = get2FAUri(secret, user.email || 'Super Administrator');
  const qrCodeUrl = await generate2FAQRCode(uri);
  const recoveryCodes = generateRecoveryCodes(8);
  const recoveryCodeHashes = recoveryCodes.map(hashRecoveryCode);

  const updated = db.updateUser(user.id, {
    pendingTwoFactorSecret: secret,
    recoveryCodes: recoveryCodeHashes
  });
  if (!updated) { res.status(404).json({ error: 'Super Admin account not found.' }); return; }
  invalidateAuthenticatedSnapshot(user.id);

  res.json({
    secret,
    qrCodeUrl,
    recoveryCodes
  });
});

// Super Admin 2FA Enable (Requires valid test code confirmation)
apiRouter.post('/auth/2fa/verify-and-enable', requireAuth, requireSuperAdmin, async (req, res) => {
  if (!db.getSettings().requireSuperAdmin2FA) { res.status(403).json({ error: 'The 2FA feature is disabled.' }); return; }
  const user = (req as any).user as User;
  const { code } = req.body;

  if (!user.pendingTwoFactorSecret) {
    res.status(400).json({ error: 'No 2FA setup in progress. Please initiate setup first.' });
    return;
  }

  const isValid = String(code).trim() !== '123456' && verify2FACode(code, user.pendingTwoFactorSecret);
  if (!isValid) {
    res.status(400).json({ error: 'Invalid 6-digit confirmation code. Please check your authenticator app.' });
    return;
  }

  const enrolledUser = db.updateUser(user.id, {
    twoFactorEnabled: true,
    twoFactorSecret: user.pendingTwoFactorSecret,
    pendingTwoFactorSecret: undefined,
    mustSetup2FA: false
  });
  if (!enrolledUser) { res.status(404).json({ error: 'Super Admin account not found.' }); return; }
  invalidateAuthenticatedSnapshot(user.id);

  db.logAudit({
    action: '2FA_ENABLED',
    category: 'security',
    userId: user.id,
    userName: user.fullName,
    userRole: 'super_admin',
    details: 'Two-Factor Authentication was successfully enrolled and activated.',
    severity: 'info'
  });

  await issueSessionCookie(res, enrolledUser, req);
  res.json({ success: true, user: sanitizeUser(enrolledUser), message: 'Two-Factor Authentication is now actively protecting your account.' });
});

apiRouter.post('/auth/2fa/disable', requireAuth, requireSuperAdmin, (req, res) => {
  if (!db.getSettings().requireSuperAdmin2FA) { res.status(403).json({ error: 'The 2FA feature is disabled.' }); return; }
  const user = (req as any).user as User;
  const { currentPassword, code } = req.body || {};
  if (typeof currentPassword !== 'string' || !verifyPassword(currentPassword, user.passwordHash)) {
    res.status(400).json({ error: 'Current password is incorrect.' }); return;
  }
  if (user.twoFactorEnabled && (String(code || '').trim() === '123456' || !user.twoFactorSecret || !verify2FACode(code, user.twoFactorSecret))) {
    res.status(400).json({ error: 'A valid current authenticator code is required to disable 2FA.' }); return;
  }
  const updated = db.updateUser(user.id, { twoFactorEnabled: false, twoFactorSecret: undefined, pendingTwoFactorSecret: undefined, recoveryCodes: [], mustSetup2FA: false });
  if (!updated) { res.status(404).json({ error: 'Super Admin account not found.' }); return; }
  invalidateAuthenticatedSnapshot(user.id);
  db.logAudit({ action: '2FA_DISABLED', category: 'security', userId: user.id, userName: user.fullName, userRole: 'super_admin', details: 'Two-factor authentication was disabled after password verification.', severity: 'warning' });
  res.json({ success: true, user: sanitizeUser(updated) });
});

// Force Password Change endpoint (hashes new password with scrypt)
apiRouter.post('/auth/change-password', requireAuth, async (req, res) => {
  const user = (req as any).user as User;
  const { newPassword } = req.body;

  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    res.status(400).json({ error: 'New password must be at least 8 characters.' });
    return;
  }
  if (verifyPassword(newPassword, user.passwordHash)) { res.status(400).json({ error: 'Choose a new password that is different from your temporary sign-in password.' }); return; }

  const updated = db.updateUser(user.id, {
    passwordHash: hashPassword(newPassword),
    mustChangePassword: false
  });
  if (!updated) { res.status(404).json({ error: 'User account not found; password was not changed.' }); return; }
  invalidateAuthenticatedSnapshot(user.id);
  await db.flush();

  db.logAudit({
    action: 'PASSWORD_CHANGED',
    category: 'auth',
    schoolId: user.schoolId,
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    details: 'User password was updated successfully with scrypt hashing.',
    severity: 'info'
  });

  await issueSessionCookie(res, updated, req);
  res.json({ success: true, message: 'Password updated successfully.' });
});

// Current User Profile (Sanitized)
apiRouter.get('/auth/me', requireAuth, async (req, res) => {
  const user = (req as any).user as User;
  const school = user.schoolId ? await getSchoolForRequest(req, user.schoolId) : null;
  res.json({ user: sanitizeUser(user), school, sessionTimeoutMinutes: db.getSettings().sessionTimeoutMinutes || 60 });
});

apiRouter.put('/auth/profile', requireAuth, async (req, res) => {
  const user = (req as any).user as User;
  const { fullName, email, phone, currentPassword, newPassword } = req.body || {};
  if (typeof fullName !== 'string' || fullName.trim().length < 2) { res.status(400).json({ error: 'Full name must contain at least two characters.' }); return; }
  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) { res.status(400).json({ error: 'Enter a valid email address.' }); return; }
  if (newPassword !== undefined && newPassword !== '') {
    if (typeof newPassword !== 'string' || newPassword.length < 8) { res.status(400).json({ error: 'New password must be at least 8 characters.' }); return; }
    if (typeof currentPassword !== 'string' || !verifyPassword(currentPassword, user.passwordHash)) { res.status(400).json({ error: 'Current password is incorrect.' }); return; }
  }
  if (cleanEmail && cleanEmail !== (user.email || '').toLowerCase()) {
    const existing = await db.findUserForLogin(cleanEmail, user.schoolId);
    if (existing && existing.id !== user.id) { res.status(409).json({ error: 'That email address is already in use.' }); return; }
  }
  const updates: Partial<User> = { fullName: fullName.trim(), email: cleanEmail || undefined, phone: typeof phone === 'string' ? phone.trim() : '' };
  if (newPassword) { updates.passwordHash = hashPassword(newPassword); updates.mustChangePassword = false; }
  const updated = db.updateUser(user.id, updates);
  if (!updated) { res.status(404).json({ error: 'User profile not found.' }); return; }
  invalidateAuthenticatedSnapshot(user.id);
  if (newPassword) db.logAudit({ action: 'PASSWORD_CHANGED', category: 'auth', schoolId: user.schoolId, userId: user.id, userName: updated.fullName, userRole: user.role, details: 'User changed their password from profile settings.', severity: 'info' });
  res.json(sanitizeUser(updated));
});

apiRouter.get('/superadmin/sessions', requireAuth, requireSuperAdmin, async (_req, res) => {
  res.json((await db.getUserSessions()).filter(session => Date.parse(session.expiresAt) > Date.now()));
});

apiRouter.post('/superadmin/sessions/revoke', requireAuth, requireSuperAdmin, async (req, res) => {
  if (typeof req.body?.sessionId !== 'string') { res.status(400).json({ error: 'sessionId is required.' }); return; }
  const revoked = await db.revokeSession(req.body.sessionId);
  if (!revoked) { res.status(404).json({ error: 'Session not found.' }); return; }
  invalidateAuthenticatedSnapshot(undefined, req.body.sessionId);
  const user = (req as any).user as User;
  db.logAudit({ action: 'SESSION_REVOKED', category: 'security', userId: user.id, userName: user.fullName, userRole: user.role, details: 'A user session was revoked by the Super Administrator.', severity: 'warning' });
  res.json({ success: true });
});

// ==============================================================================
// 2. SUPER ADMIN SETTINGS & PLATFORM CONTROLS
// ==============================================================================

apiRouter.get('/superadmin/settings', requireAuth, requireSuperAdmin, (_req, res) => {
  res.json(db.getSettings());
});

apiRouter.get('/superadmin/analytics', requireAuth, requireSuperAdmin, async (_req, res) => {
  try {
    const schools = await db.getSchools();
    const directory = await Promise.all(schools.map(async school => {
      const [students, teachers] = await Promise.all([
        db.queryPage('students', { school_id: school.id }, 1, 1, undefined, 'id'),
        db.queryPage('teachers', { school_id: school.id }, 1, 1, undefined, 'id')
      ]);
      return { ...school, studentCount: students.total, teacherCount: teachers.total };
    }));
    const firstPage = await db.queryPage('users', {}, 1, 100, undefined, LIST_QUERY_COLUMNS.users);
    const users = [...firstPage.items];
    const pages = Math.ceil(firstPage.total / 100);
    for (let page = 2; page <= pages; page += 1) {
      const nextPage = await db.queryPage('users', {}, page, 100, undefined, LIST_QUERY_COLUMNS.users);
      users.push(...nextPage.items);
    }
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const activeUsers30Days = users.filter(user => {
      const lastLogin = Date.parse(String((user as any).lastLoginAt || ''));
      return Number.isFinite(lastLogin) && lastLogin >= cutoff;
    }).length;
    const invoices = await db.getSubscriptionInvoices();
    const totalPaidBillings = invoices.filter(invoice => invoice.status === 'paid').reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
    res.json({
      schools: directory,
      activeSchools: directory.filter(school => school.subscription?.status === 'active').length,
      totalStudents: directory.reduce((sum, school) => sum + school.studentCount, 0),
      totalTeachers: directory.reduce((sum, school) => sum + school.teacherCount, 0),
      activeUsers30Days,
      totalPaidBillings
    });
  } catch {
    res.status(503).json({ error: 'Unable to load platform analytics.' });
  }
});

apiRouter.get('/superadmin/dashboard', requireAuth, requireSuperAdmin, async (_req, res) => {
  try { res.json(await db.getSuperAdminDashboardSummary()); }
  catch { res.status(503).json({ error: 'Unable to load the Super Admin dashboard.' }); }
});

apiRouter.put('/superadmin/settings', requireAuth, requireSuperAdmin, (req, res) => {
  const updated = db.updateSettings(req.body);
  db.logAudit({
    action: 'PLATFORM_SETTINGS_UPDATED',
    category: 'subscription',
    userId: (req as any).user.id,
    userName: (req as any).user.fullName,
    userRole: 'super_admin',
    details: 'Platform settings and academic dates updated by Super Administrator.',
    severity: 'warning'
  });
  res.json(updated);
});

apiRouter.get('/superadmin/plans', requireAuth, requireSuperAdmin, (_req, res) => {
  res.json(db.getPlans());
});

apiRouter.put('/superadmin/plans/:id', requireAuth, requireSuperAdmin, (req, res) => {
  const updated = db.updatePlan(req.params.id, req.body);
  if (!updated) {
    res.status(404).json({ error: 'Plan not found.' });
    return;
  }
  res.json(updated);
});

apiRouter.get('/superadmin/schools', requireAuth, requireSuperAdmin, async (_req, res) => {
  const schools = await db.getSchools();
  const directory = await Promise.all(schools.map(async school => {
    const [students, teachers] = await Promise.all([
      db.queryPage('students', { school_id: school.id }, 1, 1, undefined, 'id'),
      db.queryPage('teachers', { school_id: school.id }, 1, 1, undefined, 'id')
    ]);
    return { ...school, studentCount: students.total, teacherCount: teachers.total };
  }));
  res.json(directory);
});

apiRouter.post('/superadmin/schools', requireAuth, requireSuperAdmin, async (req, res) => {
  const body = req.body || {};
  const missing = onboardingFieldErrors(body);
  if (missing.length) {
    res.status(400).json({ error: `Missing or invalid: ${missing.join(', ')}.`, fields: missing });
    return;
  }
  const { name, code, address, city, phone, email, brandColor, plan, cadence, adminName, adminEmail, adminPhone, adminPassword } = body;
  const cleanCode = String(code).trim().toUpperCase();
  const cleanAdminEmail = String(adminEmail).trim().toLowerCase();

  // Check unique code
  if (await db.getSchoolByCode(cleanCode)) {
    res.status(400).json({ error: `School code "${cleanCode}" is already in use.`, fields: ['code'] });
    return;
  }
  if (await db.findUserForLogin(cleanAdminEmail)) { res.status(409).json({ error: 'A user already uses this email address.', fields: ['adminEmail'] }); return; }

  const settings = db.getSettings();
  const now = new Date();
  const validUntil = new Date(now.getTime() + (settings.trialDays || 7) * 24 * 60 * 60 * 1000);

  const school = db.createSchool({
    name: String(name).trim(),
    code: cleanCode,
    address: address || '',
    city: city || '',
    phone: phone || '',
    email: String(email).trim(),
    brandColor: brandColor || '#0F766E',
    currency: ['ETB', 'USD', 'SOS'].includes(String(body.currency)) ? body.currency : 'ETB',
    language: 'en',
    timezone: 'Africa/Addis_Ababa',
    academicYear: settings.academicYearName || '2026-2027',
    currentSemester: 'Semester 1',
    defaultClassCapacity: 40,
    studentAccessEnabled: Boolean(body.studentAccessEnabled),
    subscription: {
      plan: plan || 'standard',
      cadence: cadence || 'monthly',
      status: 'trial',
      startDate: now.toISOString(),
      validUntil: validUntil.toISOString(),
      graceDays: settings.graceDays ?? 7,
      pricePaid: 0,
      autoRenew: true
    }
  });

  // Create First School Administrator
  let adminUser: User;
  try { adminUser = db.createUser({
    schoolId: school.id,
    role: 'school_admin',
    staffId: await nextSchoolStaffId(school),
    fullName: adminName || `${name} Administrator`,
    email: cleanAdminEmail,
    phone: adminPhone || phone,
    passwordHash: adminPassword,
    mustChangePassword: true,
    isBlocked: false,
    failedLoginAttempts: 0
  }); } catch (error) { db.deleteSchool(school.id); throw error; }

  db.logAudit({
    action: 'SCHOOL_CREATED',
    category: 'school',
    schoolId: school.id,
    schoolName: school.name,
    userId: (req as any).user.id,
    userName: (req as any).user.fullName,
    userRole: 'super_admin',
    details: `Created new school ${school.name} (${school.code}) with admin ${adminUser.email}.`,
    severity: 'info'
  });

  res.status(201).json({ school, admin: adminUser });
});

apiRouter.patch('/superadmin/schools/:id/subscription', requireAuth, requireSuperAdmin, async (req, res) => {
  const { status, plan, cadence, validUntil, studentAccessEnabled } = req.body;
  const school = await db.getSchoolById(req.params.id);
  if (!school) {
    res.status(404).json({ error: 'School not found.' });
    return;
  }

  const updates: Partial<School> = {};
  if (studentAccessEnabled !== undefined) {
    updates.studentAccessEnabled = Boolean(studentAccessEnabled);
  }

  if (status || plan || cadence || validUntil) {
    updates.subscription = {
      ...(school.subscription || {}),
      ...(status ? { status } : {}),
      ...(plan ? { plan } : {}),
      ...(cadence ? { cadence } : {}),
      ...(validUntil ? { validUntil } : {})
    };
  }

  const updated = db.updateSchool(school.id, updates);
  invalidateAuthenticatedSnapshot(undefined, undefined, school.id);
  db.logAudit({
    action: 'SUBSCRIPTION_UPDATED',
    category: 'subscription',
    schoolId: school.id,
    schoolName: school.name,
    userId: (req as any).user.id,
    userName: (req as any).user.fullName,
    userRole: 'super_admin',
    details: `Updated subscription for ${school.name}. Status: ${updated?.subscription.status}.`,
    severity: 'warning'
  });

  res.json(updated);
});

apiRouter.post('/superadmin/broadcasts', requireAuth, requireSuperAdmin, (req, res) => {
  const b = db.createBroadcast(req.body);
  res.status(201).json(b);
});

apiRouter.get('/superadmin/broadcasts', requireAuth, requireSuperAdmin, (_req, res) => {
  res.json(db.getBroadcasts());
});

apiRouter.get('/superadmin/invoices', requireAuth, requireSuperAdmin, (_req, res) => {
  res.json(db.getSubscriptionInvoices());
});

apiRouter.post('/superadmin/invoices/:id/pay', requireAuth, requireSuperAdmin, async (req, res) => {
  const inv = await db.markInvoicePaid(req.params.id);
  if (!inv) {
    res.status(404).json({ error: 'Invoice not found.' });
    return;
  }
  res.json(inv);
});

apiRouter.get('/superadmin/audit-logs', requireAuth, requireSuperAdmin, (req, res) => {
  void sendDatabasePage(req, res, 'audit_logs', {});
});

apiRouter.get('/superadmin/audit-logs/export-csv', requireAuth, requireSuperAdmin, (_req, res) => {
  const csv = db.exportAuditLogsCSV();
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="audit_logs.csv"');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(csv);
});

// Platform Backup
apiRouter.get('/superadmin/backup', requireAuth, requireSuperAdmin, async (req, res) => {
  const user = (req as any).user as User;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Disposition', 'attachment; filename="schoolos-platform-backup.json"');
  db.logAudit({
    action: 'PLATFORM_BACKUP_DOWNLOADED',
    category: 'security',
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    details: 'Downloaded a full platform backup snapshot.',
    severity: 'warning'
  });
  res.json(await db.generatePlatformBackup());
});

// ==============================================================================
// 3. SCHOOL BRANCHES, CLASSES, SUBJECTS & TIMETABLE
// ==============================================================================

apiRouter.get('/branches', requireAuth, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  await sendDatabasePage(req, res, 'school_branches', { school_id: school.id });
});

apiRouter.get('/import/template', requireAuth, requireSchoolAdminOrSuperAdmin, requireSchoolContext, requireImportSchoolAccess, (_req, res) => {
  const records = [
    ['className', 'section', 'studentName', 'gender', 'dateOfBirth', 'parentName', 'parentPhone', 'fatherPhone', 'motherName', 'motherPhone', 'studentPhone', 'branch'],
    ['KG', 'A', 'EXAMPLE Student One', 'female', '2018-01-15', 'EXAMPLE Father One', '+252611111111', '', 'EXAMPLE Mother One', '+252622222222', '', ''],
    ['Grade 1', 'A', 'EXAMPLE Student Two', 'male', '2018-04-22', 'EXAMPLE Father Two', '+252633333333', '', 'EXAMPLE Mother Two', '+252644444444', '+252655555555', '']
  ];
  const csv = records.map(record => record.map(value => `"${value.replace(/"/g, '""')}"`).join(',')).join('\r\n');
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="schoolos-student-import-template.csv"' }).send(csv);
});

apiRouter.post('/import/preview', express.raw({ type: 'multipart/form-data', limit: '5mb' }), requireAuth, requireSchoolAdminOrSuperAdmin, requireSchoolContext, requireImportSchoolAccess, async (req, res) => {
  try {
    if (!Buffer.isBuffer(req.body)) { res.status(400).json({ error: 'Upload a CSV or XLSX file.' }); return; }
    const { file, extension } = extractImportFile(req.body, String(req.headers['content-type'] || ''));
    const rows = parseSchoolImport(file, extension);
    const result = await validateSchoolImport(rows, (req as any).school.id);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The file could not be previewed.';
    res.status(message.includes('limit') ? 413 : 400).json({ error: message });
  }
});

apiRouter.post('/import/confirm', requireAuth, requireSchoolAdminOrSuperAdmin, requireSchoolContext, requireImportSchoolAccess, async (req, res) => {
  const school = (req as any).school;
  const user = (req as any).user as User;
  const submittedRows = req.body?.rows;
  if (!Array.isArray(submittedRows) || submittedRows.length > 2000) { res.status(400).json({ error: 'Confirm requires at most 2,000 preview rows.' }); return; }
  const validated = await validateSchoolImport(submittedRows, school.id);
  if (validated.totals.errors || !validated.totals.valid) {
    res.status(400).json({ error: 'Preview contains errors or no importable rows. Correct the file and preview it again.', preview: validated }); return;
  }
  const importRows = validated.rows.filter(row => row.status === 'valid');
  const classes = await db.getClasses(school.id);
  const branches = await db.getBranches(school.id);
  const classIds = new Map(classes.map(item => [`${item.name.trim().toLowerCase()}\u0000${item.section.trim().toLowerCase()}`, item.id]));
  const classRecords: any[] = [];
  const classPayload = new Map<string, any>();
  for (const row of importRows) {
    const key = `${row.data.className.trim().toLowerCase()}\u0000${row.data.section.trim().toLowerCase()}`;
    if (!classIds.has(key) && !classPayload.has(key)) {
      const id = `cls-${randomUUID()}`;
      const grade = /\b(?:KG|KINDERGARTEN|NURSERY)\b/i.test(row.data.className) ? 0 : Number(/\d+/.exec(row.data.className)?.[0] || 1);
      const record = { id, schoolId: school.id, branchId: row.branchId || branches.find(branch => branch.name.toLowerCase() === row.data.branch.toLowerCase())?.id, name: row.data.className.trim(), gradeLevel: grade === 0 ? 0 : Math.min(12, Math.max(1, grade)), section: row.data.section.trim(), roomNumber: '', capacity: 40, monthlyFee: 0 };
      classPayload.set(key, record);
      classRecords.push(record);
      classIds.set(key, id);
    }
  }
  const studentRecords: any[] = [];
  const userRecords: any[] = [];
  const pinSlips: Array<{ type: 'student' | 'parent'; name: string; studentName?: string; phone?: string; studentId?: string; pin: string }> = [];
  const parentRecords = new Map<string, any>();
  const existingParentAccounts = await db.getParents(school.id);
  for (const row of importRows) {
    const names = splitStudentName(row.data.studentName);
    const id = `std-${randomUUID()}`;
    const studentId = `STD-${school.code}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const pin = String(1000 + (randomBytes(4).readUInt32BE(0) % 9000));
    const pinHash = hashPin(pin);
    const classId = classIds.get(`${row.data.className.trim().toLowerCase()}\u0000${row.data.section.trim().toLowerCase()}`)!;
    const klass = classes.find(item => item.id === classId) || classPayload.get(`${row.data.className.trim().toLowerCase()}\u0000${row.data.section.trim().toLowerCase()}`);
    const student = { id, schoolId: school.id, branchId: klass?.branchId, studentId, ...names, gender: row.data.gender.toLowerCase(), dateOfBirth: row.data.dateOfBirth, studentPhone: row.data.studentPhone || undefined, fatherPhone: row.data.fatherPhone || row.data.parentPhone, motherPhone: row.data.motherPhone || undefined, classId, section: row.data.section.trim(), status: 'active', pinHash };
    studentRecords.push(student);
    userRecords.push({ id: `usr-student-${id}`, schoolId: school.id, branchId: student.branchId, role: 'student', fullName: row.data.studentName.trim(), phone: row.data.studentPhone || student.fatherPhone, studentId, pin: pinHash });
    pinSlips.push({ type: 'student', name: row.data.studentName.trim(), studentId, pin });
    const guardians = [
      { phone: row.data.fatherPhone || row.data.parentPhone, name: row.data.parentName.trim() },
      { phone: row.data.motherPhone, name: row.data.motherName.trim() || ('Mother of ' + row.data.studentName.trim()) }
    ];
    for (const guardian of guardians) {
      const phoneValue = guardian.phone.trim();
      if (!phoneValue) continue;
      const phoneKey = phoneValue.replace(/[\s()-]/g, '');
      let parentRecord = parentRecords.get(phoneKey);
      if (!parentRecord) {
        const parent = existingParentAccounts.find(item =>
          [item.phone, item.parentPhone].some(value => String(value || '').replace(/[\s()-]/g, '') === phoneKey)
        );
        const existingPinHash = parent?.pin || (parent as any)?.pinHash;
        const parentPin = existingPinHash ? undefined : String(1000 + (randomBytes(4).readUInt32BE(0) % 9000));
        parentRecord = {
          id: parent?.id || ('usr-parent-' + randomUUID()),
          schoolId: school.id,
          role: 'parent',
          fullName: parent?.fullName || guardian.name,
          phone: parent?.phone || phoneValue,
          parentPhone: parent?.parentPhone || phoneValue,
          pin: existingPinHash || hashPin(parentPin!),
          linkedStudentIds: [...(parent?.linkedStudentIds || [])]
        };
        parentRecords.set(phoneKey, parentRecord);
        if (parentPin) pinSlips.push({ type: 'parent', name: parentRecord.fullName, phone: phoneValue, studentName: row.data.studentName.trim(), pin: parentPin });
      }
      parentRecord.linkedStudentIds = [...new Set([...parentRecord.linkedStudentIds, id])];
    }
  }
  userRecords.push(...parentRecords.values());
  const auditId = `log-${randomUUID()}`;
  const payload = {
    classes: classRecords.map(item => ({ id: item.id, school_id: item.schoolId, branch_id: item.branchId, name: item.name, grade_level: item.gradeLevel, section: item.section, room_number: item.roomNumber, capacity: item.capacity, monthly_fee: item.monthlyFee })),
    students: studentRecords.map(item => ({ id: item.id, school_id: item.schoolId, branch_id: item.branchId, student_id: item.studentId, first_name: item.firstName, middle_name: item.middleName, last_name: item.lastName, gender: item.gender, date_of_birth: item.dateOfBirth || null, student_phone: item.studentPhone, father_phone: item.fatherPhone, mother_phone: item.motherPhone, class_id: item.classId, section: item.section, pin_hash: item.pinHash })),
    users: userRecords.map(item => ({ id: item.id, school_id: item.schoolId, branch_id: item.branchId, role: item.role, full_name: item.fullName, phone: item.phone, parent_phone: item.parentPhone, student_id: item.studentId, linked_student_ids: item.linkedStudentIds, pin_hash: item.pin })),
    audit_logs: [{ id: auditId, action: 'SCHOOL_BULK_IMPORT', category: 'school', school_id: school.id, school_name: school.name, user_id: user.id, user_name: user.fullName, user_role: user.role, details: `Bulk import completed: ${studentRecords.length} students, ${classRecords.length} classes, ${parentRecords.size} parent accounts.` }]
  };
  try {
    await db.bulkImportStudents(payload);
  } catch {
    res.status(500).json({ error: 'Import failed. No records were written; please retry.' }); return;
  }
  res.json({ success: true, counts: { classes: classRecords.length, students: studentRecords.length, parents: parentRecords.size, skipped: validated.totals.skipped }, pinSlips });
});

apiRouter.post('/branches', requireAuth, requireSchoolAdminOrSuperAdmin, requireSchoolContext, async (req, res) => {
  const school = (req as any).school as School;
  const user = (req as any).user as User;
  let input;
  try {
    input = sanitizeBranchInput(req.body);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Branch details are invalid.' });
    return;
  }

  const branches = await db.getBranches(school.id);
  if (branches.some(branch => branch.name.trim().toLowerCase() === String(input.name).toLowerCase())) {
    res.status(409).json({ error: 'A campus branch with this name already exists.' });
    return;
  }
  if (input.isMain) {
    for (const branch of branches) if (branch.isMain) db.updateBranch(school.id, branch.id, { isMain: false });
  }

  const branch = db.createBranch(school.id, {
    name: input.name as string,
    address: input.address as string,
    phone: input.phone || '',
    email: input.email || '',
    isMain: Boolean(input.isMain)
  });
  db.logAudit({
    action: 'BRANCH_CREATED',
    category: 'school',
    schoolId: school.id,
    schoolName: school.name,
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    details: `Created campus branch ${branch.name}${branch.isMain ? ' as the main campus' : ''}.`,
    severity: 'info'
  });
  res.status(201).json(branch);
});

apiRouter.put('/branches/:id', requireAuth, requireSchoolAdminOrSuperAdmin, requireSchoolContext, async (req, res) => {
  const school = (req as any).school as School;
  const user = (req as any).user as User;
  let input;
  try {
    input = sanitizeBranchInput(req.body, true);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Branch details are invalid.' });
    return;
  }
  if (!Object.keys(input).length) {
    res.status(400).json({ error: 'Provide at least one branch field to update.' });
    return;
  }

  const branches = await db.getBranches(school.id);
  const branch = branches.find(item => item.id === req.params.id);
  if (!branch) {
    res.status(404).json({ error: 'Campus branch was not found in this school.' });
    return;
  }
  if (input.name && branches.some(item => item.id !== branch.id && item.name.trim().toLowerCase() === input.name!.toLowerCase())) {
    res.status(409).json({ error: 'A campus branch with this name already exists.' });
    return;
  }
  if (input.isMain === false && branch.isMain) {
    res.status(400).json({ error: 'Choose another main campus instead of removing the main campus flag.' });
    return;
  }
  if (input.isMain === true) {
    for (const item of branches) if (item.id !== branch.id && item.isMain) db.updateBranch(school.id, item.id, { isMain: false });
  }

  const updated = db.updateBranch(school.id, branch.id, input);
  db.logAudit({
    action: 'BRANCH_UPDATED',
    category: 'school',
    schoolId: school.id,
    schoolName: school.name,
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    details: `Updated campus branch ${updated?.name || branch.name}: ${Object.keys(input).join(', ')}.`,
    severity: input.isMain ? 'warning' : 'info'
  });
  res.json(updated);
});

apiRouter.delete('/branches/:id', requireAuth, requireSchoolAdminOrSuperAdmin, requireSchoolContext, async (req, res) => {
  const school = (req as any).school as School;
  const user = (req as any).user as User;
  const branches = await db.getBranches(school.id);
  const branch = branches.find(item => item.id === req.params.id);
  if (!branch) {
    res.status(404).json({ error: 'Campus branch was not found in this school.' });
    return;
  }
  if (branch.isMain) {
    res.status(409).json({ error: 'The main campus cannot be deleted. Choose another main campus first.' });
    return;
  }

  const [classes, students, users] = await Promise.all([
    db.queryPage('classes', { school_id: school.id, branch_id: branch.id }, 1, 1, undefined, 'id'),
    db.queryPage('students', { school_id: school.id, branch_id: branch.id }, 1, 1, undefined, 'id'),
    db.queryPage('users', { school_id: school.id, branch_id: branch.id }, 1, 1, undefined, 'id')
  ]);
  const linkedRecords = classes.total + students.total + users.total;
  if (linkedRecords > 0) {
    res.status(409).json({ error: 'Move this branch\'s classes, students, and staff to another campus before deleting it.' });
    return;
  }

  if (!db.deleteBranch(school.id, branch.id)) {
    res.status(404).json({ error: 'Campus branch was not found in this school.' });
    return;
  }
  db.logAudit({
    action: 'BRANCH_DELETED',
    category: 'school',
    schoolId: school.id,
    schoolName: school.name,
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    details: `Deleted empty campus branch ${branch.name}.`,
    severity: 'warning'
  });
  res.json({ success: true });
});

apiRouter.get('/classes/import/template', requireAuth, requireSchoolAdminOrSuperAdmin, requireSchoolContext, (_req, res) => {
  const csv = [
    'className,gradeLevel,section,branch,roomNumber,capacity,monthlyFee',
    'KG,KG,A,,KG Room,40,0',
    'Grade 1,1,A,,Room 101,40,0',
    'Grade 1,1,B,,Room 102,40,0'
  ].join('\r\n');
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="schoolos-class-import-template.csv"' }).send(csv);
});

apiRouter.post('/classes/bulk-import', requireAuth, requireSchoolAdminOrSuperAdmin, requireSchoolContext, async (req, res) => {
  const school = (req as any).school as School;
  const user = (req as any).user as User;
  const input = req.body?.classes;
  if (!Array.isArray(input) || input.length < 1 || input.length > 500) {
    res.status(400).json({ error: 'Upload between 1 and 500 class rows.' }); return;
  }
  const [existing, branches] = await Promise.all([db.getClasses(school.id), db.getBranches(school.id)]);
  const allowedLevels = new Set([0, ...((school.classLevels?.length ? school.classLevels : [1,2,3,4,5,6,7,8,9,10,11,12]).filter(level => level !== 0))]);
  const branchByName = new Map(branches.map(branch => [branch.name.trim().toLowerCase(), branch]));
  const seen = new Set(existing.map(item => `${item.name.trim().toLowerCase()}\\u0000${item.section.trim().toLowerCase()}`));
  const records: any[] = [];
  const errors: string[] = [];
  input.forEach((row: any, index: number) => {
    const name = typeof row?.className === 'string' ? row.className.trim() : '';
    const section = typeof row?.section === 'string' ? row.section.trim() : '';
    const gradeText = String(row?.gradeLevel ?? '').trim();
    const grade = /^(KG|KINDERGARTEN|NURSERY)$/i.test(gradeText) ? 0 : Number(gradeText);
    const capacity = Number(row?.capacity || 40);
    const monthlyFee = Number(row?.monthlyFee || 0);
    const branchName = typeof row?.branch === 'string' ? row.branch.trim() : '';
    const branch = branchName ? branchByName.get(branchName.toLowerCase()) : undefined;
    const key = `${name.toLowerCase()}\\u0000${section.toLowerCase()}`;
    if (!name || !section) errors.push(`Row ${index + 2}: className and section are required.`);
    else if (seen.has(key)) errors.push(`Row ${index + 2}: duplicate class ${name} / ${section}.`);
    else if (!Number.isInteger(grade) || !allowedLevels.has(grade)) errors.push(`Row ${index + 2}: gradeLevel must be KG or an offered grade from 1 to 12.`);
    else if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) errors.push(`Row ${index + 2}: capacity must be between 1 and 500.`);
    else if (!Number.isFinite(monthlyFee) || monthlyFee < 0) errors.push(`Row ${index + 2}: monthlyFee must be zero or greater.`);
    else if (branchName && !branch) errors.push(`Row ${index + 2}: unknown branch "${branchName}".`);
    else {
      seen.add(key);
      records.push({
        id: `cls-${randomUUID()}`, schoolId: school.id, branchId: branch?.id,
        name, gradeLevel: grade, section, roomNumber: String(row?.roomNumber || '').trim(),
        capacity, monthlyFee
      });
    }
  });
  if (errors.length) { res.status(400).json({ error: errors.slice(0, 20).join(' '), errors }); return; }
  const auditId = `log-${randomUUID()}`;
  try {
    await db.bulkImportStudents({
      classes: records.map(item => ({
        id: item.id, school_id: school.id, branch_id: item.branchId, name: item.name,
        grade_level: item.gradeLevel, section: item.section, room_number: item.roomNumber,
        capacity: item.capacity, monthly_fee: item.monthlyFee
      })),
      audit_logs: [{
        id: auditId, action: 'SCHOOL_BULK_CLASS_IMPORT', category: 'school',
        school_id: school.id, school_name: school.name, user_id: user.id,
        user_name: user.fullName, user_role: user.role,
        details: `Bulk class import created ${records.length} classes.`
      }]
    });
  } catch {
    res.status(500).json({ error: 'Class import failed. No classes were written; please retry.' }); return;
  }
  res.json({ success: true, count: records.length });
});

apiRouter.get('/classes', requireAuth, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const branchId = req.query.branchId as string;
  const archived = req.query.archived === 'true';
  await sendDatabasePage(req, res, 'classes', { school_id: school.id, branch_id: branchId, is_archived: archived ? 'true' : undefined }, archived ? undefined : 'is_archived.eq.false,is_archived.is.null');
});

apiRouter.get('/classes/:id/details', requireAuth, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const role = normalizeRole((req as any).user.role);
  if (!['school_admin', 'super_admin', 'teacher'].includes(role || '')) { res.status(403).json({ error: 'This role cannot view class details.' }); return; }
  if (role === 'teacher' && !((req as any).user.assignedClassIds || []).includes(String(req.params.id))) { res.status(403).json({ error: 'Teacher class scope does not include this class.' }); return; }
  const klass = await db.getClassById(req.params.id, school.id);
  if (!klass || klass.isArchived) { res.status(404).json({ error: 'Class was not found.' }); return; }
  const search = String(req.query.search || '').trim().replace(/[,.()]/g, ' ').slice(0, 60);
  const orFilter = search ? `first_name.ilike.%${search}%,middle_name.ilike.%${search}%,last_name.ilike.%${search}%` : undefined;
  const [students, assignments, timetable, attendance] = await Promise.all([
    db.queryPage('students', { school_id: school.id, class_id: klass.id }, Number(req.query.page) || 1, Number(req.query.pageSize) || 20, orFilter, LIST_QUERY_COLUMNS.students),
    db.queryPage('class_subjects', { school_id: school.id, class_id: klass.id, is_active: 'true' }, 1, 100, undefined, LIST_QUERY_COLUMNS.class_subjects),
    db.queryPage('timetable_slots', { school_id: school.id, class_id: klass.id, is_active: 'true' }, 1, 100, undefined, 'id,school_id,class_id,day_of_week,period_number,start_time,end_time,subject_id,teacher_id,room_number,is_active'),
    db.queryPage('attendance_records', { school_id: school.id, class_id: klass.id, date: new Date().toISOString().slice(0, 10) }, 1, 1, undefined, 'id')
  ]);
  const subjectIds = [...new Set(assignments.items.map((item: any) => item.subjectId))];
  const teacherIds = [...new Set(assignments.items.map((item: any) => item.teacherId).filter(Boolean))];
  const [subjectRows, teacherRows] = await Promise.all([
    subjectIds.length ? db.queryPage('subjects', { school_id: school.id, id: subjectIds }, 1, 100, undefined, LIST_QUERY_COLUMNS.subjects) : Promise.resolve({ items: [] as any[] }),
    teacherIds.length ? db.queryPage('teachers', { school_id: school.id, id: teacherIds }, 1, 100, undefined, LIST_QUERY_COLUMNS.teachers) : Promise.resolve({ items: [] as any[] })
  ]);
  const subjectById = new Map(subjectRows.items.map((item: any) => [item.id, item]));
  const teacherById = new Map(teacherRows.items.map((item: any) => [item.id, item]));
  const classSubjects = assignments.items.map((assignment: any) => ({ ...assignment, subject: subjectById.get(assignment.subjectId) || null, teacher: teacherById.has(assignment.teacherId) ? { id: (teacherById.get(assignment.teacherId) as any).id, fullName: (teacherById.get(assignment.teacherId) as any).fullName } : null }));
  res.json({ class: klass, students: { items: students.items, page: students.page, pageSize: students.pageSize, total: students.total }, subjects: classSubjects, timetable: timetable.items, attendance: { date: new Date().toISOString().slice(0, 10), recordedStudents: attendance.total } });
});

apiRouter.get('/school/dashboard', requireAuth, requireSchoolContext, async (req, res) => {
  const user = (req as any).user as User;
  const role = normalizeRole(user.role);
  if (!['school_admin', 'accountant', 'super_admin', 'teacher'].includes(role || '')) {
    res.status(403).json({ error: 'This role cannot view the school dashboard.' });
    return;
  }
  try {
    const summary = await db.getSchoolDashboardSummary((req as any).school.id);
    if (role === 'accountant' || role === 'super_admin') {
      res.json(summary);
      return;
    }

    // School admins and teachers may see academic dashboard data, never finance data.
    const redactFinance = (value: any): any => {
      if (Array.isArray(value)) return value.map(redactFinance);
      if (!value || typeof value !== 'object') return value;
      const safe: Record<string, any> = {};
      for (const [key, child] of Object.entries(value)) {
        if (/(payment|collection|outstanding|arrear|revenue|income|fee|receivable|dueamount)/i.test(key)) continue;
        safe[key] = redactFinance(child);
      }
      return safe;
    };
    res.json(redactFinance(summary));
  }
  catch { res.status(503).json({ error: 'Unable to load the school dashboard.' }); }
});

apiRouter.get('/school/reports/summary', requireAuth, requireSchoolContext, async (req, res) => {
  const user = (req as any).user as User;
  const school = (req as any).school as School;
  if (!['school_admin', 'accountant', 'super_admin'].includes(user.role)) { res.status(403).json({ error: 'This role cannot view school reports.' }); return; }
  try {
    const summary = await db.getSchoolDashboardSummary(school.id);
    const stats = summary?.stats || {};
    const approvedMarks = (await queryAllRows('student_marks', {
      school_id: school.id,
      academic_year: school.academicYear
    }, 'percentage,status')).filter((mark: any) => mark.status === 'approved');
    const examConfig = db.getExamConfig(school.id, school.academicYear);
    const passMark = Number(examConfig.passMarkPercentage) || 50;
    const result: Record<string, unknown> = {
      studentCount: Number(stats.totalStudents) || 0,
      attendanceRate: Number(stats.attendanceRate) || 0,
      passRate: approvedMarks.length
        ? Math.round(approvedMarks.filter((mark: any) => Number(mark.percentage) >= passMark).length * 100 / approvedMarks.length)
        : null
    };
    if (user.role === 'accountant' || user.role === 'super_admin') {
      const allPayments = await db.getFeePayments(school.id);
      const payments = allPayments.filter(payment => !payment.voidedAt);
      // Voided receipts are excluded from every live finance total.
      result.totalDue = payments.reduce((total, payment) => total + Number(payment.amountDue || 0), 0);
      result.totalCollected = payments.reduce((total, payment) => total + Number(payment.amountPaid || 0), 0);
      result.totalArrears = payments.reduce((total, payment) => total + Number(payment.remainingAmount || 0), 0);
      result.paymentCount = payments.length;
      result.recentPayments = payments.slice(-20).reverse();
    }
    res.json(result);
  } catch {
    res.status(503).json({ error: 'Unable to load school reports.' });
  }
});

apiRouter.get('/school/reports/finance/export', requireAuth, requireSchoolContext, async (req, res) => {
  const user = (req as any).user as User;
  const school = (req as any).school as School;
  if (!['accountant', 'super_admin'].includes(user.role)) {
    res.status(403).json({ error: 'This role cannot export the financial ledger.' });
    return;
  }
  try {
    const payments = (await queryAllRows('fee_payments', { school_id: school.id },
      'receipt_number,reference_number,student_id,academic_year,month,fee_type,amount_due,amount_paid,remaining_amount,payment_method,status,date,voided_at'))
      .filter((payment: any) => !payment.voidedAt);
    const cell = (value: unknown) => {
      const raw = String(value ?? '');
      const safe = /^\s*[=+\-@]/.test(raw) ? `'${raw}` : raw;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const rows = [
      ['Receipt Number', 'Reference', 'Student ID', 'Academic Year', 'Month', 'Fee Type', 'Amount Due', 'Amount Paid', 'Remaining Arrears', 'Method', 'Status', 'Date'],
      ...payments.map((payment: any) => [
        payment.receiptNumber, payment.referenceNumber, payment.studentId, payment.academicYear, payment.month,
        payment.feeType, payment.amountDue, payment.amountPaid, payment.remainingAmount, payment.paymentMethod,
        payment.status, payment.date
      ])
    ];
    const csv = rows.map(row => row.map(cell).join(',')).join('\r\n');
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${String(school.code || 'school').replace(/[^A-Za-z0-9_-]/g, '_')}-financial-ledger-${new Date().toISOString().slice(0, 10)}.csv"`
    }).send('\uFEFF' + csv);
  } catch {
    res.status(503).json({ error: 'Unable to export the complete financial ledger.' });
  }
});

apiRouter.post('/classes', requireAuth, requireSchoolAdminOrSuperAdmin, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  if (typeof req.body?.name !== 'string' || !req.body.name.trim() || !Number.isInteger(Number(req.body.gradeLevel)) || Number(req.body.gradeLevel) < 0 || Number(req.body.gradeLevel) > 12 || !Number.isInteger(Number(req.body.capacity)) || Number(req.body.capacity) < 1 || typeof req.body.section !== 'string' || !req.body.section.trim()) { res.status(400).json({ error: 'Class name, grade level (KG-12), section, and positive capacity are required.' }); return; }
  const allowedLevels: number[] = [0, ...((school as School).classLevels?.length ? (school as School).classLevels! : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).filter(level => level !== 0)];
  if (!allowedLevels.includes(Number(req.body.gradeLevel))) { res.status(400).json({ error: `Grade level must be one of this school's offered levels (${allowedLevels.join(', ')}).` }); return; }
  if (req.body?.branchId && !(await db.getBranches(school.id)).some(branch => branch.id === req.body.branchId)) { res.status(400).json({ error: 'Branch does not belong to this school.' }); return; }
  const newClass = db.createClass({ ...req.body, schoolId: school.id });
  res.status(201).json(newClass);
});

apiRouter.put('/classes/:id', requireAuth, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const role = normalizeRole((req as any).user.role);
  if (role !== 'school_admin' && role !== 'super_admin') { res.status(403).json({ error: 'School administrator privilege is required.' }); return; }
  const existing = await db.getClassById(String(req.params.id), school.id);
  if (!existing) { res.status(404).json({ error: 'Class was not found.' }); return; }
  if (req.body?.capacity !== undefined) {
    const enrolled = await db.queryPage('students', { school_id: school.id, class_id: existing.id }, 1, 1, undefined, 'id');
    if (!Number.isInteger(Number(req.body.capacity)) || Number(req.body.capacity) < enrolled.total) { res.status(409).json({ error: `Capacity cannot be lower than the ${enrolled.total} enrolled students.` }); return; }
  }
  if (req.body?.gradeLevel !== undefined) {
    const allowedLevels: number[] = [0, ...((school as School).classLevels?.length ? (school as School).classLevels! : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).filter(level => level !== 0)];
    if (!allowedLevels.includes(Number(req.body.gradeLevel))) { res.status(400).json({ error: `Grade level must be one of this school's offered levels (${allowedLevels.join(', ')}).` }); return; }
  }
  if (req.body?.branchId && !(await db.getBranches(school.id)).some(branch => branch.id === req.body.branchId)) { res.status(400).json({ error: 'Branch does not belong to this school.' }); return; }
  const updated = await db.updateClass(String(req.params.id), req.body, school.id);
  res.json(updated);
});

apiRouter.delete('/classes/:id', requireAuth, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const role = normalizeRole((req as any).user.role);
  if (role !== 'school_admin' && role !== 'super_admin') { res.status(403).json({ error: 'School administrator privilege is required.' }); return; }
  const klass = await db.getClassById(String(req.params.id), school.id);
  if (!klass) { res.status(404).json({ error: 'Class was not found.' }); return; }
  const students = await db.queryPage('students', { school_id: school.id, class_id: klass.id }, 1, 1, undefined, 'id');
  if (students.total) { res.status(409).json({ error: 'Class has students. Move the students before archiving it.' }); return; }
  const archived = await db.updateClass(klass.id, { isArchived: true }, school.id);
  db.logAudit({ action: 'CLASS_ARCHIVED', category: 'school', schoolId: school.id, schoolName: school.name, userId: (req as any).user.id, userName: (req as any).user.fullName, userRole: (req as any).user.role, details: `Archived empty class ${klass.name} (${klass.id}).`, severity: 'warning' });
  res.json({ success: Boolean(archived), class: archived });
});

apiRouter.get('/subjects', requireAuth, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  await sendDatabasePage(req, res, 'subjects', { school_id: school.id });
});

apiRouter.get('/teacher/subject-assignments', requireAuth, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const user = (req as any).user as User;
  if (normalizeRole(user.role) !== 'teacher') { res.status(403).json({ error: 'This route is for teachers only.' }); return; }
  const teacherPage = await db.queryPage('teachers', { school_id: school.id, user_id: user.id }, 1, 1, undefined, 'id');
  if (!teacherPage.items.length) { res.json([]); return; }
  const assignments = await db.queryPage('class_subjects', { school_id: school.id, teacher_id: teacherPage.items[0].id, is_active: 'true' }, 1, 100, undefined, LIST_QUERY_COLUMNS.class_subjects);
  if (!assignments.items.length) { res.json([]); return; }
  const [subjectRows, classRows] = await Promise.all([
    db.queryPage('subjects', { school_id: school.id, id: [...new Set(assignments.items.map((item: any) => item.subjectId))] }, 1, 100, undefined, LIST_QUERY_COLUMNS.subjects),
    db.queryPage('classes', { school_id: school.id, id: [...new Set(assignments.items.map((item: any) => item.classId))] }, 1, 100, undefined, LIST_QUERY_COLUMNS.classes)
  ]);
  const subjectsById = new Map(subjectRows.items.map((item: any) => [item.id, item]));
  const classesById = new Map(classRows.items.map((item: any) => [item.id, item]));
  res.json(assignments.items.flatMap((item: any) => {
    const subject = subjectsById.get(item.subjectId);
    const klass = classesById.get(item.classId);
    return subject && klass ? [{ ...item, subject, class: klass }] : [];
  }));
});

apiRouter.post('/subjects', requireAuth, requireSchoolContext, (req, res) => {
  const school = (req as any).school;
  const role = normalizeRole((req as any).user.role);
  if (role !== 'school_admin' && role !== 'super_admin') { res.status(403).json({ error: 'School administrator privilege is required.' }); return; }
  if (typeof req.body?.name !== 'string' || !req.body.name.trim() || typeof req.body?.code !== 'string' || !req.body.code.trim()) { res.status(400).json({ error: 'Subject name and code are required.' }); return; }
  const subject = db.createSubject({ ...req.body, schoolId: school.id });
  res.status(201).json(subject);
});

apiRouter.put('/subjects/:id', requireAuth, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const role = normalizeRole((req as any).user.role);
  if (role !== 'school_admin' && role !== 'super_admin') { res.status(403).json({ error: 'School administrator privilege is required.' }); return; }
  const subject = (await db.getSubjects(school.id)).find(item => item.id === String(req.params.id));
  if (!subject) { res.status(404).json({ error: 'Subject was not found.' }); return; }
  if ((req.body?.name !== undefined && !String(req.body.name).trim()) || (req.body?.code !== undefined && !String(req.body.code).trim())) { res.status(400).json({ error: 'Subject name and code cannot be empty.' }); return; }
  const updated = db.updateSubject(subject.id, { ...req.body, id: subject.id, schoolId: school.id });
  res.json(updated);
});

apiRouter.delete('/subjects/:id', requireAuth, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const role = normalizeRole((req as any).user.role);
  if (role !== 'school_admin' && role !== 'super_admin') { res.status(403).json({ error: 'School administrator privilege is required.' }); return; }
  const subject = (await db.getSubjects(school.id)).find(item => item.id === String(req.params.id));
  if (!subject) { res.status(404).json({ error: 'Subject was not found.' }); return; }
  const uses = await db.queryPage('timetable_slots', { school_id: school.id, subject_id: subject.id, is_active: 'true' }, 1, 1, undefined, 'id');
  if (uses.total) { res.status(409).json({ error: 'Subject is used in the timetable. Remove its timetable periods before deleting it.' }); return; }
  const assignments = await db.queryPage('class_subjects', { school_id: school.id, subject_id: subject.id, is_active: 'true' }, 1, 1, undefined, 'id');
  if (assignments.total) { res.status(409).json({ error: 'Subject is assigned to classes. Remove its class assignments before deleting it.' }); return; }
  db.deleteSubject(subject.id);
  res.json({ success: true });
});

apiRouter.get('/subjects/:id/assignments', requireAuth, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const subject = (await db.getSubjects(school.id)).find(item => item.id === String(req.params.id));
  if (!subject) { res.status(404).json({ error: 'Subject was not found.' }); return; }
  const assignments = await db.queryPage('class_subjects', { school_id: school.id, subject_id: subject.id, is_active: 'true' }, 1, 100, undefined, LIST_QUERY_COLUMNS.class_subjects);
  res.json(assignments.items);
});

apiRouter.put('/subjects/:id/assignments', requireAuth, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const user = (req as any).user;
  const role = normalizeRole(user.role);
  if (role !== 'school_admin' && role !== 'super_admin') { res.status(403).json({ error: 'School administrator privilege is required.' }); return; }
  const subject = (await db.getSubjects(school.id)).find(item => item.id === String(req.params.id));
  if (!subject) { res.status(404).json({ error: 'Subject was not found.' }); return; }
  const inputs = req.body?.assignments;
  if (!Array.isArray(inputs) || inputs.length > 500) { res.status(400).json({ error: 'Assignments must be a list of at most 500 classes.' }); return; }
  const normalized = inputs.map((item: any) => ({ classId: String(item?.classId || ''), teacherId: item?.teacherId ? String(item.teacherId) : undefined, periodsPerWeek: Number(item?.periodsPerWeek), smallExamEnabled: item?.smallExamEnabled === true, bigExamEnabled: item?.bigExamEnabled === true }));
  const classIds = normalized.map((item: any) => item.classId);
  const teacherIds = normalized.map((item: any) => item.teacherId).filter(Boolean);
  if (new Set(classIds).size !== classIds.length || normalized.some((item: any) => !item.classId || !Number.isInteger(item.periodsPerWeek) || item.periodsPerWeek < 1 || item.periodsPerWeek > 30)) { res.status(400).json({ error: 'Each class must be unique and periods per week must be between 1 and 30.' }); return; }
  const [classes, teachers] = await Promise.all([
    classIds.length ? db.queryPage('classes', { school_id: school.id, id: classIds }, 1, 500, undefined, 'id,is_archived') : Promise.resolve({ items: [] as any[], total: 0 }),
    teacherIds.length ? db.queryPage('teachers', { school_id: school.id, id: teacherIds }, 1, 500, undefined, 'id') : Promise.resolve({ items: [] as any[], total: 0 })
  ]);
  if (classes.items.length !== classIds.length || classes.items.some((item: any) => item.isArchived)) { res.status(400).json({ error: 'One or more classes are unavailable in this school.' }); return; }
  if (teachers.items.length !== new Set(teacherIds).size) { res.status(400).json({ error: 'One or more teachers do not belong to this school.' }); return; }
  try {
    await db.saveSubjectAssignments(school.id, subject.id, normalized);
  } catch { res.status(503).json({ error: 'Unable to save subject assignments. No assignment changes were applied.' }); return; }
  db.logAudit({ action: 'SUBJECT_CLASS_ASSIGNMENTS_SAVED', category: 'school', schoolId: school.id, schoolName: school.name, userId: user.id, userName: user.fullName, userRole: user.role, details: `Saved ${normalized.length} class assignment(s) for subject ${subject.name}.`, severity: 'info' });
  res.json({ success: true, count: normalized.length });
});

const TIMETABLE_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;
async function nextSchoolStaffId(school: School): Promise<string> {
  const users = await queryAllRows('users', { school_id: school.id }, 'id,staff_id');
  const used = new Set(users.map((user: any) => String(user.staffId || '').toUpperCase()).filter(Boolean));
  const schoolTag = String(school.code || 'SCHOOL').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15) || 'SCHOOL';
  let sequence = users.length + 1;
  let id = '';
  do { id = `STF-${schoolTag}-${String(sequence++).padStart(4, '0')}`; } while (used.has(id));
  return id;
}
const timetableMinutes = (value: string) => { const [hours, minutes] = value.split(':').map(Number); return hours * 60 + minutes; };
const timetableClock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
async function getStudentFeeStatusMap(schoolId: string, studentIds?: string[], academicYear?: string): Promise<Map<string, 'paid' | 'partial' | 'unpaid'>> {
  const statuses = new Map<string, 'paid' | 'partial' | 'unpaid'>();
  if (studentIds && studentIds.length === 0) return statuses;
  const payments = await queryAllRows('fee_payments', {
    school_id: schoolId,
    student_id: studentIds
  }, 'student_id,amount_due,amount_paid,remaining_amount,voided_at,academic_year');
  const totals = new Map<string, { due: number; paid: number; remaining: number }>();
  for (const payment of payments) {
    if (payment.voidedAt || (academicYear && payment.academicYear !== academicYear)) continue;
    const current = totals.get(payment.studentId) || { due: 0, paid: 0, remaining: 0 };
    current.due += Number(payment.amountDue) || 0;
    current.paid += Number(payment.amountPaid) || 0;
    current.remaining += Number(payment.remainingAmount) || 0;
    totals.set(payment.studentId, current);
  }
  for (const [studentId, total] of totals) {
    statuses.set(studentId, total.due > 0 && total.remaining <= 0 ? 'paid' : total.paid > 0 ? 'partial' : 'unpaid');
  }
  return statuses;
}

async function queryAllRows(table: string, filters: Record<string, string | string[] | undefined>, columns: string) {
  const rows: any[] = [];
  for (let page = 1;; page += 1) {
    const result = await db.queryPage(table, filters, page, 100, undefined, columns);
    rows.push(...result.items);
    if (rows.length >= result.total || result.items.length === 0) break;
  }
  return rows;
}
const getTimetablePeriodTimes = (settings: any, period: number) => {
  const start = timetableMinutes(settings.firstPeriodStart || '08:00') + (period - 1) * Number(settings.periodMinutes || 40) + (period > Number(settings.breakAfterPeriod || 3) ? Number(settings.breakMinutes ?? 20) : 0);
  return { startTime: timetableClock(start), endTime: timetableClock(start + Number(settings.periodMinutes || 40)) };
};
const isSchoolAdmin = (user: User) => ['school_admin', 'super_admin'].includes(normalizeRole(user.role) || '');
const decorateTimetableSlots = async (schoolId: string, slots: any[]) => {
  if (!slots.length) return slots;
  const [subjects, teachers, classes] = await Promise.all([
    queryAllRows('subjects', { school_id: schoolId, id: [...new Set(slots.map(slot => slot.subjectId))] }, 'id,name'),
    queryAllRows('teachers', { school_id: schoolId, id: [...new Set(slots.map(slot => slot.teacherId))] }, 'id,full_name'),
    queryAllRows('classes', { school_id: schoolId, id: [...new Set(slots.map(slot => slot.classId))] }, 'id,name')
  ]);
  const subjectNames = new Map(subjects.map((item: any) => [item.id, item.name]));
  const teacherNames = new Map(teachers.map((item: any) => [item.id, item.fullName]));
  const classNames = new Map(classes.map((item: any) => [item.id, item.name]));
  return slots.map(slot => ({ ...slot, subjectName: subjectNames.get(slot.subjectId) || slot.subjectId, teacherName: teacherNames.get(slot.teacherId) || '', className: classNames.get(slot.classId) || '' }));
};

apiRouter.get('/timetable', requireAuth, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const user = (req as any).user as User;
  const role = normalizeRole(user.role);
  let classId = String(req.query.classId || '');
  let teacherId = String(req.query.teacherId || '');
  if (role === 'teacher') {
    const own = await db.queryPage('teachers', { school_id: school.id, user_id: user.id }, 1, 1, undefined, 'id');
    if (!own.items.length) { res.json([]); return; }
    teacherId = String(own.items[0].id);
  } else if (role === 'parent' || role === 'student') {
    let studentIds = role === 'parent' ? user.linkedStudentIds || [] : [];
    if (role === 'student') {
      const own = await db.queryPage('students', { school_id: school.id, student_id: user.studentId || '' }, 1, 1, undefined, 'id,class_id');
      studentIds = own.items.map((item: any) => item.id);
    } else if (role === 'parent' && user.phone) {
      const phoneChildren = await db.queryPage('students', { school_id: school.id }, 1, 100, `father_phone.eq.${user.phone},mother_phone.eq.${user.phone}`, 'id');
      studentIds = [...new Set([...studentIds, ...phoneChildren.items.map((item: any) => item.id)])];
    }
    const children = studentIds.length ? await db.queryPage('students', { school_id: school.id, id: studentIds }, 1, 100, undefined, 'id,class_id') : { items: [] as any[] };
    const classIds = [...new Set(children.items.map((item: any) => item.classId))];
    if (classId && !classIds.includes(classId)) { res.status(403).json({ error: 'Timetable access is limited to your own class.' }); return; }
    if (!classIds.length) { res.json([]); return; }
    const slots = await queryAllRows('timetable_slots', { school_id: school.id, class_id: classId || classIds, is_active: 'true' }, 'id,school_id,class_id,day_of_week,period_number,start_time,end_time,subject_id,teacher_id,room_number,is_active');
    res.json(await decorateTimetableSlots(school.id, slots.filter((slot: any) => !req.query.dayOfWeek || slot.dayOfWeek === req.query.dayOfWeek))); return;
  } else if (!isSchoolAdmin(user)) { res.status(403).json({ error: 'This role cannot view timetables.' }); return; }
  const slots = await queryAllRows('timetable_slots', { school_id: school.id, class_id: classId || undefined, teacher_id: teacherId || undefined, day_of_week: req.query.dayOfWeek ? String(req.query.dayOfWeek) : undefined, is_active: 'true' }, 'id,school_id,class_id,day_of_week,period_number,start_time,end_time,subject_id,teacher_id,room_number,is_active');
  res.json(await decorateTimetableSlots(school.id, slots));
});

async function canManageAssignment(schoolId: string, user: User, assignment: any): Promise<boolean> {
  const role = normalizeRole(user.role);
  if (role === 'school_admin' || role === 'super_admin') return true;
  if (role !== 'teacher') return false;
  if (assignment.teacherId === user.id) return true;
  const own = await db.queryPage('teachers', { school_id: schoolId, user_id: user.id }, 1, 1, undefined, 'id');
  if (!own.items.length) return false;
  const assigned = await db.queryPage('class_subjects', {
    school_id: schoolId,
    class_id: assignment.classId,
    subject_id: assignment.subjectId,
    teacher_id: own.items[0].id,
    is_active: 'true'
  }, 1, 1, undefined, 'id');
  return Boolean(assigned.total);
}

apiRouter.get('/assignments', requireAuth, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const user = (req as any).user as User;
  const role = normalizeRole(user.role);
  let classIds: string[] | null = null;
  let studentIds: string[] | null = null;

  if (role === 'teacher') {
    const own = await db.queryPage('teachers', { school_id: school.id, user_id: user.id }, 1, 1, undefined, 'id,assigned_classes');
    classIds = [...new Set([...(user.assignedClassIds || []), ...((own.items[0] as any)?.assignedClasses || [])])];
  } else if (role === 'parent' || role === 'student') {
    studentIds = role === 'parent' ? user.linkedStudentIds || [] : [];
    if (role === 'student') {
      const own = await db.queryPage('students', { school_id: school.id, student_id: user.studentId || '' }, 1, 1, undefined, 'id,class_id');
      studentIds = own.items.map((item: any) => item.id);
    } else if (user.phone) {
      const phoneChildren = await db.queryPage('students', { school_id: school.id }, 1, 100, `father_phone.eq.${user.phone},mother_phone.eq.${user.phone}`, 'id,class_id');
      studentIds = [...new Set([...studentIds, ...phoneChildren.items.map((item: any) => item.id)])];
    }
    const children = studentIds.length ? await db.queryPage('students', { school_id: school.id, id: studentIds }, 1, 100, undefined, 'id,class_id') : { items: [] as any[] };
    classIds = [...new Set(children.items.map((item: any) => item.classId))];
  }

  if (classIds && !classIds.length) { res.json([]); return; }
  const assignments = await db.queryPage('assignments', { school_id: school.id, class_id: classIds || undefined }, 1, 100, undefined, '*');
  const submissions = studentIds?.length
    ? await db.queryPage('assignment_submissions', { school_id: school.id, student_id: studentIds }, 1, 100, undefined, '*')
    : { items: [] as any[] };
  const submissionByAssignment = new Map<string, any>();
  for (const submission of [...submissions.items].sort((a: any, b: any) => String(b.submittedAt).localeCompare(String(a.submittedAt)))) {
    if (!submissionByAssignment.has(submission.assignmentId)) submissionByAssignment.set(submission.assignmentId, submission);
  }
  const subjectIds = [...new Set(assignments.items.map((item: any) => item.subjectId))];
  const subjects = subjectIds.length
    ? await db.queryPage('subjects', { school_id: school.id, id: subjectIds }, 1, 100, undefined, 'id,name,code')
    : { items: [] as any[] };
  const subjectNames = new Map(subjects.items.map((item: any) => [item.id, item.name]));
  res.json(assignments.items
    .map((item: any) => ({
      ...item,
      subjectName: subjectNames.get(item.subjectId) || item.subjectId,
      ...(submissionByAssignment.has(item.id) ? { submission: submissionByAssignment.get(item.id) } : {})
    }))
    .sort((a: any, b: any) => String(a.dueDate).localeCompare(String(b.dueDate))));
});

apiRouter.post('/assignments', requireAuth, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const user = (req as any).user as User;
  const role = normalizeRole(user.role);
  if (role !== 'teacher' && role !== 'school_admin' && role !== 'super_admin') { res.status(403).json({ error: 'Teacher or administrator access is required.' }); return; }
  const classId = String(req.body?.classId || '');
  const subjectId = String(req.body?.subjectId || '');
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
  const dueDate = String(req.body?.dueDate || '');
  const maxPoints = Number(req.body?.maxPoints || 100);
  if (!classId || !subjectId || !title || !description) { res.status(400).json({ error: 'Class, subject, title, and description are required.' }); return; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || Number.isNaN(Date.parse(dueDate))) { res.status(400).json({ error: 'Due date must be a valid date.' }); return; }
  if (!Number.isInteger(maxPoints) || maxPoints < 1 || maxPoints > 1000) { res.status(400).json({ error: 'Maximum points must be a whole number between 1 and 1000.' }); return; }
  const [classRows, subjectRows] = await Promise.all([
    db.queryPage('classes', { school_id: school.id, id: classId }, 1, 1, undefined, 'id,is_archived'),
    db.queryPage('subjects', { school_id: school.id, id: subjectId }, 1, 1, undefined, 'id,name')
  ]);
  if (!classRows.items.length || (classRows.items[0] as any).isArchived) { res.status(404).json({ error: 'Class was not found.' }); return; }
  if (!subjectRows.items.length) { res.status(404).json({ error: 'Subject was not found.' }); return; }
  if (role === 'teacher') {
    const teacherPage = await db.queryPage('teachers', { school_id: school.id, user_id: user.id }, 1, 1, undefined, 'id');
    if (!teacherPage.items.length) { res.status(403).json({ error: 'Your teacher profile is not linked to this school.' }); return; }
    const assigned = await db.queryPage('class_subjects', { school_id: school.id, class_id: classId, subject_id: subjectId, teacher_id: teacherPage.items[0].id, is_active: 'true' }, 1, 1, undefined, 'id');
    if (!assigned.total) { res.status(403).json({ error: 'You can only assign homework to your own class and subject.' }); return; }
  }
  const assignment = db.createAssignment({
    schoolId: school.id, classId, subjectId, teacherId: user.id, title, description, dueDate, maxPoints
  });
  db.logAudit({ action: 'ASSIGNMENT_CREATED', category: 'school', schoolId: school.id, schoolName: school.name, userId: user.id, userName: user.fullName, userRole: user.role, details: `Created homework "${title}" for class ${classId}.`, severity: 'info' });
  res.status(201).json({ ...assignment, subjectName: (subjectRows.items[0] as any).name });
});

apiRouter.get('/assignments/:id/submissions', requireAuth, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const user = (req as any).user as User;
  const assignment = (await db.queryPage('assignments', { school_id: school.id, id: req.params.id }, 1, 1, undefined, '*')).items[0];
  if (!assignment) { res.status(404).json({ error: 'Homework was not found.' }); return; }
  if (!(await canManageAssignment(school.id, user, assignment))) { res.status(403).json({ error: 'Teacher or administrator access is required.' }); return; }
  const submissions = await db.queryPage('assignment_submissions', { school_id: school.id, assignment_id: assignment.id }, 1, 100, undefined, '*');
  res.json(submissions.items.sort((a: any, b: any) => String(b.submittedAt).localeCompare(String(a.submittedAt))));
});

apiRouter.post('/assignments/:id/submissions', requireAuth, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const user = (req as any).user as User;
  if (normalizeRole(user.role) !== 'student') { res.status(403).json({ error: 'Only students can submit homework.' }); return; }
  const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
  if (!content) { res.status(400).json({ error: 'Submission content is required.' }); return; }
  if (content.length > 5000) { res.status(400).json({ error: 'Submission content must be 5000 characters or fewer.' }); return; }
  const assignment = (await db.queryPage('assignments', { school_id: school.id, id: req.params.id }, 1, 1, undefined, '*')).items[0];
  if (!assignment) { res.status(404).json({ error: 'Homework was not found.' }); return; }
  const student = (await db.queryPage('students', { school_id: school.id, student_id: user.studentId || '' }, 1, 1, undefined, 'id,school_id,student_id,first_name,middle_name,last_name,class_id')).items[0];
  if (!student) { res.status(403).json({ error: 'Your student record is not linked to this school.' }); return; }
  if (student.classId !== assignment.classId) { res.status(403).json({ error: 'You can only submit homework assigned to your class.' }); return; }
  const existing = await db.queryPage('assignment_submissions', { school_id: school.id, assignment_id: assignment.id, student_id: student.id }, 1, 1, undefined, '*');
  if (existing.items[0]?.status === 'graded') { res.status(409).json({ error: 'This submission has already been graded and cannot be changed.' }); return; }
  const studentName = [student.firstName, student.middleName, student.lastName].filter(Boolean).join(' ');
  const submission = await db.saveAssignmentSubmission({
    schoolId: school.id,
    assignmentId: assignment.id,
    studentId: student.id,
    studentName,
    content
  });
  db.logAudit({ action: 'ASSIGNMENT_SUBMITTED', category: 'school', schoolId: school.id, schoolName: school.name, userId: user.id, userName: user.fullName, userRole: user.role, details: `Submitted homework "${assignment.title}".`, severity: 'info' });
  res.status(existing.total ? 200 : 201).json(submission);
});

apiRouter.put('/assignments/:id/submissions/:submissionId/grade', requireAuth, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const user = (req as any).user as User;
  const assignment = (await db.queryPage('assignments', { school_id: school.id, id: req.params.id }, 1, 1, undefined, '*')).items[0];
  if (!assignment) { res.status(404).json({ error: 'Homework was not found.' }); return; }
  if (!(await canManageAssignment(school.id, user, assignment))) { res.status(403).json({ error: 'Teacher or administrator access is required.' }); return; }
  const grade = Number(req.body?.grade);
  const feedback = typeof req.body?.feedback === 'string' ? req.body.feedback.trim() : '';
  if (!Number.isFinite(grade) || grade < 0 || grade > Number(assignment.maxPoints)) { res.status(400).json({ error: `Grade must be between 0 and ${assignment.maxPoints}.` }); return; }
  if (feedback.length > 2000) { res.status(400).json({ error: 'Feedback must be 2000 characters or fewer.' }); return; }
  const submission = await db.gradeAssignmentSubmission(school.id, assignment.id, req.params.submissionId, grade, feedback);
  if (!submission) { res.status(404).json({ error: 'Submission was not found.' }); return; }
  db.logAudit({ action: 'ASSIGNMENT_GRADED', category: 'school', schoolId: school.id, schoolName: school.name, userId: user.id, userName: user.fullName, userRole: user.role, details: `Graded homework "${assignment.title}" for ${submission.studentName}.`, severity: 'info' });
  res.json(submission);
});

apiRouter.get('/timetable/settings', requireAuth, requireSchoolContext, async (req, res) => {
  res.json(await db.getTimetableSettings((req as any).school.id));
});

apiRouter.put('/timetable/settings', requireAuth, requireSchoolAdminOrSuperAdmin, requireSchoolContext, async (req, res) => {
  const school = (req as any).school as School;
  const user = (req as any).user as User;
  let settings;
  try {
    settings = sanitizeTimetableSettings(req.body);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Timetable settings are invalid.' });
    return;
  }
  const saved = await db.saveTimetableSettings(school.id, settings);
  db.logAudit({
    action: 'TIMETABLE_SETTINGS_UPDATED',
    category: 'school',
    schoolId: school.id,
    schoolName: school.name,
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    details: 'Updated timetable start time, period length, and break configuration.',
    severity: 'info'
  });
  res.json(saved);
});

apiRouter.get('/timetable/unavailability', requireAuth, requireSchoolAdminOrSuperAdmin, requireSchoolContext, async (req, res) => {
  const result = await db.queryPage('teacher_unavailability', { school_id: (req as any).school.id, teacher_id: req.query.teacherId ? String(req.query.teacherId) : undefined }, 1, 100, undefined, 'id,school_id,teacher_id,day_of_week,period_number');
  res.json(result.items);
});

apiRouter.put('/timetable/unavailability', requireAuth, requireSchoolAdminOrSuperAdmin, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const teacherId = String(req.body?.teacherId || '');
  const dayOfWeek = String(req.body?.dayOfWeek || '');
  const periodNumber = Number(req.body?.periodNumber);
  if (!TIMETABLE_DAYS.includes(dayOfWeek as any) || !Number.isInteger(periodNumber) || periodNumber < 1 || periodNumber > 6 || !(await db.queryPage('teachers', { school_id: school.id, id: teacherId }, 1, 1, undefined, 'id')).total) { res.status(400).json({ error: 'Choose a teacher in this school, a weekday, and a period from 1 to 6.' }); return; }
  await db.setTeacherUnavailability(school.id, teacherId, dayOfWeek, periodNumber, req.body?.unavailable === true);
  res.json({ success: true });
});

apiRouter.post('/timetable', requireAuth, requireSchoolAdminOrSuperAdmin, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const { classId, dayOfWeek, periodNumber, subjectId, teacherId, roomNumber } = req.body || {};
  const period = Number(periodNumber);
  if (!TIMETABLE_DAYS.includes(dayOfWeek) || !Number.isInteger(period) || period < 1 || period > (dayOfWeek === 'Friday' ? 5 : 6)) { res.status(400).json({ error: 'Choose Monday–Friday and a valid period (Friday has five periods).' }); return; }
  const [klass, subject, teacher, assignment, settings, existing, unavailable] = await Promise.all([
    db.getClassById(String(classId || ''), school.id),
    db.queryPage('subjects', { school_id: school.id, id: String(subjectId || '') }, 1, 1, undefined, 'id'),
    db.queryPage('teachers', { school_id: school.id, id: String(teacherId || '') }, 1, 1, undefined, 'id'),
    db.queryPage('class_subjects', { school_id: school.id, class_id: String(classId || ''), subject_id: String(subjectId || ''), teacher_id: String(teacherId || ''), is_active: 'true' }, 1, 1, undefined, 'id'),
    db.getTimetableSettings(school.id),
    db.queryPage('timetable_slots', { school_id: school.id, day_of_week: dayOfWeek, period_number: String(period), is_active: 'true' }, 1, 100, undefined, 'id,school_id,class_id,day_of_week,period_number,start_time,end_time,subject_id,teacher_id,room_number,is_active'),
    db.queryPage('teacher_unavailability', { school_id: school.id, teacher_id: String(teacherId || ''), day_of_week: dayOfWeek, period_number: String(period) }, 1, 1, undefined, 'id')
  ]);
  if (!klass || klass.isArchived || !subject.total || !teacher.total || !assignment.total) { res.status(400).json({ error: 'Class, subject, and teacher must belong to this school and match an active subject assignment.' }); return; }
  if (unavailable.total) { res.status(409).json({ error: 'This teacher is unavailable for that period.' }); return; }
  if (existing.items.some((slot: any) => slot.classId !== classId && slot.teacherId === teacherId)) { res.status(409).json({ error: 'Teacher is already assigned to another class in that period.' }); return; }
  const effectiveRoomNumber = String(roomNumber || klass.roomNumber || '').trim();
  if (effectiveRoomNumber && existing.items.some((slot: any) => slot.classId !== classId && String(slot.roomNumber || '').trim().toLowerCase() === effectiveRoomNumber.toLowerCase())) { res.status(409).json({ error: 'This classroom is already occupied in that period.' }); return; }
  const current = await db.queryPage('timetable_slots', { school_id: school.id, class_id: String(classId), is_active: 'true' }, 1, 100, undefined, 'id,school_id,class_id,day_of_week,period_number,start_time,end_time,subject_id,teacher_id,room_number,is_active');
  const slot: TimetableSlot = { id: `tt-${randomUUID()}`, schoolId: school.id, classId: String(classId), dayOfWeek, periodNumber: period, ...getTimetablePeriodTimes(settings, period), subjectId: String(subjectId), teacherId: String(teacherId), roomNumber: effectiveRoomNumber };
  const slots = [...current.items.filter((item: any) => !(item.dayOfWeek === dayOfWeek && item.periodNumber === period)), slot];
  try { await db.replaceTimetableForClass(school.id, String(classId), slots); }
  catch (error: any) { const message = error?.message || 'Unable to save this timetable period.'; res.status(message.toLowerCase().includes('conflict') ? 409 : 503).json({ error: message }); return; }
  res.status(201).json(slot);
});

apiRouter.delete('/timetable/:classId/:dayOfWeek/:periodNumber', requireAuth, requireSchoolAdminOrSuperAdmin, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const current = await db.queryPage('timetable_slots', { school_id: school.id, class_id: String(req.params.classId), is_active: 'true' }, 1, 100, undefined, 'id,school_id,class_id,day_of_week,period_number,start_time,end_time,subject_id,teacher_id,room_number,is_active');
  const next = current.items.filter((slot: any) => !(slot.dayOfWeek === req.params.dayOfWeek && slot.periodNumber === Number(req.params.periodNumber)));
  try { await db.replaceTimetableForClass(school.id, String(req.params.classId), next); } catch { res.status(503).json({ error: 'Unable to remove this timetable period.' }); return; }
  res.json({ success: true });
});

apiRouter.post('/timetable/swap', requireAuth, requireSchoolAdminOrSuperAdmin, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const firstId = String(req.body?.firstSlotId || '');
  const secondId = String(req.body?.secondSlotId || '');
  if (!firstId || !secondId || firstId === secondId) { res.status(400).json({ error: 'Choose two different timetable periods to swap.' }); return; }
  const slots = await db.queryPage('timetable_slots', { school_id: school.id, id: [firstId, secondId], is_active: 'true' }, 1, 2, undefined, 'id,school_id,class_id,day_of_week,period_number,start_time,end_time,subject_id,teacher_id,room_number,is_active');
  if (slots.items.length !== 2) { res.status(404).json({ error: 'One or both timetable periods were not found in this school.' }); return; }
  try { await db.swapTimetableSlots(school.id, firstId, secondId); }
  catch (error: any) { res.status(409).json({ error: error.message || 'The swap would create a schedule conflict.' }); return; }
  res.json({ success: true });
});

apiRouter.post('/timetable/generate', requireAuth, requireSchoolAdminOrSuperAdmin, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const classId = String(req.body?.classId || '');
  const klass = await db.getClassById(classId, school.id);
  if (!klass || klass.isArchived) { res.status(404).json({ error: 'Class was not found.' }); return; }
  const [assignments, allSlots, unavailable, settings] = await Promise.all([
    db.queryPage('class_subjects', { school_id: school.id, class_id: classId, is_active: 'true' }, 1, 100, undefined, LIST_QUERY_COLUMNS.class_subjects),
    queryAllRows('timetable_slots', { school_id: school.id, is_active: 'true' }, 'id,school_id,class_id,day_of_week,period_number,start_time,end_time,subject_id,teacher_id,room_number,is_active'),
    queryAllRows('teacher_unavailability', { school_id: school.id }, 'id,teacher_id,day_of_week,period_number'),
    db.getTimetableSettings(school.id)
  ]);
  const existing = allSlots.filter((slot: any) => slot.classId !== classId);
  const occupied = new Set(existing.map((slot: any) => `${slot.dayOfWeek}:${slot.periodNumber}:${slot.teacherId}`));
  const occupiedRooms = new Set(existing.filter((slot: any) => klass.roomNumber && String(slot.roomNumber || '').toLowerCase() === String(klass.roomNumber).toLowerCase()).map((slot: any) => `${slot.dayOfWeek}:${slot.periodNumber}`));
  const blocked = new Set(unavailable.map((item: any) => `${item.dayOfWeek}:${item.periodNumber}:${item.teacherId}`));
  const generated: TimetableSlot[] = [];
  const unfilled: Array<{ subjectId: string; teacherId: string; occurrence: number }> = [];
  const load = new Map<string, number>();
  const ordered = assignments.items.filter((item: any) => item.teacherId).sort((a: any, b: any) => b.periodsPerWeek - a.periodsPerWeek);
  for (const assignment of ordered) {
    for (let occurrence = 1; occurrence <= assignment.periodsPerWeek; occurrence += 1) {
      let placed = false;
      const days = [...TIMETABLE_DAYS].sort((a, b) => (load.get(`${assignment.subjectId}:${a}`) || 0) - (load.get(`${assignment.subjectId}:${b}`) || 0));
      for (let period = 1; period <= 6; period += 1) {
        for (const day of days) {
          if (day === 'Friday' && period === 6) continue;
          const key = `${day}:${period}:${assignment.teacherId}`;
          if (occupied.has(key) || blocked.has(key) || occupiedRooms.has(`${day}:${period}`) || generated.some(slot => slot.dayOfWeek === day && slot.periodNumber === period)) continue;
          generated.push({ id: `tt-${randomUUID()}`, schoolId: school.id, classId, dayOfWeek: day, periodNumber: period, ...getTimetablePeriodTimes(settings, period), subjectId: assignment.subjectId, teacherId: assignment.teacherId, roomNumber: klass.roomNumber || '' });
          occupied.add(key); load.set(`${assignment.subjectId}:${day}`, (load.get(`${assignment.subjectId}:${day}`) || 0) + 1); placed = true; break;
        }
        if (placed) break;
      }
      if (!placed) unfilled.push({ subjectId: assignment.subjectId, teacherId: assignment.teacherId, occurrence });
    }
  }
  for (const assignment of assignments.items.filter((item: any) => !item.teacherId)) for (let occurrence = 1; occurrence <= assignment.periodsPerWeek; occurrence += 1) unfilled.push({ subjectId: assignment.subjectId, teacherId: '', occurrence });
  try { await db.replaceTimetableForClass(school.id, classId, generated); }
  catch { res.status(409).json({ error: 'Generated timetable conflicts with an existing teacher assignment. No changes were applied.' }); return; }
  res.json({ slots: generated, unfilled });
});

// ==============================================================================
// 4. STUDENTS & TEACHERS
// ==============================================================================

apiRouter.get('/students', requireAuth, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const user = (req as any).user as User;
  const classId = typeof req.query.classId === 'string' ? req.query.classId : undefined;
  const branchId = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
  const search = typeof req.query.search === 'string'
    ? req.query.search.trim().replace(/[^\p{L}\p{N}\s._-]/gu, '').slice(0, 80)
    : '';
  const requestedFeeStatus = typeof req.query.feeStatus === 'string' ? req.query.feeStatus.toLowerCase() : 'all';
  const canViewFeeStatus = ['school_admin', 'accountant', 'super_admin'].includes(user.role);
  const feeStatus = canViewFeeStatus && ['paid', 'partial', 'unpaid'].includes(requestedFeeStatus) ? requestedFeeStatus : 'all';
  const filters: Record<string, string | string[] | undefined> = { school_id: school.id, class_id: classId, branch_id: branchId };
  let roleFilter: string | undefined;
  if (user.role === 'teacher') {
    const assigned = user.assignedClassIds || [];
    if (classId && !assigned.includes(classId)) { res.status(403).json({ error: 'Student access is limited to your assigned classes.' }); return; }
    filters.class_id = classId || assigned;
  } else if (user.role === 'student') {
    const terms = [user.studentId ? `student_id.eq.${user.studentId}` : '', user.phone ? `student_phone.eq.${user.phone}` : ''].filter(Boolean);
    if (!terms.length) { res.json([]); return; }
    roleFilter = terms.join(',');
  } else if (user.role === 'parent') {
    const ids = (user.linkedStudentIds || []).filter(id => /^[A-Za-z0-9_-]+$/.test(id));
    const terms = [...(ids.length ? [`id.in.(${ids.join(',')})`] : []), ...(user.phone ? [`father_phone.eq.${user.phone}`, `mother_phone.eq.${user.phone}`] : [])];
    if (!terms.length) { res.json([]); return; }
    roleFilter = terms.join(',');
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  const searchFilter = search && !roleFilter
    ? ['student_id', 'first_name', 'middle_name', 'last_name', 'student_phone', 'father_phone', 'mother_phone']
      .map(column => `${column}.ilike.*${search}*`).join(',')
    : undefined;

  if (feeStatus !== 'all') {
    const allStudents = await queryAllRows('students', filters, LIST_QUERY_COLUMNS.students);
    const statusMap = await getStudentFeeStatusMap(school.id, undefined, school.academicYear);
    const filtered = allStudents.filter((student: any) => {
      const matchesSearch = !search || [student.studentId, student.firstName, student.middleName, student.lastName, student.studentPhone, student.fatherPhone, student.motherPhone]
        .some(value => String(value || '').toLowerCase().includes(search.toLowerCase()));
      return matchesSearch && (statusMap.get(student.id) || 'unpaid') === feeStatus;
    });
    const total = filtered.length;
    const items = filtered.slice((page - 1) * pageSize, page * pageSize)
      .map((student: any) => ({ ...student, feeStatus: statusMap.get(student.id) || 'unpaid' }));
    res.set({ 'X-Page': String(page), 'X-Page-Size': String(pageSize), 'X-Total-Count': String(total), 'X-Total-Pages': String(Math.ceil(total / pageSize)) });
    res.json(sanitizeStudents(items));
    return;
  }

  const result = await db.queryPage('students', filters, page, pageSize, roleFilter || searchFilter, LIST_QUERY_COLUMNS.students);
  res.set({ 'X-Page': String(result.page), 'X-Page-Size': String(result.pageSize), 'X-Total-Count': String(result.total), 'X-Total-Pages': String(Math.ceil(result.total / result.pageSize)) });
  const canDecorateFeeStatus = canViewFeeStatus;
  if (!canDecorateFeeStatus) {
    res.json(sanitizeStudents(result.items));
    return;
  }
  const statusMap = await getStudentFeeStatusMap(school.id, result.items.map((student: any) => student.id), school.academicYear);
  res.json(sanitizeStudents(result.items.map((student: any) => ({ ...student, feeStatus: statusMap.get(student.id) || 'unpaid' }))));
});

apiRouter.get('/students/export', requireAuth, requireSchoolAdminOrSuperAdmin, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const classId = typeof req.query.classId === 'string' ? req.query.classId : undefined;
  const branchId = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
  const feeStatus = typeof req.query.feeStatus === 'string' ? req.query.feeStatus : 'all';
  const filters: Record<string, string | string[] | undefined> = {
    school_id: school.id,
    class_id: classId,
    branch_id: branchId
  };
  const [allStudents, classes] = await Promise.all([
    queryAllRows('students', filters, '*'),
    db.getClasses(school.id)
  ]);
  const classNames = new Map(classes.map(item => [item.id, `${item.name}${item.section ? ` - ${item.section}` : ''}`]));
  const filtered = allStudents.filter((student: any) => {
    const studentClass = classNames.get(student.classId) || student.className || '';
    const searchable = [student.studentId, student.firstName, student.middleName, student.lastName, student.fatherPhone, student.motherPhone, studentClass]
      .some(value => String(value || '').toLowerCase().includes(search));
    const matchesFee = feeStatus === 'all' || String(student.feeStatus || '').toLowerCase() === feeStatus.toLowerCase();
    return (!search || searchable) && matchesFee;
  });
  const cell = (value: unknown) => {
    const raw = String(value ?? '');
    const safe = /^\s*[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const rows = [
    ['Student ID', 'First Name', 'Father Name', 'Grandfather Name', 'Gender', 'Class', 'Admission Date', 'Student Phone', 'Father Phone', 'Mother Phone', 'Status', 'Fee Status'],
    ...filtered.map((student: any) => [
      student.studentId, student.firstName, student.middleName, student.lastName, student.gender,
      classNames.get(student.classId) || student.className, student.admissionDate,
      student.studentPhone, student.fatherPhone, student.motherPhone, student.status, student.feeStatus
    ])
  ];
  const csv = rows.map(row => row.map(cell).join(',')).join('\r\n');
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${String(school.code || 'school').replace(/[^A-Za-z0-9_-]/g, '_')}-students-${new Date().toISOString().slice(0, 10)}.csv"`
  }).send('\uFEFF' + csv);
});

apiRouter.get('/students/:id', requireAuth, requireSchoolContext, async (req, res) => {
  const user = (req as any).user as User;
  const studentId = String(req.params.id || '');
  if (!studentId || !await canAccessStudentRecord(user, studentId)) {
    res.status(403).json({ error: 'You do not have access to this student record.' });
    return;
  }
  const student = await db.getStudentById(studentId, (req as any).school.id);
  if (!student) { res.status(404).json({ error: 'Student not found.' }); return; }
  res.json(sanitizeStudent(student));
});

apiRouter.post('/students', requireAuth, requireSchoolContext, requireSchoolAdminOrSuperAdmin, async (req, res) => {
  const school = (req as any).school as School;
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const requiredText = ['firstName', 'middleName', 'lastName', 'classId'] as const;
  if (requiredText.some(field => typeof body[field] !== 'string' || !body[field].trim() || body[field].trim().length > 100)) {
    res.status(400).json({ error: 'First, middle and last names and a class are required (maximum 100 characters each).' }); return;
  }
  if (!['male', 'female'].includes(body.gender)) { res.status(400).json({ error: 'Gender must be male or female.' }); return; }
  const klass = await db.getClassById(body.classId.trim(), school.id);
  if (!klass || klass.isArchived) { res.status(400).json({ error: 'Class is unavailable or does not belong to this school.' }); return; }
  const branchId = typeof body.branchId === 'string' && body.branchId.trim() ? body.branchId.trim() : undefined;
  const branches = branchId ? await db.getBranches(school.id) : [];
  if (branchId && !branches.some(branch => branch.id === branchId)) { res.status(400).json({ error: 'Branch does not belong to this school.' }); return; }
  if (branchId && klass.branchId && branchId !== klass.branchId) { res.status(400).json({ error: 'Student branch must match the selected class branch.' }); return; }
  const classCount = await db.queryPage('students', { school_id: school.id, class_id: klass.id }, 1, 1, undefined, 'id');
  if (classCount.total >= klass.capacity) { res.status(409).json({ error: 'The selected class has reached capacity.' }); return; }

  const studentId = typeof body.studentId === 'string' && body.studentId.trim()
    ? body.studentId.trim()
    : `STD-${school.code}-${randomBytes(4).toString('hex').toUpperCase()}`;
  if (!/^[A-Za-z0-9._-]{2,40}$/.test(studentId)) { res.status(400).json({ error: 'Student ID must be 2–40 letters, numbers, dots, underscores or hyphens.' }); return; }
  const duplicate = await db.queryPage('students', { school_id: school.id, student_id: studentId }, 1, 1, undefined, 'id');
  if (duplicate.total) { res.status(409).json({ error: 'That Student ID is already used in this school.' }); return; }

  const phoneFields = ['fatherPhone', 'motherPhone', 'studentPhone'] as const;
  const phones: Record<string, string> = {};
  for (const field of phoneFields) {
    const value = body[field] === undefined || body[field] === null ? '' : body[field];
    if (typeof value !== 'string' || value.length > 30 || (value.trim() && !validImportPhone(value.trim()))) {
      res.status(400).json({ error: `${field} must be a valid international phone number.` }); return;
    }
    phones[field] = value.trim();
  }
  if (body.pin !== undefined && (typeof body.pin !== 'string' || !/^\d{4}$/.test(body.pin))) {
    res.status(400).json({ error: 'Student PIN must contain exactly four digits.' }); return;
  }
  const isDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
  const admissionDate = body.admissionDate === undefined || body.admissionDate === '' ? new Date().toISOString().slice(0, 10) : body.admissionDate;
  if (!isDate(admissionDate) || (body.dateOfBirth !== undefined && body.dateOfBirth !== '' && !isDate(body.dateOfBirth))) {
    res.status(400).json({ error: 'Admission date and date of birth must use a real YYYY-MM-DD date.' }); return;
  }
  if (body.status !== undefined && !['active', 'inactive', 'graduated', 'transferred'].includes(body.status)) {
    res.status(400).json({ error: 'Student status is invalid.' }); return;
  }
  if (body.section !== undefined && (typeof body.section !== 'string' || body.section.trim().length > 50)) {
    res.status(400).json({ error: 'Section must be text of at most 50 characters.' }); return;
  }
  if (body.bloodGroup !== undefined && (typeof body.bloodGroup !== 'string' || body.bloodGroup.length > 10)) {
    res.status(400).json({ error: 'Blood group must be at most 10 characters.' }); return;
  }
  if (body.allergies !== undefined && (typeof body.allergies !== 'string' || body.allergies.length > 1000)) {
    res.status(400).json({ error: 'Allergy notes must be at most 1,000 characters.' }); return;
  }

  // Hydrate existing parent accounts before linking the student's family.
  await db.getParents(school.id);
  const student = db.createStudent({
    schoolId: school.id,
    branchId: klass.branchId || branchId,
    studentId,
    firstName: body.firstName.trim(),
    middleName: body.middleName.trim(),
    lastName: body.lastName.trim(),
    gender: body.gender,
    admissionDate,
    dateOfBirth: body.dateOfBirth || undefined,
    studentPhone: phones.studentPhone || undefined,
    fatherPhone: phones.fatherPhone,
    motherPhone: phones.motherPhone || undefined,
    classId: klass.id,
    section: typeof body.section === 'string' && body.section.trim() ? body.section.trim() : klass.section,
    status: body.status || 'active',
    pin: body.pin,
    bloodGroup: typeof body.bloodGroup === 'string' ? body.bloodGroup.trim() : undefined,
    allergies: typeof body.allergies === 'string' ? body.allergies.trim() : undefined
  });
  await db.flush();
  res.status(201).json({ ...sanitizeStudent(student), initialPin: student.pin });
});

apiRouter.post('/students/:id/reset-pin', requireAuth, requireSchoolAdminOrSuperAdmin, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  if (req.body?.customPin !== undefined && (typeof req.body.customPin !== 'string' || !/^\d{4}$/.test(req.body.customPin))) {
    res.status(400).json({ error: 'Student PIN must contain exactly four digits.' }); return;
  }
  const result = await db.resetStudentPin(req.params.id, school.id, req.body?.customPin);
  if (!result) {
    res.status(404).json({ error: 'Student not found.' });
    return;
  }
  res.json({
    success: true,
    newPin: result.newPin,
    student: sanitizeStudent(result.student)
  });
});

apiRouter.put('/students/:id', requireAuth, requireSchoolContext, requireSchoolAdminOrSuperAdmin, async (req, res) => {
  const school = (req as any).school;
  // Never accept identity, tenant, credential, or audit fields from the client.
  // Only the editable student profile fields may be changed through this route.
  const editableFields = [
    'firstName', 'middleName', 'lastName', 'gender', 'admissionDate',
    'dateOfBirth', 'studentPhone', 'fatherPhone', 'motherPhone',
    'classId', 'section', 'status', 'branchId', 'bloodGroup',
    'allergies', 'busRouteId', 'documents', 'notes'
  ] as const;
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const payload = Object.fromEntries(editableFields
    .filter(field => Object.prototype.hasOwnProperty.call(body, field))
    .map(field => [field, body[field]])) as Partial<Student>;
  for (const field of ['firstName', 'middleName', 'lastName'] as const) {
    if (payload[field] !== undefined && (typeof payload[field] !== 'string' || !payload[field]!.trim() || payload[field]!.trim().length > 100)) {
      res.status(400).json({ error: 'Student names must be non-empty text of at most 100 characters.' }); return;
    }
    if (typeof payload[field] === 'string') payload[field] = payload[field]!.trim();
  }
  for (const field of ['fatherPhone', 'motherPhone', 'studentPhone'] as const) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      const value = body[field];
      if (typeof value !== 'string' || value.length > 30 || (value.trim() && !validImportPhone(value.trim()))) {
        res.status(400).json({ error: `${field} must be a valid international phone number.` }); return;
      }
      payload[field] = value.trim();
    }
  }
  if (payload.classId !== undefined && (typeof payload.classId !== 'string' || !payload.classId.trim())) {
    res.status(400).json({ error: 'Class selection is invalid.' }); return;
  }
  if (payload.branchId !== undefined && (typeof payload.branchId !== 'string' || !payload.branchId.trim())) {
    res.status(400).json({ error: 'Branch selection is invalid.' }); return;
  }
  if (payload.section !== undefined && (typeof payload.section !== 'string' || payload.section.trim().length > 50)) {
    res.status(400).json({ error: 'Section must be text of at most 50 characters.' }); return;
  }
  if (payload.admissionDate !== undefined && (typeof payload.admissionDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(payload.admissionDate) || Number.isNaN(Date.parse(`${payload.admissionDate}T00:00:00.000Z`)) || new Date(`${payload.admissionDate}T00:00:00.000Z`).toISOString().slice(0, 10) !== payload.admissionDate)) {
    res.status(400).json({ error: 'Admission date must be a real YYYY-MM-DD date.' }); return;
  }
  if (payload.dateOfBirth !== undefined && payload.dateOfBirth !== '' && (typeof payload.dateOfBirth !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(payload.dateOfBirth) || Number.isNaN(Date.parse(`${payload.dateOfBirth}T00:00:00.000Z`)) || new Date(`${payload.dateOfBirth}T00:00:00.000Z`).toISOString().slice(0, 10) !== payload.dateOfBirth)) {
    res.status(400).json({ error: 'Date of birth must be a real YYYY-MM-DD date.' }); return;
  }
  if (payload.bloodGroup !== undefined && (typeof payload.bloodGroup !== 'string' || payload.bloodGroup.length > 10)) {
    res.status(400).json({ error: 'Blood group must be at most 10 characters.' }); return;
  }
  if (payload.allergies !== undefined && (typeof payload.allergies !== 'string' || payload.allergies.length > 1000)) {
    res.status(400).json({ error: 'Allergy notes must be at most 1,000 characters.' }); return;
  }
  if (payload.busRouteId !== undefined) {
    if (typeof payload.busRouteId !== 'string' || payload.busRouteId.length > 80) {
      res.status(400).json({ error: 'Bus route selection is invalid.' }); return;
    }
    if (payload.busRouteId.trim()) {
      const routes = await db.getTransportRoutes(school.id);
      if (!routes.some(route => route.id === payload.busRouteId!.trim())) {
        res.status(400).json({ error: 'Bus route does not belong to this school.' }); return;
      }
      payload.busRouteId = payload.busRouteId.trim();
    } else {
      payload.busRouteId = undefined;
    }
  }
  if (payload.documents !== undefined) {
    if (!Array.isArray(payload.documents) || payload.documents.length > 50 || payload.documents.some(document =>
      !document || typeof document !== 'object' ||
      typeof document.id !== 'string' || !document.id.trim() || document.id.length > 80 ||
      typeof document.name !== 'string' || !document.name.trim() || document.name.length > 160 ||
      typeof document.url !== 'string' || !document.url.trim() || document.url.length > 2048 || /^javascript:/i.test(document.url.trim()) ||
      typeof document.uploadDate !== 'string' || document.uploadDate.length > 40 || Number.isNaN(Date.parse(document.uploadDate))
    )) {
      res.status(400).json({ error: 'Student documents must contain up to 50 valid document records.' }); return;
    }
    payload.documents = payload.documents.map(document => ({
      id: document.id.trim(), name: document.name.trim(), url: document.url.trim(), uploadDate: document.uploadDate
    }));
  }
  if (payload.notes !== undefined) {
    if (!Array.isArray(payload.notes) || payload.notes.length > 100 || payload.notes.some(note =>
      !note || typeof note !== 'object' ||
      typeof note.id !== 'string' || !note.id.trim() || note.id.length > 80 ||
      typeof note.text !== 'string' || !note.text.trim() || note.text.length > 2000 ||
      typeof note.author !== 'string' || !note.author.trim() || note.author.length > 120 ||
      typeof note.date !== 'string' || note.date.length > 40 || Number.isNaN(Date.parse(note.date))
    )) {
      res.status(400).json({ error: 'Student notes must contain up to 100 valid note records.' }); return;
    }
    payload.notes = payload.notes.map(note => ({
      id: note.id.trim(), text: note.text.trim(), author: note.author.trim(), date: note.date
    }));
  }
  if (payload.gender !== undefined && !['male', 'female'].includes(payload.gender)) {
    res.status(400).json({ error: 'Student gender is invalid.' }); return;
  }
  if (payload.status !== undefined && !['active', 'inactive', 'graduated', 'transferred'].includes(payload.status)) {
    res.status(400).json({ error: 'Student status is invalid.' }); return;
  }
  const existingStudent = await db.getStudentById(String(req.params.id), school.id);
  if (!existingStudent) { res.status(404).json({ error: 'Student not found.' }); return; }
  if (payload.classId && payload.classId !== existingStudent.classId) {
    const role = normalizeRole((req as any).user.role);
    if (role !== 'school_admin' && role !== 'super_admin') { res.status(403).json({ error: 'School administrator privilege is required.' }); return; }
    if (payload.classId) {
      const destinationCount = await db.queryPage('students', { school_id: school.id, class_id: payload.classId }, 1, 1, undefined, 'id');
      const destination = await db.getClassById(payload.classId, school.id);
      if (!destination || destination.isArchived) { res.status(400).json({ error: 'Destination class is unavailable.' }); return; }
      if (destinationCount.total >= destination.capacity) { res.status(409).json({ error: 'Destination class has reached capacity.' }); return; }
    }
  }
  const klass = payload.classId ? await db.getClassById(payload.classId, school.id) : null;
  if (payload.classId && !klass) { res.status(400).json({ error: 'Class does not belong to this school.' }); return; }
  if (klass?.branchId) payload.branchId = klass.branchId;
  if (payload.branchId && !(await db.getBranches(school.id)).some(branch => branch.id === payload.branchId)) { res.status(400).json({ error: 'Branch does not belong to this school.' }); return; }
  const updated = await db.updateStudent(req.params.id, payload, school.id);
  res.json(sanitizeStudent(updated));
});

apiRouter.delete('/students/:id', requireAuth, requireSchoolContext, requireSchoolAdminOrSuperAdmin, async (req, res) => {
  const school = (req as any).school as School;
  const user = (req as any).user as User;
  const student = await db.getStudentById(req.params.id, school.id);
  if (!student) { res.status(404).json({ error: 'Student not found.' }); return; }
  const deleted = await db.deleteStudent(req.params.id, school.id);
  if (!deleted) { res.status(404).json({ error: 'Student not found.' }); return; }
  db.logAudit({
    action: 'STUDENT_DELETED',
    category: 'school',
    schoolId: school.id,
    schoolName: school.name,
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    details: `Deleted student ${student.studentId} (${student.firstName} ${student.middleName} ${student.lastName}) and the student's linked attendance, marks, and fee-payment rows.`,
    severity: 'warning'
  });
  res.json({ success: true });
});

apiRouter.get('/teachers/export', requireAuth, requireSchoolAdminOrSuperAdmin, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
  const [teachers, classes, subjects] = await Promise.all([
    queryAllRows('teachers', { school_id: school.id }, '*'),
    queryAllRows('classes', { school_id: school.id }, 'id,name,section'),
    queryAllRows('subjects', { school_id: school.id }, 'id,name')
  ]);
  const classNames = new Map(classes.map((item: any) => [item.id, `${item.name}${item.section ? ` - ${item.section}` : ''}`]));
  const subjectNames = new Map(subjects.map((item: any) => [item.id, item.name]));
  const filtered = teachers.filter((teacher: any) =>
    !search || [teacher.fullName, teacher.staffId, teacher.phone, teacher.department, teacher.qualification, teacher.status]
      .some(value => String(value || '').toLowerCase().includes(search))
  );
  const cell = (value: unknown) => {
    const raw = String(value ?? '');
    const safe = /^\s*[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const rows = [
    ['Teacher ID', 'Full Name', 'Gender', 'Department', 'Qualification', 'Phone', 'Assigned Classes', 'Assigned Subjects', 'Monthly Salary', 'Status', 'Joined Date'],
    ...filtered.map((teacher: any) => [
      teacher.staffId, teacher.fullName, teacher.gender, teacher.department, teacher.qualification,
      teacher.phone, (teacher.assignedClasses || []).map((id: string) => classNames.get(id) || id).join('; '), (teacher.assignedSubjects || []).map((id: string) => subjectNames.get(id) || id).join('; '), teacher.monthlySalary, teacher.status, teacher.joinedDate
    ])
  ];
  const csv = rows.map(row => row.map(cell).join(',')).join('\r\n');
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${String(school.code || 'school').replace(/[^A-Za-z0-9_-]/g, '_')}-teachers-${new Date().toISOString().slice(0, 10)}.csv"`
  }).send('\uFEFF' + csv);
});

apiRouter.get('/teachers', requireAuth, requireSchoolContext, (req, res) => {
  const school = (req as any).school;
  const user = (req as any).user as User;
  const canViewSalary = ['school_admin', 'super_admin', 'accountant'].includes(user.role);
  const search = typeof req.query.search === 'string'
    ? req.query.search.trim().replace(/[^\p{L}\p{N}\s._-]/gu, '').slice(0, 80)
    : '';
  const searchFilter = search
    ? ['full_name', 'staff_id', 'phone', 'department', 'qualification', 'status']
      .map(column => `${column}.ilike.*${search}*`).join(',')
    : undefined;
  void sendDatabasePage(
    req,
    res,
    'teachers',
    { school_id: school.id },
    searchFilter,
    items => canViewSalary ? items : items.map(({ monthlySalary: _salary, ...teacher }) => teacher)
  );
});

apiRouter.post('/teachers', requireAuth, requireSchoolContext, requireSchoolAdminOrSuperAdmin, async (req, res) => {
  const school = (req as any).school as School;
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const gender = body.gender;
  if (!fullName || fullName.length > 120) { res.status(400).json({ error: 'Teacher full name is required and must be at most 120 characters.' }); return; }
  if (!['male', 'female'].includes(gender)) { res.status(400).json({ error: 'Gender must be male or female.' }); return; }
  if (body.phone !== undefined && (typeof body.phone !== 'string' || phone.length > 30 || (phone && !validImportPhone(phone)))) { res.status(400).json({ error: 'Teacher phone must be a valid international phone number.' }); return; }
  const qualification = body.qualification === undefined ? '' : body.qualification;
  const department = body.department === undefined ? '' : body.department;
  if (typeof qualification !== 'string' || qualification.length > 120 || typeof department !== 'string' || department.length > 120) {
    res.status(400).json({ error: 'Qualification and department must be text of at most 120 characters.' }); return;
  }
  const monthlySalary = body.monthlySalary === undefined || body.monthlySalary === '' ? 0 : Number(body.monthlySalary);
  if (!Number.isFinite(monthlySalary) || monthlySalary < 0) { res.status(400).json({ error: 'Monthly salary must be a non-negative number.' }); return; }
  const staffId = normalizeStaffId(body.staffId) || await nextSchoolStaffId(school);
  if (!validStaffId(staffId)) { res.status(400).json({ error: 'Staff ID must be 3–40 characters and use only letters, numbers, dots, underscores, or hyphens.' }); return; }
  const [usedStaffIds, existingTeachers] = await Promise.all([
    queryAllRows('users', { school_id: school.id }, 'id,staff_id'),
    queryAllRows('teachers', { school_id: school.id }, 'id,staff_id')
  ]);
  if ([...usedStaffIds, ...existingTeachers].some((record: any) => String(record.staffId || '').toUpperCase() === staffId)) {
    res.status(409).json({ error: 'That staff ID is already used in this school.' }); return;
  }
  const branchId = typeof body.branchId === 'string' && body.branchId.trim() ? body.branchId.trim() : undefined;
  if (branchId && !(await db.getBranches(school.id)).some(branch => branch.id === branchId)) { res.status(400).json({ error: 'Branch does not belong to this school.' }); return; }
  if (body.assignedClasses !== undefined && (!Array.isArray(body.assignedClasses) || body.assignedClasses.length > 100 || body.assignedClasses.some((id: unknown) => typeof id !== 'string' || !id.trim()))) {
    res.status(400).json({ error: 'Assigned classes must contain up to 100 valid class IDs.' }); return;
  }
  if (body.assignedSubjects !== undefined && (!Array.isArray(body.assignedSubjects) || body.assignedSubjects.length > 100 || body.assignedSubjects.some((id: unknown) => typeof id !== 'string' || !id.trim()))) {
    res.status(400).json({ error: 'Assigned subjects must contain up to 100 valid subject IDs.' }); return;
  }
  const assignedClasses: string[] = Array.isArray(body.assignedClasses) ? [...new Set((body.assignedClasses as string[]).map(id => id.trim()))] : [];
  const assignedSubjects: string[] = Array.isArray(body.assignedSubjects) ? [...new Set((body.assignedSubjects as string[]).map(id => id.trim()))] : [];
  const [validClasses, validSubjects] = await Promise.all([
    assignedClasses.length ? queryAllRows('classes', { school_id: school.id, id: assignedClasses }, 'id') : [],
    assignedSubjects.length ? queryAllRows('subjects', { school_id: school.id, id: assignedSubjects }, 'id') : []
  ]);
  if (validClasses.length !== assignedClasses.length) { res.status(400).json({ error: 'Every assigned class must belong to this school.' }); return; }
  if (validSubjects.length !== assignedSubjects.length) { res.status(400).json({ error: 'Every assigned subject must belong to this school.' }); return; }

  const initialPin = String(1000 + (randomBytes(4).readUInt32BE(0) % 9000));
  const account = db.createUser({
    schoolId: school.id, role: 'teacher', staffId, fullName, phone,
    passwordHash: randomBytes(32).toString('base64url'), pin: initialPin,
    mustChangePassword: false, isBlocked: false, failedLoginAttempts: 0,
    assignedClassIds: assignedClasses, assignedSubjectIds: assignedSubjects
  });
  const teacher = db.createTeacher({
    schoolId: school.id,
    branchId,
    userId: account.id,
    staffId,
    fullName,
    email: '',
    phone,
    gender,
    qualification: qualification.trim(),
    department: department.trim(),
    assignedClasses,
    assignedSubjects,
    status: 'active',
    joinedDate: new Date().toISOString().slice(0, 10),
    monthlySalary
  });
  db.logAudit({ action: 'TEACHER_SIGN_IN_CREATED', category: 'auth', schoolId: school.id, schoolName: school.name, userId: (req as any).user.id, userName: (req as any).user.fullName, userRole: (req as any).user.role, details: 'Created teacher sign-in for staff ID ' + staffId + '.', severity: 'warning' });
  await db.flush();
  res.status(201).json({ ...teacher, initialPin });
});

const staffPermissions = new Set(['fees_manage', 'admissions_manage', 'attendance_manage', 'grades_manage', 'library_manage', 'transport_manage', 'inventory_manage', 'reports_export']);
const normalizeStaffId = (value: unknown) => typeof value === 'string' ? value.trim().toUpperCase() : '';
const validStaffId = (value: string) => /^[A-Z0-9][A-Z0-9._-]{2,39}$/.test(value);
apiRouter.get('/school/staff', requireAuth, requireSchoolAdminOrSuperAdmin, requireSchoolContext, async (req, res) => {
  res.json(await db.getStaffMembers((req as any).school.id));
});
apiRouter.post('/school/staff', requireAuth, requireSchoolAdminOrSuperAdmin, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const { fullName, roleTitle, email, phone, monthlySalary, permissions } = req.body || {};
  if (typeof fullName !== 'string' || !fullName.trim() || typeof roleTitle !== 'string' || !roleTitle.trim() || typeof email !== 'string' || !email.trim()) { res.status(400).json({ error: 'Full name, role title, and sign-in email are required.' }); return; }
  if (!Array.isArray(permissions) || permissions.some((permission: unknown) => typeof permission !== 'string' || !staffPermissions.has(permission))) { res.status(400).json({ error: 'One or more staff permissions are invalid.' }); return; }
  if (!Number.isFinite(Number(monthlySalary)) || Number(monthlySalary) < 0) { res.status(400).json({ error: 'Monthly salary must be a non-negative number.' }); return; }
  const cleanEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) { res.status(400).json({ error: 'Enter a valid sign-in email.' }); return; }
  if (await db.findUserForLogin(cleanEmail)) { res.status(409).json({ error: 'A sign-in account already uses this email.' }); return; }
  const existingStaff = await db.getStaffMembers(school.id);
  const staffId = normalizeStaffId(req.body?.staffId) || await nextSchoolStaffId(school);
  if (!validStaffId(staffId)) { res.status(400).json({ error: 'Staff ID must be 3–40 characters and use only letters, numbers, dots, underscores, or hyphens.' }); return; }
  const existingUsers = await queryAllRows('users', { school_id: school.id }, 'id,staff_id');
  if (existingStaff.some(item => item.staffId?.toUpperCase() === staffId) || existingUsers.some((item: any) => item.staffId?.toUpperCase() === staffId)) { res.status(409).json({ error: 'That staff ID is already used in this school.' }); return; }
  const temporaryPassword = randomBytes(12).toString('base64url');
  const account = db.createUser({ schoolId: school.id, role: 'accountant', staffId, fullName: fullName.trim(), email: cleanEmail, phone: typeof phone === 'string' ? phone.trim() : '', passwordHash: temporaryPassword, mustChangePassword: true, isBlocked: false, failedLoginAttempts: 0 });
  const staff = db.createStaffMember({ schoolId: school.id, staffId, fullName: fullName.trim(), roleTitle: roleTitle.trim(), email: cleanEmail, phone: typeof phone === 'string' ? phone.trim() : '', monthlySalary: Number(monthlySalary), permissions, status: 'active', userId: account.id });
  db.logAudit({ action: 'STAFF_SIGN_IN_CREATED', category: 'security', schoolId: school.id, schoolName: school.name, userId: (req as any).user.id, userName: (req as any).user.fullName, userRole: (req as any).user.role, details: `Created staff sign-in account ${account.id} for ${cleanEmail}.`, severity: 'warning' });
  res.status(201).json({ ...staff, initialPassword: temporaryPassword });
});
apiRouter.put('/school/staff/:id', requireAuth, requireSchoolAdminOrSuperAdmin, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const { fullName, roleTitle, email, phone, monthlySalary, permissions, status } = req.body || {};
  if (fullName !== undefined && (typeof fullName !== 'string' || !fullName.trim()) || roleTitle !== undefined && (typeof roleTitle !== 'string' || !roleTitle.trim())) { res.status(400).json({ error: 'Full name and role title must be non-empty text.' }); return; }
  if (email !== undefined && typeof email !== 'string' || phone !== undefined && typeof phone !== 'string') { res.status(400).json({ error: 'Email and phone must be text values.' }); return; }
  if (permissions !== undefined && (!Array.isArray(permissions) || permissions.some((permission: unknown) => typeof permission !== 'string' || !staffPermissions.has(permission)))) { res.status(400).json({ error: 'One or more staff permissions are invalid.' }); return; }
  if (monthlySalary !== undefined && (!Number.isFinite(Number(monthlySalary)) || Number(monthlySalary) < 0)) { res.status(400).json({ error: 'Monthly salary must be a non-negative number.' }); return; }
  if (status !== undefined && !['active', 'inactive'].includes(status)) { res.status(400).json({ error: 'Status must be active or inactive.' }); return; }
  const prior = (await db.getStaffMembers(school.id)).find(item => item.id === req.params.id);
  if (!prior) { res.status(404).json({ error: 'Staff member not found.' }); return; }
  let staffId: string | undefined;
  if (req.body?.staffId !== undefined) {
    staffId = normalizeStaffId(req.body.staffId);
    if (!validStaffId(staffId)) { res.status(400).json({ error: 'Staff ID must be 3–40 characters and use only letters, numbers, dots, underscores, or hyphens.' }); return; }
    const [otherStaff, existingUsers] = await Promise.all([
      db.getStaffMembers(school.id),
      queryAllRows('users', { school_id: school.id }, 'id,staff_id')
    ]);
    if (otherStaff.some(item => item.id !== prior.id && item.staffId?.toUpperCase() === staffId) ||
        existingUsers.some((item: any) => item.id !== prior.userId && String(item.staffId || '').toUpperCase() === staffId)) {
      res.status(409).json({ error: 'That staff ID is already used in this school.' }); return;
    }
  }
  if (email !== undefined && prior.userId) {
    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) { res.status(400).json({ error: 'Enter a valid sign-in email.' }); return; }
    const existingLogin = await db.findUserForLogin(cleanEmail);
    if (existingLogin && existingLogin.id !== prior.userId) { res.status(409).json({ error: 'A sign-in account already uses this email.' }); return; }
  }
  const updates = Object.fromEntries(Object.entries({ staffId, fullName, roleTitle, email, phone, monthlySalary: monthlySalary === undefined ? undefined : Number(monthlySalary), permissions, status }).filter(([, value]) => value !== undefined));
  const updated = await db.updateStaffMember(req.params.id, school.id, updates);
  if (!updated) { res.status(404).json({ error: 'Staff member not found.' }); return; }
  if (updated.userId) {
    const updatedUser = db.updateUser(updated.userId, { staffId: updated.staffId, fullName: updated.fullName, email: updated.email, phone: updated.phone, permissions: updated.permissions, isBlocked: updated.status !== 'active' });
    if (!updatedUser) { res.status(500).json({ error: 'Staff member was updated, but the linked sign-in account could not be updated.' }); return; }
    invalidateAuthenticatedSnapshot(updated.userId);
  }
  if (permissions !== undefined || status !== undefined) {
    db.logAudit({ action: 'STAFF_ACCESS_UPDATED', category: 'security', schoolId: school.id, schoolName: school.name, userId: (req as any).user.id, userName: (req as any).user.fullName, userRole: (req as any).user.role, details: `Updated staff account access for ${updated.userId || updated.id}.`, severity: 'warning' });
  }
  res.json(updated);
});

apiRouter.get('/school/admissions', requireAuth, requireSchoolAdminOrSuperAdmin, requireSchoolContext, async (req, res) => {
  res.json(await db.getAdmissionApplications((req as any).school.id));
});
apiRouter.post('/school/admissions', requireAuth, requireSchoolAdminOrSuperAdmin, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const { firstName, middleName, lastName, gender, gradeApplying, classId, fatherPhone, motherPhone } = req.body || {};
  if (![firstName, lastName, gradeApplying, classId].every(value => typeof value === 'string' && value.trim()) || !['male', 'female'].includes(gender)) { res.status(400).json({ error: 'First and last name, gender, grade and class are required.' }); return; }
  const klass = await db.getClassById(classId, school.id);
  if (!klass) { res.status(400).json({ error: 'Class does not belong to this school.' }); return; }
  const application = db.createAdmissionApplication({ schoolId: school.id, firstName: firstName.trim(), middleName: typeof middleName === 'string' ? middleName.trim() : '', lastName: lastName.trim(), gender, gradeApplying: gradeApplying.trim(), classId, fatherPhone: typeof fatherPhone === 'string' ? fatherPhone.trim() : '', motherPhone: typeof motherPhone === 'string' ? motherPhone.trim() : '' });
  db.logAudit({ action: 'ADMISSION_APPLICATION_CREATED', category: 'school', schoolId: school.id, schoolName: school.name, userId: (req as any).user.id, userName: (req as any).user.fullName, userRole: (req as any).user.role, details: `Admission application ${application.id} was recorded.`, severity: 'info' });
  await db.flush();
  res.status(201).json(application);
});
apiRouter.patch('/school/admissions/:id/status', requireAuth, requireSchoolAdminOrSuperAdmin, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const application = (await db.getAdmissionApplications(school.id)).find(row => row.id === req.params.id);
  if (!application) { res.status(404).json({ error: 'Admission application not found.' }); return; }
  if (application.status !== 'pending') { res.status(409).json({ error: 'This application has already been processed.' }); return; }
  const status = req.body?.status;
  if (status !== 'rejected') { res.status(400).json({ error: 'Use the approve endpoint or set status to rejected.' }); return; }
  const rejected = await db.updateAdmissionApplication(application.id, school.id, 'rejected');
  db.logAudit({ action: 'ADMISSION_APPLICATION_REJECTED', category: 'school', schoolId: school.id, schoolName: school.name, userId: (req as any).user.id, userName: (req as any).user.fullName, userRole: (req as any).user.role, details: `Admission application ${application.id} was rejected.`, severity: 'warning' });
  await db.flush();
  res.json(rejected);
});
apiRouter.post('/school/admissions/:id/approve', requireAuth, requireSchoolAdminOrSuperAdmin, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const application = (await db.getAdmissionApplications(school.id)).find(row => row.id === req.params.id);
  if (!application) { res.status(404).json({ error: 'Admission application not found.' }); return; }
  if (application.status !== 'pending') { res.status(409).json({ error: 'This application has already been processed.' }); return; }
  const klass = await db.getClassById(application.classId, school.id);
  if (!klass || klass.isArchived) { res.status(400).json({ error: 'Application class is unavailable or no longer belongs to this school.' }); return; }
  const [classCount] = await Promise.all([
    db.queryPage('students', { school_id: school.id, class_id: application.classId }, 1, 1, undefined, 'id')
  ]);
  if (classCount.total >= klass.capacity) { res.status(409).json({ error: 'The selected class has reached capacity. Move the application to another class before approval.' }); return; }
  // Load existing parent accounts before creating the student so both parents
  // are linked to this child instead of creating duplicate login accounts.
  await db.getParents(school.id);
  const studentId = `STD-${school.code}-${application.id.slice(-8).toUpperCase()}`;
  const student = db.createStudent({ schoolId: school.id, branchId: klass.branchId, studentId, firstName: application.firstName, middleName: application.middleName, lastName: application.lastName, gender: application.gender, admissionDate: new Date().toISOString().slice(0, 10), fatherPhone: application.fatherPhone, motherPhone: application.motherPhone, classId: application.classId, status: 'active' } as any);
  const updated = await db.updateAdmissionApplication(application.id, school.id, 'approved', studentId);
  db.logAudit({ action: 'ADMISSION_APPLICATION_APPROVED', category: 'school', schoolId: school.id, schoolName: school.name, userId: (req as any).user.id, userName: (req as any).user.fullName, userRole: (req as any).user.role, details: `Admission application ${application.id} was approved and enrolled as ${studentId}.`, severity: 'info' });
  await db.flush();
  res.json({ application: updated, student: { ...sanitizeStudent(student), initialPin: student.pin } });
});

// ==============================================================================
// 5. ATTENDANCE: TAKEN STRICTLY ONCE PER DAY PER STUDENT PER CLASS
// ==============================================================================

apiRouter.get('/attendance', requireAuth, requireSchoolContext, requireSchoolStaff, async (req, res) => {
  const school = (req as any).school;
  const { classId, date } = req.query;
  if (!classId || !date) {
    res.status(400).json({ error: 'classId and date (YYYY-MM-DD) are required.' });
    return;
  }
  if (!await canAccessTeachingClass(req, res, classId as string)) return;
  res.json(await db.getAttendance(school.id, classId as string, date as string));
});

apiRouter.get('/attendance/student', requireAuth, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const user = (req as any).user as User;
  const studentId = req.query.studentId as string;
  if (!studentId) {
    res.status(400).json({ error: 'studentId is required' });
    return;
  }
  if (!await canAccessStudentRecord(user, studentId)) {
    res.status(403).json({ error: 'You do not have access to this student attendance record.' });
    return;
  }
  await sendDatabasePage(req, res, 'attendance_records', { school_id: school.id, student_id: studentId });
});

apiRouter.post('/attendance', requireAuth, requireSchoolContext, requireSchoolStaff, async (req, res) => {
  const school = (req as any).school;
  const user = (req as any).user as User;
  const { classId, date, records } = req.body;

  if (typeof classId !== 'string' || !classId.trim() || typeof date !== 'string' || !Array.isArray(records) || records.length < 1 || records.length > 2000) {
    res.status(400).json({ error: 'A class, a valid date, and 1–2,000 student records are required.' });
    return;
  }
  const normalizedClassId = classId.trim();
  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
    res.status(400).json({ error: 'Attendance date must be a real date in YYYY-MM-DD format.' });
    return;
  }
  if (!await canAccessTeachingClass(req, res, normalizedClassId)) return;
  const allowedStatuses = new Set(['present', 'absent', 'late', 'excused']);
  const seenStudentIds = new Set<string>();
  for (const record of records) {
    if (!record || typeof record.studentId !== 'string' || !record.studentId.trim() || !allowedStatuses.has(record.status)) {
      res.status(400).json({ error: 'Every attendance row must include a valid student ID and attendance status.' });
      return;
    }
    if (seenStudentIds.has(record.studentId)) {
      res.status(400).json({ error: 'Duplicate students are not allowed in one attendance submission.' });
      return;
    }
    if (record.note !== undefined && (typeof record.note !== 'string' || record.note.length > 500)) {
      res.status(400).json({ error: 'Attendance notes must be text of at most 500 characters.' });
      return;
    }
    seenStudentIds.add(record.studentId.trim());
  }
  const normalizedRecords = records.map(record => ({
    ...record,
    studentId: record.studentId.trim(),
    note: typeof record.note === 'string' ? record.note.trim() : undefined
  }));
  const classStudents = await queryAllRows('students', { school_id: school.id, class_id: normalizedClassId }, 'id');
  const classStudentIds = new Set(classStudents.map((student: any) => student.id));
  if (normalizedRecords.some(record => !classStudentIds.has(record.studentId))) {
    res.status(400).json({ error: 'Attendance can only be recorded for students currently enrolled in the selected class.' });
    return;
  }

  const saved = await db.recordDailyAttendance(school.id, normalizedClassId, date, normalizedRecords, user.id);
  res.json({ success: true, count: saved.length, records: saved });
});

// ==============================================================================
// 6. EXAMS & RESULTS: SMALL + BIG EXAM -> PERCENTAGE ONLY
// ==============================================================================

apiRouter.get('/exams/config', requireAuth, requireSchoolContext, (req, res) => {
  const school = (req as any).school;
  res.json(db.getExamConfig(school.id));
});

apiRouter.put('/exams/config', requireAuth, requireSchoolAdminOrSuperAdmin, requireSchoolContext, (req, res) => {
  const school = (req as any).school as School;
  const user = (req as any).user as User;
  try {
    const updates = sanitizeExamConfigSettings(req.body);
    const updated = db.updateExamConfig(school.id, updates);
    db.logAudit({
      action: 'EXAM_CONFIG_UPDATED',
      category: 'academics',
      schoolId: school.id,
      schoolName: school.name,
      userId: user.id,
      userName: user.fullName,
      userRole: user.role,
      details: `Updated exam maximum marks (${updated.smallExamMax} + ${updated.bigExamMax}) and pass mark (${updated.passMarkPercentage}%).`,
      severity: 'info'
    });
    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid exam configuration.' });
  }
});

apiRouter.get('/exams/marks', requireAuth, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const user = (req as any).user as User;
  const { classId, subjectId, semester, studentId } = req.query;
  if (studentId) {
    if (!await canAccessStudentRecord(user, studentId as string)) {
      res.status(403).json({ error: 'You do not have access to this student results record.' });
      return;
    }
    const marks = await db.getStudentMarks(school.id, studentId as string);
    const subjectIds = [...new Set(marks.map(mark => mark.subjectId))];
    const subjects = subjectIds.length
      ? await db.queryPage('subjects', { school_id: school.id, id: subjectIds }, 1, 100, undefined, 'id,name,code')
      : { items: [] as any[] };
    const subjectNames = new Map(subjects.items.map((item: any) => [item.id, item.name]));
    res.json(marks.map(mark => ({ ...mark, subjectName: subjectNames.get(mark.subjectId) || mark.subjectId })));
    return;
  }
  if (!classId) {
    res.status(400).json({ error: 'classId is required' });
    return;
  }
  if (user.role === 'teacher' && !user.assignedClassIds?.includes(classId as string)) {
    res.status(403).json({ error: 'You may only access marks for your assigned classes.' });
    return;
  }
  if (user.role === 'parent' || user.role === 'student') {
    res.status(403).json({ error: 'A student ID is required for this results request.' });
    return;
  }
  res.json(await db.getMarks(school.id, classId as string, subjectId as string, semester as any));
});

apiRouter.post('/exams/marks', requireAuth, requireSchoolContext, requireSchoolStaff, async (req, res) => {
  const school = (req as any).school;
  const user = (req as any).user as User;
  const { classId, subjectId, semester, marks } = req.body;

  if (!classId || typeof subjectId !== 'string' || !subjectId || !['Semester 1', 'Semester 2'].includes(semester) || !Array.isArray(marks) || marks.length < 1 || marks.length > 2000) {
    res.status(400).json({ error: 'A class, subject, valid semester, and 1–2,000 student mark rows are required.' });
    return;
  }
  if (!await canAccessTeachingClass(req, res, classId)) return;
  const subjectResult = await db.queryPage('subjects', { school_id: school.id, id: subjectId }, 1, 1, undefined, 'id');
  if (!subjectResult.items.length) {
    res.status(400).json({ error: 'The selected subject does not belong to this school.' });
    return;
  }
  if (normalizeRole(user.role) === 'teacher') {
    const teacher = await db.queryPage('teachers', { school_id: school.id, user_id: user.id }, 1, 1, undefined, 'id');
    if (!teacher.items.length) {
      res.status(403).json({ error: 'Your teacher profile is not linked to this school.' });
      return;
    }
    const assignment = await db.queryPage('class_subjects', {
      school_id: school.id,
      class_id: classId,
      subject_id: subjectId,
      teacher_id: teacher.items[0].id,
      is_active: 'true'
    }, 1, 1, undefined, 'id');
    if (!assignment.total) {
      res.status(403).json({ error: 'You may only enter marks for subjects actively assigned to you in this class.' });
      return;
    }
  }
  const seenStudentIds = new Set<string>();
  for (const mark of marks) {
    if (!mark || typeof mark.studentId !== 'string' || !mark.studentId.trim() ||
        !Number.isFinite(mark.smallExamMarks) || !Number.isFinite(mark.bigExamMarks) ||
        !['draft', 'submitted'].includes(mark.status) ||
        (typeof mark.teacherRemarks === 'string' && mark.teacherRemarks.length > 1000)) {
      res.status(400).json({ error: 'Every mark row must include a student, numeric marks, a valid status, and remarks of at most 1,000 characters.' });
      return;
    }
    if (seenStudentIds.has(mark.studentId)) {
      res.status(400).json({ error: 'Duplicate students are not allowed in one marks submission.' });
      return;
    }
    seenStudentIds.add(mark.studentId);
  }
  const classStudents = await queryAllRows('students', { school_id: school.id, class_id: classId }, 'id');
  const classStudentIds = new Set(classStudents.map((student: any) => student.id));
  if (marks.some(mark => !classStudentIds.has(mark.studentId))) {
    res.status(400).json({ error: 'Marks can only be entered for students currently enrolled in the selected class.' });
    return;
  }

  try {
    const saved = await db.saveStudentMarks(school.id, classId, subjectId, semester, marks, user.id);
    res.json({ success: true, count: saved.length, marks: saved });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid marks.' });
  }
});

apiRouter.post('/exams/approve', requireAuth, requireSchoolContext, requireSchoolAdminOrSuperAdmin, async (req, res) => {
  const school = (req as any).school;
  const user = (req as any).user as User;
  const { markIds } = req.body;

  if (!Array.isArray(markIds) || markIds.length < 1 || markIds.length > 2000 ||
      markIds.some((id: unknown) => typeof id !== 'string' || !id.trim())) {
    res.status(400).json({ error: 'Provide 1–2,000 valid mark IDs.' });
    return;
  }
  const uniqueMarkIds = [...new Set(markIds as string[])];
  if (uniqueMarkIds.length !== markIds.length) {
    res.status(400).json({ error: 'Duplicate mark IDs are not allowed.' });
    return;
  }
  // Hydrate the selected rows before the synchronous storage update; otherwise
  // marks created before a server restart may be absent from the in-memory cache.
  await queryAllRows('student_marks', { school_id: school.id, id: uniqueMarkIds }, 'id');
  const approved = db.approveMarks(school.id, uniqueMarkIds, user.id);
  res.json({ success: true, approvedCount: approved.length });
});

// Semester 1 Results & Ranking (Highlight Top 3)
function canReadClassResults(req: Request, res: Response, classId: string): boolean {
  const user = (req as any).user as User;
  if (!user || !['school_admin', 'super_admin', 'teacher', 'accountant'].includes(user.role)) {
    res.status(403).json({ error: 'Results access is limited to school staff.' });
    return false;
  }
  if (user.role === 'teacher' && !user.assignedClassIds?.includes(classId)) {
    res.status(403).json({ error: 'You may only access results for your assigned classes.' });
    return false;
  }
  return true;
}

apiRouter.get('/exams/rankings/semester', requireAuth, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const { classId, semester } = req.query;
  if (!classId || typeof classId !== 'string') {
    res.status(400).json({ error: 'classId is required.' });
    return;
  }
  if (!canReadClassResults(req, res, classId)) return;
  res.json(await db.getClassSemesterRankings(school.id, classId, (semester as any) || 'Semester 1'));
});

// Semester 2 Combined Yearly Results & Ranking (for Final Report Card)
apiRouter.get('/exams/rankings/yearly', requireAuth, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const { classId } = req.query;
  if (!classId || typeof classId !== 'string') {
    res.status(400).json({ error: 'classId is required.' });
    return;
  }
  if (!canReadClassResults(req, res, classId)) return;
  res.json(await db.getClassYearlyRankings(school.id, classId));
});

// Year-End Promotion Confirmation
apiRouter.get('/promotions/history', requireAuth, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  res.json(await db.getPromotionHistory(school.id));
});

apiRouter.post('/promotions/confirm', requireAuth, requireSchoolAdminOrSuperAdmin, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const user = (req as any).user as User;
  const { promotions, classId, topN = 3 } = req.body;

  if (!Array.isArray(promotions) || typeof classId !== 'string') {
    res.status(400).json({ error: 'classId and promotions array are required.' });
    return;
  }

  try {
    const confirmed = await db.confirmYearEndPromotions(school.id, classId, Number(topN), promotions, user.id);
    res.json({ success: true, count: confirmed.length });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Promotion confirmation failed.' });
  }
});

// ==============================================================================
// 7. CASH-ONLY FEES & CLASS-RANGE LEDGER
// ==============================================================================

apiRouter.get('/fees/structures', requireAuth, requireAccountantOrSuperAdmin, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  res.json(await db.getFeeStructures(school.id));
});

apiRouter.post('/fees/structures', requireAuth, requireAccountantOrSuperAdmin, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const body = req.body || {};
  if (typeof body.name !== 'string' || !body.name.trim() || !['monthly_tuition', 'annual_registration', 'bus', 'custom'].includes(body.feeType) || !Number.isFinite(Number(body.amount)) || Number(body.amount) <= 0 || !['monthly', 'annual', 'one_time'].includes(body.cadence)) {
    res.status(400).json({ error: 'Enter a fee name, supported category, positive amount, and valid billing cadence.' }); return;
  }
  const hasGradeRange = body.minGrade !== undefined || body.maxGrade !== undefined;
  if (hasGradeRange && (!Number.isInteger(Number(body.minGrade)) || !Number.isInteger(Number(body.maxGrade)) || Number(body.minGrade) < 1 || Number(body.maxGrade) > 12 || Number(body.minGrade) > Number(body.maxGrade))) {
    res.status(400).json({ error: 'Fee grade ranges must be whole grades from 1 to 12, with the first grade no higher than the last.' }); return;
  }
  if (body.classId && !await db.getClassById(String(body.classId), school.id)) { res.status(400).json({ error: 'Fee class must belong to this school.' }); return; }
  if (body.isActive !== undefined && typeof body.isActive !== 'boolean') { res.status(400).json({ error: 'Fee active status must be true or false.' }); return; }
  const item = db.createFeeStructure({
    schoolId: school.id,
    name: body.name.trim(),
    feeType: body.feeType,
    amount: Number(body.amount),
    cadence: body.cadence,
    minGrade: hasGradeRange ? Number(body.minGrade) : undefined,
    maxGrade: hasGradeRange ? Number(body.maxGrade) : undefined,
    classId: typeof body.classId === 'string' ? body.classId : undefined,
    isActive: body.isActive === undefined ? true : body.isActive
  });
  await db.flush();
  res.status(201).json(item);
});

apiRouter.put('/fees/structures/:id', requireAuth, requireAccountantOrSuperAdmin, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const existing = (await db.getFeeStructures(school.id)).find(item => item.id === req.params.id);
  if (!existing) { res.status(404).json({ error: 'Fee structure not found.' }); return; }
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const editable = ['name', 'feeType', 'amount', 'cadence', 'minGrade', 'maxGrade', 'classId', 'isActive'];
  const updates = Object.fromEntries(editable
    .filter(key => Object.prototype.hasOwnProperty.call(body, key))
    .map(key => [key, body[key]]));
  const next = { ...existing, ...updates };
  if (typeof next.name !== 'string' || !next.name.trim() ||
      !['monthly_tuition', 'annual_registration', 'bus', 'custom'].includes(next.feeType) ||
      !Number.isFinite(Number(next.amount)) || Number(next.amount) <= 0 ||
      !['monthly', 'annual', 'one_time'].includes(next.cadence) ||
      (next.isActive !== undefined && typeof next.isActive !== 'boolean')) {
    res.status(400).json({ error: 'Fee name, category, positive amount, billing cadence, or active status is invalid.' }); return;
  }
  const hasGradeRange = next.minGrade !== undefined || next.maxGrade !== undefined;
  if (hasGradeRange && (!Number.isInteger(Number(next.minGrade)) || !Number.isInteger(Number(next.maxGrade)) ||
      Number(next.minGrade) < 1 || Number(next.maxGrade) > 12 || Number(next.minGrade) > Number(next.maxGrade))) {
    res.status(400).json({ error: 'Fee grade ranges must be whole grades from 1 to 12, with the first grade no higher than the last.' }); return;
  }
  if (next.classId && !await db.getClassById(String(next.classId), school.id)) {
    res.status(400).json({ error: 'Fee class must belong to this school.' }); return;
  }
  const updated = await db.updateFeeStructure(req.params.id, school.id, {
    ...updates,
    name: next.name.trim(),
    amount: Number(next.amount),
    minGrade: hasGradeRange ? Number(next.minGrade) : undefined,
    maxGrade: hasGradeRange ? Number(next.maxGrade) : undefined
  });
  if (!updated) { res.status(404).json({ error: 'Fee structure not found.' }); return; }
  res.json(updated);
});

apiRouter.delete('/fees/structures/:id', requireAuth, requireAccountantOrSuperAdmin, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const structure = (await db.getFeeStructures(school.id)).find(item => item.id === req.params.id);
  if (!structure) { res.status(404).json({ error: 'Fee structure not found.' }); return; }
  const payments = await db.getFeePayments(school.id);
  if (payments.some(payment => payment.feeStructureId === structure.id)) {
    res.status(409).json({ error: 'This fee structure is referenced by payment history. Deactivate it instead of deleting it.' }); return;
  }
  res.json({ success: await db.deleteFeeStructure(req.params.id, school.id) });
});

apiRouter.get('/fees/payments', requireAuth, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const user = (req as any).user as User;
  const { studentId } = req.query;
  if (!['school_admin', 'accountant', 'super_admin', 'parent', 'student'].includes(user.role)) { res.status(403).json({ error: 'This role cannot view student fee records.' }); return; }
  if (studentId && !await canAccessStudentRecord(user, studentId as string)) {
    res.status(403).json({ error: 'You do not have access to this student fee record.' });
    return;
  }
  if ((user.role === 'parent' || user.role === 'student') && !studentId) {
    res.status(400).json({ error: 'A student ID is required for this fee request.' });
    return;
  }
  void sendDatabasePage(req, res, 'fee_payments', { school_id: school.id, student_id: studentId as string });
});

apiRouter.post('/fees/payments/:paymentId/void', requireAuth, requireAccountantOrSuperAdmin, requireSchoolContext, async (req, res) => {
  const user = (req as any).user as User;
  const school = (req as any).school as School;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (reason.length < 5 || reason.length > 500) { res.status(400).json({ error: 'Enter a void reason between 5 and 500 characters.' }); return; }
  const payment = await db.voidFeePayment(req.params.paymentId, school.id, user.id, reason);
  if (!payment) { res.status(409).json({ error: 'Payment was not found or has already been voided.' }); return; }
  db.logAudit({ action: 'FEE_PAYMENT_VOIDED', category: 'finance', schoolId: school.id, schoolName: school.name, userId: user.id, userName: user.fullName, userRole: user.role, details: `Voided receipt ${payment.receiptNumber}. Reason: ${reason}`, severity: 'warning' });
  res.json(payment);
});

// Record Cash Payment only!
apiRouter.post('/fees/pay-cash', requireAuth, requireAccountantOrSuperAdmin, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const user = (req as any).user as User;
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const { studentId, academicYear, month, feeType, feeStructureId, amountDue, amountPaid, notes, idempotencyKey } = body;
  const resolvedFeeType = feeType || 'monthly_tuition';
  const due = Number(amountDue);
  const paid = Number(amountPaid);
  if (typeof studentId !== 'string' || !studentId.trim() ||
      !Number.isFinite(due) || due <= 0 || amountPaid === undefined || !Number.isFinite(paid) || paid < 0 ||
      !['monthly_tuition', 'annual_registration', 'bus', 'custom'].includes(resolvedFeeType) ||
      (academicYear !== undefined && (typeof academicYear !== 'string' || !academicYear.trim() || academicYear.length > 20)) ||
      (month !== undefined && (typeof month !== 'string' || !month.trim() || month.length > 40)) ||
      (notes !== undefined && (typeof notes !== 'string' || notes.length > 1000)) ||
      (idempotencyKey !== undefined && (typeof idempotencyKey !== 'string' || idempotencyKey.trim().length < 8 || idempotencyKey.length > 128))) {
    res.status(400).json({ error: 'Provide a student, positive amount due, non-negative cash amount, valid fee category, and valid optional payment details.' });
    return;
  }

  try {
    const payment = await db.recordCashFeePayment({
      schoolId: school.id,
      studentId: studentId.trim(),
      academicYear: academicYear || school.academicYear,
      month: month || new Date().toLocaleString('default', { month: 'long', year: 'numeric' }),
      feeType: resolvedFeeType,
      feeStructureId: typeof feeStructureId === 'string' ? feeStructureId : undefined,
      amountDue: due,
      amountPaid: paid,
      recordedBy: user.id,
      notes,
      idempotencyKey: typeof idempotencyKey === 'string' ? idempotencyKey.trim() : undefined
    });
    res.status(201).json(payment);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Payment could not be recorded.' });
  }
});

apiRouter.get('/fees/daily-income', requireAuth, requireAccountantOrSuperAdmin, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
  res.json(await db.getDailyIncomeReport(school.id, date));
});

// Monthly payroll management is reserved for accountants; staff only see their own payslips.
const payrollAmounts = (items: unknown): { lines: Array<{ label: string; amount: number }>; total: number } | null => {
  if (items === undefined) return { lines: [], total: 0 };
  if (!Array.isArray(items)) return null;
  const lines: Array<{ label: string; amount: number }> = [];
  for (const item of items) {
    const label = typeof (item as any)?.label === 'string' ? (item as any).label.trim() : '';
    const amount = Number((item as any)?.amount);
    if (!label || label.length > 100 || !Number.isFinite(amount) || amount < 0) return null;
    lines.push({ label, amount });
  }
  return { lines, total: lines.reduce((sum, line) => sum + line.amount, 0) };
};

apiRouter.get('/payroll/mine', requireAuth, requireSchoolContext, async (req, res) => {
  const user = (req as any).user as User; const school = (req as any).school as School;
  if (!['school_admin', 'accountant', 'teacher', 'super_admin'].includes(user.role)) { res.status(403).json({ error: 'Payslip access is limited to school staff.' }); return; }
  void sendDatabasePage(req, res, 'payroll_records', { school_id: school.id, user_id: user.id, payroll_month: typeof req.query.month === 'string' ? req.query.month : undefined });
});

apiRouter.get('/payroll/staff', requireAuth, requireAccountantOrSuperAdmin, requireSchoolContext, async (req, res) => {
  const school = (req as any).school as School;
  const [teachers, staffRows] = await Promise.all([db.getTeachers(school.id), db.getStaffMembers(school.id)]);
  const employees = [
    ...teachers.filter(item => item.status === 'active' && item.userId).map(item => ({ id: item.id, staffId: item.staffId || item.id, userId: item.userId, name: item.fullName, monthlySalary: item.monthlySalary })),
    ...staffRows.filter(item => item.status === 'active' && item.userId).map(item => ({ id: item.id, staffId: item.staffId || item.id, userId: item.userId, name: item.fullName, monthlySalary: item.monthlySalary }))
  ];
  res.json(employees);
});

apiRouter.get('/payroll', requireAuth, requireAccountantOrSuperAdmin, requireSchoolContext, async (req, res) => {
  const school = (req as any).school as School;
  void sendDatabasePage(req, res, 'payroll_records', { school_id: school.id, payroll_month: typeof req.query.month === 'string' ? req.query.month : undefined });
});

apiRouter.post('/payroll', requireAuth, requireAccountantOrSuperAdmin, requireSchoolContext, async (req, res) => {
  const school = (req as any).school as School; const user = (req as any).user as User;
  const month = typeof req.body?.month === 'string' ? req.body.month : '';
  const selections = req.body?.staff;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !Array.isArray(selections) || selections.length < 1 || selections.length > 500) { res.status(400).json({ error: 'Choose a valid payroll month and between 1 and 500 staff members.' }); return; }
  const [teachers, staffRows, existing] = await Promise.all([db.getTeachers(school.id), db.getStaffMembers(school.id), db.getPayrollRecords(school.id, undefined, month)]);
  const employees = [
    ...teachers.filter(item => item.status === 'active' && item.userId).map(item => ({ id: item.id, staffId: item.staffId || item.id, userId: item.userId!, name: item.fullName, salary: Number(item.monthlySalary) })),
    ...staffRows.filter(item => item.status === 'active' && item.userId).map(item => ({ id: item.id, staffId: item.staffId || item.id, userId: item.userId!, name: item.fullName, salary: Number(item.monthlySalary) }))
  ];
  const seen = new Set<string>(); const prepared: Array<Omit<StaffPayrollRecord, 'id' | 'createdAt'>> = [];
  for (const selection of selections) {
    const employee = employees.find(item => item.id === selection?.staffId || item.staffId === selection?.staffId);
    if (!employee) { res.status(400).json({ error: 'Every selected employee must be active and belong to this school.' }); return; }
    if (seen.has(employee.userId) || existing.some(record => record.userId === employee.userId)) { res.status(409).json({ error: `${employee.name} already has a payroll record for ${month}.` }); return; }
    seen.add(employee.userId);
    const allowances = payrollAmounts(selection.allowances); const deductions = payrollAmounts(selection.deductions);
    if (!allowances || !deductions || !Number.isFinite(employee.salary) || employee.salary < 0 || deductions.total > employee.salary + allowances.total) { res.status(400).json({ error: `Payroll amounts are invalid for ${employee.name}.` }); return; }
    prepared.push({ schoolId: school.id, userId: employee.userId, staffId: employee.id, staffName: employee.name, payrollMonth: month, baseSalary: employee.salary,
      allowances: allowances.lines, allowanceTotal: allowances.total, deductions: deductions.lines, deductionTotal: deductions.total,
      netSalary: employee.salary + allowances.total - deductions.total, status: 'draft', createdBy: user.id });
  }
  const created = prepared.map(record => db.createPayrollRecord(record));
  db.logAudit({ action: 'PAYROLL_DRAFT_CREATED', category: 'finance', schoolId: school.id, schoolName: school.name, userId: user.id, userName: user.fullName, userRole: user.role, details: `Created payroll draft for ${month} with ${created.length} staff records.`, severity: 'info' });
  await db.flush(); res.status(201).json(created);
});

apiRouter.post('/payroll/:id/approve', requireAuth, requireAccountantOrSuperAdmin, requireSchoolContext, async (req, res) => {
  const user = (req as any).user as User; const school = (req as any).school as School;
  const record = (await db.getPayrollRecords(school.id)).find(item => item.id === req.params.id);
  if (!record || record.status !== 'draft') { res.status(409).json({ error: 'Only a draft payroll record can be approved.' }); return; }
  const updated = await db.updatePayrollRecord(record.id, school.id, { status: 'approved', approvedBy: user.id, approvedAt: new Date().toISOString() });
  db.logAudit({ action: 'PAYROLL_APPROVED', category: 'finance', schoolId: school.id, schoolName: school.name, userId: user.id, userName: user.fullName, userRole: user.role, details: `Approved payroll for ${record.staffName}, ${record.payrollMonth}.`, severity: 'warning' });
  await db.flush(); res.json(updated);
});

apiRouter.post('/payroll/:id/pay', requireAuth, requireAccountantOrSuperAdmin, requireSchoolContext, async (req, res) => {
  const user = (req as any).user as User; const school = (req as any).school as School;
  const record = (await db.getPayrollRecords(school.id)).find(item => item.id === req.params.id);
  if (!record || record.status !== 'approved') { res.status(409).json({ error: 'Only an approved payroll record can be marked paid.' }); return; }
  const paidAt = new Date().toISOString();
  const updated = await db.updatePayrollRecord(record.id, school.id, { status: 'paid', paidBy: user.id, paidAt, paidDate: paidAt.slice(0, 10) });
  db.logAudit({ action: 'PAYROLL_PAID', category: 'finance', schoolId: school.id, schoolName: school.name, userId: user.id, userName: user.fullName, userRole: user.role, details: `Marked payroll paid for ${record.staffName}, ${record.payrollMonth}.`, severity: 'warning' });
  await db.flush(); res.json(updated);
});

apiRouter.get('/payroll/:id/payslip.pdf', requireAuth, requireSchoolContext, async (req, res) => {
  const user = (req as any).user as User; const school = (req as any).school as School;
  if (!['school_admin', 'accountant', 'teacher', 'super_admin'].includes(user.role)) { res.status(403).json({ error: 'Payslip access is limited to school staff.' }); return; }
  const record = (await db.getPayrollRecords(school.id)).find(item => item.id === req.params.id);
  if (!record || record.userId !== user.id && !['accountant', 'super_admin'].includes(user.role)) { res.status(403).json({ error: 'Payslip access is limited to your own payroll record.' }); return; }
  const line = (item: any) => `${item.label}: ${formatMoney(Number(item.amount) || 0, school.currency)}`;
  sendPdf(res, `payslip-${record.staffName}-${record.payrollMonth}`, [[school.name, 'PAYSLIP', `Staff: ${record.staffName}`, `Month: ${record.payrollMonth}`, `Status: ${record.status}`,
    `Base salary: ${formatMoney(record.baseSalary, school.currency)}`, 'Allowances:', ...(Array.isArray(record.allowances) ? record.allowances.map(line) : []),
    `Allowance total: ${formatMoney(record.allowanceTotal || 0, school.currency)}`, 'Deductions:', ...(Array.isArray(record.deductions) ? record.deductions.map(line) : []),
    `Deduction total: ${formatMoney(record.deductionTotal || 0, school.currency)}`, `Net salary: ${formatMoney(record.netSalary, school.currency)}`]]);
});

apiRouter.get('/fees/arrears', requireAuth, requireAccountantOrSuperAdmin, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  res.json(await db.getArrearsList(school.id));
});

// ==============================================================================
// 8. REPORT CARD DESIGNER
// ==============================================================================

apiRouter.get('/report-card/design', requireAuth, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  res.json(await db.getReportCardDesign(school.id));
});

apiRouter.put('/report-card/design', requireAuth, requireSchoolAdminOrSuperAdmin, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const user = (req as any).user as User;
  try {
    const updates = sanitizeReportCardDesign(req.body);
    const updated = await db.updateReportCardDesign(school.id, updates);
    db.logAudit({
      action: 'REPORT_CARD_DESIGN_UPDATED',
      category: 'academics',
      schoolId: school.id,
      schoolName: school.name,
      userId: user.id,
      userName: user.fullName,
      userRole: user.role,
      details: `Report card design updated: template=${updated.templateId}, colors=${updated.primaryColor}/${updated.secondaryColor}, template fields and images saved.`,
      severity: 'info'
    });
    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Report card design could not be saved.' });
  }
});

apiRouter.get('/report-cards/:studentId/pdf', requireAuth, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const user = (req as any).user as User;
  const student = await db.getStudentById(req.params.studentId, school.id);
  if (!student || !await canAccessStudentRecord(user, student.id)) { res.status(404).json({ error: 'Student report card not found.' }); return; }
  const [rankings, design, klass] = await Promise.all([db.getClassYearlyRankings(school.id, student.classId), db.getReportCardDesign(school.id), db.getClassById(student.classId, school.id)]);
  const result = rankings.find(row => row.student.id === student.id);
  if (!result) { res.status(404).json({ error: 'Student report card not found.' }); return; }
  const pages = [buildReportCardPdfPage({
    school,
    design,
    className: `${klass?.name || ''} ${klass?.section || ''}`.trim(),
    result,
    totalStudents: rankings.length
  })];
  sendPdf(res, `report-card-${student.studentId}`, pages);
});

apiRouter.get('/report-cards/classes/:classId/pdf', requireAuth, requireSchoolAdminOrSuperAdmin, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const klass = await db.getClassById(req.params.classId, school.id);
  if (!klass) { res.status(404).json({ error: 'Class not found.' }); return; }
  const [rankings, design] = await Promise.all([db.getClassYearlyRankings(school.id, klass.id), db.getReportCardDesign(school.id)]);
  if (!rankings.length) { res.status(404).json({ error: 'No students were found in this class.' }); return; }
  const pages = rankings.map(result => buildReportCardPdfPage({
    school,
    design,
    className: `${klass.name} ${klass.section}`.trim(),
    result,
    totalStudents: rankings.length
  }));
  sendPdf(res, `report-cards-${klass.name}-${klass.section}`, pages);
});

apiRouter.get('/fees/payments/:paymentId/receipt.pdf', requireAuth, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const payment = await db.getFeePaymentById(req.params.paymentId, school.id);
  if (!payment) { res.status(404).json({ error: 'Receipt not found.' }); return; }
  const user = (req as any).user as User;
  if (!['accountant', 'super_admin'].includes(user.role) && !(await canAccessStudentRecord(user, payment.studentId))) { res.status(403).json({ error: 'You do not have access to this student fee record.' }); return; }
  const student = await db.getStudentById(payment.studentId, school.id);
  if (!student) { res.status(404).json({ error: 'Receipt student not found.' }); return; }
  const [klass, feeStructures] = await Promise.all([db.getClassById(student.classId, school.id), db.getFeeStructures(school.id)]);
  const feeName = payment.feeStructureId ? feeStructures.find(item => item.id === payment.feeStructureId)?.name : undefined;
  sendPdf(res, `receipt-${payment.receiptNumber}`, [[
    school.receiptHeader || '', school.name, school.address || '', school.phone ? `Tel: ${school.phone}` : '', payment.voidedAt ? `VOIDED CASH RECEIPT �?" ${payment.voidReason || 'No reason recorded'}` : 'OFFICIAL CASH RECEIPT',
    `Receipt number: ${payment.receiptNumber}`, `Date: ${payment.date}`, `Student: ${student.firstName} ${student.lastName}`,
    `Student ID: ${student.studentId}`, `Class: ${klass?.name || ''} ${klass?.section || ''}`, `Billing period: ${payment.month}`,
    `Fee type: ${feeName || payment.feeType}`, `Amount due: ${formatMoney(payment.amountDue, school.currency)}`,
    `Cash received: ${formatMoney(payment.amountPaid, school.currency)}`, `Balance: ${formatMoney(payment.remainingAmount, school.currency)}`,
    'Payment channel: Cash only', '', 'Cashier signature: ____________________', 'Official School Stamp: ____________________',
    ...(school.receiptFooter ? ['', school.receiptFooter] : [])
  ]]);
});

// ==============================================================================
// 9. COMMUNICATION & NOTIFICATIONS QUEUE
// ==============================================================================

apiRouter.get('/communication/settings', requireAuth, requireSchoolContext, requireSchoolAdminOrSuperAdmin, async (req, res) => {
  const school = (req as any).school;
  res.json(await db.getCommunicationSettings(school.id));
});

apiRouter.put('/communication/settings', requireAuth, requireSchoolAdminOrSuperAdmin, requireSchoolContext, async (req, res) => {
  const school = (req as any).school as School;
  const user = (req as any).user as User;
  const body = req.body || {};
  const provider = body.provider;
  if (!['twilio', 'infobip', 'local_gateway', 'whatsapp_business', 'none'].includes(provider)) { res.status(400).json({ error: 'Choose a supported notification provider.' }); return; }
  if (body.isActive !== undefined && typeof body.isActive !== 'boolean') { res.status(400).json({ error: 'Gateway activation must be true or false.' }); return; }
  const optionalCredentials = ['apiKey', 'apiSecret', 'senderId', 'webhookUrl'] as const;
  for (const field of optionalCredentials) {
    if (body[field] !== undefined && (typeof body[field] !== 'string' || body[field].length > 2048)) {
      res.status(400).json({ error: 'Notification gateway credentials contain invalid values.' });
      return;
    }
  }
  const updated = await db.updateCommunicationSettings(school.id, {
    provider,
    ...(body.isActive === undefined ? {} : { isActive: body.isActive }),
    ...Object.fromEntries(optionalCredentials.filter(field => body[field] !== undefined).map(field => [field, body[field].trim()]))
  });
  db.logAudit({
    action: 'COMMUNICATION_SETTINGS_UPDATED',
    category: 'school',
    schoolId: school.id,
    schoolName: school.name,
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    details: `Updated notification gateway to ${updated.provider} (${updated.isActive ? 'active' : 'inactive'}).`,
    severity: 'info'
  });
  res.json(updated);
});

apiRouter.get('/communication/queue', requireAuth, requireSchoolContext, requireSchoolAdminOrSuperAdmin, (req, res) => {
  const school = (req as any).school;
  void sendDatabasePage(req, res, 'communication_queue', { school_id: school.id });
});

apiRouter.post('/communication/send', requireAuth, requireSchoolContext, requireSchoolAdminOrSuperAdmin, async (req, res) => {
  const school = (req as any).school;
  const body = req.body || {};
  const recipientPhone = typeof body.recipientPhone === 'string' ? body.recipientPhone.trim() : '';
  const recipientName = typeof body.recipientName === 'string' ? body.recipientName.trim() : '';
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  const messageTypes = ['attendance_absent', 'fee_due', 'notice', 'exam_result', 'custom'];
  if (recipientPhone.length < 3 || recipientPhone.length > 50 || !recipientName || recipientName.length > 120 ||
      !content || content.length > 1600 || !messageTypes.includes(body.messageType) ||
      !['sms', 'whatsapp'].includes(body.channel) ||
      (body.studentId !== undefined && (typeof body.studentId !== 'string' || body.studentId.length > 64))) {
    res.status(400).json({ error: 'Recipient, message type, channel and message content are required and must be valid.' });
    return;
  }
  if (body.studentId && !(await db.getStudentById(body.studentId, school.id))) {
    res.status(400).json({ error: 'The selected student does not belong to this school.' });
    return;
  }
  const item = await db.queueNotification({
    recipientPhone, recipientName, content, messageType: body.messageType, channel: body.channel,
    ...(body.studentId ? { studentId: body.studentId } : {}), schoolId: school.id
  });
  res.status(201).json(item);
});

// ==============================================================================
// 10. NOTICES, MESSAGES, SUPPORT & SCHOOL BACKUP
// ==============================================================================

apiRouter.get('/notices', requireAuth, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const user = (req as any).user as User;
  const filters: Record<string, any> = { school_id: school.id, is_active: true };
  if (!['school_admin', 'super_admin', 'accountant'].includes(user.role)) {
    const audience = user.role === 'teacher' ? 'teachers' : user.role === 'parent' ? 'parents' : 'students';
    const classIds = await getNoticeClassIds(school.id, user);
    const terms = ['audience.eq.all', 'audience.eq.school', `audience.eq.${audience}`];
    if (classIds.length) terms.push(`and(audience.eq.class,class_id.in.(${[...new Set(classIds)].join(',')}))`);
    await sendDatabasePage(req, res, 'school_notices', filters, terms.join(','));
    return;
  }
  await sendDatabasePage(req, res, 'school_notices', filters);
});

apiRouter.post('/notices', requireAuth, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const user = (req as any).user as User;
  if (!['school_admin', 'super_admin'].includes(user.role)) return res.status(403).json({ error: 'Only a School Admin can manage notices.' });
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
  const audience = req.body?.audience;
  const classId = typeof req.body?.classId === 'string' ? req.body.classId : undefined;
  if (!['all', 'school', 'teachers', 'parents', 'students', 'class'].includes(audience)) return res.status(400).json({ error: 'Choose a supported notice audience.' });
  if (!title || title.length > 200 || !content || content.length > 10000) return res.status(400).json({ error: 'Notice title and content are required and must be within the allowed length.' });
  if (audience === 'class' && (!classId || !(await db.getClassById(classId, school.id)))) return res.status(400).json({ error: 'A valid class is required for a class notice.' });
  if (req.body?.isPinned !== undefined && typeof req.body.isPinned !== 'boolean') return res.status(400).json({ error: 'Pinned must be true or false.' });
  const notice = db.createNotice({
    title, content, audience, ...(audience === 'class' ? { classId } : {}),
    isPinned: req.body?.isPinned === true,
    publishDate: typeof req.body?.publishDate === 'string' && !Number.isNaN(Date.parse(req.body.publishDate)) ? req.body.publishDate : new Date().toISOString(),
    schoolId: school.id, authorName: user.fullName, authorRole: user.role, isActive: true
  });
  res.status(201).json(notice);
});

apiRouter.put('/notices/:id', requireAuth, requireSchoolContext, async (req, res) => {
  const user = (req as any).user as User;
  const school = (req as any).school;
  if (!['school_admin', 'super_admin'].includes(user.role)) return res.status(403).json({ error: 'Only a School Admin can manage notices.' });
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
  const audience = req.body?.audience;
  const classId = typeof req.body?.classId === 'string' ? req.body.classId : undefined;
  if (!title || title.length > 200 || !content || content.length > 10000 || !['all', 'school', 'class', 'teachers', 'parents', 'students'].includes(audience)) return res.status(400).json({ error: 'Valid notice title, content and audience are required.' });
  if (audience === 'class' && (!classId || !(await db.getClassById(classId, school.id)))) return res.status(400).json({ error: 'A valid class is required for a class notice.' });
  if (req.body?.isPinned !== undefined && typeof req.body.isPinned !== 'boolean') return res.status(400).json({ error: 'Pinned must be true or false.' });
  const updated = await db.updateNotice(req.params.id, school.id, {
    title, content, audience, ...(audience === 'class' ? { classId } : { classId: undefined }),
    isPinned: req.body?.isPinned === true
  });
  if (!updated) return res.status(404).json({ error: 'Notice not found.' });
  res.json(updated);
});

apiRouter.delete('/notices/:id', requireAuth, requireSchoolContext, async (req, res) => {
  const user = (req as any).user as User;
  if (!['school_admin', 'super_admin'].includes(user.role)) return res.status(403).json({ error: 'Only a School Admin can manage notices.' });
  const archived = await db.archiveNotice(req.params.id, (req as any).school.id);
  if (!archived) return res.status(404).json({ error: 'Notice not found.' });
  res.json({ success: true });
});

apiRouter.get('/notices/unread-count', requireAuth, requireSchoolContext, async (req, res) => {
  const user = (req as any).user as User;
  const schoolId = (req as any).school.id;
  const classIds = user.role === 'teacher' ? user.assignedClassIds || [] : [];
  res.json({ count: await db.getNoticeUnreadCount(schoolId, user.id, user.role, classIds, user) });
});

apiRouter.post('/notices/read-batch', requireAuth, requireSchoolContext, async (req, res) => {
  const user = (req as any).user as User;
  const schoolId = (req as any).school.id;
  const noticeIds = req.body?.noticeIds;
  if (!Array.isArray(noticeIds) || noticeIds.length > 100 || noticeIds.some((id: unknown) => typeof id !== 'string' || !id.trim())) {
    res.status(400).json({ error: 'Provide up to 100 valid notice IDs.' });
    return;
  }
  const classIds = await getNoticeClassIds(schoolId, user);
  const count = await db.markNoticesRead(schoolId, noticeIds, user.id, user.role, classIds);
  res.json({ success: true, count });
});

apiRouter.post('/notices/:id/read', requireAuth, requireSchoolContext, async (req, res) => {
  const user = (req as any).user as User;
  const schoolId = (req as any).school.id;
  const notice = (await db.getNotices(schoolId)).find(item => item.id === req.params.id && item.isActive !== false);
  if (!notice) return res.status(404).json({ error: 'Notice not found.' });
  const roleAudience = user.role === 'teacher' ? 'teachers' : user.role === 'parent' ? 'parents' : 'students';
  const classIds = await getNoticeClassIds(schoolId, user);
  const visible = ['school_admin', 'super_admin', 'accountant'].includes(user.role) || ['all', 'school', roleAudience].includes(notice.audience) || notice.audience === 'class' && Boolean(notice.classId && classIds.includes(notice.classId));
  if (!visible) return res.status(403).json({ error: 'This notice is not addressed to your account.' });
  res.json({ success: await db.markNoticeRead(schoolId, notice.id, user.id) });
});

apiRouter.get('/messages/contacts', requireAuth, requireSchoolContext, async (req, res) => {
  const user = (req as any).user as User;
  const school = (req as any).school;
  const users = await db.getUsers(school.id);
  const allowedRoles: Record<string, string[]> = {
    school_admin: ['teacher', 'parent'], super_admin: ['teacher', 'parent'], teacher: ['parent'], parent: ['teacher', 'student'], student: ['parent']
  };
  let contacts = users.filter(contact => (allowedRoles[user.role] || []).includes(contact.role) && contact.id !== user.id);
  if (user.role === 'teacher') {
    const students = await db.getStudents(school.id);
    const teacherRecord = (await db.getTeachers(school.id)).find(teacher => teacher.userId === user.id);
    const assignedClassIds = user.assignedClassIds?.length ? user.assignedClassIds : teacherRecord?.assignedClasses || [];
    const assignedStudents = students.filter(student => assignedClassIds.includes(student.classId));
    const assignedStudentIds = new Set(assignedStudents.map(student => student.id));
    const phones = new Set(assignedStudents.flatMap(student => [student.fatherPhone, student.motherPhone]).filter(Boolean));
    contacts = contacts.filter(contact => contact.role !== 'parent' || (contact.linkedStudentIds || []).some(id => assignedStudentIds.has(id)) || Boolean(contact.phone && phones.has(contact.phone)) || Boolean(contact.parentPhone && phones.has(contact.parentPhone)));
  }
  if (user.role === 'parent') {
    const linkedStudents = (await db.getStudents(school.id)).filter(student => user.linkedStudentIds?.includes(student.id) || [user.phone, user.parentPhone].includes(student.fatherPhone || '') || [user.phone, user.parentPhone].includes(student.motherPhone || ''));
    const linkedIds = new Set(linkedStudents.flatMap(student => [student.id, student.studentId]));
    const linkedClasses = new Set(linkedStudents.map(student => student.classId));
    const teachers = await db.getTeachers(school.id);
    contacts = contacts.filter(contact => contact.role === 'student'
      ? Boolean(contact.studentId && linkedIds.has(contact.studentId))
      : contact.role !== 'teacher' || Boolean((contact.assignedClassIds?.length ? contact.assignedClassIds : teachers.find(teacher => teacher.userId === contact.id)?.assignedClasses || []).some(classId => linkedClasses.has(classId))));
  }
  if (user.role === 'student') {
    const student = (await db.getStudents(school.id)).find(item => item.studentId === user.studentId || item.id === user.id.replace(/^usr-student-/, 'std-'));
    contacts = contacts.filter(contact => contact.role !== 'parent' || Boolean(student && (contact.linkedStudentIds?.includes(student.id) || [contact.phone, contact.parentPhone].includes(student.fatherPhone || '') || [contact.phone, contact.parentPhone].includes(student.motherPhone || ''))));
  }
  res.json(contacts.map(({ id, role, fullName, email, phone }) => ({ id, role, fullName, email, phone })));
});

apiRouter.get('/messages', requireAuth, requireSchoolContext, (req, res) => {
  const school = (req as any).school;
  const user = (req as any).user as User;
  void sendDatabasePage(req, res, 'direct_messages', { school_id: school.id }, 'sender_id.eq.' + user.id + ',recipient_id.eq.' + user.id);
});

apiRouter.post('/messages', requireAuth, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  const user = (req as any).user as User;
  const { recipientId, content } = req.body || {};
  if (typeof content !== 'string' || !content.trim() || content.length > 5000 || typeof recipientId !== 'string') return res.status(400).json({ error: 'A recipient and a message of 1–5000 characters are required.' });
  const recipient = await db.getUserById(recipientId, school.id);
  if (!recipient || recipient.id === user.id) return res.status(404).json({ error: 'Message recipient was not found in this school.' });
  const allowed: Record<string, string[]> = { school_admin: ['teacher', 'parent'], super_admin: ['teacher', 'parent'], teacher: ['parent'], parent: ['teacher', 'student'], student: ['parent'] };
  if (!(allowed[user.role] || []).includes(recipient.role)) return res.status(403).json({ error: 'This direct-message role pairing is not allowed.' });
  if (user.role === 'parent' && recipient.role === 'student') {
    const linkedStudent = (await db.getStudents(school.id)).find(student => student.studentId === recipient.studentId || student.id === recipient.studentId);
    if (!linkedStudent || !(user.linkedStudentIds?.includes(linkedStudent.id) || [user.phone, user.parentPhone].includes(linkedStudent.fatherPhone || '') || [user.phone, user.parentPhone].includes(linkedStudent.motherPhone || ''))) return res.status(403).json({ error: 'Parents may message only their linked students.' });
  }
  if (user.role === 'teacher' && recipient.role === 'parent') {
    const teacherRecord = (await db.getTeachers(school.id)).find(teacher => teacher.userId === user.id);
    const assignedClassIds = new Set(user.assignedClassIds?.length ? user.assignedClassIds : teacherRecord?.assignedClasses || []);
    const linkedIds = new Set(recipient.linkedStudentIds || []);
    const students = await db.getStudents(school.id);
    const allowed = students.some(student => assignedClassIds.has(student.classId) && (linkedIds.has(student.id) || [recipient.phone, recipient.parentPhone].includes(student.fatherPhone || '') || [recipient.phone, recipient.parentPhone].includes(student.motherPhone || '')));
    if (!allowed) return res.status(403).json({ error: 'Teachers may message only parents of students in their assigned classes.' });
  }
  if (user.role === 'parent' && recipient.role === 'teacher') {
    const linkedIds = new Set(user.linkedStudentIds || []);
    const linkedStudents = (await db.getStudents(school.id)).filter(student => linkedIds.has(student.id) || [user.phone, user.parentPhone].includes(student.fatherPhone || '') || [user.phone, user.parentPhone].includes(student.motherPhone || ''));
    const teacherRecord = (await db.getTeachers(school.id)).find(teacher => teacher.userId === recipient.id);
    const teacherClasses = new Set(recipient.assignedClassIds?.length ? recipient.assignedClassIds : teacherRecord?.assignedClasses || []);
    if (!linkedStudents.some(student => teacherClasses.has(student.classId))) return res.status(403).json({ error: 'Parents may message only teachers assigned to their children.' });
  }
  if (user.role === 'student' && recipient.role === 'parent') {
    const student = (await db.getStudents(school.id)).find(item => item.studentId === user.studentId || item.id === user.id.replace(/^usr-student-/, 'std-'));
    if (!student || !(recipient.linkedStudentIds?.includes(student.id) || [recipient.phone, recipient.parentPhone].includes(student.fatherPhone || '') || [recipient.phone, recipient.parentPhone].includes(student.motherPhone || ''))) return res.status(403).json({ error: 'Students may message only their linked parent.' });
  }
  const msg = db.sendMessage({
    recipientId: recipient.id,
    recipientName: recipient.fullName,
    recipientRole: recipient.role,
    content: content.trim(),
    schoolId: school.id,
    senderId: user.id,
    senderName: user.fullName,
    senderRole: user.role
  });
  res.status(201).json(msg);
});

apiRouter.post('/messages/read', requireAuth, requireSchoolContext, async (req, res) => {
  const user = (req as any).user as User;
  const contactId = String(req.body?.contactId || '');
  const contact = await db.getUserById(contactId, (req as any).school.id);
  if (!contact) return res.status(404).json({ error: 'Message contact was not found in this school.' });
  await db.markMessagesRead((req as any).school.id, user.id, contactId);
  res.json({ success: true });
});

apiRouter.get('/support/tickets', requireAuth, (req, res) => {
  const user = (req as any).user as User;
  if (user.role === 'super_admin') {
    void sendDatabasePage(req, res, 'support_tickets', {});
    return;
  }
  if (!user.schoolId) {
    res.status(403).json({ error: 'A school account is required to view support tickets.' });
    return;
  }
  const filters: Record<string, string | string[] | undefined> = { school_id: user.schoolId };
  // Only school administrators can inspect every ticket in their tenant.
  // Other roles see only tickets they personally created.
  if (user.role !== 'school_admin') filters.created_by_user_id = user.id;
  void sendDatabasePage(req, res, 'support_tickets', filters);
});

apiRouter.post('/support/tickets', requireAuth, requireSchoolContextForSupportWrite, async (req, res) => {
  const user = (req as any).user as User;
  const body = req.body || {};
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const priority = body.priority ?? 'medium';
  if (!subject || subject.length > 200 || !description || description.length > 10000 ||
      !['low', 'medium', 'high', 'urgent'].includes(priority)) {
    res.status(400).json({ error: 'A valid ticket subject, description and priority are required.' });
    return;
  }
  const school = user.schoolId ? await db.getSchoolById(user.schoolId) : null;

  const ticket = await db.createTicket({
    schoolId: user.schoolId,
    schoolName: school?.name,
    createdByUserId: user.id,
    createdByName: user.fullName,
    createdByRole: user.role,
    subject,
    description,
    priority,
    status: 'open'
  }, description);

  res.status(201).json(ticket);
});

apiRouter.post('/support/tickets/:id/reply', requireAuth, requireSchoolContextForSupportWrite, async (req, res) => {
  const user = (req as any).user as User;
  const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
  if (!content || content.length > 5000) {
    res.status(400).json({ error: 'A support reply of 1–5000 characters is required.' });
    return;
  }
  const ticket = await db.replyTicket(req.params.id, {
    senderId: user.id,
    senderName: user.fullName,
    senderRole: user.role,
    content
  }, user.role === 'super_admin' ? undefined : user.schoolId, user.role === 'school_admin' || user.role === 'super_admin' ? undefined : user.id);
  if (!ticket) {
    res.status(404).json({ error: 'Ticket not found' });
    return;
  }
  res.json(ticket);
});

// School Data Backup
apiRouter.get('/school/backup', requireAuth, requireSchoolAdminOrSuperAdmin, requireSchoolContext, async (req, res) => {
  const school = (req as any).school as School;
  const user = (req as any).user as User;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Disposition', 'attachment; filename="school-backup.json"');
  db.logAudit({
    action: 'SCHOOL_BACKUP_DOWNLOADED',
    category: 'security',
    schoolId: school.id,
    schoolName: school.name,
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    details: `Downloaded a data backup for ${school.name}.`,
    severity: 'warning'
  });
  res.json(await db.generateSchoolBackup(school.id));
});

// ==============================================================================
// 6. GLOBAL USERS & USER MANAGEMENT
// ==============================================================================

apiRouter.get('/users', requireAuth, requireSchoolAdminOrSuperAdmin, (req, res) => {
  const user = (req as any).user as User;
  let schoolId = req.query.schoolId as string;
  if (user.role !== 'super_admin') {
    schoolId = user.schoolId!;
  }
  void sendDatabasePage(req, res, 'users', { school_id: schoolId }, undefined, sanitizeUsers);
});

apiRouter.post('/users/:id/reset-password', requireAuth, requireSchoolAdminOrSuperAdmin, async (req, res) => {
  const user = (req as any).user as User;
  const targetUser = await db.getUserById(req.params.id, user.role === 'super_admin' ? undefined : user.schoolId);
  if (!targetUser) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  if (user.role !== 'super_admin' && targetUser.schoolId !== user.schoolId) {
    res.status(403).json({ error: 'Cross-school access denied.' });
    return;
  }
  if (!['school_admin', 'accountant', 'teacher'].includes(targetUser.role)) {
    res.status(403).json({ error: 'Only staff account passwords can be reset here.' });
    return;
  }
  const temporaryPassword = randomBytes(18).toString('base64url');
  const updatedUser = db.updateUser(targetUser.id, {
    failedLoginAttempts: 0,
    lockedUntil: null,
    passwordHash: hashPassword(temporaryPassword),
    mustChangePassword: true
  });
  if (!updatedUser) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  invalidateAuthenticatedSnapshot(targetUser.id);
  db.logAudit({
    action: 'ADMIN_PASSWORD_RESET',
    category: 'auth',
    schoolId: targetUser.schoolId,
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    details: `Password reset for user ${targetUser.fullName} (${targetUser.email || targetUser.phone}).`,
    severity: 'warning'
  });
  res.json({ success: true, temporaryPassword, mustChangePassword: true });
});

apiRouter.post('/users/:id/toggle-block', requireAuth, requireSuperAdmin, async (req, res) => {
  const targetUser = await db.getUserById(req.params.id, (req as any).user.role === 'super_admin' ? undefined : (req as any).user.schoolId);
  if (!targetUser) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  const newStatus = typeof req.body?.isBlocked === 'boolean' ? req.body.isBlocked : !targetUser.isBlocked;
  const updatedUser = db.updateUser(targetUser.id, { isBlocked: newStatus });
  if (!updatedUser) { res.status(404).json({ error: 'User not found.' }); return; }
  invalidateAuthenticatedSnapshot(targetUser.id);
  db.logAudit({
    action: newStatus ? 'USER_BLOCKED' : 'USER_UNBLOCKED',
    category: 'security',
    userId: (req as any).user.id,
    userName: (req as any).user.fullName,
    userRole: 'super_admin',
    details: `User ${targetUser.fullName} was ${newStatus ? 'blocked' : 'unblocked'} by Super Admin.`,
    severity: 'warning'
  });
  res.json({ success: true, isBlocked: newStatus });
});

// Batch Invoices Generation (Super Admin)
apiRouter.post('/superadmin/invoices/generate', requireAuth, requireSuperAdmin, async (_req, res) => {
  const schools = await db.getSchools();
  const plans = db.getPlans();
  let generated = 0;
  for (const s of schools) {
    const p = plans.find(plan => plan.id === s.subscription?.plan);
    const amount = s.subscription?.cadence === 'yearly' ? (p?.yearlyPrice || 890) : (p?.monthlyPrice || 89);
    db.createSubscriptionInvoice({
      schoolId: s.id,
      schoolName: s.name,
      plan: s.subscription?.plan || 'standard',
      cadence: s.subscription?.cadence || 'monthly',
      amount,
      invoiceNumber: `INV-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`,
      currency: db.getSettings().platformCurrency,
      issuedDate: new Date().toISOString().split('T')[0],
      status: 'unpaid',
      dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
    });
    generated++;
  }
  res.json({ success: true, count: generated });
});

// Extra Modules: Library & Transport
apiRouter.get('/school/library', requireAuth, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  res.json(await db.getLibraryBooks(school.id));
});

apiRouter.post('/school/library', requireAuth, requireSchoolContext, requireSchoolAdminOrSuperAdmin, async (req, res) => {
  const school = (req as any).school;
  const body = req.body || {};
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const author = typeof body.author === 'string' ? body.author.trim() : '';
  const isbn = typeof body.isbn === 'string' ? body.isbn.trim() : '';
  const quantity = Number(body.quantity ?? 1);
  if (!title || title.length > 255 || author.length > 255 || isbn.length > 50 ||
      !Number.isInteger(quantity) || quantity < 1 || quantity > 100000) {
    res.status(400).json({ error: 'Book title, author, ISBN or quantity is invalid.' });
    return;
  }
  try {
    const book = await db.addLibraryBook({ title, author, isbn, quantity, schoolId: school.id });
    res.status(201).json(book);
  } catch (error: any) {
    if (String(error?.message || '').includes('ISBN already exists')) {
      res.status(409).json({ error: error.message });
      return;
    }
    throw error;
  }
});

apiRouter.get('/school/transport', requireAuth, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  res.json(await db.getTransportRoutes(school.id));
});

apiRouter.put('/school/settings', requireAuth, requireSchoolAdminOrSuperAdmin, requireSchoolContext, (req, res) => {
  const school = (req as any).school as School;
  const user = (req as any).user as User;
  let updates: Partial<School>;
  try {
    updates = sanitizeSchoolSettings(req.body);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'School settings are invalid.' });
    return;
  }
  if (!Object.keys(updates).length) {
    res.status(400).json({ error: 'Provide at least one school setting to update.' });
    return;
  }

  const updated = db.updateSchool(school.id, updates);
  if (!updated) {
    res.status(404).json({ error: 'School was not found.' });
    return;
  }
  db.logAudit({
    action: 'SCHOOL_SETTINGS_UPDATED',
    category: 'school',
    schoolId: school.id,
    schoolName: updated.name,
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    details: `Updated school configuration fields: ${Object.keys(updates).join(', ')}.`,
    severity: 'info'
  });
  res.json(updated);
});

apiRouter.post('/school/transport', requireAuth, requireSchoolContext, requireSchoolAdminOrSuperAdmin, async (req, res) => {
  const school = (req as any).school;
  const body = req.body || {};
  const name = typeof body.name === 'string' ? body.name.trim() : typeof body.routeName === 'string' ? body.routeName.trim() : '';
  const routeNumber = typeof body.routeNumber === 'string' ? body.routeNumber.trim() : '';
  const vehicleNumber = typeof body.vehicleNumber === 'string' ? body.vehicleNumber.trim() : '';
  const driverName = typeof body.driverName === 'string' ? body.driverName.trim() : '';
  const driverPhone = typeof body.driverPhone === 'string' ? body.driverPhone.trim() : '';
  const feeAmount = Number(body.feeAmount ?? body.monthlyFee ?? 0);
  const stops = body.stops ?? [];
  if (!name || name.length > 150 || routeNumber.length > 50 || vehicleNumber.length > 80 ||
      driverName.length > 150 || driverPhone.length > 50 || !Number.isFinite(feeAmount) || feeAmount < 0 ||
      !Array.isArray(stops) || stops.length > 100 ||
      stops.some((stop: unknown) => typeof stop !== 'string' || !stop.trim() || stop.length > 150) ||
      (body.active !== undefined && typeof body.active !== 'boolean')) {
    res.status(400).json({ error: 'Transport route details are invalid.' });
    return;
  }
  const route = await db.addTransportRoute({
    name, routeNumber, vehicleNumber, driverName, driverPhone,
    stops: stops.map((stop: string) => stop.trim()), feeAmount,
    active: body.active !== false, schoolId: school.id
  });
  res.status(201).json(route);
});

apiRouter.get('/bus/assignments', requireAuth, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  res.json(await db.getBusAssignments(school.id));
});

apiRouter.put('/bus/assignments/:studentId', requireAuth, requireSchoolAdminOrSuperAdmin, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  try {
    res.json(await db.setBusAssignment(school.id, req.params.studentId, String(req.body?.routeId || '')));
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Bus assignment could not be saved.' });
  }
});

apiRouter.delete('/bus/assignments/:studentId', requireAuth, requireSchoolAdminOrSuperAdmin, requireSchoolContext, async (req, res) => {
  const school = (req as any).school;
  res.json({ success: await db.removeBusAssignment(school.id, req.params.studentId) });
});

forwardAsyncErrors(apiRouter);
