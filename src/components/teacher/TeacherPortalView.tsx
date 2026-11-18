/**
 * Teacher Workspace
 * Rules Enforced:
 * 1. Daily Attendance taken ONCE PER DAY (Present, Absent, Late, Excused)
 * 2. Exam marks: school-configured assessment components -> weighted total and percentage
 * 3. Subject teachers submit assigned subjects; Form Teachers manage the full class mark sheet and forward it to Admin.
 * 4. Personal teaching schedule & notices
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ApiClient } from '../../services/api.ts';
import { getEthiopianCalendarInfo, getSchoolLocalDate } from '../../lib/ethiopian-calendar.ts';
import { getSchoolCalendarStatus } from '../../lib/school-calendar.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { useApi } from '../../hooks/useApi.ts';
import { ErrorState } from '../common/ErrorState.tsx';
import { ExamTimetablePrint, printExamTimetable } from '../common/ExamTimetablePrint.tsx';
import { TeacherMarkEntryPrint } from './TeacherMarkEntryPrint.tsx';
import { calculateExamSubjectTotal, rankExamStudentResults } from '../../lib/exam-calculations.ts';
import { 
  SchoolClass, 
  Subject, 
  Student, 
  ExamConfig, 
  AttendanceStatus,
  TimetableSlot,
  SchoolNotice,
  AssignmentSubmission,
  StudentMark
} from '../../types/index.ts';
import { 
  CalendarDays,
  FileSpreadsheet,
  CheckCircle2,
  Send,
  Save,
  ClipboardList,
  Users,
  BookOpen,
  ClipboardCheck,
  GraduationCap,
  Clock3
} from 'lucide-react';

interface TeacherPortalViewProps {
  initialTab?: 'dashboard' | 'timetable' | 'students' | 'attendance' | 'grades' | 'exam_results' | 'assignments' | 'notices';
}

const EMPTY_TEACHER_DATA: [any[], ExamConfig | null, TimetableSlot[], SchoolClass[]] = [[], null, [], []];

export const TeacherPortalView: React.FC<TeacherPortalViewProps> = ({ initialTab = 'dashboard' }) => {
  const { user, school, isReadOnly, t } = useAuth();
  const [activeTab, setActiveTab] = useState(initialTab);
  useEffect(() => { setActiveTab(initialTab); }, [initialTab]);
  const initialData = useApi(async () => Promise.all([
    ApiClient.getTeacherSubjectAssignments(),
    ApiClient.getExamConfig(),
    ApiClient.getTimetable(),
    ApiClient.getMyFormTeacherClasses()
  ]), [school?.id, user?.id], Boolean(school));
  const [assignmentsData, examConfigData, timetableData, formTeacherClassesData] = initialData.data || EMPTY_TEACHER_DATA;
  // Notices are independent from core teacher data: a notices API outage must
  // not prevent teachers from opening lessons, attendance, marks or homework.
  const noticesState = useApi(() => ApiClient.getNotices(), [school?.id, user?.id], Boolean(school && user));

  const publishedExamSchedulesState = useApi(() => ApiClient.getPublishedExamSchedules(), [school?.id, user?.id], Boolean(school));
  const publishedExamSchedules = Array.isArray(publishedExamSchedulesState.data) ? publishedExamSchedulesState.data : [];
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const teacherAssignments = Array.isArray(assignmentsData) ? assignmentsData : [];
  const formTeacherClasses: SchoolClass[] = Array.isArray(formTeacherClassesData) ? formTeacherClassesData : [];
  const classes: SchoolClass[] = useMemo(() => [...new Map([
    ...teacherAssignments.map((assignment: any) => [assignment.class.id, assignment.class] as [string, SchoolClass]),
    ...formTeacherClasses.map(klass => [klass.id, klass] as [string, SchoolClass])
  ]).values()], [teacherAssignments, formTeacherClasses]);
  const subjects: Subject[] = [...new Map(teacherAssignments.filter((assignment: any) => !assignment.isFormTeacher).map((assignment: any) => [assignment.subject.id, assignment.subject])).values()] as Subject[];
  const classAssignments = teacherAssignments.filter((assignment: any) => assignment.classId === selectedClassId);
  const isFormTeacher = classAssignments.some((assignment: any) => assignment.isFormTeacherClass === true);
  const uniqueSubjects = (rows: any[]) => [...new Map(rows.map(row => [row.subject.id, row.subject])).values()] as Subject[];
  const allClassSubjects = uniqueSubjects(classAssignments);
  const editableClassSubjects = uniqueSubjects(classAssignments.filter((assignment: any) => !assignment.isFormTeacher || assignment.canEditMarks === true));
  // Homework is limited to subjects the teacher personally teaches.
  // Form Teacher's wider subject access applies to the class mark sheet only.
  const classSubjects: Subject[] = uniqueSubjects(classAssignments.filter((assignment: any) => !assignment.isFormTeacher));
  const gradeSubjects: Subject[] = isFormTeacher ? allClassSubjects : editableClassSubjects;
  const [students, setStudents] = useState<Student[]>([]);
  const examConfig = examConfigData as ExamConfig | null;
  const assessmentComponents = examConfig?.assessmentComponents || [];
  // The teacher-scoped endpoint already resolves the signed-in user's teacher
  // record on the server. Do not re-filter those trusted rows against a second
  // client-side assignment payload (which can differ in shape/cache timing).
  const timetable: TimetableSlot[] = Array.isArray(timetableData) ? timetableData : [];
  const [timetableScope, setTimetableScope] = useState<'mine' | 'school'>('mine');
  const [schoolTimetable, setSchoolTimetable] = useState<TimetableSlot[]>([]);
  const [schoolTimetableLoading, setSchoolTimetableLoading] = useState(false);
  const [schoolTimetableError, setSchoolTimetableError] = useState<string | null>(null);
  const [timetableDay, setTimetableDay] = useState<'all' | TimetableSlot['dayOfWeek']>('all');
  const [studentSearch, setStudentSearch] = useState('');
  const isMyTimetableSlot = (slot: TimetableSlot) =>
    Boolean(slot.teacherId) && teacherAssignments.some((assignment: any) =>
      !assignment.isFormTeacher &&
      assignment.teacherId === slot.teacherId &&
      assignment.classId === slot.classId &&
      assignment.subjectId === slot.subjectId
    );
  useEffect(() => {
    if (timetableScope !== 'school') return;
    let cancelled = false;
    setSchoolTimetableLoading(true);
    setSchoolTimetableError(null);
    ApiClient.getTimetable({ scope: 'school' })
      .then(rows => { if (!cancelled) setSchoolTimetable(Array.isArray(rows) ? rows : []); })
      .catch(error => { if (!cancelled) setSchoolTimetableError(error instanceof Error ? error.message : 'Unable to load the school timetable.'); })
      .finally(() => { if (!cancelled) setSchoolTimetableLoading(false); });
    return () => { cancelled = true; };
  }, [timetableScope, school?.id]);
  const timetableDays: TimetableSlot['dayOfWeek'][] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const timetableRows = timetableScope === 'mine' ? timetable : schoolTimetable;
  const visibleTimetable = timetableRows
    .filter(slot => timetableDay === 'all' || slot.dayOfWeek === timetableDay)
    .slice()
    .sort((a, b) => timetableDays.indexOf(a.dayOfWeek) - timetableDays.indexOf(b.dayOfWeek) || a.periodNumber - b.periodNumber);
  const visibleStudents = students.filter(student =>
    `${student.firstName} ${student.middleName || ''} ${student.lastName} ${student.studentId} ${student.rollNumber || ''}`.toLowerCase().includes(studentSearch.trim().toLowerCase())
  ).sort((a, b) =>
    `${a.firstName} ${a.middleName || ''} ${a.lastName}`.localeCompare(`${b.firstName} ${b.middleName || ''} ${b.lastName}`) ||
    (a.rollNumber || '').localeCompare(b.rollNumber || '', undefined, { numeric: true })
  );
  const [assignedClassStudentCounts, setAssignedClassStudentCounts] = useState<Record<string, number>>({});
  const [assignedClassStudentTotal, setAssignedClassStudentTotal] = useState(0);
  useEffect(() => {
    let cancelled = false;
    if (activeTab !== 'dashboard' || !classes.length) { setAssignedClassStudentCounts({}); setAssignedClassStudentTotal(0); return; }
    Promise.all(classes.map(async klass => ({ id: klass.id, count: (await ApiClient.getAllStudents(klass.id)).length })))
      .then(rows => { if (!cancelled) { setAssignedClassStudentCounts(Object.fromEntries(rows.map(row => [row.id, row.count]))); setAssignedClassStudentTotal(rows.reduce((sum, row) => sum + row.count, 0)); } })
      .catch(() => { if (!cancelled) { setAssignedClassStudentCounts({}); setAssignedClassStudentTotal(0); } });
    return () => { cancelled = true; };
  }, [activeTab, classes, school?.id]);
  const notices: SchoolNotice[] = Array.isArray(noticesState.data) ? noticesState.data : [];
  const assignmentsState = useApi(() => ApiClient.getAssignments(), [school?.id, user?.id], Boolean(school && user));
  const homework = Array.isArray(assignmentsState.data) ? assignmentsState.data : [];
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [assignmentDescription, setAssignmentDescription] = useState('');
  const [assignmentDueDate, setAssignmentDueDate] = useState('');
  const [assignmentMaxPoints, setAssignmentMaxPoints] = useState(100);
  const [isCreatingAssignment, setIsCreatingAssignment] = useState(false);
  const [reviewAssignmentId, setReviewAssignmentId] = useState('');
  const [reviewSubmissions, setReviewSubmissions] = useState<AssignmentSubmission[]>([]);
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(false);
  const [gradingSubmissionId, setGradingSubmissionId] = useState<string | null>(null);
  const [gradeDrafts, setGradeDrafts] = useState<Record<string, { grade: string; feedback: string }>>({});
  const submissionRequestRef = useRef(0);

  useEffect(() => () => { submissionRequestRef.current += 1; }, []);

  // Attendance state
  const [attendanceDate, setAttendanceDate] = useState(() => getSchoolLocalDate(school?.timezone));
  const [attendanceMap, setAttendanceMap] = useState<Record<string, { status: AttendanceStatus; note: string }>>({});
  const [isLoadingClassData, setIsLoadingClassData] = useState(false);
  const ethiopianCalendar = getEthiopianCalendarInfo(attendanceDate, school?.timezone || 'Africa/Addis_Ababa');
  const calendarStatus = getSchoolCalendarStatus(attendanceDate, school?.setupData?.calendar, school?.timezone || 'Africa/Addis_Ababa');
  const attendanceCounts = (['present', 'absent', 'late', 'excused'] as AttendanceStatus[]).map(status => ({
    status,
    count: students.filter(student => (attendanceMap[student.id]?.status || 'present') === status).length
  }));

  // Marks state (Small Exam + Big Exam)
  const [semester, setSemester] = useState<'Semester 1' | 'Semester 2'>('Semester 1');
  const [examType, setExamType] = useState<'small' | 'big'>('small');
  const [marksInput, setMarksInput] = useState<Record<string, { scores: Record<string, ExamScoreValue>; remarks: string }>>({});
  const [marksDraftDirty, setMarksDraftDirty] = useState(false);
  const [isReopeningSubjectId, setIsReopeningSubjectId] = useState<string | null>(null);
  const [classMarks, setClassMarks] = useState<StudentMark[]>([]);

  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => { if (classes.length && !selectedClassId) setSelectedClassId(classes[0].id); }, [classes, selectedClassId]);
  useEffect(() => {
    // Attendance is reserved for the Form Teacher; the student register is
    // available to every teacher in classes where they have an active subject assignment.
    if (activeTab === 'attendance' && formTeacherClasses.length && !formTeacherClasses.some(klass => klass.id === selectedClassId)) {
      setSelectedClassId(formTeacherClasses[0].id);
    }
    if (activeTab === 'students' && classes.length && !classes.some(klass => klass.id === selectedClassId)) {
      setSelectedClassId(classes[0].id);
    }
  }, [activeTab, formTeacherClasses, classes, selectedClassId]);
  useEffect(() => {
    if (!selectedClassId) return;
    const firstAssignedSubject = classSubjects[0]?.id || '';
    if (!classSubjects.some(subject => subject.id === selectedSubjectId)) setSelectedSubjectId(firstAssignedSubject);
  }, [selectedClassId, teacherAssignments, classSubjects, selectedSubjectId]);

  // Load only the data needed by the active teacher workflow. Clear the previous
  // class immediately so a fast class switch can never display or submit stale students.
  useEffect(() => {
    if (!selectedClassId) {
      setStudents([]);
      setAttendanceMap({});
      setClassMarks([]);
      setMarksInput({});
      setMarksDraftDirty(false);
      setIsLoadingClassData(false);
      return;
    }
    const needsAttendance = activeTab === 'attendance';
    const needsGrades = activeTab === 'grades';
    const needsStudents = activeTab === 'students';
    const needsResults = activeTab === 'exam_results';
    if (!needsAttendance && !needsGrades && !needsStudents && !needsResults) return;
    if (needsAttendance && !formTeacherClasses.some(klass => klass.id === selectedClassId)) {
      setStudents([]);
      setAttendanceMap({});
      setIsLoadingClassData(false);
      return;
    }
    if (needsStudents && !classes.some(klass => klass.id === selectedClassId)) {
      setStudents([]);
      setIsLoadingClassData(false);
      return;
    }

    let cancelled = false;
    setIsLoadingClassData(true);
    setStudents([]);
    if (needsAttendance) setAttendanceMap({});
    if (needsGrades || needsResults) {
      setClassMarks([]);
      setMarksInput({});
    }

    const attendanceRequest = needsAttendance
      ? ApiClient.getDailyAttendance(selectedClassId, attendanceDate)
      : Promise.resolve([]);
    const marksRequest = needsGrades || needsResults
      ? ApiClient.getMarks(selectedClassId, undefined, semester)
      : Promise.resolve([]);

    Promise.all([ApiClient.getAllStudents(selectedClassId), attendanceRequest, marksRequest])
      .then(([stdList, existingAtt, existingMarks]) => {
        if (cancelled) return;
        setStudents(stdList);
        if (needsAttendance) {
          const attMap: Record<string, { status: AttendanceStatus; note: string }> = {};
          for (const student of stdList) {
            const found = existingAtt.find(record => record.studentId === student.id);
            attMap[student.id] = { status: found ? found.status : 'present', note: found?.note || '' };
          }
          setAttendanceMap(attMap);
        }
        if (needsGrades || needsResults) setClassMarks(existingMarks);
        if (needsGrades) {
          const inputMap: Record<string, { scores: Record<string, ExamScoreValue>; remarks: string }> = {};
          const components = examConfig?.assessmentComponents || [];
          const allocateLegacy = (total: number, rows: typeof components) => {
            let remaining = Number(total) || 0;
            const values: Record<string, number> = {};
            for (const component of rows) {
              values[component.id] = Math.min(component.maxMarks, Math.max(0, remaining));
              remaining -= values[component.id];
            }
            return values;
          };
          for (const student of stdList) {
            for (const subject of editableClassSubjects) {
              const mark = existingMarks.find(item => item.studentId === student.id && item.subjectId === subject.id);
              const legacyScores = {
                ...allocateLegacy(mark?.smallExamMarks || 0, components.filter(component => component.category === 'continuous')),
                ...allocateLegacy(mark?.bigExamMarks || 0, components.filter(component => component.category === 'final'))
              };
              inputMap[`${student.id}:${subject.id}`] = {
                scores: mark ? (mark.assessmentScores || legacyScores) : {},
                remarks: mark?.teacherRemarks || ''
              };
            }
          }
          setMarksInput(inputMap);
        }
      })
      .catch(error => {
        if (!cancelled) setNotice(error instanceof Error ? error.message : 'Unable to load class data.');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingClassData(false);
      });

    return () => { cancelled = true; };
  }, [activeTab, selectedClassId, attendanceDate, semester, teacherAssignments, formTeacherClasses, examConfig]);
  // Save Attendance (Once per day)
  const handleSaveAttendance = async () => {
    if (isReadOnly || isLoadingClassData || !selectedClassId || !students.length) return;
    setIsSaving(true);
    try {
      const records = students.map(s => ({
        studentId: s.id,
        status: attendanceMap[s.id]?.status || 'present',
        note: attendanceMap[s.id]?.note || ''
      }));
      await ApiClient.recordDailyAttendance(selectedClassId, attendanceDate, records);
      setNotice('Daily class attendance saved. The school administrator can now review absences and contact parents.');
      setTimeout(() => setNotice(null), 3000);
    } catch (err: any) {
      setNotice(err.message || 'Failed to save attendance.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAssessmentScoreChange = (
    studentId: string,
    subjectId: string,
    component: (typeof assessmentComponents)[number],
    rawValue: string,
    inputElement: HTMLInputElement
  ) => {
    const key = `${studentId}:${subjectId}`;
    const previousValue = marksInput[key]?.scores[component.id];
    const value = rawValue.trim().toUpperCase();
    const isException = value === 'ABS' || value === 'LB';
    if (value !== '' && !isException && (!/^\d+(\.\d+)?$/.test(value) || Number(value) < 0 || Number(value) > component.maxMarks)) {
      inputElement.classList.add('border-rose-500', 'ring-2', 'ring-rose-500');
      setNotice(`Khalad: geli 0 ilaa ${component.maxMarks}.`);
      inputElement.value = previousValue === undefined ? '' : String(previousValue);
      return;
    }
    inputElement.classList.remove('border-rose-500', 'ring-2', 'ring-rose-500');
    setMarksDraftDirty(true);
    setMarksInput(previous => {
      const scores = { ...(previous[key]?.scores || {}) };
      if (value === '') delete scores[component.id];
      else scores[component.id] = value === 'ABS' || value === 'LB' ? value : Number(value);
      return { ...previous, [key]: { ...previous[key], scores } };
    });
  };

  // Save all editable subject rows for this teacher in one operation.
  const handleSaveMarks = async (status: 'draft' | 'submitted') => {
    if (isReadOnly || isLoadingClassData || !selectedClassId || !editableClassSubjects.length || !students.length) return;
    setMarksDraftDirty(false);
    if (status === 'submitted') {
      const incompleteSubject = editableClassSubjects.find(subject => {
        const lockedIds = new Set(classMarks.filter(mark => mark.subjectId === subject.id && ['submitted', 'form_teacher_submitted', 'approved'].includes(mark.status)).map(mark => mark.studentId));
        return students.some(student => !lockedIds.has(student.id) && assessmentComponents.some(component => marksInput[`${student.id}:${subject.id}`]?.scores[component.id] === undefined));
      });
      if (incompleteSubject) {
        setNotice(`Enter every assessment mark for all students in ${incompleteSubject.name} before submitting.`);
        return;
      }
    }
    setIsSaving(true);
    try {
      const results = await Promise.all(editableClassSubjects.map(async subject => {
        const existing = classMarks.filter(mark => mark.subjectId === subject.id);
        const lockedIds = new Set(existing.filter(mark => ['submitted', 'form_teacher_submitted', 'approved'].includes(mark.status)).map(mark => mark.studentId));
        const formatted = students.filter(student => !lockedIds.has(student.id)).map(student => {
          const input = marksInput[`${student.id}:${subject.id}`] || { scores: {}, remarks: '' };
          return {
            studentId: student.id,
            assessmentScores: input.scores,
            teacherRemarks: input.remarks || '',
            status
          };
        });
        if (!formatted.length) return [];
        const saved = await ApiClient.saveMarks(selectedClassId, subject.id, semester, formatted);
        return saved.marks || [];
      }));
      const savedMarks = results.flat();
      setClassMarks(current => [...current.filter(mark => !savedMarks.some(saved => saved.id === mark.id)), ...savedMarks]);
      setNotice(status === 'submitted'
        ? (isFormTeacher
          ? `You completed and submitted ${savedMarks.length} mark records. Review the class sheet, then forward it to School Admin.`
          : `You submitted ${savedMarks.length} mark records to the class Form Teacher for review.`)
        : `Drafts saved for ${editableClassSubjects.length} subject(s) in this class.`);
      if (status === 'submitted') {
        const refreshed = await ApiClient.getMarks(selectedClassId, undefined, semester);
        setClassMarks(refreshed);
      }
      setTimeout(() => setNotice(null), 4500);
    } catch (err: any) {
      setNotice(err.message || 'Failed to save class marks.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReopenSubjectMarks = async (subjectId: string) => {
    if (isReadOnly || !isFormTeacher || !selectedClassId || isReopeningSubjectId) return;
    setIsReopeningSubjectId(subjectId);
    try {
      const result = await ApiClient.reopenClassSubjectMarks(selectedClassId, subjectId, semester);
      const refreshed = await ApiClient.getMarks(selectedClassId, undefined, semester);
      setClassMarks(refreshed);
      setNotice(`Reopened ${result.reopenedCount} mark records for correction.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Subject marks could not be reopened.');
    } finally {
      setIsReopeningSubjectId(null);
    }
  };

  const handleForwardClassMarks = async () => {
    if (isReadOnly || !isFormTeacher || !selectedClassId || isSaving) return;
    setIsSaving(true);
    try {
      const result = await ApiClient.forwardClassMarks(selectedClassId, semester);
      const refreshed = await ApiClient.getMarks(selectedClassId, undefined, semester);
      setClassMarks(refreshed);
      setNotice(`Form Teacher ahaan waxaad Admin u dirtay ${result.forwardedCount} natiijo oo fasalka ah.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Class results could not be forwarded.');
    } finally {
      setIsSaving(false);
    }
  };

  // Automatically persist editable marks as drafts after a short pause. Submitted rows stay locked.
  useEffect(() => {
    if (!marksDraftDirty || activeTab !== 'grades' || isReadOnly || isLoadingClassData ||
        !selectedClassId || !students.length || !editableClassSubjects.length || !assessmentComponents.length) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const results = await Promise.all(editableClassSubjects.map(async subject => {
            const lockedIds = new Set(classMarks
              .filter(mark => mark.subjectId === subject.id && ['submitted', 'form_teacher_submitted', 'approved'].includes(mark.status))
              .map(mark => mark.studentId));
            const rows = students.filter(student => !lockedIds.has(student.id)).map(student => {
              const input = marksInput[`${student.id}:${subject.id}`] || { scores: {}, remarks: '' };
              return { studentId: student.id, assessmentScores: input.scores, teacherRemarks: input.remarks || '', status: 'draft' as const };
            });
            if (!rows.length) return [];
            const saved = await ApiClient.saveMarks(selectedClassId, subject.id, semester, rows);
            return saved.marks || [];
          }));
          const savedMarks = results.flat();
          setClassMarks(current => [...current.filter(mark => !savedMarks.some(saved => saved.id === mark.id)), ...savedMarks]);
          setMarksDraftDirty(false);
          setNotice(t('exam_drafts_autosaved'));
        } catch (error) {
          setNotice(error instanceof Error ? error.message : 'Automatic draft save failed. Use Save drafts to retry.');
        }
      })();
    }, 900);
    return () => window.clearTimeout(timer);
  }, [marksDraftDirty, activeTab, isReadOnly, isLoadingClassData, selectedClassId, students, editableClassSubjects, assessmentComponents, classMarks, marksInput, semester]);

  const handleCreateAssignment = async () => {
    const title = assignmentTitle.trim();
    const description = assignmentDescription.trim();
    const maxPoints = Number(assignmentMaxPoints);
    const today = getSchoolLocalDate(school?.timezone);
    if (isReadOnly || !selectedClassId || !selectedSubjectId || !title || !description || !assignmentDueDate) return;
    if (assignmentDueDate < today) {
      setNotice('Homework due date cannot be earlier than today.');
      return;
    }
    if (!Number.isInteger(maxPoints) || maxPoints < 1 || maxPoints > 1000) {
      setNotice('Maximum points must be a whole number between 1 and 1000.');
      return;
    }
    setIsCreatingAssignment(true);
    try {
      await ApiClient.createAssignment({
        classId: selectedClassId,
        subjectId: selectedSubjectId,
        title,
        description,
        dueDate: assignmentDueDate,
        maxPoints
      });
      setAssignmentTitle('');
      setAssignmentDescription('');
      setAssignmentDueDate('');
      setAssignmentMaxPoints(100);
      assignmentsState.retry();
      setNotice('Homework assigned to the selected class.');
      setTimeout(() => setNotice(null), 3000);
    } catch (err: any) {
      setNotice(err.message || 'Failed to create homework.');
    } finally {
      setIsCreatingAssignment(false);
    }
  };

  const handleReviewAssignment = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const assignmentId = event.target.value;
    const requestId = ++submissionRequestRef.current;
    setReviewAssignmentId(assignmentId);
    setReviewSubmissions([]);
    setGradeDrafts({});
    setNotice(null);
    if (!assignmentId) {
      setIsLoadingSubmissions(false);
      return;
    }
    setIsLoadingSubmissions(true);
    try {
      const submissions = await ApiClient.getAssignmentSubmissions(assignmentId);
      if (requestId !== submissionRequestRef.current) return;
      setReviewSubmissions(submissions);
      const nextDrafts: Record<string, { grade: string; feedback: string }> = {};
      for (const submission of submissions) {
        nextDrafts[submission.id] = { grade: submission.grade?.toString() || '', feedback: submission.feedback || '' };
      }
      setGradeDrafts(nextDrafts);
    } catch (err: any) {
      if (requestId === submissionRequestRef.current) setNotice(err.message || 'Failed to load submissions.');
    } finally {
      if (requestId === submissionRequestRef.current) setIsLoadingSubmissions(false);
    }
  };

  const handleGradeSubmission = async (submission: AssignmentSubmission) => {
    const assignment = homework.find(item => item.id === reviewAssignmentId);
    const draft = gradeDrafts[submission.id];
    const grade = Number(draft?.grade);
    if (isReadOnly || gradingSubmissionId || !assignment) return;
    if (!Number.isFinite(grade) || grade < 0 || grade > assignment.maxPoints) {
      setNotice(`Enter a grade between 0 and ${assignment.maxPoints}.`);
      return;
    }
    setGradingSubmissionId(submission.id);
    try {
      const updated = await ApiClient.gradeAssignmentSubmission(assignment.id, submission.id, grade, draft?.feedback || '');
      setReviewSubmissions(current => current.map(item => item.id === updated.id ? updated : item));
      setNotice(`Graded ${updated.studentName}'s homework.`);
      setTimeout(() => setNotice(null), 3000);
    } catch (err: any) {
      setNotice(err.message || 'Failed to grade homework.');
    } finally {
      setGradingSubmissionId(null);
    }
  };

  const smallMax = examConfig?.smallExamMax ?? 40;
  const bigMax = examConfig?.bigExamMax ?? 60;
  const combinedMax = smallMax + bigMax;

  useEffect(() => {
    if (smallMax <= 0 && bigMax > 0) setExamType('big');
    else if (bigMax <= 0 && smallMax > 0) setExamType('small');
  }, [smallMax, bigMax]);
  const allClassMarksSubmitted = isFormTeacher && gradeSubjects.length > 0 && students.length > 0 &&
    students.every(student => gradeSubjects.every(subject => {
      const mark = classMarks.find(item => item.studentId === student.id && item.subjectId === subject.id);
      return Boolean(mark && ['submitted', 'form_teacher_submitted', 'approved'].includes(mark.status) &&
        assessmentComponents.every(component => mark.assessmentScores?.[component.id] !== undefined));
    }));

  const classAlreadyForwarded = isFormTeacher && classMarks.some(mark => ['form_teacher_submitted', 'approved'].includes(mark.status));

  const examRegisterRows = useMemo(() => {
    const rows = students.map(student => {
      const subjectScores = gradeSubjects.map(subject => {
        const key = `${student.id}:${subject.id}`;
        const input = marksInput[key];
        const mark = classMarks.find(item => item.studentId === student.id && item.subjectId === subject.id);
        const scores = { ...(mark?.assessmentScores || {}), ...(input?.scores || {}) };
        const total = calculateExamSubjectTotal(scores, assessmentComponents);
        const submitted = Boolean(mark && ['submitted', 'form_teacher_submitted', 'approved'].includes(mark.status) &&
          assessmentComponents.every(component => mark.assessmentScores?.[component.id] !== undefined));
        return {
          subjectId: subject.id,
          total: total ?? 0,
          max: assessmentComponents.reduce((sum, component) => sum + component.maxMarks, 0),
          hasMarks: total !== null,
          submitted
        };
      });
      const complete = subjectScores.length > 0 && subjectScores.every(score => score.submitted);
      const total = subjectScores.reduce((sum, score) => sum + score.total, 0);
      return {
        student,
        subjectScores,
        total,
        average: subjectScores.length ? total / subjectScores.length : 0,
        max: subjectScores.reduce((sum, score) => sum + score.max, 0),
        complete
      };
    });
    const ranked = isFormTeacher && allClassMarksSubmitted
      ? rankExamStudentResults(rows.map(row => ({ studentId: row.student.id, total: row.total, complete: row.complete })))
      : [];
    const rankByStudent = new Map(ranked.map(row => [row.studentId, row.rank]));
    return rows
      .sort((a, b) => allClassMarksSubmitted
        ? b.total - a.total || a.student.firstName.localeCompare(b.student.firstName)
        : `${a.student.firstName} ${a.student.middleName || ''} ${a.student.lastName}`.localeCompare(`${b.student.firstName} ${b.student.middleName || ''} ${b.student.lastName}`) ||
          (a.student.rollNumber || '').localeCompare(b.student.rollNumber || '', undefined, { numeric: true }))
      .map(row => ({ ...row, rank: rankByStudent.get(row.student.id) ?? null }))
      .filter(row => `${row.student.firstName} ${row.student.middleName || ''} ${row.student.lastName} ${row.student.studentId} ${row.student.rollNumber || ''}`.toLowerCase().includes(studentSearch.trim().toLowerCase()));
  }, [students, studentSearch, gradeSubjects, assessmentComponents, marksInput, classMarks, isFormTeacher, allClassMarksSubmitted]);

  if (initialData.loading) return <div className="p-6 space-y-4" aria-label="Loading teacher dashboard"><div className="h-8 w-1/3 animate-pulse rounded bg-slate-200" /><div className="grid gap-4 sm:grid-cols-2"><div className="h-32 animate-pulse rounded-2xl bg-white" /><div className="h-32 animate-pulse rounded-2xl bg-white" /></div></div>;
  if (initialData.error) return <ErrorState error={initialData.error} onRetry={initialData.retry} />;

  return (
    <div className="mx-auto max-w-[1680px] space-y-5 p-3 sm:p-5 lg:p-7">
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#102f2d] via-[#164b46] to-[#0f766e] p-5 text-white shadow-lg sm:p-7">
        <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full border-[28px] border-white/5" />
        <div className="pointer-events-none absolute -bottom-24 right-1/4 h-48 w-48 rounded-full bg-teal-300/10 blur-2xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-teal-100">
              <GraduationCap className="h-3.5 w-3.5" /> Faculty workspace
            </div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Good day, {user?.fullName || 'Teacher'}</h1>
            <p className="mt-1 text-sm text-teal-100/90">{school?.name || 'Your school'} · Your classes, lessons and student progress in one place.</p>
          </div>
          <div className="flex shrink-0 items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur">
            <div className="rounded-xl bg-white/10 p-2.5"><CalendarDays className="h-5 w-5 text-teal-100" /></div>
            <div><p className="text-[10px] font-semibold uppercase tracking-wider text-teal-100">School date</p><p className="text-sm font-bold">{getSchoolLocalDate(school?.timezone)}</p></div>
          </div>
        </div>
      </header>

      {notice && (
        <div role="status" className="flex items-start gap-2 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900 shadow-sm">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
          <span>{notice}</span>
        </div>
      )}

      {activeTab === 'dashboard' && (
        <section className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-teal-100 bg-gradient-to-br from-teal-50 to-white p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-teal-700">Form Teacher responsibility</p>
              <h2 className="mt-1 text-base font-bold text-slate-900">Your assigned class</h2>
              {formTeacherClasses.length ? <ul className="mt-3 space-y-2">{formTeacherClasses.map(klass => <li key={klass.id} className="rounded-xl border border-teal-100 bg-white px-3 py-2 text-sm font-semibold text-slate-800">{klass.name}{klass.section ? ` · ${klass.section}` : ''}<span className="ml-2 rounded-full bg-teal-50 px-2 py-1 text-[11px] text-teal-800">{assignedClassStudentCounts[klass.id] ?? '…'} arday</span></li>)}</ul> : <p className="mt-3 text-xs text-slate-500">No Form Teacher class has been assigned to your account.</p>}
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-teal-700">Teaching assignments</p>
              <h2 className="mt-1 text-base font-bold text-slate-900">Subjects you teach</h2>
              {teacherAssignments.filter((assignment: any) => !assignment.isFormTeacher).length ? <ul className="mt-3 space-y-2">{teacherAssignments.filter((assignment: any) => !assignment.isFormTeacher).map((assignment: any) => <li key={`${assignment.classId}:${assignment.subject.id}`} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-xs"><span className="font-semibold text-slate-800">{assignment.subject.name}</span><span className="text-slate-500">{assignment.class?.name || 'Assigned class'}</span></li>)}</ul> : <p className="mt-3 text-xs text-slate-500">No teaching subjects have been assigned yet.</p>}
            </section>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <article className="rounded-2xl border border-teal-100 bg-teal-50 p-4"><p className="text-[10px] font-bold uppercase tracking-wide text-teal-700">Ardayda fasallada laguu xilsaaray</p><p className="mt-2 text-2xl font-black text-slate-900">{assignedClassStudentTotal}</p><p className="mt-1 text-[10px] text-slate-500">Wadarta ardayda fasalladaada</p></article>
            <article className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Fasallada laguu xilsaaray</p><p className="mt-2 text-2xl font-black text-slate-900">{new Set([...teacherAssignments.filter((assignment: any) => !assignment.isFormTeacher).map((assignment: any) => assignment.classId), ...formTeacherClasses.map(klass => klass.id)]).size}</p></article>
            <article className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Maaddooyinka aad dhigto</p><p className="mt-2 text-2xl font-black text-slate-900">{subjects.length}</p></article>
            <article className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Casharrada laguu qoondeeyay</p><p className="mt-2 text-2xl font-black text-slate-900">{timetable.length}</p><p className="mt-1 text-[10px] text-slate-500">Casharrada toddobaadka</p></article>
          </div>
        </section>
      )}

      {/* TAB 1: TEACHER SCHEDULE */}
      {(activeTab === 'dashboard' || activeTab === 'timetable') && (
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-700">Teaching schedule</p>
              <h2 className="mt-1 flex items-center gap-2 text-base font-bold text-slate-900">
                <CalendarDays className="h-5 w-5 text-teal-700" />
                {timetableScope === 'mine' ? 'My teaching timetable' : 'Full school timetable'}
              </h2>
              <p className="mt-1 text-xs text-slate-500">Start with your own lessons; switch to the school view when needed.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1" role="group" aria-label="Timetable scope">
                  <button type="button" aria-pressed={timetableScope === 'mine'} onClick={() => { setTimetableScope('mine'); setTimetableDay('all'); }} className={`min-h-10 rounded-lg px-3 text-xs font-semibold ${timetableScope === 'mine' ? 'bg-teal-700 text-white shadow-sm' : 'text-slate-600'}`}>My lessons</button>
                  <button type="button" aria-pressed={timetableScope === 'school'} onClick={() => { setTimetableScope('school'); setTimetableDay('all'); }} className={`min-h-10 rounded-lg px-3 text-xs font-semibold ${timetableScope === 'school' ? 'bg-teal-700 text-white shadow-sm' : 'text-slate-600'}`}>School</button>
                </div>
                <select aria-label="Filter timetable by day" value={timetableDay} onChange={event => setTimetableDay(event.target.value as typeof timetableDay)} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700">
                  <option value="all">All days</option>
                  {timetableDays.map(day => <option key={day} value={day}>{day}</option>)}
                </select>
              </div>
              <span aria-label={`${visibleTimetable.length} periods shown`} className="rounded-full border border-teal-100 bg-teal-50 px-3 py-1.5 text-xs font-bold text-teal-800">{visibleTimetable.length} lessons</span>
            </div>
          </div>
          {(schoolTimetableLoading && timetableScope === 'school') ? <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Loading school timetable…</div> : schoolTimetableError && timetableScope === 'school' ? <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{schoolTimetableError}</div> : visibleTimetable.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-xs text-[#64748B]">
              {timetableDay !== 'all'
                ? `No lessons scheduled for ${timetableDay} in this view. Choose another day or All days.`
                : timetableScope === 'mine' && timetable.length === 0
                  ? 'Your personal timetable has no published lessons yet. Ask the administrator to assign your teacher profile to the class timetable.'
                  : 'No schedule slots have been published yet. Contact school administration to set your timetable.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {visibleTimetable.map(slot => {
                const c = classes.find(cls => cls.id === slot.classId);
                const mySlot = timetableScope === 'mine' || isMyTimetableSlot(slot);
                const s = subjects.find(sub => sub.id === slot.subjectId);
                return (
                  <div key={slot.id} className={`group rounded-2xl border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md space-y-2 text-xs ${mySlot ? 'border-teal-400 bg-teal-50 ring-2 ring-teal-200 shadow-teal-100' : 'border-slate-200 bg-gradient-to-br from-white to-slate-50'}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#132A29]">{slot.dayOfWeek}</span>
                      <span className="font-mono text-[11px] font-bold text-[#0F766E]">Period {slot.periodNumber}</span>
                    </div>
                    <p className="font-semibold text-teal-900">{(slot as any).subjectName || s?.name || 'Subject'}</p>
                    <p className="text-[11px] text-[#64748B]">{(slot as any).className || c?.name || 'Class'} · Room {slot.roomNumber || 'TBA'}</p>
                    {mySlot && <span className="inline-flex rounded-full bg-teal-700 px-2 py-1 text-[10px] font-bold text-white">Your lesson</span>}
                    <p className="font-mono text-[10px] text-[#94A3B8]">{slot.startTime} - {slot.endTime}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TEACHER STUDENTS */}
      {activeTab === 'students' && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <label className="block text-xs font-semibold text-slate-600">Your teaching class
              <select value={selectedClassId} onChange={event => setSelectedClassId(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 sm:max-w-sm">
                {classes.map(klass => <option key={klass.id} value={klass.id}>{klass.name}{klass.section ? ` · ${klass.section}` : ''}</option>)}
              </select>
            </label>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
              <input type="search" value={studentSearch} onChange={event => setStudentSearch(event.target.value)} placeholder="Search student name or ID..." aria-label="Search students" className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm sm:max-w-sm" />
              <div><h2 className="text-sm font-bold text-slate-900">Students in this class</h2><p className="mt-1 text-[11px] text-slate-500">Students in classes where you teach a subject or serve as Form Teacher are shown.</p></div>
              <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-800">{students.length} students</span>
            </div>
            {isLoadingClassData ? <p className="p-8 text-center text-sm text-slate-500">Loading assigned students...</p> : students.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">{classes.length ? 'No students found in this assigned class.' : 'No teaching classes have been assigned to your teacher profile yet. Ask the School Admin to check your class and subject assignments.'}</p> : (
              <>
              <div className="space-y-2 p-3 md:hidden">
                {visibleStudents.map((student, index) => <article key={student.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-3"><span className="text-xs font-bold text-slate-400">#{index + 1}</span><span className="rounded-lg bg-white px-2 py-1 font-mono text-[11px] text-slate-600">{student.studentId}</span></div>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{student.firstName} {student.middleName} {student.lastName}</p>
                </article>)}
                {visibleStudents.length === 0 && <p className="p-5 text-center text-sm text-slate-500">No students match your search.</p>}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[620px] text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">#</th><th className="px-4 py-3">Student</th><th className="px-4 py-3">Student ID</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">{visibleStudents.map((student, index) => <tr key={student.id} className="hover:bg-slate-50"><td className="px-4 py-3 text-slate-400">{index + 1}</td><td className="px-4 py-3 font-semibold text-slate-800">{student.firstName} {student.middleName} {student.lastName}</td><td className="px-4 py-3 font-mono text-slate-500">{student.studentId}</td></tr>)}</tbody>
                </table>
              </div>
              </>
            )}
          </div>
        <section className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-bold text-[#132A29]">Published Exam Timetable</h2><button type="button" onClick={printExamTimetable} className="rounded-lg border border-[#CBD5E1] px-3 py-1.5 text-[11px] font-semibold text-[#334155]">Print timetable</button></div>
          {publishedExamSchedulesState.loading ? <div className="h-16 animate-pulse rounded-lg bg-slate-100" /> : publishedExamSchedulesState.error ? <ErrorState error={publishedExamSchedulesState.error} onRetry={publishedExamSchedulesState.retry} /> : <ExamTimetablePrint schedules={publishedExamSchedules} school={school} classGroup={[...new Set(publishedExamSchedules.map((exam: any) => exam.className).filter(Boolean))].join(" / ") || school?.examTimetableClassGroup} />}
        </section>

        </section>
      )}

      {/* TAB 2: DAILY ATTENDANCE (ONCE PER DAY) */}
      {activeTab === 'attendance' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 items-end gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3 sm:p-5">
            {formTeacherClasses.length === 0 && <p className="sm:col-span-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">No class is assigned to you as Form Teacher. Contact School Admin to assign you to a class.</p>}
            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">My Form Teacher Class</label>
              <select
                value={selectedClassId}
                onChange={e => setSelectedClassId(e.target.value)}
                className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-xl"
              >
                {formTeacherClasses.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.section})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">Date (Once Per Day)</label>
              <input
                type="date"
                value={attendanceDate}
                onChange={e => setAttendanceDate(e.target.value)}
                className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-xl"
              />
              <p className="mt-1 text-[11px] text-[#64748B]">Ethiopian date: {ethiopianCalendar.dateLabel}</p>
              {ethiopianCalendar.holiday && <p className="mt-1 text-[11px] font-semibold text-amber-700">Ethiopian public holiday: {ethiopianCalendar.holiday}</p>}
              {(calendarStatus.isWeeklyHoliday || (calendarStatus.holidayName && calendarStatus.holidayName !== ethiopianCalendar.holiday)) && <p className="mt-1 text-[11px] font-semibold text-amber-700">{calendarStatus.isWeeklyHoliday ? 'This date is configured as a weekly school holiday.' : 'School holiday: ' + calendarStatus.holidayName}</p>}
            </div>
            <div>
              <button
                type="button"
                onClick={handleSaveAttendance}
                disabled={isSaving || isLoadingClassData || isReadOnly || students.length === 0 || !formTeacherClasses.some(klass => klass.id === selectedClassId)}
                className="w-full py-2 px-4 bg-[#0F766E] hover:bg-[#0D655E] text-white text-xs font-semibold rounded-xl shadow-sm flex items-center justify-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                {isLoadingClassData ? 'Loading class...' : isSaving ? 'Saving...' : 'Save Attendance'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {attendanceCounts.map(item => (
              <article key={item.status} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{item.status}</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{item.count}</p>
                <p className="text-[10px] text-slate-500">students</p>
              </article>
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-sm">
            <div className="border-b border-slate-100 p-3 md:hidden"><input type="search" value={studentSearch} onChange={event => setStudentSearch(event.target.value)} placeholder="Find a student by name or ID..." aria-label="Search attendance students" className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm" /></div>
            <div className="space-y-3 p-3 md:hidden">
              {isLoadingClassData ? <p className="p-5 text-center text-sm text-slate-500">Loading students and attendance...</p> : visibleStudents.map(student => {
                const current = attendanceMap[student.id] || { status: 'present' as AttendanceStatus, note: '' };
                return <article key={student.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="mb-3 flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-sm font-bold text-slate-900">{student.firstName} {student.lastName}</p><p className="mt-0.5 font-mono text-[11px] text-slate-500">{student.studentId}</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold capitalize text-slate-600">{current.status}</span></div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {(['present', 'absent', 'late', 'excused'] as AttendanceStatus[]).map(status => <button key={status} type="button" aria-pressed={current.status === status} onClick={() => setAttendanceMap(previous => ({ ...previous, [student.id]: { ...previous[student.id], status } }))} className={`min-h-11 rounded-lg px-2 text-xs font-bold capitalize ${current.status === status ? status === 'present' ? 'bg-emerald-600 text-white' : status === 'absent' ? 'bg-rose-600 text-white' : 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-700'}`}>{status}</button>)}
                  </div>
                  <input type="text" value={current.note} onChange={event => setAttendanceMap(previous => ({ ...previous, [student.id]: { ...previous[student.id], note: event.target.value } }))} placeholder="Optional attendance note" aria-label={`Attendance note for ${student.firstName} ${student.lastName}`} className="mt-3 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" />
                </article>;
              })}
              {!isLoadingClassData && visibleStudents.length === 0 && <p className="p-5 text-center text-sm text-slate-500">No students match your search.</p>}
            </div>
            <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px] text-left text-xs text-[#132A29]">
              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] uppercase font-semibold text-[#64748B]">
                <tr>
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {isLoadingClassData ? <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-500">Loading students and attendance...</td></tr> : visibleStudents.map(s => {
                  const current = attendanceMap[s.id] || { status: 'present', note: '' };
                  return (
                    <tr key={s.id} className="hover:bg-[#F8FAFC]">
                      <td className="py-3 px-4">
                        <p className="font-semibold">{s.firstName} {s.lastName}</p>
                        <p className="text-[11px] font-mono text-[#64748B]">{s.studentId}</p>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-1">
                          {(['present', 'absent', 'late', 'excused'] as AttendanceStatus[]).map(st => (
                            <button
                              key={st}
                              type="button"
                              onClick={() => setAttendanceMap(prev => ({
                                ...prev,
                                [s.id]: { ...prev[s.id], status: st }
                              }))}
                              className={`px-2 py-0.5 rounded text-[11px] font-semibold capitalize ${
                                current.status === st
                                  ? st === 'present' ? 'bg-emerald-600 text-white' : st === 'absent' ? 'bg-rose-600 text-white' : 'bg-amber-600 text-white'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                            >
                              {st}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="text"
                          value={current.note}
                          onChange={e => setAttendanceMap(prev => ({
                            ...prev,
                            [s.id]: { ...prev[s.id], note: e.target.value }
                          }))}
                          placeholder="Optional note..."
                          className="w-full text-xs px-2 py-1 border border-[#CBD5E1] rounded"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {/* SUBJECT-WISE EXAM MARK ENTRY */}
      {activeTab === 'grades' && (
        <section className="space-y-4">
          <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3">
            <label className="text-xs font-semibold text-slate-600">Class
              <select value={selectedClassId} onChange={event => setSelectedClassId(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2">
                {classes.map(klass => <option key={klass.id} value={klass.id}>{klass.name}{klass.section ? ` · ${klass.section}` : ''}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">Semester
              <select value={semester} onChange={event => setSemester(event.target.value as any)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2">
                <option value="Semester 1">Semester 1</option><option value="Semester 2">Semester 2</option>
              </select>
            </label>
            <div className="flex items-end gap-2">
              <button type="button" onClick={() => void handleSaveMarks('draft')} disabled={isReadOnly || isSaving || isLoadingClassData || !editableClassSubjects.length || !students.length} className="flex-1 rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"><Save className="mr-1 inline h-3.5 w-3.5"/>Save drafts</button>
              <button type="button" onClick={() => void handleSaveMarks('submitted')} disabled={isReadOnly || isSaving || isLoadingClassData || !editableClassSubjects.length || !students.length} className="flex-1 rounded-xl bg-teal-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Send className="mr-1 inline h-3.5 w-3.5"/>Submit marks</button>
            </div>
          </div>

          {classMarks.some(mark => Boolean(mark.correctionReason) && gradeSubjects.some(subject => subject.id === mark.subjectId)) && (
            <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-950">
              <p className="font-bold">School Admin returned marks for correction</p>
              <p className="mt-1 text-amber-800">Review the reason below, correct the affected subject marks, then submit them again for Form Teacher review.</p>
              <div className="mt-2 space-y-2">
                {[...new Map(classMarks.filter(mark => mark.correctionReason && gradeSubjects.some(subject => subject.id === mark.subjectId)).map(mark => [`${mark.subjectId}:${mark.correctionReason}`, mark])).values()].map(mark => (
                  <p key={mark.id} className="rounded-lg border border-amber-100 bg-white px-3 py-2"><strong>{gradeSubjects.find(subject => subject.id === mark.subjectId)?.name || 'Subject'}:</strong> {mark.correctionReason} {mark.returnedAt ? <span className="block pt-1 text-[10px] text-slate-500">Returned {new Date(mark.returnedAt).toLocaleString()}</span> : null}</p>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-teal-100 bg-teal-50 p-4">
            <div><p className="text-sm font-bold text-teal-950">Enter marks by subject and exam type</p><p className="mt-1 text-xs text-teal-800">Each subject has its own mark sheet. Small Exam and Big Exam scores are saved together in the student's subject record.</p></div>
            <div className="flex flex-wrap gap-2">
              <TeacherMarkEntryPrint
                schoolName={school?.name || 'School'}
                className={classes.find(klass => klass.id === selectedClassId)?.name || 'Selected class'}
                section={classes.find(klass => klass.id === selectedClassId)?.section || ''}
                academicYear={classes.find(klass => klass.id === selectedClassId)?.academicYear || school?.academicYear || ''}
                semester={semester}
                teacherName={user?.fullName || 'Teacher'}
                students={students}
                subjects={editableClassSubjects}
                components={assessmentComponents}
              />

            </div>
          </div>

          <div className="flex flex-wrap gap-2" role="group" aria-label="Exam type">
            {smallMax > 0 && <button type="button" aria-pressed={examType === 'small'} onClick={() => setExamType('small')} className={`rounded-xl border px-4 py-2 text-xs font-bold ${examType === 'small' ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>{examConfig?.smallExamName || 'Small Exam'} · {smallMax} marks</button>}
            {bigMax > 0 && <button type="button" aria-pressed={examType === 'big'} onClick={() => setExamType('big')} className={`rounded-xl border px-4 py-2 text-xs font-bold ${examType === 'big' ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>{examConfig?.bigExamName || 'Big Exam'} · {bigMax} marks</button>}
          </div>

          {isLoadingClassData ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Loading students and saved marks...</div> : gradeSubjects.length === 0 ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">No subjects are assigned to this teacher for the selected class.</div> : (
            <>

              <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-bold text-slate-900">Enter individual assessment components</h2><span className="text-[10px] text-slate-500">Edit the subject marks below, then save or submit</span></div>
              {editableClassSubjects.map(subject => {
            const subjectComponents = assessmentComponents.filter(component => component.category === (examType === 'small' ? 'continuous' : 'final'));
            const enteredMarksCount = students.reduce((count, student) => {
              const input = marksInput[`${student.id}:${subject.id}`];
              const mark = classMarks.find(item => item.studentId === student.id && item.subjectId === subject.id);
              return count + subjectComponents.filter(component =>
                input ? input.scores[component.id] !== undefined : mark?.assessmentScores?.[component.id] !== undefined
              ).length;
            }, 0);
            const expectedMarksCount = students.length * subjectComponents.length;
            return (
              <section key={subject.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
                  <div><h2 className="text-sm font-bold text-slate-900">{subject.name}</h2><p className="mt-1 text-[10px] text-slate-500">{classes.find(klass => klass.id === selectedClassId)?.name || 'Selected class'} · {examType === 'small' ? 'Small Exam' : 'Big Exam'}</p></div>
                  <span className="rounded-full bg-teal-50 px-3 py-1 text-[10px] font-bold text-teal-800">{students.length} students</span>
                </div>
                {subjectComponents.length === 0 ? <p className="p-6 text-center text-xs text-slate-500">No assessment components are configured for this exam type. Ask School Admin to configure the exam.</p> : (
                  <>
                    <div className="mb-3 px-3 pt-3 md:hidden"><input type="search" value={studentSearch} onChange={event => setStudentSearch(event.target.value)} placeholder="Search student name or ID..." aria-label="Search students for marks" className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm" /></div>
                    <div className="space-y-3 p-3 md:hidden">
                      {visibleStudents.map(student => {
                        const key = `${student.id}:${subject.id}`;
                        const input = marksInput[key] || { scores: {}, remarks: '' };
                        const mark = classMarks.find(item => item.studentId === student.id && item.subjectId === subject.id);
                        const locked = ['submitted', 'form_teacher_submitted', 'approved'].includes(mark?.status || '');
                        const editable = editableClassSubjects.some(item => item.id === subject.id) && !locked;
                        const examTotal = subjectComponents.reduce((sum, component) => { const value = input.scores[component.id] ?? mark?.assessmentScores?.[component.id]; return sum + (typeof value === 'number' ? value : 0); }, 0);
                        return <article key={student.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <div className="mb-3 flex items-start justify-between gap-2"><div><p className="text-sm font-bold text-slate-900">{student.firstName} {student.middleName} {student.lastName}</p><p className="text-[11px] text-slate-500">{student.studentId}</p></div><span className="rounded-full bg-white px-2 py-1 text-[10px] text-slate-600">{mark?.status || 'Not entered'}</span></div>
                          <div className="grid grid-cols-2 gap-3">
                            {subjectComponents.map(component => <label key={component.id} className="text-xs font-semibold text-slate-600">{component.name}<span className="ml-1 text-[10px] font-normal text-slate-400">/ {component.maxMarks}</span>{editable ? <input type="text" inputMode="decimal" placeholder="0 / ABS / LB" value={input.scores[component.id] ?? ''} onChange={event => handleAssessmentScoreChange(student.id, subject.id, component, event.target.value, event.currentTarget)} onKeyDown={event => {
                              if (event.key !== 'Enter' && event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
                              event.preventDefault();
                              const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[data-mark-entry="true"]')).filter(input => input.offsetParent !== null);
                              const current = inputs.indexOf(event.currentTarget);
                              inputs[current + (event.key === 'ArrowUp' ? -1 : 1)]?.focus();
                            }} data-mark-entry="true" className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base" aria-label={`${component.name} mark for ${student.firstName} in ${subject.name}`} /> : <span className="mt-1 block rounded-lg bg-white px-3 py-3 text-sm">{mark?.assessmentScores?.[component.id] ?? '—'}</span>}</label>)}
                          </div>
                          <p className="mt-3 text-right text-xs font-bold text-slate-700">Exam total: {examTotal.toFixed(1).replace(/\.0$/, '')}/{subjectComponents.reduce((sum, component) => sum + component.maxMarks, 0)}</p>
                        </article>;
                      })}
                      {visibleStudents.length === 0 && <p className="p-5 text-center text-sm text-slate-500">No students match your search.</p>}
                    </div>
                    <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[760px] border-collapse text-xs">
                      <thead className="bg-white text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3 text-left">Student</th>{subjectComponents.map(component => <th key={component.id} className="border-l px-2 py-3 text-center">{component.name}<span className="block text-[9px] normal-case">Max {component.maxMarks}</span></th>)}<th className="border-l px-3 py-3">Exam total</th><th className="px-3 py-3">Status</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {visibleStudents.map(student => {
                          const key = `${student.id}:${subject.id}`;
                          const input = marksInput[key] || { scores: {}, remarks: '' };
                          const mark = classMarks.find(item => item.studentId === student.id && item.subjectId === subject.id);
                          const locked = ['submitted', 'form_teacher_submitted', 'approved'].includes(mark?.status || '');
                          const editable = editableClassSubjects.some(item => item.id === subject.id) && !locked;
                          const examTotal = subjectComponents.reduce((sum, component) => sum + Number(input.scores[component.id] ?? mark?.assessmentScores?.[component.id] ?? 0), 0);
                          return <tr key={student.id} className="hover:bg-slate-50">
                            <td className="whitespace-nowrap px-3 py-3"><strong className="text-slate-800">{student.firstName} {student.middleName} {student.lastName}</strong><span className="mt-0.5 block text-[10px] text-slate-400">{student.rollNumber || student.studentId}</span></td>
                            {subjectComponents.map(component => <td key={component.id} className="border-l px-2 py-2 text-center">{editable ? <input type="number" min={0} max={component.maxMarks} step={0.5} value={input.scores[component.id] ?? ''} onChange={event => handleAssessmentScoreChange(student.id, subject.id, component, event.target.value, event.currentTarget)} onKeyDown={event => {
                              if (event.key !== 'Enter' && event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
                              event.preventDefault();
                              const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[data-mark-entry="true"]')).filter(input => input.offsetParent !== null);
                              const current = inputs.indexOf(event.currentTarget);
                              inputs[current + (event.key === 'ArrowUp' ? -1 : 1)]?.focus();
                            }} data-mark-entry="true" className="w-16 rounded-lg border border-slate-300 px-1.5 py-1.5 text-center" aria-label={`${component.name} mark for ${student.firstName} in ${subject.name}`} /> : <span>{mark?.assessmentScores?.[component.id] ?? '—'}</span>}</td>)}
                            <td className="border-l px-3 py-2 text-center font-bold text-slate-800">{examTotal.toFixed(1).replace(/\.0$/, '')}/{subjectComponents.reduce((sum, component) => sum + component.maxMarks, 0)}</td>
                            <td className="px-3 py-2 text-center text-[10px] text-slate-500">{mark?.status || 'Not entered'}</td>
                          </tr>;
                        })}
                      </tbody>
                    </table>
                  </div>
                  </>
                )}
              </section>
            );
              })}
            </>
          )}
          {isFormTeacher && <p className="text-[11px] text-slate-500">Form Teacher can review every active class subject, but can enter marks only for the subject assigned to their teacher profile. The class is forwarded only after every active subject has been submitted.</p>}
        </section>
      )}

      {/* EXAM RESULTS — READ ONLY */}
      {activeTab === 'exam_results' && isFormTeacher && (
        <section className="space-y-4">
          <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-600">Class
              <select value={selectedClassId} onChange={event => setSelectedClassId(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2">
                {formTeacherClasses.map(klass => <option key={klass.id} value={klass.id}>{klass.name}{klass.section ? ` · ${klass.section}` : ''}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">Term
              <select value={semester} onChange={event => setSemester(event.target.value as any)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2">
                <option value="Semester 1">Term 1</option><option value="Semester 2">Term 2</option>
              </select>
            </label>
          </div>
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="text-sm font-bold text-slate-900">Fasalka · {semester}</h2><p className="mt-1 text-xs text-slate-500">Review all active subjects. Totals, averages and ranks appear only after every subject has been submitted.</p></div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${allClassMarksSubmitted ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{allClassMarksSubmitted ? t('exam_all_active_subjects_submitted') : t('exam_waiting_for_all_subjects')}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {gradeSubjects.map(subject => {
                const subjectRows = classMarks.filter(mark => mark.subjectId === subject.id);
                const submitted = students.length > 0 && students.every(student => {
                  const mark = subjectRows.find(row => row.studentId === student.id);
                  return Boolean(mark && ['submitted', 'form_teacher_submitted', 'approved'].includes(mark.status) &&
                    assessmentComponents.every(component => Number.isFinite(mark.assessmentScores?.[component.id])));
                });
                const reopenable = students.length > 0 && students.every(student => {
                  const mark = subjectRows.find(row => row.studentId === student.id);
                  return Boolean(mark && mark.status === 'submitted' && !mark.publishedAt);
                });
                return <span key={subject.id} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${submitted ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                  {subject.name} {submitted ? '✓' : '⏳'}
                  {reopenable && <button type="button" title={`Reopen ${subject.name}`} onClick={() => void handleReopenSubjectMarks(subject.id)} disabled={isReadOnly || isReopeningSubjectId !== null} className="font-bold text-rose-700 disabled:opacity-40">↺</button>}
                </span>;
              })}
            </div>
          </section>
          {isLoadingClassData ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Loading class marks...</div> : (
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
                <div><h2 className="text-sm font-bold text-slate-900">Class results review</h2><p className="mt-1 text-[10px] text-slate-500">{students.length} students · {gradeSubjects.length} active subjects</p></div>
                <input type="search" value={studentSearch} onChange={event => setStudentSearch(event.target.value)} placeholder="Search student..." className="min-h-9 rounded-lg border border-slate-300 px-3 text-xs" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px] border-collapse text-xs">
                  <thead className="bg-white text-[10px] font-bold uppercase tracking-wide text-slate-600"><tr>
                    <th className="border-b px-3 py-3 text-left">#</th><th className="min-w-[200px] border-b px-3 py-3 text-left">Student / Roll No.</th>
                    {gradeSubjects.map(subject => <th key={subject.id} className="min-w-[85px] border-b border-l px-2 py-3 text-center">{subject.name}<span className="mt-1 block text-[9px] font-normal normal-case">/100</span></th>)}
                    <th className="border-b border-l bg-teal-50 px-3 py-3 text-center">Total</th><th className="border-b px-3 py-3 text-center">Average</th><th className="border-b px-3 py-3 text-center">Rank</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {examRegisterRows.map((row, index) => <tr key={row.student.id}>
                      <td className="px-3 py-2.5 text-center">{allClassMarksSubmitted ? row.rank : index + 1}</td>
                      <td className="px-3 py-2.5"><strong className="block">{row.student.firstName} {row.student.middleName} {row.student.lastName}</strong><span className="text-[10px] text-slate-400">{row.student.rollNumber || row.student.studentId}</span></td>
                      {row.subjectScores.map(score => <td key={score.subjectId} className="border-l px-2 py-2.5 text-center">{score.submitted ? score.total.toFixed(1).replace(/\.0$/, '') : '—'}</td>)}
                      <td className="border-l bg-teal-50/50 px-3 py-2.5 text-center font-bold">{allClassMarksSubmitted ? `${row.total.toFixed(1).replace(/\.0$/, '')}/${row.max}` : '—'}</td>
                      <td className="px-3 py-2.5 text-center">{allClassMarksSubmitted ? row.average.toFixed(1).replace(/\.0$/, '') : '—'}</td>
                      <td className="px-3 py-2.5 text-center font-bold">{allClassMarksSubmitted ? row.rank : '—'}</td>
                    </tr>)}
                  </tbody>
                </table>
              </div>
              {examRegisterRows.length === 0 && <p className="p-6 text-center text-sm text-slate-500">No students found in this class.</p>}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 p-4">
                <p className="text-xs text-slate-500">{allClassMarksSubmitted ? 'Class is complete and ready to forward.' : 'Complete all active subjects before forwarding to School Admin.'}</p>
                <button type="button" onClick={() => void handleForwardClassMarks()} disabled={isReadOnly || isSaving || isLoadingClassData || !allClassMarksSubmitted || classAlreadyForwarded} className="rounded-xl bg-[#0B2B2A] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"><Send className="mr-1 inline h-3.5 w-3.5"/>{classAlreadyForwarded ? 'Sent to Admin · waiting for review' : t('exam_forward_to_admin')}</button>
              </div>
            </section>
          )}
        </section>
      )}

      {activeTab === 'exam_results' && !isFormTeacher && (
        <section className="space-y-4">
          <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-600">Class
              <select value={selectedClassId} onChange={event => setSelectedClassId(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2">
                {classes.map(klass => <option key={klass.id} value={klass.id}>{klass.name}{klass.section ? ` · ${klass.section}` : ''}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">Semester
              <select value={semester} onChange={event => setSemester(event.target.value as any)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2">
                <option value="Semester 1">Semester 1</option><option value="Semester 2">Semester 2</option>
              </select>
            </label>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-teal-50 px-4 py-3"><h2 className="text-sm font-bold text-teal-950">Exam results</h2><p className="mt-1 text-xs text-teal-800">Read-only results for your assigned subjects. Enter or update marks in the separate Exam Marks section.</p></div>
          {isLoadingClassData ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Loading exam results...</div> : gradeSubjects.length === 0 ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">No assigned subject results are available for this class.</div> : gradeSubjects.map(subject => (
            <section key={subject.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-3"><h3 className="text-sm font-bold text-slate-900">{subject.name}</h3><p className="mt-1 text-[10px] text-slate-500">{semester} · Small Exam + Big Exam</p></div>
              <div className="space-y-3 p-3 md:hidden">
                {visibleStudents.map(student => { const mark = classMarks.find(item => item.studentId === student.id && item.subjectId === subject.id); return <article key={student.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-2"><div><p className="text-sm font-bold text-slate-900">{student.firstName} {student.middleName} {student.lastName}</p><p className="text-[11px] text-slate-500">{student.studentId}</p></div><span className="rounded-full bg-white px-2 py-1 text-[10px] text-slate-600">{mark?.status || 'Not entered'}</span></div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg bg-white p-2"><span className="block text-[10px] text-slate-500">Small Exam</span><strong>{mark ? mark.smallExamMarks : '—'}</strong></div><div className="rounded-lg bg-white p-2"><span className="block text-[10px] text-slate-500">Big Exam</span><strong>{mark ? mark.bigExamMarks : '—'}</strong></div><div className="rounded-lg bg-white p-2"><span className="block text-[10px] text-slate-500">Total</span><strong>{mark ? mark.totalMarks : '—'}</strong></div><div className="rounded-lg bg-white p-2"><span className="block text-[10px] text-slate-500">Percentage</span><strong>{mark ? `${mark.percentage}%` : '—'}</strong></div></div>
                </article>; })}
                {visibleStudents.length === 0 && <p className="p-5 text-center text-sm text-slate-500">No students match your search.</p>}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[760px] text-xs">
                  <thead className="bg-white text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3 text-left">Student</th><th className="px-3 py-3">Small Exam</th><th className="px-3 py-3">Big Exam</th><th className="px-3 py-3">Total</th><th className="px-3 py-3">Percentage</th><th className="px-3 py-3">Status</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">{visibleStudents.map(student => { const mark = classMarks.find(item => item.studentId === student.id && item.subjectId === subject.id); return <tr key={student.id} className="hover:bg-slate-50"><td className="px-3 py-3"><strong className="text-slate-800">{student.firstName} {student.middleName} {student.lastName}</strong><span className="block text-[10px] text-slate-400">{student.studentId}</span></td><td className="px-3 py-3 text-center">{mark ? mark.smallExamMarks : '—'}</td><td className="px-3 py-3 text-center">{mark ? mark.bigExamMarks : '—'}</td><td className="px-3 py-3 text-center font-semibold">{mark ? mark.totalMarks : '—'}</td><td className="px-3 py-3 text-center">{mark ? `${mark.percentage}%` : '—'}</td><td className="px-3 py-3 text-center text-[10px] text-slate-500">{mark?.status || 'Not entered'}</td></tr>; })}</tbody>
                </table>
              </div>
            </section>
          ))}
        </section>
      )}

      {/* TAB 5: HOMEWORK */}
      {activeTab === 'assignments' && (
        <div className="grid grid-cols-1 gap-4 text-xs lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-[#132A29] flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-[#0F766E]" />
              Assign Homework
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Class</label>
                <select value={selectedClassId} onChange={e => setSelectedClassId(e.target.value)} className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-xl">
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name} ({c.section})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Subject</label>
                <select value={selectedSubjectId} onChange={e => setSelectedSubjectId(e.target.value)} className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-xl">
                  {classSubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">Title</label>
              <input value={assignmentTitle} onChange={e => setAssignmentTitle(e.target.value)} maxLength={255} placeholder="Homework title" className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-xl" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">Instructions</label>
              <textarea value={assignmentDescription} onChange={e => setAssignmentDescription(e.target.value)} rows={4} placeholder="Describe the homework and expected work." className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-xl resize-y" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Due date</label>
                <input type="date" min={getSchoolLocalDate(school?.timezone)} value={assignmentDueDate} onChange={e => setAssignmentDueDate(e.target.value)} className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-xl" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Max points</label>
                <input type="number" min={1} max={1000} value={assignmentMaxPoints} onChange={e => setAssignmentMaxPoints(Math.min(1000, Math.max(1, Number(e.target.value) || 1)))} className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-xl" />
              </div>
            </div>
            <button
              type="button"
              onClick={handleCreateAssignment}
              disabled={isReadOnly || isCreatingAssignment || !selectedClassId || !selectedSubjectId || !assignmentTitle.trim() || !assignmentDescription.trim() || !assignmentDueDate}
              className="w-full py-2 px-4 bg-[#0F766E] hover:bg-[#0D655E] text-white text-xs font-semibold rounded-xl shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              {isCreatingAssignment ? 'Assigning...' : 'Assign Homework'}
            </button>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-[#132A29]">Assigned Homework</h2>
            {assignmentsState.loading ? <div className="h-24 animate-pulse rounded-xl bg-slate-100" /> : assignmentsState.error ? <ErrorState error={assignmentsState.error} onRetry={assignmentsState.retry} /> : homework.length === 0 ? <p className="text-[#64748B]">No homework has been assigned to your classes yet.</p> : <div className="space-y-2">{homework.map(item => <div key={item.id} className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold text-[#132A29]">{item.title}</p>
                <span className={`font-mono text-[10px] font-semibold ${item.dueDate < new Date().toISOString().slice(0, 10) ? 'text-rose-700' : 'text-[#0F766E]'}`}>{item.dueDate}</span>
              </div>
              <p className="text-[#475569]">{item.description}</p>
              <p className="text-[11px] text-[#64748B]">{item.subjectName || item.subjectId} • {item.maxPoints} points</p>
            </div>)}</div>}
          </div>

          <div className="lg:col-span-2 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-[#132A29] flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-[#0F766E]" />
              Student Submissions
            </h2>
            <select value={reviewAssignmentId} onChange={handleReviewAssignment} className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-xl">
              <option value="">Select assigned homework</option>
              {homework.map(item => <option key={item.id} value={item.id}>{item.title} - {item.dueDate}</option>)}
            </select>
            {!reviewAssignmentId ? <p className="text-[#64748B]">Choose homework to review student submissions.</p> : isLoadingSubmissions ? <div className="h-20 animate-pulse rounded-xl bg-slate-100" /> : reviewSubmissions.length === 0 ? <p className="text-[#64748B]">No student has submitted this homework yet.</p> : <div className="space-y-3">{reviewSubmissions.map(submission => {
              const draft = gradeDrafts[submission.id] || { grade: '', feedback: '' };
              const assignment = homework.find(item => item.id === reviewAssignmentId);
              return (
                <div key={submission.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold text-[#132A29]">{submission.studentName}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${submission.status === 'graded' ? 'bg-[#CCFBF1] text-[#0F766E]' : 'bg-amber-100 text-amber-800'}`}>
                      {submission.status === 'graded' ? `Graded ${submission.grade}/${assignment?.maxPoints || 0}` : `Submitted ${submission.submittedAt.slice(0, 10)}`}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-[#475569]">{submission.content}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-[110px_1fr_auto] gap-2 items-end">
                    <div>
                      <label className="block text-[10px] font-semibold text-[#475569] mb-1">Grade</label>
                      <input
                        type="number"
                        min={0}
                        max={assignment?.maxPoints || 0}
                        value={draft.grade}
                        onChange={event => setGradeDrafts(current => ({ ...current, [submission.id]: { ...draft, grade: event.target.value } }))}
                        className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-xl bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-[#475569] mb-1">Feedback</label>
                      <textarea
                        value={draft.feedback}
                        maxLength={2000}
                        rows={2}
                        onChange={event => setGradeDrafts(current => ({ ...current, [submission.id]: { ...draft, feedback: event.target.value } }))}
                        className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-xl bg-white resize-y"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleGradeSubmission(submission)}
                      disabled={isReadOnly || gradingSubmissionId !== null}
                      className="rounded-xl bg-[#0F766E] px-3 py-2 font-semibold text-white disabled:opacity-50"
                    >
                      {gradingSubmissionId === submission.id ? 'Saving...' : submission.status === 'graded' ? 'Update Grade' : 'Save Grade'}
                    </button>
                  </div>
                  {submission.status === 'graded' && submission.feedback && <p className="text-[11px] text-[#0F766E]">Current feedback: {submission.feedback}</p>}
                </div>
              );
            })}</div>}
          </div>
        </div>
      )}

      {/* TAB 4: CIRCULARS & NOTICES */}
      {activeTab === 'notices' && (
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-700">School communication</p>
              <h2 className="mt-1 text-base font-bold text-slate-900">Faculty notices & announcements</h2>
            </div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">{notices.length} notices</span>
          </div>
          {noticesState.loading ? (
            <div className="h-20 animate-pulse rounded-xl bg-slate-100" aria-label="Loading notices" />
          ) : noticesState.error ? (
            <ErrorState error={noticesState.error} onRetry={noticesState.retry} />
          ) : notices.length === 0 ? (
            <p className="text-[#64748B]">No announcements posted yet.</p>
          ) : (
            <div className="space-y-3">
              {notices.map(n => (
                <article key={n.id} className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-[#132A29]">{n.title}</span>
                    <span className="text-[10px] text-[#64748B] font-mono">{n.publishDate}</span>
                  </div>
                  <p className="text-[#334155]">{n.content}</p>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
