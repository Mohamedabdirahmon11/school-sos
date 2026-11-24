import React from 'react';
import { createRoot } from 'react-dom/client';
import { TeacherPortalView } from '../../src/components/teacher/TeacherPortalView.tsx';
import { StudentPortalView } from '../../src/components/student/StudentPortalView.tsx';
import { ParentPortalView } from '../../src/components/parent/ParentPortalView.tsx';
import { MessagesView } from '../../src/components/schooladmin/MessagesView.tsx';
import { StaffPayslipsView } from '../../src/components/accountant/AccountantPayrollView.tsx';
import { SchoolSetupWizard } from '../../src/components/schooladmin/SchoolSetupWizard.tsx';
import { TeachersView } from '../../src/components/schooladmin/TeachersView.tsx';
import { ParentsView } from '../../src/components/schooladmin/ParentsView.tsx';
import { AdmissionsView } from '../../src/components/schooladmin/AdmissionsView.tsx';
import { StaffAccessView } from '../../src/components/schooladmin/StaffAccessView.tsx';
import './harness.css';

const params = new URLSearchParams(window.location.search);
const section = params.get('section') || 'dashboard';
const component = params.get('component') || 'teacher';
const theme = params.get('theme') || 'light';
document.documentElement.setAttribute('data-theme', theme);
const tabs: Record<string, string> = {
  dashboard: 'dashboard', timetable: 'timetable', students: 'students', attendance: 'attendance',
  marks: 'grades', homework: 'assignments', notices: 'notices', profile: 'profile'
};
function Harness() {
  if (component === 'people-admin') {
    if (section === 'teachers') return <TeachersView />;
    if (section === 'parents') return <ParentsView />;
    if (section === 'admissions') return <AdmissionsView />;
    if (section === 'roles') return <StaffAccessView />;
  }
  if (component === 'setup') return <SchoolSetupWizard onNavigate={() => undefined} onComplete={async () => undefined} />;
  if (component === 'student') return <StudentPortalView />;
  if (component === 'parent') return <ParentPortalView />;
  if (section === 'messages') return <MessagesView />;
  if (section === 'payslip') return <StaffPayslipsView />;
  return <TeacherPortalView initialTab={(tabs[section] || 'dashboard') as any} />;
}
createRoot(document.getElementById('root')!).render(<Harness />);
