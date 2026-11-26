/**
 * Role-aware mobile shortcuts plus a dedicated full-menu entry.
 * School Admin has five shortcuts; its full menu opens from the header (top-left).
 * Teacher quick tabs remain registry entries: { id: 't_timetable' }, { id: 't_attendance' }, { id: 't_grades' }.
 */
import React from 'react';
import { Menu, X, UserCircle2 } from 'lucide-react';
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

  if (isSchoolAdmin) {
    const shortLabels: Record<string, string> = { sch_dashboard: 'Dashboard', sch_students: 'Students', sch_teachers: 'Teachers', sch_attendance: 'Attendance' };
    return (
      <nav
        aria-label="Quick navigation"
        data-mobile-role={role}
        className="schoolos-mobile-bottom-nav md:hidden fixed z-40"
        style={{ left: 14, right: 14, bottom: 'calc(14px + env(safe-area-inset-bottom, 0px))', background: '#fff', borderRadius: 26, boxShadow: '0 12px 34px rgba(15,45,40,.22), 0 2px 6px rgba(15,45,40,.08)', padding: '6px 4px' }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', alignItems: 'center', minHeight: 58 }}>
          {tabs.map(route => {
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
                style={{ minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, padding: '6px 0', background: 'transparent', border: 0, color: isActive ? '#132a29' : '#a3adb5' }}
              >
                <Icon aria-hidden="true" style={{ width: 23, height: 23, color: isActive ? '#19a58f' : '#a3adb5' }} strokeWidth={1.7} />
                <span style={{ maxWidth: '100%', fontSize: 10, fontWeight: 600, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => { onCloseMenu?.(); window.dispatchEvent(new Event('schoolos:open-profile')); }}
            aria-label="Profile"
            title="Profile"
            style={{ minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, padding: '6px 0', background: 'transparent', border: 0, color: '#a3adb5' }}
          >
            <UserCircle2 aria-hidden="true" style={{ width: 23, height: 23, color: '#a3adb5' }} strokeWidth={1.7} />
            <span style={{ fontSize: 10, fontWeight: 600, lineHeight: 1.1 }}>Profile</span>
          </button>
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
