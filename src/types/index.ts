/**
 * Complete Data Model and Type Definitions for SchoolOS Multi-School SaaS
 */

export type UserRole = 'super_admin' | 'school_admin' | 'accountant' | 'teacher' | 'parent' | 'student';

export type SubscriptionStatus = 'trial' | 'active' | 'grace' | 'read_only' | 'suspended';
export type SubscriptionCadence = 'trial' | 'monthly' | 'yearly' | 'lifetime';
export type PlanTier = 'basic' | 'standard' | 'premium';

export interface PlanConfig {
  id: PlanTier;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  lifetimePrice: number;
  modules: string[];
  maxStudents: number;
  maxTeachers: number;
  supportLevel: 'community' | 'standard' | 'dedicated_24_7';
}

export interface SchoolSubscription {
  plan: PlanTier;
  cadence: SubscriptionCadence;
  status: SubscriptionStatus;
  startDate: string;
  validUntil: string;
  graceDays: number;
  pricePaid: number;
  autoRenew: boolean;
  lastBilledDate?: string;
}

export interface SchoolBranch {
  id: string;
  schoolId: string;
  name: string;
  address: string;
  phone?: string;
  email?: string;
  isMain: boolean;
  createdAt: string;
}

export type SchoolLanguage = 'en' | 'so';
export type SchoolCurrency = 'ETB' | 'USD' | 'SOS';

export interface GradingBand {
  minPercentage: number;
  label: string;
  remark?: string;
}

export interface AttendanceRules {
  lateAfterMinutes: number;
  absentAfterMinutes: number;
  requireExcusedReason: boolean;
  allowParentExcuses: boolean;
}

export interface SchoolTermDates {
  semester1Start: string;
  semester1End: string;
  semester2Start: string;
  semester2End: string;
}

export interface NotificationPreferences {
  email: boolean;
  sms: boolean;
  inApp: boolean;
  attendanceAlerts: boolean;
  feeReminders: boolean;
  examResults: boolean;
}

export interface SchoolSetupData {
  schoolInformation: { name: string; logoUrl: string; address: string; phone: string; email: string; schoolType: 'primary' | 'secondary' | 'combined' };
  academicYear: { name: string; startDate: string; endDate: string; isCurrent: boolean };
  terms: Array<{ name: string; startDate: string; endDate: string }>;
  calendar: { workingDays: string[]; weeklyHolidays: string[]; nationalHolidays: Array<{ name: string; date: string; calendar: 'ethiopian' | 'gregorian' }>; schoolHolidays: Array<{ name: string; startDate: string; endDate: string }>; calendarType: 'ethiopian' | 'gregorian' | 'both' };
  workingHours: { openingTime: string; classStartTime: string; closingTime: string; breakStartTime: string; breakEndTime: string; periodsPerDay: number };
  completedSteps: number[];
  updatedAt?: string;
}

export interface SchoolSetupProgress {
  currentStep: number;
  completedSteps: number[];
  skippedSteps: number[];
  completedAt: string | null;
}

export interface SchoolSetupChecklistItem {
  ready: boolean;
  optional: boolean;
  reason: string;
}

export interface SchoolSetupState {
  progress: SchoolSetupProgress;
  checklist: Record<number, SchoolSetupChecklistItem>;
  canFinish: boolean;
}

export interface SchoolSetupProgressUpdate {
  currentStep: number;
  completedSteps: number[];
  skippedSteps: number[];
  complete?: boolean;
}

export interface School {
  id: string;
  name: string;
  code: string; // e.g., "MOG01"
  address: string;
  country?: string;
  region?: string;
  city: string;
  schoolType?: 'primary' | 'secondary' | 'combined';
  phone: string;
  email: string;
  whatsappPhone?: string;

  logoUrl?: string;
  brandColor?: string; // Default "#0F766E"
  currency: SchoolCurrency; // ETB default, per-school ETB/USD/SOS
  language?: SchoolLanguage; // English default; Somali enabled
  timezone?: string;
  academicYear: string; // e.g. "2026-2027"
  currentSemester: 'Semester 1' | 'Semester 2';
  terms?: SchoolTermDates;
  gradingScale?: GradingBand[];
  attendanceRules?: AttendanceRules;
  classLevels?: number[];
  reportCardHeader?: string;
  reportCardFooter?: string;
  receiptHeader?: string;
  receiptFooter?: string;
  notificationPreferences?: NotificationPreferences;
  setupProgress?: SchoolSetupProgress;
  setupData?: SchoolSetupData;
  defaultClassCapacity: number;
  studentAccessEnabled: boolean; // School Admin and Super Admin can toggle
  subscription: SchoolSubscription;
  branches?: SchoolBranch[];
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  schoolId?: string; // null for Super Admin
  branchId?: string;
  role: UserRole;
  fullName: string;
  email?: string;
  authUserId?: string; // Optional Supabase Auth identity; public.users.id remains the stable SchoolOS ID.
  phone?: string;
  staffId?: string;
  studentId?: string; // e.g., "STD-MOG01-01"
  parentPhone?: string;
  passwordHash: string;
  pin?: string; // 4-6 digit PIN for students and parents
  mustChangePassword?: boolean;
  mustSetup2FA?: boolean;
  isBlocked: boolean;
  failedLoginAttempts: number;
  lockedUntil?: string | null;
  twoFactorEnabled?: boolean;
  twoFactorSecret?: string;
  pendingTwoFactorSecret?: string;
  recoveryCodes?: string[];
  permissions?: string[]; // Staff permissions
  assignedClassIds?: string[]; // For teachers
  assignedSubjectIds?: string[]; // For teachers
  linkedStudentIds?: string[]; // For parents with multiple kids
  createdAt: string;
  lastLoginAt?: string;
}

export interface UserSession {
  id: string;
  userId: string;
  userRole: UserRole;
  schoolId?: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
  expiresAt: string;
  lastActivityAt: string;
}

export interface Student {
  id: string;
  schoolId: string;
  branchId?: string;
  studentId: string; // STD-<SCHOOLCODE>-01
  firstName: string;
  middleName: string;
  lastName: string;
  gender: 'male' | 'female';
  admissionDate: string;
  dateOfBirth?: string;
  studentPhone?: string;
  fatherPhone: string;
  motherPhone?: string;
  classId: string;
  section?: string;
  status: 'active' | 'inactive' | 'graduated' | 'transferred';
  pin?: string; // Only shown at creation or reset slip
  pinHash?: string; // Secure scrypt hash
  documents?: { id: string; name: string; url: string; uploadDate: string }[];
  notes?: { id: string; text: string; author: string; date: string }[];
  bloodGroup?: string;
  allergies?: string;
  busRouteId?: string;
  createdAt: string;
}

export interface Teacher {
  id: string;
  schoolId: string;
  branchId?: string;
  userId: string;
  staffId?: string;
  fullName: string;
  email?: string;
  phone: string;
  gender: 'male' | 'female';
  qualification: string;
  department: string;
  assignedClasses: string[]; // Class IDs
  assignedSubjects: string[]; // Subject IDs
  status: 'active' | 'on_leave' | 'inactive';
  joinedDate: string;
  monthlySalary: number;
}

export interface SchoolClass {
  id: string;
  schoolId: string;
  branchId?: string;
  name: string; // e.g., "Grade 10 - A"
  gradeLevel: number; // 1 to 12
  section: string; // "A", "B", etc.
  roomNumber: string;
  capacity: number;
  classTeacherId?: string | null;
  monthlyFee: number;
  isArchived?: boolean;
  /** Morning (1) or afternoon (2) school session. */
  shift?: 1 | 2;
}

export interface Subject {
  id: string;
  schoolId: string;
  name: string; // e.g. "Mathematics", "Biology"
  code: string; // e.g. "MATH-10"
  creditUnits: number;
  department: string;
  assignedTeacherIds: string[];
}

export interface TimetableSlot {
  id: string;
  schoolId: string;
  classId: string;
  dayOfWeek: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';
  periodNumber: number; // 1 to 8
  startTime: string; // "08:00"
  endTime: string; // "08:45"
  subjectId: string;
  teacherId: string;
  roomNumber: string;
  subjectName?: string;
  teacherName?: string;
  className?: string;
  shift?: 1 | 2;
}

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

/**
 * Attendance taken strictly ONCE PER DAY per student per class.
 */
export interface AttendanceRecord {
  id: string;
  schoolId: string;
  classId: string;
  studentId: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  note?: string;
  recordedBy: string; // User ID
  recordedAt: string;
}

export interface ExamAssessmentComponent {
  id: string;
  name: string;
  maxMarks: number;
  category: 'continuous' | 'final';
  order: number;
}

export interface ExamConfig {
  id: string;
  schoolId: string;
  academicYear: string;
  /** Compatibility totals derived from assessmentComponents. */
  smallExamName: string;
  smallExamMax: number;
  bigExamName: string;
  bigExamMax: number;
  assessmentComponents: ExamAssessmentComponent[];
  passMarkPercentage: number;
  updatedAt: string;
}

export type MarkStatus = 'draft' | 'submitted' | 'form_teacher_submitted' | 'approved';

/**
 * Marks are strictly Percentage-Based from Small Exam + Big Exam.
 */
export interface StudentMark {
  id: string;
  schoolId: string;
  classId: string;
  subjectId: string;
  studentId: string;
  academicYear: string;
  semester: 'Semester 1' | 'Semester 2';
  smallExamMarks: number;
  bigExamMarks: number;
  /** Per-assessment raw scores keyed by ExamAssessmentComponent.id. */
  assessmentScores?: Record<string, number>;
  totalMarks: number; // small + big
  percentage: number; // (total / (smallMax + bigMax)) * 100
  status: MarkStatus;
  teacherRemarks?: string;
  submittedBy?: string;
  submittedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
}

export interface PromotionRecord {
  id: string;
  schoolId: string;
  academicYearFrom: string;
  academicYearTo: string;
  classFromId: string;
  classToId?: string;
  studentId: string;
  yearlyPercentage: number;
  yearlyRank: number;
  decision: 'promoted' | 'repeated';
  notes?: string;
  processedBy: string;
  processedAt: string;
}

// Supported fee collection channels.
export type PaymentMethod = 'Cash' | 'Bank Transfer' | 'Mobile Money';
export type FeePaymentStatus = 'paid' | 'partial' | 'unpaid';
export type FeeType = 'monthly_tuition' | 'annual_registration' | 'bus' | 'custom';

export interface FeeStructureItem {
  id: string;
  schoolId: string;
  feeType: FeeType;
  name: string;
  minGrade?: number; // e.g. Grade 1 to 4
  maxGrade?: number; // e.g. Grade 5 to 8
  classId?: string;
  amount: number;
  cadence: 'monthly' | 'annual' | 'one_time';
  isActive: boolean;
}

export interface FeePayment {
  id: string;
  schoolId: string;
  studentId: string;
  receiptNumber: string; // REC-MOG01-2026-001
  academicYear: string;
  month: string; // "March 2026"
  feeType: FeeType;
  feeStructureId?: string;
  idempotencyKey?: string;
  amountDue: number;
  amountPaid: number;
  remainingAmount: number;
  paymentMethod: PaymentMethod;
  status: FeePaymentStatus;
  date: string;
  recordedBy: string;
  notes?: string;
  voidedAt?: string;
  voidedBy?: string;
  voidReason?: string;
  idempotencyKeys?: string[];
}

export interface ReportCardDesign {
  id: string;
  schoolId: string;
  templateId: 'modern' | 'classic' | 'minimal' | 'executive';
  primaryColor: string;
  secondaryColor: string;
  logoPosition: 'left' | 'center' | 'right';
  titleText: string;
  visibleBlocks: {
    rank: boolean;
    teacherRemarks: boolean;
    adminRemarks: boolean;
    percentage: boolean;
    signatures: boolean;
    stamp: boolean;
  };
  signatureTitleLeft: string;
  signatureTitleRight: string;
  stampImageUrl?: string;
  signatureImageUrl?: string;
  ownDesignImageUrl?: string;
  updatedAt: string;
}

export interface SchoolNotice {
  id: string;
  schoolId: string;
  title: string;
  content: string;
  audience: 'all' | 'school' | 'class' | 'teachers' | 'parents' | 'students';
  classId?: string;
  isActive?: boolean;
  isPinned: boolean;
  publishDate: string;
  authorName: string;
  authorRole: string;
}

export interface PlatformBroadcast {
  id: string;
  title: string;
  message: string;
  audience: 'all_schools' | 'school_admins' | 'teachers' | 'one_school';
  targetSchoolId?: string;
  status: 'draft' | 'scheduled' | 'sent';
  scheduledFor?: string;
  sentAt?: string;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  ticketNumber: string; // TIK-1001
  schoolId?: string;
  schoolName?: string;
  createdByUserId: string;
  createdByName: string;
  createdByRole: string;
  subject: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'waiting' | 'resolved' | 'closed';
  messages: {
    id: string;
    senderId: string;
    senderName: string;
    senderRole: string;
    content: string;
    timestamp: string;
  }[];
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  action: string;
  category: 'auth' | 'subscription' | 'school' | 'user' | 'academics' | 'finance' | 'security';
  schoolId?: string;
  schoolName?: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  details: string;
  ipAddress?: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface SuperAdminSettings {
  trialDays: number; // default 7
  graceDays: number; // default 7
  platformCurrency: string; // default "ETB"
  readOnlyAfterExpiry: boolean; // default true
  requireSuperAdmin2FA: boolean; // default false
  lockoutThreshold: number; // default 5 attempts
  lockoutDurationMinutes: number; // default 15 mins
  sessionTimeoutMinutes: number; // default 60 mins
  logSecurityEvents: boolean; // default true
  backupSchedule: 'daily' | 'weekly' | 'manual';
  lastBackupDate?: string;
  lastBackupStatus?: 'success' | 'failed' | 'in_progress';
  enabledLanguages: ('en' | 'so' | 'am')[];
  academicYearName: string; // Same for all schools
  semester1Start: string; // Same for all schools
  semester1End: string;
  semester2Start: string;
  semester2End: string;
}

export interface SubscriptionInvoice {
  id: string;
  invoiceNumber: string; // INV-2026-001
  schoolId: string;
  schoolName: string;
  plan: PlanTier;
  cadence: SubscriptionCadence;
  amount: number;
  currency: string;
  issuedDate: string;
  dueDate: string;
  paidDate?: string;
  status: 'paid' | 'unpaid' | 'overdue';
  receiptNumber?: string;
}

export interface CommunicationSettings {
  id: string;
  schoolId: string;
  provider: 'twilio' | 'infobip' | 'local_gateway' | 'whatsapp_business' | 'none';
  apiKey?: string;
  apiSecret?: string;
  senderId?: string;
  webhookUrl?: string;
  apiKeyConfigured?: boolean;
  apiSecretConfigured?: boolean;
  webhookConfigured?: boolean;
  isActive: boolean;
  updatedAt: string;
}

export interface CommunicationQueueItem {
  id: string;
  schoolId: string;
  recipientPhone: string;
  recipientName: string;
  studentId?: string;
  messageType: 'attendance_absent' | 'fee_due' | 'notice' | 'exam_result' | 'custom';
  channel: 'sms' | 'whatsapp';
  content: string;
  status: 'queued' | 'processing' | 'sent' | 'failed';
  errorMessage?: string;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string;
  lastAttemptAt?: string;
  providerMessageId?: string;
  createdAt: string;
  sentAt?: string;
}

export interface Assignment {
  id: string;
  schoolId: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  title: string;
  description: string;
  dueDate: string;
  maxPoints: number;
  createdAt: string;
}

export interface AssignmentSubmission {
  id: string;
  schoolId?: string;
  assignmentId: string;
  studentId: string;
  studentName: string;
  content: string;
  submittedAt: string;
  status: 'submitted' | 'graded';
  grade?: number;
  feedback?: string;
}

export interface SchoolEvent {
  id: string;
  schoolId: string;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  type: 'holiday' | 'exam' | 'event' | 'meeting';
}

export interface DirectMessage {
  id: string;
  schoolId: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  recipientId: string;
  recipientName: string;
  recipientRole: string;
  content: string;
  timestamp: string;
  isRead: boolean;
}

export interface StaffMember {
  id: string;
  schoolId: string;
  staffId: string;
  userId?: string;
  fullName: string;
  roleTitle: string;
  email: string;
  phone: string;
  permissions: string[];
  monthlySalary: number;
  joinedDate: string;
  status: 'active' | 'inactive';
}

export interface AdmissionApplication {
  id: string;
  schoolId: string;
  firstName: string;
  middleName: string;
  lastName: string;
  gender: 'male' | 'female';
  gradeApplying: string;
  classId: string;
  fatherPhone: string;
  motherPhone: string;
  appliedDate: string;
  status: 'pending' | 'approved' | 'rejected';
  studentId?: string;
}

// Extra modules types (kept for full compatibility)
export interface LibraryBook {
  id: string;
  schoolId: string;
  title: string;
  author: string;
  isbn: string;
  category: string;
  totalCopies: number;
  availableCopies: number;
  shelfLocation: string;
}

export interface BookLoan {
  id: string;
  schoolId: string;
  bookId: string;
  studentId: string;
  issueDate: string;
  dueDate: string;
  returnDate?: string;
  fineAmount: number;
  status: 'borrowed' | 'returned' | 'overdue';
}

export interface TransportRoute {
  id: string;
  schoolId: string;
  routeName: string;
  vehicleNumber: string;
  driverName: string;
  driverPhone: string;
  monthlyFee: number;
  stops: string[];
}

export interface DisciplineRecord {
  id: string;
  schoolId: string;
  studentId: string;
  incidentDate: string;
  infractionType: string;
  description: string;
  severity: 'minor' | 'moderate' | 'severe';
  actionTaken: string;
  reportedBy: string;
  parentNotified: boolean;
}

export interface HealthRecord {
  id: string;
  schoolId: string;
  studentId: string;
  visitDate: string;
  symptoms: string;
  treatment: string;
  allergies?: string;
  privateNotes: string;
  nurseName: string;
}

export interface StaffPayrollRecord {
  id: string;
  schoolId: string;
  teacherId?: string;
  staffId?: string;
  userId: string;
  staffName?: string;
  payrollMonth: string;
  baseSalary: number;
  allowances: number | Array<{ label: string; amount: number }>;
  allowanceTotal: number;
  deductions: number | Array<{ label: string; amount: number }>;
  deductionTotal: number;
  netSalary: number;
  status: 'draft' | 'approved' | 'paid';
  paymentStatus?: 'pending' | 'paid';
  createdBy?: string;
  approvedBy?: string;
  paidBy?: string;
  createdAt?: string;
  approvedAt?: string;
  paidAt?: string;
  paidDate?: string;
}

export interface SchoolExpense {
  id: string;
  schoolId: string;
  category: 'rent' | 'utilities' | 'supplies' | 'transport' | 'salaries' | 'maintenance' | 'other';
  description: string;
  vendor?: string;
  amount: number;
  expenseDate: string;
  paymentMethod: 'cash' | 'bank_transfer' | 'mobile_money' | 'other';
  reference?: string;
  notes?: string;
  status: 'posted' | 'void';
  createdBy: string;
  createdAt: string;
  voidedAt?: string;
  voidedBy?: string;
  voidReason?: string;
}

export interface BankStatementAllocation {
  id: string;
  schoolId: string;
  statementEntryId: string;
  paymentId?: string;
  expenseId?: string;
  amount: number;
  createdBy: string;
  createdAt: string;
  targetLabel?: string;
}

export interface BankStatementEntry {
  id: string;
  schoolId: string;
  statementDate: string;
  description: string;
  reference?: string;
  direction: 'credit' | 'debit';
  amount: number;
  bankAccountLabel?: string;
  matchedPaymentId?: string;
  matchedExpenseId?: string;
  matchedAt?: string;
  allocatedAmount?: number;
  remainingStatementAmount?: number;
  isFullyMatched?: boolean;
  allocations?: BankStatementAllocation[];
  createdBy: string;
  createdAt: string;
}

export interface InventoryItem {
  id: string;
  schoolId: string;
  itemName: string;
  assetTag: string;
  category: string;
  quantity: number;
  roomLocation: string;
  condition: 'good' | 'fair' | 'needs_repair';
  value: number;
}
