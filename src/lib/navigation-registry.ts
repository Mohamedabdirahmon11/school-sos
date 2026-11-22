import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Building2, Receipt, Users, BarChart3, Radio, LifeBuoy,
  Settings, GraduationCap, CalendarDays, CalendarCheck, FileSpreadsheet,
  FileCheck2, CreditCard, BellRing, MessageSquare, UserPlus, ShieldCheck,
  FileText, Sliders, Library, Bus, AlertTriangle, HeartPulse, Award, Wallet,
  Layers, BookOpen, UserCheck, PhoneCall, MessageCircle, Boxes
} from 'lucide-react';

export type SchoolOSRole = 'super_admin' | 'school_admin' | 'accountant' | 'teacher' | 'parent' | 'student';
export interface NavigationRoute {
  id: string;
  label: string;
  labelKey?: string;
  icon: LucideIcon;
  roles: readonly SchoolOSRole[];
  group: string;
  mobile?: readonly SchoolOSRole[];
  permission?: 'fees_manage' | 'payroll_manage' | 'reports_export';
}

const platform: readonly SchoolOSRole[] = ['super_admin'];
const school: readonly SchoolOSRole[] = ['school_admin', 'super_admin'];
const schoolAndFormTeacher: readonly SchoolOSRole[] = ['school_admin', 'super_admin', 'teacher'];
const accountant: readonly SchoolOSRole[] = ['accountant'];
const teacher: readonly SchoolOSRole[] = ['teacher'];
const parent: readonly SchoolOSRole[] = ['parent'];
const student: readonly SchoolOSRole[] = ['student'];
const family: readonly SchoolOSRole[] = ['teacher', 'parent', 'student', 'school_admin', 'accountant', 'super_admin'];

export const NAVIGATION_REGISTRY: readonly NavigationRoute[] = [
  { id: 'sa_dashboard', label: 'Dashboard', labelKey: 'dashboard', icon: LayoutDashboard, roles: platform, group: 'Platform Management', mobile: platform },
  { id: 'sa_schools', label: 'Schools', labelKey: 'schools', icon: Building2, roles: platform, group: 'Platform Management', mobile: platform },
  { id: 'sa_plans', label: 'Plans & Billing', labelKey: 'plans_billing', icon: Receipt, roles: platform, group: 'Platform Management' },
  { id: 'sa_users', label: 'Users', labelKey: 'users', icon: Users, roles: platform, group: 'Platform Management', mobile: platform },
  { id: 'sa_analytics', label: 'Analytics', labelKey: 'analytics', icon: BarChart3, roles: platform, group: 'Platform Management' },
  { id: 'sa_broadcasts', label: 'Broadcasts', labelKey: 'broadcasts', icon: Radio, roles: platform, group: 'Platform Management' },
  { id: 'sa_support', label: 'Support & Audit', labelKey: 'support_audit', icon: LifeBuoy, roles: platform, group: 'Platform Management' },
  { id: 'sa_settings', label: 'Platform Settings', labelKey: 'platform_settings', icon: Settings, roles: platform, group: 'Platform Management', mobile: platform },

  { id: 'sch_setup', label: 'School Setup', icon: Settings, roles: school, group: 'Setup' },
  { id: 'sch_setup_academics', label: 'Academic Setup', icon: BookOpen, roles: school, group: 'Setup' },
  { id: 'sch_dashboard', label: 'Dashboard', labelKey: 'dashboard', icon: LayoutDashboard, roles: school, group: 'Overview', mobile: ['school_admin'] },
  { id: 'sch_students', label: 'Students', labelKey: 'students', icon: GraduationCap, roles: school, group: 'People', mobile: ['school_admin'] },
  { id: 'sch_teachers', label: 'Teachers', labelKey: 'teachers', icon: UserCheck, roles: school, group: 'People' },
  { id: 'sch_parents', label: 'Parents & Contacts', labelKey: 'parents_contacts', icon: PhoneCall, roles: schoolAndFormTeacher, group: 'People', mobile: ['school_admin', 'teacher'] },
  { id: 'sch_admissions', label: 'Admissions Pipeline', icon: UserPlus, roles: school, group: 'People' },
  { id: 'sch_staff', label: 'Staff Roles & Permissions', icon: ShieldCheck, roles: school, group: 'People' },
  { id: 'sch_classes', label: 'Classes', labelKey: 'classes', icon: Layers, roles: school, group: 'Academic', mobile: ['school_admin'] },
  { id: 'sch_subjects', label: 'Subjects', labelKey: 'subjects', icon: BookOpen, roles: school, group: 'Academic' },
  { id: 'sch_curriculum', label: 'Class Curriculum', icon: BookOpen, roles: school, group: 'Academic' },
  { id: 'sch_teacher_assignments', label: 'Teacher Assignments', icon: UserCheck, roles: school, group: 'Academic' },
  { id: 'sch_timetable', label: 'Timetable', labelKey: 'timetable', icon: CalendarDays, roles: school, group: 'Academic' },
  { id: 'sch_attendance', label: 'Attendance', labelKey: 'attendance', icon: CalendarCheck, roles: school, group: 'Academic', mobile: ['school_admin'] },
  { id: 'sch_exams', label: 'Exams', labelKey: 'exams_results', icon: FileSpreadsheet, roles: school, group: 'Academic' },
  { id: 'sch_marks', label: 'Marks Entry', icon: FileSpreadsheet, roles: school, group: 'Academic' },
  { id: 'sch_marks_approval', label: 'Marks Approval', icon: ShieldCheck, roles: school, group: 'Academic' },
  { id: 'sch_report_cards', label: 'Report Cards', labelKey: 'report_cards', icon: FileText, roles: school, group: 'Academic' },
  { id: 'sch_documents', label: 'School Documents', icon: FileText, roles: family, group: 'Academic' },
  { id: 'sch_promotion', label: 'Student Progression & Alumni', icon: Award, roles: school, group: 'Academic' },
  { id: 'sch_notices', label: 'Notices', labelKey: 'notice_board', icon: BellRing, roles: school, group: 'Communication' },
  { id: 'sch_messages', label: 'Messages', labelKey: 'messages', icon: MessageSquare, roles: school, group: 'Communication' },
  { id: 'sch_whatsapp', label: 'WhatsApp Parent Alerts', icon: MessageCircle, roles: ['school_admin'], group: 'Communication' },
  { id: 'sch_events', label: 'Academic Calendar', icon: CalendarDays, roles: school, group: 'Communication' },
  { id: 'sch_fees', label: 'Fees & Payments', labelKey: 'fees_payments', icon: CreditCard, roles: ['school_admin', 'super_admin', 'accountant'], group: 'Finance', mobile: accountant, permission: 'fees_manage' },
  { id: 'sch_student_invoices', label: 'Fee Invoices', icon: FileText, roles: ['school_admin', 'super_admin', 'accountant'], group: 'Finance', permission: 'fees_manage' },
  { id: 'sch_reports', label: 'Reports', labelKey: 'reports_export', icon: BarChart3, roles: ['school_admin', 'super_admin', 'accountant'], group: 'Reports', permission: 'reports_export' },
  { id: 'sch_library', label: 'Library', labelKey: 'library', icon: Library, roles: school, group: 'Resources' },
  { id: 'sch_transport', label: 'Transport', labelKey: 'transport', icon: Bus, roles: school, group: 'Resources' },
  { id: 'sch_inventory', label: 'Inventory', labelKey: 'inventory', icon: Boxes, roles: school, group: 'Resources' },
  { id: 'sch_discipline', label: 'Discipline', labelKey: 'discipline', icon: AlertTriangle, roles: school, group: 'Resources' },
  { id: 'sch_health', label: 'Clinic & Health Records', icon: HeartPulse, roles: school, group: 'Resources' },
  { id: 'sch_settings', label: 'School Settings', icon: Sliders, roles: school, group: 'Settings' },
  { id: 'sch_support', label: 'Help Centre', icon: LifeBuoy, roles: school, group: 'Settings' },
  { id: 'sch_payroll', label: 'Payroll', labelKey: 'payroll_management', icon: Wallet, roles: accountant, group: 'Finance', permission: 'payroll_manage' },

  { id: 'acc_dashboard', label: 'Dashboard', labelKey: 'dashboard', icon: LayoutDashboard, roles: accountant, group: 'Finance Workspace', mobile: accountant },
  { id: 'acc_expenses', label: 'Expenses', icon: Wallet, roles: accountant, group: 'Daily Operations', mobile: accountant, permission: 'fees_manage' },
  { id: 'acc_bank_reconciliation', label: 'Bank Reconciliation', icon: Building2, roles: accountant, group: 'Daily Operations', permission: 'fees_manage' },
  { id: 't_dashboard', label: 'Dashboard', labelKey: 'dashboard', icon: LayoutDashboard, roles: teacher, group: 'Teaching & Learning', mobile: teacher },
  { id: 't_timetable', label: 'Timetable', labelKey: 'timetable', icon: CalendarDays, roles: teacher, group: 'Teaching & Learning', mobile: teacher },
  { id: 't_students', label: 'Students', labelKey: 'students', icon: GraduationCap, roles: teacher, group: 'Teaching & Learning' },
  { id: 't_attendance', label: 'Attendance', labelKey: 'attendance', icon: CalendarCheck, roles: teacher, group: 'Teaching & Learning', mobile: teacher },
  { id: 't_grades', label: 'Exam Marks', icon: FileSpreadsheet, roles: teacher, group: 'Teaching & Learning', mobile: teacher },
  { id: 't_profile', label: 'My Profile', icon: Users, roles: teacher, group: 'Teaching & Learning' },
  { id: 't_assignments', label: 'Assignments', labelKey: 'assignments', icon: FileCheck2, roles: teacher, group: 'Teaching & Learning' },
  { id: 't_notices', label: 'Notices', labelKey: 'notice_board', icon: BellRing, roles: teacher, group: 'Teaching & Learning' },
  { id: 't_messages', label: 'Messages', labelKey: 'messages', icon: MessageSquare, roles: teacher, group: 'Teaching & Learning' },
  { id: 't_payslips', label: 'Payslips', labelKey: 'payroll_payslip', icon: Wallet, roles: teacher, group: 'Teaching & Learning' },
  { id: 'p_overview', label: 'Dashboard', labelKey: 'dashboard', icon: LayoutDashboard, roles: parent, group: 'Parent Portal', mobile: parent },
  { id: 'p_attendance', label: 'Attendance', labelKey: 'attendance', icon: CalendarCheck, roles: parent, group: 'Parent Portal', mobile: parent },
  { id: 'p_results', label: 'Results', labelKey: 'exams_results', icon: FileSpreadsheet, roles: parent, group: 'Parent Portal' },
  { id: 'p_fees', label: 'Fees & Payments', labelKey: 'fees_payments', icon: CreditCard, roles: parent, group: 'Parent Portal', mobile: parent },
  { id: 'p_notices', label: 'Notices', labelKey: 'notice_board', icon: BellRing, roles: parent, group: 'Parent Portal' },
  { id: 'p_messages', label: 'Messages', labelKey: 'messages', icon: MessageSquare, roles: parent, group: 'Parent Portal' },
  { id: 'st_dashboard', label: 'Dashboard', labelKey: 'dashboard', icon: LayoutDashboard, roles: student, group: 'Student Portal', mobile: student },
  { id: 'st_timetable', label: 'Timetable', labelKey: 'timetable', icon: CalendarDays, roles: student, group: 'Student Portal', mobile: student },
  { id: 'st_assignments', label: 'Assignments', labelKey: 'assignments', icon: FileCheck2, roles: student, group: 'Student Portal' },
  { id: 'st_results', label: 'Results', labelKey: 'exams_results', icon: FileSpreadsheet, roles: student, group: 'Student Portal', mobile: student },
  { id: 'st_attendance', label: 'Attendance', labelKey: 'attendance', icon: CalendarCheck, roles: student, group: 'Student Portal' },
  { id: 'st_notices', label: 'Notices', labelKey: 'notice_board', icon: BellRing, roles: student, group: 'Student Portal' },
  { id: 'st_messages', label: 'Messages', labelKey: 'messages', icon: MessageSquare, roles: student, group: 'Student Portal' },
  { id: 'st_profile', label: 'Profile', icon: UserRound, roles: student, group: 'Student Portal' }
] as const;

export const NAVIGATION_BY_ID: Readonly<Record<string, NavigationRoute>> = Object.freeze(
  Object.fromEntries(NAVIGATION_REGISTRY.map(route => [route.id, route]))
);

export function getNavigationRoute(id: string): NavigationRoute | undefined {
  return NAVIGATION_BY_ID[id];
}

export function getMobileNavigation(role: SchoolOSRole): readonly NavigationRoute[] {
  return NAVIGATION_REGISTRY.filter(route => route.mobile?.includes(role) && route.roles.includes(role));
}
