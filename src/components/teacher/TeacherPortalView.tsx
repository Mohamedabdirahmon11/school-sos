/**
 * Teacher Faculty Portal
 * Rules Enforced:
 * 1. Daily Attendance taken ONCE PER DAY (Present, Absent, Late, Excused)
 * 2. Exam marks: Small Exam + Big Exam -> Percentage only (no letter grades or GPA)
 * 3. Subject teachers submit their assigned subjects to the Form Teacher; the Form Teacher forwards the complete class to Admin.
 * 4. Personal teaching schedule & notices
 */

import React, { useState, useEffect } from 'react';
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
  ClipboardList
} from 'lucide-react';

interface TeacherPortalViewProps {
  initialTab?: 'dashboard' | 'timetable' | 'attendance' | 'grades' | 'assignments' | 'notices';
}

export const TeacherPortalView: React.FC<TeacherPortalViewProps> = ({ initialTab = 'dashboard' }) => {
  const { user, school, isReadOnly, t } = useAuth();
  const [activeTab, setActiveTab] = useState(initialTab);
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

  // Attendance state
  const [attendanceDate, setAttendanceDate] = useState(() => getSchoolLocalDate(school?.timezone));
  const [attendanceMap, setAttendanceMap] = useState<Record<string, { status: AttendanceStatus; note: string }>>({});
  const ethiopianCalendar = getEthiopianCalendarInfo(attendanceDate, school?.timezone || 'Africa/Addis_Ababa');

  // Marks state (Small Exam + Big Exam)
  const [semester, setSemester] = useState<'Semester 1' | 'Semester 2'>('Semester 1');
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
    const firstAssignedSubject = teacherAssignments.find((assignment: any) => assignment.classId === selectedClassId)?.subject.id || '';
    if (!classSubjects.some(subject => subject.id === selectedSubjectId)) setSelectedSubjectId(firstAssignedSubject);
  }, [selectedClassId, teacherAssignments, classSubjects, selectedSubjectId]);

  // Load the full class mark matrix. Subject teachers see only their assigned subjects;
  // the Form Teacher sees submitted marks from every subject plus their own editable subject(s).
  useEffect(() => {
    if (!selectedClassId) { setStudents([]); return; }
    if (activeTab === 'attendance' && !formTeacherClasses.some(klass => klass.id === selectedClassId)) {
      setStudents([]);
      setAttendanceMap({});
      return;
    }
    let cancelled = false;
    Promise.all([
      ApiClient.getAllStudents(selectedClassId),
      ApiClient.getDailyAttendance(selectedClassId, attendanceDate),
      ApiClient.getMarks(selectedClassId, undefined, semester)
    ]).then(([stdList, existingAtt, existingMarks]) => {
      if (cancelled) return;
      setStudents(stdList);
      const attMap: Record<string, { status: AttendanceStatus; note: string }> = {};
      for (const student of stdList) {
        const found = existingAtt.find(record => record.studentId === student.id);
        attMap[student.id] = { status: found ? found.status : 'present', note: found?.note || '' };
      }
      setAttendanceMap(attMap);
      setClassMarks(existingMarks);
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
            scores: mark?.assessmentScores || legacyScores,
            remarks: mark?.teacherRemarks || ''
          };
        }
      }
      setMarksInput(inputMap);
    }).catch(error => {
      if (!cancelled) setNotice(error instanceof Error ? error.message : 'Unable to load class marks.');
    });
    return () => { cancelled = true; };
  }, [activeTab, selectedClassId, attendanceDate, semester, teacherAssignments, formTeacherClasses, examConfig]);

  // Save Attendance (Once per day)
  const handleSaveAttendance = async () => {
    if (isReadOnly || !selectedClassId) return;
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

  // Save every subject assigned to this teacher in one operation.
  const handleSaveMarks = async (status: 'draft' | 'submitted') => {
    if (isReadOnly || !selectedClassId || !editableClassSubjects.length || !students.length) return;
    setIsSaving(true);
    try {
      const results = await Promise.all(editableClassSubjects.map(async subject => {
        const existing = classMarks.filter(mark => mark.subjectId === subject.id);
        if (existing.some(mark => ['submitted', 'form_teacher_submitted', 'approved'].includes(mark.status))) return [];
        const formatted = students.map(student => {
          const input = marksInput[`${student.id}:${subject.id}`] || { scores: {}, remarks: '' };
          return {
            studentId: student.id,
            assessmentScores: input.scores,
            teacherRemarks: input.remarks || '',
            status
          };
        });
        const saved = await ApiClient.saveMarks(selectedClassId, subject.id, semester, formatted);
        return saved.marks || [];
      }));
      const savedMarks = results.flat();
      setClassMarks(current => [...current.filter(mark => !savedMarks.some(saved => saved.id === mark.id)), ...savedMarks]);
      setNotice(status === 'submitted'
        ? `You submitted ${savedMarks.length} mark records to the class Form Teacher for review.`
        : `Drafts saved for ${editableClassSubjects.length} assigned subject(s).`);
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
    if (isReadOnly || !selectedClassId || !selectedSubjectId) return;
    setIsCreatingAssignment(true);
    try {
      await ApiClient.createAssignment({
        classId: selectedClassId,
        subjectId: selectedSubjectId,
        title: assignmentTitle,
        description: assignmentDescription,
        dueDate: assignmentDueDate,
        maxPoints: assignmentMaxPoints
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
    setReviewAssignmentId(assignmentId);
    setReviewSubmissions([]);
    if (!assignmentId) return;
    setIsLoadingSubmissions(true);
    try {
      const submissions = await ApiClient.getAssignmentSubmissions(assignmentId);
      setReviewSubmissions(submissions);
      setGradeDrafts(current => {
        const next = { ...current };
        for (const submission of submissions) {
          next[submission.id] = { grade: submission.grade?.toString() || '', feedback: submission.feedback || '' };
        }
        return next;
      });
    } catch (err: any) {
      setNotice(err.message || 'Failed to load submissions.');
    } finally {
      setIsLoadingSubmissions(false);
    }
  };

  const handleGradeSubmission = async (submission: AssignmentSubmission) => {
    const assignment = homework.find(item => item.id === reviewAssignmentId);
    const draft = gradeDrafts[submission.id];
    const grade = Number(draft?.grade);
    if (!assignment) return;
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

  if (initialData.loading) return <div className="p-6 space-y-4" aria-label="Loading teacher dashboard"><div className="h-8 w-1/3 animate-pulse rounded bg-slate-200" /><div className="grid gap-4 sm:grid-cols-2"><div className="h-32 animate-pulse rounded-xl bg-white" /><div className="h-32 animate-pulse rounded-xl bg-white" /></div></div>;
  if (initialData.error) return <ErrorState error={initialData.error} onRetry={initialData.retry} />;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#132A29]">
            Teacher Faculty Portal
          </h1>
          <p className="text-xs text-[#64748B]">
            Welcome, {user?.fullName} · {school?.name}
          </p>
        </div>


      </div>

      {notice && (
        <div className="p-3 bg-teal-50 border border-teal-200 text-teal-800 rounded-lg text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* TAB 1: TEACHER SCHEDULE */}
      {(activeTab === 'dashboard' || activeTab === 'timetable') && (
        <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-[#132A29] flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-[#0F766E]" />
            <span>Weekly Teaching Schedule & Timetable</span>
          </h2>
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
                  <div key={slot.id} className="p-3.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl space-y-1 text-xs">
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

      {/* TAB 2: DAILY ATTENDANCE (ONCE PER DAY) */}
      {activeTab === 'attendance' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-sm grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            {formTeacherClasses.length === 0 && <p className="sm:col-span-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">No class is assigned to you as Form Teacher. Contact School Admin to assign you to a class.</p>}
            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">My Form Teacher Class</label>
              <select
                value={selectedClassId}
                onChange={e => setSelectedClassId(e.target.value)}
                className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-lg"
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
                className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-lg"
              />
              <p className="mt-1 text-[11px] text-[#64748B]">Ethiopian date: {ethiopianCalendar.dateLabel}</p>
              {ethiopianCalendar.holiday && <p className="mt-1 text-[11px] font-semibold text-amber-700">Ethiopian public holiday: {ethiopianCalendar.holiday}</p>}
            </div>
            <div>
              <button
                type="button"
                onClick={handleSaveAttendance}
                disabled={isSaving || isReadOnly || students.length === 0 || !formTeacherClasses.some(klass => klass.id === selectedClassId)}
                className="w-full py-2 px-4 bg-[#0F766E] hover:bg-[#0D655E] text-white text-xs font-semibold rounded-lg shadow-sm flex items-center justify-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                {isSaving ? 'Saving...' : 'Save Attendance'}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
            <table className="w-full text-left text-xs text-[#132A29]">
              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] uppercase font-semibold text-[#64748B]">
                <tr>
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {students.map(s => {
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
      )}

      {/* TAB 3: CLASS MARK MATRIX */}
      {activeTab === 'grades' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm sm:grid-cols-3">
            <label className="text-xs font-semibold text-[#475569]">Class
              <select value={selectedClassId} onChange={event => setSelectedClassId(event.target.value)} className="mt-1 w-full rounded-lg border border-[#CBD5E1] px-3 py-2">
                {classes.map(klass => <option key={klass.id} value={klass.id}>{klass.name} ({klass.section})</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-[#475569]">Semester
              <select value={semester} onChange={event => setSemester(event.target.value as any)} className="mt-1 w-full rounded-lg border border-[#CBD5E1] px-3 py-2">
                <option value="Semester 1">Semester 1</option><option value="Semester 2">Semester 2</option>
              </select>
            </label>
            <div className="flex items-end gap-2">
              <button type="button" onClick={() => void handleSaveMarks('draft')} disabled={isReadOnly || isSaving || !editableClassSubjects.length || !students.length} className="flex-1 rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"><Save className="mr-1 inline h-3.5 w-3.5"/>Save all drafts</button>
              <button type="button" onClick={() => void handleSaveMarks('submitted')} disabled={isReadOnly || isSaving || !editableClassSubjects.length || !students.length} className="flex-1 rounded-lg bg-[#0F766E] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Send className="mr-1 inline h-3.5 w-3.5"/>Submit all subjects</button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-100 bg-teal-50 p-3 text-xs text-teal-900">
            <div>
              <strong>{isFormTeacher ? 'Form Teacher class review' : 'Your assigned subject marks'}</strong>
              <p className="mt-1">{assessmentComponents.map(component => `${component.name} (${component.maxMarks})`).join(' + ')} = {combinedMax} marks. All subjects in your permitted class scope are shown together.</p>
              <p className="mt-1">{gradeSubjects.length} subject(s) · {students.length} students · {classMarks.filter(mark => mark.status === 'submitted' || mark.status === 'form_teacher_submitted').length} submitted mark rows</p>
            </div>
            {isFormTeacher && <button type="button" onClick={() => void handleForwardClassMarks()} disabled={isReadOnly || isSaving} className="rounded-lg bg-[#0B2B2A] px-4 py-2 font-semibold text-white disabled:opacity-50"><Send className="mr-1 inline h-3.5 w-3.5"/>Forward complete class to Admin</button>}
          </div>

          <div className="overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white shadow-sm">
            {gradeSubjects.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No subjects are assigned to this teacher for the selected class.</p> : (
              <table className="w-full min-w-[900px] border-collapse text-xs text-[#132A29]">
                <thead className="bg-[#F8FAFC] text-[11px] uppercase text-[#64748B]">
                  <tr><th rowSpan={2} className="border-b px-3 py-3 text-left">Student</th>{gradeSubjects.map(subject => <th key={subject.id} colSpan={assessmentComponents.length + 2} className="border-b border-l px-2 py-2 text-center">{subject.name}</th>)}</tr>
                  <tr>{gradeSubjects.map(subject => <React.Fragment key={subject.id}>{assessmentComponents.map(component => <th key={component.id} className="border-b border-l px-2 py-2">{component.name}<span className="block text-[9px] normal-case">/{component.maxMarks}</span></th>)}<th className="border-b border-l px-2 py-2">Total</th><th className="border-b px-2 py-2">%</th></React.Fragment>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {students.map(student => (
                    <tr key={student.id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-3 py-2"><strong>{student.firstName} {student.middleName} {student.lastName}</strong><span className="block text-[10px] text-slate-500">{student.studentId}</span></td>
                      {gradeSubjects.map(subject => {
                        const key = `${student.id}:${subject.id}`;
                        const input = marksInput[key] || { scores: {}, remarks: '' };
                        const mark = classMarks.find(item => item.studentId === student.id && item.subjectId === subject.id);
                        const editable = editableClassSubjects.some(item => item.id === subject.id) && !['submitted', 'form_teacher_submitted', 'approved'].includes(mark?.status || '');
                        const total = assessmentComponents.reduce((sum, component) => sum + Number(input.scores[component.id] || 0), 0);
                        const percentage = combinedMax > 0 ? Math.round(total / combinedMax * 10000) / 100 : 0;
                        return <React.Fragment key={subject.id}>
                          {assessmentComponents.map(component => (
                            <td key={component.id} className="border-l px-1 py-2 text-center">
                              {editable ? <input type="number" min={0} max={component.maxMarks} step={0.5} value={input.scores[component.id] ?? ''} onChange={event => {
                                const value = event.target.value === '' ? 0 : Math.min(component.maxMarks, Math.max(0, Number(event.target.value) || 0));
                                setMarksInput(prev => ({ ...prev, [key]: { ...prev[key], scores: { ...(prev[key]?.scores || {}), [component.id]: value } } }));
                              }} className="w-14 rounded border px-1 py-1 text-center" aria-label={`${component.name} mark for ${student.firstName} ${subject.name}`} /> : <span>{mark?.assessmentScores?.[component.id] ?? '—'}</span>}
                            </td>
                          ))}
                          <td className="border-l px-2 py-2 text-center font-semibold">{mark && !editable ? mark.totalMarks : total}</td>
                          <td className="px-2 py-2 text-center">{mark && !editable ? mark.percentage : percentage}%<span className="block text-[9px] text-slate-400">{mark?.status === 'submitted' ? 'To Form Teacher' : mark?.status === 'form_teacher_submitted' ? 'To Admin' : mark?.status === 'approved' ? 'Approved' : mark?.status === 'draft' ? 'Draft' : editable ? 'Enter' : 'Waiting'}</span></td>
                        </React.Fragment>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {isFormTeacher && <p className="text-[11px] text-slate-500">As Form Teacher, you can complete any subject in your class. Subject teachers can enter marks only for their own assigned subjects. Submitted marks remain locked; forwarding is allowed after the complete class sheet is ready.</p>}
        </div>
      )}

      {/* TAB 5: HOMEWORK */}
      {activeTab === 'assignments' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
          <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-sm space-y-3">
            <h2 className="text-sm font-bold text-[#132A29] flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-[#0F766E]" />
              Assign Homework
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Class</label>
                <select value={selectedClassId} onChange={e => setSelectedClassId(e.target.value)} className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-lg">
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name} ({c.section})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Subject</label>
                <select value={selectedSubjectId} onChange={e => setSelectedSubjectId(e.target.value)} className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-lg">
                  {classSubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">Title</label>
              <input value={assignmentTitle} onChange={e => setAssignmentTitle(e.target.value)} maxLength={255} placeholder="Homework title" className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">Instructions</label>
              <textarea value={assignmentDescription} onChange={e => setAssignmentDescription(e.target.value)} rows={4} placeholder="Describe the homework and expected work." className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-lg resize-y" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Due date</label>
                <input type="date" value={assignmentDueDate} onChange={e => setAssignmentDueDate(e.target.value)} className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Max points</label>
                <input type="number" min={1} max={1000} value={assignmentMaxPoints} onChange={e => setAssignmentMaxPoints(Math.min(1000, Math.max(1, Number(e.target.value) || 1)))} className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-lg" />
              </div>
            </div>
            <button
              type="button"
              onClick={handleCreateAssignment}
              disabled={isReadOnly || isCreatingAssignment || !selectedClassId || !selectedSubjectId || !assignmentTitle.trim() || !assignmentDescription.trim() || !assignmentDueDate}
              className="w-full py-2 px-4 bg-[#0F766E] hover:bg-[#0D655E] text-white text-xs font-semibold rounded-lg shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              {isCreatingAssignment ? 'Assigning...' : 'Assign Homework'}
            </button>
          </div>

          <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-sm space-y-3">
            <h2 className="text-sm font-bold text-[#132A29]">Assigned Homework</h2>
            {assignmentsState.loading ? <div className="h-24 animate-pulse rounded-lg bg-slate-100" /> : assignmentsState.error ? <ErrorState error={assignmentsState.error} onRetry={assignmentsState.retry} /> : homework.length === 0 ? <p className="text-[#64748B]">No homework has been assigned to your classes yet.</p> : <div className="space-y-2">{homework.map(item => <div key={item.id} className="p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold text-[#132A29]">{item.title}</p>
                <span className={`font-mono text-[10px] font-semibold ${item.dueDate < new Date().toISOString().slice(0, 10) ? 'text-rose-700' : 'text-[#0F766E]'}`}>{item.dueDate}</span>
              </div>
              <p className="text-[#475569]">{item.description}</p>
              <p className="text-[11px] text-[#64748B]">{item.subjectName || item.subjectId} • {item.maxPoints} points</p>
            </div>)}</div>}
          </div>

          <div className="lg:col-span-2 bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-sm space-y-3">
            <h2 className="text-sm font-bold text-[#132A29] flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-[#0F766E]" />
              Student Submissions
            </h2>
            <select value={reviewAssignmentId} onChange={handleReviewAssignment} className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-lg">
              <option value="">Select assigned homework</option>
              {homework.map(item => <option key={item.id} value={item.id}>{item.title} - {item.dueDate}</option>)}
            </select>
            {!reviewAssignmentId ? <p className="text-[#64748B]">Choose homework to review student submissions.</p> : isLoadingSubmissions ? <div className="h-20 animate-pulse rounded-lg bg-slate-100" /> : reviewSubmissions.length === 0 ? <p className="text-[#64748B]">No student has submitted this homework yet.</p> : <div className="space-y-3">{reviewSubmissions.map(submission => {
              const draft = gradeDrafts[submission.id] || { grade: '', feedback: '' };
              const assignment = homework.find(item => item.id === reviewAssignmentId);
              return (
                <div key={submission.id} className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 space-y-2">
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
                        className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-[#475569] mb-1">Feedback</label>
                      <textarea
                        value={draft.feedback}
                        maxLength={2000}
                        rows={2}
                        onChange={event => setGradeDrafts(current => ({ ...current, [submission.id]: { ...draft, feedback: event.target.value } }))}
                        className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-lg bg-white resize-y"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleGradeSubmission(submission)}
                      disabled={isReadOnly || gradingSubmissionId === submission.id}
                      className="rounded-lg bg-[#0F766E] px-3 py-2 font-semibold text-white disabled:opacity-50"
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
        <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-sm space-y-3 text-xs">
          <h2 className="text-sm font-bold text-[#132A29]">Faculty Bulletins & Announcements</h2>
          {notices.length === 0 ? (
            <p className="text-[#64748B]">No announcements posted yet.</p>
          ) : (
            <div className="space-y-3">
              {notices.map(n => (
                <div key={n.id} className="p-3.5 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-[#132A29]">{n.title}</span>
                    <span className="text-[10px] text-[#64748B] font-mono">{n.publishDate}</span>
                  </div>
                  <p className="text-[#334155]">{n.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
