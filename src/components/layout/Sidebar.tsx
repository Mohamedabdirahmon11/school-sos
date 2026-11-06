/**
 * Responsive Sidebar Navigation for SchoolOS
 * Dark green-teal sidebar (~#0B2B2A), teal primary (#0F766E), high density layout
 */

import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { ApiClient } from '../../services/api.ts';
import { useApi } from '../../hooks/useApi.ts';
import {
  LayoutDashboard,
  Building2,
  Receipt,
  Users,
  BarChart3,
  Radio,
  LifeBuoy,
  Settings,
  GraduationCap,
  UserCheck,
  PhoneCall,
  Layers,
  BookOpen,
  CalendarDays,
  CalendarCheck,
  FileSpreadsheet,
  FileCheck2,
  CreditCard,
  BellRing,
  MessageSquare,
  UserPlus,
  ShieldCheck,
  FileText,
  Sliders,
  Library,
  Bus,
  AlertTriangle,
  HeartPulse,
  Award,
  Wallet,
  Boxes,
  Compass
} from 'lucide-react';

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate, isOpenMobile, onCloseMobile }) => {
  const { user, school, t, inspectedSchool } = useAuth();
  const role = user?.role || 'school_admin';
  const unreadNoticesState = useApi(() => ApiClient.getNoticeUnreadCount(), [school?.id, user?.id], Boolean(user && school));
  const unreadNotices = unreadNoticesState.data?.count || 0;
  useEffect(() => {
    if (!user || !school) return;
    const refreshUnread = () => unreadNoticesState.retry();
    const refreshInterval = window.setInterval(refreshUnread, 60_000);
    window.addEventListener('schoolos:notices-read', refreshUnread);
    return () => {
      window.clearInterval(refreshInterval);
      window.removeEventListener('schoolos:notices-read', refreshUnread);
    };
  }, [user?.id, school?.id, unreadNoticesState.retry]);
  const noticeLabel = unreadNotices ? `${t('notice_board')} (${unreadNotices})` : t('notice_board');

  // Navigation Items defined per Role
  const getNavItems = () => {
    if (role === 'super_admin' && !inspectedSchool) {
      return [
        { id: 'sa_dashboard', label: t('dashboard'), icon: LayoutDashboard },
        { id: 'sa_schools', label: t('schools'), icon: Building2 },
        { id: 'sa_plans', label: t('plans_billing'), icon: Receipt },
        { id: 'sa_users', label: t('users'), icon: Users },
        { id: 'sa_analytics', label: t('analytics'), icon: BarChart3 },
        { id: 'sa_broadcasts', label: t('broadcasts'), icon: Radio },
        { id: 'sa_support', label: t('support_audit'), icon: LifeBuoy },
        { id: 'sa_settings', label: t('platform_settings'), icon: Settings }
      ];
    }

    if (role === 'teacher') {
      return [
        { id: 't_dashboard', label: t('dashboard'), icon: LayoutDashboard },
        { id: 't_timetable', label: t('timetable'), icon: CalendarDays },
        { id: 't_attendance', label: t('attendance'), icon: CalendarCheck },
        { id: 't_grades', label: t('exams_results'), icon: FileSpreadsheet },
        { id: 't_assignments', label: t('assignments'), icon: FileCheck2 },
        { id: 't_notices', label: noticeLabel, icon: BellRing },
        { id: 't_messages', label: t('messages'), icon: MessageSquare },
        { id: 't_payslips', label: t('payroll_payslip'), icon: Wallet }
      ];
    }

    if (role === 'parent') {
      return [
        { id: 'p_overview', label: t('dashboard'), icon: LayoutDashboard },
        { id: 'p_attendance', label: t('attendance'), icon: CalendarCheck },
        { id: 'p_results', label: t('exams_results'), icon: FileSpreadsheet },
        { id: 'p_fees', label: t('fees_payments'), icon: CreditCard },
        { id: 'p_notices', label: noticeLabel, icon: BellRing },
        { id: 'p_messages', label: t('messages'), icon: MessageSquare }
      ];
    }

    if (role === 'student') {
      return [
        { id: 'st_dashboard', label: t('dashboard'), icon: LayoutDashboard },
        { id: 'st_timetable', label: t('timetable'), icon: CalendarDays },
        { id: 'st_assignments', label: t('assignments'), icon: FileCheck2 },
        { id: 'st_results', label: t('exams_results'), icon: FileSpreadsheet },
        { id: 'st_attendance', label: t('attendance'), icon: CalendarCheck },
        { id: 'st_notices', label: noticeLabel, icon: BellRing }
        ,{ id: 'st_messages', label: t('messages'), icon: MessageSquare }
      ];
    }

    if (role === 'accountant') {
      return [
        { id: 'acc_dashboard', label: t('dashboard'), icon: LayoutDashboard },
        { id: 'sch_fees', label: t('fees_payments'), icon: CreditCard },
        { id: 'sch_reports', label: t('reports_export'), icon: BarChart3 },
        { id: 'sch_payroll', label: t('payroll_management'), icon: Wallet }
      ];
    }

    // School Admin: grouped by daily workflow, with duplicate destinations removed.
    return [
      { id: 'sch_dashboard', label: 'Dashboard', icon: LayoutDashboard, section: 'OVERVIEW' },
      { id: 'sch_students', label: 'Students', icon: GraduationCap, section: 'PEOPLE & ACADEMICS' },
      { id: 'sch_teachers', label: 'Teachers', icon: UserCheck, section: 'PEOPLE & ACADEMICS' },
      { id: 'sch_parents', label: 'Parents', icon: PhoneCall, section: 'PEOPLE & ACADEMICS' },
      { id: 'sch_classes', label: 'Classes & Subjects', icon: Layers, section: 'PEOPLE & ACADEMICS' },
      { id: 'sch_timetable', label: 'Timetable', icon: CalendarDays, section: 'PEOPLE & ACADEMICS' },
      { id: 'sch_attendance', label: 'Attendance', icon: CalendarCheck, section: 'PEOPLE & ACADEMICS' },
      { id: 'sch_exams', label: 'Exams & Results', icon: FileSpreadsheet, section: 'PEOPLE & ACADEMICS' },
      { id: 'sch_admissions', label: 'Admissions', icon: UserPlus, section: 'PEOPLE & ACADEMICS' },
      { id: 'sch_events', label: 'Events', icon: CalendarDays, section: 'COMMUNICATION' },
      { id: 'sch_notices', label: noticeLabel, icon: BellRing, section: 'COMMUNICATION' },
      { id: 'sch_messages', label: 'Messages', icon: MessageSquare, section: 'COMMUNICATION' },
      { id: 'sch_fees', label: 'Fees & Payments', icon: CreditCard, section: 'MANAGEMENT' },
      { id: 'sch_reports', label: 'Reports', icon: BarChart3, section: 'MANAGEMENT' },
      { id: 'sch_report_cards', label: 'Report Cards', icon: FileText, section: 'MANAGEMENT' },
      { id: 'sch_staff', label: 'Staff & Access', icon: ShieldCheck, section: 'MANAGEMENT' },
      { id: 'sch_settings', label: 'School Settings', icon: Sliders, section: 'MANAGEMENT' },
      { id: 'sch_library', label: 'Library', icon: Library, section: 'OTHER MODULES' },
      { id: 'sch_transport', label: 'Transport', icon: Bus, section: 'OTHER MODULES' },
      { id: 'sch_inventory', label: 'Inventory', icon: Boxes, section: 'OTHER MODULES' },
      { id: 'sch_discipline', label: 'Discipline', icon: AlertTriangle, section: 'OTHER MODULES' },
      { id: 'sch_health', label: 'Health', icon: HeartPulse, section: 'OTHER MODULES' },
      { id: 'sch_support', label: 'Help & Support', icon: LifeBuoy, section: 'OTHER MODULES' }
    ];
  };

  const navItems = getNavItems();

  const handleItemClick = (id: string) => {
    onNavigate(id);
    if (onCloseMobile) onCloseMobile();
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpenMobile && (
        <div 
          onClick={onCloseMobile}
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
        />
      )}

      <aside className={`
        fixed md:static inset-y-0 left-0 z-40
        w-[250px] h-[100dvh] bg-[#0B2B2A] text-white flex flex-col shrink-0 md:sticky md:top-0 md:self-start
        transition-transform duration-200 ease-in-out
        ${isOpenMobile ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* Brand / Tenant Header */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-[#143D3B] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#15998F] to-[#0F766E] flex items-center justify-center font-bold text-base tracking-wider shrink-0 text-white shadow-lg shadow-black/20 ring-1 ring-white/10">
              S
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold tracking-tight text-white truncate">
                {school ? school.name : 'SchoolOS Cloud'}
              </h1>
              <p className="text-[10px] text-[#A0BCBA] uppercase font-mono tracking-wider truncate">
                {school ? `Code: ${school.code}` : 'Multi-School SaaS'}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Links (Scrollable with custom sleek scrollbar) */}
        <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2.5 py-3 space-y-1">
          {navItems.map((item, index) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            const section = (item as typeof item & { section?: string }).section;
            const previousSection = index > 0
              ? (navItems[index - 1] as typeof navItems[number] & { section?: string }).section
              : undefined;

            return (
              <React.Fragment key={item.id}>
              {section && section !== previousSection && (
                <p className="px-3 pt-4 pb-1 text-[9px] font-bold tracking-[0.16em] text-[#73918D]">
                  {section}
                </p>
              )}
              <button
                onClick={() => handleItemClick(item.id)}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[12px] font-semibold
                  transition-colors whitespace-nowrap text-left
                  ${isActive
                    ? 'bg-[#0F766E] text-white shadow-sm'
                    : 'text-[#CBD5E1] hover:bg-[#143D3B] hover:text-white'
                  }
                `}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-[#A0BCBA]'}`} />
                <span className="truncate">{item.label}</span>
              </button>
              </React.Fragment>
            );
          })}
        </nav>

        {/* Footer Role Banner */}
        <div className="p-3 border-t border-[#143D3B] bg-[#08201F] text-[11px] text-[#A0BCBA] flex items-center justify-between">
          <div className="flex items-center gap-1.5 truncate">
            <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
            <span className="capitalize truncate font-medium text-white">{role.replace('_', ' ')}</span>
          </div>
          <span className="font-mono text-[10px] text-[#64748B]">v2.6.0</span>
        </div>
      </aside>
    </>
  );
};
