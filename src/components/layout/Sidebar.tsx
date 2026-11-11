import React, { useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { ApiClient } from '../../services/api.ts';
import { useApi } from '../../hooks/useApi.ts';
import { hasStaffNavigationPermission } from '../../lib/staff-permissions.ts';
import {
  LayoutDashboard, Building2, Receipt, Users, BarChart3, Radio, LifeBuoy,
  Settings, GraduationCap, UserCheck, PhoneCall, Layers, BookOpen, CalendarDays,
  CalendarCheck, FileSpreadsheet, FileCheck2, CreditCard, BellRing, MessageSquare,
  UserPlus, ShieldCheck, FileText, Sliders, Library, Bus, AlertTriangle,
  HeartPulse, Award, Wallet, Boxes, ChevronRight, MessageCircle
} from 'lucide-react';

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

type NavItem = { id: string; label: string; icon: React.ComponentType<{ className?: string }>; permission?: 'fees_manage' | 'payroll_manage' | 'reports_export' };
type NavGroup = { title: string; items: NavItem[] };

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate, isOpenMobile, onCloseMobile }) => {
  const { user, school, t, inspectedSchool } = useAuth();
  const role = user?.role || 'school_admin';
  const unreadState = useApi(() => ApiClient.getNoticeUnreadCount(), [school?.id, user?.id], Boolean(user && school));
  const unread = unreadState.data?.count || 0;

  useEffect(() => {
    if (!user || !school) return;
    const refresh = () => unreadState.retry();
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('schoolos:notices-read', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('schoolos:notices-read', refresh);
    };
  }, [user?.id, school?.id, unreadState.retry]);

  const noticeLabel = unread ? `${t('notice_board')} · ${unread > 99 ? '99+' : unread}` : t('notice_board');
  const item = (id: string, label: string, icon: NavItem['icon']): NavItem => ({ id, label, icon });
  const groups: NavGroup[] = (() => {
    if (role === 'super_admin' && !inspectedSchool) return [{ title: 'Platform', items: [
      item('sa_dashboard', t('dashboard'), LayoutDashboard), item('sa_schools', t('schools'), Building2),
      item('sa_plans', t('plans_billing'), Receipt), item('sa_users', t('users'), Users),
      item('sa_analytics', t('analytics'), BarChart3), item('sa_broadcasts', t('broadcasts'), Radio),
      item('sa_support', t('support_audit'), LifeBuoy), item('sa_settings', t('platform_settings'), Settings)
    ] }];
    if (role === 'teacher') return [{ title: 'Teaching', items: [
      item('t_dashboard', t('dashboard'), LayoutDashboard), item('t_timetable', t('timetable'), CalendarDays),
      item('t_students', t('students'), GraduationCap), item('t_attendance', t('attendance'), CalendarCheck),
      item('t_grades', 'Exam Marks', FileSpreadsheet), item('t_exam_results', 'Exam Results', FileCheck2),
      item('t_assignments', t('assignments'), FileCheck2), item('t_notices', noticeLabel, BellRing),
      item('t_messages', t('messages'), MessageSquare), item('t_payslips', t('payroll_payslip'), Wallet)
    ] }];
    if (role === 'parent') return [{ title: 'Family', items: [
      item('p_overview', t('dashboard'), LayoutDashboard), item('p_attendance', t('attendance'), CalendarCheck),
      item('p_results', t('exams_results'), FileSpreadsheet), item('p_fees', t('fees_payments'), CreditCard),
      item('p_notices', noticeLabel, BellRing), item('p_messages', t('messages'), MessageSquare)
    ] }];
    if (role === 'student') return [{ title: 'My learning', items: [
      item('st_dashboard', t('dashboard'), LayoutDashboard), item('st_timetable', t('timetable'), CalendarDays),
      item('st_assignments', t('assignments'), FileCheck2), item('st_results', t('exams_results'), FileSpreadsheet),
      item('st_attendance', t('attendance'), CalendarCheck), item('st_notices', noticeLabel, BellRing),
      item('st_messages', t('messages'), MessageSquare)
    ] }];
    if (role === 'accountant') return [
      { title: 'Workspace', items: [item('acc_dashboard', t('dashboard'), LayoutDashboard)] },
      { title: 'Daily operations', items: [
        { ...item('sch_fees', t('fees_payments'), CreditCard), permission: 'fees_manage' },
        { ...item('acc_expenses', 'Expenses & cashbook', Wallet), permission: 'fees_manage' },
        { ...item('acc_bank_reconciliation', 'Bank reconciliation', Building2), permission: 'fees_manage' }
      ] },
      { title: 'Financial management', items: [
        { ...item('sch_reports', t('reports_export'), BarChart3), permission: 'reports_export' },
        { ...item('sch_payroll', t('payroll_management'), Wallet), permission: 'payroll_manage' }
      ] }
    ];

    return [
      { title: 'Dashboard', items: [item('sch_dashboard', t('dashboard'), LayoutDashboard)] },
      { title: 'People', items: [
        item('sch_students', t('students'), GraduationCap), item('sch_teachers', t('teachers'), UserCheck),
        item('sch_parents', t('parents_contacts'), PhoneCall), item('sch_admissions', t('admissions'), UserPlus),
        item('sch_staff', t('staff_access'), ShieldCheck)
      ] },
      { title: 'Academics', items: [
        item('sch_classes', t('classes'), Layers), item('sch_subjects', t('subjects'), BookOpen),
        item('sch_timetable', t('timetable'), CalendarDays), item('sch_attendance', t('attendance'), CalendarCheck),
        item('sch_exams', t('exams_results'), FileSpreadsheet), item('sch_report_cards', t('report_cards'), FileText),
        item('sch_promotion', 'Promotion & Alumni', Award)
      ] },
      { title: 'Communication', items: [
        item('sch_notices', noticeLabel, BellRing), item('sch_messages', t('messages'), MessageSquare),
        item('sch_whatsapp', 'WhatsApp parent reminders', MessageCircle),
        item('sch_events', t('events_holidays'), CalendarDays)
      ] },
      { title: 'Reports', items: [
        item('sch_reports', t('reports_export'), BarChart3)
      ] },
      { title: 'Resources', items: [
        item('sch_library', t('library'), Library), item('sch_transport', t('transport'), Bus),
        item('sch_inventory', t('inventory'), Boxes), item('sch_discipline', t('discipline'), AlertTriangle),
        item('sch_health', t('health_nurse'), HeartPulse)
      ] },
      { title: 'Settings', items: [
        item('sch_settings', 'School Settings', Sliders), item('sch_support', 'Help & Support', LifeBuoy)
      ] }
    ];
  })();

  const handleNavigate = (id: string) => {
    onNavigate(id);
    onCloseMobile?.();
  };

  return <>
    {isOpenMobile && <button aria-label="Close navigation" onClick={onCloseMobile} className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-[2px] md:hidden" />}
    <aside className={`fixed inset-y-0 left-0 z-50 flex h-[100dvh] w-[276px] shrink-0 flex-col border-r border-white/10 bg-[#102c2a] text-white shadow-2xl transition-transform duration-300 ease-out md:sticky md:top-0 md:z-30 md:translate-x-0 md:shadow-none ${isOpenMobile ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex h-[82px] shrink-0 items-center gap-3 border-b border-white/10 px-5">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-600 text-lg font-black text-white shadow-lg shadow-teal-950/40">S</div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-bold tracking-tight">{role === 'super_admin' && !inspectedSchool ? 'SchoolOS' : school?.name || 'SchoolOS Cloud'}</div>
          <div className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-[.16em] text-teal-200/70">{role === 'super_admin' && !inspectedSchool ? 'Platform workspace' : school ? `School code · ${school.code}` : 'School workspace'}</div>
        </div>
        <button onClick={onCloseMobile} aria-label="Close menu" className="rounded-lg p-2 text-teal-100/70 hover:bg-white/10 md:hidden"><ChevronRight size={18}/></button>
      </div>

      <nav aria-label="Main navigation" className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-3 py-5 [scrollbar-color:rgba(153,246,228,.28)_transparent] [scrollbar-width:thin]">
        {groups.map(group => <section key={group.title}>
          <h2 className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[.17em] text-teal-100/50">{group.title}</h2>
          <div className="space-y-1">
            {group.items.filter(entry => role !== 'accountant' || !entry.permission || hasStaffNavigationPermission(user?.permissions, entry.permission)).map(entry => {
              const Icon = entry.icon;
              const active = currentView === entry.id;
              return <button key={entry.id} type="button" aria-current={active ? 'page' : undefined} onClick={() => handleNavigate(entry.id)}
                className={`group flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[13px] font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 ${active ? 'bg-teal-500 text-white shadow-lg shadow-teal-950/25 ring-1 ring-white/10' : 'text-slate-300 hover:bg-white/[.075] hover:text-white'}`}>
                <Icon className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-white' : 'text-teal-100/65 group-hover:text-teal-100'}`}/>
                <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                {active && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white"/>}
              </button>;
            })}
          </div>
        </section>)}
      </nav>

      <div className="shrink-0 border-t border-white/10 bg-black/10 px-4 py-4">
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,.12)]"/>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold capitalize text-white">{role.replace(/_/g, ' ')}</p>
            <p className="truncate text-[10px] text-teal-100/45">{user?.fullName || 'Signed in'}</p>
          </div>
          <span className="text-[10px] font-medium tracking-wide text-teal-100/35">v2.6</span>
        </div>
      </div>
    </aside>
  </>;
};
