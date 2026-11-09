/**
 * School Admin Dashboard — reference-led layout with school-scoped live metrics.
 */
import React from 'react';
import { ApiClient } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { formatMoney } from '../../lib/money.ts';
import { useApi } from '../../hooks/useApi.ts';
import { ErrorState } from '../common/ErrorState.tsx';
import { CalendarCheck, Wallet, UserPlus, CreditCard, ClipboardCheck, BellRing, ArrowRight, AlertCircle } from 'lucide-react';

interface SchoolDashboardProps {
  onNavigate: (view: string) => void;
  onOpenAddStudent: () => void;
}

type DashboardRecord = Record<string, any>;

export function normalizeSchoolDashboardData(data: unknown) {
  const value: DashboardRecord = data && typeof data === 'object' ? data as DashboardRecord : {};
  const rawStats: DashboardRecord = value.stats && typeof value.stats === 'object' ? value.stats : {};
  const number = (input: unknown) => {
    const parsed = Number(input);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return {
    stats: {
      totalStudents: number(rawStats.totalStudents),
      totalTeachers: number(rawStats.totalTeachers),
      totalClasses: number(rawStats.totalClasses ?? value.totalClasses),
      attendanceRate: number(rawStats.attendanceRate),
      attendanceRecordedToday: number(value.attendanceRecordedToday),
      todayCollection: number(rawStats.todayCollection ?? rawStats.totalCollected),
      totalOutstanding: number(rawStats.totalOutstanding ?? rawStats.outstandingFees),
    },
    recentPayments: Array.isArray(value.recentPayments) ? value.recentPayments : [],
    notices: Array.isArray(value.notices) ? value.notices : [],
    attendanceTrend: Array.isArray(value.attendanceTrend) ? value.attendanceTrend : [],
    absentStudents: Array.isArray(value.absentStudents) ? value.absentStudents : [],
    recentActivity: Array.isArray(value.recentActivity) ? value.recentActivity : [],
  };
}

const Metric = ({ label, value, hint, onClick }: { label: string; value: React.ReactNode; hint?: string; onClick?: () => void }) => (
  <button type="button" onClick={onClick} className="min-w-0 rounded-2xl border border-[#dce7e4] bg-white p-5 text-left shadow-[0_2px_8px_rgba(16,37,34,.025)] transition hover:-translate-y-0.5 hover:shadow-md">
    <div className="text-sm text-[#627571]">{label}</div>
    <div className="mt-2 text-3xl font-bold tracking-tight text-[#102522]">{value}</div>
    {hint && <div className="mt-1 inline-flex rounded-full bg-[#d9f2e9] px-2.5 py-1 text-[11px] font-semibold text-[#08734f]">{hint}</div>}
  </button>
);

export const SchoolDashboard: React.FC<SchoolDashboardProps> = ({ onNavigate, onOpenAddStudent }) => {
  const { school, isReadOnly, user } = useAuth();
  const { data, loading, error, retry } = useApi(() => ApiClient.getSchoolDashboard(school?.id), [school?.id], Boolean(school));
  if (loading) return <div className="space-y-5 p-6"><div className="h-10 w-1/3 animate-pulse rounded-xl bg-slate-200"/><div className="grid gap-4 md:grid-cols-4">{[1,2,3,4].map(x=><div key={x} className="h-32 animate-pulse rounded-2xl bg-white"/>)}</div><div className="h-72 animate-pulse rounded-2xl bg-white"/></div>;
  if (error) return <ErrorState error={error} onRetry={retry}/>;

  const result = normalizeSchoolDashboardData(data);
  const canViewFinance = user?.role === 'accountant' || user?.role === 'super_admin';
  const canManageStudents = user?.role === 'school_admin' || user?.role === 'super_admin';
  const { totalStudents, totalTeachers, totalClasses, attendanceRate, todayCollection, totalOutstanding } = result.stats;
  const currency = school?.currency || 'ETB';
  const hasTrend = result.attendanceTrend.length > 0;
  const maxTrend = Math.max(1, ...result.attendanceTrend.map((item: DashboardRecord) => Number(item.rate ?? item.attendanceRate ?? item.present) || 0));
  const collected = Math.max(0, todayCollection);
  const outstanding = Math.max(0, totalOutstanding);
  const totalFees = collected + outstanding;
  const collectedPercent = totalFees > 0 ? Math.round(collected / totalFees * 100) : 0;

  return <div className="mx-auto max-w-[1600px] space-y-6 p-5 md:p-8">
    <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <div><h1 className="text-3xl font-bold tracking-tight text-[#102522]">Dashboard</h1><p className="mt-1 text-sm text-[#71817d]">{school?.name || 'Your school'}{school?.academicYear ? ` · ${school.academicYear}` : ''}{school?.currentSemester ? ` · ${school.currentSemester}` : ''}</p></div>
      <div className="flex flex-wrap gap-2">{canViewFinance && <button onClick={()=>onNavigate('sch_fees')} className="inline-flex items-center gap-2 rounded-xl border border-[#d5e2de] bg-white px-4 py-3 text-sm font-semibold text-[#18312d] hover:bg-[#f7faf9]"><CreditCard size={16}/>Record payment</button>}{canManageStudents && <button onClick={onOpenAddStudent} disabled={isReadOnly} className="inline-flex items-center gap-2 rounded-xl bg-[#0e8078] px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#0b6f68] disabled:opacity-50"><UserPlus size={16}/>Add student</button>}</div>
    </section>

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Students" value={totalStudents.toLocaleString()} onClick={()=>onNavigate('sch_students')}/>
      <Metric label="Teachers" value={totalTeachers.toLocaleString()} onClick={()=>onNavigate('sch_teachers')}/>
      <Metric label="Attendance today" value={result.stats.attendanceRecordedToday > 0 ? `${attendanceRate}%` : 'Not recorded'} hint={result.stats.attendanceRecordedToday > 0 ? 'Today' : 'Awaiting register'} onClick={()=>onNavigate('sch_attendance')}/>
      <Metric label="Classes" value={totalClasses.toLocaleString()} hint="School classes" onClick={()=>onNavigate('sch_classes')}/>
    </section>

    <section className="grid gap-5 xl:grid-cols-[1.45fr_1fr]">
      <div className="rounded-2xl border border-[#dce7e4] bg-white p-5 md:p-6">
        <div className="mb-5 flex items-start justify-between"><div><h2 className="font-bold text-[#102522]">Attendance this week</h2></div></div>
        {hasTrend ? <div className="flex h-52 items-end gap-3 border-b border-[#e5eeeb] px-1">{result.attendanceTrend.map((item: DashboardRecord, index: number)=><div key={item.date ?? item.day ?? index} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"><span className="text-[11px] font-semibold text-[#627571]">{Number(item.rate ?? item.attendanceRate ?? item.present) || 0}%</span><div className="w-full max-w-[76px] rounded-t-xl bg-[#bfe3da]" style={{height:`${Math.max(4, Math.min(100, (Number(item.rate ?? item.attendanceRate ?? item.present) || 0) / maxTrend * 100))}%`}}/><span className="text-[11px] text-[#71817d]">{item.day ?? (typeof item.date === 'string' ? item.date.slice(0,3) : `Day ${index+1}`)}</span></div>)}</div> : <div className="flex h-52 flex-col items-center justify-center rounded-xl bg-[#f6faf8] text-center"><CalendarCheck className="mb-2 text-[#0e8078]" size={26}/><p className="text-sm font-semibold text-[#18312d]">Weekly trend is not available yet</p><p className="mt-1 max-w-sm text-xs text-[#71817d]">Once daily attendance history is returned by the dashboard API, it will appear here.</p></div>}
      </div>
      {canViewFinance && (
      <div className="rounded-2xl border border-[#dce7e4] bg-white p-5 md:p-6">
        <h2 className="font-bold text-[#102522]">Fee collection</h2><p className="mt-1 text-xs text-[#71817d]">Collected vs outstanding amounts</p>
        {totalFees > 0 ? <div className="mt-6 flex flex-col items-center gap-5 sm:flex-row"><div className="relative grid h-40 w-40 shrink-0 place-items-center rounded-full" style={{background:`conic-gradient(#0e8078 ${collectedPercent}%, #f5c24d 0)`}}><div className="grid h-28 w-28 place-items-center rounded-full bg-white"><div className="text-center"><div className="text-2xl font-bold text-[#102522]">{collectedPercent}%</div><div className="text-[10px] text-[#71817d]">collected</div></div></div></div><div className="space-y-4 text-sm"><div><div className="mb-1 flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#0e8078]"/>Collected</div><strong className="pl-5 text-[#102522]">{formatMoney(collected,currency)}</strong></div><div><div className="mb-1 flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#f5c24d]"/>Outstanding</div><strong className="pl-5 text-[#102522]">{formatMoney(outstanding,currency)}</strong></div></div></div> : <div className="mt-6 flex h-40 flex-col items-center justify-center rounded-xl bg-[#f6faf8] text-center"><Wallet className="mb-2 text-[#0e8078]" size={26}/><p className="text-sm font-semibold text-[#18312d]">Fee summary not available</p><p className="mt-1 text-xs text-[#71817d]">No collection totals were supplied by the dashboard API.</p></div>}
        <button onClick={()=>onNavigate('sch_fees')} className="mt-5 w-full rounded-xl border border-[#d5e2de] px-4 py-2.5 text-sm font-semibold text-[#0e8078] hover:bg-[#f6faf8]">Open fee ledger</button>
      </div>
      )}
    </section>

    <section className="grid gap-5 lg:grid-cols-3">
      <div className="rounded-2xl border border-[#dce7e4] bg-white p-5"><div className="mb-4 flex items-center gap-2"><AlertCircle className="text-[#c58b20]" size={18}/><h2 className="font-bold text-[#102522]">Needs attention</h2></div>{result.absentStudents.length ? result.absentStudents.slice(0,4).map((student: DashboardRecord,index:number)=><div key={student.id ?? index} className="border-b border-[#e8efed] py-3 last:border-0"><p className="text-sm font-semibold text-[#18312d]">{student.name ?? student.studentName ?? 'Student absent'}</p><p className="mt-1 text-xs text-[#71817d]">{student.className ?? student.class ?? 'Class not provided'} · {student.daysAbsent ? `${student.daysAbsent} days absent` : 'Absent today'}</p></div>) : <p className="py-8 text-center text-sm text-[#71817d]">No absence alerts supplied today.</p>}</div>
      <div className="rounded-2xl border border-[#dce7e4] bg-white p-5"><h2 className="mb-4 font-bold text-[#102522]">Quick actions</h2><div className="grid grid-cols-2 gap-3">{[{label:'Mark attendance',icon:ClipboardCheck,view:'sch_attendance'},{label:'Record payment',icon:CreditCard,view:'sch_fees'},{label:'Post notice',icon:BellRing,view:'sch_notices'},{label:'New admission',icon:UserPlus,view:'sch_students'}].filter(item => (item.view !== 'sch_fees' || canViewFinance) && (item.view !== 'sch_students' || canManageStudents)).map(item=><button key={item.view} onClick={()=>item.view==='sch_students'?onOpenAddStudent():onNavigate(item.view)} className="flex min-h-20 flex-col items-start justify-between rounded-xl border border-[#dce7e4] p-3 text-left text-sm font-semibold text-[#18312d] hover:border-[#0e8078] hover:bg-[#f6faf8]"><item.icon className="text-[#0e8078]" size={19}/>{item.label}</button>)}</div></div>
      <div className="rounded-2xl border border-[#dce7e4] bg-white p-5"><div className="mb-4 flex items-center justify-between"><h2 className="font-bold text-[#102522]">Recent activity</h2><button onClick={()=>onNavigate('sch_notices')} className="text-xs font-semibold text-[#0e8078]">View all</button></div>{result.recentActivity.length ? result.recentActivity.slice(0,4).map((item:DashboardRecord,index:number)=><div key={item.id ?? index} className="border-b border-[#e8efed] py-3 last:border-0"><p className="text-sm font-semibold text-[#18312d]">{item.title ?? item.description ?? item.type ?? 'Activity'}</p><p className="mt-1 text-xs text-[#71817d]">{item.detail ?? item.name ?? item.date ?? ''}</p></div>) : result.notices.slice(0,4).map((notice:DashboardRecord,index:number)=><div key={notice.id ?? index} className="border-b border-[#e8efed] py-3 last:border-0"><p className="text-sm font-semibold text-[#18312d]">{notice.title ?? 'School notice'}</p><p className="mt-1 line-clamp-2 text-xs text-[#71817d]">{notice.content ?? ''}</p></div>)}{!result.recentActivity.length && !result.notices.length && <p className="py-8 text-center text-sm text-[#71817d]">No recent activity available.</p>}</div>
    </section>
  </div>;
};
