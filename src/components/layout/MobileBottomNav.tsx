/**
 * Mobile quick navigation generated from the shared role-aware route registry.
 * Teacher quick tabs are registry entries: { id: 't_timetable' }, { id: 't_attendance' }, { id: 't_grades' }.
 */
import React from 'react';
import { Menu } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { hasStaffNavigationPermission } from '../../lib/staff-permissions.ts';
import { getMobileNavigation, type SchoolOSRole } from '../../lib/navigation-registry.ts';

interface MobileBottomNavProps {
  currentView: string;
  onNavigate: (view: string) => void;
  onOpenMenu: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ currentView, onNavigate, onOpenMenu }) => {
  const { user, t } = useAuth();
  const role = (user?.role || 'school_admin') as SchoolOSRole;
  const tabs = getMobileNavigation(role).filter(route =>
    !route.permission || role !== 'accountant' || hasStaffNavigationPermission(user?.permissions, route.permission)
  );

  return (
    <nav aria-label="Quick navigation" className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-[#E2E8F0] min-h-14 flex items-center justify-around px-2 pb-[env(safe-area-inset-bottom)] z-30 shadow-lg">
      {tabs.map(route => {
        const Icon = route.icon;
        const isActive = currentView === route.id;
        const label = route.labelKey ? t(route.labelKey as any) : route.label;
        return (
          <button
            key={route.id}
            type="button"
            onClick={() => onNavigate(route.id)}
            aria-current={isActive ? 'page' : undefined}
            className={`flex flex-col items-center justify-center min-w-[54px] min-h-[44px] px-2 rounded-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F766E] ${isActive ? 'text-[#0F766E]' : 'text-[#64748B] hover:text-[#132A29]'}`}
          >
            <Icon aria-hidden="true" className="w-5 h-5" />
            <span className="text-[10px] font-medium leading-none mt-1 truncate max-w-[64px]">{label}</span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Open full navigation menu"
        className="flex flex-col items-center justify-center min-w-[54px] min-h-[44px] px-2 rounded-md text-[#64748B] hover:text-[#132A29] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F766E]"
      >
        <Menu aria-hidden="true" className="w-5 h-5" />
        <span className="text-[10px] font-medium leading-none mt-1">Menu</span>
      </button>
    </nav>
  );
};
