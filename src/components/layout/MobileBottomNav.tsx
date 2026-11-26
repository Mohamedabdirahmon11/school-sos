/**
 * Role-aware mobile shortcuts plus a dedicated full-menu entry.
 * School Admin uses five primary shortcuts; the drawer is the full navigation.
 * Teacher quick tabs remain registry entries: { id: 't_timetable' }, { id: 't_attendance' }, { id: 't_grades' }.
 */
import React from 'react';
import { Menu, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { hasStaffNavigationPermission } from '../../lib/staff-permissions.ts';
import { getMobileNavigation, type SchoolOSRole } from '../../lib/navigation-registry.ts';

interface MobileBottomNavProps {
  currentView: string;
  onNavigate: (view: string) => void;
  onOpenMenu: () => void;
  isMenuOpen?: boolean;
  onCloseMenu?: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ currentView, onNavigate, onOpenMenu, isMenuOpen = false, onCloseMenu }) => {
  const { user, t } = useAuth();
  const role = (user?.role || 'school_admin') as SchoolOSRole;
  const isSchoolAdmin = role === 'school_admin';
  const tabs = getMobileNavigation(role).filter(route =>
    !route.permission || role !== 'accountant' || hasStaffNavigationPermission(user?.permissions, route.permission)
  );
  const schoolAdminTabs = tabs.filter(route => ['sch_dashboard', 'sch_students', 'sch_teachers', 'sch_attendance', 'sch_classes'].includes(route.id));

  if (role === 'super_admin') {
    const primaryTabs = tabs.filter(route => ['sa_dashboard', 'sa_schools', 'sa_users', 'sa_analytics'].includes(route.id));
    const labels: Record<string, string> = { sa_dashboard: 'Home', sa_schools: 'Schools', sa_users: 'Users', sa_analytics: 'Analytics' };
    return (
      <nav aria-label="Super Admin quick navigation" data-mobile-role="super_admin" className="schoolos-mobile-bottom-nav schoolos-superadmin-bottom-nav md:hidden fixed z-40">
        <div className="schoolos-superadmin-bottom-inner">
          {primaryTabs.map(route => {
            const Icon = route.icon;
            const active = !isMenuOpen && currentView === route.id;
            const label = labels[route.id] || route.label;
            return (
              <button key={route.id} type="button" onClick={() => { onCloseMenu?.(); onNavigate(route.id); }}
                aria-label={label} aria-current={active ? 'page' : undefined} className={`schoolos-superadmin-tab ${active ? 'is-active' : ''}`}>
                <Icon aria-hidden="true" />
                <span>{label}</span>
              </button>
            );
          })}

        </div>
      </nav>
    );
  }

  if (isSchoolAdmin) {
    const shortLabels: Record<string, string> = { sch_dashboard: 'Home', sch_students: 'Students', sch_teachers: 'Teachers', sch_attendance: 'Attend', sch_classes: 'Classes' };
    return (
      <nav
        aria-label="School Admin quick navigation"
        data-mobile-role={role}
        className="schoolos-mobile-bottom-nav schoolos-schooladmin-bottom-nav md:hidden fixed z-40"
      >
        <div className="schoolos-schooladmin-bottom-inner">
          {schoolAdminTabs.map(route => {
            const Icon = route.icon;
            const isActive = !isMenuOpen && currentView === route.id;
            const label = shortLabels[route.id] || (route.labelKey ? t(route.labelKey as any) : route.label);
            return (
              <button
                key={route.id}
                type="button"
                onClick={() => { onCloseMenu?.(); onNavigate(route.id); }}
                aria-label={label}
                aria-current={isActive ? 'page' : undefined}
                className={`schoolos-schooladmin-tab ${isActive ? 'is-active' : ''}`}
              >
                <Icon aria-hidden="true" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    );
  }

  return (
    <nav
      aria-label="Quick navigation"
      data-mobile-role={role}
      className="schoolos-mobile-bottom-nav md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-[#dce7e4] bg-white/95 shadow-[0_-8px_28px_rgba(15,45,40,0.10)] backdrop-blur-xl"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 6px)' }}
    >
      <div className={`${isSchoolAdmin ? 'grid grid-cols-5 school-admin-mobile-quick-grid' : 'flex gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'} min-h-[68px] items-stretch px-2`}>
        {tabs.map(route => {
          const Icon = route.icon;
          const isActive = !(isSchoolAdmin && isMenuOpen) && currentView === route.id;
          const label = route.labelKey ? t(route.labelKey as any) : route.label;
          return (
            <button
              key={route.id}
              type="button"
              onClick={() => { onCloseMenu?.(); onNavigate(route.id); }}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
              title={label}
              className={`schoolos-mobile-quick-action relative flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-xl py-2 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0F766E] active:scale-[0.98] ${isSchoolAdmin ? 'w-full min-w-0 px-0.5' : 'min-w-[68px] flex-1 shrink-0 snap-start px-2'} ${isActive ? 'bg-[#e8f4f1] text-[#0F766E]' : 'text-[#64748B] hover:bg-[#f4f8f7] hover:text-[#132A29]'}`}
            >
              {isActive && <span aria-hidden="true" className="absolute top-0 h-[3px] w-7 rounded-b-full bg-[#0F766E]" />}
              <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
              <span className={`truncate font-semibold leading-tight ${isSchoolAdmin ? 'max-w-full text-[9px] min-[380px]:text-[10px]' : 'max-w-[76px] text-[10px]'}`}>{label}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={isSchoolAdmin && isMenuOpen ? onCloseMenu : onOpenMenu}
          aria-label={isSchoolAdmin && isMenuOpen ? 'Close full navigation menu' : 'Open full navigation menu'}
          aria-expanded={isMenuOpen}
          aria-haspopup="dialog"
          title="Menu"
          className={`schoolos-mobile-menu-action flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-xl py-2 text-[#64748B] transition-colors hover:bg-[#f4f8f7] hover:text-[#132A29] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0F766E] active:scale-[0.98] ${isSchoolAdmin ? 'w-full min-w-0 px-0.5' : 'min-w-[68px] shrink-0 px-2'}`}
        >
          {isSchoolAdmin && isMenuOpen ? <X aria-hidden="true" className="h-5 w-5 shrink-0" /> : <Menu aria-hidden="true" className="h-5 w-5 shrink-0" />}
          <span className="text-[10px] font-semibold leading-tight">Menu</span>
        </button>
      </div>
    </nav>
  );
};
