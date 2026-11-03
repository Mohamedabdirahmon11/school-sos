/**
 * Super Admin SaaS Command Dashboard
 * Metrics, 6-month SaaS revenue chart, subscription distribution, and Needs Attention triage
 */

import React, { useState } from 'react';
import { ApiClient } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { useApi } from '../../hooks/useApi.ts';
import { ErrorState } from '../common/ErrorState.tsx';
import { 
  Building2, 
  GraduationCap, 
  DollarSign, 
  LifeBuoy, 
  TrendingUp, 
  AlertTriangle, 
  ArrowUpRight, 
  CheckCircle2,
  Clock,
  ShieldAlert
} from 'lucide-react';

interface SuperAdminDashboardProps {
  onNavigate: (view: string, schoolId?: string) => void;
  onOpenAddSchool: () => void;
}

export const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({ onNavigate, onOpenAddSchool }) => {
  const { t, viewAsSchool } = useAuth();
  const dashboard = useApi(() => ApiClient.getSuperAdminDashboard(), []);
  const data = dashboard.data;
  const isLoading = dashboard.loading;
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const handleQuickActivate = async (schoolId: string) => {
    try {
      await ApiClient.updateSubscription(schoolId, { monthsToAdd: 1, status: 'active' });
      dashboard.retry();
      setActionMessage('School subscription activated for +1 month.');
      setTimeout(() => setActionMessage(null), 3000);
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (isLoading) {
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

  if (dashboard.error) return <ErrorState error={dashboard.error} onRetry={dashboard.retry} />;
  if (!data) return <ErrorState error={new Error('Super Admin data is unavailable.')} onRetry={dashboard.retry} />;

  const metrics = data.metrics || {};
  const revenueTrend = Array.isArray(data.revenueTrend) ? data.revenueTrend : [];
  const subscriptionCounts = data.subscriptionCounts || { active: 0, trial: 0, grace: 0, read_only: 0 };
  const needsAttention = Array.isArray(data.needsAttention) ? data.needsAttention : [];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#132A29]">
            Super Administrator Command Hub
          </h1>
          <p className="text-xs text-[#64748B]">
            Global system analytics, tenant subscriptions, and multi-school governance
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenAddSchool}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#0D655E] rounded-lg shadow-sm transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <span>+ Onboard School</span>
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionMessage}</span>
        </div>
      )}

      {metrics.totalSchools === 0 && <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-[#64748B]">No schools are registered yet.</div>}

      {/* 4 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-xs">
          <div className="flex items-center justify-between text-[#64748B]">
            <span className="text-xs font-medium uppercase tracking-wider">Active Schools</span>
            <Building2 className="w-4 h-4 text-[#0F766E]" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[#132A29] font-mono tabular-nums">
              {metrics.totalSchools}
            </span>
            <span className="text-xs text-emerald-600 font-medium">+100% cloud</span>
          </div>
          <p className="text-[11px] text-[#64748B] mt-1">
            {subscriptionCounts.active} Active · {subscriptionCounts.trial} Trial · {subscriptionCounts.read_only} Read-only
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-xs">
          <div className="flex items-center justify-between text-[#64748B]">
            <span className="text-xs font-medium uppercase tracking-wider">Total Enrolled Students</span>
            <GraduationCap className="w-4 h-4 text-[#0F766E]" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[#132A29] font-mono tabular-nums">
              {metrics.totalStudents ?? '—'}
            </span>
            <span className="text-xs text-emerald-600 font-medium">Across all campuses</span>
          </div>
          <p className="text-[11px] text-[#64748B] mt-1">Multi-tenant student ledger</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-xs">
          <div className="flex items-center justify-between text-[#64748B]">
            <span className="text-xs font-medium uppercase tracking-wider">SaaS Revenue (This Month)</span>
            <DollarSign className="w-4 h-4 text-[#0F766E]" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[#132A29] font-mono tabular-nums">
              ${Number(metrics.currentMonthRevenue || 0).toLocaleString()}
            </span>
            <span className="text-xs text-emerald-600 font-medium">USD</span>
          </div>
          <p className="text-[11px] text-[#64748B] mt-1">Platform subscription invoices</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-xs">
          <div className="flex items-center justify-between text-[#64748B]">
            <span className="text-xs font-medium uppercase tracking-wider">Open Support Tickets</span>
            <LifeBuoy className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[#132A29] font-mono tabular-nums">
              {metrics.openTickets ?? '—'}
            </span>
            <span className="text-xs text-amber-600 font-medium">Pending response</span>
          </div>
          <p className="text-[11px] text-[#64748B] mt-1">School administrator desk</p>
        </div>
      </div>

      {/* 6-Month SaaS Revenue Chart & Subscription Mix */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Chart */}
        <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-[#E2E8F0]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-[#132A29]">6-Month SaaS Platform Revenue</h2>
              <p className="text-[11px] text-[#64748B]">Subscription billing across all schools</p>
            </div>
            <span className="text-xs font-mono text-[#0F766E] bg-[#F0FDFA] px-2 py-1 rounded border border-[#CCFBF1]">
              Live Invoices
            </span>
          </div>

          <div className="h-44 flex items-end gap-4 pt-6 border-b border-[#E2E8F0] px-2">
            {revenueTrend.map((m: any, idx: number) => {
              const maxRev = Math.max(...revenueTrend.map((r: any) => r.revenue), 200);
              const heightPercent = Math.max(12, Math.round((m.revenue / maxRev) * 100));

              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-2 group">
                  <span className="text-[10px] font-mono text-[#64748B] opacity-0 group-hover:opacity-100 transition-opacity">
                    ${m.revenue}
                  </span>
                  <div
                    style={{ height: `${heightPercent}%` }}
                    className="w-full bg-[#0F766E]/80 hover:bg-[#0F766E] rounded-t transition-all cursor-pointer relative"
                  />
                  <span className="text-[11px] text-[#64748B] font-medium truncate w-full text-center">
                    {m.month.split(' ')[0]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Subscription Status Breakdown */}
        <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold text-[#132A29]">Tenant Health Overview</h2>
            <p className="text-[11px] text-[#64748B] mb-4">Lifecycle status breakdown</p>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between p-2 bg-[#F8FAFC] rounded border border-[#E2E8F0]">
                <span className="text-[#334155] font-medium">Active Subscriptions</span>
                <span className="font-mono font-bold text-emerald-700">{subscriptionCounts.active}</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-[#F8FAFC] rounded border border-[#E2E8F0]">
                <span className="text-[#334155] font-medium">Trial Phase (7 Days)</span>
                <span className="font-mono font-bold text-sky-700">{subscriptionCounts.trial}</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-[#F8FAFC] rounded border border-[#E2E8F0]">
                <span className="text-[#334155] font-medium">Grace Period</span>
                <span className="font-mono font-bold text-amber-700">{subscriptionCounts.grace}</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-[#F8FAFC] rounded border border-[#E2E8F0]">
                <span className="text-[#334155] font-medium">Read-Only (Expired)</span>
                <span className="font-mono font-bold text-rose-700">{subscriptionCounts.read_only}</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-[#F8FAFC] rounded border border-[#E2E8F0]">
                <span className="text-[#334155] font-medium">Suspended Access</span>
                <span className="font-mono font-bold text-slate-700">{subscriptionCounts.suspended}</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-[#F1F5F9] text-[11px] text-[#64748B]">
            Automated daily reconciliation daemon is running.
          </div>
        </div>
      </div>

      {/* Needs Attention Table */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden shadow-xs">
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-[#132A29] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>Schools Needing Attention</span>
            </h2>
            <p className="text-[11px] text-[#64748B]">Schools with trials ending, grace status, or read-only mode</p>
          </div>
          <button 
            onClick={() => onNavigate('sa_schools')} 
            className="text-xs text-[#0F766E] hover:underline font-semibold"
          >
            View All Schools ({metrics.totalSchools}) →
          </button>
        </div>

        {needsAttention.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#64748B]">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2 opacity-80" />
            <p className="font-medium text-[#132A29]">All schools are in good standing.</p>
            <p className="mt-0.5">No immediate trial expirations or grace period actions pending.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8FAFC] text-[#64748B] font-medium border-b border-[#E2E8F0]">
                <tr>
                  <th className="px-4 py-3">School Name</th>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Expires / Valid Until</th>
                  <th className="px-4 py-3 text-right">Quick Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {needsAttention.map((s: any) => (
                  <tr key={s.id} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="px-4 py-3 font-semibold text-[#132A29]">{s.name}</td>
                    <td className="px-4 py-3 font-mono text-[#64748B]">{s.code}</td>
                    <td className="px-4 py-3 capitalize text-[#334155]">{s.plan}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] font-medium ${
                        s.status === 'grace' ? 'text-amber-700' :
                        s.status === 'read_only' ? 'text-red-700' :
                        s.status === 'suspended' ? 'text-slate-800' :
                        'text-sky-700'
                      }`}>
                        {s.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[#64748B]">
                      {s.validUntil.split('T')[0]}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleQuickActivate(s.id)}
                          className="px-2.5 py-1 text-xs font-medium text-white bg-[#0F766E] hover:bg-[#0D655E] rounded transition-colors"
                        >
                          Activate / Renew (+1mo)
                        </button>
                        <button
                          onClick={() => onNavigate('sa_schools', s.id)}
                          className="px-2.5 py-1 text-xs font-medium text-[#334155] bg-[#F1F5F9] hover:bg-[#E2E8F0] rounded transition-colors"
                        >
                          Manage
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
