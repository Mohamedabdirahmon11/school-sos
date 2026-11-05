/**
 * School Admin Core Dashboard
 * Real campus metrics, today's attendance rate, daily collection, outstanding fees, notices, quick actions
 */

import React from 'react';
import { ApiClient } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { formatMoney } from '../../lib/money.ts';
import { useApi } from '../../hooks/useApi.ts';
import { ErrorState } from '../common/ErrorState.tsx';
import { 
  GraduationCap, 
  UserCheck, 
  CalendarCheck, 
  CreditCard, 
  TrendingUp, 
  UserPlus, 
  DollarSign, 
  Clock, 
  BellRing,
  ArrowRight,
  ShieldAlert
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
  const { school, isReadOnly, t } = useAuth();
  const { data, loading, error, retry } = useApi(
    () => ApiClient.getSchoolDashboard(school?.id),
    [school?.id],
    Boolean(school)
  );

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 bg-slate-200 rounded w-1/4 animate-pulse"></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 bg-white rounded-xl border border-slate-200 p-4 animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error) return <ErrorState error={error} onRetry={retry} />;

  const safeData = normalizeSchoolDashboardData(data);
  const { stats, recentPayments, notices } = safeData;
  const { totalStudents, totalTeachers, attendanceRate, todayCollection, totalOutstanding } = stats;
  const currency = school?.currency || 'ETB';

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Welcome Banner & Quick Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#132A29]">
            {school?.name || 'School Dashboard'}
          </h1>
          <p className="text-xs text-[#64748B]">
            {school?.academicYear} · {school?.currentSemester} · Campus Code: <span className="font-mono">{school?.code}</span>
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={onOpenAddStudent}
            disabled={isReadOnly}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#0D655E] rounded-lg shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Admit Student</span>
          </button>
        </div>
      </div>

      {/* 4 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          onClick={() => onNavigate('sch_students')}
          className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-xs cursor-pointer hover:border-[#0F766E] transition-colors"
        >
          <div className="flex items-center justify-between text-[#64748B]">
            <span className="text-xs font-medium uppercase tracking-wider">Enrolled Students</span>
            <GraduationCap className="w-4 h-4 text-[#0F766E]" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-[#132A29]">{totalStudents}</span>
            <span className="text-xs text-emerald-600 font-medium">Active</span>
          </div>
          <p className="text-[11px] text-[#64748B] mt-1">Student directory & profiles</p>
        </div>

        <div 
          onClick={() => onNavigate('sch_teachers')}
          className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-xs cursor-pointer hover:border-[#0F766E] transition-colors"
        >
          <div className="flex items-center justify-between text-[#64748B]">
            <span className="text-xs font-medium uppercase tracking-wider">Teaching Faculty</span>
            <UserCheck className="w-4 h-4 text-[#0F766E]" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-[#132A29]">{totalTeachers}</span>
            <span className="text-xs text-emerald-600 font-medium">Appointed</span>
          </div>
          <p className="text-[11px] text-[#64748B] mt-1">Subject & class assignments</p>
        </div>

        <div 
          onClick={() => onNavigate('sch_attendance')}
          className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-xs cursor-pointer hover:border-[#0F766E] transition-colors"
        >
          <div className="flex items-center justify-between text-[#64748B]">
            <span className="text-xs font-medium uppercase tracking-wider">Today's Attendance</span>
            <CalendarCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-[#132A29]">{attendanceRate}%</span>
            <span className="text-xs text-emerald-600 font-medium">Present</span>
          </div>
          <p className="text-[11px] text-[#64748B] mt-1">Daily register & absentee alerts</p>
        </div>

        <div hidden
          onClick={() => onNavigate('sch_fees')}
          className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-xs cursor-pointer hover:border-[#0F766E] transition-colors"
        >
          <div className="flex items-center justify-between text-[#64748B]">
            <span className="text-xs font-medium uppercase tracking-wider">Today's Collections</span>
            <DollarSign className="w-4 h-4 text-[#0F766E]" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-[#132A29]">
              ${todayCollection.toLocaleString()}
            </span>
            <span className="text-xs text-[#64748B]">{currency}</span>
          </div>
          <p className="text-[11px] text-[#64748B] mt-1">
            Outstanding: ${totalOutstanding.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Center Layout: Left is Recent Fee Transactions, Right is Notices */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Recent Fee Payments Table */}
        <div hidden className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden lg:col-span-2 shadow-xs">
          <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-[#132A29]">Recent Fee Payments</h2>
              <p className="text-[11px] text-[#64748B]">Latest school tuition and transport receipts</p>
            </div>
            <button
              onClick={() => onNavigate('sch_fees')}
              className="text-xs font-semibold text-[#0F766E] hover:underline"
            >
              Full Ledger →
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8FAFC] text-[#64748B] font-medium border-b border-[#E2E8F0]">
                <tr>
                  <th className="px-4 py-3">Receipt #</th>
                  <th className="px-4 py-3">Student ID</th>
                  <th className="px-4 py-3">Amount Paid</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {recentPayments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-[#64748B]">
                      No payments recorded yet. Click "Record Payment" to log fee collections.
                    </td>
                  </tr>
                ) : (
                  recentPayments.map((p: any, index: number) => (
                    <tr key={p?.id ?? index} className="hover:bg-[#F8FAFC]">
                      <td className="px-4 py-3 font-mono font-medium text-[#132A29]">{p?.receiptNumber || '—'}</td>
                      <td className="px-4 py-3 font-mono text-[#64748B]">{p?.studentId || '—'}</td>
                      <td className="px-4 py-3 font-mono font-bold text-[#132A29]">
                        {formatMoney(Number(p?.amountPaid) || 0, currency)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-[#334155]">{p?.paymentMethod || '—'}</span>
                        {p?.referenceNumber && (
                          <span className="block text-[10px] font-mono text-[#64748B]">{p.referenceNumber}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-semibold ${
                          p?.status === 'paid' ? 'text-emerald-700' :
                          p?.status === 'partial' ? 'text-amber-700' :
                          'text-red-700'
                        }`}>
                          {(p?.status || 'unpaid').toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[#64748B]">
                        {typeof p?.date === 'string' ? p.date.split('T')[0] : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Notices Board Widget */}
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 space-y-4 shadow-xs lg:col-span-1">
          <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
            <div>
              <h2 className="text-sm font-bold text-[#132A29] flex items-center gap-1.5">
                <BellRing className="w-4 h-4 text-[#0F766E]" />
                <span>Notice Board</span>
              </h2>
              <p className="text-[11px] text-[#64748B]">Announcements & circulars</p>
            </div>
            <button
              onClick={() => onNavigate('sch_notices')}
              className="text-xs text-[#0F766E] hover:underline font-semibold"
            >
              Manage
            </button>
          </div>

          <div className="space-y-3">
            {notices.length === 0 ? (
              <p className="text-xs text-[#64748B] text-center py-6">
                No active notices published.
              </p>
            ) : (
              notices.slice(0, 3).map((n: any, index: number) => (
                <div key={n?.id ?? index} className="p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#132A29]">{n?.title || '—'}</span>
                    {n?.isPinned && (
                      <span className="text-[10px] font-mono text-amber-700 font-bold uppercase">Pinned</span>
                    )}
                  </div>
                  <p className="text-[#475569] line-clamp-2 leading-relaxed">{n?.content || ''}</p>
                  <p className="text-[10px] text-[#64748B] font-mono pt-1">
                    {typeof n?.publishDate === 'string' ? n.publishDate.split('T')[0] : '—'} · By {n?.authorName || '—'}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
