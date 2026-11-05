/**
 * School Admin Dashboard
 * Presentation aligned to the supplied School Admin reference.
 * Existing school-scoped API data and navigation actions are preserved.
 */
import React from 'react';
import { ApiClient } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { useApi } from '../../hooks/useApi.ts';
import { ErrorState } from '../common/ErrorState.tsx';
import {
  GraduationCap,
  UserCheck,
  CalendarCheck,
  UserPlus,
  BellRing,
  ArrowRight,
  CalendarDays,
  ClipboardList,
  FileSpreadsheet,
  Megaphone
} from 'lucide-react';

interface SchoolDashboardProps {
  onNavigate: (view: string) => void;
  onOpenAddStudent: () => void;
}

export function normalizeSchoolDashboardData(data: unknown) {
  const value = data && typeof data === 'object' ? data as Record<string, any> : {};
  const rawStats = value.stats && typeof value.stats === 'object' ? value.stats : {};
  const numeric = (input: unknown) => {
    const result = Number(input);
    return Number.isFinite(result) ? result : 0;
  };
  return {
    stats: {
      totalStudents: numeric(rawStats.totalStudents),
      totalTeachers: numeric(rawStats.totalTeachers),
      attendanceRate: numeric(rawStats.attendanceRate),
      todayCollection: 0,
      totalOutstanding: 0
    },
    recentPayments: [],
    notices: Array.isArray(value.notices) ? value.notices : []
  };
}

export const SchoolDashboard: React.FC<SchoolDashboardProps> = ({ onNavigate, onOpenAddStudent }) => {
  const { school, isReadOnly } = useAuth();
  const { data, loading, error, retry } = useApi(
    () => ApiClient.getSchoolDashboard(school?.id),
    [school?.id],
    Boolean(school)
  );

  if (loading) {
    return (
      <div className="p-6 space-y-5" aria-label="Loading dashboard">
        <div className="h-8 bg-slate-200 rounded-xl w-1/4 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-32 bg-white rounded-2xl border border-slate-200 animate-pulse" />)}
        </div>
        <div className="h-72 bg-white rounded-2xl border border-slate-200 animate-pulse" />
      </div>
    );
  }
  if (error) return <ErrorState error={error} onRetry={retry} />;

  const safeData = normalizeSchoolDashboardData(data);
  const { totalStudents, totalTeachers, attendanceRate } = safeData.stats;
  const notices = safeData.notices;
  const latestNotices = notices.slice(0, 4);
  const schoolLabel = school?.name || 'School Dashboard';

  const metrics = [
    { label: 'Students', value: totalStudents.toLocaleString(), note: 'Enrolled learners', icon: GraduationCap, action: () => onNavigate('sch_students') },
    { label: 'Teachers', value: totalTeachers.toLocaleString(), note: 'Teaching faculty', icon: UserCheck, action: () => onNavigate('sch_teachers') },
    { label: 'Attendance today', value: `${attendanceRate}%`, note: 'Daily attendance rate', icon: CalendarCheck, action: () => onNavigate('sch_attendance') }
  ];

  const quickActions = [
    { label: 'Mark attendance', icon: CalendarCheck, action: () => onNavigate('sch_attendance') },
    { label: 'New admission', icon: UserPlus, action: () => onNavigate('sch_admissions') },
    { label: 'Post notice', icon: Megaphone, action: () => onNavigate('sch_notices') },
    { label: 'Enter exam results', icon: FileSpreadsheet, action: () => onNavigate('sch_exams') }
  ];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-none mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#0F766E] mb-1">School Admin</p>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#132A29]">Dashboard</h1>
          <p className="text-sm text-[#64748B] mt-1">
            {schoolLabel}{school?.academicYear ? ` · ${school.academicYear}` : ''}{school?.currentSemester ? ` · ${school.currentSemester}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('sch_notices')}
            className="px-4 py-2.5 text-sm font-semibold text-[#132A29] bg-white border border-[#DCE7E4] rounded-xl hover:bg-[#F8FBFA]"
          >
            View notices
          </button>
          <button
            type="button"
            onClick={onOpenAddStudent}
            disabled={isReadOnly}
            className="px-4 py-2.5 text-sm font-semibold text-white bg-[#0F766E] hover:bg-[#0D655E] rounded-xl disabled:opacity-50"
          >
            <span className="inline-flex items-center gap-2"><UserPlus className="w-4 h-4" /> Add student</span>
          </button>
        </div>
      </div>

      <section aria-label="School overview" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {metrics.map(({ label, value, note, icon: Icon, action }) => (
          <button
            key={label}
            type="button"
            onClick={action}
            className="text-left bg-white p-5 md:p-6 rounded-2xl border border-[#DCE7E4] hover:border-[#0F766E] hover:shadow-sm transition-all"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-[#627571]">{label}</span>
              <span className="w-9 h-9 rounded-xl bg-[#EAF5F2] text-[#0F766E] flex items-center justify-center"><Icon className="w-5 h-5" /></span>
            </div>
            <div className="mt-2 text-3xl md:text-4xl font-bold tracking-tight text-[#102522] tabular-nums">{value}</div>
            <div className="mt-1 text-xs text-[#627571]">{note}</div>
          </button>
        ))}
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="bg-white rounded-2xl border border-[#DCE7E4] p-5 md:p-6 xl:col-span-1">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-[#102522]">Notice board</h2>
              <p className="text-xs text-[#627571] mt-1">Latest school announcements</p>
            </div>
            <BellRing className="w-5 h-5 text-[#0F766E]" />
          </div>
          {latestNotices.length === 0 ? (
            <div className="py-8 text-center">
              <BellRing className="w-8 h-8 mx-auto text-[#A8BCB7] mb-2" />
              <p className="text-sm font-medium text-[#102522]">No notices yet</p>
              <p className="text-xs text-[#627571] mt-1">Published announcements will appear here.</p>
            </div>
          ) : (
            <div className="divide-y divide-[#E7EFEC]">
              {latestNotices.map((notice: any, index: number) => (
                <button
                  type="button"
                  key={notice?.id ?? index}
                  onClick={() => onNavigate('sch_notices')}
                  className="w-full py-3 text-left first:pt-0 last:pb-0"
                >
                  <span className="block text-sm font-semibold text-[#102522]">{notice?.title || 'School notice'}</span>
                  <span className="block text-xs text-[#627571] mt-1 line-clamp-2">{notice?.content || ''}</span>
                  <span className="block text-[11px] text-[#849590] mt-2">{typeof notice?.publishDate === 'string' ? notice.publishDate.split('T')[0] : 'Published'}</span>
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => onNavigate('sch_notices')} className="mt-4 text-xs font-semibold text-[#0F766E] inline-flex items-center gap-1">
            Manage notices <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-[#DCE7E4] p-5 md:p-6 xl:col-span-1">
          <div className="mb-4">
            <h2 className="text-base font-bold text-[#102522]">Quick actions</h2>
            <p className="text-xs text-[#627571] mt-1">Common school administration tasks</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {quickActions.map(({ label, icon: Icon, action }) => (
              <button
                type="button"
                key={label}
                onClick={action}
                className="min-h-16 px-3 py-3 rounded-xl border border-[#DCE7E4] text-sm font-semibold text-[#102522] hover:border-[#0F766E] hover:bg-[#F5FAF8] flex items-center gap-2 text-left"
              >
                <span className="w-8 h-8 rounded-lg bg-[#EAF5F2] text-[#0F766E] flex items-center justify-center shrink-0"><Icon className="w-4 h-4" /></span>
                {label}
              </button>
            ))}
          </div>
          <div className="mt-5 rounded-xl bg-[#F3F8F6] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#102522]"><ClipboardList className="w-4 h-4 text-[#0F766E]" /> Academic overview</div>
            <p className="text-xs leading-relaxed text-[#627571] mt-2">Use the school modules to manage classes, attendance, examinations and student records. Dashboard figures reflect the selected school.</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#DCE7E4] p-5 md:p-6 xl:col-span-1">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-[#102522]">School activity</h2>
              <p className="text-xs text-[#627571] mt-1">Recent published updates</p>
            </div>
            <CalendarDays className="w-5 h-5 text-[#0F766E]" />
          </div>
          {latestNotices.length === 0 ? (
            <p className="text-sm text-[#627571] py-8 text-center">New school activity will appear here.</p>
          ) : (
            <div className="space-y-4">
              {latestNotices.map((notice: any, index: number) => (
                <div key={notice?.id ?? index} className="flex gap-3">
                  <span className="w-2 h-2 mt-1.5 rounded-full bg-[#0F766E] shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#102522]">{notice?.title || 'School notice published'}</p>
                    <p className="text-xs text-[#627571] mt-1 line-clamp-2">{notice?.content || ''}</p>
                    <p className="text-[11px] text-[#849590] mt-1">{typeof notice?.publishDate === 'string' ? notice.publishDate.split('T')[0] : 'Recently'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button type="button" onClick={() => onNavigate('sch_notices')} className="mt-5 text-xs font-semibold text-[#0F766E] inline-flex items-center gap-1">
            View activity <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </section>
    </div>
  );
};
