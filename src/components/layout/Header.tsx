/**
 * Top Bar Header conforming to the 3-Zone contract and anti-slop guidelines
 */

import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { ApiClient } from '../../services/api.ts';
import { useApi } from '../../hooks/useApi.ts';
import { LanguageCode } from '../../lib/translations.ts';
import { Globe, Bell, LogOut, ShieldAlert, KeyRound, ChevronDown, Check, User as UserIcon } from 'lucide-react';
import { ProfileModal } from '../common/ProfileModal.tsx';

interface HeaderProps {
  currentView: string;
  onNavigate: (view: string) => void;
  onOpenChangePassword?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ currentView, onNavigate, onOpenChangePassword }) => {
  const { user, school, inspectedSchool, viewAsSchool, language, setLanguage, t, logout, isReadOnly } = useAuth();
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const subscriptionStatus = school?.subscription?.status;
  const noticesState = useApi(() => ApiClient.getNotices({ pageSize: 8 }), [school?.id, user?.id], Boolean(school && user));
  const unreadNoticesState = useApi(() => ApiClient.getNoticeUnreadCount(), [school?.id, user?.id], Boolean(school && user));
  const notices = Array.isArray(noticesState.data) ? noticesState.data : [];
  const unreadNoticeCount = unreadNoticesState.data?.count || 0;
  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const onNoticesRead = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => unreadNoticesState.retry(), 100);
    };
    window.addEventListener('schoolos:notices-read', onNoticesRead);
    return () => {
      window.removeEventListener('schoolos:notices-read', onNoticesRead);
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [unreadNoticesState.retry]);
  const markAllNoticesRead = async () => {
    await ApiClient.markNoticesRead(notices.map(notice => notice.id));
    noticesState.retry();
  };

  const formatBreadcrumb = () => {
    const roleLabel = user ? t(user.role as any) : '';
    const labels: Record<string, string> = {
      sa_dashboard: t('dashboard'), sa_schools: t('schools'), sa_plans: t('plans_billing'),
      sa_users: t('users'), sa_analytics: t('analytics'), sa_broadcasts: t('broadcasts'),
      sa_support: t('support_audit'), sa_settings: t('platform_settings'),
      sch_dashboard: t('dashboard'), sch_students: t('students'), sch_teachers: t('teachers'),
      sch_parents: t('parents_contacts'), sch_classes: `${t('classes')} & ${t('subjects')}`,
      sch_subjects: `${t('classes')} & ${t('subjects')}`, sch_timetable: t('timetable'),
      sch_attendance: t('attendance'), sch_exams: t('exams_results'), sch_fees: t('fees_payments'),
      sch_promotion: 'Year-end Promotion', sch_events: t('events_holidays'),
      sch_notices: t('notice_board'), sch_messages: t('messages'), sch_staff: t('staff_access'),
      sch_reports: t('reports_export'), sch_report_cards: t('report_cards'),
      sch_admissions: t('admissions'), sch_settings: t('school_settings'),
      sch_library: t('library'), sch_transport: t('transport'), sch_inventory: t('inventory'),
      sch_discipline: t('discipline'), sch_health: t('health_nurse'), sch_support: t('help_support'),
      acc_dashboard: t('dashboard'), sch_payroll: t('payroll_management'),
      t_dashboard: t('dashboard'), t_timetable: t('timetable'), t_attendance: t('attendance'),
      t_grades: t('exams_results'), t_assignments: t('assignments'), t_notices: t('notice_board'),
      t_messages: t('messages'), t_payslips: t('payroll_payslip'),
      p_overview: t('dashboard'), p_attendance: t('attendance'), p_results: t('exams_results'),
      p_fees: t('fees_payments'), p_notices: t('notice_board'), p_messages: t('messages'),
      st_dashboard: t('dashboard'), st_timetable: t('timetable'), st_assignments: t('assignments'),
      st_results: t('exams_results'), st_attendance: t('attendance'), st_notices: t('notice_board'),
      st_messages: t('messages')
    };
    const section = labels[currentView] || currentView.replace(/_/g, ' ').replace(/\\b\\w/g, l => l.toUpperCase());
    return `${roleLabel} / ${section}`;
  };

  const languages: { code: LanguageCode; label: string; flag: string }[] = [
    { code: 'en', label: 'English', flag: '🇬🇧' },
    { code: 'so', label: 'Af-Soomaali', flag: '🇸🇴' },
    { code: 'am', label: 'አማርኛ (Amharic)', flag: '🇪🇹' }
  ];

  return (
    <header className="h-14 bg-white border-b border-[#E2E8F0] px-4 md:px-6 flex items-center justify-between gap-4 shrink-0 z-20">
      {/* Zone 1: Contextual Breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-sm font-semibold text-[#132A29] truncate">
          {formatBreadcrumb()}
        </span>
        {inspectedSchool && (
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-[#0F766E] bg-[#F0FDFA] px-2.5 py-0.5 rounded border border-[#CCFBF1]">
            <span>Viewing: <strong>{inspectedSchool.name}</strong></span>
            <button 
              onClick={() => viewAsSchool(null)} 
              className="text-[#0F766E] hover:underline font-medium ml-1"
            >
              (Exit)
            </button>
          </div>
        )}
      </div>

      {/* Zone 2: System Status & Alerts */}
      <div className="hidden lg:flex items-center gap-4 text-xs text-[#64748B]">
        {school && (
          <div className="flex items-center gap-2">
            <span>{school.name}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">{school.code}</span>
            <span aria-hidden="true">·</span>
            <span className={
              subscriptionStatus === 'active' ? 'text-emerald-700 font-medium' :
              subscriptionStatus === 'grace' ? 'text-amber-700 font-medium' :
              subscriptionStatus === 'read_only' ? 'text-red-700 font-medium' :
              'text-slate-600 font-medium'
            }>
              {subscriptionStatus ? t(subscriptionStatus as any) : 'Subscription unavailable'}
            </span>
          </div>
        )}
      </div>

      {/* Zone 3: Actions, Language Switcher, Notifications, Profile */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Language Selector */}
        <div className="relative">
          <button
            onClick={() => setShowLangMenu(!showLangMenu)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#1E293B] hover:bg-[#F1F5F9] rounded-md transition-colors"
            title="Switch Language"
          >
            <Globe className="w-3.5 h-3.5 text-[#0F766E]" />
            <span className="uppercase font-mono">{language}</span>
            <ChevronDown className="w-3 h-3 text-[#64748B]" />
          </button>

          {showLangMenu && (
            <div className="absolute right-0 mt-1 w-44 bg-white rounded-lg shadow-lg border border-[#E2E8F0] py-1 z-50 text-xs">
              {languages.map(l => (
                <button
                  key={l.code}
                  onClick={() => {
                    setLanguage(l.code);
                    setShowLangMenu(false);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-[#F8FAFC] text-[#1E293B]"
                >
                  <span className="flex items-center gap-2">
                    <span>{l.flag}</span>
                    <span>{l.label}</span>
                  </span>
                  {language === l.code && <Check className="w-3.5 h-3.5 text-[#0F766E]" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-1.5 text-[#64748B] hover:text-[#132A29] hover:bg-[#F1F5F9] rounded-md transition-colors"
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadNoticeCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-[#0F766E] text-white text-[10px] font-bold leading-4 text-center rounded-full">
                {unreadNoticeCount > 9 ? '9+' : unreadNoticeCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-1 w-72 sm:w-80 bg-white rounded-lg shadow-lg border border-[#E2E8F0] p-3 z-50 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-[#F1F5F9] mb-2 font-semibold text-[#132A29]">
                <span>Notifications</span>
                {unreadNoticeCount > 0 && (
                  <button onClick={markAllNoticesRead} className="text-[11px] font-normal text-[#0F766E] hover:underline">
                    Mark all read
                  </button>
                )}
              </div>
              <div className="space-y-2 text-[#475569] max-h-72 overflow-y-auto">
                {noticesState.loading || unreadNoticesState.loading ? <div className="h-16 animate-pulse rounded bg-slate-100" /> : noticesState.error ? <p className="text-[11px] text-rose-700">Unable to load notices.</p> : notices.length === 0 ? <p className="text-[11px] text-[#64748B]">No school notices have been published yet.</p> : notices.map(notice => <div key={notice.id} className="p-2 bg-[#F8FAFC] rounded border border-[#E2E8F0]">
                  <p className="font-medium text-[#132A29]">{notice.title}</p>
                  <p className="text-[11px] text-[#64748B] mt-0.5 line-clamp-2">{notice.content}</p>
                  <p className="text-[10px] text-[#94A3B8] mt-1">{notice.authorName} • {notice.publishDate}</p>
                </div>)}
              </div>
            </div>
          )}
        </div>

        {/* User Profile */}
        <div className="relative">
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-2 p-1 pl-2 hover:bg-[#F1F5F9] rounded-md transition-colors text-left"
          >
            <div className="w-7 h-7 rounded-full bg-[#0B2B2A] text-white flex items-center justify-center font-semibold text-xs">
              {user?.fullName.charAt(0) || 'U'}
            </div>
            <div className="hidden md:block">
              <p className="text-xs font-semibold text-[#132A29] leading-tight truncate max-w-[120px]">
                {user?.fullName}
              </p>
              <p className="text-[10px] text-[#64748B] uppercase font-mono">
                {user?.role.replace('_', ' ')}
              </p>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-[#64748B]" />
          </button>

          {showProfileMenu && (
            <div className="absolute right-0 mt-1 w-52 bg-white rounded-lg shadow-lg border border-[#E2E8F0] py-1 z-50 text-xs">
              <div className="px-3 py-2 border-b border-[#F1F5F9]">
                <p className="font-semibold text-[#132A29] truncate">{user?.fullName}</p>
                <p className="text-[11px] text-[#64748B] truncate">{user?.email || user?.phone || user?.studentId}</p>
              </div>

              <button
                onClick={() => {
                  setShowProfileMenu(false);
                  setShowProfileModal(true);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#F8FAFC] text-[#334155]"
              >
                <UserIcon className="w-3.5 h-3.5 text-[#0F766E]" />
                <span>My Account & Security</span>
              </button>

              {onOpenChangePassword && (
                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    onOpenChangePassword();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#F8FAFC] text-[#334155]"
                >
                  <KeyRound className="w-3.5 h-3.5 text-[#64748B]" />
                  <span>{t('reset_password')}</span>
                </button>
              )}

              <button
                onClick={() => {
                  setShowProfileMenu(false);
                  logout();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-red-50 text-red-600 font-medium"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{t('logout')}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <ProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
      />
    </header>
  );
};
