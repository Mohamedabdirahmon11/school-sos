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

    // Default: School Admin (Full Suite)
    return [
      { id: 'sch_dashboard', label: t('dashboard'), icon: LayoutDashboard },
      { id: 'sch_students', label: t('students'), icon: GraduationCap },
      { id: 'sch_teachers', label: t('teachers'), icon: UserCheck },
      { id: 'sch_parents', label: t('parents_contacts'), icon: PhoneCall },
      { id: 'sch_classes', label: t('classes'), icon: Layers },
      { id: 'sch_subjects', label: t('subjects'), icon: BookOpen },
      { id: 'sch_timetable', label: t('timetable'), icon: CalendarDays },
      { id: 'sch_attendance', label: t('attendance'), icon: CalendarCheck },
      { id: 'sch_exams', label: t('exams_results'), icon: FileSpreadsheet },
      { id: 'sch_assignments', label: t('assignments'), icon: FileCheck2 },
      { id: 'sch_promotion', label: 'Promotion & Alumni', icon: Award },
      { id: 'sch_events', label: t('events_holidays'), icon: CalendarDays },
      { id: 'sch_notices', label: noticeLabel, icon: BellRing },
      { id: 'sch_messages', label: t('messages'), icon: MessageSquare },
      { id: 'sch_admissions', label: t('admissions'), icon: UserPlus },
      { id: 'sch_staff', label: t('staff_access'), icon: ShieldCheck },
      { id: 'sch_reports', label: t('reports_export'), icon: BarChart3 },
      { id: 'sch_report_cards', label: t('report_cards'), icon: FileText },
      { id: 'sch_settings', label: t('school_settings'), icon: Sliders },
      // Extra Modules
      { id: 'sch_library', label: t('library'), icon: Library },
      { id: 'sch_transport', label: t('transport'), icon: Bus },
      { id: 'sch_discipline', label: t('discipline'), icon: AlertTriangle },
      { id: 'sch_health', label: t('health_nurse'), icon: HeartPulse },
      { id: 'sch_certificates', label: t('certificates_id'), icon: Award },
      { id: 'sch_inventory', label: t('inventory'), icon: Boxes },
      { id: 'sch_support', label: t('support_audit'), icon: LifeBuoy }
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
        w-64 bg-[#0B2B2A] text-white flex flex-col shrink-0
        transition-transform duration-200 ease-in-out
        ${isOpenMobile ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* Brand / Tenant Header */}
        <div className="h-14 px-4 flex items-center justify-between border-b border-[#143D3B] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#0F766E] flex items-center justify-center font-bold text-base tracking-wider shrink-0 text-white shadow-sm">
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
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = currentView === item.id;

            return (
              <button
                key={item.id}
                onClick={() => handleItemClick(item.id)}
                className={`
                  w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium
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
