import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { translations, LanguageCode, TranslationDict } from '../../lib/translations.ts';
import { ApiClient } from '../../services/api.ts';
import { useApi } from '../../hooks/useApi.ts';
import { hasStaffNavigationPermission, type StaffPermission } from '../../lib/staff-permissions.ts';
import { getNavigationRoute } from '../../lib/navigation-registry.ts';
import {
  LayoutDashboard, Building2, Receipt, Users, BarChart3, Radio, LifeBuoy,
  Settings, GraduationCap, UserCheck, PhoneCall, Layers, BookOpen, CalendarDays,
  CalendarCheck, FileSpreadsheet, FileCheck2, CreditCard, BellRing, MessageSquare,
  UserPlus, ShieldCheck, FileText, Sliders, Library, Bus, AlertTriangle,
  HeartPulse, Award, Wallet, Boxes, ChevronLeft, ChevronRight, MessageCircle, UserCircle2, Search
} from 'lucide-react';

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

type NavItem = { id: string; label: string; icon: React.ComponentType<{ className?: string; fill?: string }>; permission?: StaffPermission };
type NavGroup = { title: string; items: NavItem[] };

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate, isOpenMobile, onCloseMobile }) => {
  const { user, school, inspectedSchool, language } = useAuth();
  const role = user?.role || 'school_admin';
  const [menuSearch, setMenuSearch] = useState('');
  // A phone drawer is always expanded, even if the desktop sidebar was saved as collapsed.
  const isCompact = isCollapsed && !isOpenMobile;
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    const saved = window.localStorage.getItem(`schoolos:sidebar-collapsed:${user?.id || 'guest'}`);
    return saved === null ? Boolean(school?.sidebarTheme?.defaultCollapsed) : saved === 'true';
  });
  useEffect(() => {
    const theme = school?.sidebarTheme;
    const presets: Record<string, { background: string; text: string; accent: string }> = {
      light: { background: '#f8fafc', text: '#172033', accent: '#2563eb' },
      dark: { background: '#0a101b', text: '#ffffff', accent: '#6b9bff' },
      brand: { background: '#0f2a5c', text: '#ffffff', accent: '#2563eb' },
      soft: { background: '#e8f0ff', text: '#18202c', accent: '#2563eb' }
    };
    const preset = presets[theme?.preset || 'brand'];
    const background = theme?.preset === 'gradient'
      ? 'linear-gradient(180deg, #0f2a5c 0%, #16408f 100%)'
      : theme?.preset === 'glass' ? 'rgba(10, 16, 27, 0.96)'
      : theme?.preset === 'custom' ? theme.backgroundColor : (preset?.background || '#102c2a');
    const root = document.documentElement;
    const accent = theme?.accentColor || preset?.accent || '#2563eb';
    const channels = [1, 3, 5].map(index => parseInt(accent.slice(index, index + 2), 16) / 255);
    const linear = channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    root.style.setProperty('--sidebar-background', background);
    root.style.setProperty('--sidebar-text', theme?.textColor || preset?.text || '#ffffff');
    root.style.setProperty('--sidebar-accent', accent);
    root.style.setProperty('--sidebar-accent-foreground', luminance > 0.42 ? '#111827' : '#ffffff');
    root.style.setProperty('--sidebar-width', (theme?.width || 250) + 'px');
    root.style.setProperty('--school-ui-zoom', String((theme?.zoom ?? 96) / 100));
    root.style.setProperty('--sidebar-radius', theme?.radius === 'sharp' ? '4px' : theme?.radius === 'medium' ? '10px' : '14px');
    root.style.setProperty('--sidebar-font-size', theme?.fontSize === 'small' ? '12px' : theme?.fontSize === 'large' ? '14px' : '13px');
  }, [school?.id, school?.sidebarTheme]);
  const menuTranslations: Record<string, Partial<Record<Exclude<LanguageCode, 'en'>, string>>> = {
    Platform: { so: 'Madasha Guud', am: 'መድረክ', ar: 'المنصة' },
    Operations: { so: 'Hawlgalka', am: 'ኦፕሬሽኖች', ar: 'العمليات' },
    'My workspace': { so: 'Goobtayda Shaqada', am: 'የሥራ ቦታዬ', ar: 'مساحة عملي' },
    Updates: { so: 'Wararka', am: 'ዝመናዎች', ar: 'التحديثات' },
    Transactions: { so: 'Macaamillada', am: 'ግብይቶች', ar: 'المعاملات' },
    'Finance & Reports': { so: 'Maaliyadda & Warbixinnada', am: 'ፋይናንስ እና ሪፖርቶች', ar: 'المالية والتقارير' },
    'School resources': { so: 'Adeegyada Dugsiga', am: 'የትምህርት ቤት ሀብቶች', ar: 'موارد المدرسة' },
    Administration: { so: 'Maamulka', am: 'አስተዳደር', ar: 'الإدارة' },
    Teaching: { so: 'Waxbaridda', am: 'ማስተማር', ar: 'التدريس' },
    Family: { so: 'Qoyska', am: 'ቤተሰብ', ar: 'الأسرة' },
    'My learning': { so: 'Waxbarashadayda', am: 'ትምህርቴ', ar: 'تعلمي' },
    Workspace: { so: 'Goobta Shaqada', am: 'የሥራ ቦታ', ar: 'مساحة العمل' },
    'Daily operations': { so: 'Hawlaha Maalinlaha ah', am: 'ዕለታዊ ሥራዎች', ar: 'العمليات اليومية' },
    'Financial management': { so: 'Maamulka Maaliyadda', am: 'የፋይናንስ አስተዳደር', ar: 'الإدارة المالية' },
    Dashboard: { so: 'Bogga Hore', am: 'ዳሽቦርድ', ar: 'لوحة التحكم' },
    People: { so: 'Dadka', am: 'ሰዎች', ar: 'الأشخاص' },
    Academic: { so: 'Waxbarashada', am: 'ትምህርት', ar: 'الشؤون الأكاديمية' },
    Academics: { so: 'Waxbarashada', am: 'ትምህርት', ar: 'الشؤون الأكاديمية' },
    Communication: { so: 'Isgaarsiinta', am: 'ግንኙነት', ar: 'التواصل' },
    Finance: { so: 'Maaliyadda', am: 'ፋይናንስ', ar: 'المالية' },
    Reports: { so: 'Warbixinnada', am: 'ሪፖርቶች', ar: 'التقارير' },
    Resources: { so: 'Adeegyada', am: 'መርጃዎች', ar: 'الموارد' },
    Settings: { so: 'Dejinta', am: 'ቅንብሮች', ar: 'الإعدادات' },
    'Exam Marks': { so: 'Dhibcaha Imtixaanka', am: 'የፈተና ውጤቶች', ar: 'درجات الامتحان' },
    'Exam Results': { so: 'Natiijooyinka Imtixaanka', am: 'የፈተና ውጤቶች', ar: 'نتائج الامتحانات' },
    'Marks Entry': { so: 'Gelinta Dhibcaha', am: 'ውጤት ማስገባት', ar: 'إدخال الدرجات' },
    'Marks Approval': { so: 'Ansixinta Dhibcaha', am: 'ውጤት ማጽደቅ', ar: 'اعتماد الدرجات' },










    'Platform Management': { so: 'Maamulka Madasha', am: 'የመድረክ አስተዳደር', ar: 'إدارة المنصة' },
    'School Workspace': { so: 'Goobta Dugsiga', am: 'የትምህርት ቤት ቦታ', ar: 'مساحة المدرسة' },
    'Teaching & Learning': { so: 'Waxbarid & Barasho', am: 'ማስተማር እና መማር', ar: 'التدريس والتعلم' },
    'Parent Portal': { so: 'Bogga Waalidka', am: 'የወላጅ መግቢያ', ar: 'بوابة ولي الأمر' },
    'Student Portal': { so: 'Bogga Ardayga', am: 'የተማሪ መግቢያ', ar: 'بوابة الطالب' },
    'Finance Workspace': { so: 'Goobta Maaliyadda', am: 'የፋይናንስ ቦታ', ar: 'مساحة العمل المالي' },
    'Daily Operations': { so: 'Hawlaha Maalinlaha ah', am: 'ዕለታዊ ሥራዎች', ar: 'العمليات اليومية' },
    'Finance & Payroll': { so: 'Maaliyadda & Mushaharka', am: 'ፋይናንስ እና ደመወዝ', ar: 'المالية والرواتب' },
    Overview: { so: 'Guudmar', am: 'አጠቃላይ እይታ', ar: 'نظرة عامة' },
    'People & Admissions': { so: 'Dadka & Diiwaangelinta', am: 'ሰዎች እና ምዝገባ', ar: 'الأفراد والقبول' },
    'Academic Management': { so: 'Maamulka Waxbarashada', am: 'የትምህርት አስተዳደር', ar: 'الإدارة الأكاديمية' },
    'Finance & Billing': { so: 'Maaliyadda & Biilasha', am: 'ፋይናንስ እና ክፍያ', ar: 'المالية والفواتير' },
    'Reports & Analytics': { so: 'Warbixinno & Falanqayn', am: 'ሪፖርቶች እና ትንታኔ', ar: 'التقارير والتحليلات' },
    'School Resources': { so: 'Agabka Dugsiga', am: 'የትምህርት ቤት ሀብቶች', ar: 'موارد المدرسة' },
    'Settings & Support': { so: 'Dejin & Taageero', am: 'ቅንብሮች እና ድጋፍ', ar: 'الإعدادات والدعم' },
    Classes: { so: 'Fasallada', am: 'ክፍሎች', ar: 'الفصول' },
    Subjects: { so: 'Maaddooyinka', am: 'የትምህርት ዓይነቶች', ar: 'المواد الدراسية' },
    'Class Curriculum': { so: 'Manhajka Fasalka', am: 'የክፍል ሥርዓተ ትምህርት', ar: 'منهج الصف' },
    'Teacher Assignments': { so: 'Qoondeynta Macallimiinta', am: 'የመምህራን ምደባ', ar: 'توزيع المعلمين' },
    'School Documents': { so: 'Dukumentiyada Dugsiga', am: 'የትምህርት ቤት ሰነዶች', ar: 'مستندات المدرسة' },
    'Admissions Pipeline': { so: 'Habraaca Diiwaangelinta', am: 'የመግቢያ ሂደት', ar: 'مسار القبول' },
    'Staff Roles & Permissions': { so: 'Doorarka Shaqaalaha & Ogolaanshaha', am: 'የሰራተኞች ሚናዎች እና ፈቃዶች', ar: 'أدوار الموظفين والصلاحيات' },
    'Academic Calendar': { so: 'Jadwalka Waxbarashada', am: 'የትምህርት ቀን መቁጠሪያ', ar: 'التقويم الأكاديمي' },
    'Clinic & Health Records': { so: 'Xarunta Caafimaadka & Diiwaannada', am: 'ክሊኒክ እና የጤና መዝገቦች', ar: 'العيادة والسجلات الصحية' },
    Language: { so: 'Luqad', am: 'ቋንቋ', ar: 'اللغة' },
    'Search menu': { so: 'Raadi menu-ga', am: 'ምናሌ ፈልግ', ar: 'البحث في القائمة' },
    'Search navigation menu': { so: 'Raadi qaybaha menu-ga', am: 'የአሰሳ ምናሌን ፈልግ', ar: 'البحث في قائمة التنقل' },
    'Close navigation': { so: 'Xir menu-ga', am: 'ዝጋ አሰሳ', ar: 'إغلاق التنقل' },
    'Close menu': { so: 'Xir menu-ga', am: 'ዝጋ ምናሌ', ar: 'إغلاق القائمة' },
    'Expand sidebar': { so: 'Ballaarin dhinac-mare', am: 'የጎን ምናሌን አስፋ', ar: 'توسيع الشريط الجانبي' },
    'Collapse sidebar': { so: 'Yaree dhinac-mare', am: 'የጎን ምናሌን አጠብ', ar: 'طي الشريط الجانبي' },
    'Fee Invoices': { so: 'Biilasha Lacagaha', am: 'የክፍያ ደረሰኞች', ar: 'فواتير الرسوم' },
    'Expenses & Cash Book': { so: 'Kharashaadka & Buugga Lacagta', am: 'ወጪዎች እና የገንዘብ መዝገብ', ar: 'المصروفات ودفتر النقدية' },
    'Bank Reconciliation': { so: 'Iswaafajinta Bangiga', am: 'የባንክ ማስታረቅ', ar: 'تسوية الحسابات البنكية' },
    'Student Progression & Alumni': { so: 'U Gudbinta Ardayda & Qalin-jabiyeyaasha', am: 'የተማሪ ደረጃ ማሳደግ እና ተመራቂዎች', ar: 'ترفيع الطلاب والخريجون' },
    'WhatsApp Parent Alerts': { so: 'Digniinaha Waalidiinta WhatsApp', am: 'የወላጆች WhatsApp ማሳወቂያዎች', ar: 'تنبيهات أولياء الأمور عبر واتساب' },
    'School Configuration': { so: 'Habaynta Dugsiga', am: 'የትምህርት ቤት ውቅር', ar: 'تهيئة المدرسة' },
    'School Settings': { so: 'Dejinta Dugsiga', am: 'የትምህርት ቤት ቅንብሮች', ar: 'إعدادات المدرسة' },
    'Help Centre': { so: 'Xarunta Caawinta', am: 'የእገዛ ማዕከል', ar: 'مركز المساعدة' },
    'Log out': { so: 'Ka bax', am: 'ውጣ', ar: 'تسجيل الخروج' }
  };
  const menuText = (value: string) => language === 'en' ? value : menuTranslations[value]?.[language] || value;
  const menuT = (key: keyof TranslationDict) => translations[language]?.[key] || translations.en[key] || String(key);

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

  const noticeLabel = unread ? `${menuT('notice_board')} · ${unread > 99 ? '99+' : unread}` : menuT('notice_board');
  const item = (id: string, _label: string, _icon: NavItem['icon']): NavItem => {
    const route = getNavigationRoute(id);
    if (!route) throw new Error(`Navigation route is missing from the shared registry: ${id}`);
    const label = route.labelKey ? menuT(route.labelKey as keyof TranslationDict) : menuText(route.label);
    return { id, label, icon: route.icon, permission: route.permission };
  };
  // Keep each role's navigation short, predictable, and grouped by the work users do.
  const groups: NavGroup[] = (() => {
    if (role === 'super_admin' && !inspectedSchool) return [
      { title: 'Platform', items: [
        item('sa_dashboard', menuT('dashboard'), LayoutDashboard),
        item('sa_schools', menuT('schools'), Building2),
        item('sa_users', menuT('users'), Users),
        item('sa_analytics', menuT('analytics'), BarChart3)
      ] },
      { title: 'Operations', items: [
        item('sa_plans', menuT('plans_billing'), Receipt),
        item('sa_broadcasts', menuT('broadcasts'), Radio),
        item('sa_support', menuT('support_audit'), LifeBuoy),
        item('sa_settings', menuT('platform_settings'), Settings)
      ] }
    ];
    if (role === 'teacher') return [
      { title: 'My workspace', items: [
        item('t_dashboard', menuT('dashboard'), LayoutDashboard),
        item('t_timetable', menuT('timetable'), CalendarDays),
        item('t_students', menuT('students'), GraduationCap)
      ] },
      { title: 'Teaching', items: [
        item('t_attendance', menuT('attendance'), CalendarCheck),
        item('t_grades', 'Exam Marks', FileSpreadsheet),
        item('t_assignments', menuT('assignments'), FileCheck2),
        item('t_profile', 'My Profile', Users)
      ] },
      { title: 'Communication', items: [
        item('t_notices', noticeLabel, BellRing),
        item('t_messages', menuT('messages'), MessageSquare),
        item('t_payslips', menuT('payroll_payslip'), Wallet)
      ] }
    ];
    if (role === 'parent') return [{ title: 'Family', items: [
      item('p_overview', menuT('dashboard'), LayoutDashboard),
      item('p_attendance', menuT('attendance'), CalendarCheck),
      item('p_results', menuT('exams_results'), FileSpreadsheet),
      item('p_fees', menuT('fees_payments'), CreditCard),
      item('p_notices', noticeLabel, BellRing),
      item('sch_documents', 'School Documents', FileText),
      item('p_messages', menuT('messages'), MessageSquare)
    ] }];
    if (role === 'student') return [
      { title: 'My learning', items: [
        item('st_dashboard', menuT('dashboard'), LayoutDashboard),
        item('st_timetable', menuT('timetable'), CalendarDays),
        item('st_assignments', menuT('assignments'), FileCheck2),
        item('st_results', menuT('exams_results'), FileSpreadsheet),
        item('st_attendance', menuT('attendance'), CalendarCheck)
      ] },
      { title: 'Updates', items: [
        item('st_notices', noticeLabel, BellRing),
        item('sch_documents', 'School Documents', FileText),
        item('st_messages', menuT('messages'), MessageSquare)
      ] }
    ];
    if (role === 'accountant') return [
      { title: 'Overview', items: [
        item('acc_dashboard', menuT('dashboard'), LayoutDashboard),
        item('sch_documents', 'School Documents', FileText)
      ] },
      { title: 'Transactions', items: [
        { ...item('sch_fees', menuT('fees_payments'), CreditCard), permission: 'fees_manage' },
        { ...item('sch_student_invoices', 'Fee Invoices', FileText), permission: 'fees_manage' },
        { ...item('acc_expenses', 'Expenses & Cash Book', Wallet), permission: 'fees_manage' },
        { ...item('acc_bank_reconciliation', 'Bank Reconciliation', Building2), permission: 'fees_manage' }
      ] },
      { title: 'Finance & Reports', items: [
        { ...item('sch_payroll', menuT('payroll_management'), Wallet), permission: 'payroll_manage' },
        { ...item('sch_reports', menuT('reports_export'), BarChart3), permission: 'reports_export' }
      ] }
    ];

    return [
      { title: 'Overview', items: [item('sch_dashboard', menuT('dashboard'), LayoutDashboard)] },
      { title: 'People', items: [
        item('sch_students', menuT('students'), GraduationCap),
        item('sch_teachers', menuT('teachers'), UserCheck),
        item('sch_parents', menuT('parents_contacts'), PhoneCall),
        item('sch_admissions', 'Admissions Pipeline', UserPlus),
        item('sch_staff', 'Staff Roles & Permissions', ShieldCheck)
      ] },
      { title: 'Academics', items: [
        item('sch_classes', 'Classes', Layers),
        item('sch_subjects', 'Subjects', BookOpen),
        item('sch_curriculum', 'Class Curriculum', BookOpen),
        item('sch_teacher_assignments', 'Teacher Assignments', UserCheck),
        item('sch_timetable', menuT('timetable'), CalendarDays),
        item('sch_attendance', menuT('attendance'), CalendarCheck),
        item('sch_exams', menuT('exams_results'), FileSpreadsheet),
        item('sch_marks', 'Marks Entry', FileSpreadsheet),
        item('sch_marks_approval', 'Marks Approval', ShieldCheck),
        item('sch_report_cards', menuT('report_cards'), FileText),
        item('sch_promotion', 'Student Progression & Alumni', Award)
      ] },
      { title: 'Communication', items: [
        item('sch_notices', noticeLabel, BellRing),
        item('sch_messages', menuT('messages'), MessageSquare),
        item('sch_whatsapp', 'WhatsApp Parent Alerts', MessageCircle),
        item('sch_events', 'Academic Calendar', CalendarDays)
      ] },
      { title: 'Finance & Reports', items: [
        { ...item('sch_student_invoices', 'Fee Invoices', FileText), permission: 'fees_manage' },
        item('sch_reports', menuT('reports_export'), BarChart3)
      ] },
      { title: 'School resources', items: [
        item('sch_documents', 'School Documents', FileText),
        item('sch_library', menuT('library'), Library),
        item('sch_transport', menuT('transport'), Bus),
        item('sch_inventory', menuT('inventory'), Boxes),
        item('sch_discipline', menuT('discipline'), AlertTriangle),
        item('sch_health', 'Clinic & Health Records', HeartPulse)
      ] },
      { title: 'Administration', items: [
        item('sch_settings', 'School Settings', Sliders),
        item('sch_support', 'Help Centre', LifeBuoy)
      ] }
    ];
  })();

  const visibleGroups = groups.map(group => ({ ...group, items: group.items.filter(entry => {
    const route = getNavigationRoute(entry.id);
    return Boolean(route && route.roles.includes(role as any)
      && `${group.title} ${entry.label}`.toLowerCase().includes(menuSearch.trim().toLowerCase()));
  }) })).filter(group => group.items.length > 0);

  const handleNavigate = (id: string) => {
    onNavigate(id);
    onCloseMobile?.();
  };

  return <>
    {isOpenMobile && <button aria-label={menuText('Close navigation')} onClick={onCloseMobile} className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-[2px] md:hidden" />}
    <aside style={{ background: 'var(--sidebar-background, #0f2a5c)', color: 'var(--sidebar-text, #ffffff)' }} role={isOpenMobile ? 'dialog' : undefined}
      aria-modal={isOpenMobile ? true : undefined}
      aria-label={isOpenMobile ? menuText('Main navigation') : undefined}
      data-mobile-open={isOpenMobile ? 'true' : 'false'}
      className={`school-admin-sidebar ${isCompact ? 'school-admin-sidebar-collapsed' : ''} fixed inset-y-0 left-0 z-50 flex h-[100dvh] max-h-[100dvh] w-[var(--sidebar-width,250px)] ${isCollapsed ? 'md:w-[72px]' : 'md:w-[var(--sidebar-width,250px)]'} shrink-0 flex-col border-r border-white/10 text-white shadow-xl transition-[width,transform] duration-200 ease-out md:sticky md:top-0 md:z-30 md:translate-x-0 md:shadow-none ${isOpenMobile ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className={`relative flex h-[68px] shrink-0 flex-row items-center gap-3 border-b border-white/10 ${isCompact ? 'justify-center px-2' : 'justify-start px-5'}`}>
        {school?.sidebarTheme?.showLogo !== false && <div className={`grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-2xl ${school?.logoUrl ? 'bg-white p-1' : ''}`} style={!school?.logoUrl ? { backgroundColor: 'var(--sidebar-accent)', color: 'var(--sidebar-accent-foreground)' } : undefined}>
          {school?.logoUrl ? <img src={school.logoUrl} alt={`${school.name} logo`} className="h-full w-full object-contain" /> : <span className="text-lg font-black">{school?.name?.trim().charAt(0).toUpperCase() || 'S'}</span>}
        </div>}
        {school?.sidebarTheme?.showSchoolName !== false && <div className={`min-w-0 max-w-full text-left ${isCompact ? 'md:hidden' : ''}`}>
          <div className="max-w-full whitespace-normal break-words text-[14px] font-bold leading-tight tracking-tight [overflow-wrap:anywhere]">{school?.name || menuText(role === 'super_admin' && !inspectedSchool ? 'Platform Management' : 'School Workspace')}</div>
          {school && <div style={{ color: "var(--sidebar-text)", opacity: 0.62 }} className="mt-0.5 max-w-full whitespace-normal break-words text-[9px] font-semibold uppercase leading-tight tracking-[.12em] [overflow-wrap:anywhere]">{school.code}</div>}
        </div>}
        <button onClick={onCloseMobile} aria-label={menuText('Close menu')} style={{ color: "var(--sidebar-text)" }} className="absolute right-2 top-2 rounded-lg p-2 hover:bg-black/10 md:hidden"><ChevronRight size={18}/></button>
      </div>

      <nav aria-label="Main navigation" className={`min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain ${isCompact ? "px-2" : "px-3"} py-4 [scrollbar-color:rgba(153,246,228,.28)_transparent] [scrollbar-width:thin]`}>
        <button type="button" onClick={() => setIsCollapsed(value => !value)} aria-label={menuText(isCompact ? "Expand sidebar" : "Collapse sidebar")} aria-expanded={!isCompact} title={menuText(isCompact ? "Expand sidebar" : "Collapse sidebar")} style={{ color: "var(--sidebar-text)" }} className="mb-2 hidden w-full items-center justify-end rounded-lg px-2 py-1 hover:bg-black/10 md:flex">
          {isCompact ? <ChevronRight size={18}/> : <ChevronLeft size={18}/ >}
        </button>
        {!isCompact && <label style={{ color: "var(--sidebar-text)" }} className="mb-3 flex min-h-10 items-center gap-2 rounded-xl border border-current/10 bg-black/10 px-3">
          <Search size={15} aria-hidden="true" />
          <input value={menuSearch} onChange={event => setMenuSearch(event.target.value)} placeholder={menuText('Search menu')} aria-label={menuText('Search navigation menu')} style={{ color: "var(--sidebar-text)" }} className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:opacity-50" />
        </label>}
        {visibleGroups.map(group => <section key={group.title}>
          {school?.sidebarTheme?.showGroupLabels !== false && <h2 style={{ color: 'var(--sidebar-text)', opacity: 0.62 }} className={`mb-2 whitespace-normal break-words px-3 text-[9px] font-bold uppercase leading-tight tracking-[.16em] ${isCompact ? "md:hidden" : ""}`}>{menuText(group.title)}</h2>}
          <div className="space-y-0.5">
            {group.items.filter(entry => role !== 'accountant' || !entry.permission || hasStaffNavigationPermission(user?.permissions, entry.permission)).map(entry => {
              const Icon = entry.icon;
              const active = currentView === entry.id;
              return <button key={entry.id} type="button" aria-current={active ? 'page' : undefined} onClick={() => handleNavigate(entry.id)}
                title={isCompact ? entry.label : undefined}
                className={`group relative flex h-auto min-w-0 w-full items-start gap-3 py-2.5 ${school?.sidebarTheme?.density === 'compact' ? 'min-h-9' : school?.sidebarTheme?.density === 'spacious' ? 'min-h-11' : 'min-h-10'} ${isCompact ? "justify-center px-2" : "px-3"} text-left font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${active ? "text-white shadow-lg shadow-teal-950/25 ring-1 ring-white/10" : "text-slate-300 hover:bg-white/[.075] hover:text-white"}`}
                style={{ borderRadius: active && school?.sidebarTheme?.activeStyle === 'pill' ? '999px' : 'var(--sidebar-radius, 14px)', fontSize: 'var(--sidebar-font-size, 13px)', color: active && school?.sidebarTheme?.activeStyle !== 'bar' ? 'var(--sidebar-accent-foreground)' : 'var(--sidebar-text)', ...(active && school?.sidebarTheme?.activeStyle !== 'bar' && school?.sidebarTheme?.activeStyle !== 'outline' ? { backgroundColor: 'var(--sidebar-accent)' } : {}), ...(active && school?.sidebarTheme?.activeStyle === 'outline' ? { backgroundColor: 'transparent', border: '1px solid var(--sidebar-accent)' } : {}) }}>
                <span aria-hidden="true" className={`absolute top-2 bottom-2 w-[3px] rounded-r ${active && school?.sidebarTheme?.activeStyle === 'bar' ? "" : "hidden"}`} style={active ? { left: -12, backgroundColor: "var(--sidebar-accent)" } : undefined}/>
                <span className="mt-0.5 grid shrink-0 place-items-center" style={{ color: active ? "var(--sidebar-accent-foreground)" : "var(--sidebar-text)", opacity: active ? 1 : 0.72 }}><Icon className={`h-[18px] w-[18px] shrink-0 ${active ? "" : "text-blue-100/65 group-hover:text-blue-100"}`} fill={school?.sidebarTheme?.iconStyle === 'filled' ? 'currentColor' : 'none'}/></span>
                <span className={`min-w-0 flex-1 whitespace-normal break-words leading-snug [overflow-wrap:anywhere] ${isCompact ? "md:hidden" : ""}`}>{entry.label}</span>
                {active && <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${isCompact ? "hidden" : ""}`} style={{ backgroundColor: "var(--sidebar-accent-foreground)" }}/>}
              </button>;
            })}
          </div>
        </section>)}


      </nav>

      {school?.sidebarTheme?.showUserCard !== false && <div className={`shrink-0 border-t border-white/10 bg-black/10 px-3 py-3`}>
        <div style={{ color: "var(--sidebar-text)" }} className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 ${isCompact ? "md:justify-center" : ""}`}>
          <span style={{ color: "var(--sidebar-text)" }} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-black/10"><UserCircle2 size={18} aria-hidden="true" /></span>
          <div className={`min-w-0 flex-1 ${isCompact ? "md:hidden" : ""}`}>
            <p style={{ color: "var(--sidebar-text)" }} className="truncate text-xs font-semibold">{user?.fullName || "Signed in"}</p>
            <p style={{ color: "var(--sidebar-text)", opacity: 0.7 }} className="truncate text-[10px] capitalize">{role.replace(/_/g, " ")}</p>
          </div>
        </div>
      </div>}

    </aside>
  </>;
};
