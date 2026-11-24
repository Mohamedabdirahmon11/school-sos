/**
 * Mobile quick navigation generated from the shared role-aware route registry.
 * Keep every role-aware destination reachable on narrow screens without squeezing labels.
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
    <nav
      aria-label="Quick navigation"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-[#dce7e4] bg-white/95 shadow-[0_-8px_28px_rgba(15,45,40,0.10)] backdrop-blur-md"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 6px)' }}
    >
      <div className="flex min-h-[64px] items-stretch gap-1 overflow-x-auto overscroll-x-contain px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map(route => {
          const Icon = route.icon;
          const isActive = currentView === route.id;
          const label = route.labelKey ? t(route.labelKey as any) : route.label;
          return (
            <button
              key={route.id}
              type="button"
              onClick={() => onNavigate(route.id)}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
              title={label}
              className={`relative flex min-h-[58px] min-w-[68px] flex-1 shrink-0 snap-start flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0F766E] active:scale-[0.98] ${isActive ? 'bg-[#e8f4f1] text-[#0F766E]' : 'text-[#64748B] hover:bg-[#f4f8f7] hover:text-[#132A29]'}`}
            >
              {isActive && <span aria-hidden="true" className="absolute top-0 h-[3px] w-7 rounded-b-full bg-[#0F766E]" />}
              <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
              <span className="max-w-[76px] truncate text-[10px] font-semibold leading-tight">{label}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open full navigation menu"
          title="Menu"
          className="flex min-h-[58px] min-w-[68px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[#64748B] transition-colors hover:bg-[#f4f8f7] hover:text-[#132A29] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0F766E] active:scale-[0.98]"
        >
          <Menu aria-hidden="true" className="h-5 w-5 shrink-0" />
          <span className="text-[10px] font-semibold leading-tight">Menu</span>
        </button>
      </div>
    </nav>
  );
};
