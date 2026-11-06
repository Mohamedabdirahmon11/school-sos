/**
 * Student Portal View
 * Enforces Super Admin student access switch, timetable, homework assignments, results, and attendance
 */

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { ApiClient } from '../../services/api.ts';
import { useApi } from '../../hooks/useApi.ts';
import { ErrorState } from '../common/ErrorState.tsx';
import {
  CalendarDays,
  FileSpreadsheet,
  FileCheck2,
  CalendarCheck,
  BellRing,
  ShieldAlert,
  Send,
  CheckCircle2
} from 'lucide-react';

type PortalTab = 'schedule' | 'grades' | 'assignments' | 'attendance' | 'notices';

export const StudentPortalView: React.FC = () => {
  const { user, school, t } = useAuth();
  const [activeTab, setActiveTab] = useState<PortalTab>('schedule');
  const [submissionDrafts, setSubmissionDrafts] = useState<Record<string, string>>({});
  const [submittingAssignmentId, setSubmittingAssignmentId] = useState<string | null>(null);
  const [assignmentMessage, setAssignmentMessage] = useState<string | null>(null);
  const studentsState = useApi(() => ApiClient.getStudents(), [school?.id, user?.id], Boolean(school && user));
  const studentRecord = Array.isArray(studentsState.data)
    ? studentsState.data.find(student => student.studentId === user?.studentId)
    : undefined;
  const scheduleState = useApi(() => ApiClient.getTimetable(), [school?.id, user?.id], Boolean(school && user));
  const examSchedulesState = useApi(() => studentRecord?.classId ? ApiClient.getPublishedExamSchedules() : Promise.resolve([]), [studentRecord?.classId, school?.id], Boolean(studentRecord));
  const marksState = useApi(() => studentRecord ? ApiClient.getStudentMarks(studentRecord.id) : Promise.resolve([]), [studentRecord?.id], Boolean(studentRecord));
  const assignmentsState = useApi(() => ApiClient.getAssignments(), [school?.id, user?.id], Boolean(school && user));
  const attendanceState = useApi(() => studentRecord ? ApiClient.getStudentAttendance(studentRecord.id) : Promise.resolve([]), [studentRecord?.id], Boolean(studentRecord));
  const noticesState = useApi(() => ApiClient.getNotices({ pageSize: 50 }), [school?.id, user?.id], Boolean(school && user));
  const unreadNoticesState = useApi(() => ApiClient.getNoticeUnreadCount(), [school?.id, user?.id], Boolean(school && user));

  const timetable = Array.isArray(scheduleState.data) ? scheduleState.data : [];
  const publishedExamSchedules = Array.isArray(examSchedulesState.data) ? examSchedulesState.data : [];
  const marks = Array.isArray(marksState.data) ? marksState.data : [];
  const assignments = Array.isArray(assignmentsState.data) ? assignmentsState.data : [];
  const notices = Array.isArray(noticesState.data) ? noticesState.data : [];
  const unreadNoticeCount = unreadNoticesState.data?.count || 0;
  const attendance = Array.isArray(attendanceState.data)
    ? [...attendanceState.data].sort((a, b) => b.date.localeCompare(a.date))
    : [];
  const gradingScale = school?.gradingScale?.length
    ? [...school.gradingScale].sort((a, b) => b.minPercentage - a.minPercentage)
    : [{ minPercentage: 90, label: 'A', remark: 'Excellent' }, { minPercentage: 80, label: 'B', remark: 'Very good' }, { minPercentage: 70, label: 'C', remark: 'Good' }, { minPercentage: 60, label: 'D', remark: 'Pass' }, { minPercentage: 0, label: 'F', remark: 'Needs support' }];
  const gradeFor = (percentage: number) => gradingScale.find(band => percentage >= band.minPercentage) || gradingScale[gradingScale.length - 1];
  const today = new Date().toISOString().slice(0, 10);
  const attendanceSummary = attendance.reduce((summary, record) => {
    if (record.status === 'present' || record.status === 'late' || record.status === 'excused' || record.status === 'absent') summary[record.status] += 1;
    return summary;
  }, { present: 0, absent: 0, late: 0, excused: 0 });
  const markAllNoticesRead = async () => {
    await ApiClient.markNoticesRead(notices.map(notice => notice.id));
    noticesState.retry();
    unreadNoticesState.retry();
  };
  const submitHomework = async (assignmentId: string) => {
    const content = (submissionDrafts[assignmentId] || '').trim();
    if (!content) {
      setAssignmentMessage('Write your answer before submitting.');
      return;
    }
    setSubmittingAssignmentId(assignmentId);
    setAssignmentMessage(null);
    try {
      const submission = await ApiClient.submitAssignment(assignmentId, content);
      setAssignmentMessage(submission.status === 'graded' ? 'Homework graded.' : 'Homework submitted.');
      setSubmissionDrafts(current => ({ ...current, [assignmentId]: submission.content }));
      assignmentsState.retry();
    } catch (error) {
      setAssignmentMessage(error instanceof Error ? error.message : 'Homework could not be submitted.');
    } finally {
      setSubmittingAssignmentId(null);
    }
  };

  // Hard verification of Super Admin student access switch
  if (school && !school.studentAccessEnabled) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center space-y-4">
        <div className="p-4 bg-red-50 rounded-2xl border border-red-200 inline-block text-red-600">
          <ShieldAlert className="w-12 h-12 mx-auto" />
        </div>
        <h2 className="text-lg font-bold text-[#132A29]">Student Portal Disabled</h2>
        <p className="text-xs text-[#64748B] leading-relaxed">
          {t('student_access_disabled')}
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-[11px] font-mono text-[#0F766E] uppercase font-bold">Student Academic Portal</span>
          <h1 className="text-xl font-bold tracking-tight text-[#132A29]">
            Welcome, {user?.fullName}
          </h1>
          <p className="text-xs text-[#64748B]">
            Student ID: <strong className="font-mono text-[#0F766E]">{user?.studentId}</strong> • {school?.name}
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#F1F5F9] rounded-lg text-xs self-start sm:self-auto">
          {[
            { id: 'schedule', label: 'My Timetable' },
            { id: 'grades', label: 'Exam Results' },
            { id: 'assignments', label: 'Homework' },
            { id: 'attendance', label: 'Attendance' },
            { id: 'notices', label: `Notices${unreadNoticeCount > 0 ? ` (${unreadNoticeCount})` : ''}` }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as PortalTab)}
              className={`px-3 py-1.5 font-medium rounded transition-colors ${
                activeTab === tab.id ? 'bg-white text-[#132A29] shadow-xs font-semibold' : 'text-[#64748B] hover:text-[#132A29]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* TIMETABLE TAB */}
      {activeTab === 'schedule' && (
        <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] space-y-4 shadow-xs text-xs">
          <h2 className="text-sm font-bold text-[#132A29] flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-[#0F766E]" />
            <span>{t('timetable')}</span>
          </h2>

          {scheduleState.loading ? <div className="h-28 animate-pulse rounded-lg bg-slate-100" /> : scheduleState.error ? <ErrorState error={scheduleState.error} onRetry={scheduleState.retry} /> : timetable.length === 0 ? <p className="text-[#64748B]">{t('timetable_empty')}</p> : <div className="space-y-2">{[...timetable].sort((a, b) => a.dayOfWeek.localeCompare(b.dayOfWeek) || a.periodNumber - b.periodNumber).map(slot => <div key={slot.id} className="p-3 bg-[#F0FDFA] rounded-lg border border-[#CCFBF1] flex items-center justify-between"><div><span className="font-bold text-[#132A29] block">{slot.dayOfWeek} • {slot.startTime} - {slot.endTime}: {slot.subjectName || slot.subjectId}</span><span className="text-[#64748B]">{slot.roomNumber}{slot.teacherName ? ` • ${slot.teacherName}` : ''}</span></div><span className="font-mono text-xs font-bold text-[#0F766E]">Period {slot.periodNumber}</span></div>)}</div>}

          <div className="border-t border-[#E2E8F0] pt-4 space-y-3">
            <h3 className="text-sm font-bold text-[#132A29]">Published Exam Schedule</h3>
            {examSchedulesState.loading ? <div className="h-20 animate-pulse rounded-lg bg-slate-100" /> : examSchedulesState.error ? <ErrorState error={examSchedulesState.error} onRetry={examSchedulesState.retry} /> : publishedExamSchedules.length === 0 ? <p className="text-[#64748B]">No exam timetable has been published for your class yet.</p> : publishedExamSchedules.map(exam => (
              <div key={exam.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="font-bold text-[#132A29]">{exam.examName} · {exam.subjectName}</p>
                <p className="mt-1 text-[#475569]">{exam.examDate} · {String(exam.startTime).slice(0,5)}–{String(exam.endTime).slice(0,5)} · Room {exam.roomName}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* GRADES TAB */}
      {activeTab === 'grades' && (
        <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] space-y-4 shadow-xs text-xs">
          <h2 className="text-sm font-bold text-[#132A29] flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-[#0F766E]" />
            <span>Approved Academic Results</span>
          </h2>

          {marksState.loading ? <div className="h-28 animate-pulse rounded-lg bg-slate-100" /> : marksState.error ? <ErrorState error={marksState.error} onRetry={marksState.retry} /> : marks.length === 0 ? <p className="text-[#64748B]">No approved results have been published yet.</p> : <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{marks.map(mark => {
            const band = gradeFor(mark.percentage || 0);
            return <div key={mark.id} className="p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] flex items-center justify-between gap-3">
              <div>
                <p className="font-bold text-[#132A29]">{mark.subjectName || mark.subjectId}</p>
                <p className="text-[11px] text-[#64748B]">{mark.semester} • {mark.academicYear}</p>
              </div>
              <div className="text-right">
                <span className="text-lg font-mono font-bold text-emerald-700">{mark.totalMarks} pts</span>
                <p className="text-[11px] font-semibold text-[#0F766E]">{mark.percentage}% • {band.label}</p>
              </div>
            </div>;
          })}</div>}
        </div>
      )}

      {/* HOMEWORK TAB */}
      {activeTab === 'assignments' && (
        <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] space-y-4 shadow-xs text-xs">
          <h2 className="text-sm font-bold text-[#132A29] flex items-center gap-2">
            <FileCheck2 className="w-4 h-4 text-[#0F766E]" />
            <span>Active Homework & Assignments</span>
          </h2>
          {assignmentMessage && <p role="status" className="rounded-lg border border-[#CCFBF1] bg-[#F0FDFA] px-3 py-2 text-[#0F766E]">{assignmentMessage}</p>}

          {assignmentsState.loading ? <div className="h-28 animate-pulse rounded-lg bg-slate-100" /> : assignmentsState.error ? <ErrorState error={assignmentsState.error} onRetry={assignmentsState.retry} /> : assignments.length === 0 ? <p className="text-[#64748B]">No homework has been assigned yet.</p> : <div className="space-y-3">{assignments.map(assignment => {
            const submission = assignment.submission;
            const graded = submission?.status === 'graded';
            const draft = submissionDrafts[assignment.id] ?? submission?.content ?? '';
            return (
              <div key={assignment.id} className="p-3 bg-[#F0FDFA] rounded-lg border border-[#CCFBF1] space-y-2">
                <div className="flex flex-wrap justify-between gap-2 font-bold text-[#132A29]">
                  <span>{assignment.title}</span>
                  <span className={`font-mono text-[11px] ${assignment.dueDate < today ? 'text-rose-700' : 'text-[#0F766E]'}`}>
                    {assignment.dueDate < today ? `Overdue: ${assignment.dueDate}` : assignment.dueDate === today ? 'Due today' : `Due ${assignment.dueDate}`}
                  </span>
                </div>
                <p className="text-[#475569]">{assignment.description}</p>
                <p className="text-[11px] text-[#64748B]">{assignment.subjectName || assignment.subjectId} €¢ {assignment.maxPoints} points</p>
                {submission && (
                  <div className="rounded-lg border border-[#99F6E4] bg-white p-2 space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2 font-semibold text-[#132A29]">
                      <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-[#0F766E]" />{graded ? 'Graded' : 'Submitted'}</span>
                      <span>{graded ? `${submission.grade}/${assignment.maxPoints}` : `Submitted ${submission.submittedAt.slice(0, 10)}`}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-[#475569]">{submission.content}</p>
                    {graded && submission.feedback && <p className="text-[#0F766E]">Teacher feedback: {submission.feedback}</p>}
                  </div>
                )}
                {!graded && (
                  <div className="space-y-2">
                    <textarea
                      value={draft}
                      onChange={event => setSubmissionDrafts(current => ({ ...current, [assignment.id]: event.target.value }))}
                      rows={3}
                      maxLength={5000}
                      placeholder={submission ? 'Update your answer' : 'Write your answer here'}
                      className="w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => submitHomework(assignment.id)}
                      disabled={submittingAssignmentId === assignment.id || !draft.trim()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F766E] px-3 py-2 font-semibold text-white disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      {submittingAssignmentId === assignment.id ? 'Submitting...' : submission ? 'Update Submission' : 'Submit Homework'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}</div>}
        </div>
      )}

      {/* ATTENDANCE TAB */}
      {activeTab === 'attendance' && (
        <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] space-y-4 shadow-xs text-xs">
          <h2 className="text-sm font-bold text-[#132A29] flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-[#0F766E]" />
            <span>My Attendance</span>
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: t('present'), value: attendanceSummary.present, tone: 'text-emerald-700 bg-emerald-50 border-emerald-100' },
              { label: t('absent'), value: attendanceSummary.absent, tone: 'text-rose-700 bg-rose-50 border-rose-100' },
              { label: t('late'), value: attendanceSummary.late, tone: 'text-amber-700 bg-amber-50 border-amber-100' },
              { label: t('excused'), value: attendanceSummary.excused, tone: 'text-sky-700 bg-sky-50 border-sky-100' }
            ].map(item => <div key={item.label} className={`rounded-lg border p-3 ${item.tone}`}>
              <p className="text-[11px] font-semibold uppercase tracking-wide">{item.label}</p>
              <p className="font-mono text-xl font-bold">{item.value}</p>
            </div>)}
          </div>

          {attendanceState.loading ? <div className="h-28 animate-pulse rounded-lg bg-slate-100" /> : attendanceState.error ? <ErrorState error={attendanceState.error} onRetry={attendanceState.retry} /> : attendance.length === 0 ? <p className="text-[#64748B]">No attendance records have been recorded yet.</p> : <div className="divide-y divide-[#F1F5F9]">{attendance.map(record => <div key={record.id} className="py-2 flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-[#132A29]">{record.date}</p>
              {record.note && <p className="text-[11px] text-[#64748B]">{record.note}</p>}
            </div>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${record.status === 'present' ? 'bg-emerald-50 text-emerald-700' : record.status === 'absent' ? 'bg-rose-50 text-rose-700' : record.status === 'late' ? 'bg-amber-50 text-amber-700' : 'bg-sky-50 text-sky-700'}`}>
              {record.status}
            </span>
          </div>)}</div>}
        </div>
      )}

      {/* NOTICES TAB */}
      {activeTab === 'notices' && (
        <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] space-y-4 shadow-xs text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-[#132A29] flex items-center gap-2">
              <BellRing className="w-4 h-4 text-[#0F766E]" />
              <span>School Notices</span>
            </h2>
            {unreadNoticeCount > 0 && <button onClick={markAllNoticesRead} className="text-[11px] font-semibold text-[#0F766E] hover:underline">Mark all read</button>}
          </div>

          {noticesState.loading ? <div className="h-28 animate-pulse rounded-lg bg-slate-100" /> : noticesState.error ? <ErrorState error={noticesState.error} onRetry={noticesState.retry} /> : notices.length === 0 ? <p className="text-[#64748B]">No school notices have been published yet.</p> : <div className="space-y-2">{notices.map(notice => <div key={notice.id} className="p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold text-[#132A29]">{notice.isPinned ? 'Pinned • ' : ''}{notice.title}</p>
              <span className="text-[10px] font-mono text-[#64748B]">{notice.publishDate}</span>
            </div>
            <p className="text-[#475569] whitespace-pre-wrap">{notice.content}</p>
            <p className="text-[11px] text-[#64748B]">{notice.authorName} • {notice.authorRole}</p>
          </div>)}</div>}
        </div>
      )}
    </div>
  );
};
