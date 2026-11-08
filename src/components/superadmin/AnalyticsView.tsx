/**
 * Platform Analytics & Aggregates for Super Admin
 * Attendance aggregates, 30-day active users, fees collected by schools, tier mix, CSV export
 */

import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../services/api.ts';
import { formatMoney } from '../../lib/money.ts';
import { BarChart3, Download, TrendingUp, Users, DollarSign, CalendarCheck, FileText } from 'lucide-react';

export const AnalyticsView: React.FC = () => {
  const [analytics, setAnalytics] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const schools = analytics?.schools || [];
  const totalStudents = Number(analytics?.totalStudents) || 0;
  const totalTeachers = Number(analytics?.totalTeachers) || 0;
  const activeUsers = Number(analytics?.activeUsers30Days) || 0;
  const totalInvoiced = Number(analytics?.totalPaidBillings) || 0;
  const platformCurrency = String(analytics?.platformCurrency || 'ETB').toUpperCase();
  const activeSchools = Number(analytics?.activeSchools) || 0;

  const loadAnalytics = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      setAnalytics(await ApiClient.getPlatformAnalytics());
    } catch (error: any) {
      setLoadError(error.message || 'Unable to load platform analytics.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadAnalytics();
  }, []);

  // Export Analytics CSV
  const handleExportCSV = () => {
    const csvCell = (value: unknown) => {
      const text = String(value ?? '');
      const safe = /^\s*[=+\-@]/.test(text) ? "'" + text : text;
      return '"' + safe.replace(/"/g, '""') + '"';
    };
    const rows = [
      ['School Name', 'School Code', 'Plan', 'Status', 'Students', 'Teachers', 'Valid Until'],
      ...(schools as any[]).map(s => {
        const subscription = s.subscription || {};
        const validUntil = typeof subscription.validUntil === 'string' ? subscription.validUntil.slice(0, 10) : '';
        return [s.name, s.code, subscription.plan, subscription.status, s.studentCount || 0, s.teacherCount || 0, validUntil];
      })
    ];
    const csv = rows.map(row => row.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'schoolos_analytics_' + new Date().toISOString().split('T')[0] + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return <div role="status" aria-busy="true" className="p-6 text-sm text-[#64748B]">Loading platform analytics…</div>;
  if (loadError) return (
    <div role="alert" className="m-6 rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
      <p className="font-semibold">Platform analytics could not be loaded.</p>
      <p className="mt-1">{loadError}</p>
      <button type="button" onClick={() => void loadAnalytics()} className="mt-3 font-semibold underline">Retry loading</button>
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#132A29]">
            Multi-Tenant Platform Analytics
          </h1>
          <p className="text-xs text-[#64748B]">
            Real-time aggregate telemetry, enrollment statistics, and usage metrics
          </p>
        </div>
        <button
          onClick={handleExportCSV}
          className="px-3.5 py-2 text-xs font-semibold text-[#132A29] bg-white hover:bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg shadow-xs transition-colors flex items-center gap-1.5 self-start sm:self-auto"
        >
          <Download className="w-4 h-4 text-[#0F766E]" />
          <span>Export Analytics CSV</span>
        </button>
      </div>

      {schools.length === 0 && <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-[#64748B]">No school data is available yet.</div>}

      {/* Aggregate Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-xl border border-[#E2E8F0]">
          <span className="text-xs text-[#64748B] font-medium uppercase tracking-wider">Active Schools</span>
          <p className="text-2xl font-bold font-mono text-[#132A29] mt-2">{activeSchools.toLocaleString()}</p>
          <p className="text-[11px] text-[#64748B] mt-1">Schools with an active subscription</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#E2E8F0]">
          <span className="text-xs text-[#64748B] font-medium uppercase tracking-wider">Active Users (30 Days)</span>
          <p className="text-2xl font-bold font-mono text-[#132A29] mt-2">{activeUsers}</p>
          <p className="text-[11px] text-[#64748B] mt-1">Based on last successful sign-in</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#E2E8F0]">
          <span className="text-xs text-[#64748B] font-medium uppercase tracking-wider">Total SaaS Billings</span>
          <p className="text-2xl font-bold font-mono text-[#132A29] mt-2">{formatMoney(totalInvoiced, platformCurrency)}</p>
          <p className="text-[11px] text-[#64748B] mt-1">Paid invoices in {platformCurrency}</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#E2E8F0]">
          <span className="text-xs text-[#64748B] font-medium uppercase tracking-wider">Total Teachers</span>
          <p className="text-2xl font-bold font-mono text-[#132A29] mt-2">{totalTeachers.toLocaleString()}</p>
          <p className="text-[11px] text-[#64748B] mt-1">Across all schools</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#E2E8F0]">
          <span className="text-xs text-[#64748B] font-medium uppercase tracking-wider">Total Students</span>
          <p className="text-2xl font-bold font-mono text-[#132A29] mt-2">{totalStudents.toLocaleString()}</p>
          <p className="text-[11px] text-[#64748B] mt-1">Across all schools</p>
        </div>
      </div>

      {/* Campus Usage Matrix */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E2E8F0]">
          <h2 className="text-sm font-bold text-[#132A29]">Tenant Usage Matrix</h2>
          <p className="text-[11px] text-[#64748B]">Enrollment capacity and faculty staffing breakdown</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F8FAFC] text-[#64748B] font-medium border-b border-[#E2E8F0]">
              <tr>
                <th className="px-4 py-3">School Name</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Plan Tier</th>
                <th className="px-4 py-3">Students</th>
                <th className="px-4 py-3">Teachers</th>
                <th className="px-4 py-3">Student Portal Access</th>
                <th className="px-4 py-3">Subscription Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {(schools as any[]).map((s: any) => (
                <tr key={s.id} className="hover:bg-[#F8FAFC]">
                  <td className="px-4 py-3 font-semibold text-[#132A29]">{s.name}</td>
                  <td className="px-4 py-3 font-mono text-[#64748B]">{s.code}</td>
                  <td className="px-4 py-3 capitalize">{s.subscription.plan}</td>
                  <td className="px-4 py-3 font-mono">{s.studentCount || 0}</td>
                  <td className="px-4 py-3 font-mono">{s.teacherCount || 0}</td>
                  <td className="px-4 py-3">
                    <span className={s.studentAccessEnabled ? 'text-emerald-700 font-medium' : 'text-slate-500 font-medium'}>
                      {s.studentAccessEnabled ? 'ENABLED' : 'DISABLED'}
                    </span>
                  </td>
                  <td className="px-4 py-3 uppercase font-semibold text-[11px] text-[#0F766E]">
                    {s.subscription.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
