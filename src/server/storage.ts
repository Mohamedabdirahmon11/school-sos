/**
 * Multi-Tenant Persistent Storage & Rule Engine for SchoolOS
 * Handles database operations, tenant scoping, Supabase synchronization,
 * subscription state machine, lockout protection, once-per-day attendance,
 * percentage-based small/big exam grading, cash-only fees, and audit logging.
 */

import {
  School,
  SchoolBranch,
  User,
  Student,
  Teacher,
  SchoolClass,
  Subject,
  TimetableSlot,
  AttendanceRecord,
  ExamConfig,
  StudentMark,
  PromotionRecord,
  FeePayment,
  FeeStructureItem,
  ReportCardDesign,
  SchoolNotice,
  PlatformBroadcast,
  SupportTicket,
  StaffMember,
  StaffPayrollRecord,
  AdmissionApplication,
  AuditLog,
  SuperAdminSettings,
  SubscriptionInvoice,
  PlanConfig,
  UserSession,
  Assignment,
  AssignmentSubmission,
  SchoolEvent,
  DirectMessage,
  CommunicationSettings,
  CommunicationQueueItem
} from '../types/index.ts';
import { DEFAULT_ATTENDANCE_RULES, DEFAULT_CLASS_LEVELS, DEFAULT_GRADING_SCALE, DEFAULT_NOTIFICATION_PREFERENCES, DEFAULT_TERMS } from './school-settings.ts';
import { randomInt, randomUUID } from 'node:crypto';
import { supabase, isSupabaseConfigured } from './supabase.ts';
import { hashPassword, hashPin, verifyPassword, verifyPin } from './auth-security.ts';
import { AsyncLocalStorage } from 'node:async_hooks';

interface DatabaseSchema {
  settings: SuperAdminSettings;
  plans: PlanConfig[];
  schools: School[];
  branches: SchoolBranch[];
  users: User[];
  sessions: UserSession[];
  students: Student[];
  teachers: Teacher[];
  classes: SchoolClass[];
  subjects: Subject[];
  timetable: TimetableSlot[];
  timetableSettings: any[];
  teacherUnavailability: any[];
  attendance: AttendanceRecord[];
  examConfigs: ExamConfig[];
  marks: StudentMark[];
  promotions: PromotionRecord[];
  feeStructures: FeeStructureItem[];
  feePayments: FeePayment[];
  reportCardDesigns: ReportCardDesign[];
  communicationSettings: CommunicationSettings[];
  communicationQueue: CommunicationQueueItem[];
  notices: SchoolNotice[];
  events: SchoolEvent[];
  messages: DirectMessage[];
  broadcasts: PlatformBroadcast[];
  tickets: SupportTicket[];
  invoices: SubscriptionInvoice[];
  auditLogs: AuditLog[];
  assignments: Assignment[];
  assignmentSubmissions: AssignmentSubmission[];
  staffMembers: StaffMember[];
  payrollRecords: StaffPayrollRecord[];
  admissionApplications: AdmissionApplication[];
  feeRanges: any[];
  busAssignments: any[];
  notificationTemplates: any[];
  promotionHistory: any[];
  restoreTestRecords: any[];
  lockoutCounterRows: any[];
  lockoutCounters: Record<string, { count: number; firstFailedAt: number; lockedUntil: number | null }>;
  libraryBooks: any[];
  transportRoutes: any[];
}

interface StorageContext {
  data: DatabaseSchema;
  initialized: boolean;
  writeQueue: Promise<void>;
  writeFailure: unknown;
  persistedIds: Map<string, Set<string>>;
  persistedRows: Map<string, Map<string, string>>;
  queryCount: number;
  queryDurationMs: number;
  routeLabel: string;
}

interface CachedAuthContext {
  user: User;
  school: School | null;
  expiresAt: number;
}

const AUTH_CONTEXT_TTL_MS = 60_000;
const BRANCH_LIST_TTL_MS = 60_000;
const NOTICE_COUNT_TTL_MS = 15_000;
const authContextCache = new Map<string, CachedAuthContext>();
const schoolContextCache = new Map<string, { school: School; expiresAt: number }>();
const branchListCache = new Map<string, { branches: SchoolBranch[]; expiresAt: number }>();
const noticeCountCache = new Map<string, { count: number; expiresAt: number }>();

// Avoid writing the session row on every API request. The signed cookie is
// refreshed each request, while the database expiry is extended at most once
// per minute (or 5% of shorter session lifetimes).
export function shouldTouchSession(currentExpiresAt: string, requestedExpiresAt: string, now = Date.now()): boolean {
  const current = Date.parse(currentExpiresAt);
  const requested = Date.parse(requestedExpiresAt);
  if (!Number.isFinite(current) || !Number.isFinite(requested)) return true;
  if (requested <= current) return requested < current;
  const timeoutMs = Math.max(1_000, requested - now);
  const refreshWindowMs = Math.min(60_000, Math.max(1_000, timeoutMs / 20));
  return requested - current >= refreshWindowMs;
}

const DEFAULT_SETTINGS: SuperAdminSettings = {
  trialDays: 7,
  graceDays: 7,
  platformCurrency: 'USD',
  readOnlyAfterExpiry: true,
  requireSuperAdmin2FA: false,
  lockoutThreshold: 5,
  lockoutDurationMinutes: 15,
  sessionTimeoutMinutes: 60,
  logSecurityEvents: true,
  backupSchedule: 'daily',
  lastBackupDate: new Date().toISOString(),
  lastBackupStatus: 'success',
  enabledLanguages: ['en', 'so'],
  academicYearName: '2026-2027',
  semester1Start: '2026-09-01',
  semester1End: '2027-01-20',
  semester2Start: '2027-02-01',
  semester2End: '2027-06-30'
};

const DEFAULT_PLANS: PlanConfig[] = [
  {
    id: 'basic',
    name: 'Basic',
    monthlyPrice: 39,
    yearlyPrice: 390,
    lifetimePrice: 1200,
    modules: ['students', 'teachers', 'classes', 'attendance', 'fees', 'notices', 'reports'],
    maxStudents: 300,
    maxTeachers: 20,
    supportLevel: 'community'
  },
  {
    id: 'standard',
    name: 'Standard',
    monthlyPrice: 89,
    yearlyPrice: 890,
    lifetimePrice: 2400,
    modules: ['students', 'teachers', 'classes', 'subjects', 'timetable', 'attendance', 'exams', 'fees', 'notices', 'messages', 'admissions', 'report_cards'],
    maxStudents: 1000,
    maxTeachers: 60,
    supportLevel: 'standard'
  },
  {
    id: 'premium',
    name: 'Premium Enterprise',
    monthlyPrice: 179,
    yearlyPrice: 1790,
    lifetimePrice: 4800,
    modules: ['students', 'teachers', 'parents', 'classes', 'subjects', 'timetable', 'attendance', 'exams', 'assignments', 'fees', 'events', 'notices', 'messages', 'admissions', 'staff', 'reports', 'report_cards', 'settings', 'promotion', 'sms_templates'],
    maxStudents: 5000,
    maxTeachers: 200,
    supportLevel: 'dedicated_24_7'
  }
];

const DB_COLUMN_ALIASES: Record<string, string> = {
  requireSuperAdmin2FA: 'require_super_admin_2fa',
  mustSetup2FA: 'must_setup_2fa',
  pin: 'pin_hash',
  pinHash: 'pin_hash',
  count: 'attempt_count'
};
const DB_FIELD_ALIASES = Object.fromEntries(Object.entries(DB_COLUMN_ALIASES).map(([field, column]) => [column, field]));
const TABLE_PRIMARY_KEY_COLUMNS: Record<string, string> = {
  timetable_settings: 'school_id',
  school_subscriptions: 'school_id'
};

function primaryKeyColumn(table: string): string {
  return TABLE_PRIMARY_KEY_COLUMNS[table] || 'id';
}

// Keep database naming decisions at the storage boundary. Most columns follow
// camelCase -> snake_case, while these fields have schema-specific names.
const TABLE_FIELD_MAP: Record<string, Record<string, string>> = {
  users: { pin: 'pin_hash', pinHash: 'pin_hash', staffId: 'staff_id', mustSetup2FA: 'must_setup_2fa', requireSuperAdmin2FA: 'require_super_admin_2fa' },
  students: { pinHash: 'pin_hash', studentId: 'student_id' },
  teachers: { userId: 'user_id', staffId: 'staff_id', assignedClasses: 'assigned_classes', assignedSubjects: 'assigned_subjects' },
  staff_members: { userId: 'user_id', roleTitle: 'role_title', monthlySalary: 'monthly_salary', joinedDate: 'joined_date', staffId: 'staff_id' },
  classes: { gradeLevel: 'grade_level', classTeacherId: 'class_teacher_id', roomNumber: 'room_number', monthlyFee: 'monthly_fee', isArchived: 'is_archived' },
  subjects: { creditUnits: 'credit_units', assignedTeacherIds: 'assigned_teacher_ids' },
  school_notices: { audience: 'audience', isPinned: 'is_pinned', publishDate: 'publish_date', authorName: 'author_name', authorRole: 'author_role', classId: 'class_id', isActive: 'is_active' },
  direct_messages: { recipientId: 'recipient_id', senderId: 'sender_id', senderRole: 'sender_role', senderName: 'sender_name', isRead: 'is_read' },
  fee_payments: { receiptNumber: 'receipt_number', studentId: 'student_id', feeType: 'fee_type', feeStructureId: 'fee_structure_id', idempotencyKey: 'idempotency_key', paymentMethod: 'payment_method', recordedBy: 'recorded_by', voidedAt: 'voided_at', voidedBy: 'voided_by', voidReason: 'void_reason', idempotencyKeys: 'idempotency_keys' }
};

const TABLE_DATA_KEYS: Record<string, keyof DatabaseSchema> = {
  plans: 'plans', schools: 'schools', school_branches: 'branches', users: 'users', user_sessions: 'sessions',
  students: 'students', teachers: 'teachers', classes: 'classes', subjects: 'subjects', timetable_slots: 'timetable',
  attendance_records: 'attendance', exam_configs: 'examConfigs', student_marks: 'marks', promotions: 'promotions',
  fee_structures: 'feeStructures', fee_payments: 'feePayments', report_card_templates: 'reportCardDesigns',
  communication_settings: 'communicationSettings', communication_queue: 'communicationQueue', school_notices: 'notices',
  school_events: 'events', direct_messages: 'messages', platform_broadcasts: 'broadcasts', support_tickets: 'tickets',
  subscription_invoices: 'invoices', audit_logs: 'auditLogs', assignments: 'assignments',
  assignment_submissions: 'assignmentSubmissions', staff_members: 'staffMembers', payroll_records: 'payrollRecords', admission_applications: 'admissionApplications', library_books: 'libraryBooks',
  transport_routes: 'transportRoutes', fee_ranges: 'feeRanges', bus_assignments: 'busAssignments',
  notification_templates: 'notificationTemplates', promotion_history: 'promotionHistory',
  restore_test_records: 'restoreTestRecords', lockout_counters: 'lockoutCounterRows'
};

function fromSupabaseRow(row: Record<string, any>): Record<string, any> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [DB_FIELD_ALIASES[key] || key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase()), value]));
}

export function mapStorageRowToDatabase(table: string, row: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === undefined || key === 'subscription' || key === 'pinHash' && row.pin !== undefined) continue;
    const column = TABLE_FIELD_MAP[table]?.[key] || DB_COLUMN_ALIASES[key] || key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    result[column] = value;
  }
  return result;
}

function toSupabaseRow(row: Record<string, any>, table = ''): Record<string, any> {
  return mapStorageRowToDatabase(table, row);
}

class StorageEngine {
  private contexts = new AsyncLocalStorage<StorageContext>();
  private feePaymentOperations = new Map<string, Promise<FeePayment>>();
  private feePaymentQueues = new Map<string, Promise<void>>();
  private globalContext: StorageContext = {
    data: this.createEmptySchema(), initialized: false, writeQueue: Promise.resolve(),
    writeFailure: null, persistedIds: new Map(), persistedRows: new Map(), queryCount: 0, queryDurationMs: 0, routeLabel: ''
  };
  private get state(): StorageContext { return this.contexts.getStore() || this.globalContext; }
  private get data(): DatabaseSchema { return this.state.data; }
  private set data(value: DatabaseSchema) { this.state.data = value; }
  private get initialized(): boolean { return this.state.initialized; }
  private set initialized(value: boolean) { this.state.initialized = value; }
  private get writeQueue(): Promise<void> { return this.state.writeQueue; }
  private set writeQueue(value: Promise<void>) { this.state.writeQueue = value; }
  private get writeFailure(): unknown { return this.state.writeFailure; }
  private set writeFailure(value: unknown) { this.state.writeFailure = value; }
  private get persistedIds(): Map<string, Set<string>> { return this.state.persistedIds; }
  private get persistedRows(): Map<string, Map<string, string>> { return this.state.persistedRows; }
  private testClient: any = null;
  private settingsCache: { expiresAt: number; value: SuperAdminSettings } | null = null;
  private plansCache: { expiresAt: number; value: PlanConfig[] } | null = null;

  constructor() {
    this.data = this.createEmptySchema();
  }

  private createEmptySchema(): DatabaseSchema {
    return {
      settings: { ...DEFAULT_SETTINGS },
      plans: [...DEFAULT_PLANS],
      schools: [],
      branches: [],
      users: [],
      sessions: [],
      students: [],
      teachers: [],
      classes: [],
      subjects: [],
      timetable: [],
      timetableSettings: [],
      teacherUnavailability: [],
      attendance: [],
      examConfigs: [],
      marks: [],
      promotions: [],
      feeStructures: [],
      feePayments: [],
      reportCardDesigns: [],
      communicationSettings: [],
      communicationQueue: [],
      notices: [],
      events: [],
      messages: [],
      broadcasts: [],
      tickets: [],
      invoices: [],
      auditLogs: [],
      assignments: [],
      assignmentSubmissions: [],
      staffMembers: [],
      payrollRecords: [],
      admissionApplications: [],
      feeRanges: [],
      busAssignments: [],
      notificationTemplates: [],
      promotionHistory: [],
      restoreTestRecords: [],
      lockoutCounterRows: [],
      libraryBooks: [],
      transportRoutes: [],
      lockoutCounters: {}
    };
  }

  public save() {
    if (!this.initialized) return;
    const snapshot = structuredClone(this.data);
    // Persist only rows known when this snapshot was captured. A read that
    // completes while this write waits in the queue must not make an older,
    // partial snapshot look like an intentional deletion.
    const persistedIds = new Map([...this.persistedIds].map(([table, ids]) => [table, new Set(ids)]));
    const persistedRows = new Map([...this.persistedRows].map(([table, rows]) => [table, new Map(rows)]));
    this.writeQueue = this.writeQueue.then(() => this.persistSnapshot(snapshot, persistedIds, persistedRows)).catch(error => {
      this.writeFailure = error;
    });
  }

  private recordQuery(table: string, operation: string, startedAt: number): void {
    const durationMs = performance.now() - startedAt;
    this.state.queryCount += 1;
    this.state.queryDurationMs += durationMs;
    if (process.env.NODE_ENV === 'development') {
      console.info(`[api-query] ${this.state.routeLabel || 'non-request'} ${table}.${operation} ${Math.round(durationMs)}ms`);
    }
  }

  private invalidateAuthContextsForSchool(schoolId: string): void {
    for (const [userId, context] of authContextCache) {
      if (context.user.schoolId === schoolId) authContextCache.delete(userId);
    }
  }

  private invalidateNoticeCounts(schoolId: string, userId?: string): void {
    const prefix = `${schoolId}:`;
    for (const key of noticeCountCache.keys()) {
      if (key.startsWith(prefix) && (!userId || key === `${schoolId}:${userId}`)) noticeCountCache.delete(key);
    }
  }

  public async flush(): Promise<void> {
    await this.writeQueue;
    if (this.writeFailure) {
      const failure = this.writeFailure;
      this.writeFailure = null;
      const wrapped = new Error(`Supabase persistence failed: ${failure instanceof Error ? failure.message : 'database write error'}`);
      if (failure && typeof failure === 'object') Object.assign(wrapped, { code: (failure as any).code, table: (failure as any).table, payloadKeys: (failure as any).payloadKeys });
      throw wrapped;
    }
  }

  public async bulkImportStudents(payload: Record<string, unknown>): Promise<void> {
    const client = this.testClient || supabase;
    if (!client || typeof client.rpc !== 'function') throw new Error('Atomic bulk import is unavailable.');
    const startedAt = performance.now();
    const { error } = await client.rpc('schoolos_bulk_import', { p_payload: payload });
    this.recordQuery('rpc:schoolos_bulk_import', 'call', startedAt);
    if (error) throw new Error(error.message || 'Bulk import transaction failed.');
  }

  public async initialize(clientOverride?: any): Promise<void> {
    const client = clientOverride || this.testClient || supabase;
    if (!client || (!isSupabaseConfigured && !clientOverride && !this.testClient)) {
      throw new Error('Supabase storage is unavailable. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, then run supabase/schema.sql.');
    }

    // Keep the explicitly installed test adapter persistent for unit tests.
    if (clientOverride || this.testClient) {
      const context = await this.createRequestContext();
      this.globalContext = context;
      await this.contexts.run(context, async () => {
        await Promise.all([
          this.queryRows<User>('users', { role: 'super_admin' }),
          this.primeStaticCaches()
        ]);
        this.ensureSeedData();
        await this.flush();
      });
      return;
    }

    // Startup validates the configured schema but deliberately keeps no hydrated
    // application cache. Each API request loads its own Supabase-backed context.
    const tableMap: Array<[keyof DatabaseSchema, string]> = [
      ['plans', 'plans'], ['schools', 'schools'], ['branches', 'school_branches'], ['users', 'users'],
      ['sessions', 'user_sessions'], ['students', 'students'], ['teachers', 'teachers'], ['classes', 'classes'],
      ['subjects', 'subjects'], ['timetable', 'timetable_slots'], ['attendance', 'attendance_records'],
      ['timetableSettings', 'timetable_settings'], ['teacherUnavailability', 'teacher_unavailability'],
      ['examConfigs', 'exam_configs'], ['marks', 'student_marks'], ['promotions', 'promotions'],
      ['feeStructures', 'fee_structures'], ['feePayments', 'fee_payments'], ['reportCardDesigns', 'report_card_templates'],
      ['communicationSettings', 'communication_settings'], ['communicationQueue', 'communication_queue'],
      ['notices', 'school_notices'], ['events', 'school_events'], ['messages', 'direct_messages'],
      ['broadcasts', 'platform_broadcasts'], ['tickets', 'support_tickets'], ['invoices', 'subscription_invoices'],
      ['auditLogs', 'audit_logs'], ['assignments', 'assignments'], ['assignmentSubmissions', 'assignment_submissions'],
      ['staffMembers', 'staff_members'], ['payrollRecords', 'payroll_records'], ['libraryBooks', 'library_books'], ['transportRoutes', 'transport_routes'],
      ['admissionApplications', 'admission_applications'],
      ['feeRanges', 'fee_ranges'], ['busAssignments', 'bus_assignments'], ['notificationTemplates', 'notification_templates'],
      ['promotionHistory', 'promotion_history'], ['restoreTestRecords', 'restore_test_records'], ['lockoutCounterRows', 'lockout_counters']
    ];
    for (const [, table] of tableMap) {
      const { error } = await client.from(table).select(primaryKeyColumn(table), { count: 'exact', head: true });
      if (error) throw new Error(`Unable to read Supabase table "${table}". Run supabase/schema.sql and check service-role access. ${error.message}`);
    }
    for (const table of ['super_admin_settings', 'school_subscriptions']) {
      const { error } = await client.from(table).select(primaryKeyColumn(table), { count: 'exact', head: true });
      if (error) throw new Error(`Unable to read Supabase table "${table}". Run supabase/schema.sql. ${error.message}`);
    }
    const context = await this.createRequestContext();
    await this.contexts.run(context, async () => {
      await Promise.all([
        this.queryRows<User>('users', { role: 'super_admin' }),
        this.primeStaticCaches()
      ]);
      this.ensureSeedData();
      await this.flush();
    });
  }

  public async createRequestContext(routeLabel = ''): Promise<StorageContext> {
    return {
      data: this.createEmptySchema(), initialized: true, writeQueue: Promise.resolve(),
      writeFailure: null, persistedIds: new Map(), persistedRows: new Map(), queryCount: 0, queryDurationMs: 0, routeLabel
    };
  }

  private async primeStaticCaches(): Promise<void> {
    const [settings, plans] = await Promise.all([
      this.queryRows<SuperAdminSettings>('super_admin_settings', { id: 'default' }),
      this.queryRows<PlanConfig>('plans', {})
    ]);
    if (settings[0]) this.data.settings = { ...DEFAULT_SETTINGS, ...settings[0] };
    if (plans.length) this.data.plans = plans;
    this.settingsCache = { value: { ...this.data.settings }, expiresAt: Date.now() + AUTH_CONTEXT_TTL_MS };
    this.plansCache = { value: this.data.plans.map(plan => ({ ...plan })), expiresAt: Date.now() + AUTH_CONTEXT_TTL_MS };
  }

  public runWithRequestContext<T>(context: StorageContext, callback: () => T): T {
    return this.contexts.run(context, callback);
  }

  public getRequestQueryMetrics(): { count: number; durationMs: number } {
    return { count: this.state.queryCount, durationMs: Math.round(this.state.queryDurationMs * 100) / 100 };
  }

  public async checkSupabaseHealth(): Promise<{ ok: boolean; roundTripMs: number }> {
    const client = this.testClient || supabase;
    if (!client) return { ok: false, roundTripMs: 0 };
    const startedAt = performance.now();
    const { error } = await client.from('schools').select('id').range(0, 0);
    const roundTripMs = Math.round((performance.now() - startedAt) * 100) / 100;
    if (this.contexts.getStore()) this.recordQuery('schools', 'health-select', startedAt);
    return { ok: !error, roundTripMs };
  }

  public async getSchoolDashboardSummary(schoolId: string): Promise<any> {
    const client = this.testClient || supabase;
    if (!client || typeof client.rpc !== 'function') throw new Error('School dashboard summary is unavailable.');
    const startedAt = performance.now();
    const { data, error } = await client.rpc('school_dashboard_summary', { p_school_id: schoolId });
    this.recordQuery('rpc:school_dashboard_summary', 'call', startedAt);
    if (error) throw new Error('Unable to load school dashboard summary.');
    return data;
  }

  public async getSuperAdminDashboardSummary(): Promise<any> {
    const client = this.testClient || supabase;
    if (!client || typeof client.rpc !== 'function') throw new Error('Super Admin dashboard summary is unavailable.');
    const startedAt = performance.now();
    const { data, error } = await client.rpc('super_admin_dashboard_summary');
    this.recordQuery('rpc:super_admin_dashboard_summary', 'call', startedAt);
    if (error) throw new Error('Unable to load Super Admin dashboard summary.');
    return data;
  }

  public async prepareRequestContext(includeLockouts = false, routeLabel = ''): Promise<StorageContext> {
    const context = await this.createRequestContext(routeLabel);
    await this.contexts.run(context, async () => {
      const settingsTask = async () => {
        if (this.settingsCache && this.settingsCache.expiresAt > Date.now()) {
          this.cacheQueryRows('super_admin_settings', [{ id: 'default', ...this.settingsCache.value }]);
          return;
        }
        const rows = await this.queryRows<SuperAdminSettings>('super_admin_settings', { id: 'default' });
        if (rows[0]) this.data.settings = { ...DEFAULT_SETTINGS, ...rows[0] };
        this.settingsCache = { value: { ...this.data.settings }, expiresAt: Date.now() + AUTH_CONTEXT_TTL_MS };
      };
      const plansTask = async () => {
        if (this.plansCache && this.plansCache.expiresAt > Date.now()) {
          this.cacheQueryRows('plans', this.plansCache.value.map(plan => ({ ...plan })));
          return;
        }
        // queryRows already merges persisted plan fields over built-in defaults
        // and records the matching persistence baseline. Do not replace that
        // merged state with raw rows, or unrelated writes will upsert it again.
        await this.queryRows<PlanConfig>('plans', {});
        this.plansCache = { value: this.data.plans.map(plan => ({ ...plan })), expiresAt: Date.now() + AUTH_CONTEXT_TTL_MS };
      };
      await Promise.all([settingsTask(), plansTask()]);
      if (includeLockouts) {
        const lockouts = await this.queryRows<any>('lockout_counters', {});
        this.data.lockoutCounters = Object.fromEntries(lockouts.map(row => [row.id, {
          count: row.attemptCount, firstFailedAt: new Date(row.firstFailedAt).getTime(),
          lockedUntil: row.lockedUntil ? new Date(row.lockedUntil).getTime() : null
        }]));
      }
      await this.flush();
    });
    return context;
  }

  private async persistSnapshot(snapshot: DatabaseSchema, knownIds: Map<string, Set<string>>, knownRows: Map<string, Map<string, string>>): Promise<void> {
    const client = this.testClient || supabase;
    if (!client) throw new Error('Supabase client is not configured.');
    const toRows = (table: string) => (rows: any[]) => rows.map(row => toSupabaseRow(row, table));
    const tables: Array<[string, any[]]> = [
      ['plans', snapshot.plans],
      ['schools', snapshot.schools.map(({ subscription: _subscription, ...school }) => school)],
      ['school_subscriptions', snapshot.schools.filter(school => school.subscription).map(school => ({ id: school.id, schoolId: school.id, ...school.subscription }))],
      ['school_branches', snapshot.branches], ['users', snapshot.users], ['user_sessions', snapshot.sessions],
      ['classes', snapshot.classes], ['subjects', snapshot.subjects], ['students', snapshot.students], ['teachers', snapshot.teachers],
      ['timetable_slots', snapshot.timetable], ['attendance_records', snapshot.attendance], ['exam_configs', snapshot.examConfigs],
      ['student_marks', snapshot.marks], ['promotions', snapshot.promotions], ['promotion_history', snapshot.promotionHistory],
      ['fee_structures', snapshot.feeStructures], ['fee_payments', snapshot.feePayments], ['report_card_templates', snapshot.reportCardDesigns],
      ['fee_ranges', snapshot.feeRanges], ['bus_assignments', snapshot.busAssignments], ['notification_templates', snapshot.notificationTemplates],
      ['communication_settings', snapshot.communicationSettings], ['communication_queue', snapshot.communicationQueue],
      ['school_notices', snapshot.notices], ['school_events', snapshot.events], ['direct_messages', snapshot.messages],
      ['platform_broadcasts', snapshot.broadcasts], ['support_tickets', snapshot.tickets], ['subscription_invoices', snapshot.invoices],
      ['audit_logs', snapshot.auditLogs], ['assignments', snapshot.assignments], ['assignment_submissions', snapshot.assignmentSubmissions],
      ['staff_members', snapshot.staffMembers], ['payroll_records', snapshot.payrollRecords], ['admission_applications', snapshot.admissionApplications], ['library_books', snapshot.libraryBooks], ['transport_routes', snapshot.transportRoutes],
      ['restore_test_records', snapshot.restoreTestRecords], ['lockout_counters', Object.entries(snapshot.lockoutCounters).map(([id, counter]) => ({ id, count: counter.count, firstFailedAt: new Date(counter.firstFailedAt).toISOString(), lockedUntil: counter.lockedUntil ? new Date(counter.lockedUntil).toISOString() : null }))]
    ];
    const settingsRows = [{ id: 'default', ...snapshot.settings }];
    await this.persistTable(client, 'super_admin_settings', settingsRows, toRows('super_admin_settings'), knownIds, knownRows);
    for (const [table, rows] of tables) await this.persistTable(client, table, rows, toRows(table), knownIds, knownRows);
  }

  public setTestClient(client: any): void {
    if (process.env.NODE_ENV !== 'test') throw new Error('Test Supabase clients can only be installed when NODE_ENV=test.');
    this.testClient = client;
  }

  public async queryPage<T = any>(table: string, filters: Record<string, string | string[] | undefined>, page = 1, pageSize = 20, orFilter?: string, columns = '*'): Promise<{ items: T[]; page: number; pageSize: number; total: number }> {
    const client = this.testClient || supabase;
    if (!client) throw new Error('Supabase client is not configured.');
    const safePage = Math.max(1, Math.floor(page) || 1);
    const safeSize = Math.min(100, Math.max(1, Math.floor(pageSize) || 20));
    let query = client.from(table).select(columns, { count: 'exact' });
    for (const [field, value] of Object.entries(filters)) {
      if (value === undefined || value === '') continue;
      query = Array.isArray(value) ? query.in(field, value) : query.eq(field, value);
    }
    if (orFilter && typeof query.or === 'function') query = query.or(orFilter);
    if (typeof query.order === 'function') query = query.order(primaryKeyColumn(table), { ascending: true });
    const startedAt = performance.now();
    const { data, error, count } = await query.range((safePage - 1) * safeSize, safePage * safeSize - 1);
    this.recordQuery(table, 'select-page', startedAt);
    if (error) throw new Error('Unable to load paginated Supabase list "' + table + '": ' + error.message);
    return { items: (data || []).map((row: any) => fromSupabaseRow(row)) as T[], page: safePage, pageSize: safeSize, total: Number(count || 0) };
  }

  private async queryRows<T = any>(table: string, filters: Record<string, string | string[] | undefined>): Promise<T[]> {
    const rows: T[] = [];
    for (let page = 1;; page += 1) {
      const result = await this.queryPage<T>(table, filters, page, 100);
      rows.push(...result.items);
      if (rows.length >= result.total || result.items.length === 0) break;
    }
    this.cacheQueryRows(table, rows);
    return rows;
  }

  private cacheQueryRows(table: string, rows: any[]): void {
    const dataKey = TABLE_DATA_KEYS[table];
    if (dataKey && Array.isArray(this.data[dataKey])) {
      const current = this.data[dataKey] as any[];
      const byId = new Map(current.map(row => [String(row.id), row]));
      for (const value of rows) {
        let row = value;
        if (table === 'users' && row.pinHash) {
          const { pinHash, ...user } = row;
          row = { ...user, pin: user.pin || pinHash };
        }
        byId.set(String(row.id), { ...(byId.get(String(row.id)) || {}), ...row });
      }
      (this.data as any)[dataKey] = [...byId.values()];
      const ids = this.persistedIds.get(table) || new Set<string>();
      const previous = this.persistedRows.get(table) || new Map<string, string>();
      for (const row of rows) {
        ids.add(String(row.id));
        // Plans are merged with built-in defaults before they are used. Record
        // that merged value as the read baseline so a later unrelated write
        // does not upsert defaults back into Supabase on every request.
        const baselineRow = table === 'plans' ? byId.get(String(row.id)) : row;
        previous.set(String(row.id), JSON.stringify(toSupabaseRow(baselineRow, table)));
      }
      this.persistedIds.set(table, ids);
      this.persistedRows.set(table, previous);
    } else if (table === 'super_admin_settings' && rows[0]) {
      this.data.settings = { ...DEFAULT_SETTINGS, ...(rows[0] as any) };
      this.persistedIds.set(table, new Set(['default']));
      this.persistedRows.set(table, new Map([['default', JSON.stringify(toSupabaseRow({ id: 'default', ...this.data.settings }, table))]]));
    }
  }

  private async persistTable(client: any, table: string, rows: any[], toRows: (rows: any[]) => any[], knownIds: Map<string, Set<string>>, knownRows: Map<string, Map<string, string>>): Promise<void> {
    const previousIds = knownIds.get(table) || new Set<string>();
    const payload = toRows(rows);
    const previousRows = knownRows.get(table) || new Map<string, string>();
    const currentIds = new Set(payload.map(row => String(row.id)));
    const removedIds = [...previousIds].filter(id => !currentIds.has(id));
    if (removedIds.length) {
      const startedAt = performance.now();
      const { error } = await client.from(table).delete().in('id', removedIds);
      this.recordQuery(table, 'delete', startedAt);
      if (error) throw new Error(`Unable to delete stale rows in Supabase table "${table}": ${error.message}`);
    }
    const changedRows = payload.filter(row => previousRows.get(String(row.id)) !== JSON.stringify(row));
    if (changedRows.length) {
      const startedAt = performance.now();
      const { error } = await client.from(table).upsert(changedRows, { onConflict: 'id' });
      this.recordQuery(table, 'upsert', startedAt);
      if (error) {
        const keys = changedRows.flatMap(row => Object.keys(row));
        if (process.env.NODE_ENV !== 'production') {
          console.error('[supabase-write-failed]', JSON.stringify({ table, code: error.code || 'UNKNOWN', message: error.message || 'Unknown database error', details: error.details || '', payloadKeys: [...new Set(keys)] }));
        }
        const diagnostic = new Error(`Unable to save Supabase table "${table}": ${error.message || 'database write failed'} (code ${error.code || 'unknown'}; fields ${[...new Set(keys)].join(', ')})`);
        Object.assign(diagnostic, { code: error.code, table, payloadKeys: [...new Set(keys)] });
        throw diagnostic;
      }
    }
    const latestIds = this.persistedIds.get(table) || new Set<string>();
    const latestRows = this.persistedRows.get(table) || new Map<string, string>();
    for (const row of payload) {
      const id = String(row.id);
      latestIds.add(id);
      latestRows.set(id, JSON.stringify(row));
    }
    this.persistedIds.set(table, latestIds);
    this.persistedRows.set(table, latestRows);
  }

  public checkLoginLockout(key: string, threshold = 5, durationMinutes = 15) {
    const entry = this.data.lockoutCounters[key];
    if (!entry) return { locked: false, remainingMinutes: 0 };
    const now = Date.now();
    if (entry.lockedUntil && entry.lockedUntil > now) {
      return { locked: true, remainingMinutes: Math.ceil((entry.lockedUntil - now) / 60000) };
    }
    if ((entry.lockedUntil && entry.lockedUntil <= now) || now - entry.firstFailedAt > 30 * 60 * 1000) {
      delete this.data.lockoutCounters[key];
      this.save();
    }
    return { locked: false, remainingMinutes: 0 };
  }

  public recordLoginFailure(key: string, threshold = 5, durationMinutes = 15) {
    const now = Date.now();
    let entry = this.data.lockoutCounters[key];
    if (!entry || now - entry.firstFailedAt > 30 * 60 * 1000) entry = { count: 0, firstFailedAt: now, lockedUntil: null };
    entry.count += 1;
    const newlyLocked = entry.count >= threshold;
    if (newlyLocked) entry.lockedUntil = now + durationMinutes * 60 * 1000;
    this.data.lockoutCounters[key] = entry;
    this.save();
    return { newlyLocked, count: entry.count };
  }

  public clearLoginFailures(key: string) {
    delete this.data.lockoutCounters[key];
    this.save();
  }

  private ensureSeedData() {
    // Seed ONLY one Super Admin account from environment variables, strictly hashed
    const hasSuperAdmin = this.data.users.some(u => u.role === 'super_admin');
    if (!hasSuperAdmin) {
      const email = process.env.SUPER_ADMIN_EMAIL;
      const rawPassword = process.env.SUPER_ADMIN_PASSWORD;
      if (!email || !rawPassword) {
        throw new Error('SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD are required to initialize SchoolOS. Set them in .env.');
      }
      const superAdminUser: User = {
        id: 'usr-super-admin-01',
        role: 'super_admin',
        fullName: 'System Super Administrator',
        email,
        passwordHash: hashPassword(rawPassword),
        mustChangePassword: true,
        mustSetup2FA: false,
        isBlocked: false,
        failedLoginAttempts: 0,
        lockedUntil: null,
        twoFactorEnabled: false,
        twoFactorSecret: undefined,
        createdAt: new Date().toISOString()
      };
      this.data.users.push(superAdminUser);

      this.logAudit({
        action: 'SYSTEM_INITIALIZATION',
        category: 'security',
        userId: superAdminUser.id,
        userName: superAdminUser.fullName,
        userRole: 'super_admin',
        details: 'System initialized with hashed Super Admin credentials from environment configuration.',
        severity: 'info'
      });
      this.save();
    }
  }

  // Daily subscription state reconciler: Trial -> Active -> Grace -> Read-only
  public async runSubscriptionDailyCheck(now = new Date()): Promise<void> {
    const schools = await this.getSchools();
    const readOnlyAfterExpiry = this.getSettings().readOnlyAfterExpiry !== false;

    for (const school of schools) {
      const sub = school.subscription;
      if (!sub || sub.cadence === 'lifetime' || sub.status === 'suspended') {
        continue;
      }

      const validUntil = new Date(sub.validUntil);
      const graceEnd = new Date(validUntil.getTime() + (sub.graceDays ?? 7) * 24 * 60 * 60 * 1000);

      if (!Number.isFinite(validUntil.getTime())) continue;
      if (now > graceEnd && sub.status !== 'read_only' && readOnlyAfterExpiry) {
        sub.status = 'read_only';
        this.updateSchool(school.id, { subscription: sub });
        this.logAudit({
          action: 'SUBSCRIPTION_ENTERED_READ_ONLY',
          category: 'subscription',
          schoolId: school.id,
          schoolName: school.name,
          userId: 'system',
          userName: 'System Daemon',
          userRole: 'super_admin',
          details: `School ${school.name} (${school.code}) grace period lapsed. State changed to read_only. Mutating actions blocked.`,
          severity: 'warning'
        });
      } else if (now > graceEnd && sub.status === 'read_only' && !readOnlyAfterExpiry) {
        sub.status = 'grace';
        this.updateSchool(school.id, { subscription: sub });
        this.logAudit({
          action: 'SUBSCRIPTION_READ_ONLY_DISABLED',
          category: 'subscription',
          schoolId: school.id,
          schoolName: school.name,
          userId: 'system',
          userName: 'System Daemon',
          userRole: 'super_admin',
          details: `School ${school.name} returned to grace status because read-only-after-expiry is disabled.`,
          severity: 'info'
        });
      } else if (now >= validUntil && now <= graceEnd && sub.status !== 'grace' && sub.status !== 'read_only') {
        sub.status = 'grace';
        this.updateSchool(school.id, { subscription: sub });
        this.logAudit({
          action: 'SUBSCRIPTION_ENTERED_GRACE',
          category: 'subscription',
          schoolId: school.id,
          schoolName: school.name,
          userId: 'system',
          userName: 'System Daemon',
          userRole: 'super_admin',
          details: `School ${school.name} validity expired. Entered ${sub.graceDays}-day grace period.`,
          severity: 'info'
        });
      }
    }

    await this.flush();
  }

  // -------------------------------------------------------------
  // SETTINGS & PLANS
  // -------------------------------------------------------------
  public getSettings(): SuperAdminSettings {
    if (this.settingsCache && this.settingsCache.expiresAt > Date.now()) return { ...this.settingsCache.value };
    const value = { ...this.data.settings };
    this.settingsCache = { value, expiresAt: Date.now() + AUTH_CONTEXT_TTL_MS };
    return value;
  }

  public updateSettings(updates: Partial<SuperAdminSettings>): SuperAdminSettings {
    this.data.settings = { ...this.data.settings, ...updates };
    this.settingsCache = { value: { ...this.data.settings }, expiresAt: Date.now() + AUTH_CONTEXT_TTL_MS };
    this.save();
    return this.data.settings;
  }

  public getPlans(): PlanConfig[] {
    if (this.plansCache && this.plansCache.expiresAt > Date.now()) return this.plansCache.value.map(plan => ({ ...plan }));
    this.plansCache = { value: this.data.plans.map(plan => ({ ...plan })), expiresAt: Date.now() + AUTH_CONTEXT_TTL_MS };
    return this.plansCache.value.map(plan => ({ ...plan }));
  }

  public updatePlan(id: string, updates: Partial<PlanConfig>): PlanConfig | null {
    const idx = this.data.plans.findIndex(p => p.id === id);
    if (idx === -1) return null;
    this.data.plans[idx] = { ...this.data.plans[idx], ...updates };
    this.plansCache = { value: this.data.plans.map(plan => ({ ...plan })), expiresAt: Date.now() + AUTH_CONTEXT_TTL_MS };
    this.save();
    return this.data.plans[idx];
  }

  // -------------------------------------------------------------
  // SCHOOL TENANTS & BRANCHES
  // -------------------------------------------------------------
  public async getSchools(): Promise<School[]> {
    const [schools, subscriptions] = await Promise.all([
      this.queryRows<School>('schools', {}),
      this.queryRows<any>('school_subscriptions', {})
    ]);
    return schools.map(school => ({ ...school, subscription: subscriptions.find(item => item.schoolId === school.id), branches: [] }));
  }

  public async getSchoolById(id: string): Promise<School | null> {
    const cached = schoolContextCache.get(id);
    if (cached && cached.expiresAt > Date.now()) {
      this.cacheQueryRows('schools', [cached.school]);
      return { ...cached.school };
    }
    const [schools, subscriptions] = await Promise.all([
      this.queryRows<School>('schools', { id }),
      this.queryRows<any>('school_subscriptions', { school_id: id })
    ]);
    const s = schools[0];
    if (!s) return null;
    const school = {
      ...s,
      subscription: subscriptions[0],
      branches: []
    };
    schoolContextCache.set(id, { school, expiresAt: Date.now() + AUTH_CONTEXT_TTL_MS });
    return school;
  }

  public async getSchoolByCode(code: string): Promise<School | null> {
    const s = (await this.queryRows<School>('schools', { code: code.trim().toUpperCase() }))[0];
    if (!s) return null;
    const [[subscription], branches] = await Promise.all([
      this.queryRows<any>('school_subscriptions', { school_id: s.id }),
      this.queryRows<SchoolBranch>('school_branches', { school_id: s.id })
    ]);
    return {
      ...s,
      subscription,
      branches
    };
  }

  public createSchool(schoolData: Omit<School, 'id' | 'createdAt' | 'updatedAt'>): School {
    const id = `sch-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const newSchool: School = {
      ...schoolData,
      id,
      code: schoolData.code.trim().toUpperCase(),
      brandColor: schoolData.brandColor || '#0F766E',
      currency: schoolData.currency || 'ETB',
      language: schoolData.language || 'en',
      timezone: schoolData.timezone || 'Africa/Addis_Ababa',
      currentSemester: schoolData.currentSemester || 'Semester 1',
      academicYear: schoolData.academicYear || this.data.settings.academicYearName || '2026-2027',
      terms: schoolData.terms || { ...DEFAULT_TERMS },
      gradingScale: schoolData.gradingScale || DEFAULT_GRADING_SCALE.map(band => ({ ...band })),
      attendanceRules: schoolData.attendanceRules || { ...DEFAULT_ATTENDANCE_RULES },
      classLevels: schoolData.classLevels || [...DEFAULT_CLASS_LEVELS],
      reportCardHeader: schoolData.reportCardHeader || '',
      reportCardFooter: schoolData.reportCardFooter || '',
      receiptHeader: schoolData.receiptHeader || '',
      receiptFooter: schoolData.receiptFooter || '',
      notificationPreferences: schoolData.notificationPreferences || { ...DEFAULT_NOTIFICATION_PREFERENCES },
      createdAt: now,
      updatedAt: now
    };
    this.data.schools.push(newSchool);

    // Create Main Branch by default
    const mainBranch: SchoolBranch = {
      id: `br-${Date.now()}-main`,
      schoolId: id,
      name: 'Main Campus',
      address: newSchool.address,
      phone: newSchool.phone,
      email: newSchool.email,
      isMain: true,
      createdAt: now
    };
    this.data.branches.push(mainBranch);

    // Create default Exam Config for this school
    this.data.examConfigs.push({
      id: `ec-${id}`,
      schoolId: id,
      academicYear: newSchool.academicYear,
      smallExamName: 'Small Exam',
      smallExamMax: 10,
      bigExamName: 'Big Exam',
      bigExamMax: 10,
      passMarkPercentage: 50,
      updatedAt: now
    });

    // Create default Report Card Design for this school
    this.data.reportCardDesigns.push({
      id: `rcd-${id}`,
      schoolId: id,
      templateId: 'modern',
      primaryColor: newSchool.brandColor || '#0F766E',
      secondaryColor: '#0B2B2A',
      logoPosition: 'center',
      titleText: `${newSchool.name} Official Academic Achievement Record`,
      visibleBlocks: {
        rank: true,
        teacherRemarks: true,
        adminRemarks: true,
        percentage: true,
        signatures: true,
        stamp: true
      },
      signatureTitleLeft: 'Class Teacher',
      signatureTitleRight: 'Principal / Headmaster',
      updatedAt: now
    });

    // Create default Communication Settings
    this.data.communicationSettings.push({
      id: `cs-${id}`,
      schoolId: id,
      provider: 'none',
      isActive: false,
      updatedAt: now
    });

    this.save();
    return newSchool;
  }

  public updateSchool(id: string, updates: Partial<School>): School | null {
    const idx = this.data.schools.findIndex(s => s.id === id);
    if (idx === -1) return null;
    this.data.schools[idx] = {
      ...this.data.schools[idx],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    schoolContextCache.delete(id);
    this.invalidateAuthContextsForSchool(id);
    this.save();
    return this.data.schools[idx];
  }

  public deleteSchool(id: string): boolean {
    schoolContextCache.delete(id);
    this.invalidateAuthContextsForSchool(id);
    branchListCache.delete(id);
    const initialLen = this.data.schools.length;
    this.data.schools = this.data.schools.filter(s => s.id !== id);
    if (this.data.schools.length < initialLen) {
      // Cascade delete school data
      this.data.branches = this.data.branches.filter(b => b.schoolId !== id);
      this.data.users = this.data.users.filter(u => u.schoolId !== id);
      this.data.students = this.data.students.filter(s => s.schoolId !== id);
      this.data.teachers = this.data.teachers.filter(t => t.schoolId !== id);
      this.data.classes = this.data.classes.filter(c => c.schoolId !== id);
      this.data.subjects = this.data.subjects.filter(s => s.schoolId !== id);
      this.data.timetable = this.data.timetable.filter(t => t.schoolId !== id);
      this.data.attendance = this.data.attendance.filter(a => a.schoolId !== id);
      this.data.marks = this.data.marks.filter(m => m.schoolId !== id);
      this.data.feePayments = this.data.feePayments.filter(f => f.schoolId !== id);
      this.data.feeStructures = this.data.feeStructures.filter(f => f.schoolId !== id);
      this.data.notices = this.data.notices.filter(n => n.schoolId !== id);
      this.data.events = this.data.events.filter(e => e.schoolId !== id);
      this.data.messages = this.data.messages.filter(m => m.schoolId !== id);
      this.data.communicationQueue = this.data.communicationQueue.filter(q => q.schoolId !== id);
      this.save();
      return true;
    }
    return false;
  }

  // Branches
  public async getBranches(schoolId: string): Promise<SchoolBranch[]> {
    const cached = branchListCache.get(schoolId);
    if (cached && cached.expiresAt > Date.now()) {
      this.cacheQueryRows('school_branches', cached.branches);
      return cached.branches.map(branch => ({ ...branch }));
    }
    const branches = await this.queryRows<SchoolBranch>('school_branches', { school_id: schoolId });
    branchListCache.set(schoolId, { branches: branches.map(branch => ({ ...branch })), expiresAt: Date.now() + BRANCH_LIST_TTL_MS });
    return branches;
  }

  public createBranch(schoolId: string, branchData: Omit<SchoolBranch, 'id' | 'schoolId' | 'createdAt'>): SchoolBranch {
    const branch: SchoolBranch = {
      id: `br-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      schoolId,
      ...branchData,
      createdAt: new Date().toISOString()
    };
    this.data.branches.push(branch);
    branchListCache.delete(schoolId);
    this.save();
    return branch;
  }

  public updateBranch(schoolId: string, id: string, updates: Partial<Omit<SchoolBranch, 'id' | 'schoolId' | 'createdAt'>>): SchoolBranch | null {
    const idx = this.data.branches.findIndex(branch => branch.id === id && branch.schoolId === schoolId);
    if (idx === -1) return null;
    this.data.branches[idx] = {
      ...this.data.branches[idx],
      ...updates
    };
    branchListCache.delete(schoolId);
    this.save();
    return this.data.branches[idx];
  }

  public deleteBranch(schoolId: string, id: string): boolean {
    const priorLength = this.data.branches.length;
    this.data.branches = this.data.branches.filter(branch => !(branch.id === id && branch.schoolId === schoolId));
    if (this.data.branches.length === priorLength) return false;
    branchListCache.delete(schoolId);
    this.save();
    return true;
  }

  // -------------------------------------------------------------
  // USERS & SESSIONS & LOCKOUT
  // -------------------------------------------------------------
  public async getUsers(schoolId?: string, role?: string): Promise<User[]> {
    return this.queryRows<User>('users', { school_id: schoolId, role });
  }

  public async getStaffMembers(schoolId: string): Promise<StaffMember[]> {
    return this.queryRows<StaffMember>('staff_members', { school_id: schoolId });
  }

  public async getStaffMemberByUserId(userId: string, schoolId: string): Promise<StaffMember | null> {
    return (await this.queryRows<StaffMember>('staff_members', { user_id: userId, school_id: schoolId }))[0] || null;
  }

  public createStaffMember(staffData: Omit<StaffMember, 'id' | 'joinedDate'>): StaffMember {
    const staff: StaffMember = { ...staffData, id: `stf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, joinedDate: new Date().toISOString().slice(0, 10) };
    this.data.staffMembers.push(staff);
    this.save();
    return staff;
  }

  public async getPayrollRecords(schoolId: string, userId?: string, month?: string): Promise<StaffPayrollRecord[]> {
    return this.queryRows<StaffPayrollRecord>('payroll_records', { school_id: schoolId, user_id: userId, payroll_month: month });
  }

  public createPayrollRecord(record: Omit<StaffPayrollRecord, 'id' | 'createdAt'>): StaffPayrollRecord {
    const payroll: StaffPayrollRecord = { ...record, id: `pay-${randomUUID()}`, createdAt: new Date().toISOString() };
    this.data.payrollRecords.push(payroll);
    this.save();
    return payroll;
  }

  public async updatePayrollRecord(id: string, schoolId: string, updates: Partial<StaffPayrollRecord>): Promise<StaffPayrollRecord | null> {
    await this.queryRows<StaffPayrollRecord>('payroll_records', { id, school_id: schoolId });
    const index = this.data.payrollRecords.findIndex(record => record.id === id && record.schoolId === schoolId);
    if (index < 0) return null;
    this.data.payrollRecords[index] = { ...this.data.payrollRecords[index], ...updates, id, schoolId };
    this.save();
    return this.data.payrollRecords[index];
  }

  public async updateStaffMember(id: string, schoolId: string, updates: Partial<StaffMember>): Promise<StaffMember | null> {
    await this.queryRows<StaffMember>('staff_members', { id, school_id: schoolId });
    const index = this.data.staffMembers.findIndex(row => row.id === id && row.schoolId === schoolId);
    if (index < 0) return null;
    this.data.staffMembers[index] = { ...this.data.staffMembers[index], ...updates, schoolId, id };
    this.save();
    return this.data.staffMembers[index];
  }

  public async getAdmissionApplications(schoolId: string): Promise<AdmissionApplication[]> {
    return this.queryRows<AdmissionApplication>('admission_applications', { school_id: schoolId });
  }

  public createAdmissionApplication(application: Omit<AdmissionApplication, 'id' | 'appliedDate' | 'status'>): AdmissionApplication {
    const record: AdmissionApplication = { ...application, id: `adm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, appliedDate: new Date().toISOString().slice(0, 10), status: 'pending' };
    this.data.admissionApplications.push(record);
    this.save();
    return record;
  }

  public async updateAdmissionApplication(id: string, schoolId: string, status: AdmissionApplication['status'], studentId?: string): Promise<AdmissionApplication | null> {
    await this.queryRows<AdmissionApplication>('admission_applications', { id, school_id: schoolId });
    const index = this.data.admissionApplications.findIndex(row => row.id === id && row.schoolId === schoolId);
    if (index < 0) return null;
    this.data.admissionApplications[index] = { ...this.data.admissionApplications[index], status, studentId: studentId || this.data.admissionApplications[index].studentId };
    this.save();
    return this.data.admissionApplications[index];
  }

  public async getParents(schoolId: string): Promise<User[]> {
    return this.queryRows<User>('users', { school_id: schoolId, role: 'parent' });
  }

  public async getUserById(id: string, schoolId?: string): Promise<User | null> {
    return (await this.queryRows<User>('users', { id, school_id: schoolId }))[0] || null;
  }

  public async findUserForLogin(identifier: string, schoolId?: string): Promise<User | null> {
    const cleanId = identifier.trim().toLowerCase();
    const byEmail = await this.queryRows<User>('users', { school_id: schoolId, email: cleanId });
    const byPhone = byEmail.length ? [] : await this.queryRows<User>('users', { school_id: schoolId, phone: identifier.trim() });
    const direct = byEmail[0] || byPhone[0];
    if (direct) {
      if (direct.role === 'accountant') {
        const linkedStaff = await this.queryRows<StaffMember>('staff_members', { school_id: direct.schoolId, user_id: direct.id });
        if (linkedStaff.some(record => record.status !== 'active')) return null;
      }
      return direct;
    }
    const normalizedStaffId = identifier.trim().toUpperCase();
    const userIds = await this.queryRows<User>('users', { school_id: schoolId, staff_id: normalizedStaffId });
    if (userIds.length > 1) return null;
    if (userIds.length === 1) {
      const account = userIds[0];
      if (account.role === 'accountant') {
        const linkedStaff = await this.queryRows<StaffMember>('staff_members', { school_id: account.schoolId, user_id: account.id });
        if (linkedStaff.some(record => record.status !== 'active')) return null;
      }
      return account;
    }
    const matches = (await this.queryRows<StaffMember>('staff_members', { school_id: schoolId, staff_id: normalizedStaffId }))
      .filter(record => record.staffId?.toUpperCase() === normalizedStaffId && record.status === 'active' && record.userId);
    if (matches.length !== 1) return null;
    const staff = matches[0];
    const account = await this.getUserById(staff.userId!, staff.schoolId);
    return account?.role === 'accountant' ? account : null;
  }

  public async findUsersByPhoneInSchool(phone: string, schoolId: string): Promise<User[]> {
    const clean = phone.trim();
    const [phoneRows, parentRows] = await Promise.all([
      this.queryRows<User>('users', { school_id: schoolId, phone: clean }),
      this.queryRows<User>('users', { school_id: schoolId, parent_phone: clean })
    ]);
    return [...new Map([...phoneRows, ...parentRows].map(user => [user.id, user])).values()];
  }

  public createUser(userData: Omit<User, 'id' | 'createdAt'>): User {
    const id = `usr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    let passwordHash = userData.passwordHash || '';
    if (passwordHash && !passwordHash.startsWith('scrypt:')) {
      passwordHash = hashPassword(passwordHash);
    }
    let pin = userData.pin;
    if (pin && !pin.startsWith('pin_scrypt:')) {
      pin = hashPin(pin);
    }
    const user: User = {
      ...userData,
      passwordHash,
      pin,
      id,
      failedLoginAttempts: 0,
      createdAt: new Date().toISOString()
    };
    this.data.users.push(user);
    this.save();
    return user;
  }

  public updateUser(id: string, updates: Partial<User>): User | null {
    const idx = this.data.users.findIndex(u => u.id === id);
    if (idx === -1) return null;
    const payload = { ...updates };
    if (payload.passwordHash && !payload.passwordHash.startsWith('scrypt:')) {
      payload.passwordHash = hashPassword(payload.passwordHash);
    }
    if (payload.pin && !payload.pin.startsWith('pin_scrypt:')) {
      payload.pin = hashPin(payload.pin);
    }
    this.data.users[idx] = { ...this.data.users[idx], ...payload };
    authContextCache.delete(id);
    this.save();
    return this.data.users[idx];
  }

  public deleteUser(id: string): boolean {
    authContextCache.delete(id);
    const len = this.data.users.length;
    this.data.users = this.data.users.filter(u => u.id !== id);
    if (this.data.users.length < len) {
      this.save();
      return true;
    }
    return false;
  }

  // Lockout logic: Lock for 15 minutes after 5 failed logins
  public async handleFailedLogin(userId: string): Promise<{ locked: boolean; lockedUntil?: string; attempts: number }> {
    const user = await this.getUserById(userId);
    if (!user) return { locked: false, attempts: 0 };

    const threshold = this.data.settings.lockoutThreshold || 5;
    const durationMins = this.data.settings.lockoutDurationMinutes || 15;

    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    if (user.failedLoginAttempts >= threshold) {
      const lockDate = new Date(Date.now() + durationMins * 60 * 1000);
      user.lockedUntil = lockDate.toISOString();
      this.logAudit({
        action: 'USER_LOCKED_OUT',
        category: 'security',
        schoolId: user.schoolId,
        userId: user.id,
        userName: user.fullName,
        userRole: user.role,
        details: `Account temporarily locked out for ${durationMins} minutes after ${user.failedLoginAttempts} failed login attempts.`,
        severity: 'warning'
      });
      this.save();
      return { locked: true, lockedUntil: user.lockedUntil, attempts: user.failedLoginAttempts };
    }

    this.save();
    return { locked: false, attempts: user.failedLoginAttempts };
  }

  public async handleSuccessfulLogin(userId: string): Promise<void> {
    const user = await this.getUserById(userId);
    if (!user) return;
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    user.lastLoginAt = new Date().toISOString();
    this.save();
  }

  // Sessions
  public createSession(session: UserSession): void {
    this.data.sessions.push(session);
    this.save();
  }

  public async getSessionById(id: string): Promise<UserSession | null> {
    if (this.contexts.getStore() && this.persistedIds.get('user_sessions')?.has(id)) {
      return this.data.sessions.find(session => session.id === id) || null;
    }
    return (await this.queryRows<UserSession>('user_sessions', { id }))[0] || null;
  }

  public async getSessionAndUserById(sessionId: string, userId: string, schoolId?: string): Promise<{ session: UserSession; user: User; school?: School | null } | null> {
    const client = this.testClient || supabase;
    if (!client) return null;
    if (this.testClient?.supportsSeparateAuthQueries === true) {
      const [sessions, users] = await Promise.all([
        this.queryRows<UserSession>('user_sessions', { id: sessionId }),
        this.queryRows<User>('users', { id: userId })
      ]);
      const session = sessions[0];
      const user = users[0];
      return session && user && session.userId === userId && (!schoolId || session.schoolId === schoolId) && (!schoolId || user.schoolId === schoolId) ? { session, user } : null;
    }
    const cachedAuth = authContextCache.get(userId);
    if (cachedAuth && cachedAuth.expiresAt > Date.now() && (!schoolId || cachedAuth.user.schoolId === schoolId)) {
      let sessionQuery = client.from('user_sessions').select('id,user_id,user_role,school_id,expires_at,created_at,last_activity_at').eq('id', sessionId).eq('user_id', userId);
      if (schoolId) sessionQuery = sessionQuery.eq('school_id', schoolId);
      const startedAt = performance.now();
      const { data, error } = await sessionQuery.maybeSingle();
      this.recordQuery('user_sessions', 'select-auth-session', startedAt);
      if (error) throw new Error('Unable to authenticate this session.');
      if (!data) return null;
      const session = fromSupabaseRow(data) as UserSession;
      if (session.userId !== userId || schoolId && session.schoolId !== schoolId) return null;
      this.cacheQueryRows('user_sessions', [session]);
      this.cacheQueryRows('users', [cachedAuth.user]);
      return { session, user: cachedAuth.user, school: cachedAuth.school };
    }
    if (cachedAuth) authContextCache.delete(userId);
    const userColumns = 'id,school_id,role,full_name,email,phone,staff_id,student_id,parent_phone,password_hash,pin_hash,must_change_password,is_blocked,failed_login_attempts,locked_until,two_factor_enabled,two_factor_secret,pending_two_factor_secret,must_setup_2fa,recovery_codes,permissions,assigned_class_ids,assigned_subject_ids,linked_student_ids,branch_id,created_at,last_login_at';
    const schoolColumns = 'id,name,code,address,city,phone,email,logo_url,brand_color,currency,academic_year,current_semester,default_class_capacity,student_access_enabled,created_at,updated_at,subscription:school_subscriptions!school_subscriptions_school_id_fkey(*)';
    let query = client.from('user_sessions').select(`id,user_id,user_role,school_id,expires_at,created_at,last_activity_at,user:users!user_sessions_user_id_fkey!inner(${userColumns},school:schools!users_school_id_fkey(${schoolColumns}))`).eq('id', sessionId).eq('user_id', userId);
    if (schoolId) query = query.eq('school_id', schoolId);
    const startedAt = performance.now();
    const { data, error } = await query.maybeSingle();
    this.recordQuery('user_sessions', 'select-auth-joined', startedAt);
    if (error) throw new Error('Unable to authenticate this session.');
    if (!data?.user) return null;
    const { user: joinedUser, ...session } = data;
    const { school: joinedSchool, ...user } = joinedUser;
    const normalizedUser = fromSupabaseRow(user) as User;
    const normalizedSession = fromSupabaseRow(session) as UserSession;
    this.cacheQueryRows('users', [normalizedUser]);
    this.cacheQueryRows('user_sessions', [normalizedSession]);
    const normalizedSchool = Array.isArray(joinedSchool) ? joinedSchool[0] : joinedSchool;
    const { subscription: joinedSubscription, ...schoolRow } = normalizedSchool || {};
    const subscriptionRow = Array.isArray(joinedSubscription) ? joinedSubscription[0] : joinedSubscription;
    const normalizedSchoolContext = normalizedSchool ? {
      ...fromSupabaseRow(schoolRow),
      ...(subscriptionRow ? { subscription: fromSupabaseRow(subscriptionRow) } : {})
    } as School : null;
    if (normalizedSchoolContext) {
      schoolContextCache.set(normalizedSchoolContext.id, { school: normalizedSchoolContext, expiresAt: Date.now() + AUTH_CONTEXT_TTL_MS });
    }
    authContextCache.set(userId, {
      user: normalizedUser,
      school: normalizedSchoolContext,
      expiresAt: Date.now() + AUTH_CONTEXT_TTL_MS
    });
    return { session: normalizedSession, user: normalizedUser, school: normalizedSchoolContext };
  }

  public async getUserSessions(schoolId?: string): Promise<UserSession[]> {
    return this.queryRows<UserSession>('user_sessions', { school_id: schoolId });
  }

  public async touchSession(id: string, expiresAt: string): Promise<void> {
    const session = await this.getSessionById(id);
    if (!session || !shouldTouchSession(session.expiresAt, expiresAt)) return;
    session.expiresAt = expiresAt;
    session.lastActivityAt = new Date().toISOString();
    this.save();
  }

  public async revokeSession(id: string): Promise<boolean> {
    await this.getSessionById(id);
    const previous = this.data.sessions.length;
    this.data.sessions = this.data.sessions.filter(session => session.id !== id);
    if (previous === this.data.sessions.length) return false;
    this.save();
    return true;
  }

  public getSession(id: string): UserSession | null {
    return this.data.sessions.find(s => s.id === id) || null;
  }

  public deleteSession(id: string): void {
    this.data.sessions = this.data.sessions.filter(s => s.id !== id);
    this.save();
  }

  // -------------------------------------------------------------
  // STUDENTS & TEACHERS
  // -------------------------------------------------------------
  public async getStudents(schoolId: string, classId?: string, branchId?: string): Promise<Student[]> {
    return this.queryRows<Student>('students', { school_id: schoolId, class_id: classId, branch_id: branchId });
  }

  public async getStudentById(id: string, schoolId?: string): Promise<Student | null> {
    return (await this.queryRows<Student>('students', { id, school_id: schoolId }))[0] || null;
  }

  public createStudent(studentData: Omit<Student, 'id' | 'createdAt'>): Student {
    const id = `std-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const rawPin = studentData.pin || randomInt(1000, 10000).toString();
    const pinHash = hashPin(rawPin);
    const student: Student = {
      ...studentData,
      id,
      pinHash,
      createdAt: new Date().toISOString()
    };
    this.data.students.push(student);

    // Automatically ensure Student User account exists with PIN hash
    const studentUser: User = {
      id: `usr-student-${id}`,
      schoolId: student.schoolId,
      branchId: student.branchId,
      role: 'student',
      fullName: `${student.firstName} ${student.middleName} ${student.lastName}`.trim(),
      phone: student.studentPhone || student.fatherPhone,
      studentId: student.studentId,
      passwordHash: '',
      pin: pinHash,
      isBlocked: false,
      failedLoginAttempts: 0,
      createdAt: new Date().toISOString()
    };
    this.data.users.push(studentUser);

    // Create or link a parent account for each distinct parent phone number.
    const parentPhones = [...new Set([student.fatherPhone, student.motherPhone]
      .filter((phone): phone is string => typeof phone === 'string' && phone.trim().length > 0)
      .map(phone => phone.trim()))];
    for (const parentPhone of parentPhones) {
      const existingParent = this.data.users.find(user =>
        user.schoolId === student.schoolId &&
        user.role === 'parent' &&
        user.phone === parentPhone
      );
      if (existingParent) {
        existingParent.linkedStudentIds = existingParent.linkedStudentIds || [];
        if (!existingParent.linkedStudentIds.includes(id)) existingParent.linkedStudentIds.push(id);
      } else {
        const parentUser: User = {
          id: `usr-parent-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          schoolId: student.schoolId,
          role: 'parent',
          fullName: `Parent of ${student.firstName}`,
          phone: parentPhone,
          parentPhone,
          passwordHash: '',
          pin: pinHash,
          linkedStudentIds: [id],
          isBlocked: false,
          failedLoginAttempts: 0,
          createdAt: new Date().toISOString()
        };
        this.data.users.push(parentUser);
      }
    }

    this.save();
    return { ...student, pin: rawPin };
  }

  public async resetStudentPin(studentId: string, schoolId?: string, customPin?: string): Promise<{ student: Student; newPin: string } | null> {
    if (customPin !== undefined && !/^\d{4}$/.test(customPin)) {
      throw new Error('A custom student PIN must contain exactly four digits.');
    }
    const student = await this.getStudentById(studentId, schoolId);
    if (!student) return null;
    await Promise.all([
      this.getUsers(schoolId, 'student'), this.getUsers(schoolId, 'parent')
    ]);

    const newPin = customPin || randomInt(1000, 10000).toString();
    const pinHash = hashPin(newPin);
    student.pinHash = pinHash;
    delete student.pin;

    // The PIN is the shared credential for a student's and their linked parent's login.
    const linkedUsers = this.data.users.filter(user =>
      user.schoolId === student.schoolId &&
      (
        (user.role === 'student' && (user.studentId === student.studentId || user.id === `usr-student-${student.id}`)) ||
        (user.role === 'parent' && (
          user.linkedStudentIds?.includes(student.id) ||
          (!user.linkedStudentIds?.length && [student.fatherPhone, student.motherPhone].includes(user.phone || ''))
        ))
      )
    );
    for (const linkedUser of linkedUsers) {
      linkedUser.pin = pinHash;
      linkedUser.failedLoginAttempts = 0;
      linkedUser.lockedUntil = null;
    }

    this.logAudit({
      action: 'STUDENT_PIN_RESET',
      category: 'security',
      schoolId: student.schoolId,
      userId: student.id,
      userName: `${student.firstName} ${student.lastName}`,
      userRole: 'student',
      details: `4-digit PIN reset for student ${student.studentId}.`,
      severity: 'warning'
    });

    this.save();
    return { student, newPin };
  }

  public async updateStudent(id: string, updates: Partial<Student>, schoolId?: string): Promise<Student | null> {
    const existing = await this.getStudentById(id, schoolId || updates.schoolId);
    if (!existing) return null;
    const idx = this.data.students.findIndex(student => student.id === id && student.schoolId === existing.schoolId);
    if (idx === -1) return null;
    this.data.students[idx] = { ...this.data.students[idx], ...updates };
    this.save();
    return this.data.students[idx];
  }

  public async deleteStudent(id: string, schoolId?: string): Promise<boolean> {
    const student = await this.getStudentById(id, schoolId);
    if (!student) return false;
    await Promise.all([
      this.queryRows<StudentMark>('student_marks', { school_id: student.schoolId, student_id: id }),
      this.queryRows<AttendanceRecord>('attendance_records', { school_id: student.schoolId, student_id: id }),
      this.queryRows<FeePayment>('fee_payments', { school_id: student.schoolId, student_id: id }),
      this.getUsers(student.schoolId, 'student'),
      this.getUsers(student.schoolId, 'parent')
    ]);
    const studentUserIds = new Set(this.data.users
      .filter(user => user.schoolId === student.schoolId && user.role === 'student' &&
        (user.studentId === student.studentId || user.id === `usr-student-${student.id}`))
      .map(user => user.id));
    const parentUsers = this.data.users.filter(user =>
      user.schoolId === student.schoolId && user.role === 'parent' && user.linkedStudentIds?.includes(student.id)
    );
    for (const parent of parentUsers) {
      parent.linkedStudentIds = (parent.linkedStudentIds || []).filter(studentId => studentId !== student.id);
      if (!parent.linkedStudentIds.length) studentUserIds.add(parent.id);
    }
    const len = this.data.students.length;
    this.data.students = this.data.students.filter(existing => existing.id !== id);
    if (this.data.students.length < len) {
      this.data.marks = this.data.marks.filter(mark => mark.studentId !== id);
      this.data.attendance = this.data.attendance.filter(record => record.studentId !== id);
      this.data.feePayments = this.data.feePayments.filter(payment => payment.studentId !== id);
      this.data.assignmentSubmissions = this.data.assignmentSubmissions.filter(submission => submission.studentId !== id);
      this.data.busAssignments = this.data.busAssignments.filter(assignment => assignment.studentId !== id);
      this.data.promotionHistory = this.data.promotionHistory.filter(record => record.studentId !== id);
      this.data.promotions = this.data.promotions.filter(record => record.studentId !== id);
      this.data.communicationQueue = this.data.communicationQueue.filter(item => item.studentId !== id);
      this.data.messages = this.data.messages.filter(message => !studentUserIds.has(message.senderId) && !studentUserIds.has(message.recipientId));
      this.data.users = this.data.users.filter(user => !studentUserIds.has(user.id));
      this.data.sessions = this.data.sessions.filter(session => !studentUserIds.has(session.userId));
      this.save();
      return true;
    }
    return false;
  }

  public async getTeachers(schoolId: string): Promise<Teacher[]> {
    return this.queryRows<Teacher>('teachers', { school_id: schoolId });
  }

  public async updateTeacherStaffId(id: string, schoolId: string, staffId: string): Promise<Teacher | null> {
    await this.queryRows<Teacher>('teachers', { id, school_id: schoolId });
    const index = this.data.teachers.findIndex(teacher => teacher.id === id && teacher.schoolId === schoolId);
    if (index < 0) return null;
    this.data.teachers[index] = { ...this.data.teachers[index], staffId };
    this.save();
    return this.data.teachers[index];
  }

  public createTeacher(teacherData: Omit<Teacher, 'id' | 'createdAt'>): Teacher {
    const id = `tch-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const teacher: Teacher = {
      ...teacherData,
      id
    };
    this.data.teachers.push(teacher);
    this.save();
    return teacher;
  }

  public updateTeacher(id: string, updates: Partial<Teacher>): Teacher | null {
    const idx = this.data.teachers.findIndex(t => t.id === id);
    if (idx === -1) return null;
    this.data.teachers[idx] = { ...this.data.teachers[idx], ...updates };
    this.save();
    return this.data.teachers[idx];
  }

  public deleteTeacher(id: string): boolean {
    const len = this.data.teachers.length;
    this.data.teachers = this.data.teachers.filter(t => t.id !== id);
    if (this.data.teachers.length < len) {
      this.save();
      return true;
    }
    return false;
  }

  // -------------------------------------------------------------
  // CLASSES & SUBJECTS & TIMETABLE
  // -------------------------------------------------------------
  public async getClasses(schoolId: string, branchId?: string): Promise<SchoolClass[]> {
    return this.queryRows<SchoolClass>('classes', { school_id: schoolId, branch_id: branchId });
  }

  public async getClassById(id: string, schoolId?: string): Promise<SchoolClass | null> {
    return (await this.queryRows<SchoolClass>('classes', { id, school_id: schoolId }))[0] || null;
  }

  public createClass(classData: Omit<SchoolClass, 'id'>): SchoolClass {
    const id = `cls-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newClass: SchoolClass = { ...classData, id };
    this.data.classes.push(newClass);
    this.save();
    return newClass;
  }

  public async updateClass(id: string, updates: Partial<SchoolClass>, schoolId?: string): Promise<SchoolClass | null> {
    const existing = await this.getClassById(id, schoolId || updates.schoolId);
    if (!existing) return null;
    const idx = this.data.classes.findIndex(klass => klass.id === id && klass.schoolId === existing.schoolId);
    if (idx === -1) return null;
    this.data.classes[idx] = { ...this.data.classes[idx], ...updates };
    this.save();
    return this.data.classes[idx];
  }

  public async deleteClass(id: string, schoolId?: string): Promise<boolean> {
    await this.getClassById(id, schoolId);
    const len = this.data.classes.length;
    this.data.classes = this.data.classes.filter(c => c.id !== id);
    if (this.data.classes.length < len) {
      this.save();
      return true;
    }
    return false;
  }

  public async getSubjects(schoolId: string): Promise<Subject[]> {
    return this.queryRows<Subject>('subjects', { school_id: schoolId });
  }

  public async saveSubjectAssignments(schoolId: string, subjectId: string, assignments: Array<{ classId: string; teacherId?: string; periodsPerWeek: number; smallExamEnabled: boolean; bigExamEnabled: boolean }>): Promise<void> {
    const client = this.testClient || supabase;
    if (!client || typeof client.rpc !== 'function') throw new Error('Subject assignment storage is unavailable.');
    const startedAt = performance.now();
    const { error } = await client.rpc('schoolos_save_subject_assignments', {
      p_school_id: schoolId,
      p_subject_id: subjectId,
      p_assignments: assignments.map(item => ({
        id: randomUUID(), class_id: item.classId, teacher_id: item.teacherId || null,
        periods_per_week: item.periodsPerWeek, small_exam_enabled: item.smallExamEnabled, big_exam_enabled: item.bigExamEnabled
      }))
    });
    this.recordQuery('rpc:schoolos_save_subject_assignments', 'call', startedAt);
    if (error) throw new Error(error.message || 'Unable to save subject assignments.');
  }

  public createSubject(subjectData: Omit<Subject, 'id'>): Subject {
    const id = `sbj-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newSubject: Subject = { ...subjectData, id };
    this.data.subjects.push(newSubject);
    this.save();
    return newSubject;
  }

  public createAssignment(assignmentData: Omit<Assignment, 'id' | 'createdAt'> & { createdAt?: string }): Assignment {
    const newAssignment: Assignment = { ...assignmentData, id: `asg-${randomUUID()}`, createdAt: assignmentData.createdAt || new Date().toISOString() };
    this.data.assignments.push(newAssignment);
    this.save();
    return newAssignment;
  }

  public async saveAssignmentSubmission(data: { schoolId: string; assignmentId: string; studentId: string; studentName: string; content: string }): Promise<AssignmentSubmission> {
    await this.queryRows<AssignmentSubmission>('assignment_submissions', { school_id: data.schoolId });
    const now = new Date().toISOString();
    const existing = this.data.assignmentSubmissions.find(row => row.schoolId === data.schoolId && row.assignmentId === data.assignmentId && row.studentId === data.studentId);
    if (existing) {
      Object.assign(existing, {
        studentName: data.studentName,
        content: data.content,
        submittedAt: now,
        status: 'submitted',
        grade: undefined,
        feedback: undefined
      });
      this.save();
      return existing;
    }
    const submission: AssignmentSubmission = {
      id: `sub-${randomUUID()}`,
      schoolId: data.schoolId,
      assignmentId: data.assignmentId,
      studentId: data.studentId,
      studentName: data.studentName,
      content: data.content,
      submittedAt: now,
      status: 'submitted'
    };
    this.data.assignmentSubmissions.push(submission);
    this.save();
    return submission;
  }

  public async gradeAssignmentSubmission(schoolId: string, assignmentId: string, submissionId: string, grade: number, feedback: string): Promise<AssignmentSubmission | null> {
    await this.queryRows<AssignmentSubmission>('assignment_submissions', { school_id: schoolId, assignment_id: assignmentId });
    const submission = this.data.assignmentSubmissions.find(row => row.id === submissionId && row.assignmentId === assignmentId && row.schoolId === schoolId);
    if (!submission) return null;
    Object.assign(submission, { status: 'graded', grade, feedback });
    this.save();
    return submission;
  }

  public updateSubject(id: string, updates: Partial<Subject>): Subject | null {
    const idx = this.data.subjects.findIndex(s => s.id === id);
    if (idx === -1) return null;
    this.data.subjects[idx] = { ...this.data.subjects[idx], ...updates };
    this.save();
    return this.data.subjects[idx];
  }

  public deleteSubject(id: string): boolean {
    const len = this.data.subjects.length;
    this.data.subjects = this.data.subjects.filter(s => s.id !== id);
    if (this.data.subjects.length < len) {
      this.save();
      return true;
    }
    return false;
  }

  public getTimetable(schoolId: string, classId?: string, teacherId?: string): TimetableSlot[] {
    return this.data.timetable.filter(t => {
      if (t.schoolId !== schoolId) return false;
      if (classId && t.classId !== classId) return false;
      if (teacherId && t.teacherId !== teacherId) return false;
      return true;
    });
  }

  public async replaceTimetableForClass(schoolId: string, classId: string, slots: TimetableSlot[]): Promise<void> {
    const client = this.testClient || supabase;
    if (!client) throw new Error('Timetable storage is unavailable.');
    if (this.testClient) {
      let startedAt = performance.now();
      const { error: deleteError } = await client.from('timetable_slots').delete().eq('school_id', schoolId).eq('class_id', classId);
      this.recordQuery('timetable_slots', 'delete-class-timetable', startedAt);
      if (deleteError) throw new Error(deleteError.message || 'Unable to replace timetable.');
      if (slots.length) {
        startedAt = performance.now();
        const { error } = await client.from('timetable_slots').insert(slots.map(slot => toSupabaseRow(slot, 'timetable_slots')));
        this.recordQuery('timetable_slots', 'insert-class-timetable', startedAt);
        if (error) throw new Error(error.message || 'Unable to save timetable.');
      }
      return;
    }
    const startedAt = performance.now();
    const { error } = await client.rpc('schoolos_replace_class_timetable', {
      p_school_id: schoolId,
      p_class_id: classId,
      p_slots: slots.map(slot => toSupabaseRow(slot, 'timetable_slots'))
    });
    this.recordQuery('rpc:schoolos_replace_class_timetable', 'call', startedAt);
    if (error) throw new Error(error.message || 'Unable to replace timetable.');
  }

  public async swapTimetableSlots(schoolId: string, firstId: string, secondId: string): Promise<void> {
    const client = this.testClient || supabase;
    if (!client) throw new Error('Timetable storage is unavailable.');
    const startedAt = performance.now();
    const { error } = await client.rpc('schoolos_swap_timetable_slots', { p_school_id: schoolId, p_first_id: firstId, p_second_id: secondId });
    this.recordQuery('rpc:schoolos_swap_timetable_slots', 'call', startedAt);
    if (error) throw new Error(error.message || 'Unable to swap timetable periods.');
  }

  public async getTimetableSettings(schoolId: string) {
    const rows = await this.queryRows<any>('timetable_settings', { school_id: schoolId });
    return rows[0] || { schoolId, firstPeriodStart: '08:00', periodMinutes: 40, breakAfterPeriod: 3, breakMinutes: 20 };
  }

  public async saveTimetableSettings(schoolId: string, values: { firstPeriodStart: string; periodMinutes: number; breakAfterPeriod: number; breakMinutes: number }) {
    const client = this.testClient || supabase;
    if (!client) throw new Error('Timetable settings storage is unavailable.');
    const row = toSupabaseRow({ schoolId, ...values, updatedAt: new Date().toISOString() }, 'timetable_settings');
    const startedAt = performance.now();
    const { error } = await client.from('timetable_settings').upsert(row, { onConflict: 'school_id' });
    this.recordQuery('timetable_settings', 'upsert', startedAt);
    if (error) throw new Error(error.message || 'Unable to save timetable settings.');
    return { schoolId, ...values };
  }

  public async setTeacherUnavailability(schoolId: string, teacherId: string, dayOfWeek: string, periodNumber: number, unavailable: boolean) {
    const client = this.testClient || supabase;
    if (!client) throw new Error('Teacher availability storage is unavailable.');
    const id = `${schoolId}-${teacherId}-${dayOfWeek}-${periodNumber}`;
    if (unavailable) {
      const startedAt = performance.now();
      const { error } = await client.from('teacher_unavailability').upsert({ id, school_id: schoolId, teacher_id: teacherId, day_of_week: dayOfWeek, period_number: periodNumber }, { onConflict: 'school_id,teacher_id,day_of_week,period_number' });
      this.recordQuery('teacher_unavailability', 'upsert', startedAt);
      if (error) throw new Error(error.message || 'Unable to save teacher availability.');
    } else {
      const startedAt = performance.now();
      const { error } = await client.from('teacher_unavailability').delete().eq('id', id).eq('school_id', schoolId);
      this.recordQuery('teacher_unavailability', 'delete', startedAt);
      if (error) throw new Error(error.message || 'Unable to update teacher availability.');
    }
  }

  public setTimetableSlot(slotData: Omit<TimetableSlot, 'id'>): TimetableSlot {
    const existingIdx = this.data.timetable.findIndex(t => 
      t.schoolId === slotData.schoolId && 
      t.classId === slotData.classId && 
      t.dayOfWeek === slotData.dayOfWeek && 
      t.periodNumber === slotData.periodNumber
    );
    const id = existingIdx >= 0 ? this.data.timetable[existingIdx].id : `tt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const slot: TimetableSlot = { ...slotData, id };
    if (existingIdx >= 0) {
      this.data.timetable[existingIdx] = slot;
    } else {
      this.data.timetable.push(slot);
    }
    this.save();
    return slot;
  }

  // -------------------------------------------------------------
  // ATTENDANCE: Strictly ONCE PER DAY per class per student
  // -------------------------------------------------------------
  public async getAttendance(schoolId: string, classId: string, date: string): Promise<AttendanceRecord[]> {
    return this.queryRows<AttendanceRecord>('attendance_records', { school_id: schoolId, class_id: classId, date });
  }

  public async getSchoolAttendance(schoolId: string): Promise<AttendanceRecord[]> {
    return this.queryRows<AttendanceRecord>('attendance_records', { school_id: schoolId });
  }

  public async getSchoolMarks(schoolId: string): Promise<StudentMark[]> {
    return this.queryRows<StudentMark>('student_marks', { school_id: schoolId });
  }

  public async getStudentAttendanceHistory(schoolId: string, studentId: string): Promise<AttendanceRecord[]> {
    return this.queryRows<AttendanceRecord>('attendance_records', { school_id: schoolId, student_id: studentId });
  }

  public async recordDailyAttendance(
    schoolId: string,
    classId: string,
    date: string,
    records: { studentId: string; status: 'present' | 'absent' | 'late' | 'excused'; note?: string }[],
    recordedBy: string
  ): Promise<AttendanceRecord[]> {
    await this.queryRows<AttendanceRecord>('attendance_records', { school_id: schoolId, class_id: classId, date });
    const results: AttendanceRecord[] = [];
    const now = new Date().toISOString();

    for (const rec of records) {
      const existingIdx = this.data.attendance.findIndex(a => 
        a.schoolId === schoolId && 
        a.classId === classId && 
        a.studentId === rec.studentId && 
        a.date === date
      );
      const wasAlreadyAbsent = existingIdx >= 0 && this.data.attendance[existingIdx].status === 'absent';

      if (existingIdx >= 0) {
        this.data.attendance[existingIdx].status = rec.status;
        this.data.attendance[existingIdx].note = rec.note;
        this.data.attendance[existingIdx].recordedBy = recordedBy;
        this.data.attendance[existingIdx].recordedAt = now;
        results.push(this.data.attendance[existingIdx]);
      } else {
        const newRecord: AttendanceRecord = {
          id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          schoolId,
          classId,
          studentId: rec.studentId,
          date,
          status: rec.status,
          note: rec.note,
          recordedBy,
          recordedAt: now
        };
        this.data.attendance.push(newRecord);
        results.push(newRecord);
      }

      // Notify a parent only when the record first transitions into absent.
      if (rec.status === 'absent' && !wasAlreadyAbsent) {
        const student = await this.getStudentById(rec.studentId, schoolId);
        const parentPhone = student?.fatherPhone || student?.motherPhone;
        if (student && parentPhone) {
          await this.queueNotification({
            schoolId,
            recipientPhone: parentPhone,
            recipientName: `Parent of ${student.firstName}`,
            studentId: student.id,
            messageType: 'attendance_absent',
            channel: 'sms',
            content: `Notice: ${student.firstName} ${student.lastName} was marked absent on ${date}. Please contact the school if you have any questions.`
          });
        }
      }
    }

    this.save();
    return results;
  }

  // -------------------------------------------------------------
  // EXAMS & RESULTS: Small Exam + Big Exam -> Percentage Only
  // -------------------------------------------------------------
  public getExamConfig(schoolId: string, academicYear?: string): ExamConfig {
    const schoolYear = this.data.schools.find(school => school.id === schoolId)?.academicYear;
    const yr = academicYear || schoolYear || this.data.settings.academicYearName || '2026-2027';
    let conf = this.data.examConfigs.find(ec => ec.schoolId === schoolId && ec.academicYear === yr);
    if (!conf) {
      conf = {
        id: `ec-${schoolId}-${Date.now()}`,
        schoolId,
        academicYear: yr,
        smallExamName: 'Small Exam',
        smallExamMax: 10,
        bigExamName: 'Big Exam',
        bigExamMax: 10,
        passMarkPercentage: 50,
        updatedAt: new Date().toISOString()
      };
      this.data.examConfigs.push(conf);
      this.save();
    }
    return conf;
  }

  public updateExamConfig(schoolId: string, updates: Partial<ExamConfig>): ExamConfig {
    const nextSmallMax = updates.smallExamMax ?? this.getExamConfig(schoolId).smallExamMax;
    const nextBigMax = updates.bigExamMax ?? this.getExamConfig(schoolId).bigExamMax;
    const nextPassMark = updates.passMarkPercentage ?? this.getExamConfig(schoolId).passMarkPercentage;
    if (![nextSmallMax, nextBigMax].every(value => Number.isFinite(value) && value > 0) || !Number.isFinite(nextPassMark) || nextPassMark < 0 || nextPassMark > 100) {
      throw new Error('Exam maximum marks must be positive numbers and pass mark must be between 0 and 100.');
    }
    const schoolYear = this.data.schools.find(school => school.id === schoolId)?.academicYear;
    const yr = updates.academicYear || schoolYear || this.data.settings.academicYearName || '2026-2027';
    let conf = this.getExamConfig(schoolId, yr);
    const idx = this.data.examConfigs.findIndex(ec => ec.id === conf.id);
    this.data.examConfigs[idx] = {
      ...this.data.examConfigs[idx],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.save();
    return this.data.examConfigs[idx];
  }

  public async getMarks(schoolId: string, classId: string, subjectId?: string, semester?: 'Semester 1' | 'Semester 2'): Promise<StudentMark[]> {
    return this.queryRows<StudentMark>('student_marks', { school_id: schoolId, class_id: classId, subject_id: subjectId, semester });
  }

  public async getStudentMarks(schoolId: string, studentId: string): Promise<StudentMark[]> {
    return this.queryRows<StudentMark>('student_marks', { school_id: schoolId, student_id: studentId, status: 'approved' });
  }

  public async saveStudentMarks(
    schoolId: string,
    classId: string,
    subjectId: string,
    semester: 'Semester 1' | 'Semester 2',
    marks: { studentId: string; smallExamMarks: number; bigExamMarks: number; teacherRemarks?: string; status: 'draft' | 'submitted' }[],
    submittedBy: string
  ): Promise<StudentMark[]> {
    await this.getMarks(schoolId, classId, subjectId, semester);
    const config = this.getExamConfig(schoolId);
    const maxTotal = (config.smallExamMax || 10) + (config.bigExamMax || 10);
    for (const mark of marks) {
      if (!Number.isFinite(mark.smallExamMarks) || !Number.isFinite(mark.bigExamMarks) || mark.smallExamMarks < 0 || mark.bigExamMarks < 0 || mark.smallExamMarks > config.smallExamMax || mark.bigExamMarks > config.bigExamMax) {
        throw new Error(`Marks must be between 0 and the configured maximums (${config.smallExamMax} and ${config.bigExamMax}).`);
      }
    }
    const now = new Date().toISOString();
    const results: StudentMark[] = [];

    for (const m of marks) {
      const total = (m.smallExamMarks || 0) + (m.bigExamMarks || 0);
      const percentage = maxTotal > 0 ? Math.round(((total / maxTotal) * 100) * 100) / 100 : 0;

      const existingIdx = this.data.marks.findIndex(mk => 
        mk.schoolId === schoolId && 
        mk.classId === classId && 
        mk.subjectId === subjectId && 
        mk.studentId === m.studentId && 
        mk.semester === semester
      );

      if (existingIdx >= 0) {
        // Only allow update if not already approved
        if (this.data.marks[existingIdx].status === 'approved') continue;

        this.data.marks[existingIdx].smallExamMarks = m.smallExamMarks;
        this.data.marks[existingIdx].bigExamMarks = m.bigExamMarks;
        this.data.marks[existingIdx].totalMarks = total;
        this.data.marks[existingIdx].percentage = percentage;
        this.data.marks[existingIdx].status = m.status;
        this.data.marks[existingIdx].teacherRemarks = m.teacherRemarks;
        this.data.marks[existingIdx].submittedBy = submittedBy;
        this.data.marks[existingIdx].submittedAt = now;
        results.push(this.data.marks[existingIdx]);
      } else {
        const newMark: StudentMark = {
          id: `mrk-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          schoolId,
          classId,
          subjectId,
          studentId: m.studentId,
          academicYear: config.academicYear,
          semester,
          smallExamMarks: m.smallExamMarks,
          bigExamMarks: m.bigExamMarks,
          totalMarks: total,
          percentage,
          status: m.status,
          teacherRemarks: m.teacherRemarks,
          submittedBy,
          submittedAt: now
        };
        this.data.marks.push(newMark);
        results.push(newMark);
      }
    }

    this.save();
    return results;
  }

  public approveMarks(schoolId: string, markIds: string[], approvedBy: string): StudentMark[] {
    const now = new Date().toISOString();
    const approved: StudentMark[] = [];

    for (const id of markIds) {
      const idx = this.data.marks.findIndex(m => m.id === id && m.schoolId === schoolId);
      if (idx >= 0) {
        this.data.marks[idx].status = 'approved';
        this.data.marks[idx].approvedBy = approvedBy;
        this.data.marks[idx].approvedAt = now;
        approved.push(this.data.marks[idx]);
      }
    }

    if (approved.length > 0) {
      this.logAudit({
        action: 'MARKS_APPROVED',
        category: 'academics',
        schoolId,
        userId: approvedBy,
        userName: 'School Administrator',
        userRole: 'school_admin',
        details: `Approved examination marks for ${approved.length} student subject records.`,
        severity: 'info'
      });
      this.save();
    }
    return approved;
  }

  // Calculate Semester Results & Class Rank (Highlight top 3 students)
  public async getClassSemesterRankings(schoolId: string, classId: string, semester: 'Semester 1' | 'Semester 2') {
    const students = await this.getStudents(schoolId, classId);
    const marks = await this.getMarks(schoolId, classId, undefined, semester);

    const rankings = students.map(student => {
      const studentMarks = marks.filter(m => m.studentId === student.id);
      const totalPercentage = studentMarks.reduce((acc, m) => acc + (m.percentage || 0), 0);
      const subjectCount = studentMarks.length;
      const averagePercentage = subjectCount > 0 ? Math.round((totalPercentage / subjectCount) * 100) / 100 : 0;

      return {
        student,
        subjectCount,
        marks: studentMarks,
        averagePercentage,
        rank: 0,
        isTopThree: false
      };
    });

    // Sort descending by average percentage
    rankings.sort((a, b) => b.averagePercentage - a.averagePercentage);

    rankings.forEach((r, idx) => {
      r.rank = idx + 1;
      r.isTopThree = idx < 3 && r.averagePercentage > 0;
    });

    return rankings;
  }

  // Calculate Yearly Results (combines Semester 1 and Semester 2 for final report card)
  public async getClassYearlyRankings(schoolId: string, classId: string) {
    const students = await this.getStudents(schoolId, classId);
    const sem1Marks = await this.getMarks(schoolId, classId, undefined, 'Semester 1');
    const sem2Marks = await this.getMarks(schoolId, classId, undefined, 'Semester 2');
    const config = this.getExamConfig(schoolId);
    const subjects = await this.getSubjects(schoolId);

    const yearlyResults = students.map(student => {
      const s1 = sem1Marks.filter(m => m.studentId === student.id);
      const s2 = sem2Marks.filter(m => m.studentId === student.id);

      // Subject by subject combining
      const subjectResults = subjects.map(sub => {
        const m1 = s1.find(m => m.subjectId === sub.id);
        const m2 = s2.find(m => m.subjectId === sub.id);
        const p1 = m1 ? m1.percentage : null;
        const p2 = m2 ? m2.percentage : null;
        let yearlyP = null;
        if (p1 !== null && p2 !== null) yearlyP = Math.round(((p1 + p2) / 2) * 100) / 100;
        else if (p1 !== null) yearlyP = p1;
        else if (p2 !== null) yearlyP = p2;

        const markDetails = (mark: StudentMark | undefined) => mark ? {
          smallExamMarks: mark.smallExamMarks,
          bigExamMarks: mark.bigExamMarks,
          totalMarks: mark.totalMarks,
          percentage: mark.percentage,
          status: mark.status
        } : null;

        return {
          subject: sub,
          sem1Marks: markDetails(m1),
          sem2Marks: markDetails(m2),
          sem1Percentage: p1,
          sem2Percentage: p2,
          yearlyPercentage: yearlyP,
          maxMarks: {
            small: config.smallExamMax,
            big: config.bigExamMax,
            total: (config.smallExamMax || 0) + (config.bigExamMax || 0)
          }
        };
      }).filter(sr => sr.sem1Percentage !== null || sr.sem2Percentage !== null);

      const validPercentages = subjectResults.map(sr => sr.yearlyPercentage).filter(p => p !== null) as number[];
      const yearlyAvg = validPercentages.length > 0 
        ? Math.round((validPercentages.reduce((a, b) => a + b, 0) / validPercentages.length) * 100) / 100 
        : 0;

      const isPass = yearlyAvg >= (config.passMarkPercentage || 50);

      return {
        student,
        subjectResults,
        yearlyPercentage: yearlyAvg,
        isPass,
        yearlyRank: 0,
        isTopThree: false
      };
    });

    yearlyResults.sort((a, b) => b.yearlyPercentage - a.yearlyPercentage);

    yearlyResults.forEach((yr, idx) => {
      yr.yearlyRank = idx + 1;
      yr.isTopThree = idx < 3 && yr.yearlyPercentage > 0;
    });

    return yearlyResults;
  }

  // -------------------------------------------------------------
  // YEAR-END PROMOTION
  // -------------------------------------------------------------
  public async getPromotionHistory(schoolId: string): Promise<PromotionRecord[]> {
    return this.queryRows<PromotionRecord>('promotion_history', { school_id: schoolId });
  }

  public async confirmYearEndPromotions(
    schoolId: string,
    classId: string,
    topN: number,
    promotions: { studentId: string; classFromId: string; classToId?: string; yearlyPercentage: number; yearlyRank: number; decision: 'promoted' | 'repeated'; notes?: string; adminOverride?: boolean }[],
    processedBy: string
  ): Promise<PromotionRecord[]> {
    if (!Number.isInteger(topN) || topN < 1) throw new Error('topN must be a positive whole number.');
    const sourceClass = await this.getClassById(classId, schoolId);
    if (!sourceClass) throw new Error('Promotion source class was not found in this school.');
    const rankings = await this.getClassYearlyRankings(schoolId, classId);
    const rankByStudent = new Map(rankings.map((row, index) => [row.student.id, { ...row, rank: index + 1 }]));
    if (new Set(promotions.map(row => row.studentId)).size !== promotions.length || promotions.length !== rankings.length) {
      throw new Error('Confirmations must include each student in the selected class exactly once.');
    }
    for (const promotion of promotions) {
      const rank = rankByStudent.get(promotion.studentId);
      if (!rank || promotion.classFromId !== classId) throw new Error('Promotion includes a student outside the selected class.');
      const eligible = rank.isPass && rank.rank <= topN;
      const isDefaultDecision = (eligible && promotion.decision === 'promoted') || (!eligible && promotion.decision === 'repeated');
      if (!isDefaultDecision && (!promotion.adminOverride || !promotion.notes?.trim())) {
        throw new Error('A reason is required for an administrator promotion override.');
      }
      if (promotion.decision === 'promoted') {
        if (!promotion.classToId || !(await this.getClassById(promotion.classToId, schoolId))) throw new Error('Target class must belong to this school.');
      }
      promotion.yearlyPercentage = rank.yearlyPercentage;
      promotion.yearlyRank = rank.rank;
      if (promotion.adminOverride) promotion.notes = `ADMIN OVERRIDE: ${promotion.notes!.trim()}`;
    }
    const config = this.getExamConfig(schoolId);
    const yrFrom = config.academicYear;
    const [startYr, endYr] = yrFrom.split('-').map(Number);
    const yrTo = `${startYr + 1}-${endYr + 1}`;
    const now = new Date().toISOString();
    const created: PromotionRecord[] = [];

    for (const p of promotions) {
      const rec: PromotionRecord = {
        id: `prm-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        schoolId,
        academicYearFrom: yrFrom,
        academicYearTo: yrTo,
        classFromId: p.classFromId,
        classToId: p.decision === 'promoted' ? p.classToId : p.classFromId,
        studentId: p.studentId,
        yearlyPercentage: p.yearlyPercentage,
        yearlyRank: p.yearlyRank,
        decision: p.decision,
        notes: p.notes,
        processedBy,
        processedAt: now
      };
      this.data.promotions.push(rec);
      this.data.promotionHistory.push(rec);
      created.push(rec);

      // If promoted to next class, update student record
      if (p.decision === 'promoted' && p.classToId) {
        await this.updateStudent(p.studentId, { classId: p.classToId }, schoolId);
      }
    }

    this.logAudit({
      action: 'YEAR_END_PROMOTION_CONFIRMED',
      category: 'academics',
      schoolId,
      userId: processedBy,
      userName: 'School Administrator',
      userRole: 'school_admin',
      details: `Processed year-end promotions for ${created.length} students from ${yrFrom} to ${yrTo}.`,
      severity: 'info'
    });

    this.save();
    return created;
  }

  // -------------------------------------------------------------
  // CASH-ONLY FEES & CLASS-RANGE LEDGER
  // -------------------------------------------------------------
  public async getFeeStructures(schoolId: string): Promise<FeeStructureItem[]> {
    return this.queryRows<FeeStructureItem>('fee_structures', { school_id: schoolId });
  }

  public createFeeStructure(structure: Omit<FeeStructureItem, 'id'>): FeeStructureItem {
    const item: FeeStructureItem = {
      ...structure,
      id: `fs-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
    };
    this.data.feeStructures.push(item);
    this.save();
    return item;
  }

  public async updateFeeStructure(id: string, schoolId: string, updates: Partial<FeeStructureItem>): Promise<FeeStructureItem | null> {
    await this.getFeeStructures(schoolId);
    const idx = this.data.feeStructures.findIndex(f => f.id === id && f.schoolId === schoolId);
    if (idx === -1) return null;
    this.data.feeStructures[idx] = { ...this.data.feeStructures[idx], ...updates };
    this.save();
    return this.data.feeStructures[idx];
  }

  public async deleteFeeStructure(id: string, schoolId: string): Promise<boolean> {
    await this.getFeeStructures(schoolId);
    const len = this.data.feeStructures.length;
    this.data.feeStructures = this.data.feeStructures.filter(f => !(f.id === id && f.schoolId === schoolId));
    if (this.data.feeStructures.length < len) {
      this.save();
      return true;
    }
    return false;
  }

  public async getFeePayments(schoolId: string, studentId?: string): Promise<FeePayment[]> {
    return this.queryRows<FeePayment>('fee_payments', { school_id: schoolId, student_id: studentId });
  }

  public async getFeePaymentsForStudents(schoolId: string, studentIds: string[]): Promise<FeePayment[]> {
    const ids = [...new Set(studentIds.filter(id => typeof id === 'string' && id.length > 0))];
    if (!ids.length) return [];
    return this.queryRows<FeePayment>('fee_payments', { school_id: schoolId, student_id: ids });
  }

  public async getFeePaymentById(id: string, schoolId: string): Promise<FeePayment | null> {
    const rows = await this.queryRows<FeePayment>('fee_payments', { id, school_id: schoolId });
    return rows[0] || null;
  }

  public async voidFeePayment(id: string, schoolId: string, userId: string, reason: string): Promise<FeePayment | null> {
    await this.queryRows<FeePayment>('fee_payments', { id, school_id: schoolId });
    const payment = this.data.feePayments.find(item => item.id === id && item.schoolId === schoolId);
    if (!payment || payment.voidedAt) return null;
    Object.assign(payment, { voidedAt: new Date().toISOString(), voidedBy: userId, voidReason: reason });
    this.save();
    return payment;
  }

  // Record Cash Payment only!
  public async recordCashFeePayment(
    paymentData: {
      schoolId: string;
      studentId: string;
      academicYear: string;
      month: string;
      feeType: 'monthly_tuition' | 'annual_registration' | 'bus' | 'custom';
      amountDue: number;
      amountPaid: number;
      recordedBy: string;
      notes?: string;
      idempotencyKey?: string;
      feeStructureId?: string;
    }
  ): Promise<FeePayment> {
    const operationKey = paymentData.idempotencyKey ? `${paymentData.schoolId}:${paymentData.idempotencyKey}` : undefined;
    if (operationKey) {
      const pending = this.feePaymentOperations.get(operationKey);
      if (pending) return pending;
      const operation = this.runSerializedFeeWrite(paymentData.schoolId, () => this.recordCashFeePaymentInternal(paymentData));
      this.feePaymentOperations.set(operationKey, operation);
      try { return await operation; }
      finally { if (this.feePaymentOperations.get(operationKey) === operation) this.feePaymentOperations.delete(operationKey); }
    }
    return this.runSerializedFeeWrite(paymentData.schoolId, () => this.recordCashFeePaymentInternal(paymentData));
  }

  private async runSerializedFeeWrite<T>(schoolId: string, action: () => Promise<T>): Promise<T> {
    const previous = this.feePaymentQueues.get(schoolId) || Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>(resolve => { release = resolve; });
    this.feePaymentQueues.set(schoolId, current);
    await previous;
    try { return await action(); }
    finally {
      release();
      if (this.feePaymentQueues.get(schoolId) === current) this.feePaymentQueues.delete(schoolId);
    }
  }

  private async recordCashFeePaymentInternal(paymentData: {
    schoolId: string; studentId: string; academicYear: string; month: string;
    feeType: 'monthly_tuition' | 'annual_registration' | 'bus' | 'custom'; amountDue: number; amountPaid: number;
    recordedBy: string; notes?: string; idempotencyKey?: string; feeStructureId?: string;
  }): Promise<FeePayment> {
    const student = await this.getStudentById(paymentData.studentId, paymentData.schoolId);
    if (!student || student.schoolId !== paymentData.schoolId) throw new Error('Student is not part of this school.');
    await this.getFeePayments(paymentData.schoolId, student.id);
    if (paymentData.idempotencyKey) {
      const prior = (await this.getFeePayments(paymentData.schoolId)).find(payment => payment.idempotencyKeys?.includes(paymentData.idempotencyKey!));
      if (prior) return prior;
    }
    const classInfo = (await this.getClasses(paymentData.schoolId)).find(item => item.id === student.classId);
    const structures = (await this.getFeeStructures(paymentData.schoolId)).filter(item => item.isActive);
    const matching = paymentData.feeType === 'custom'
      ? structures.find(item => item.id === paymentData.feeStructureId && item.feeType === 'custom' && (!item.classId || item.classId === student.classId))
      : structures.find(item => item.feeType === paymentData.feeType && (
      ['annual_registration', 'custom', 'bus'].includes(paymentData.feeType)
        ? !item.classId || item.classId === student.classId
        : item.classId ? item.classId === student.classId : item.minGrade !== undefined && item.maxGrade !== undefined && classInfo && classInfo.gradeLevel >= item.minGrade && classInfo.gradeLevel <= item.maxGrade
      ));
    if (paymentData.feeType === 'custom' && !matching) throw new Error('Choose an active custom fee configured for this student’s class.');
    if (paymentData.feeType === 'bus') {
      const assignment = (await this.getBusAssignments(paymentData.schoolId)).find(item => item.studentId === student.id && item.active);
      if (!assignment) throw new Error('Assign this student to an active bus route before charging a bus fee.');
      paymentData.amountDue = Number(assignment.feeAmount);
    } else if (matching && ['monthly_tuition', 'annual_registration', 'custom'].includes(paymentData.feeType)) {
      paymentData.amountDue = Number(matching.amount);
    }
    if (!Number.isFinite(paymentData.amountDue) || !Number.isFinite(paymentData.amountPaid) || paymentData.amountDue < 0 || paymentData.amountPaid < 0 || paymentData.amountPaid > paymentData.amountDue) {
      throw new Error('Payment amounts must be valid, non-negative values and cash paid cannot exceed the amount due.');
    }
    const registrationRecord = paymentData.feeType === 'annual_registration'
      ? this.data.feePayments.find(item => item.schoolId === paymentData.schoolId && item.studentId === student.id && item.feeType === 'annual_registration' && item.academicYear === paymentData.academicYear && !item.voidedAt)
      : undefined;
    if (registrationRecord) {
      if (registrationRecord.status === 'paid') throw new Error('The annual registration fee is already paid for this student and academic year.');
      const cumulativePaid = registrationRecord.amountPaid + paymentData.amountPaid;
      if (cumulativePaid > registrationRecord.amountDue) throw new Error('Cash paid cannot exceed the remaining registration balance.');
      registrationRecord.amountPaid = cumulativePaid;
      registrationRecord.remainingAmount = registrationRecord.amountDue - cumulativePaid;
      registrationRecord.status = registrationRecord.remainingAmount === 0 ? 'paid' : 'partial';
      registrationRecord.date = new Date().toISOString().split('T')[0];
      registrationRecord.recordedBy = paymentData.recordedBy;
      if (paymentData.idempotencyKey) registrationRecord.idempotencyKeys = [...(registrationRecord.idempotencyKeys || []), paymentData.idempotencyKey];
      if (paymentData.notes) registrationRecord.notes = [registrationRecord.notes, paymentData.notes].filter(Boolean).join(' · ');
      this.logAudit({ action: 'REGISTRATION_FEE_INSTALLMENT', category: 'finance', schoolId: paymentData.schoolId, userId: paymentData.recordedBy, userName: 'Cashier / Accountant', userRole: 'accountant', details: `Collected an additional registration-fee installment for student ID ${student.id}. Balance: ${registrationRecord.remainingAmount}.`, severity: 'info' });
      this.save();
      await this.flush();
      return registrationRecord;
    }
    const remaining = Math.max(0, paymentData.amountDue - paymentData.amountPaid);
    const status = remaining === 0 ? 'paid' : paymentData.amountPaid > 0 ? 'partial' : 'unpaid';
    const school = await this.getSchoolById(paymentData.schoolId);
    const paymentCount = await this.queryPage('fee_payments', { school_id: paymentData.schoolId }, 1, 1);
    const receiptCount = paymentCount.total + 1;
    const receiptNumber = `REC-${school?.code || 'SCH'}-${paymentData.academicYear.split('-')[0]}-${String(receiptCount).padStart(4, '0')}`;

    const payment: FeePayment = {
      id: `fee-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      schoolId: paymentData.schoolId,
      studentId: paymentData.studentId,
      receiptNumber,
      academicYear: paymentData.academicYear,
      month: paymentData.month,
      feeType: paymentData.feeType,
      feeStructureId: paymentData.feeType === 'custom' ? matching?.id : undefined,
      idempotencyKey: paymentData.idempotencyKey,
      amountDue: paymentData.amountDue,
      amountPaid: paymentData.amountPaid,
      remainingAmount: remaining,
      paymentMethod: 'Cash', // Strictly Cash only
      status,
      date: new Date().toISOString().split('T')[0],
      recordedBy: paymentData.recordedBy,
      notes: paymentData.notes,
      idempotencyKeys: paymentData.idempotencyKey ? [paymentData.idempotencyKey] : []
    };

    this.data.feePayments.push(payment);

    this.logAudit({
      action: 'CASH_FEE_PAYMENT_RECORDED',
      category: 'finance',
      schoolId: paymentData.schoolId,
      userId: paymentData.recordedBy,
      userName: 'Cashier / Accountant',
      userRole: 'accountant',
      details: `Recorded cash payment (Receipt #${receiptNumber}) for student ID ${paymentData.studentId}.`,
      severity: 'info'
    });

    this.save();
    await this.flush();
    return payment;
  }

  // Daily cash income report
  public async getDailyIncomeReport(schoolId: string, date: string) {
    const payments = (await this.getFeePayments(schoolId)).filter(f => f.date === date && !f.voidedAt);
    const totalCollected = payments.reduce((acc, p) => acc + (p.amountPaid || 0), 0);
    return {
      date,
      totalCollected,
      paymentCount: payments.length,
      payments
    };
  }

  // Fee arrears list
  public async getArrearsList(schoolId: string) {
    const students = await this.getStudents(schoolId);
    const payments = await this.getFeePayments(schoolId);
    const classes = await this.getClasses(schoolId);

    return students.map(student => {
      const studentClass = classes.find(c => c.id === student.classId);
      const studentPayments = payments.filter(p => p.studentId === student.id);
      const totalPaid = studentPayments.filter(payment => !payment.voidedAt).reduce((acc, p) => acc + (p.amountPaid || 0), 0);
      const totalDue = studentPayments.reduce((acc, p) => acc + (p.amountDue || 0), 0);
      const totalRemaining = studentPayments.reduce((acc, p) => acc + (p.voidedAt ? p.amountDue || 0 : p.remainingAmount || 0), 0);

      return {
        student,
        className: studentClass ? studentClass.name : 'Unassigned',
        totalDue,
        totalPaid,
        totalRemaining,
        hasArrears: totalRemaining > 0
      };
    }).filter(s => s.hasArrears);
  }

  // -------------------------------------------------------------
  // REPORT CARD DESIGNER
  // -------------------------------------------------------------
  public async getReportCardDesign(schoolId: string): Promise<ReportCardDesign> {
    await this.queryRows<ReportCardDesign>('report_card_templates', { school_id: schoolId });
    let design = this.data.reportCardDesigns.find(rc => rc.schoolId === schoolId);
    if (!design) {
      const school = await this.getSchoolById(schoolId);
      design = {
        id: `rcd-${schoolId}`,
        schoolId,
        templateId: 'modern',
        primaryColor: school?.brandColor || '#0F766E',
        secondaryColor: '#0B2B2A',
        logoPosition: 'center',
        titleText: `${school?.name || 'School'} Official Academic Achievement Record`,
        visibleBlocks: {
          rank: true,
          teacherRemarks: true,
          adminRemarks: true,
          percentage: true,
          signatures: true,
          stamp: true
        },
        signatureTitleLeft: 'Class Teacher',
        signatureTitleRight: 'Principal / Headmaster',
        updatedAt: new Date().toISOString()
      };
      this.data.reportCardDesigns.push(design);
      this.save();
    }
    return design;
  }

  public async updateReportCardDesign(schoolId: string, updates: Partial<ReportCardDesign>): Promise<ReportCardDesign> {
    const design = await this.getReportCardDesign(schoolId);
    const idx = this.data.reportCardDesigns.findIndex(rc => rc.id === design.id);
    this.data.reportCardDesigns[idx] = {
      ...this.data.reportCardDesigns[idx],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.save();
    return this.data.reportCardDesigns[idx];
  }

  // -------------------------------------------------------------
  // COMMUNICATION & SMS / WHATSAPP QUEUE
  // -------------------------------------------------------------
  public async getCommunicationSettings(schoolId: string): Promise<CommunicationSettings> {
    await this.queryRows<CommunicationSettings>('communication_settings', { school_id: schoolId });
    let s = this.data.communicationSettings.find(cs => cs.schoolId === schoolId);
    if (!s) {
      s = {
        id: `cs-${schoolId}`,
        schoolId,
        provider: 'none',
        isActive: false,
        updatedAt: new Date().toISOString()
      };
      this.data.communicationSettings.push(s);
      this.save();
    }
    return s;
  }

  public async updateCommunicationSettings(schoolId: string, updates: Partial<CommunicationSettings>): Promise<CommunicationSettings> {
    const s = await this.getCommunicationSettings(schoolId);
    const idx = this.data.communicationSettings.findIndex(cs => cs.id === s.id);
    this.data.communicationSettings[idx] = {
      ...this.data.communicationSettings[idx],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.save();
    return this.data.communicationSettings[idx];
  }

  public async queueNotification(itemData: Omit<CommunicationQueueItem, 'id' | 'createdAt' | 'status'>): Promise<CommunicationQueueItem> {
    const settings = await this.getCommunicationSettings(itemData.schoolId);
    const isConfigured = settings.isActive && settings.provider !== 'none';

    const item: CommunicationQueueItem = {
      ...itemData,
      id: `msg-q-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      status: isConfigured ? 'sent' : 'queued',
      errorMessage: isConfigured ? undefined : 'No active SMS/WhatsApp provider configured. Stored in queue as not sent.',
      createdAt: new Date().toISOString(),
      sentAt: isConfigured ? new Date().toISOString() : undefined
    };

    this.data.communicationQueue.push(item);
    this.save();
    return item;
  }

  public async getCommunicationQueue(schoolId: string): Promise<CommunicationQueueItem[]> {
    return this.queryRows<CommunicationQueueItem>('communication_queue', { school_id: schoolId });
  }

  // -------------------------------------------------------------
  // NOTICES & DIRECT MESSAGES & BROADCASTS
  // -------------------------------------------------------------
  public async getNotices(schoolId: string): Promise<SchoolNotice[]> {
    return this.queryRows<SchoolNotice>('school_notices', { school_id: schoolId });
  }

  public createNotice(noticeData: Omit<SchoolNotice, 'id'>): SchoolNotice {
    const notice: SchoolNotice = {
      ...noticeData,
      id: `ntc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
    };
    this.data.notices.push(notice);
    this.invalidateNoticeCounts(notice.schoolId);
    this.save();
    return notice;
  }

  public async updateNotice(id: string, schoolId: string, updates: Partial<SchoolNotice>): Promise<SchoolNotice | null> {
    await this.queryRows<SchoolNotice>('school_notices', { id, school_id: schoolId });
    const index = this.data.notices.findIndex(notice => notice.id === id && notice.schoolId === schoolId && notice.isActive !== false);
    if (index < 0) return null;
    this.data.notices[index] = { ...this.data.notices[index], ...updates, id, schoolId };
    this.invalidateNoticeCounts(schoolId);
    this.save();
    return this.data.notices[index];
  }

  public async archiveNotice(id: string, schoolId: string): Promise<boolean> {
    return Boolean(await this.updateNotice(id, schoolId, { isActive: false }));
  }

  public async getNoticeUnreadCount(schoolId: string, userId: string, role: string, classIds: string[] = [], _identity?: User): Promise<number> {
    const cacheKey = `${schoolId}:${userId}`;
    const cached = noticeCountCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.count;
    const client = this.testClient || supabase;
    if (!client) throw new Error('Supabase client is not configured.');
    if (typeof client.rpc === 'function') {
      const startedAt = performance.now();
      const { data, error } = await client.rpc('schoolos_notice_unread_count', {
        p_school_id: schoolId,
        p_user_id: userId,
        p_role: role,
        p_class_ids: classIds
      });
      this.recordQuery('rpc:schoolos_notice_unread_count', 'call', startedAt);
      if (error) throw new Error(`Unable to count unread notices: ${error.message}`);
      const count = Number(data || 0);
      noticeCountCache.set(cacheKey, { count, expiresAt: Date.now() + NOTICE_COUNT_TTL_MS });
      return count;
    }
    const [notices, reads] = await Promise.all([
      this.queryRows<SchoolNotice>('school_notices', { school_id: schoolId, is_active: 'true' }),
      this.queryRows<any>('notice_reads', { school_id: schoolId, user_id: userId })
    ]);
    const readIds = new Set(reads.map(row => row.noticeId));
    const count = notices.filter(notice => {
      const visible = ['school_admin', 'super_admin', 'accountant'].includes(role) || ['all', 'school'].includes(notice.audience) || notice.audience === role + 's' || notice.audience === 'class' && Boolean(notice.classId && classIds.includes(notice.classId));
      return visible && !readIds.has(notice.id);
    }).length;
    noticeCountCache.set(cacheKey, { count, expiresAt: Date.now() + NOTICE_COUNT_TTL_MS });
    return count;
  }

  public async markNoticeRead(schoolId: string, noticeId: string, userId: string): Promise<boolean> {
    const notice = (await this.queryRows<SchoolNotice>('school_notices', { id: noticeId, school_id: schoolId, is_active: 'true' }))[0];
    if (!notice) return false;
    const id = `${schoolId}:${noticeId}:${userId}`;
    const client = this.testClient || supabase;
    if (!client) throw new Error('Supabase client is not configured.');
    const startedAt = performance.now();
    const { error } = await client.from('notice_reads').upsert({ id, school_id: schoolId, notice_id: noticeId, user_id: userId, read_at: new Date().toISOString() }, { onConflict: 'school_id,notice_id,user_id' });
    this.recordQuery('notice_reads', 'upsert', startedAt);
    if (error) throw new Error(`Unable to mark notice read: ${error.message}`);
    this.invalidateNoticeCounts(schoolId, userId);
    return true;
  }

  public async markNoticesRead(schoolId: string, noticeIds: string[], userId: string, role: string, classIds: string[] = []): Promise<number> {
    const uniqueIds = [...new Set(noticeIds)].slice(0, 100);
    if (!uniqueIds.length) return 0;
    const notices = await this.queryRows<SchoolNotice>('school_notices', {
      id: uniqueIds,
      school_id: schoolId,
      is_active: 'true'
    });
    const roleAudience = role === 'teacher' ? 'teachers' : role === 'parent' ? 'parents' : 'students';
    const visible = notices.filter(notice =>
      ['school_admin', 'super_admin', 'accountant'].includes(role)
      || ['all', 'school', roleAudience].includes(notice.audience)
      || notice.audience === 'class' && Boolean(notice.classId && classIds.includes(notice.classId))
    );
    if (!visible.length) return 0;
    const client = this.testClient || supabase;
    if (!client) throw new Error('Supabase client is not configured.');
    const timestamp = new Date().toISOString();
    const receipts = visible.map(notice => ({
      id: `${schoolId}:${notice.id}:${userId}`,
      school_id: schoolId,
      notice_id: notice.id,
      user_id: userId,
      read_at: timestamp
    }));
    const startedAt = performance.now();
    const { error } = await client.from('notice_reads').upsert(receipts, { onConflict: 'school_id,notice_id,user_id' });
    this.recordQuery('notice_reads', 'upsert-batch', startedAt);
    if (error) throw new Error(`Unable to mark notices read: ${error.message}`);
    this.invalidateNoticeCounts(schoolId, userId);
    return visible.length;
  }

  public async getMessages(schoolId: string, userId: string): Promise<DirectMessage[]> {
    const [sent, received] = await Promise.all([
      this.queryRows<DirectMessage>('direct_messages', { school_id: schoolId, sender_id: userId }),
      this.queryRows<DirectMessage>('direct_messages', { school_id: schoolId, recipient_id: userId })
    ]);
    return [...new Map([...sent, ...received].map(message => [message.id, message])).values()];
  }

  public sendMessage(msgData: Omit<DirectMessage, 'id' | 'timestamp' | 'isRead'>): DirectMessage {
    const message: DirectMessage = {
      ...msgData,
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      isRead: false
    };
    this.data.messages.push(message);
    this.save();
    return message;
  }

  public async markMessagesRead(schoolId: string, userId: string, contactId: string): Promise<void> {
    await this.getMessages(schoolId, userId);
    let changed = false;
    this.data.messages = this.data.messages.map(message => {
      if (message.schoolId === schoolId && message.senderId === contactId && message.recipientId === userId && !message.isRead) { changed = true; return { ...message, isRead: true }; }
      return message;
    });
    if (changed) this.save();
  }

  public getBroadcasts(): PlatformBroadcast[] {
    return this.data.broadcasts;
  }

  public createBroadcast(bData: Omit<PlatformBroadcast, 'id' | 'createdAt'>): PlatformBroadcast {
    const b: PlatformBroadcast = {
      ...bData,
      id: `brd-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString()
    };
    this.data.broadcasts.push(b);
    this.save();
    return b;
  }

  // -------------------------------------------------------------
  // SUPPORT TICKETS
  // -------------------------------------------------------------
  public async getTickets(schoolId?: string): Promise<SupportTicket[]> {
    return this.queryRows<SupportTicket>('support_tickets', { school_id: schoolId });
  }

  public async createTicket(ticketData: Omit<SupportTicket, 'id' | 'ticketNumber' | 'createdAt' | 'updatedAt' | 'messages'>, initialMessage: string): Promise<SupportTicket> {
    const ticketCount = await this.queryPage('support_tickets', { school_id: ticketData.schoolId }, 1, 1);
    const now = new Date().toISOString();
    const count = ticketCount.total + 1001;
    const ticket: SupportTicket = {
      ...ticketData,
      id: `tik-${Date.now()}`,
      ticketNumber: `TIK-${count}`,
      status: 'open',
      messages: [{
        id: `msg-${Date.now()}`,
        senderId: ticketData.createdByUserId,
        senderName: ticketData.createdByName,
        senderRole: ticketData.createdByRole,
        content: initialMessage,
        timestamp: now
      }],
      createdAt: now,
      updatedAt: now
    };
    this.data.tickets.push(ticket);
    this.save();
    return ticket;
  }

  public async replyTicket(ticketId: string, reply: { senderId: string; senderName: string; senderRole: string; content: string }, schoolId?: string, allowedCreatorUserId?: string): Promise<SupportTicket | null> {
    await this.queryRows<SupportTicket>('support_tickets', { id: ticketId, school_id: schoolId });
    const ticket = this.data.tickets.find(t => t.id === ticketId && (!schoolId || t.schoolId === schoolId) && (!allowedCreatorUserId || t.createdByUserId === allowedCreatorUserId));
    if (!ticket) return null;
    const now = new Date().toISOString();
    ticket.messages.push({
      id: `msg-${Date.now()}`,
      ...reply,
      timestamp: now
    });
    ticket.updatedAt = now;
    if (reply.senderRole === 'super_admin') {
      ticket.status = 'in_progress';
    }
    this.save();
    return ticket;
  }

  // -------------------------------------------------------------
  // SUBSCRIPTION INVOICES (PLATFORM OWNER REVENUE)
  // -------------------------------------------------------------
  public getSubscriptionInvoices(schoolId?: string): SubscriptionInvoice[] {
    if (schoolId) {
      return this.data.invoices.filter(i => i.schoolId === schoolId);
    }
    return this.data.invoices;
  }

  public createSubscriptionInvoice(invData: Omit<SubscriptionInvoice, 'id'>): SubscriptionInvoice {
    const invoice: SubscriptionInvoice = {
      ...invData,
      id: `inv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
    };
    this.data.invoices.push(invoice);
    this.save();
    return invoice;
  }

  public async markInvoicePaid(id: string): Promise<SubscriptionInvoice | null> {
    const inv = this.data.invoices.find(i => i.id === id);
    if (!inv) return null;
    inv.status = 'paid';
    inv.paidDate = new Date().toISOString().split('T')[0];
    inv.receiptNumber = `SUB-REC-${Date.now().toString().slice(-6)}`;
    
    // Also extend or activate the school's subscription
    const school = await this.getSchoolById(inv.schoolId);
    if (school) {
      school.subscription.status = 'active';
      const now = new Date();
      const validUntil = new Date(now);
      if (inv.cadence === 'yearly') validUntil.setFullYear(validUntil.getFullYear() + 1);
      else if (inv.cadence === 'monthly') validUntil.setMonth(validUntil.getMonth() + 1);
      school.subscription.validUntil = validUntil.toISOString();
      this.updateSchool(school.id, { subscription: school.subscription });
    }

    this.save();
    await this.flush();
    return inv;
  }

  // -------------------------------------------------------------
  // AUDIT LOGS & CSV EXPORT
  // -------------------------------------------------------------
  public logAudit(logData: Omit<AuditLog, 'id' | 'timestamp'>): AuditLog {
    const log: AuditLog = {
      ...logData,
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString()
    };
    this.data.auditLogs.unshift(log);
    // Keep max 10,000 logs in memory
    if (this.data.auditLogs.length > 10000) {
      this.data.auditLogs.pop();
    }
    this.save();
    return log;
  }

  public async getAuditLogs(schoolId?: string): Promise<AuditLog[]> {
    return this.queryRows<AuditLog>('audit_logs', { school_id: schoolId });
  }

  public async exportAuditLogsCSV(schoolId?: string): Promise<string> {
    const logs = await this.getAuditLogs(schoolId);
    const headers = ['Timestamp', 'Action', 'Category', 'Severity', 'User Name', 'Role', 'School Name', 'Details'];
    const rows = logs.map(l => [
      `"${l.timestamp}"`,
      `"${l.action}"`,
      `"${l.category}"`,
      `"${l.severity}"`,
      `"${(l.userName || '').replace(/"/g, '""')}"`,
      `"${l.userRole}"`,
      `"${(l.schoolName || '').replace(/"/g, '""')}"`,
      `"${(l.details || '').replace(/"/g, '""')}"`
    ]);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  // -------------------------------------------------------------
  // BACKUP & RESTORE TEST
  // -------------------------------------------------------------
  public async generateSchoolBackup(schoolId: string) {
    const school = await this.getSchoolById(schoolId);
    if (!school) return null;
    return {
      backupDate: new Date().toISOString(),
      school,
      branches: await this.getBranches(schoolId),
      classes: await this.getClasses(schoolId),
      subjects: await this.getSubjects(schoolId),
      teachers: await this.getTeachers(schoolId),
      students: await this.getStudents(schoolId),
      attendance: await this.getSchoolAttendance(schoolId),
      marks: await this.getSchoolMarks(schoolId),
      feeStructures: await this.getFeeStructures(schoolId),
      feePayments: await this.getFeePayments(schoolId),
      reportCardDesign: await this.getReportCardDesign(schoolId)
    };
  }

  public async generatePlatformBackup() {
    const data = this.createEmptySchema();
    for (const [table, key] of Object.entries(TABLE_DATA_KEYS)) {
      if (table === 'lockout_counters') continue;
      (data as any)[key] = await this.queryRows(table, {});
    }
    data.timetableSettings = await this.queryRows('timetable_settings', {});
    data.teacherUnavailability = await this.queryRows('teacher_unavailability', {});
    data.lockoutCounterRows = await this.queryRows('lockout_counters', {});
    data.lockoutCounters = Object.fromEntries(data.lockoutCounterRows.map((row: any) => [row.id, {
      count: Number(row.count),
      firstFailedAt: new Date(row.firstFailedAt),
      lockedUntil: row.lockedUntil ? new Date(row.lockedUntil) : null
    }]));
    data.schools = await this.getSchools();
    await this.queryRows('super_admin_settings', {});
    data.settings = { ...this.data.settings };
    return {
      backupDate: new Date().toISOString(),
      version: '1.0.0',
      data
    };
  }

  public getLibraryBooks(schoolId: string): any[] {
    this.data.libraryBooks = this.data.libraryBooks || [];
    return this.data.libraryBooks.filter(b => b.schoolId === schoolId);
  }

  public addLibraryBook(book: any): any {
    this.data.libraryBooks = this.data.libraryBooks || [];
    const newBook = { id: `bk-${Date.now()}`, ...book, createdAt: new Date().toISOString() };
    this.data.libraryBooks.push(newBook);
    this.save();
    return newBook;
  }

  public async getTransportRoutes(schoolId: string): Promise<any[]> {
    return this.queryRows<any>('transport_routes', { school_id: schoolId });
  }

  public addTransportRoute(route: any): any {
    this.data.transportRoutes = this.data.transportRoutes || [];
    const { routeName, monthlyFee, ...fields } = route;
    const newRoute = {
      id: `tr-${Date.now()}`, ...fields,
      name: route.name || routeName,
      routeNumber: route.routeNumber || route.vehicleNumber,
      feeAmount: Number(route.feeAmount ?? monthlyFee ?? 0),
      active: route.active !== false,
      createdAt: new Date().toISOString()
    };
    this.data.transportRoutes.push(newRoute);
    this.save();
    return newRoute;
  }

  public async getBusAssignments(schoolId: string): Promise<any[]> {
    return this.queryRows<any>('bus_assignments', { school_id: schoolId });
  }

  public async setBusAssignment(schoolId: string, studentId: string, routeId: string): Promise<any> {
    const student = await this.getStudentById(studentId, schoolId);
    const route = (await this.getTransportRoutes(schoolId)).find(item => item.id === routeId && item.active !== false);
    await this.getBusAssignments(schoolId);
    if (!student || student.schoolId !== schoolId || !route) throw new Error('Choose a student and active route from this school.');
    const existing = this.data.busAssignments.find(item => item.schoolId === schoolId && item.studentId === studentId);
    const assignment = {
      ...(existing || {}), id: existing?.id || `bus-${studentId}`, schoolId, studentId, routeId,
      feeAmount: Number(route.feeAmount || 0), active: true
    };
    if (existing) Object.assign(existing, assignment); else this.data.busAssignments.push(assignment);
    this.save();
    return assignment;
  }

  public async removeBusAssignment(schoolId: string, studentId: string): Promise<boolean> {
    await this.getBusAssignments(schoolId);
    const previous = this.data.busAssignments.length;
    this.data.busAssignments = this.data.busAssignments.filter(item => !(item.schoolId === schoolId && item.studentId === studentId));
    if (previous !== this.data.busAssignments.length) this.save();
    return previous !== this.data.busAssignments.length;
  }
}

export let db = new StorageEngine();

export function installTestStorageAdapter(adapter: StorageEngine): void {
  if (process.env.NODE_ENV !== 'test') throw new Error('Test storage adapters can only be installed when NODE_ENV=test.');
  db = adapter;
}

export function installTestSupabaseClient(client: any): void {
  if (process.env.NODE_ENV !== 'test') throw new Error('Test Supabase clients can only be installed when NODE_ENV=test.');
  db.setTestClient(client);
}

export async function initializeStorage(): Promise<void> {
  if (process.env.NODE_ENV === 'test' && !(db instanceof StorageEngine)) return;
  await db.initialize();
}
