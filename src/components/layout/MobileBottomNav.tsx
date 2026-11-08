/**
 * Mobile Bottom Navigation Bar
 * Respects the 15% sticky height cap and >= 44px touch targets
 */

import React from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  LayoutDashboard,
  Building2,
  Users,
  Settings,
  Menu,
  GraduationCap,
  CalendarCheck,
  Layers,
  CreditCard,
  FileSpreadsheet,
  FileText
} from 'lucide-react';

interface MobileBottomNavProps {
  currentView: string;
  onNavigate: (view: string) => void;
  onOpenMenu: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ currentView, onNavigate, onOpenMenu }) => {
  const { user, t } = useAuth();
  const role = user?.role || 'school_admin';

  const getQuickTabs = () => {
    if (role === 'super_admin') {
      return [
        { id: 'sa_dashboard', label: t('dashboard'), icon: LayoutDashboard },
        { id: 'sa_schools', label: t('schools'), icon: Building2 },
        { id: 'sa_users', label: t('users'), icon: Users },
        { id: 'sa_settings', label: t('platform_settings'), icon: Settings }
      ];
    }
    if (role === 'teacher') {
      return [
        { id: 't_dashboard', label: t('dashboard'), icon: LayoutDashboard },
        { id: 't_attendance', label: t('attendance'), icon: CalendarCheck },
        { id: 't_grades', label: t('exams_results'), icon: FileSpreadsheet }
      ];
    }
    if (role === 'parent') {
      return [
        { id: 'p_overview', label: t('dashboard'), icon: LayoutDashboard },
        { id: 'p_attendance', label: t('attendance'), icon: CalendarCheck },
        { id: 'p_fees', label: t('fees_payments'), icon: CreditCard }
      ];
    }
    if (role === 'student') {
      return [
        { id: 'st_dashboard', label: t('dashboard'), icon: LayoutDashboard },
        { id: 'st_timetable', label: t('timetable'), icon: CalendarCheck },
        { id: 'st_results', label: t('exams_results'), icon: FileSpreadsheet }
      ];
    }
    if (role === 'accountant') {
      return [
        { id: 'acc_dashboard', label: t('dashboard'), icon: LayoutDashboard },
        { id: 'sch_fees', label: t('fees_payments'), icon: CreditCard },
        { id: 'sch_reports', label: 'Reports', icon: FileSpreadsheet }
      ];
    }
    // School Admin default
    return [
      { id: 'sch_dashboard', label: t('dashboard'), icon: LayoutDashboard },
      { id: 'sch_students', label: t('students'), icon: GraduationCap },
      { id: 'sch_classes', label: `${t('classes')} & ${t('subjects')}`, icon: Layers },
      { id: 'sch_fees', label: t('fees_payments'), icon: CreditCard }
    ];
  };

  const tabs = getQuickTabs();

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-[#E2E8F0] h-14 flex items-center justify-around px-2 z-30 shadow-lg">
      {tabs.map(tab => {
        const Icon = tab.icon;
        const isActive = currentView === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => onNavigate(tab.id)}
            className={`
              flex flex-col items-center justify-center min-w-[54px] min-h-[44px] px-2 rounded-md
              transition-colors
              ${isActive ? 'text-[#0F766E]' : 'text-[#64748B] hover:text-[#132A29]'}
            `}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-medium leading-none mt-1 truncate max-w-[64px]">
              {tab.label}
            </span>
          </button>
        );
      })}

      {/* Menu Drawer Button for all other screens */}
      <button
        onClick={onOpenMenu}
        className="flex flex-col items-center justify-center min-w-[54px] min-h-[44px] px-2 rounded-md text-[#64748B] hover:text-[#132A29]"
      >
        <Menu className="w-5 h-5" />
        <span className="text-[10px] font-medium leading-none mt-1">Menu</span>
      </button>
    </nav>
  );
};
