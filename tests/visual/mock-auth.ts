const translate = (key: string) => ({
  payroll_payslip: 'Payslip',
  payroll_empty: 'No payslips have been published yet.',
  payroll_loading: 'Loading payslips',
  payroll_error: 'Unable to load payslips'
} as Record<string, string>)[key] || key;
const visualParams = new URLSearchParams(window.location.search);
const studentMode = visualParams.get('component') === 'student';
const parentMode = visualParams.get('component') === 'parent';
const user = parentMode
  ? { id: 'parent-user-visual-001', role: 'parent', fullName: 'Amina Parent', phone: '+251911000001', linkedStudentIds: ['student-001','student-002','student-003'] }
  : studentMode
  ? { id: 'student-user-visual-001', role: 'student', fullName: 'Faadumo Axmed Cabdi', studentId: 'ST-0421' }
  : { id: 'teacher-visual-001', role: 'teacher', fullName: 'Amina Teacher', staffId: 'T-001', teacherCode: 'T-001', phone: '+251900000001' };
const school = { id: 'school-visual-001', name: 'SchoolOS Test Academy', code: 'TEST01', timezone: 'Africa/Addis_Ababa', currency: 'ETB', academicYear: '2026-2027', brandColor: '#0e6a62', subscription: { status: 'active' }, setupData: { calendar: 'ethiopian' }, studentAccessEnabled: true };
export function useAuth() {
  return { user, school, isReadOnly: false, language: 'en', t: translate } as any;
}
