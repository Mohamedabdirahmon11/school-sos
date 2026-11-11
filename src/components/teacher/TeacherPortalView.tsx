/**
 * Teacher Workspace
 * Rules Enforced:
 * 1. Daily Attendance taken ONCE PER DAY (Present, Absent, Late, Excused)
 * 2. Exam marks: school-configured assessment components -> weighted total and percentage
 * 3. Subject teachers submit assigned subjects; Form Teachers manage the full class mark sheet and forward it to Admin.
 * 4. Personal teaching schedule & notices
 */

import React, { useState, useEffect, useRef } from 'react';
import { ApiClient } from '../../services/api.ts';
import { getEthiopianCalendarInfo, getSchoolLocalDate } from '../../lib/ethiopian-calendar.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { useApi } from '../../hooks/useApi.ts';
import { ErrorState } from '../common/ErrorState.tsx';
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

export const TeacherPortalView: React.FC<TeacherPortalViewProps> = ({ initialTab = 'dashboard' }) => {
  const { user, school, isReadOnly } = useAuth();
  const [activeTab, setActiveTab] = useState(initialTab);
  useEffect(() => { setActiveTab(initialTab); }, [initialTab]);
  const initialData = useApi(async () => Promise.all([
    ApiClient.getTeacherSubjectAssignments(),
    ApiClient.getExamConfig(),
    ApiClient.getTimetable(undefined, user?.id),
    ApiClient.getNotices(),
    ApiClient.getMyFormTeacherClasses()
  ]), [school?.id, user?.id], Boolean(school));
  const [assignmentsData, examConfigData, timetableData, noticesData, formTeacherClassesData] = initialData.data || [[], null, [], [], []];
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const teacherAssignments = Array.isArray(assignmentsData) ? assignmentsData : [];
  const formTeacherClasses: SchoolClass[] = Array.isArray(formTeacherClassesData) ? formTeacherClassesData : [];
  const classes: SchoolClass[] = [...new Map([
    ...teacherAssignments.map((assignment: any) => [assignment.class.id, assignment.class] as [string, SchoolClass]),
    ...formTeacherClasses.map(klass => [klass.id, klass] as [string, SchoolClass])
  ]).values()];
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
  const timetable: TimetableSlot[] = Array.isArray(timetableData) ? timetableData : [];
  const notices: SchoolNotice[] = Array.isArray(noticesData) ? noticesData : [];
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
  const attendanceCounts = (['present', 'absent', 'late', 'excused'] as AttendanceStatus[]).map(status => ({
    status,
    count: students.filter(student => (attendanceMap[student.id]?.status || 'present') === status).length
  }));

  // Marks state (Small Exam + Big Exam)
  const [semester, setSemester] = useState<'Semester 1' | 'Semester 2'>('Semester 1');
  const [examType, setExamType] = useState<'small' | 'big'>('small');
  const [marksInput, setMarksInput] = useState<Record<string, { scores: Record<string, number>; remarks: string }>>({});
  const [classMarks, setClassMarks] = useState<StudentMark[]>([]);

  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => { if (classes.length && !selectedClassId) setSelectedClassId(classes[0].id); }, [classes, selectedClassId]);
  useEffect(() => {
    if (activeTab === 'attendance' && formTeacherClasses.length && !formTeacherClasses.some(klass => klass.id === selectedClassId)) {
      setSelectedClassId(formTeacherClasses[0].id);
    }
  }, [activeTab, formTeacherClasses, selectedClassId]);
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
          const inputMap: Record<string, { scores: Record<string, number>; remarks: string }> = {};
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
            for (const subject of gradeSubjects) {
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

  // Save all editable subject rows for this teacher in one operation.
  const handleSaveMarks = async (status: 'draft' | 'submitted') => {
    if (isReadOnly || isLoadingClassData || !selectedClassId || !editableClassSubjects.length || !students.length) return;
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

  const smallMax = examConfig?.smallExamMax || 40;
  const bigMax = examConfig?.bigExamMax || 60;
  const combinedMax = smallMax + bigMax;
  const assessmentComponents = examConfig?.assessmentComponents || [];

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
              {formTeacherClasses.length ? <ul className="mt-3 space-y-2">{formTeacherClasses.map(klass => <li key={klass.id} className="rounded-xl border border-teal-100 bg-white px-3 py-2 text-sm font-semibold text-slate-800">{klass.name}{klass.section ? ` · ${klass.section}` : ''}</li>)}</ul> : <p className="mt-3 text-xs text-slate-500">No Form Teacher class has been assigned to your account.</p>}
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-teal-700">Teaching assignments</p>
              <h2 className="mt-1 text-base font-bold text-slate-900">Subjects you teach</h2>
              {teacherAssignments.filter((assignment: any) => !assignment.isFormTeacher).length ? <ul className="mt-3 space-y-2">{teacherAssignments.filter((assignment: any) => !assignment.isFormTeacher).map((assignment: any) => <li key={`${assignment.classId}:${assignment.subject.id}`} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-xs"><span className="font-semibold text-slate-800">{assignment.subject.name}</span><span className="text-slate-500">{assignment.class?.name || 'Assigned class'}</span></li>)}</ul> : <p className="mt-3 text-xs text-slate-500">No teaching subjects have been assigned yet.</p>}
            </section>
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
                Weekly timetable
              </h2>
            </div>
            <span className="rounded-full border border-teal-100 bg-teal-50 px-3 py-1.5 text-xs font-bold text-teal-800">{timetable.length} assigned periods</span>
          </div>
          {timetable.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#64748B]">
              No schedule slots assigned. Contact school administration to set your timetable.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {timetable.map(slot => {
                const c = classes.find(cls => cls.id === slot.classId);
                const s = subjects.find(sub => sub.id === slot.subjectId);
                return (
                  <div key={slot.id} className="group rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#132A29]">{slot.dayOfWeek}</span>
                      <span className="font-mono text-[11px] font-bold text-[#0F766E]">Period {slot.periodNumber}</span>
                    </div>
                    <p className="font-semibold text-teal-900">{s?.name || 'Subject'}</p>
                    <p className="text-[11px] text-[#64748B]">{c?.name || 'Class'} · Room {slot.roomNumber || 'TBA'}</p>
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
            <label className="block text-xs font-semibold text-slate-600">Assigned class
              <select value={selectedClassId} onChange={event => setSelectedClassId(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 sm:max-w-sm">
                {classes.map(klass => <option key={klass.id} value={klass.id}>{klass.name}{klass.section ? ` · ${klass.section}` : ''}</option>)}
              </select>
            </label>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div><h2 className="text-sm font-bold text-slate-900">Students in this class</h2><p className="mt-1 text-[11px] text-slate-500">Only students from classes assigned to your teacher account are shown.</p></div>
              <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-800">{students.length} students</span>
            </div>
            {isLoadingClassData ? <p className="p-8 text-center text-sm text-slate-500">Loading assigned students...</p> : students.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No students found in this assigned class.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">#</th><th className="px-4 py-3">Student</th><th className="px-4 py-3">Student ID</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">{students.map((student, index) => <tr key={student.id} className="hover:bg-slate-50"><td className="px-4 py-3 text-slate-400">{index + 1}</td><td className="px-4 py-3 font-semibold text-slate-800">{student.firstName} {student.middleName} {student.lastName}</td><td className="px-4 py-3 font-mono text-slate-500">{student.studentId}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </div>
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
            <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs text-[#132A29]">
              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] uppercase font-semibold text-[#64748B]">
                <tr>
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {isLoadingClassData ? <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-500">Loading students and attendance...</td></tr> : students.map(s => {
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

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-teal-100 bg-teal-50 p-4">
            <div><p className="text-sm font-bold text-teal-950">Enter marks by subject and exam type</p><p className="mt-1 text-xs text-teal-800">Each subject has its own mark sheet. Small Exam and Big Exam scores are saved together in the student's subject record.</p></div>
            {isFormTeacher && <button type="button" onClick={() => void handleForwardClassMarks()} disabled={isReadOnly || isSaving || isLoadingClassData} className="rounded-xl bg-[#0B2B2A] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"><Send className="mr-1 inline h-3.5 w-3.5"/>Forward class to Admin</button>}
          </div>

          <div className="flex flex-wrap gap-2" role="group" aria-label="Exam type">
            <button type="button" aria-pressed={examType === 'small'} onClick={() => setExamType('small')} className={`rounded-xl border px-4 py-2 text-xs font-bold ${examType === 'small' ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>{examConfig?.smallExamName || 'Small Exam'} · {smallMax} marks</button>
            <button type="button" aria-pressed={examType === 'big'} onClick={() => setExamType('big')} className={`rounded-xl border px-4 py-2 text-xs font-bold ${examType === 'big' ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>{examConfig?.bigExamName || 'Big Exam'} · {bigMax} marks</button>
          </div>

          {isLoadingClassData ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Loading students and saved marks...</div> : gradeSubjects.length === 0 ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">No subjects are assigned to this teacher for the selected class.</div> : gradeSubjects.map(subject => {
            const subjectComponents = assessmentComponents.filter(component => component.category === (examType === 'small' ? 'continuous' : 'final'));
            return (
              <section key={subject.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
                  <div><h2 className="text-sm font-bold text-slate-900">{subject.name}</h2><p className="mt-1 text-[10px] text-slate-500">{classes.find(klass => klass.id === selectedClassId)?.name || 'Selected class'} · {examType === 'small' ? 'Small Exam' : 'Big Exam'}</p></div>
                  <span className="rounded-full bg-teal-50 px-3 py-1 text-[10px] font-bold text-teal-800">{students.length} students</span>
                </div>
                {subjectComponents.length === 0 ? <p className="p-6 text-center text-xs text-slate-500">No assessment components are configured for this exam type. Ask School Admin to configure the exam.</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] border-collapse text-xs">
                      <thead className="bg-white text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3 text-left">Student</th>{subjectComponents.map(component => <th key={component.id} className="border-l px-2 py-3 text-center">{component.name}<span className="block text-[9px] normal-case">Max {component.maxMarks}</span></th>)}<th className="border-l px-3 py-3">Exam total</th><th className="px-3 py-3">Status</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {students.map(student => {
                          const key = `${student.id}:${subject.id}`;
                          const input = marksInput[key] || { scores: {}, remarks: '' };
                          const mark = classMarks.find(item => item.studentId === student.id && item.subjectId === subject.id);
                          const locked = ['submitted', 'form_teacher_submitted', 'approved'].includes(mark?.status || '');
                          const editable = editableClassSubjects.some(item => item.id === subject.id) && !locked;
                          const examTotal = subjectComponents.reduce((sum, component) => sum + Number(input.scores[component.id] ?? mark?.assessmentScores?.[component.id] ?? 0), 0);
                          return <tr key={student.id} className="hover:bg-slate-50">
                            <td className="whitespace-nowrap px-3 py-3"><strong className="text-slate-800">{student.firstName} {student.middleName} {student.lastName}</strong><span className="mt-0.5 block text-[10px] text-slate-400">{student.studentId}</span></td>
                            {subjectComponents.map(component => <td key={component.id} className="border-l px-2 py-2 text-center">{editable ? <input type="number" min={0} max={component.maxMarks} step={0.5} value={input.scores[component.id] ?? ''} onChange={event => setMarksInput(previous => { const scores = { ...(previous[key]?.scores || {}) }; if (event.target.value === '') delete scores[component.id]; else scores[component.id] = Math.min(component.maxMarks, Math.max(0, Number(event.target.value) || 0)); return { ...previous, [key]: { ...previous[key], scores } }; })} className="w-16 rounded-lg border border-slate-300 px-1.5 py-1.5 text-center" aria-label={`${component.name} mark for ${student.firstName} in ${subject.name}`} /> : <span>{mark?.assessmentScores?.[component.id] ?? '—'}</span>}</td>)}
                            <td className="border-l px-3 py-2 text-center font-bold text-slate-800">{examTotal.toFixed(1).replace(/\.0$/, '')}/{subjectComponents.reduce((sum, component) => sum + component.maxMarks, 0)}</td>
                            <td className="px-3 py-2 text-center text-[10px] text-slate-500">{mark?.status || 'Not entered'}</td>
                          </tr>;
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}
          {isFormTeacher && <p className="text-[11px] text-slate-500">As Form Teacher, you may complete all subjects for your class. Subject teachers can enter only their assigned subjects. Submitted marks are locked; forwarding sends the completed class sheet to School Admin.</p>}
        </section>
      )}

      {/* EXAM RESULTS — READ ONLY */}
      {activeTab === 'exam_results' && (
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
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-xs">
                  <thead className="bg-white text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3 text-left">Student</th><th className="px-3 py-3">Small Exam</th><th className="px-3 py-3">Big Exam</th><th className="px-3 py-3">Total</th><th className="px-3 py-3">Percentage</th><th className="px-3 py-3">Status</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">{students.map(student => { const mark = classMarks.find(item => item.studentId === student.id && item.subjectId === subject.id); return <tr key={student.id} className="hover:bg-slate-50"><td className="px-3 py-3"><strong className="text-slate-800">{student.firstName} {student.middleName} {student.lastName}</strong><span className="block text-[10px] text-slate-400">{student.studentId}</span></td><td className="px-3 py-3 text-center">{mark ? mark.smallExamMarks : '—'}</td><td className="px-3 py-3 text-center">{mark ? mark.bigExamMarks : '—'}</td><td className="px-3 py-3 text-center font-semibold">{mark ? mark.totalMarks : '—'}</td><td className="px-3 py-3 text-center">{mark ? `${mark.percentage}%` : '—'}</td><td className="px-3 py-3 text-center text-[10px] text-slate-500">{mark?.status || 'Not entered'}</td></tr>; })}</tbody>
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
          {notices.length === 0 ? (
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
