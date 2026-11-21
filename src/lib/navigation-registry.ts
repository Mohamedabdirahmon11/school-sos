import {
  LayoutDashboard, Building2, Receipt, Users, BarChart3, Radio, LifeBuoy, Settings,
  GraduationCap, UserCheck, PhoneCall, Layers, BookOpen, CalendarDays, CalendarCheck,
  FileSpreadsheet, FileCheck2, FileText, BellRing, MessageSquare, Wallet, CreditCard,
  UserPlus, ShieldCheck, Award, MessageCircle, Library, Bus, Boxes, AlertTriangle,
  HeartPulse, Sliders
} from 'lucide-react';

export type NavigationRole = 'super_admin' | 'school_admin' | 'accountant' | 'teacher' | 'parent' | 'student';
type NavigationIcon = typeof LayoutDashboard;

const routeDefinitions = [
  ['sa_dashboard', 'Dashboard', LayoutDashboard], ['sa_schools', 'Schools', Building2],
  ['sa_plans', 'Plans & Billing', Receipt], ['sa_users', 'Users', Users],
  ['sa_analytics', 'Analytics', BarChart3], ['sa_broadcasts', 'Broadcasts', Radio],
  ['sa_support', 'Support & Audit', LifeBuoy], ['sa_settings', 'Platform Settings', Settings],
  ['t_dashboard', 'Dashboard', LayoutDashboard], ['t_timetable', 'Timetable', CalendarDays],
  ['t_students', 'Students', GraduationCap], ['t_attendance', 'Attendance', CalendarCheck],
  ['t_grades', 'Exam Marks', FileSpreadsheet], ['t_exam_results', 'Exam Results', FileCheck2],
  ['t_assignments', 'Assignments', FileCheck2], ['t_notices', 'Notices', BellRing],
  ['t_messages', 'Messages', MessageSquare], ['t_payslips', 'Payslips', Wallet],
  ['p_overview', 'Dashboard', LayoutDashboard], ['p_attendance', 'Attendance', CalendarCheck],
  ['p_results', 'Exam Results', FileSpreadsheet], ['p_fees', 'Fees & Payments', CreditCard],
  ['p_notices', 'Notices', BellRing], ['p_messages', 'Messages', MessageSquare],
  ['st_dashboard', 'Dashboard', LayoutDashboard], ['st_timetable', 'Timetable', CalendarDays],
  ['st_assignments', 'Assignments', FileCheck2], ['st_results', 'Exam Results', FileSpreadsheet],
  ['st_attendance', 'Attendance', CalendarCheck], ['st_notices', 'Notices', BellRing],
  ['st_messages', 'Messages', MessageSquare],
  ['acc_dashboard', 'Dashboard', LayoutDashboard], ['acc_expenses', 'Expenses & Cash Book', Wallet],
  ['acc_bank_reconciliation', 'Bank Reconciliation', Building2],
  ['sch_dashboard', 'Dashboard', LayoutDashboard], ['sch_students', 'Students', GraduationCap],
  ['sch_teachers', 'Teachers', UserCheck], ['sch_parents', 'Parents & Contacts', PhoneCall],
  ['sch_admissions', 'Admissions Pipeline', UserPlus], ['sch_staff', 'Staff Roles & Permissions', ShieldCheck],
  ['sch_classes', 'Classes', Layers], ['sch_subjects', 'Subjects', BookOpen],
  ['sch_curriculum', 'Class Curriculum', BookOpen], ['sch_teacher_assignments', 'Teacher Assignments', UserCheck],
  ['sch_timetable', 'Timetable', CalendarDays], ['sch_attendance', 'Attendance', CalendarCheck],
  ['sch_exams', 'Exams & Results', FileSpreadsheet], ['sch_marks', 'Marks Entry', FileSpreadsheet],
  ['sch_marks_approval', 'Marks Approval', ShieldCheck], ['sch_report_cards', 'Report Cards', FileText],
  ['sch_documents', 'School Documents', FileText], ['sch_promotion', 'Student Progression & Alumni', Award],
  ['sch_notices', 'Notices', BellRing], ['sch_messages', 'Messages', MessageSquare],
  ['sch_whatsapp', 'WhatsApp Parent Alerts', MessageCircle], ['sch_events', 'Academic Calendar', CalendarDays],
  ['sch_fees', 'Fees & Payments', CreditCard], ['sch_student_invoices', 'Fee Invoices', FileText],
  ['sch_reports', 'Reports & Analytics', BarChart3], ['sch_payroll', 'Payroll', Wallet],
  ['sch_library', 'Library', Library], ['sch_transport', 'Transport', Bus],
  ['sch_inventory', 'Inventory', Boxes], ['sch_discipline', 'Discipline', AlertTriangle],
  ['sch_health', 'Clinic & Health Records', HeartPulse], ['sch_settings', 'School Settings', Sliders],
  ['sch_support', 'Help Centre', LifeBuoy], ['sch_setup', 'School Setup', Settings],
  ['sch_setup_academics', 'Academic Setup', Settings]
] as const;

function rolesFor(route: string): readonly NavigationRole[] {
  if (route.startsWith('sa_')) return ['super_admin'];
  if (route.startsWith('t_')) return ['teacher'];
  if (route.startsWith('p_')) return ['parent'];
  if (route.startsWith('st_')) return ['student'];
  if (route.startsWith('acc_')) return ['accountant'];
  if (route === 'sch_documents') return ['super_admin', 'school_admin', 'accountant', 'teacher', 'parent', 'student'];
  if (route === 'sch_whatsapp' || route === 'sch_setup' || route === 'sch_setup_academics') return ['school_admin'];
  if (['sch_fees', 'sch_student_invoices', 'sch_reports', 'sch_payroll'].includes(route)) return ['school_admin', 'accountant', 'super_admin'];
  return ['school_admin', 'super_admin'];
}

export const NAVIGATION_REGISTRY = routeDefinitions.map(([route, name, icon]) => ({
  route,
  name,
  icon: icon as NavigationIcon,
  roles: rolesFor(route)
}));

export type NavigationRoute = typeof NAVIGATION_REGISTRY[number];

export function getNavigationRoute(route: string): NavigationRoute | undefined {
  return NAVIGATION_REGISTRY.find(item => item.route === route);
}
