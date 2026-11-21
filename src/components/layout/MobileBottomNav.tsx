/**
 * Mobile Bottom Navigation Bar
 * Respects the 15% sticky height cap and >= 44px touch targets
 */

import React from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { hasStaffNavigationPermission } from '../../lib/staff-permissions.ts';
import { getNavigationRoute } from '../../lib/navigation-registry.ts';
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

  const quickTab = (id: string, label: string, icon: React.ComponentType<{ className?: string }>) => {
    const route = getNavigationRoute(id);
    return { id: route?.route ?? id, label: label || route?.name || id, icon: route?.icon ?? icon };
  };

  const getQuickTabs = () => {
    if (role === 'super_admin') {
      return [
        quickTab('sa_dashboard', t('dashboard'), LayoutDashboard),
        quickTab('sa_schools', t('schools'), Building2),
        quickTab('sa_users', t('users'), Users),
        quickTab('sa_settings', t('platform_settings'), Settings)
      ];
    }
    if (role === 'teacher') {
      return [
        quickTab('t_dashboard', t('dashboard'), LayoutDashboard),
        quickTab('t_timetable', t('timetable'), CalendarCheck),
        quickTab('t_attendance', t('attendance'), GraduationCap),
        quickTab('t_grades', 'Exam Marks', FileSpreadsheet)
      ];
    }
    if (role === 'parent') {
      return [
        quickTab('p_overview', t('dashboard'), LayoutDashboard),
        quickTab('p_attendance', t('attendance'), CalendarCheck),
        quickTab('p_fees', t('fees_payments'), CreditCard)
      ];
    }
    if (role === 'student') {
      return [
        quickTab('st_dashboard', t('dashboard'), LayoutDashboard),
        quickTab('st_timetable', t('timetable'), CalendarCheck),
        quickTab('st_results', t('exams_results'), FileSpreadsheet)
      ];
    }
    if (role === 'accountant') {
      return [
        quickTab('acc_dashboard', t('dashboard'), LayoutDashboard),
        quickTab('sch_fees', t('fees_payments'), CreditCard),
        quickTab('acc_expenses', 'Expenses', FileText)
      ];
    }
    // School Admin default
    return [
      quickTab('sch_dashboard', t('dashboard'), LayoutDashboard),
      quickTab('sch_students', t('students'), GraduationCap),
      quickTab('sch_classes', t('classes'), Layers),
      quickTab('sch_attendance', t('attendance'), CalendarCheck)
    ];
  };

  const tabs = getQuickTabs().filter(tab => {
    const route = getNavigationRoute(tab.id);
    if (!route || !route.roles.includes(role)) return false;
    if (role !== 'accountant') return true;
    if (tab.id === 'sch_fees' || tab.id === 'acc_expenses') {
      return hasStaffNavigationPermission(user?.permissions, 'fees_manage');
    }
    return true;
  });

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-[#E2E8F0] h-14 flex items-center justify-around px-2 z-30 shadow-lg">
      {tabs.map(tab => {
        const Icon = tab.icon;
        const isActive = currentView === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => onNavigate(tab.id)}
            aria-current={isActive ? 'page' : undefined}
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
