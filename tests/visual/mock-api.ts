const klass = { id: 'class-4a', name: 'Grade 4', section: 'A', classTeacherId: 'teacher-visual-001', academicYear: '2026-2027' };
const math = { id: 'subject-math', name: 'Mathematics', code: 'MATH' };
const science = { id: 'subject-science', name: 'Environmental Science', code: 'ENV' };
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
const values: Record<string, (...args: any[]) => Promise<any>> = {
  getTeacherSubjectAssignments: async () => assignments,
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
  getMyPayslips: async () => []
};
export const ApiClient: any = new Proxy(values, {
  get(target, property: string) {
    return target[property] || (async () => []);
  }
});
