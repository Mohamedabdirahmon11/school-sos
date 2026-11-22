const translate = (key: string) => ({
  payroll_payslip: 'Payslip',
  payroll_empty: 'No payslips have been published yet.',
  payroll_loading: 'Loading payslips',
  payroll_error: 'Unable to load payslips'
} as Record<string, string>)[key] || key;
const user = { id: 'teacher-visual-001', role: 'teacher', fullName: 'Amina Teacher', staffId: 'T-001', teacherCode: 'T-001', phone: '+251900000001' };
const school = { id: 'school-visual-001', name: 'SchoolOS Test Academy', code: 'TEST01', timezone: 'Africa/Addis_Ababa', currency: 'ETB', academicYear: '2026-2027', brandColor: '#0e6a62', subscription: { status: 'active' }, setupData: { calendar: 'ethiopian' } };
export function useAuth() {
  return { user, school, isReadOnly: false, language: 'en', t: translate } as any;
}
