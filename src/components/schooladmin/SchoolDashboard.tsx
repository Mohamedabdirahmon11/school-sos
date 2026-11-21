import React from 'react';
import { ApiClient } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { formatMoney } from '../../lib/money.ts';
import { useApi } from '../../hooks/useApi.ts';
import { ErrorState } from '../common/ErrorState.tsx';
import { EmptyState, LoadingState } from '../common/AsyncState.tsx';
import { CalendarCheck, Wallet, UserPlus, CreditCard, ClipboardCheck, BellRing, AlertCircle, GraduationCap, Users, School, ArrowUpRight, Activity, BookOpen } from 'lucide-react';

interface SchoolDashboardProps { onNavigate: (view: string) => void; onOpenAddStudent: () => void; }
type DashboardRecord = Record<string, any>;

export function normalizeSchoolDashboardData(data: unknown) {
  const value: DashboardRecord = data && typeof data === 'object' ? data as DashboardRecord : {};
  const rawStats: DashboardRecord = value.stats && typeof value.stats === 'object' ? value.stats : {};
  const number = (input: unknown) => { const parsed = Number(input); return Number.isFinite(parsed) ? parsed : 0; };
  return {
    stats: {
      totalStudents: number(rawStats.totalStudents),
      totalTeachers: number(rawStats.totalTeachers),
      totalClasses: number(rawStats.totalClasses ?? value.totalClasses),
      attendanceRate: number(rawStats.attendanceRate),
      attendanceRecordedToday: number(value.attendanceRecordedToday),
      todayCollection: number(rawStats.todayCollection ?? rawStats.totalCollected),
      totalOutstanding: number(rawStats.totalOutstanding ?? rawStats.outstandingFees)
    },
    recentPayments: Array.isArray(value.recentPayments) ? value.recentPayments : [],
    notices: Array.isArray(value.notices) ? value.notices : [],
    attendanceTrend: Array.isArray(value.attendanceTrend) ? value.attendanceTrend : [],
    absentStudents: Array.isArray(value.absentStudents) ? value.absentStudents : [],
    recentActivity: Array.isArray(value.recentActivity) ? value.recentActivity : []
  };
}

const Metric = ({ label, value, hint, onClick, icon: Icon, tone }: {
  label: string; value: React.ReactNode; hint?: string; onClick?: () => void;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  tone: 'blue' | 'green' | 'purple' | 'amber';
}) => (
  <button type="button" onClick={onClick} data-tone={tone} className="school-admin-metric min-w-0 text-left">
    <div className="flex items-start justify-between gap-3"><div className="min-w-0">
      <div className="metric-label">{label}</div><div className="metric-value mt-2">{value}</div>
      {hint && <div className="metric-hint mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold">{hint}</div>}
    </div><span className="metric-icon shrink-0"><Icon size={21} /></span></div>
  </button>
);

export const SchoolDashboard: React.FC<SchoolDashboardProps> = ({ onNavigate, onOpenAddStudent }) => {
  const { school, isReadOnly, user } = useAuth();
  const { data, loading, error, retry } = useApi(() => ApiClient.getSchoolDashboard(school?.id), [school?.id], Boolean(school));
  if (loading) return <LoadingState label="Loading school dashboard…" className="max-w-7xl" />;
  if (error) return <ErrorState error={error} onRetry={retry} />;

  const result = normalizeSchoolDashboardData(data);
  const canViewFinance = user?.role === 'accountant' || user?.role === 'super_admin';
  const canManageStudents = user?.role === 'school_admin' || user?.role === 'super_admin';
  const { totalStudents, totalTeachers, totalClasses, attendanceRate, todayCollection, totalOutstanding } = result.stats;
  const currency = school?.currency || 'ETB';
  const maxTrend = Math.max(1, ...result.attendanceTrend.map((item: DashboardRecord) => Number(item.rate ?? item.attendanceRate ?? item.present) || 0));
  const collected = Math.max(0, todayCollection), outstanding = Math.max(0, totalOutstanding);
  const totalFees = collected + outstanding, collectedPercent = totalFees > 0 ? Math.round(collected / totalFees * 100) : 0;
  const actions = [
    { label: 'Mark attendance', detail: 'Open daily register', icon: ClipboardCheck, view: 'sch_attendance' },
    { label: 'Record payment', detail: 'Update fee ledger', icon: CreditCard, view: 'sch_fees' },
    { label: 'Post notice', detail: 'Share a school update', icon: BellRing, view: 'sch_notices' },
    { label: 'New admission', detail: 'Register a student', icon: UserPlus, view: 'sch_students' }
  ].filter(item => (item.view !== 'sch_fees' || canViewFinance) && (item.view !== 'sch_students' || canManageStudents));

  return <div className="school-dashboard-page mx-auto w-full max-w-[1600px] space-y-5 p-4 md:p-6">
    <section className="school-dashboard-hero relative overflow-hidden rounded-2xl p-5 text-white md:p-7">
      <div className="relative z-10 flex flex-col justify-between gap-5 md:flex-row md:items-center">
        <div className="flex min-w-0 items-center gap-4">
          {school?.logoUrl ? <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white p-2 shadow-lg"><img src={school.logoUrl} alt="" className="h-full w-full object-contain" /></div>
            : <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-white/20 bg-white/10 text-xl font-extrabold">{school?.name?.trim().charAt(0).toUpperCase() || 'S'}</div>}
          <div className="min-w-0"><p className="mb-1 text-xs font-semibold uppercase tracking-[.16em] text-blue-100">School overview</p>
            <h1 className="truncate text-2xl font-bold tracking-tight text-white md:text-[28px]">Dashboard</h1>
            <p className="mt-1 truncate text-sm text-blue-100">{school?.name || 'Your school'}{school?.academicYear ? ' · ' + school.academicYear : ''}{school?.currentSemester ? ' · ' + school.currentSemester : ''}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canViewFinance && <button type="button" onClick={() => onNavigate('sch_fees')} className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20"><CreditCard size={16} /> Record payment</button>}
          {canManageStudents && <button type="button" onClick={onOpenAddStudent} disabled={isReadOnly} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#17345f] shadow-sm transition hover:bg-blue-50 disabled:opacity-50"><UserPlus size={16} /> Add student</button>}
        </div>
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-24 h-64 w-64 rounded-full border-[34px] border-white/[.055]" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-36 right-1/4 h-64 w-64 rounded-full bg-blue-400/10 blur-2xl" />
    </section>

    <section aria-label="School statistics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Total students" value={totalStudents.toLocaleString()} hint="Enrolled students" icon={GraduationCap} tone="blue" onClick={() => onNavigate('sch_students')} />
      <Metric label="Teachers" value={totalTeachers.toLocaleString()} hint="Teaching staff" icon={Users} tone="green" onClick={() => onNavigate('sch_teachers')} />
      <Metric label="Attendance today" value={result.stats.attendanceRecordedToday > 0 ? String(attendanceRate) + '%' : '—'} hint={result.stats.attendanceRecordedToday > 0 ? 'Register recorded' : 'Not recorded yet'} icon={CalendarCheck} tone="purple" onClick={() => onNavigate('sch_attendance')} />
      <Metric label="Total classes" value={totalClasses.toLocaleString()} hint="School classes" icon={School} tone="amber" onClick={() => onNavigate('sch_classes')} />
    </section>

    <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.85fr)]">
      <div className="school-dashboard-panel min-w-0 p-5 md:p-6">
        <div className="mb-5 flex items-center justify-between gap-3"><div><div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400"><Activity size={14} /> Attendance</div><h2 className="text-base font-bold text-[#17264a]">Weekly attendance trend</h2></div>
          <button type="button" onClick={() => onNavigate('sch_attendance')} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50">Open register <ArrowUpRight size={14} /></button>
        </div>
        {result.attendanceTrend.length ? <div className="flex h-52 items-end gap-2 border-b border-slate-100 px-1 sm:gap-4">
          {result.attendanceTrend.map((item: DashboardRecord, index: number) => {
            const rate = Math.max(0, Math.min(100, Number(item.rate ?? item.attendanceRate ?? item.present) || 0));
            const height = Math.max(4, rate / maxTrend * 100);
            return <div key={item.date ?? item.day ?? index} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
              <span className="text-[10px] font-bold tabular-nums text-slate-500">{rate}%</span>
              <div className="flex h-full w-full max-w-[68px] items-end overflow-hidden rounded-t-lg bg-slate-50"><div className="w-full rounded-t-lg bg-gradient-to-t from-blue-700 to-blue-400 transition-all" style={{ height: String(height) + '%' }} /></div>
              <span className="max-w-full truncate text-[10px] text-slate-400">{item.day ?? (typeof item.date === 'string' ? item.date.slice(0, 3) : 'Day ' + (index + 1))}</span>
            </div>;
          })}
        </div> : <EmptyState title="Weekly trend is not available yet" description="Attendance history will appear here when the dashboard API supplies it." className="min-h-52 border-0 bg-slate-50" />}
      </div>

      {canViewFinance && <div className="school-dashboard-panel p-5 md:p-6">
        <div className="mb-5 flex items-center gap-2"><Wallet size={17} className="text-blue-600" /><div><h2 className="text-base font-bold text-[#17264a]">Fee collection</h2><p className="mt-0.5 text-xs text-slate-500">Collected vs outstanding</p></div></div>
        {totalFees > 0 ? <div className="flex flex-col items-center gap-5 sm:flex-row xl:flex-col 2xl:flex-row">
          <div className="relative grid h-36 w-36 shrink-0 place-items-center rounded-full" style={{ background: 'conic-gradient(var(--brand-color) ' + collectedPercent + '%, #f5c24d 0)' }}>
            <div className="grid h-28 w-28 place-items-center rounded-full bg-white shadow-inner"><div className="text-center"><div className="text-2xl font-extrabold text-[#17264a]">{collectedPercent}%</div><div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">collected</div></div></div>
          </div>
          <div className="w-full space-y-4 text-sm">
            <div><div className="mb-1 flex items-center gap-2 text-xs text-slate-500"><span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> Collected</div><strong className="pl-5 text-base text-[#17264a]">{formatMoney(collected, currency)}</strong></div>
            <div><div className="mb-1 flex items-center gap-2 text-xs text-slate-500"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Outstanding</div><strong className="pl-5 text-base text-[#17264a]">{formatMoney(outstanding, currency)}</strong></div>
          </div>
        </div> : <div className="flex min-h-36 flex-col items-center justify-center rounded-xl bg-slate-50 text-center"><Wallet className="mb-2 text-blue-600" size={25} /><p className="text-sm font-semibold text-slate-700">Fee summary not available</p><p className="mt-1 text-xs text-slate-500">No collection totals were supplied by the dashboard API.</p></div>}
        <button type="button" onClick={() => onNavigate('sch_fees')} className="mt-5 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-blue-700 transition hover:border-blue-200 hover:bg-blue-50">Open fee ledger</button>
      </div>}
    </section>

    <section className="grid gap-4 lg:grid-cols-3">
      <div className="school-dashboard-panel min-w-0 p-5">
        <div className="mb-4 flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-50 text-amber-600"><AlertCircle size={17} /></span><div><h2 className="text-sm font-bold text-[#17264a]">Needs attention</h2><p className="text-[11px] text-slate-400">Absence alerts</p></div></div>
        {result.absentStudents.length ? result.absentStudents.slice(0, 4).map((student: DashboardRecord, index: number) => <div key={student.id ?? index} className="border-b border-slate-100 py-3 last:border-0"><p className="text-sm font-semibold text-slate-700">{student.name ?? student.studentName ?? 'Student absent'}</p><p className="mt-1 text-xs text-slate-400">{student.className ?? student.class ?? 'Class not provided'} · {student.daysAbsent ? student.daysAbsent + ' days absent' : 'Absent today'}</p></div>) : <EmptyState title="No absence alerts today" description="There are no absence records to review for today." className="min-h-28 border-0 bg-transparent" />}
      </div>

      <div className="school-dashboard-panel min-w-0 p-5">
        <div className="mb-4 flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-600"><BookOpen size={17} /></span><div><h2 className="text-sm font-bold text-[#17264a]">Quick actions</h2><p className="text-[11px] text-slate-400">Common school tasks</p></div></div>
        <div className="grid grid-cols-2 gap-2">{actions.map(item => <button key={item.view} type="button" onClick={() => item.view === 'sch_students' ? onOpenAddStudent() : onNavigate(item.view)} disabled={item.view === 'sch_students' && isReadOnly} className="group flex min-h-[88px] flex-col items-start justify-between rounded-xl border border-slate-200 p-3 text-left transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50/60 disabled:opacity-50"><item.icon size={18} className="text-blue-600" /><span><span className="block text-xs font-bold text-slate-700">{item.label}</span><span className="mt-1 block text-[10px] text-slate-400">{item.detail}</span></span></button>)}</div>
      </div>

      <div className="school-dashboard-panel min-w-0 p-5">
        <div className="mb-3 flex items-center justify-between gap-2"><div><h2 className="text-sm font-bold text-[#17264a]">Recent activity</h2><p className="text-[11px] text-slate-400">Latest school updates</p></div><button type="button" onClick={() => onNavigate('sch_notices')} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50">View all</button></div>
        {result.recentActivity.length ? result.recentActivity.slice(0, 4).map((item: DashboardRecord, index: number) => <div key={item.id ?? index} className="border-b border-slate-100 py-3 last:border-0"><p className="text-sm font-semibold text-slate-700">{item.title ?? item.description ?? item.type ?? 'Activity'}</p><p className="mt-1 text-xs text-slate-400">{item.detail ?? item.name ?? item.date ?? ''}</p></div>)
          : result.notices.slice(0, 4).map((notice: DashboardRecord, index: number) => <div key={notice.id ?? index} className="border-b border-slate-100 py-3 last:border-0"><p className="text-sm font-semibold text-slate-700">{notice.title ?? 'School notice'}</p><p className="mt-1 line-clamp-2 text-xs text-slate-400">{notice.content ?? ''}</p></div>)}
        {!result.recentActivity.length && !result.notices.length && <p className="py-8 text-center text-sm text-slate-400">No recent activity available.</p>}
      </div>
    </section>
  </div>;
};
