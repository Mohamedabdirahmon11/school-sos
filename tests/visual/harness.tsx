import React from 'react';
import { createRoot } from 'react-dom/client';
import { TeacherPortalView } from '../../src/components/teacher/TeacherPortalView.tsx';
import { MessagesView } from '../../src/components/schooladmin/MessagesView.tsx';
import { StaffPayslipsView } from '../../src/components/accountant/AccountantPayrollView.tsx';
import { SchoolSetupWizard } from '../../src/components/schooladmin/SchoolSetupWizard.tsx';
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
  if (component === 'setup') return <SchoolSetupWizard onNavigate={() => undefined} onComplete={async () => undefined} />;
  if (section === 'messages') return <MessagesView />;
  if (section === 'payslip') return <StaffPayslipsView />;
  return <TeacherPortalView initialTab={(tabs[section] || 'dashboard') as any} />;
}
createRoot(document.getElementById('root')!).render(<Harness />);
