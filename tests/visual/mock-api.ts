const klass = { id: 'class-4a', name: 'Grade 4', section: 'A', classTeacherId: 'teacher-visual-001', academicYear: '2026-2027' };
const math = { id: 'subject-math', name: 'Mathematics', code: 'MATH' };
const science = { id: 'subject-science', name: 'Environmental Science', code: 'ENV' };
const teacher = { id: 'teacher-visual-001', fullName: 'Amina Teacher', staffId: 'TCH-001', phone: '+251911000001', status: 'active' };
const term = { id: 'term-visual-001', name: 'Semester 1', startDate: '2026-09-01', endDate: '2027-01-20', isCurrent: true };
const students = [
  { id: 'student-001', studentId: 'ST-001', firstName: 'Ayaan', middleName: 'Test', lastName: 'Student', gender: 'female', rollNumber: '1', fatherPhone: '+251911000001', motherPhone: '+251922000001', classId: klass.id, status: 'active' },
  { id: 'student-002', studentId: 'ST-002', firstName: 'Bilal', middleName: '', lastName: 'Student', gender: 'male', rollNumber: '2', fatherPhone: '+251911000002', motherPhone: '', classId: klass.id, status: 'active' },
  { id: 'student-003', studentId: 'ST-003', firstName: 'Hodan', middleName: '', lastName: 'Student', gender: 'female', rollNumber: '3', fatherPhone: '+251911000003', motherPhone: '', classId: klass.id, status: 'active' }
];
const assignments = [
  { id: 'assignment-math', classId: klass.id, class: klass, subject: math, teacherName: 'Amina Teacher', isFormTeacher: false },
  { id: 'assignment-science', classId: klass.id, class: klass, subject: science, teacherName: 'Amina Teacher', isFormTeacher: false }
];
const examConfig = {
  smallExamName: 'Continuous Assessment', smallExamMax: 40, bigExamName: 'Final Examination', bigExamMax: 60,
  lockedSemesters: [], passMarkPercentage: 50,
  assessmentComponents: [
    { id: 'test-1', name: 'Test 1', maxMarks: 10, category: 'continuous', order: 1 },
    { id: 'test-2', name: 'Test 2', maxMarks: 10, category: 'continuous', order: 2 },
    { id: 'test-3', name: 'Test 3', maxMarks: 10, category: 'continuous', order: 3 },
    { id: 'test-4', name: 'Test 4', maxMarks: 10, category: 'continuous', order: 4 },
    { id: 'final-exam', name: 'Final Examination', maxMarks: 60, category: 'final', order: 5 }
  ]
};
const timetable = [
  { id: 'slot-1', classId: klass.id, subjectId: math.id, dayOfWeek: 'Monday', periodNumber: 1, startTime: '08:00', endTime: '08:45', roomNumber: 'Room 4', subjectName: math.name, className: 'Grade 4 · A' },
  { id: 'slot-2', classId: klass.id, subjectId: science.id, dayOfWeek: 'Tuesday', periodNumber: 2, startTime: '08:45', endTime: '09:30', roomNumber: 'Room 4', subjectName: science.name, className: 'Grade 4 · A' },
  { id: 'slot-3', classId: klass.id, subjectId: math.id, dayOfWeek: 'Thursday', periodNumber: 3, startTime: '09:30', endTime: '10:15', roomNumber: 'Room 4', subjectName: math.name, className: 'Grade 4 · A' }
];
const setupChecklist: Record<number, any> = {
  1: { ready: true, optional: false, reason: '' }, 2: { ready: true, optional: false, reason: '' },
  3: { ready: true, optional: false, reason: '' }, 4: { ready: true, optional: false, reason: '' },
  5: { ready: true, optional: false, reason: '' }, 0: { ready: true, optional: false, reason: '' },
  6: { ready: true, optional: false, reason: '' }, 7: { ready: true, optional: true, reason: '' },
  8: { ready: true, optional: false, reason: '' }, 9: { ready: true, optional: true, reason: '' }
};
const setupState = {
  progress: { currentStep: 10, completedSteps: [0, 1, 2, 3, 4, 5, 6, 8], skippedSteps: [7, 9], completedAt: null },
  checklist: setupChecklist, canFinish: true
};
const values: Record<string, (...args: any[]) => Promise<any>> = {
  getTeacherSubjectAssignments: async () => assignments,
  getClasses: async () => [klass],
  getSubjects: async () => [math, science],
  getTeachers: async () => [teacher],
  getStudents: async () => students,
  getTimetableTerms: async () => [term],
  getExamConfig: async () => examConfig,
  getTimetable: async () => timetable,
  getMyFormTeacherClasses: async () => [klass],
  getNotices: async () => [],
  getPublishedExamSchedules: async () => [],
  getTeacherExamInvigilation: async () => [],
  getSchoolDashboard: async () => ({ stats: { totalStudents: students.length, attendanceRate: 67 }, totalClasses: 1, totalPeriodsPerWeek: timetable.length, openHomeworkCount: 0, attendanceRecordedToday: 2, todayAttendance: 2 }),
  getAssignments: async () => [],
  getAllStudents: async () => students,
  getDailyAttendance: async () => [],
  getMarks: async () => [],
  getFormTeacherComments: async () => [],
  getMessages: async () => [],
  getMessageContacts: async () => [],
  getMyPayslips: async () => [],
  getSchoolSetupData: async () => ({ data: { schoolInformation: { name: 'SchoolOS Test Academy', address: 'Main Street', city: 'Jijiga', phone: '+251911000001', email: 'office@example.test', whatsappPhone: '+251911000001', schoolType: 'combined' }, academicYear: { name: '2026/2027', startDate: '2026-09-01', endDate: '2027-06-30', isCurrent: true }, terms: [{ name: 'Semester 1', startDate: '2026-09-01', endDate: '2027-01-20' }, { name: 'Semester 2', startDate: '2027-02-01', endDate: '2027-06-30' }], calendar: { workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], weeklyHolidays: ['Saturday', 'Sunday'], nationalHolidays: [], schoolHolidays: [], calendarType: 'both' }, workingHours: { openingTime: '07:30', classStartTime: '08:00', closingTime: '16:00', breakStartTime: '10:00', breakEndTime: '10:30', periodsPerDay: 8 }, completedSteps: [1, 2, 3, 4, 5] }, school: { name: 'SchoolOS Test Academy', address: 'Main Street', city: 'Jijiga', phone: '+251911000001', email: 'office@example.test', whatsappPhone: '+251911000001', schoolType: 'combined', logoUrl: '' } }),
  getSchoolSetupProgress: async () => setupState,
  updateSchoolSetupProgress: async () => setupState,
  getTimetableSettings: async () => ({ shiftCount: 1, firstPeriodStart: '08:00', periodMinutes: 40, breakAfterPeriod: 3, breakMinutes: 20, shift2FirstPeriodStart: '13:00', shift2PeriodMinutes: 40, shift2BreakAfterPeriod: 3, shift2BreakMinutes: 20 }),
  request: async (endpoint: string) => endpoint === '/teacher-assignments' ? { selectedAcademicYearId: 'year-visual-001', selectedTermId: 'term-visual-001', classes: [klass], subjects: [math, science], teachers: [teacher], assignments, unassigned: [] } : []
};
export const ApiClient: any = new Proxy(values, {
  get(target, property: string) {
    return target[property] || (async () => []);
  }
});
