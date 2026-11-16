import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { translations, LanguageCode, TranslationDict } from '../../lib/translations.ts';
import { ApiClient } from '../../services/api.ts';
import { useApi } from '../../hooks/useApi.ts';
import { hasStaffNavigationPermission } from '../../lib/staff-permissions.ts';
import {
  LayoutDashboard, Building2, Receipt, Users, BarChart3, Radio, LifeBuoy,
  Settings, GraduationCap, UserCheck, PhoneCall, Layers, BookOpen, CalendarDays,
  CalendarCheck, FileSpreadsheet, FileCheck2, CreditCard, BellRing, MessageSquare,
  UserPlus, ShieldCheck, FileText, Sliders, Library, Bus, AlertTriangle,
  HeartPulse, Award, Wallet, Boxes, ChevronLeft, ChevronRight, MessageCircle, Languages, LogOut, UserCircle2, Search
} from 'lucide-react';

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

type NavItem = { id: string; label: string; icon: React.ComponentType<{ className?: string; fill?: string }>; permission?: 'fees_manage' | 'payroll_manage' | 'reports_export' };
type NavGroup = { title: string; items: NavItem[] };

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate, isOpenMobile, onCloseMobile }) => {
  const { user, school, inspectedSchool, logout } = useAuth();
  const role = user?.role || 'school_admin';
  const [menuSearch, setMenuSearch] = useState('');
  const [menuLanguage, setMenuLanguage] = useState<LanguageCode>(() => {
    if (typeof window === 'undefined') return 'en';
    const saved = window.localStorage.getItem('schoolos:menu-language:guest');
    return saved === 'so' || saved === 'am' ? saved : 'en';
  });
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    const saved = window.localStorage.getItem(`schoolos:sidebar-collapsed:${user?.id || 'guest'}`);
    return saved === null ? Boolean(school?.sidebarTheme?.defaultCollapsed) : saved === 'true';
  });
  const menuTranslations: Record<string, { so: string; am: string }> = {
    Platform: { so: 'Madasha Guud', am: 'መድረክ' },
    Teaching: { so: 'Waxbaridda', am: 'ማስተማር' },
    Family: { so: 'Qoyska', am: 'ቤተሰብ' },
    'My learning': { so: 'Waxbarashadayda', am: 'ትምህርቴ' },
    Workspace: { so: 'Goobta Shaqada', am: 'የሥራ ቦታ' },
    'Daily operations': { so: 'Hawlaha Maalinlaha ah', am: 'ዕለታዊ ሥራዎች' },
    'Financial management': { so: 'Maamulka Maaliyadda', am: 'የፋይናንስ አስተዳደር' },
    Dashboard: { so: 'Bogga Hore', am: 'ዳሽቦርድ' },
    People: { so: 'Dadka', am: 'ሰዎች' },
    Academics: { so: 'Waxbarashada', am: 'ትምህርት' },
    Communication: { so: 'Isgaarsiinta', am: 'ግንኙነት' },
    Finance: { so: 'Maaliyadda', am: 'ፋይናንስ' },
    Reports: { so: 'Warbixinnada', am: 'ሪፖርቶች' },
    Resources: { so: 'Adeegyada', am: 'መርጃዎች' },
    Settings: { so: 'Dejinta', am: 'ቅንብሮች' },
    'Exam Marks': { so: 'Dhibcaha Imtixaanka', am: 'የፈተና ውጤቶች' },
    'Exam Results': { so: 'Natiijooyinka Imtixaanka', am: 'የፈተና ውጤቶች' },
    Documents: { so: 'Dukumentiyada', am: 'ሰነዶች' },
    'Student invoices': { so: 'Biilasha Ardayda', am: 'የተማሪ ደረሰኞች' },
    'Expenses & cashbook': { so: 'Kharashaadka iyo Buugga Lacagta', am: 'ወጪዎች እና የገንዘብ መዝገብ' },
    'Bank reconciliation': { so: 'Is-waafajinta Bangiga', am: 'የባንክ ማስታረቅ' },
    'Promotion & Alumni': { so: 'Dalacsiinta iyo Qalin-jabiyeyaasha', am: 'ደረጃ ማሳደግ እና ተመራቂዎች' },
    'WhatsApp parent reminders': { so: 'Xusuusinta Waalidiinta WhatsApp', am: 'የወላጆች WhatsApp ማስታወሻዎች' },
    'School Settings': { so: 'Dejinta Dugsiga', am: 'የትምህርት ቤት ቅንብሮች' },
    'Help & Support': { so: 'Caawimaad iyo Taageero', am: 'እገዛ እና ድጋፍ' },
    'Platform workspace': { so: 'Goobta Madasha', am: 'የመድረክ ቦታ' },
    'School workspace': { so: 'Goobta Dugsiga', am: 'የትምህርት ቤት ቦታ' },
    'Log out': { so: 'Ka bax', am: 'ውጣ' }
  };
  const menuText = (value: string) => menuLanguage === 'en' ? value : menuTranslations[value]?.[menuLanguage] || value;
  const menuT = (key: keyof TranslationDict) => translations[menuLanguage]?.[key] || translations.en[key] || String(key);

  useEffect(() => {
    const saved = window.localStorage.getItem(`schoolos:menu-language:${user?.id || 'guest'}`);
    setMenuLanguage(saved === 'so' || saved === 'am' ? saved : 'en');
  }, [user?.id]);

  useEffect(() => {
    const saved = window.localStorage.getItem(`schoolos:sidebar-collapsed:${user?.id || 'guest'}`);
    if (saved !== null) setIsCollapsed(saved === 'true');
    else setIsCollapsed(Boolean(school?.sidebarTheme?.defaultCollapsed));
  }, [user?.id, school?.id]);

  useEffect(() => {
    window.localStorage.setItem(`schoolos:sidebar-collapsed:${user?.id || 'guest'}`, String(isCollapsed));
  }, [isCollapsed, user?.id]);
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

  const noticeLabel = unread ? `${menuT('notice_board')} · ${unread > 99 ? '99+' : unread}` : t('notice_board');
  const item = (id: string, label: string, icon: NavItem['icon']): NavItem => ({ id, label: menuText(label), icon });
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
      item('t_assignments', t('assignments'), FileCheck2), item('sch_documents', 'Documents', FileText), item('t_notices', noticeLabel, BellRing),
      item('t_messages', t('messages'), MessageSquare), item('t_payslips', t('payroll_payslip'), Wallet)
    ] }];
    if (role === 'parent') return [{ title: 'Family', items: [
      item('p_overview', t('dashboard'), LayoutDashboard), item('p_attendance', t('attendance'), CalendarCheck),
      item('p_results', t('exams_results'), FileSpreadsheet), item('p_fees', t('fees_payments'), CreditCard),
      item('p_notices', noticeLabel, BellRing), item('sch_documents', 'Documents', FileText), item('p_messages', t('messages'), MessageSquare)
    ] }];
    if (role === 'student') return [{ title: 'My learning', items: [
      item('st_dashboard', t('dashboard'), LayoutDashboard), item('st_timetable', t('timetable'), CalendarDays),
      item('st_assignments', t('assignments'), FileCheck2), item('st_results', t('exams_results'), FileSpreadsheet),
      item('st_attendance', t('attendance'), CalendarCheck), item('st_notices', noticeLabel, BellRing), item('sch_documents', 'Documents', FileText),
      item('st_messages', t('messages'), MessageSquare)
    ] }];
    if (role === 'accountant') return [
      { title: 'Workspace', items: [item('acc_dashboard', t('dashboard'), LayoutDashboard), item('sch_documents', 'Documents', FileText)] },
      { title: 'Daily operations', items: [
        { ...item('sch_fees', t('fees_payments'), CreditCard), permission: 'fees_manage' },
        { ...item('sch_student_invoices', 'Student invoices', FileText), permission: 'fees_manage' },
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
        item('sch_exams', t('exams_results'), FileSpreadsheet), item('sch_report_cards', t('report_cards'), FileText), item('sch_documents', 'Documents', FileText),
        item('sch_promotion', 'Promotion & Alumni', Award)
      ] },
      { title: 'Communication', items: [
        item('sch_notices', noticeLabel, BellRing), item('sch_messages', t('messages'), MessageSquare),
        item('sch_whatsapp', 'WhatsApp parent reminders', MessageCircle),
        item('sch_events', t('events_holidays'), CalendarDays)
      ] },
      { title: 'Finance', items: [
        { ...item('sch_student_invoices', 'Student invoices', FileText), permission: 'fees_manage' }
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

  const visibleGroups = groups.map(group => ({ ...group, items: group.items.filter(entry => `${group.title} ${entry.label}`.toLowerCase().includes(menuSearch.trim().toLowerCase())) })).filter(group => group.items.length > 0);

  const handleNavigate = (id: string) => {
    onNavigate(id);
    onCloseMobile?.();
  };

  return <>
    {isOpenMobile && <button aria-label="Close navigation" onClick={onCloseMobile} className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-[2px] md:hidden" />}
    <aside style={{ background: 'var(--sidebar-background, #102c2a)', color: 'var(--sidebar-text, #ffffff)' }} className={`fixed inset-y-0 left-0 z-50 flex h-[100dvh] max-h-[100dvh] w-[276px] ${isCollapsed ? 'md:w-[72px]' : 'md:w-[var(--sidebar-width)]'} shrink-0 flex-col border-r border-white/10 text-white shadow-2xl transition-[width,transform] duration-300 ease-out md:sticky md:top-0 md:z-30 md:translate-x-0 md:shadow-none ${isOpenMobile ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className={`relative flex h-[96px] shrink-0 flex-col items-center justify-center gap-1 border-b border-white/10 ${isCollapsed ? 'px-2' : 'px-5'}`}>
        {school?.sidebarTheme?.showLogo !== false && <div className={`grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-2xl ${school?.logoUrl ? 'bg-white p-1' : ''}`} style={!school?.logoUrl ? { backgroundColor: 'var(--sidebar-accent)', color: 'var(--sidebar-accent-foreground)' } : undefined}>
          {school?.logoUrl ? <img src={school.logoUrl} alt={`${school.name} logo`} className="h-full w-full object-contain" /> : <span className="text-lg font-black">{school?.name?.trim().charAt(0).toUpperCase() || 'S'}</span>}
        </div>}
        {school?.sidebarTheme?.showSchoolName !== false && <div className={`min-w-0 max-w-full text-center ${isCollapsed ? 'md:hidden' : ''}`}>
          <div className="truncate text-[14px] font-bold tracking-tight">{school?.name || menuText(role === 'super_admin' && !inspectedSchool ? 'Platform workspace' : 'School workspace')}</div>
          {school && <div className="mt-0.5 truncate text-[9px] font-semibold uppercase tracking-[.14em] text-teal-200/70">{school.code}</div>}
        </div>}
        <button onClick={onCloseMobile} aria-label="Close menu" className="absolute right-2 top-2 rounded-lg p-2 text-teal-100/70 hover:bg-white/10 md:hidden"><ChevronRight size={18}/></button>
      </div>

      <nav aria-label="Main navigation" className={`min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain ${isCollapsed ? "px-2" : "px-3"} py-5 [scrollbar-color:rgba(153,246,228,.28)_transparent] [scrollbar-width:thin]`}>
        <button type="button" onClick={() => setIsCollapsed(value => !value)} aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!isCollapsed} title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"} className="mb-2 hidden w-full items-center justify-end rounded-lg px-2 py-1 text-teal-100/70 hover:bg-white/10 md:flex">
          {isCollapsed ? <ChevronRight size={18}/> : <ChevronLeft size={18}/>}
        </button>
        {!isCollapsed && <label className="mb-3 flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-black/10 px-3 text-teal-100/70">
          <Search size={15} aria-hidden="true" />
          <input value={menuSearch} onChange={event => setMenuSearch(event.target.value)} placeholder="Search menu" aria-label="Search navigation menu" className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-teal-100/45" />
        </label>}
        {visibleGroups.map(group => <section key={group.title}>
          {school?.sidebarTheme?.showGroupLabels !== false && <h2 style={{ color: 'var(--sidebar-text)', opacity: 0.62 }} className={`mb-2 px-3 text-[10px] font-bold uppercase tracking-[.17em] ${isCollapsed ? "md:hidden" : ""}`}>{menuText(group.title)}</h2>}
          <div className="space-y-1">
            {group.items.filter(entry => role !== 'accountant' || !entry.permission || hasStaffNavigationPermission(user?.permissions, entry.permission)).map(entry => {
              const Icon = entry.icon;
              const active = currentView === entry.id;
              return <button key={entry.id} type="button" aria-current={active ? 'page' : undefined} onClick={() => handleNavigate(entry.id)}
                title={isCollapsed ? entry.label : undefined}
                className={`group relative flex w-full items-center gap-3 ${school?.sidebarTheme?.density === 'compact' ? 'min-h-9' : school?.sidebarTheme?.density === 'spacious' ? 'min-h-[52px]' : 'min-h-11'} ${isCollapsed ? "justify-center px-2" : "px-3"} text-left font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 ${active ? "text-white shadow-lg shadow-teal-950/25 ring-1 ring-white/10" : "text-slate-300 hover:bg-white/[.075] hover:text-white"}`}
                style={{ borderRadius: 'var(--sidebar-radius, 14px)', fontSize: 'var(--sidebar-font-size, 13px)', color: active && school?.sidebarTheme?.activeStyle !== 'bar' ? 'var(--sidebar-accent-foreground)' : 'var(--sidebar-text)', ...(active && school?.sidebarTheme?.activeStyle !== 'bar' ? { backgroundColor: 'var(--sidebar-accent)' } : {}), ...(active && school?.sidebarTheme?.activeStyle === 'outline' ? { backgroundColor: 'transparent', border: '1px solid var(--sidebar-accent)' } : {}) }}>
                <span aria-hidden="true" className={`absolute top-2 bottom-2 w-[3px] rounded-r ${active && school?.sidebarTheme?.activeStyle === 'bar' ? "" : "hidden"}`} style={active ? { left: -12, backgroundColor: "var(--sidebar-accent)" } : undefined}/>
                <span className="grid shrink-0 place-items-center" style={{ color: active ? "var(--sidebar-accent-foreground)" : "var(--sidebar-text)", opacity: active ? 1 : 0.72 }}><Icon className={`h-[18px] w-[18px] shrink-0 ${active ? "" : "text-teal-100/65 group-hover:text-teal-100"}`} fill={school?.sidebarTheme?.iconStyle === 'filled' ? 'currentColor' : 'none'}/></span>
                <span className={`min-w-0 flex-1 truncate ${isCollapsed ? "md:hidden" : ""}`}>{entry.label}</span>
                {active && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isCollapsed ? "hidden" : ""}`} style={{ backgroundColor: "var(--sidebar-accent-foreground)" }}/>}
              </button>;
            })}
          </div>
        </section>)}
      </nav>

      <div className="shrink-0 border-t border-white/10 bg-black/10 px-3 py-3">
        {school?.sidebarTheme?.showUserCard !== false && <div style={{ color: 'var(--sidebar-text)' }} className={`mb-2 flex items-center gap-2.5 rounded-xl bg-black/10 px-2.5 py-2 ${isCollapsed ? "md:justify-center" : ""}`}>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 text-teal-100">
            <UserCircle2 size={18} aria-hidden="true" />
          </span>
          <div className={`min-w-0 flex-1 ${isCollapsed ? "md:hidden" : ""}`}>
            <p style={{ color: 'var(--sidebar-text)' }} className="truncate text-xs font-semibold">{user?.fullName || 'Signed in'}</p>
            <p style={{ color: 'var(--sidebar-text)', opacity: 0.7 }} className="truncate text-[10px] capitalize">{role.replace(/_/g, ' ')}</p>
          </div>
        </div>}
        <label style={{ color: 'var(--sidebar-text)' }} className={`flex min-h-9 items-center gap-2 rounded-lg px-2 text-[11px] ${isCollapsed ? "md:justify-center" : ""}`}>
          <Languages size={15} aria-hidden="true" />
          <span className={isCollapsed ? "md:hidden" : ""}>Language</span>
          <select aria-label="Navigation language" value={menuLanguage} onChange={event => { const next = event.target.value as LanguageCode; setMenuLanguage(next); window.localStorage.setItem(`schoolos:menu-language:${user?.id || 'guest'}`, next); }}
            className={`min-w-0 flex-1 bg-transparent text-[11px] text-white outline-none ${isCollapsed ? "md:hidden" : ""}`}>
            <option value="en" className="text-slate-900">English</option>
            <option value="so" className="text-slate-900">Soomaali</option>
            <option value="am" className="text-slate-900">አማርኛ</option>
          </select>
        </label>
        <button type="button" onClick={() => void logout()} aria-label={menuText('Log out')} title={isCollapsed ? menuText('Log out') : undefined}
          style={{ color: 'var(--sidebar-text)' }}
          className={`mt-1 flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2 text-xs font-semibold transition hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 ${isCollapsed ? "md:justify-center" : ""}`}>
          <LogOut size={15} aria-hidden="true" />
          <span className={isCollapsed ? "md:hidden" : ""}>{menuText('Log out')}</span>
        </button>
      </div>
    </aside>
  </>;
};
