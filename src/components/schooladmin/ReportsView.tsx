import React from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { ApiClient } from '../../services/api.ts';
import { useApi } from '../../hooks/useApi.ts';
import { ErrorState } from '../common/ErrorState.tsx';
import { formatMoney } from '../../lib/money.ts';
import { 
  FileSpreadsheet, 
  Download, 
  BarChart3, 
  DollarSign, 
  Calendar, 
  GraduationCap, 
  Users, 
  RefreshCw,
  TrendingUp,
  AlertCircle
} from 'lucide-react';

export const ReportsView: React.FC = () => {
  const { school, user } = useAuth();
  const report = useApi(() => ApiClient.request<any>('/school/reports/summary'), [school?.id], Boolean(school));
  const summary = report.data;
  const loading = report.loading;
  const fetchSummary = report.retry;

  const csvCell = (value: unknown) => {
    let clean = String(value ?? '');
    if (/^[\t\r ]*[=+@-]/.test(clean)) clean = `'${clean}`;
    return `"${clean.replace(/"/g, '""')}"`;
  };

  const downloadCSV = async (type: string) => {
    if (!summary) return;
    const filename = `schoolos_${type}_${new Date().toISOString().split('T')[0]}.csv`;

    if (type === 'finance') {
      try {
        const response = await fetch('/api/school/reports/finance/export', { credentials: 'include' });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || 'Financial ledger export failed.');
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch (error: any) {
        window.alert(error.message || 'Unable to download the financial ledger.');
      }
      return;
    }

    let csvContent = '';
    if (type === 'census') {
      csvContent = 'Metric,Value,School,Academic Year\n';
      csvContent += [csvCell('Enrolled Students'), csvCell(summary.studentCount), csvCell(school?.name), csvCell(school?.academicYear)].join(',') + '\n';
      csvContent += [csvCell('Attendance Rate'), csvCell(`${summary.attendanceRate}%`), csvCell(school?.name), csvCell(school?.academicYear)].join(',') + '\n';
      csvContent += [csvCell('Academic Pass Rate'), csvCell(summary.passRate == null ? 'Not calculated' : `${summary.passRate}%`), csvCell(school?.name), csvCell(school?.academicYear)].join(',') + '\n';
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (report.error) return <ErrorState error={report.error} onRetry={report.retry} />;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#132A29]">
            Comprehensive Reports & Analytics Hub
          </h1>
          <p className="text-xs text-[#64748B]">
            Aggregate performance indicators, fee collections, attendance stats, and one-click CSV data exports
          </p>
        </div>
        <button
          onClick={fetchSummary}
          className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 flex items-center gap-1.5 hover:bg-slate-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Metrics</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div hidden={user?.role === 'school_admin'} className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">Total Collected</span>
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-[#0F766E] flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-slate-900">
            {formatMoney(summary?.totalCollected, school?.currency)}
          </div>
          <p className="text-[11px] text-teal-700 font-medium mt-1">
            From {summary?.paymentCount || 0} recorded fee transactions
          </p>
        </div>

        <div hidden={user?.role === 'school_admin'} className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">Outstanding Arrears</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-amber-900">
            {formatMoney(summary?.totalArrears, school?.currency)}
          </div>
          <p className="text-[11px] text-amber-700 font-medium mt-1">Pending parent fee balances</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">Attendance Rate</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-blue-900">
            {summary?.attendanceRate || 100}%
          </div>
          <p className="text-[11px] text-blue-700 font-medium mt-1">Present student sessions ratio</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">Exam Pass Rate</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <GraduationCap className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-emerald-900">
            {summary?.passRate == null ? '—' : `${summary.passRate}%`}
          </div>
          <p className="text-[11px] text-emerald-700 font-medium mt-1">Scored &ge; 50% in verified exams</p>
        </div>
      </div>

      {/* Export Modules Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Finance Export */}
        <div hidden={user?.role === 'school_admin'} className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-xs flex flex-col justify-between">
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-lg bg-teal-50 text-[#0F766E] flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Financial Fee Collection & Arrears Ledger</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Complete breakdown of every tuition installment, cash payment,
              reference IDs, and remaining balances per enrolled pupil.
            </p>
          </div>
          <button
            onClick={() => downloadCSV('finance')}
            className="mt-4 w-full py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Download Financial Ledger CSV</span>
          </button>
        </div>

        {/* Academic Census Export */}
        <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-xs flex flex-col justify-between">
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Academic Census & Performance Summary</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Enrollment counts across grades, student-to-teacher ratios, attendance percentages, and overall
              subject pass metrics for governmental or institutional compliance.
            </p>
          </div>
          <button
            onClick={() => downloadCSV('census')}
            className="mt-4 w-full py-2 bg-[#0F766E] hover:bg-[#0D655E] text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Download Academic Census CSV</span>
          </button>
        </div>
      </div>
    </div>
  );
};
