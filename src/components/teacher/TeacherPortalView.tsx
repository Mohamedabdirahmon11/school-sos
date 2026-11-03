/**
 * Teacher Faculty Portal
 * Rules Enforced:
 * 1. Daily Attendance taken ONCE PER DAY (Present, Absent, Late, Excused)
 * 2. Exam marks: Small Exam + Big Exam -> Percentage only (no letter grades or GPA)
 * 3. Save Draft & Submit for Admin Approval (locked once approved)
 * 4. Personal teaching schedule & notices
 */

import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../services/api.ts';
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
  AssignmentSubmission
} from '../../types/index.ts';
import { 
  CalendarDays, 
  CalendarCheck, 
  FileSpreadsheet, 
  BellRing, 
  CheckCircle2, 
  Lock,
  Send,
  Save,
  Check,
  UserCheck,
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
    ApiClient.getNotices()
  ]), [school?.id, user?.id], Boolean(school));
  const [assignmentsData, examConfigData, timetableData, noticesData] = initialData.data || [[], null, [], []];
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const teacherAssignments = Array.isArray(assignmentsData) ? assignmentsData : [];
  const classes: SchoolClass[] = [...new Map(teacherAssignments.map((assignment: any) => [assignment.class.id, assignment.class])).values()] as SchoolClass[];
  const subjects: Subject[] = [...new Map(teacherAssignments.map((assignment: any) => [assignment.subject.id, assignment.subject])).values()] as Subject[];
  const classSubjects: Subject[] = teacherAssignments.filter((assignment: any) => assignment.classId === selectedClassId).map((assignment: any) => assignment.subject);
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
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, { status: AttendanceStatus; note: string }>>({});

  // Marks state (Small Exam + Big Exam)
  const [semester, setSemester] = useState<'Semester 1' | 'Semester 2'>('Semester 1');
  const [marksInput, setMarksInput] = useState<Record<string, { small: number; big: number; remarks: string }>>({});
  const [marksLocked, setMarksLocked] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => { if (classes.length && !selectedClassId) setSelectedClassId(classes[0].id); }, [classes, selectedClassId]);
  useEffect(() => {
    if (!selectedClassId) return;
    const firstAssignedSubject = teacherAssignments.find((assignment: any) => assignment.classId === selectedClassId)?.subject.id || '';
    if (!classSubjects.some(subject => subject.id === selectedSubjectId)) setSelectedSubjectId(firstAssignedSubject);
  }, [selectedClassId, teacherAssignments, classSubjects, selectedSubjectId]);

  // Load class students & existing attendance/marks
  useEffect(() => {
    if (!selectedClassId) return;
    ApiClient.getStudents(selectedClassId).then(async (stdList) => {
      setStudents(stdList);

      // Attendance
      const existingAtt = await ApiClient.getDailyAttendance(selectedClassId, attendanceDate);
      const attMap: Record<string, { status: AttendanceStatus; note: string }> = {};
      for (const s of stdList) {
        const found = existingAtt.find(a => a.studentId === s.id);
        attMap[s.id] = {
          status: found ? found.status : 'present',
          note: found?.note || ''
        };
      }
      setAttendanceMap(attMap);

      // Marks
      if (selectedSubjectId) {
        const existingMarks = await ApiClient.getMarks(selectedClassId, selectedSubjectId, semester);
        const mInput: Record<string, { small: number; big: number; remarks: string }> = {};
        let allApproved = existingMarks.length > 0 && existingMarks.every(m => m.status === 'approved');
        for (const s of stdList) {
          const m = existingMarks.find(em => em.studentId === s.id);
          mInput[s.id] = {
            small: m ? m.smallExamMarks : 0,
            big: m ? m.bigExamMarks : 0,
            remarks: m?.teacherRemarks || ''
          };
        }
        setMarksInput(mInput);
        setMarksLocked(allApproved);
      }
    });
  }, [selectedClassId, selectedSubjectId, attendanceDate, semester]);

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
      setNotice('Daily class attendance saved and synced with administration.');
      setTimeout(() => setNotice(null), 3000);
    } catch (err: any) {
      setNotice(err.message || 'Failed to save attendance.');
    } finally {
      setIsSaving(false);
    }
  };

  // Save Marks (Draft vs Submit)
  const handleSaveMarks = async (status: 'draft' | 'submitted') => {
    if (isReadOnly || !selectedClassId || !selectedSubjectId) return;
    setIsSaving(true);
    try {
      const formatted = students.map(s => ({
        studentId: s.id,
        smallExamMarks: Number(marksInput[s.id]?.small || 0),
        bigExamMarks: Number(marksInput[s.id]?.big || 0),
        teacherRemarks: marksInput[s.id]?.remarks || '',
        status
      }));

      await ApiClient.saveMarks(selectedClassId, selectedSubjectId, semester, formatted);
      setNotice(status === 'submitted' 
        ? 'Marks submitted for Administrator Approval! Editing is locked pending verification.'
        : 'Marks saved as draft.');
      if (status === 'submitted') setMarksLocked(true);
      setTimeout(() => setNotice(null), 4000);
    } catch (err: any) {
      setNotice(err.message || 'Failed to save marks.');
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

  const smallMax = examConfig?.smallExamMax || 10;
  const bigMax = examConfig?.bigExamMax || 10;
  const combinedMax = smallMax + bigMax;

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

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 p-1 bg-[#F1F5F9] rounded-lg text-xs overflow-x-auto">
          {[
            { id: 'dashboard', label: 'My Schedule', icon: CalendarDays },
            { id: 'attendance', label: 'Daily Attendance', icon: CalendarCheck },
            { id: 'grades', label: 'Enter Exam Marks', icon: FileSpreadsheet },
            { id: 'assignments', label: 'Homework', icon: ClipboardList },
            { id: 'notices', label: 'Circulars', icon: BellRing }
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-1.5 font-medium rounded transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === tab.id ? 'bg-white text-[#132A29] shadow-xs font-semibold' : 'text-[#64748B] hover:text-[#132A29]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {notice && (
        <div className="p-3 bg-teal-50 border border-teal-200 text-teal-800 rounded-lg text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* TAB 1: TEACHER SCHEDULE */}
      {activeTab === 'dashboard' && (
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
            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">Select Class</label>
              <select
                value={selectedClassId}
                onChange={e => setSelectedClassId(e.target.value)}
                className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-lg"
              >
                {classes.map(c => (
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
            </div>
            <div>
              <button
                type="button"
                onClick={handleSaveAttendance}
                disabled={isSaving || isReadOnly || students.length === 0}
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

      {/* TAB 3: ENTER EXAM MARKS (SMALL + BIG EXAM -> PERCENTAGE ONLY) */}
      {activeTab === 'grades' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-sm grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">Class</label>
              <select
                value={selectedClassId}
                onChange={e => setSelectedClassId(e.target.value)}
                className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-lg"
              >
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.section})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">Subject</label>
              <select
                value={selectedSubjectId}
                onChange={e => setSelectedSubjectId(e.target.value)}
                className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-lg"
              >
                {classSubjects.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">Semester</label>
              <select
                value={semester}
                onChange={e => setSemester(e.target.value as any)}
                className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-lg"
              >
                <option value="Semester 1">Semester 1</option>
                <option value="Semester 2">Semester 2</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleSaveMarks('draft')}
                disabled={marksLocked || isReadOnly || isSaving}
                className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-[#334155] text-xs font-semibold rounded-lg"
              >
                Save Draft
              </button>
              <button
                type="button"
                onClick={() => handleSaveMarks('submitted')}
                disabled={marksLocked || isReadOnly || isSaving}
                className="flex-1 py-2 px-3 bg-[#0F766E] hover:bg-[#0D655E] text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1 shadow-sm disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                Submit
              </button>
            </div>
          </div>

          <div className="p-3 bg-teal-50 border border-teal-100 rounded-xl text-xs text-teal-900 flex items-center justify-between">
            <span>
              Grading Scheme: Small Exam (Max {smallMax}) + Big Exam (Max {bigMax}) = Total ({combinedMax}). Percentage is calculated automatically.
            </span>
            {marksLocked && (
              <span className="font-bold flex items-center gap-1 text-emerald-800">
                <Lock className="w-3.5 h-3.5" />
                Locked by Administration
              </span>
            )}
          </div>

          <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
            <table className="w-full text-left text-xs text-[#132A29]">
              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] uppercase font-semibold text-[#64748B]">
                <tr>
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4 text-center">Small Exam (Max {smallMax})</th>
                  <th className="py-3 px-4 text-center">Big Exam (Max {bigMax})</th>
                  <th className="py-3 px-4 text-center font-bold">Total ({combinedMax})</th>
                  <th className="py-3 px-4 text-center font-bold">Percentage (%)</th>
                  <th className="py-3 px-4">Teacher Remark</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {students.map(s => {
                  const inp = marksInput[s.id] || { small: 0, big: 0, remarks: '' };
                  const total = Number(inp.small) + Number(inp.big);
                  const percentage = combinedMax > 0 ? Math.round(((total / combinedMax) * 100) * 100) / 100 : 0;

                  return (
                    <tr key={s.id} className="hover:bg-[#F8FAFC]">
                      <td className="py-3 px-4">
                        <p className="font-semibold">{s.firstName} {s.lastName}</p>
                        <p className="text-[11px] font-mono text-[#64748B]">{s.studentId}</p>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <input
                          type="number"
                          min={0}
                          max={smallMax}
                          step={0.5}
                          disabled={marksLocked || isReadOnly}
                          value={inp.small}
                          onChange={e => setMarksInput(prev => ({
                            ...prev,
                            [s.id]: { ...prev[s.id], small: Math.min(smallMax, Math.max(0, parseFloat(e.target.value) || 0)) }
                          }))}
                          className="w-16 text-center text-xs py-1 px-2 border border-[#CBD5E1] rounded font-mono disabled:bg-slate-100"
                        />
                      </td>
                      <td className="py-3 px-4 text-center">
                        <input
                          type="number"
                          min={0}
                          max={bigMax}
                          step={0.5}
                          disabled={marksLocked || isReadOnly}
                          value={inp.big}
                          onChange={e => setMarksInput(prev => ({
                            ...prev,
                            [s.id]: { ...prev[s.id], big: Math.min(bigMax, Math.max(0, parseFloat(e.target.value) || 0)) }
                          }))}
                          className="w-16 text-center text-xs py-1 px-2 border border-[#CBD5E1] rounded font-mono disabled:bg-slate-100"
                        />
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold">{total}</td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-[#0F766E]">{percentage}%</td>
                      <td className="py-3 px-4">
                        <input
                          type="text"
                          value={inp.remarks}
                          disabled={marksLocked || isReadOnly}
                          onChange={e => setMarksInput(prev => ({
                            ...prev,
                            [s.id]: { ...prev[s.id], remarks: e.target.value }
                          }))}
                          placeholder="Teacher feedback..."
                          className="w-full text-xs py-1 px-2 border border-[#CBD5E1] rounded disabled:bg-slate-100"
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
