/**
 * SchoolOS Enterprise Multi-School SaaS Platform Entry Hub
 */

import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { Header } from './components/layout/Header.tsx';
import { Sidebar } from './components/layout/Sidebar.tsx';
import { MobileBottomNav } from './components/layout/MobileBottomNav.tsx';
import { ReadOnlyBanner } from './components/common/ReadOnlyBanner.tsx';
import { LoginView } from './components/auth/LoginView.tsx';
import { ForcePasswordChangeModal } from './components/auth/ForcePasswordChangeModal.tsx';
import { PrintIDCardModal } from './components/common/PrintIDCardModal.tsx';
import { AppErrorBoundary } from './components/common/AppErrorBoundary.tsx';
import { LoadingState, ErrorState } from './components/common/AsyncState.tsx';
import { ApiClient } from './services/api.ts';
import { isSchoolSetupProgressComplete, SCHOOL_SETUP_ALLOWED_VIEWS } from './lib/school-setup-navigation.ts';
import { hasStaffNavigationPermission } from './lib/staff-permissions.ts';
import { getNavigationRoute, type SchoolOSRole } from './lib/navigation-registry.ts';

const SuperAdminDashboard = React.lazy(() => import('./components/superadmin/SuperAdminDashboard.tsx').then(module => ({ default: module.SuperAdminDashboard })));
const SchoolsView = React.lazy(() => import('./components/superadmin/SchoolsView.tsx').then(module => ({ default: module.SchoolsView })));
const PlansBillingView = React.lazy(() => import('./components/superadmin/PlansBillingView.tsx').then(module => ({ default: module.PlansBillingView })));
const GlobalUsersView = React.lazy(() => import('./components/superadmin/GlobalUsersView.tsx').then(module => ({ default: module.GlobalUsersView })));
const AnalyticsView = React.lazy(() => import('./components/superadmin/AnalyticsView.tsx').then(module => ({ default: module.AnalyticsView })));
const BroadcastsView = React.lazy(() => import('./components/superadmin/BroadcastsView.tsx').then(module => ({ default: module.BroadcastsView })));
const SupportAuditView = React.lazy(() => import('./components/superadmin/SupportAuditView.tsx').then(module => ({ default: module.SupportAuditView })));
const PlatformSettingsView = React.lazy(() => import('./components/superadmin/PlatformSettingsView.tsx').then(module => ({ default: module.PlatformSettingsView })));
const SchoolDashboard = React.lazy(() => import('./components/schooladmin/SchoolDashboard.tsx').then(module => ({ default: module.SchoolDashboard })));
const SchoolSetupWizard = React.lazy(() => import('./components/schooladmin/SchoolSetupWizard.tsx').then(module => ({ default: module.SchoolSetupWizard })));
const StudentsView = React.lazy(() => import('./components/schooladmin/StudentsView.tsx').then(module => ({ default: module.StudentsView })));
const TeachersView = React.lazy(() => import('./components/schooladmin/TeachersView.tsx').then(module => ({ default: module.TeachersView })));
const ParentsView = React.lazy(() => import('./components/schooladmin/ParentsView.tsx').then(module => ({ default: module.ParentsView })));
const ClassesView = React.lazy(() => import('./components/schooladmin/ClassesView.tsx').then(module => ({ default: module.ClassesView })));
const ClassesSubjectsView = React.lazy(() => import('./components/schooladmin/ClassesSubjectsView.tsx').then(module => ({ default: module.ClassesSubjectsView })));
const SubjectsView = React.lazy(() => import('./components/schooladmin/SubjectsView.tsx').then(module => ({ default: module.SubjectsView })));
const CurriculumView = React.lazy(() => import('./components/schooladmin/CurriculumView.tsx').then(module => ({ default: module.CurriculumView })));
const AcademicsWorkspace = React.lazy(() => import('./components/schooladmin/AcademicsWorkspace.tsx').then(module => ({ default: module.AcademicsWorkspace })));
const TeacherAssignmentsView = React.lazy(() => import('./components/schooladmin/TeacherAssignmentsView.tsx').then(module => ({ default: module.TeacherAssignmentsView })));
const AttendanceView = React.lazy(() => import('./components/schooladmin/AttendanceView.tsx').then(module => ({ default: module.AttendanceView })));
const ExamsResultsView = React.lazy(() => import('./components/schooladmin/ExamsResultsView.tsx').then(module => ({ default: module.ExamsResultsView })));
const FeesLedgerView = React.lazy(() => import('./components/schooladmin/FeesLedgerView.tsx').then(module => ({ default: module.FeesLedgerView })));
const StudentInvoicesView = React.lazy(() => import('./components/schooladmin/StudentInvoicesView.tsx').then(module => ({ default: module.StudentInvoicesView })));
const ReportCardsView = React.lazy(() => import('./components/schooladmin/ReportCardsView.tsx').then(module => ({ default: module.ReportCardsView })));
const DocumentsView = React.lazy(() => import('./components/documents/DocumentsView.tsx').then(module => ({ default: module.DocumentsView })));
const AdmissionsView = React.lazy(() => import('./components/schooladmin/AdmissionsView.tsx').then(module => ({ default: module.AdmissionsView })));
const ExtraModulesView = React.lazy(() => import('./components/schooladmin/ExtraModulesView.tsx').then(module => ({ default: module.ExtraModulesView })));
const SchoolSettingsView = React.lazy(() => import('./components/schooladmin/SchoolSettingsView.tsx').then(module => ({ default: module.SchoolSettingsView })));
const SchoolSupportView = React.lazy(() => import('./components/schooladmin/SchoolSupportView.tsx').then(module => ({ default: module.SchoolSupportView })));
const YearEndPromotionView = React.lazy(() => import('./components/schooladmin/YearEndPromotionView.tsx').then(module => ({ default: module.YearEndPromotionView })));
const NoticesEventsView = React.lazy(() => import('./components/schooladmin/NoticesEventsView.tsx').then(module => ({ default: module.NoticesEventsView })));
const MessagesView = React.lazy(() => import('./components/schooladmin/MessagesView.tsx').then(module => ({ default: module.MessagesView })));
const WhatsAppRemindersView = React.lazy(() => import('./components/schooladmin/WhatsAppRemindersView.tsx').then(module => ({ default: module.WhatsAppRemindersView })));
const StaffAccessView = React.lazy(() => import('./components/schooladmin/StaffAccessView.tsx').then(module => ({ default: module.StaffAccessView })));
const ReportsView = React.lazy(() => import('./components/schooladmin/ReportsView.tsx').then(module => ({ default: module.ReportsView })));
const AccountantDashboard = React.lazy(() => import('./components/accountant/AccountantDashboard.tsx').then(module => ({ default: module.AccountantDashboard })));
const AccountantExpensesView = React.lazy(() => import('./components/accountant/AccountantExpensesView.tsx').then(module => ({ default: module.AccountantExpensesView })));
const AccountantBankReconciliationView = React.lazy(() => import('./components/accountant/AccountantBankReconciliationView.tsx').then(module => ({ default: module.AccountantBankReconciliationView })));
const AccountantPayrollView = React.lazy(() => import('./components/accountant/AccountantPayrollView.tsx').then(module => ({ default: module.AccountantPayrollView })));
const StaffPayslipsView = React.lazy(() => import('./components/accountant/AccountantPayrollView.tsx').then(module => ({ default: module.StaffPayslipsView })));
const TeacherPortalView = React.lazy(() => import('./components/teacher/TeacherPortalView.tsx').then(module => ({ default: module.TeacherPortalView })));
const ParentPortalView = React.lazy(() => import('./components/parent/ParentPortalView.tsx').then(module => ({ default: module.ParentPortalView })));
const StudentPortalView = React.lazy(() => import('./components/student/StudentPortalView.tsx').then(module => ({ default: module.StudentPortalView })));

const AppContent: React.FC = () => {
  const { user, school, inspectedSchool, isLoading, refreshUser, t } = useAuth();
  const [apiFailure, setApiFailure] = useState<{ status: number; message: string; code?: string } | null>(null);
  const [currentView, setCurrentView] = useState<string>('default');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedIDCardStudent, setSelectedIDCardStudent] = useState<any | null>(null);

  React.useEffect(() => {
    const onApiError = (event: Event) => {
      const detail = (event as CustomEvent<{ status: number; message: string; code?: string }>).detail;
      if (detail?.code === 'NETWORK_UNREACHABLE') setApiFailure(detail);
    };
    window.addEventListener('schoolos:api-error', onApiError);
    return () => window.removeEventListener('schoolos:api-error', onApiError);
  }, []);

  React.useEffect(() => { if (user) setApiFailure(null); }, [user]);

  React.useEffect(() => {
    if (!user || !['sch_notices', 't_notices', 'p_notices', 'st_notices'].includes(currentView)) return;
    let active = true;
    void ApiClient.getNotices({ page: 1, pageSize: 100 }).then(notices => active
      ? ApiClient.markNoticesRead(notices.map(notice => notice.id))
      : undefined).catch(() => undefined);
    return () => { active = false; };
  }, [currentView, user?.id]);

  if (isLoading) return <LoadingState label="Initializing SchoolOS Platform…" className="min-h-screen border-0 bg-[#F3F6F6]" />;

  // Not logged in -> Show Multi-Role Login Screen
  if (!user) {
    return <LoginView />;
  }

  // First-login accounts must finish password setup before any dashboard
  // screen mounts and starts role-scoped requests that could raise a 403.
  if (user.mustChangePassword) {
    return <ForcePasswordChangeModal />;
  }

  if (apiFailure) {
    const failure = Object.assign(new Error(apiFailure.message), {
      status: apiFailure.status,
      code: apiFailure.code
    });
    return <div className="min-h-screen bg-[#F3F6F6] flex items-center justify-center p-4">
      <ErrorState error={failure} onRetry={() => window.location.reload()} />
    </div>;
  }

  // Determine active default view based on role
  const getEffectiveView = () => {
    if (currentView !== 'default') return currentView;
    if (user.role === 'super_admin' && !inspectedSchool) return 'sa_dashboard';
    if (user.role === 'teacher') return 't_dashboard';
    if (user.role === 'parent') return 'p_overview';
    if (user.role === 'student') return 'st_dashboard';
    if (user.role === 'accountant') return 'acc_dashboard';
    return 'sch_dashboard';
  };

  const setupRequired = user.role === 'school_admin' && !isSchoolSetupProgressComplete(school?.setupProgress);
  const requestedView = setupRequired && currentView === 'default' ? 'sch_setup' : getEffectiveView();
  const activeView = setupRequired
    ? (SCHOOL_SETUP_ALLOWED_VIEWS.has(requestedView) ? requestedView : 'sch_setup')
    : user.role === 'school_admin' && ['sch_fees', 'sch_payroll'].includes(requestedView) ? 'sch_dashboard'
      : user.role === 'accountant' && (
        (requestedView === 'sch_fees' || requestedView === 'sch_student_invoices') && !hasStaffNavigationPermission(user.permissions, 'fees_manage')
        || requestedView === 'acc_expenses' && !hasStaffNavigationPermission(user.permissions, 'fees_manage')
        || requestedView === 'acc_bank_reconciliation' && !hasStaffNavigationPermission(user.permissions, 'fees_manage')
        || requestedView === 'sch_payroll' && !hasStaffNavigationPermission(user.permissions, 'payroll_manage')
        || requestedView === 'sch_reports' && !hasStaffNavigationPermission(user.permissions, 'reports_export')
      ) ? 'acc_dashboard' : requestedView;

  const activeRoute = getNavigationRoute(activeView);

  const handleNavigate = (view: string) => {
    const route = getNavigationRoute(view);
    if (!route || !route.roles.includes(user.role as SchoolOSRole)) {
      console.warn(`[navigation] Ignored unregistered or unauthorized route: ${view}`);
      return;
    }
    if (setupRequired && !SCHOOL_SETUP_ALLOWED_VIEWS.has(view)) {
      setCurrentView('sch_setup');
      return;
    }
    setCurrentView(view);
  };

  const handleSetupComplete = async () => {
    await refreshUser();
    setCurrentView('sch_dashboard');
  };

  return (
    <div data-active-route={activeRoute?.id} data-active-route-label={activeRoute?.label} className={`h-[100dvh] min-h-0 overflow-hidden bg-[#F3F6F6] flex flex-col antialiased font-sans text-[#132A29] ${user.role === 'accountant' ? 'accountant-design' : user.role === 'school_admin' ? 'school-admin-design school-admin-role' : inspectedSchool ? 'school-admin-design school-admin-inspected' : user.role === 'super_admin' ? 'super-admin-design' : ''}`}>
      {/* Forced Password Change Modal for First-Time Staff Sign-in */}
      <ForcePasswordChangeModal />

      {/* Printable ID Card Modal */}
      {selectedIDCardStudent && (
        <PrintIDCardModal
          student={selectedIDCardStudent}
          school={school}
          onClose={() => setSelectedIDCardStudent(null)}
        />
      )}

      {/* Read-Only or Grace Period Banner */}
      <ReadOnlyBanner onRenewClick={() => setCurrentView(user.role === 'super_admin' ? 'sa_schools' : 'sch_support')} />

      <div className="min-h-0 flex-1 flex overflow-hidden">
        {/* Keep first-time School Admins in setup until the required checklist is complete. */}
        {!setupRequired && (
          <Sidebar
            currentView={activeView}
            onNavigate={handleNavigate}
            isOpenMobile={mobileMenuOpen}
            onCloseMobile={() => setMobileMenuOpen(false)}
          />
        )}

        {/* Main Viewport Hub */}
        <div className="min-h-0 flex-1 flex flex-col min-w-0 overflow-hidden">
          {!setupRequired && <Header currentView={activeView} onNavigate={handleNavigate} />}

          <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-16 md:pb-6">
            {setupRequired && activeView !== 'sch_setup' && (
              <div className="mx-auto w-full max-w-6xl px-4 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-950">
                  <span>{t('setup_in_progress')}</span>
                  <button type="button" onClick={() => setCurrentView('sch_setup')} className="rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-800">
                    {t('setup_return')}
                  </button>
                </div>
              </div>
            )}
            <React.Suspense fallback={<LoadingState label="Loading screen…" className="mx-4 my-6" />}>
            {activeView === 'sch_setup' && (
              <SchoolSetupWizard onNavigate={handleNavigate} onComplete={handleSetupComplete} />
            )}

            {/* SUPER ADMIN ROUTING */}
            {activeView === 'sa_dashboard' && (
              <SuperAdminDashboard
                onNavigate={handleNavigate}
                onOpenAddSchool={() => setCurrentView('sa_schools')}
              />
            )}
            {activeView === 'sa_schools' && (
              <SchoolsView />
            )}
            {activeView === 'sa_plans' && (
              <PlansBillingView />
            )}
            {activeView === 'sa_users' && (
              <GlobalUsersView />
            )}
            {activeView === 'sa_analytics' && (
              <AnalyticsView />
            )}
            {activeView === 'sa_broadcasts' && (
              <BroadcastsView />
            )}
            {activeView === 'sa_support' && (
              <SupportAuditView />
            )}
            {activeView === 'sa_settings' && (
              <PlatformSettingsView />
            )}

            {/* SCHOOL ADMIN ROUTING */}
            {activeView === 'sch_dashboard' && (
              <SchoolDashboard
                onNavigate={handleNavigate}
                onOpenAddStudent={() => setCurrentView('sch_students')}
              />
            )}
            {activeView === 'sch_students' && (
              <StudentsView
                onPrintIDCard={std => setSelectedIDCardStudent(std)}
              />
            )}
            {activeView === 'sch_teachers' && (
              <TeachersView />
            )}
            {activeView === 'sch_parents' && (
              <ParentsView />
            )}
            {activeView === 'sch_classes' && (
              <ClassesView onNavigate={handleNavigate} />
            )}
            {activeView === 'sch_subjects' && (
              <SubjectsView />
            )}
            {activeView === 'sch_curriculum' && (
              <CurriculumView onNavigate={handleNavigate} />
            )}
            {activeView === 'sch_teacher_assignments' && (
              <TeacherAssignmentsView onNavigate={handleNavigate} />
            )}
            {['sch_timetable', 'sch_marks', 'sch_exams'].includes(activeView) && (
              <AcademicsWorkspace activeView={activeView} onNavigate={handleNavigate} />
            )}
            {activeView === 'sch_attendance' && (
              <AttendanceView />
            )}
            {activeView === 'sch_marks_approval' && (
              <ExamsResultsView initialTab="approval" />
            )}
            {activeView === 'sch_fees' && (
              <FeesLedgerView />
            )}
            {activeView === 'sch_student_invoices' && (
              <StudentInvoicesView />
            )}
            {activeView === 'sch_promotion' && (
              <YearEndPromotionView />
            )}
            {(activeView === 'sch_events' || activeView === 'sch_notices') && (
              <NoticesEventsView initialTab={activeView === 'sch_notices' ? 'notices' : 'events'} />
            )}
            {activeView === 'sch_messages' && (
              <MessagesView />
            )}
            {activeView === 'sch_whatsapp' && user.role === 'school_admin' && (
              <WhatsAppRemindersView />
            )}
            {activeView === 'sch_staff' && (
              <StaffAccessView />
            )}
            {activeView === 'sch_reports' && (
              <ReportsView />
            )}
            {activeView === 'sch_report_cards' && (
              <ReportCardsView />
            )}
            {activeView === 'sch_documents' && ['school_admin','super_admin','teacher','accountant','parent','student'].includes(user.role) && (
              <DocumentsView />
            )}
            {activeView === 'sch_admissions' && (
              <AdmissionsView />
            )}
            {(activeView === 'sch_settings' || activeView === 'sch_setup_academics') && (
              <SchoolSettingsView key={activeView} initialTab={activeView === 'sch_setup_academics' ? 'academics' : 'identity'} />
            )}
            {activeView === 'sch_support' && (
              <SchoolSupportView />
            )}

            {/* ACCOUNTANT ROUTING */}
            {activeView === 'acc_dashboard' && (
              <AccountantDashboard />
            )}

            {/* Extra Modules Routing */}
            {activeView === 'sch_library' && (
              <ExtraModulesView initialSubModule="library" />
            )}
            {activeView === 'sch_transport' && (
              <ExtraModulesView initialSubModule="transport" />
            )}
            {activeView === 'sch_discipline' && (
              <ExtraModulesView initialSubModule="discipline" />
            )}
            {activeView === 'sch_health' && (
              <ExtraModulesView initialSubModule="health" />
            )}
            {activeView === 'acc_expenses' && user.role === 'accountant' && (
              <AccountantExpensesView />
            )}
            {activeView === 'acc_bank_reconciliation' && user.role === 'accountant' && (
              <AccountantBankReconciliationView />
            )}
            {activeView === 'sch_payroll' && (
              user.role === 'accountant' ? <AccountantPayrollView /> : null
            )}
            {activeView === 'sch_inventory' && (
              <ExtraModulesView initialSubModule="inventory" />
            )}

            {/* TEACHER ROUTING */}
            {activeView === 't_payslips' && <StaffPayslipsView />}
            {activeView === 't_messages' && <MessagesView />}
            {activeView.startsWith('t_') && activeView !== 't_payslips' && activeView !== 't_messages' && (
              <TeacherPortalView
                initialTab={activeView.replace('t_', '') as any}
              />
            )}

            {/* PARENT ROUTING */}
            {activeView === 'p_messages' ? <MessagesView /> : activeView.startsWith('p_') && (
              <ParentPortalView />
            )}

            {/* STUDENT ROUTING */}
            {activeView === 'st_messages' ? <MessagesView /> : activeView.startsWith('st_') && (
              <StudentPortalView />
            )}
            </React.Suspense>
          </main>
        </div>
      </div>

      {/* Mobile Touch Bottom Navigation */}
      {!setupRequired && (
        <MobileBottomNav
          currentView={activeView}
          onNavigate={handleNavigate}
          onOpenMenu={() => setMobileMenuOpen(true)}
        />
      )}
    </div>
  );
};

export default function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider><AppContent /></AuthProvider>
    </AppErrorBoundary>
  );
}
