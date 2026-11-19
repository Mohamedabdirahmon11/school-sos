/**
 * Client-Side API Service with Multi-Tenant Scoping, Cash-Only Fees,
 * Small/Big Exam Grading, and Supabase Integration
 */

import {
  UserRole,
  School,
  SchoolBranch,
  User,
  PlanConfig,
  SubscriptionInvoice,
  Student,
  Teacher,
  SchoolClass,
  Subject,
  TimetableSlot,
  AttendanceRecord,
  ExamConfig,
  StudentMark,
  Assignment,
  AssignmentSubmission,
  PromotionRecord,
  FeePayment,
  FeeStructureItem,
  ReportCardDesign,
  SchoolNotice,
  PlatformBroadcast,
  SupportTicket,
  AuditLog,
  SuperAdminSettings,
  StaffPayrollRecord,
  SchoolExpense,
  SchoolSetupState,
  SchoolSetupProgressUpdate,
  SchoolSetupData
} from '../types/index.ts';

const LANG_KEY = 'schoolos_lang';

export class ApiClient {
  private static listResponseCache = new Map<string, { data: unknown; etag: string }>();

  private static async downloadPdf(endpoint: string, filename: string): Promise<void> {
    const response = await fetch(`/api${endpoint}`, { credentials: 'include' });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || 'PDF download failed.');
    }
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  public static downloadReportCardPdf(studentId: string) {
    return this.downloadPdf(`/report-cards/${encodeURIComponent(studentId)}/pdf`, `report-card-${studentId}.pdf`);
  }

  public static downloadClassReportCardsPdf(classId: string) {
    return this.downloadPdf(`/report-cards/classes/${encodeURIComponent(classId)}/pdf`, `class-report-cards-${classId}.pdf`);
  }

  public static downloadTermReportCardPdf(studentId: string) {
    return this.downloadPdf(`/term-marks/report-cards/${encodeURIComponent(studentId)}/pdf`, `term-report-card-${studentId}.pdf`);
  }

  public static downloadTermReportCardsPdf(classId: string, academicYearId: string) {
    return this.downloadPdf(`/term-marks/report-cards/classes/${encodeURIComponent(classId)}/pdf?academicYearId=${encodeURIComponent(academicYearId)}`, `term-report-cards-${classId}.pdf`);
  }

  public static downloadReceiptPdf(paymentId: string) {
    return this.downloadPdf(`/fees/payments/${encodeURIComponent(paymentId)}/receipt.pdf`, `receipt-${paymentId}.pdf`);
  }

  public static getStudentInvoices() {
    return this.request<any[]>('/student-invoices');
  }

  public static generateStudentInvoices(data: { classId?: string; studentId?: string; billingPeriod: string; dueDate: string; includeAnnualRegistration?: boolean; includeOneTimeFees?: boolean }) {
    return this.request<{ generatedCount: number; skippedExisting: number; skippedNoFees: number; busFeesAdded: number; invoices: any[] }>('/student-invoices/generate', {
      method: 'POST', body: JSON.stringify(data)
    });
  }

  public static getStudentInvoiceItems(invoiceId: string) {
    return this.request<any[]>(`/student-invoices/${encodeURIComponent(invoiceId)}/items`);
  }

  public static payStudentInvoice(invoiceId: string, data: { amount: number; paymentMethod: 'Cash' | 'Bank Transfer' | 'Mobile Money'; notes?: string; confirmedReceived: true; idempotencyKey: string }) {
    return this.request<{ invoice: any; payment: FeePayment; replayed: boolean }>(`/student-invoices/${encodeURIComponent(invoiceId)}/pay`, {
      method: 'POST', body: JSON.stringify(data)
    });
  }

  public static downloadStudentInvoicePdf(invoiceId: string) {
    return this.downloadPdf(`/student-invoices/${encodeURIComponent(invoiceId)}/pdf`, `student-invoice-${invoiceId}.pdf`);
  }

  public static async voidFeePayment(paymentId: string, reason: string) {
    return this.request<FeePayment>(`/fees/payments/${encodeURIComponent(paymentId)}/void`, { method: 'POST', body: JSON.stringify({ reason }) });
  }

  private static pageQuery(params?: { page?: number; pageSize?: number; search?: string; status?: string }) {
    if (!params?.page && !params?.pageSize && !params?.search?.trim() && !params?.status) return '';
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.pageSize) query.set('pageSize', String(params.pageSize));
    if (params.search?.trim()) query.set('search', params.search.trim());
    if (params.status) query.set('status', params.status);
    return `?${query.toString()}`;
  }
  private static getHeaders(): HeadersInit {
    return {
      'Content-Type': 'application/json'
    };
  }

  public static setAuth(_token?: string, _user?: any) {
    // All session tokens are now strictly stored in HttpOnly, SameSite=Lax signed cookies.
    // Zero sensitive token or user data is persisted in browser storage!
  }

  public static getStoredUser(): any | null {
    // Session state is authoritative from the server via httpOnly cookies.
    return null;
  }

  public static clearAuth() {
    // Cookie cleared on server side via logout endpoint
  }

  public static getLanguage(): 'en' | 'so' | 'am' | 'ar' {
    return (localStorage.getItem(LANG_KEY) as any) || 'en';
  }

  public static hasLanguagePreference(): boolean {
    return Boolean(localStorage.getItem(LANG_KEY));
  }

  public static setLanguage(lang: 'en' | 'so' | 'am' | 'ar') {
    localStorage.setItem(LANG_KEY, lang);
  }

  public static async request<T>(endpoint: string, options: RequestInit & { suppressGlobalApiError?: boolean } = {}): Promise<T> {
    const { suppressGlobalApiError = false, ...requestOptions } = options;
    const method = (requestOptions.method || 'GET').toUpperCase();
    const listEndpoint = /^\/(branches|classes|subjects|teachers)$/.test(endpoint.split('?')[0]);
    const cachedList = method === 'GET' && listEndpoint ? this.listResponseCache.get(endpoint) : undefined;
    let response: Response;
    try {
      response = await fetch(`/api${endpoint}`, {
        ...requestOptions,
        ...(listEndpoint ? { cache: 'no-cache' as RequestCache } : {}),
        credentials: 'include', // Enforce httpOnly signed cookie inclusion on every request
        headers: {
          ...this.getHeaders(),
          ...(requestOptions.headers || {}),
          ...(cachedList ? { 'If-None-Match': cachedList.etag } : {})
        }
      });
    } catch (error) {
      if (typeof window !== 'undefined' && endpoint !== '/auth/login') {
        window.dispatchEvent(new CustomEvent('schoolos:api-error', { detail: { status: 500, message: 'The server could not be reached.' } }));
      }
      throw error;
    }

    if (response.status === 304) {
      if (!cachedList) throw new Error('The server returned a cached response without a matching client copy.');
      return cachedList.data as T;
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMsg = data.error || `HTTP ${response.status}: ${response.statusText}`;
      const err = new Error(errorMsg);
      (err as any).status = response.status;
      (err as any).code = data.code;
      (err as any).data = data;
      if (typeof window !== 'undefined' && ['MUST_CHANGE_PASSWORD', 'MUST_CHANGE_PIN'].includes(data.code)) {
        window.dispatchEvent(new CustomEvent('schoolos:must-change-password'));
      } else if (typeof window !== 'undefined' && !suppressGlobalApiError && endpoint !== '/auth/login' && endpoint !== '/auth/change-password' && endpoint !== '/auth/change-pin' && [401, 403, 500].includes(response.status)) {
        window.dispatchEvent(new CustomEvent('schoolos:api-error', { detail: { status: response.status, message: errorMsg, code: data.code } }));
      }
      throw err;
    }

    if (Array.isArray(data)) {
      Object.defineProperty(data, 'pagination', { configurable: true, value: {
        page: Number(response.headers.get('X-Page') || 1),
        pageSize: Number(response.headers.get('X-Page-Size') || 20),
        total: Number(response.headers.get('X-Total-Count') || data.length),
        totalPages: Number(response.headers.get('X-Total-Pages') || (data.length ? 1 : 0))
      } });
    }
    const etag = response.headers.get('ETag');
    if (method === 'GET' && listEndpoint && etag) this.listResponseCache.set(endpoint, { data, etag });
    return data as T;
  }

  // Auth
  public static async login(credentials: {
    role: UserRole;
    email?: string;
    phone?: string;
    schoolCode?: string;
    pin?: string;
    password?: string;
  }) {
    return this.request<any>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials)
    });
  }

  public static async logout() {
    return this.request<{ success: boolean; message: string }>('/auth/logout', {
      method: 'POST'
    });
  }

  public static async setup2FA(challengeToken?: string) {
    return this.request<{ secret: string; qrCodeUrl: string; recoveryCodes: string[] }>('/auth/2fa/setup', {
      method: 'POST',
      headers: challengeToken ? { Authorization: `Bearer ${challengeToken}` } : undefined
    });
  }

  public static async enable2FA(code: string, challengeToken?: string) {
    return this.request<{ success: boolean; message: string }>('/auth/2fa/verify-and-enable', {
      method: 'POST',
      headers: challengeToken ? { Authorization: `Bearer ${challengeToken}` } : undefined,
      body: JSON.stringify({ code })
    });
  }

  public static async disable2FA(currentPassword: string, code: string) {
    return this.request<{ success: boolean }>('/auth/2fa/disable', {
      method: 'POST', body: JSON.stringify({ currentPassword, code })
    });
  }

  public static async resetStudentPin(id: string, customPin?: string) {
    return this.request<{ success: boolean; newPin: string; student: Student }>(`/students/${id}/reset-pin`, {
      method: 'POST',
      body: JSON.stringify({ customPin })
    });
  }

  public static async bulkResetStudentPins(rows: Array<{ studentId: string; pin?: string }>) {
    return this.request<{ success: boolean; updatedCount: number; pinSlips: Array<{ studentId: string; studentName: string; newPin: string }> }>('/students/bulk-reset-pin', {
      method: 'POST',
      body: JSON.stringify({ rows })
    });
  }

  public static async changePassword(newPassword: string, challengeToken?: string) {
    return this.request<{ success: boolean; message: string }>('/auth/change-password', {
      method: 'POST',
      headers: challengeToken ? { Authorization: `Bearer ${challengeToken}` } : undefined,
      body: JSON.stringify({ newPassword })
    });
  }
  
  public static async changePin(newPin: string, challengeToken?: string) {
    return this.request<{ success: boolean; message: string }>('/auth/change-pin', {
      method: 'POST',
      headers: challengeToken ? { Authorization: `Bearer ${challengeToken}` } : undefined,
      body: JSON.stringify({ newPin })
    });
  }

  public static async getMe() {
    return this.request<{ user: User; school: School | null; sessionTimeoutMinutes: number }>('/auth/me');
  }

  public static async uploadSchoolLogo(file: File): Promise<{ logoUrl: string }> {
    const response = await fetch('/api/school/logo', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': file.type },
      body: file
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || typeof body.logoUrl !== 'string' || !body.logoUrl) {
      throw new Error(body.error || 'School logo upload failed.');
    }
    return { logoUrl: body.logoUrl };
  }

  public static async getSchoolSetupData() {
    return this.request<{ data: SchoolSetupData; school: { name: string; address: string; phone: string; email: string; schoolType: 'primary' | 'secondary' | 'combined'; logoUrl: string }; progress: { currentStep: number; completedSteps: number[]; completedAt: string | null } }>('/school/setup-data');
  }

  public static async saveSchoolSetupStep(step: number, data: Partial<SchoolSetupData>) {
    return this.request<{ data: SchoolSetupData; progress: { currentStep: number; completedSteps: number[]; completedAt: string | null }; completed: boolean }>('/school/setup-data', {
      method: 'PUT',
      body: JSON.stringify({ step, data })
    });
  }

  public static async getSchoolSetupProgress() {
    return this.request<SchoolSetupState>('/school/setup-progress');
  }

  public static async updateSchoolSetupProgress(update: SchoolSetupProgressUpdate) {
    return this.request<SchoolSetupState>('/school/setup-progress', {
      method: 'PUT',
      body: JSON.stringify(update)
    });
  }

  public static async updateSchoolSettings(settings: Partial<School>) {
    return this.request<School>('/school/settings', {
      method: 'PUT',
      body: JSON.stringify(settings)
    });
  }

  // Super Admin
  public static async getSettings() {
    return this.request<SuperAdminSettings>('/superadmin/settings');
  }

  public static async updateSettings(settings: Partial<SuperAdminSettings>) {
    return this.request<SuperAdminSettings>('/superadmin/settings', {
      method: 'PUT',
      body: JSON.stringify(settings)
    });
  }

  public static async previewBulkAcademicYear(academicYear: string) {
    return this.request<{ academicYear: string; schools: Array<{
      id: string; name: string; code: string; currentAcademicYear: string | null;
      status: 'change' | 'unchanged' | 'warning'; warning: string;
    }> }>('/superadmin/academic-year/preview', {
      method: 'POST',
      body: JSON.stringify({ academicYear })
    });
  }

  public static async applyBulkAcademicYear(academicYear: string, confirm: string, includeWarned: boolean) {
    return this.request<{ academicYear: string; applied: number; skipped: Array<{ id: string; name: string; reason: string }> }>('/superadmin/academic-year/apply', {
      method: 'POST',
      body: JSON.stringify({ academicYear, confirm, includeWarned })
    });
  }

  public static async getPlans() {
    return this.request<PlanConfig[]>('/superadmin/plans');
  }

  public static async updatePlan(id: string, updates: Partial<PlanConfig>) {
    return this.request<PlanConfig>(`/superadmin/plans/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
  }

  public static async getSchools(params?: { search?: string; status?: string }) {
    const schools = await this.request<School[]>('/superadmin/schools');
    const search = params?.search?.trim().toLowerCase() || '';
    const status = params?.status || 'all';
    return schools.filter(school => {
      const matchesSearch = !search || [school.name, school.code, school.city, school.email]
        .some(value => String(value || '').toLowerCase().includes(search));
      const matchesStatus = status === 'all' || school.subscription?.status === status;
      return matchesSearch && matchesStatus;
    });
  }

  public static async createSchool(schoolData: any) {
    return this.request<{ school: School; admin: User; adminUsername: string; temporaryPin: string; mustChangePassword: boolean }>('/superadmin/schools', {
      method: 'POST',
      body: JSON.stringify(schoolData)
    });
  }

  public static async addSchool(schoolData: any) {
    return this.createSchool(schoolData);
  }

  public static async previewSchoolDeletion(id: string) {
    return this.request<{
      school_id: string; school_name: string; counts: Record<string, number>; total_rows: number;
    }>(`/superadmin/schools/${encodeURIComponent(id)}/deletion-preview`, { method: 'POST' });
  }

  public static async deleteSchoolPermanently(id: string, confirmName: string) {
    return this.request<{
      success: boolean; schoolName: string; databaseDeleted: boolean;
      authAccountsFound: number; cleanupWarnings: string[];
    }>(`/superadmin/schools/${encodeURIComponent(id)}/permanent`, {
      method: 'DELETE', body: JSON.stringify({ confirmName })
    });
  }

  public static async getSchoolDetails(id: string) {
    return this.request<{
      school: School;
      admins: User[];
      studentCount: number;
      teacherCount: number;
    }>(`/superadmin/schools/${encodeURIComponent(id)}`);
  }

  public static async updateSchoolDetails(id: string, details: {
    name: string; email: string; address: string; city: string; country: string; region: string;
    schoolType: 'primary' | 'secondary' | 'combined'; phone: string;
    whatsappPhone: string; brandColor: string; currency: 'ETB' | 'USD' | 'SOS'; language: 'en' | 'so' | 'am' | 'ar';
  }) {
    return this.request<School>(`/superadmin/schools/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(details)
    });
  }

  public static async updateSubscription(schoolId: string, updates: any) {
    return this.updateSchoolSubscription(schoolId, updates);
  }

  public static async setSchoolSuspension(schoolId: string, suspend: boolean) {
    return this.updateSchoolSubscription(schoolId, { status: suspend ? 'suspended' : 'active' });
  }

  public static async setStudentAccess(schoolId: string, enabled: boolean) {
    return this.updateSchoolSubscription(schoolId, { studentAccessEnabled: enabled });
  }

  public static async resetUserPassword(userId: string, temporaryPin?: string): Promise<{ success: boolean; temporaryPassword: string; temporaryPin?: string; mustChangePassword: boolean }> {
    return this.request(`/users/${encodeURIComponent(userId)}/reset-password`, {
      method: 'POST',
      body: temporaryPin ? JSON.stringify({ temporaryPin }) : undefined
    });
  }

  public static async runBackup() {
    return this.getPlatformBackup();
  }

  public static async updateSchoolSubscription(schoolId: string, updates: any) {
    return this.request<School>(`/superadmin/schools/${schoolId}/subscription`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  }

  public static async getPlatformAnalytics() {
    return this.request<any>('/superadmin/analytics');
  }

  public static async getSuperAdminDashboard() {
    const response = await this.request<any>('/superadmin/dashboard');
    const revenueTrend = Array.isArray(response?.revenueTrend) ? response.revenueTrend : [];
    return { ...response, revenueTrend: revenueTrend.map((item: any) => ({ ...item, month: /^\d{4}-\d{2}$/.test(String(item?.month || '')) ? new Date(`${item.month}-01T00:00:00Z`).toLocaleDateString('en', { month: 'short', year: 'numeric' }) : item?.month })) };
  }

  public static async getGlobalUsers(params?: { page?: number; pageSize?: number; search?: string; role?: string }) {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    if (params?.search?.trim()) query.set('search', params.search.trim());
    if (params?.role) query.set('role', params.role);
    return this.request<any[]>(`/users?${query.toString()}`);
  }

  public static async createSuperAdmin(fullName: string, email: string) {
    return this.request<{ user: User; temporaryPassword: string; mustChangePassword: boolean }>('/superadmin/admins', {
      method: 'POST',
      body: JSON.stringify({ fullName, email })
    });
  }

  public static async toggleUserBlock(userId: string, blockedOrSchoolId?: boolean | string) {
    return this.request<{ success: boolean; isBlocked: boolean }>(`/users/${encodeURIComponent(userId)}/toggle-block`, {
      method: 'POST',
      body: typeof blockedOrSchoolId === 'boolean' ? JSON.stringify({ isBlocked: blockedOrSchoolId }) : undefined
    });
  }

  public static async generateBatchInvoices() {
    return this.request<{ success: boolean; generatedCount: number; skippedOpenInvoiceCount: number; skippedLifetimeCount: number; skippedInvalidPricingCount: number }>('/superadmin/invoices/generate', { method: 'POST' });
  }

  public static async getBroadcasts() {
    return this.request<PlatformBroadcast[]>('/superadmin/broadcasts');
  }

  public static async createBroadcast(data: any) {
    return this.request<PlatformBroadcast>('/superadmin/broadcasts', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  public static async sendBroadcast(data: any) {
    return this.createBroadcast(data);
  }

  public static async getInvoices() {
    return this.request<SubscriptionInvoice[]>('/superadmin/invoices');
  }

  public static async markInvoicePaid(id: string) {
    return this.request<SubscriptionInvoice>(`/superadmin/invoices/${id}/pay`, {
      method: 'POST'
    });
  }

  public static async payInvoice(id: string) {
    return this.markInvoicePaid(id);
  }

  public static async getAuditLogs(params?: any) {
    return this.request<AuditLog[]>(`/superadmin/audit-logs${this.pageQuery(params)}`);
  }

  public static async getPlatformBackup() {
    return this.request<any>('/superadmin/backup');
  }

  // Branches
  public static async getBranches() {
    return this.request<SchoolBranch[]>('/branches?pageSize=100');
  }

  public static async createBranch(branchData: Partial<SchoolBranch>) {
    return this.request<SchoolBranch>('/branches', {
      method: 'POST',
      body: JSON.stringify(branchData)
    });
  }

  public static async updateBranch(id: string, branchData: Partial<SchoolBranch>) {
    return this.request<SchoolBranch>(`/branches/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(branchData)
    });
  }

  public static async deleteBranch(id: string) {
    return this.request<{ success: boolean }>(`/branches/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
  }

  // Classes, Subjects, Timetable
  public static async getClasses(branchIdOrParams?: any) {
    let branchId = typeof branchIdOrParams === 'string' ? branchIdOrParams : branchIdOrParams?.branchId;
    const q = branchId ? `?branchId=${branchId}` : '';
    return this.request<SchoolClass[]>(`/classes${q}`);
  }

  public static async createClass(classData: Partial<SchoolClass>, schoolId?: string) {
    return this.request<SchoolClass>('/classes', {
      method: 'POST',
      body: JSON.stringify(schoolId ? { ...classData, schoolId } : classData)
    });
  }

  public static async addClass(classData: Partial<SchoolClass>, schoolId?: string) {
    return this.createClass(classData, schoolId);
  }

  public static async updateClass(id: string, updates: Partial<SchoolClass>) {
    return this.request<SchoolClass>(`/classes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
  }

  public static async deleteClass(id: string) {
    return this.request<{ success: boolean }>(`/classes/${id}`, {
      method: 'DELETE'
    });
  }

  public static async getClassDetails(id: string, options: { page?: number; pageSize?: number; search?: string } = {}) {
    const query = new URLSearchParams({ page: String(options.page || 1), pageSize: String(options.pageSize || 20) });
    if (options.search) query.set('search', options.search);
    return this.request<{ class: SchoolClass; students: { items: Student[]; page: number; pageSize: number; total: number }; subjects: Array<{ id: string; periodsPerWeek: number; smallExamEnabled: boolean; bigExamEnabled: boolean; subject: Subject | null; teacher: { id: string; fullName: string } | null }>; timetable: TimetableSlot[]; attendance: { date: string; recordedStudents: number } }>(`/classes/${encodeURIComponent(id)}/details?${query}`);
  }

  public static async getClassCurriculum(classId: string) {
    return this.request<{
      class: SchoolClass;
      capacity: { workingDays: number; lessonPeriodsPerDay: number; weeklyCapacity: number };
      curriculum: Array<{ id: string; subjectId: string; periodsPerWeek: number; teacherId?: string | null; smallExamEnabled: boolean; bigExamEnabled: boolean; isActive: boolean }>;
    }>(`/curriculum/classes/${encodeURIComponent(classId)}`);
  }

  public static async saveClassCurriculum(classId: string, subjects: Array<{ subjectId: string; periodsPerWeek: number }>) {
    return this.request<{ success: boolean; count: number; totalPeriods: number; capacity: number }>(
      `/curriculum/classes/${encodeURIComponent(classId)}`,
      { method: 'PUT', body: JSON.stringify({ subjects }) }
    );
  }

  public static async copyClassCurriculum(classId: string, targetClassIds: string[]) {
    return this.request<{ success: boolean; copiedClasses: number; subjectsPerClass: number }>(
      `/curriculum/classes/${encodeURIComponent(classId)}/copy`,
      { method: 'POST', body: JSON.stringify({ targetClassIds }) }
    );
  }

  public static async getClassGroups() {
    return this.request<Array<{id:string;name:string;sort_order:number;class_sections:Array<{id:string;name:string;legacy_class_id:string|null}>}>>('/class-groups');
  }
  public static async createClassGroup(name:string, sections:string[] = []) {
    return this.request('/class-groups',{method:'POST',body:JSON.stringify({name,sections})});
  }
  public static async renameClassGroup(id:string,name:string) {
    return this.request(`/class-groups/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify({name})});
  }
  public static async deleteClassGroup(id:string) {
    return this.request(`/class-groups/${encodeURIComponent(id)}`,{method:'DELETE'});
  }
  public static async addClassSection(id:string,name:string) {
    return this.request('/class-groups/'+encodeURIComponent(id)+'/sections',{method:'POST',body:JSON.stringify({name})});
  }
  public static async deleteClassSection(id:string) {
    return this.request(`/class-sections/${encodeURIComponent(id)}`,{method:'DELETE'});
  }
  public static async createDefaultClassGroups() {
    return this.request<{created:number;skipped:number}>('/class-groups/defaults',{method:'POST'});
  }

  public static async getSubjects(params?: any) {
    return this.request<Subject[]>('/subjects');
  }

  public static async addDefaultSubjects() {
    return this.request<{ success: boolean; createdCount: number; skippedCount: number; subjects: Subject[] }>('/subjects/defaults', {
      method: 'POST',
      body: JSON.stringify({})
    });
  }

  public static async getMyFormTeacherClasses() {
    return this.request<SchoolClass[]>('/teacher/form-teacher-classes');
  }

  public static async getTeacherSubjectAssignments() {
    return this.request<Array<{ classId: string; subjectId: string; subject: Subject; class: SchoolClass; periodsPerWeek: number; smallExamEnabled: boolean; bigExamEnabled: boolean; isFormTeacher?: boolean; isFormTeacherClass?: boolean; canEditMarks?: boolean }>>('/teacher/subject-assignments');
  }

  public static async createSubject(subData: Partial<Subject>, schoolId?: string) {
    return this.request<Subject>('/subjects', {
      method: 'POST',
      body: JSON.stringify(schoolId ? { ...subData, schoolId } : subData)
    });
  }

  public static async updateSubject(id: string, updates: Partial<Subject>) {
    return this.request<Subject>(`/subjects/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(updates) });
  }

  public static async deleteSubject(id: string) {
    return this.request<{ success: boolean }>(`/subjects/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  public static async getSubjectAssignments(id: string) {
    return this.request<Array<{ classId: string; teacherId?: string; periodsPerWeek: number; smallExamEnabled: boolean; bigExamEnabled: boolean }>>(`/subjects/${encodeURIComponent(id)}/assignments`);
  }

  public static async saveSubjectAssignments(id: string, assignments: Array<{ classId: string; teacherId?: string; periodsPerWeek: number; smallExamEnabled: boolean; bigExamEnabled: boolean }>) {
    return this.request<{ success: boolean; count: number }>(`/subjects/${encodeURIComponent(id)}/assignments`, { method: 'PUT', body: JSON.stringify({ assignments }) });
  }

  public static async addSubject(subData: Partial<Subject>, schoolId?: string) {
    return this.createSubject(subData, schoolId);
  }

  public static async getTimetableSections(classId: string) {
    return this.request<Array<{ id: string; name: string; sortOrder: number }>>(`/timetable/sections?classId=${encodeURIComponent(classId)}`);
  }

  public static async getTimetableTerms() {
    return this.request<Array<{ id: string; name: string; startDate: string; endDate: string; isCurrent: boolean }>>('/timetable/terms');
  }

  public static async getTimetable(classOrParams?: any, teacherId?: string, dayOfWeek?: string) {
    const params = new URLSearchParams();
    if (typeof classOrParams === 'string') {
      params.append('classId', classOrParams);
    } else if (classOrParams?.classId) {
      params.append('classId', classOrParams.classId);
    }
    const tId = teacherId || classOrParams?.teacherId;
    if (tId) params.append('teacherId', tId);
    if (classOrParams?.dayOfWeek || dayOfWeek) params.append('dayOfWeek', classOrParams?.dayOfWeek || dayOfWeek!);
    if (classOrParams?.scope === 'school') params.append('scope', 'school');
    if (classOrParams?.termId) params.append('termId', classOrParams.termId);
    if (classOrParams?.sectionId) params.append('sectionId', classOrParams.sectionId);
    return this.request<TimetableSlot[]>(`/timetable?${params.toString()}`);
  }

  public static async setTimetableSlot(slot: Partial<TimetableSlot>) {
    return this.request<TimetableSlot>('/timetable', {
      method: 'POST',
      body: JSON.stringify(slot)
    });
  }

  public static async generateTimetable(classId: string, termId?: string) {
    return this.request<{ slots: TimetableSlot[]; unfilled: Array<{ subjectId: string; teacherId: string; occurrence: number }>; withoutTeacher?: number; warnings?: string[] }>('/timetable/generate', { method: 'POST', body: JSON.stringify({ classId, termId }) });
  }

  public static async generateAllTimetables(previewOnly = false, termId?: string) {
    return this.request<{ preview?: boolean; slots: TimetableSlot[]; generatedClassIds: string[]; unfilled: Array<{ classId: string; className: string; subjectId: string; teacherId: string; occurrence: number }>; skipped: Array<{ classId: string; className: string; reason: string }>; withoutTeacher?: number; warnings?: string[] }>('/timetable/generate-all', { method: 'POST', body: JSON.stringify({ allClasses: true, previewOnly, termId }) });
  }

  public static async clearTimetableClass(classId: string, termId: string) {
    return this.request<{ success: boolean; removed: number; lockedKept: number }>(`/timetable/classes/${encodeURIComponent(classId)}?termId=${encodeURIComponent(termId)}`, { method: 'DELETE' });
  }

  public static async copyTimetableTerm(sourceTermId: string, targetTermId: string) {
    return this.request<{ success: boolean; copiedClasses: string[]; skipped: Array<{ classId: string; reason: string }>; copiedSlots: number }>('/timetable/copy-term', { method: 'POST', body: JSON.stringify({ sourceTermId, targetTermId }) });
  }

  public static async getTimetableRooms() {
    return this.request<Array<{ id: string; name: string; type: 'class' | 'lab' | 'hall'; capacity?: number | null }>>('/timetable/rooms');
  }

  public static async saveTimetableRoom(room: { id?: string; name: string; type: 'class' | 'lab' | 'hall'; capacity?: number | null }) {
    return this.request<{ id: string; name: string; type: 'class' | 'lab' | 'hall'; capacity?: number | null }>('/timetable/rooms', { method: 'POST', body: JSON.stringify(room) });
  }

  public static async deleteTimetableRoom(roomId: string) {
    return this.request<{ success: boolean }>(`/timetable/rooms/${encodeURIComponent(roomId)}`, { method: 'DELETE' });
  }

  public static async getTimetableSubstitutions(date?: string) {
    const query = date ? `?date=${encodeURIComponent(date)}` : '';
    return this.request<Array<{ id: string; entryId: string; substituteTeacherId: string; substituteDate: string; reason?: string }>>(`/timetable/substitutions${query}`);
  }

  public static async saveTimetableSubstitution(input: { entryId: string; substituteTeacherId: string; date: string; reason?: string }) {
    return this.request('/timetable/substitutions', { method: 'POST', body: JSON.stringify(input) });
  }

  public static async deleteTimetableSubstitution(id: string) {
    return this.request<{ success: boolean }>(`/timetable/substitutions/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
  public static async setTimetableSlotLocked(slotId: string, isLocked: boolean) {
    return this.request<{ success: boolean; isLocked: boolean }>(`/timetable/${encodeURIComponent(slotId)}/lock`, { method: 'PATCH', body: JSON.stringify({ isLocked }) });
  }
  public static async removeTimetablePeriod(classId: string, dayOfWeek: string, periodNumber: number, termId?: string, sectionId?: string | null) {
    return this.request<{ success: boolean }>(`/timetable/${encodeURIComponent(classId)}/${encodeURIComponent(dayOfWeek)}/${periodNumber}`, { method: 'DELETE', body: JSON.stringify({ termId, sectionId }) });
  }

  public static async swapTimetableSlots(firstSlotId: string, secondSlotId: string) {
    return this.request<{ success: boolean }>('/timetable/swap', { method: 'POST', body: JSON.stringify({ firstSlotId, secondSlotId }) });
  }

  public static async getTimetableSettings() {
    return this.request<{ schoolId: string; shiftCount: 1 | 2; firstPeriodStart: string; periodMinutes: number; breakAfterPeriod: number; breakMinutes: number; shift2FirstPeriodStart: string; shift2PeriodMinutes: number; shift2BreakAfterPeriod: number; shift2BreakMinutes: number }>('/timetable/settings');
  }

  public static async saveTimetableSettings(settings: { shiftCount: 1 | 2; firstPeriodStart: string; periodMinutes: number; breakAfterPeriod: number; breakMinutes: number; shift2FirstPeriodStart?: string; shift2PeriodMinutes?: number; shift2BreakAfterPeriod?: number; shift2BreakMinutes?: number }) {
    return this.request('/timetable/settings', { method: 'PUT', body: JSON.stringify(settings) });
  }

  public static async getTeacherUnavailability(teacherId?: string) {
    const query = teacherId ? `?teacherId=${encodeURIComponent(teacherId)}` : '';
    return this.request<Array<{ id: string; teacherId: string; dayOfWeek: string; periodNumber: number | null; reason?: string }>>(`/timetable/unavailability${query}`);
  }

  public static async setTeacherUnavailability(input: { teacherId: string; dayOfWeek: string; periodNumber: number | null; unavailable: boolean; reason?: string }) {
    return this.request<{ success: boolean }>('/timetable/unavailability', { method: 'PUT', body: JSON.stringify(input) });
  }

  // Documents
  public static async getDocuments(params: { search?: string; type?: string; status?: string; includeDeleted?: boolean } = {}) {
    const query = new URLSearchParams();
    if (params.search?.trim()) query.set('search', params.search.trim());
    if (params.type && params.type !== 'all') query.set('type', params.type);
    if (params.status && params.status !== 'all') query.set('status', params.status);
    if (params.includeDeleted) query.set('includeDeleted', 'true');
    return this.request<any[]>('/documents' + (query.toString() ? '?' + query.toString() : ''));
  }

  public static async getDocument(id: string) {
    return this.request<any>(`/documents/${encodeURIComponent(id)}`);
  }

  public static async createDocument(input: Record<string, unknown>) {
    return this.request<any>('/documents', { method:'POST', body:JSON.stringify(input) });
  }

  public static async updateDocument(id: string, input: Record<string, unknown>) {
    return this.request<any>(`/documents/${encodeURIComponent(id)}`, { method:'PUT', body:JSON.stringify(input) });
  }

  public static async deleteDocument(id: string) {
    return this.request<{success:boolean}>(`/documents/${encodeURIComponent(id)}`, { method:'DELETE' });
  }

  public static async restoreDocument(id: string) {
    return this.request<any>(`/documents/${encodeURIComponent(id)}/restore`, { method:'POST' });
  }

  public static async duplicateDocument(id: string) {
    return this.request<any>(`/documents/${encodeURIComponent(id)}/duplicate`, { method:'POST' });
  }

  public static async getDocumentPermissions(id: string) {
    return this.request<any[]>(`/documents/${encodeURIComponent(id)}/permissions`);
  }

  public static async setDocumentPermission(id: string, input: {userId?:string;role?:string;canView?:boolean;canEdit?:boolean;canDownload?:boolean}) {
    return this.request<any>(`/documents/${encodeURIComponent(id)}/permissions`, {method:'POST',body:JSON.stringify(input)});
  }

  public static async deleteDocumentPermission(id: string, permissionId: string) {
    return this.request<{success:boolean}>(`/documents/${encodeURIComponent(id)}/permissions/${encodeURIComponent(permissionId)}`, {method:'DELETE'});
  }

  public static async getDocumentVersions(id: string) {
    return this.request<any[]>(`/documents/${encodeURIComponent(id)}/versions`);
  }

  public static async restoreDocumentVersion(id: string, versionId: string) {
    return this.request<any>(`/documents/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}/restore`, { method:'POST' });
  }

  public static async lockDocument(id: string, reason?: string) {
    return this.request<any>(`/documents/${encodeURIComponent(id)}/lock`, { method:'POST', body:JSON.stringify({reason}) });
  }

  public static async unlockDocument(id: string) {
    return this.request<any>(`/documents/${encodeURIComponent(id)}/unlock`, { method:'POST' });
  }

  public static async getDocumentAudit(id: string) {
    return this.request<any[]>(`/documents/${encodeURIComponent(id)}/audit`);
  }

  public static async getStudentDocumentAttachments(studentId: string) {
    return this.request<any[]>(`/students/${encodeURIComponent(studentId)}/document-attachments`);
  }

  public static async uploadStudentDocumentAttachment(studentId: string, file: File) {
    const response = await fetch(`/api/students/${encodeURIComponent(studentId)}/document-attachments`, {
      method:'POST', credentials:'include',
      headers:{'Content-Type':file.type,'X-File-Name':encodeURIComponent(file.name)},
      body:file
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Lifaaqa lama soo gelin karin.');
    return body;
  }

  public static async deleteStudentDocumentAttachment(studentId: string, attachmentId: string) {
    return this.request<{success:boolean}>(`/students/${encodeURIComponent(studentId)}/document-attachments/${encodeURIComponent(attachmentId)}`, {method:'DELETE'});
  }

  public static studentDocumentAttachmentDownloadUrl(studentId: string, attachmentId: string) {
    return `/api/students/${encodeURIComponent(studentId)}/document-attachments/${encodeURIComponent(attachmentId)}/download`;
  }

  public static async getDocumentTemplates(includeArchived = false) {
    return this.request<any[]>(`/document-templates${includeArchived ? '?includeArchived=true' : ''}`);
  }

  public static async createDocumentTemplate(input: Record<string, unknown>) {
    return this.request<any>('/document-templates', { method:'POST', body:JSON.stringify(input) });
  }

  public static async duplicateDocumentTemplate(id: string) {
    return this.request<any>(`/document-templates/${encodeURIComponent(id)}/duplicate`, { method:'POST' });
  }

  public static async updateDocumentTemplate(id: string, input: Record<string, unknown>) {
    return this.request<any>(`/document-templates/${encodeURIComponent(id)}`, { method:'PUT', body:JSON.stringify(input) });
  }

  public static async deleteDocumentTemplate(id: string) {
    return this.request<{success:boolean}>(`/document-templates/${encodeURIComponent(id)}`, { method:'DELETE' });
  }

  public static async restoreDocumentTemplate(id: string) {
    return this.request<{success:boolean}>(`/document-templates/${encodeURIComponent(id)}/restore`, { method:'POST' });
  }

  public static async getStructuredDocumentTemplates() {
    return this.request<any[]>('/structured-document-templates');
  }

  public static async createStructuredDocumentTemplate(input: { type: string; name: string; config: Record<string, unknown> }) {
    return this.request<any>('/structured-document-templates', { method:'POST', body:JSON.stringify(input) });
  }

  public static async updateStructuredDocumentTemplate(id: string, input: { type: string; name: string; config: Record<string, unknown> }) {
    return this.request<any>(`/structured-document-templates/${encodeURIComponent(id)}`, { method:'PUT', body:JSON.stringify(input) });
  }

  public static async deleteStructuredDocumentTemplate(id: string) {
    return this.request<{success:boolean}>(`/structured-document-templates/${encodeURIComponent(id)}`, { method:'DELETE' });
  }

  public static async previewDocumentGeneration(input: Record<string, unknown>) {
    return this.request<any>('/documents/preview', { method:'POST', body:JSON.stringify(input) });
  }

  public static async recordDocumentDownload(id:string) {
    return this.request<{success:boolean}>(`/documents/${encodeURIComponent(id)}/download-audit`,{method:'POST'});
  }

  public static async generateDocuments(input: Record<string, unknown>) {
    return this.request<any>('/documents/generate', { method:'POST', body:JSON.stringify(input) });
  }

  public static async uploadDocumentImage(file: File): Promise<{url:string}> {
    const response = await fetch('/api/documents/images', {
      method:'POST', credentials:'include', headers:{'Content-Type':file.type}, body:file
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Sawirka lama gelin karin.');
    return body;
  }

  // Students & Teachers
  public static async getStudents(classId?: string, branchId?: string, page?: number, pageSize?: number, search?: string, feeStatus?: string, allClass = false) {
    const params = new URLSearchParams();
    if (classId) params.append('classId', classId);
    if (branchId) params.append('branchId', branchId);
    if (page) params.append('page', String(page));
    if (pageSize) params.append('pageSize', String(pageSize));
    if (search?.trim()) params.append('search', search.trim());
    if (feeStatus && feeStatus !== 'all') params.append('feeStatus', feeStatus);
    if (allClass) params.append('allClass', 'true');
    return this.request<Student[]>(`/students?${params.toString()}`);
  }

  public static async getAllStudents(classId?: string, branchId?: string, pageSize = 100): Promise<Student[]> {
    const firstPage = await this.getStudents(classId, branchId, 1, pageSize);
    const pagination = (firstPage as any).pagination;
    const totalPages = Math.max(1, Number(pagination?.totalPages) || 1);
    const allStudents = [...firstPage];
    for (let page = 2; page <= totalPages; page += 1) {
      const nextPage = await this.getStudents(classId, branchId, page, pageSize);
      allStudents.push(...nextPage);
    }
    return allStudents;
  }

  public static async createStudent(studentData: Partial<Student> & { guardianName?: string; guardianPhone?: string; address?: string }, schoolId?: string) {
    return this.request<Student>('/students', {
      method: 'POST',
      body: JSON.stringify(schoolId ? { ...studentData, schoolId } : studentData)
    });
  }

  public static async addStudent(studentData: Partial<Student> & { guardianName?: string; guardianPhone?: string; address?: string }, schoolId?: string) {
    return this.createStudent(studentData, schoolId);
  }

  public static async updateStudent(id: string, updates: Partial<Student>, note?: string) {
    return this.request<Student>(`/students/${id}`, {
      method: 'PUT',
      body: JSON.stringify(note ? { ...updates, note } : updates)
    });
  }

  public static async getSchoolStudents(params?: any) {
    return this.getStudents(params?.classId, params?.branchId, params?.page, params?.pageSize, params?.search, params?.paymentStatus, Boolean(params?.allClass));
  }

  public static async getParentContacts(params?: { classId?: string; page?: number; pageSize?: number; search?: string }) {
    const query = new URLSearchParams({
      page: String(params?.page || 1),
      pageSize: String(params?.pageSize || 50)
    });
    if (params?.classId) query.set('classId', params.classId);
    if (params?.search?.trim()) query.set('search', params.search.trim());
    return this.request<Array<{
      id: string;
      phone: string;
      name: string;
      relationships: string[];
      students: Array<{ id: string; studentId: string; fullName: string; className: string }>;
    }>>(`/parents/contacts?${query.toString()}`);
  }

  public static async getStudentGuardians(studentId: string) {
    return this.request<any[]>(`/students/${encodeURIComponent(studentId)}/guardians`);
  }

  public static async linkStudentGuardian(studentId: string, data: { fullName: string; phone: string; relation: 'aabo' | 'hooyo' | 'walaal' | 'kale'; isPrimary?: boolean }) {
    return this.request<any>(`/students/${encodeURIComponent(studentId)}/guardians`, {
      method: 'POST', body: JSON.stringify(data)
    });
  }

  public static async getStudentEnrollments(studentId: string) {
    return this.request<any[]>(`/students/${encodeURIComponent(studentId)}/enrollments`);
  }

  public static async getAcademicYears() {
    return this.request<Array<{ id: string; name: string; is_current: boolean; start_date: string; end_date: string }>>('/students/academic-years');
  }

  public static async transferStudent(studentId: string, data: { academicYearId: string; classId?: string; sectionId?: string; rollNumber?: string; action?: 'transfer' | 'withdraw' }) {
    return this.request<{ success: boolean; enrollmentId: string | null; withdrawn: boolean }>(`/students/${encodeURIComponent(studentId)}/transfer`, {
      method: 'POST', body: JSON.stringify(data)
    });
  }

  public static async getStudentDetails(id: string, schoolId?: string, includeFinance = false) {
    const student = await this.request<Student>(`/students/${encodeURIComponent(id)}`);
    const payments = includeFinance ? await this.getFeePayments(id, { page: 1, pageSize: 100 }) : [];
    const marks = await this.request<StudentMark[]>(`/exams/marks?studentId=${encodeURIComponent(id)}`).catch(() => []);
    const attendance = await this.request<AttendanceRecord[]>(`/attendance/student?studentId=${encodeURIComponent(id)}&page=1&pageSize=100`).catch(() => []);
    return {
      student,
      payments,
      fees: payments,
      marks,
      attendance,
      totalDue: payments.reduce((acc, p) => acc + (p.amountDue || 0), 0),
      totalPaid: payments.reduce((acc, p) => acc + (p.amountPaid || 0), 0),
      totalRemaining: payments.reduce((acc, p) => acc + (p.remainingAmount || 0), 0)
    };
  }

  public static async getStudentMarks(studentId: string) {
    return this.request<Array<StudentMark & { subjectName?: string }>>(`/exams/marks?studentId=${encodeURIComponent(studentId)}`);
  }

  public static async getStudentAttendance(studentId: string) {
    return this.request<AttendanceRecord[]>(`/attendance/student?studentId=${encodeURIComponent(studentId)}`);
  }

  public static async getAssignments() {
    return this.request<Array<Assignment & { subjectName?: string; submission?: AssignmentSubmission }>>('/assignments');
  }

  public static async createAssignment(data: Pick<Assignment, 'classId' | 'subjectId' | 'title' | 'description' | 'dueDate' | 'maxPoints'>) {
    return this.request<Assignment & { subjectName?: string }>('/assignments', { method: 'POST', body: JSON.stringify(data) });
  }

  public static async getAssignmentSubmissions(assignmentId: string) {
    return this.request<AssignmentSubmission[]>(`/assignments/${encodeURIComponent(assignmentId)}/submissions`);
  }

  public static async submitAssignment(assignmentId: string, content: string) {
    return this.request<AssignmentSubmission>(`/assignments/${encodeURIComponent(assignmentId)}/submissions`, {
      method: 'POST',
      body: JSON.stringify({ content })
    });
  }

  public static async gradeAssignmentSubmission(assignmentId: string, submissionId: string, grade: number, feedback: string) {
    return this.request<AssignmentSubmission>(`/assignments/${encodeURIComponent(assignmentId)}/submissions/${encodeURIComponent(submissionId)}/grade`, {
      method: 'PUT',
      body: JSON.stringify({ grade, feedback })
    });
  }

  public static async deleteStudent(id: string, schoolId?: string) {
    return this.request<{ success: boolean }>(`/students/${id}`, {
      method: 'DELETE'
    });
  }

  public static async getTeachers(params?: any) {
    return this.request<Teacher[]>(`/teachers${this.pageQuery(params)}`);
  }

  public static async createTeacher(data: Partial<Teacher>, schoolId?: string) {
    return this.request<Teacher>('/teachers', {
      method: 'POST',
      body: JSON.stringify(schoolId ? { ...data, schoolId } : data)
    });
  }

  public static async addTeacher(data: Partial<Teacher>, schoolId?: string) {
    return this.createTeacher(data, schoolId);
  }

  public static async updateTeacher(id: string, updates: Partial<Teacher>) {
    return this.request<Teacher>(`/teachers/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
  }

  public static async saveTeacherSubjects(id: string, subjectIds: string[]) {
    return this.request<{ success: boolean; subjectIds: string[] }>(`/teachers/${encodeURIComponent(id)}/subjects`, {
      method: 'PUT', body: JSON.stringify({ subjectIds })
    });
  }

  public static async getTeacherSubjects(id: string) {
    return this.request<string[]>(`/teachers/${encodeURIComponent(id)}/subjects`);
  }

  public static async deleteTeacher(id: string) {
    return this.request<{ success: boolean }>(`/teachers/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  public static async resetTeacherPin(id: string) {
    return this.request<{ success: boolean; newPin: string; teacher: Teacher }>(`/teachers/${encodeURIComponent(id)}/reset-pin`, { method: 'POST' });
  }

  public static async getSchoolDashboard(schoolId?: string) {
    const data = await this.request<any>('/school/dashboard');
    if (data && typeof data === 'object') return data;
    return { stats: { totalStudents: 0, totalTeachers: 0, totalClasses: 0, attendanceRate: 0, todayCollection: 0, totalOutstanding: 0 }, totalClasses: 0, todayAttendance: 0, recentStudents: [], recentPayments: [], notices: [] };
  }

  public static async getHealthVisits() {
    return this.request<any[]>('/school/health-visits');
  }

  public static async addHealthVisit(data: {
    studentId: string; visitDate: string; symptoms: string;
    treatment?: string; nurseName?: string;
  }) {
    return this.request<any>('/school/health-visits', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  public static async getDisciplineIncidents() {
    return this.request<any[]>('/school/discipline');
  }

  public static async addDisciplineIncident(data: {
    studentId: string; incidentDate: string; infractionType: string;
    severity: 'low' | 'medium' | 'high'; actionTaken: string; notes?: string;
    parentContacted?: boolean;
  }) {
    return this.request<any>('/school/discipline', { method: 'POST', body: JSON.stringify(data) });
  }

  public static async getLibraryBooks(schoolId?: string) {
    return this.request<any[]>('/school/library');
  }

  public static async addLibraryBook(data: any, schoolId?: string) {
    return this.request<any>('/school/library', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  public static async getLibraryLoans() {
    return this.request<any[]>('/school/library/loans');
  }

  public static async issueLibraryLoan(data: { bookId: string; studentId: string; dueDate: string }) {
    return this.request<any>('/school/library/loans', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  public static async returnLibraryLoan(loanId: string) {
    return this.request<any>(`/school/library/loans/${encodeURIComponent(loanId)}/return`, { method: 'PUT' });
  }

  public static async getTransportDrivers() {
    return this.request<Array<{ id: string; staffId: string; fullName: string; phone: string }>>('/school/transport/drivers');
  }

  public static async getTransportRoutes(schoolId?: string) {
    return this.request<any[]>('/school/transport');
  }

  public static async addTransportRoute(data: any, schoolId?: string) {
    return this.request<any>('/school/transport', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }
  public static async updateTransportRoute(routeId: string, data: any) {
    return this.request<any>(`/school/transport/${encodeURIComponent(routeId)}`, {
      method: 'PATCH', body: JSON.stringify(data)
    });
  }

  public static async getInventoryItems() {
    return this.request<any[]>('/inventory');
  }

  public static async createInventoryItem(data: {
    name: string; sku?: string; category?: string; unit?: string;
    reorderLevel?: number; unitCost?: number; location?: string; notes?: string;
  }) {
    return this.request<any>('/inventory', { method: 'POST', body: JSON.stringify(data) });
  }

  public static async updateInventoryItem(id: string, data: Record<string, unknown>) {
    return this.request<any>(`/inventory/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  public static async getInventoryTransactions(id: string) {
    return this.request<any[]>(`/inventory/${encodeURIComponent(id)}/transactions`);
  }

  public static async createInventoryTransaction(id: string, data: {
    transactionType: 'stock_in' | 'stock_out' | 'adjustment';
    quantity: number; unitCost?: number; reference?: string; note?: string;
  }) {
    return this.request<any>(`/inventory/${encodeURIComponent(id)}/transactions`, { method: 'POST', body: JSON.stringify(data) });
  }

  public static async getBusAssignments() {
    return this.request<any[]>('/bus/assignments');
  }

  public static async setBusAssignment(studentId: string, routeId: string) {
    return this.request<any>(`/bus/assignments/${studentId}`, { method: 'PUT', body: JSON.stringify({ routeId }) });
  }

  public static async removeBusAssignment(studentId: string) {
    return this.request<{ success: boolean }>(`/bus/assignments/${studentId}`, { method: 'DELETE' });
  }

  public static async assignBusStudentsBulk(studentIds: string[], routeId: string) {
    return this.request<{ assignments: any[]; failures: Array<{ studentId: string; studentName?: string; error: string }> }>('/bus/assignments/bulk', {
      method: 'POST', body: JSON.stringify({ studentIds, routeId })
    });
  }

  // Attendance: Taken once per day
  public static async getDailyAttendance(classId: string, date: string) {
    return this.request<AttendanceRecord[]>(`/attendance?classId=${classId}&date=${date}`);
  }

  public static async getAttendanceMonth(classId: string, year: number, month: number) {
    return this.request<Array<{ studentId:string; date:string; status:'J'|'M'|'' }>>(
      `/attendance/month?classId=${encodeURIComponent(classId)}&year=${year}&month=${month}`
    );
  }

  public static async getSchoolDailyAbsences(date: string) {
    return this.request<Array<AttendanceRecord & { student: Student; className: string }>>(`/attendance/school/absences?date=${encodeURIComponent(date)}`);
  }

  public static async recordDailyAttendance(classId: string, date: string, records: any[], source: 'document_template' | 'attendance_module' = 'attendance_module') {
    return this.request<{ success: boolean; count: number; records: AttendanceRecord[] }>('/attendance', {
      method: 'POST',
      body: JSON.stringify({ classId, date, records, source })
    });
  }

  // Exams & Results
  public static async getExamConfig() {
    return this.request<ExamConfig>('/exams/config');
  }

  public static async updateExamConfig(config: Partial<ExamConfig>) {
    return this.request<ExamConfig>('/exams/config', {
      method: 'PUT',
      body: JSON.stringify(config)
    });
  }

  public static async getExamRooms(includeInactive = false) {
    return this.request<any[]>('/exams/rooms' + (includeInactive ? '?includeInactive=true' : ''));
  }

  public static async createExamRoom(room: { name: string; roomCode?: string; capacity: number; location?: string; shiftName?: string }) {
    return this.request<any>('/exams/rooms', { method: 'POST', body: JSON.stringify(room) });
  }

  public static async updateExamRoom(roomId: string, room: { name: string; roomCode?: string; capacity: number; location?: string; shiftName?: string; isActive: boolean }) {
    return this.request<any>(`/exams/rooms/${encodeURIComponent(roomId)}`, { method: 'PUT', body: JSON.stringify(room) });
  }

  public static async getExamSchedules() {
    return this.request<any[]>('/exams/schedules');
  }

  public static async getPublishedExamSchedules(classId?: string) {
    const path = '/exams/schedules/published' + (classId ? '?classId=' + encodeURIComponent(classId) : '');
    return this.request<any[]>(path);
  }

  public static async createExamSchedule(schedule: {
    examName: string; classId?: string; subjectId: string; cohortStudentIds?: string[]; examType: 'small' | 'big';
    semester: 'Semester 1' | 'Semester 2'; examDate: string; startTime: string;
    endTime: string; roomName: string; roomId?: string; shiftName?: string; seatCapacity: number;
  }) {
    return this.request<any>('/exams/schedules', { method: 'POST', body: JSON.stringify(schedule) });
  }

  public static async updateExamSchedule(scheduleId: string, updates: {
    examName: string; examType: 'small' | 'big'; semester: 'Semester 1' | 'Semester 2'; examDate: string; startTime: string; endTime: string; roomName: string; roomId?: string; shiftName: string;
    seatCapacity: number; cohortStudentIds?: string[];
  }) {
    return this.request<any>(`/exams/schedules/${encodeURIComponent(scheduleId)}`, {
      method: 'PUT', body: JSON.stringify(updates)
    });
  }

  public static async getExamScheduleCohort(scheduleId: string) {
    return this.request<Array<{ studentId: string; classId: string }>>(`/exams/schedules/${encodeURIComponent(scheduleId)}/cohort`);
  }

  public static async cancelExamSchedule(scheduleId: string) {
    return this.request<{ success: boolean; schedule: any }>(
      `/exams/schedules/${encodeURIComponent(scheduleId)}/cancel`, { method: 'POST', body: JSON.stringify({}) }
    );
  }

  public static async publishExamSchedule(scheduleId: string) {
    return this.request<{ success: boolean; schedule_id: string; status: string; seat_count: number; published_at: string }>(
      `/exams/schedules/${encodeURIComponent(scheduleId)}/publish`, { method: 'POST', body: JSON.stringify({}) }
    );
  }

  public static async getExamScheduleSeats(scheduleId: string) {
    return this.request<{ schedule: any; seats: Array<{ id: string; seatNumber: number; studentIdLabel: string; studentName: string }> }>(
      `/exams/schedules/${encodeURIComponent(scheduleId)}/seats`
    );
  }

  public static async getMarks(classId: string, subjectId?: string, semester?: string) {
    const params = new URLSearchParams();
    params.append('classId', classId);
    if (subjectId) params.append('subjectId', subjectId);
    if (semester) params.append('semester', semester);
    return this.request<StudentMark[]>(`/exams/marks?${params.toString()}`);
  }

  public static async saveMarks(classId: string, subjectId: string, semester: string, marks: any[]) {
    return this.request<{ success: boolean; marks: StudentMark[] }>('/exams/marks', {
      method: 'POST',
      body: JSON.stringify({ classId, subjectId, semester, marks })
    });
  }

  public static async forwardClassMarks(classId: string, semester: string) {
    return this.request<{ success: boolean; forwardedCount: number }>('/exams/forward-class', {
      method: 'POST',
      body: JSON.stringify({ classId, semester })
    });
  }

  public static async approveMarks(markIds: string[]) {
    return this.request<{ success: boolean; approvedCount: number }>('/exams/approve', {
      method: 'POST',
      body: JSON.stringify({ markIds })
    });
  }

  public static async returnMarksForCorrection(markIds: string[], reason: string) {
    return this.request<{ success: boolean; returnedCount: number }>('/exams/return', {
      method: 'POST',
      body: JSON.stringify({ markIds, reason })
    });
  }

  public static async publishExamResults(classId: string, semester: string) {
    return this.request<{ success: boolean; publishedCount: number; publishedAt: string | null; alreadyPublished?: boolean; notificationCreated?: boolean }>('/exams/publish', {
      method: 'POST',
      body: JSON.stringify({ classId, semester })
    });
  }

  public static async getSemesterRankings(classId: string, semester: string = 'Semester 1') {
    return this.request<any[]>(`/exams/rankings/semester?classId=${classId}&semester=${encodeURIComponent(semester)}`);
  }

  public static async getYearlyRankings(classId: string) {
    return this.request<any[]>(`/exams/rankings/yearly?classId=${classId}`);
  }

  public static async getPromotionHistory() {
    return this.request<any[]>('/promotions/history');
  }

  public static async confirmPromotions(classId: string, topN: number, promotions: any[], sourceAcademicYearId?: string, targetAcademicYearId?: string) {
    return this.request<{ success: boolean; count: number; enrollmentCount?: number }>('/promotions/confirm', {
      method: 'POST',
      body: JSON.stringify({ classId, topN, promotions, sourceAcademicYearId, targetAcademicYearId })
    });
  }

  // Fees: Cash, bank transfer, or mobile money
  public static async getFeeStructures() {
    return this.request<FeeStructureItem[]>('/fees/structures');
  }

  public static async createFeeStructure(structure: Partial<FeeStructureItem>) {
    return this.request<FeeStructureItem>('/fees/structures', {
      method: 'POST',
      body: JSON.stringify(structure)
    });
  }

  public static async updateFeeStructure(id: string, structure: Partial<FeeStructureItem>) {
    return this.request<FeeStructureItem>(`/fees/structures/${id}`, { method: 'PUT', body: JSON.stringify(structure) });
  }

  public static async deleteFeeStructure(id: string) {
    return this.request<{ success: boolean }>(`/fees/structures/${id}`, { method: 'DELETE' });
  }

  public static async getFeeReceiptPage(page = 1, pageSize = 20) {
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    return this.request<{ items: FeePayment[]; total: number; page: number; pageSize: number; totalPages: number }>(`/fees/receipts?${query.toString()}`);
  }

  public static async getFeePayments(studentId?: string, params?: any) {
    const query = new URLSearchParams();
    if (studentId) query.set('studentId', studentId);
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    const q = query.size ? `?${query.toString()}` : '';
    return this.request<FeePayment[]>(`/fees/payments${q}`);
  }

  public static async recordCashPayment(data: {
    studentId: string;
    amountDue: number;
    amountPaid: number;
    paymentMethod?: 'Cash' | 'Bank Transfer' | 'Mobile Money';
    feeType?: string;
    feeStructureId?: string;
    month?: string;
    academicYear?: string;
    notes?: string;
    idempotencyKey?: string;
  }) {
    return this.request<FeePayment>('/fees/pay-cash', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  public static async getPayrollStaff() {
    return this.request<Array<{ id: string; staffId: string; userId: string; name: string; monthlySalary: number; roleTitle?: string }>>('/payroll/staff');
  }

  public static async getPayrollRecords(month: string, page = 1, pageSize = 20) {
    const query = new URLSearchParams({ month, page: String(page), pageSize: String(pageSize) });
    return this.request<StaffPayrollRecord[]>(`/payroll?${query.toString()}`);
  }

  public static async getAllPayrollRecords(month: string, pageSize = 100): Promise<StaffPayrollRecord[]> {
    const firstPage = await this.getPayrollRecords(month, 1, pageSize);
    const pagination = (firstPage as any).pagination;
    const totalPages = Math.max(1, Number(pagination?.totalPages) || 1);
    const records = [...firstPage];
    for (let page = 2; page <= totalPages; page += 1) {
      records.push(...await this.getPayrollRecords(month, page, pageSize));
    }
    return records;
  }

  public static async createPayrollDraft(month: string, staff: Array<{ staffId: string; baseSalary?: number; allowances: Array<{ label: string; amount: number }>; deductions: Array<{ label: string; amount: number }> }>) {
    return this.request<StaffPayrollRecord[]>('/payroll', { method: 'POST', body: JSON.stringify({ month, staff }) });
  }

  public static async approvePayroll(id: string) {
    return this.request<StaffPayrollRecord>(`/payroll/${encodeURIComponent(id)}/approve`, { method: 'POST' });
  }

  public static async payPayroll(id: string, payment: { amount: number; paymentMethod: 'cash' | 'bank_transfer' | 'mobile_money' | 'other'; paymentDate: string; reference?: string; notes?: string }) {
    return this.request<StaffPayrollRecord>(`/payroll/${encodeURIComponent(id)}/pay`, { method: 'POST', body: JSON.stringify(payment) });
  }

  public static async getMyPayslips(page = 1, pageSize = 20) {
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    return this.request<StaffPayrollRecord[]>(`/payroll/mine?${query.toString()}`);
  }

  public static downloadPayslipPdf(id: string) {
    return this.downloadPdf(`/payroll/${encodeURIComponent(id)}/payslip.pdf`, `payslip-${id}.pdf`);
  }

  public static async getMonthlyCashbook(month: string) {
    const query = new URLSearchParams({ month });
    return this.request<Array<{ id: string; date: string; type: 'income' | 'expense'; description: string; category: string; amount: number; method: string; reference: string; status: 'posted' | 'void' }>>(`/fees/cashbook?${query.toString()}`);
  }

  public static async getMonthlyFinanceSummary(month: string) {
    const query = new URLSearchParams({ month });
    return this.request<{ month: string; totalIncome: number; incomeCount: number; totalExpenses: number; expenseCount: number; payrollExpenseTotal: number; payrollExpenseCount: number; payrollIncluded: boolean; netCashflow: number }>(`/fees/monthly-summary?${query.toString()}`);
  }

  public static async getBankReconciliation() {
    return this.request<{ entries: import('../types/index.ts').BankStatementEntry[]; unmatchedPayments: Array<FeePayment & { reconciliationRemainingAmount: number }>; unmatchedExpenses: Array<SchoolExpense & { reconciliationRemainingAmount: number }> }>('/bank-reconciliation');
  }

  public static async createBankStatementEntry(data: { statementDate: string; description: string; direction: 'credit' | 'debit'; amount: number; reference?: string; bankAccountLabel?: string }) {
    return this.request<import('../types/index.ts').BankStatementEntry>('/bank-reconciliation', { method: 'POST', body: JSON.stringify(data) });
  }

  public static async importBankStatementEntries(rows: Array<{ statementDate: string; description: string; direction: 'credit' | 'debit'; amount: number; reference?: string; bankAccountLabel?: string }>) {
    return this.request<{ createdCount: number; skippedDuplicates: number; entries: import('../types/index.ts').BankStatementEntry[] }>('/bank-reconciliation/import', {
      method: 'POST', body: JSON.stringify({ rows })
    });
  }

  public static async matchBankStatementEntry(id: string, match: { paymentId?: string; expenseId?: string }) {
    return this.request<import('../types/index.ts').BankStatementEntry>(`/bank-reconciliation/${encodeURIComponent(id)}/match`, { method: 'POST', body: JSON.stringify(match) });
  }

  public static async allocateBankStatementAmount(id: string, allocation: { paymentId?: string; expenseId?: string; amount: number }) {
    return this.request<import('../types/index.ts').BankStatementAllocation>(`/bank-reconciliation/${encodeURIComponent(id)}/allocations`, {
      method: 'POST', body: JSON.stringify(allocation)
    });
  }
  public static async getSchoolExpenses() {
    return this.request<SchoolExpense[]>('/expenses');
  }

  public static async createSchoolExpense(data: Omit<SchoolExpense, 'id' | 'schoolId' | 'status' | 'createdBy' | 'createdAt'>) {
    return this.request<SchoolExpense>('/expenses', { method: 'POST', body: JSON.stringify(data) });
  }

  public static async voidSchoolExpense(id: string, reason: string) {
    return this.request<SchoolExpense>(`/expenses/${encodeURIComponent(id)}/void`, { method: 'POST', body: JSON.stringify({ reason }) });
  }

  public static async getDailyIncome(date?: string) {
    const q = date ? `?date=${date}` : '';
    return this.request<any>(`/fees/daily-income${q}`);
  }

  public static async getArrears() {
    return this.request<any[]>('/fees/arrears');
  }

  // Report Card Designer
  public static async getReportCardDesign() {
    return this.request<ReportCardDesign>('/report-card/design');
  }

  public static async updateReportCardDesign(design: Partial<ReportCardDesign>) {
    return this.request<ReportCardDesign>('/report-card/design', {
      method: 'PUT',
      body: JSON.stringify(design)
    });
  }

  // Notices & Messages
  public static async getNotices(params?: any) {
    return this.request<SchoolNotice[]>(`/notices${this.pageQuery(params)}`);
  }

  public static async createNotice(data: Partial<SchoolNotice>) {
    return this.request<SchoolNotice>('/notices', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  public static async updateNotice(id: string, data: Partial<SchoolNotice>) {
    return this.request<SchoolNotice>(`/notices/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  public static async archiveNotice(id: string) {
    return this.request<{ success: boolean }>(`/notices/${id}`, { method: 'DELETE' });
  }

  public static async getNoticeUnreadCount() {
    return this.request<{ count: number }>('/notices/unread-count');
  }

  public static async markNoticeRead(id: string) {
    const result = await this.request<{ success: boolean }>(`/notices/${id}/read`, { method: 'POST' });
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('schoolos:notices-read'));
    return result;
  }

  public static async markNoticesRead(noticeIds: string[]) {
    const result = await this.request<{ success: boolean; count: number }>('/notices/read-batch', {
      method: 'POST',
      body: JSON.stringify({ noticeIds })
    });
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('schoolos:notices-read'));
    return result;
  }

  public static async getMessages(params?: { page?: number; pageSize?: number; contactId?: string }) {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    if (params?.contactId) query.set('contactId', params.contactId);
    return this.request<any[]>(`/messages?${query.toString()}`);
  }

  public static async getMessageContacts() {
    return this.request<any[]>('/messages/contacts');
  }

  public static async markMessagesRead(contactId: string) {
    return this.request<{ success: boolean }>('/messages/read', { method: 'POST', body: JSON.stringify({ contactId }) });
  }

  public static async sendMessage(recipientId: string, recipientName: string, recipientRole: string, content: string) {
    return this.request<any>('/messages', {
      method: 'POST',
      body: JSON.stringify({ recipientId, recipientName, recipientRole, content })
    });
  }

  // Support Tickets
  public static async getTickets(params?: { page?: number; pageSize?: number; search?: string; status?: string }) {
    return this.request<SupportTicket[]>(`/support/tickets${this.pageQuery(params)}`);
  }

  public static async createTicket(
    subjectOrData: string | { subject: string; description: string; priority?: any },
    description?: string,
    priority: string = 'medium'
  ) {
    const payload = typeof subjectOrData === 'object'
      ? subjectOrData
      : { subject: subjectOrData, description: description || '', priority };
    return this.request<SupportTicket>('/support/tickets', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  public static async replyTicket(ticketId: string, contentOrData: string | { content: string; status?: any }) {
    const payload = typeof contentOrData === 'string' ? { content: contentOrData } : contentOrData;
    return this.request<SupportTicket>(`/support/tickets/${ticketId}/reply`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  // School Backup
  public static async getSchoolBackup() {
    return this.request<any>('/school/backup');
  }
}
