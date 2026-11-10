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
  SchoolSetupProgressUpdate
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

  public static downloadReceiptPdf(paymentId: string) {
    return this.downloadPdf(`/fees/payments/${encodeURIComponent(paymentId)}/receipt.pdf`, `receipt-${paymentId}.pdf`);
  }

  public static async voidFeePayment(paymentId: string, reason: string) {
    return this.request<FeePayment>(`/fees/payments/${encodeURIComponent(paymentId)}/void`, { method: 'POST', body: JSON.stringify({ reason }) });
  }

  private static pageQuery(params?: { page?: number; pageSize?: number; search?: string }) {
    if (!params?.page && !params?.pageSize && !params?.search?.trim()) return '';
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.pageSize) query.set('pageSize', String(params.pageSize));
    if (params.search?.trim()) query.set('search', params.search.trim());
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

  public static getLanguage(): 'en' | 'so' | 'am' {
    return (localStorage.getItem(LANG_KEY) as any) || 'en';
  }

  public static hasLanguagePreference(): boolean {
    return Boolean(localStorage.getItem(LANG_KEY));
  }

  public static setLanguage(lang: 'en' | 'so' | 'am') {
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
      if (typeof window !== 'undefined' && data.code === 'MUST_CHANGE_PASSWORD') {
        window.dispatchEvent(new CustomEvent('schoolos:must-change-password'));
      } else if (typeof window !== 'undefined' && !suppressGlobalApiError && endpoint !== '/auth/login' && endpoint !== '/auth/change-password' && [401, 403, 500].includes(response.status)) {
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

  public static async getMe() {
    return this.request<{ user: User; school: School | null; sessionTimeoutMinutes: number }>('/auth/me');
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
    return this.request<{ school: School; admin: User; temporaryPassword: string; mustChangePassword: true }>('/superadmin/schools', {
      method: 'POST',
      body: JSON.stringify(schoolData)
    });
  }

  public static async addSchool(schoolData: any) {
    return this.createSchool(schoolData);
  }

  public static async getSchoolDetails(id: string) {
    const schools = await this.getSchools();
    const school = schools.find(s => s.id === id);
    const users = await this.request<User[]>(`/users?schoolId=${id}`).catch(() => []);
    const admin = users.find(u => u.role === 'school_admin') || users[0];
    return {
      school,
      admin,
      studentCount: Number((school as any)?.studentCount) || 0,
      teacherCount: Number((school as any)?.teacherCount) || 0
    };
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

  public static async resetUserPassword(userId: string): Promise<{ success: boolean; temporaryPassword: string; mustChangePassword: boolean }> {
    return this.request(`/users/${userId}/reset-password`, { method: 'POST' });
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

  public static async getGlobalUsers(params?: any) {
    return this.request<any[]>('/users');
  }

  public static async toggleUserBlock(userId: string, blockedOrSchoolId?: boolean | string) {
    return this.request<any>(`/users/${userId}/toggle-block`, { 
      method: 'POST',
      body: typeof blockedOrSchoolId === 'boolean' ? JSON.stringify({ isBlocked: blockedOrSchoolId }) : undefined
    }).catch(() => ({ success: true }));
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

  public static async getSubjects(params?: any) {
    return this.request<Subject[]>('/subjects');
  }

  public static async getTeacherSubjectAssignments() {
    return this.request<Array<{ classId: string; subject: Subject; class: SchoolClass; periodsPerWeek: number; smallExamEnabled: boolean; bigExamEnabled: boolean }>>('/teacher/subject-assignments');
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
    return this.request<TimetableSlot[]>(`/timetable?${params.toString()}`);
  }

  public static async setTimetableSlot(slot: Partial<TimetableSlot>) {
    return this.request<TimetableSlot>('/timetable', {
      method: 'POST',
      body: JSON.stringify(slot)
    });
  }

  public static async generateTimetable(classId: string) {
    return this.request<{ slots: TimetableSlot[]; unfilled: Array<{ subjectId: string; teacherId: string; occurrence: number }> }>('/timetable/generate', { method: 'POST', body: JSON.stringify({ classId }) });
  }

  public static async removeTimetablePeriod(classId: string, dayOfWeek: string, periodNumber: number) {
    return this.request<{ success: boolean }>(`/timetable/${encodeURIComponent(classId)}/${encodeURIComponent(dayOfWeek)}/${periodNumber}`, { method: 'DELETE' });
  }

  public static async swapTimetableSlots(firstSlotId: string, secondSlotId: string) {
    return this.request<{ success: boolean }>('/timetable/swap', { method: 'POST', body: JSON.stringify({ firstSlotId, secondSlotId }) });
  }

  public static async getTimetableSettings() {
    return this.request<{ schoolId: string; firstPeriodStart: string; periodMinutes: number; breakAfterPeriod: number; breakMinutes: number; shift2FirstPeriodStart: string; shift2PeriodMinutes: number; shift2BreakAfterPeriod: number; shift2BreakMinutes: number }>('/timetable/settings');
  }

  public static async saveTimetableSettings(settings: { firstPeriodStart: string; periodMinutes: number; breakAfterPeriod: number; breakMinutes: number; shift2FirstPeriodStart?: string; shift2PeriodMinutes?: number; shift2BreakAfterPeriod?: number; shift2BreakMinutes?: number }) {
    return this.request('/timetable/settings', { method: 'PUT', body: JSON.stringify(settings) });
  }

  public static async getTeacherUnavailability(teacherId?: string) {
    const query = teacherId ? `?teacherId=${encodeURIComponent(teacherId)}` : '';
    return this.request<Array<{ id: string; teacherId: string; dayOfWeek: string; periodNumber: number }>>(`/timetable/unavailability${query}`);
  }

  public static async setTeacherUnavailability(input: { teacherId: string; dayOfWeek: string; periodNumber: number; unavailable: boolean }) {
    return this.request<{ success: boolean }>('/timetable/unavailability', { method: 'PUT', body: JSON.stringify(input) });
  }

  // Students & Teachers
  public static async getStudents(classId?: string, branchId?: string, page?: number, pageSize?: number, search?: string, feeStatus?: string) {
    const params = new URLSearchParams();
    if (classId) params.append('classId', classId);
    if (branchId) params.append('branchId', branchId);
    if (page) params.append('page', String(page));
    if (pageSize) params.append('pageSize', String(pageSize));
    if (search?.trim()) params.append('search', search.trim());
    if (feeStatus && feeStatus !== 'all') params.append('feeStatus', feeStatus);
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

  public static async createStudent(studentData: Partial<Student>, schoolId?: string) {
    return this.request<Student>('/students', {
      method: 'POST',
      body: JSON.stringify(schoolId ? { ...studentData, schoolId } : studentData)
    });
  }

  public static async addStudent(studentData: Partial<Student>, schoolId?: string) {
    return this.createStudent(studentData, schoolId);
  }

  public static async updateStudent(id: string, updates: Partial<Student>, note?: string) {
    return this.request<Student>(`/students/${id}`, {
      method: 'PUT',
      body: JSON.stringify(note ? { ...updates, note } : updates)
    });
  }

  public static async getSchoolStudents(params?: any) {
    return this.getStudents(params?.classId, params?.branchId, params?.page, params?.pageSize, params?.search, params?.paymentStatus);
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

  public static async getTransportRoutes(schoolId?: string) {
    return this.request<any[]>('/school/transport');
  }

  public static async addTransportRoute(data: any, schoolId?: string) {
    return this.request<any>('/school/transport', {
      method: 'POST',
      body: JSON.stringify(data)
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

  // Attendance: Taken once per day
  public static async getDailyAttendance(classId: string, date: string) {
    return this.request<AttendanceRecord[]>(`/attendance?classId=${classId}&date=${date}`);
  }

  public static async recordDailyAttendance(classId: string, date: string, records: any[]) {
    return this.request<{ success: boolean; count: number; records: AttendanceRecord[] }>('/attendance', {
      method: 'POST',
      body: JSON.stringify({ classId, date, records })
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

  public static async getExamSchedules() {
    return this.request<any[]>('/exams/schedules');
  }

  public static async createExamSchedule(schedule: {
    examName: string; classId: string; subjectId: string; examType: 'small' | 'big';
    semester: 'Semester 1' | 'Semester 2'; examDate: string; startTime: string;
    endTime: string; roomName: string; seatCapacity: number;
  }) {
    return this.request<any>('/exams/schedules', { method: 'POST', body: JSON.stringify(schedule) });
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

  public static async approveMarks(markIds: string[]) {
    return this.request<{ success: boolean; approvedCount: number }>('/exams/approve', {
      method: 'POST',
      body: JSON.stringify({ markIds })
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

  public static async confirmPromotions(classId: string, topN: number, promotions: any[]) {
    return this.request<{ success: boolean; count: number }>('/promotions/confirm', {
      method: 'POST',
      body: JSON.stringify({ classId, topN, promotions })
    });
  }

  // Fees: Cash Only
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
    return this.request<Array<{ id: string; staffId: string; userId: string; name: string; monthlySalary: number }>>('/payroll/staff');
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

  public static async createPayrollDraft(month: string, staff: Array<{ staffId: string; allowances: Array<{ label: string; amount: number }>; deductions: Array<{ label: string; amount: number }> }>) {
    return this.request<StaffPayrollRecord[]>('/payroll', { method: 'POST', body: JSON.stringify({ month, staff }) });
  }

  public static async approvePayroll(id: string) {
    return this.request<StaffPayrollRecord>(`/payroll/${encodeURIComponent(id)}/approve`, { method: 'POST' });
  }

  public static async payPayroll(id: string) {
    return this.request<StaffPayrollRecord>(`/payroll/${encodeURIComponent(id)}/pay`, { method: 'POST' });
  }

  public static async getMyPayslips(page = 1, pageSize = 20) {
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    return this.request<StaffPayrollRecord[]>(`/payroll/mine?${query.toString()}`);
  }

  public static downloadPayslipPdf(id: string) {
    return this.downloadPdf(`/payroll/${encodeURIComponent(id)}/payslip.pdf`, `payslip-${id}.pdf`);
  }

  public static async getMonthlyFinanceSummary(month: string) {
    const query = new URLSearchParams({ month });
    return this.request<{ month: string; totalIncome: number; incomeCount: number; totalExpenses: number; expenseCount: number; netCashflow: number }>(`/fees/monthly-summary?${query.toString()}`);
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

  public static async getMessages(params?: any) {
    return this.request<any[]>(`/messages${this.pageQuery(params)}`);
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
  public static async getTickets(params?: any) {
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
