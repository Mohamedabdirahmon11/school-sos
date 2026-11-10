import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { ApiClient } from '../../services/api.ts';
import { useApi } from '../../hooks/useApi.ts';
import { ErrorState } from '../common/ErrorState.tsx';
import { formatMoney } from '../../lib/money.ts';
import { Student, FeePayment, FeeType, FeeStructureItem } from '../../types/index.ts';
import { 
  DollarSign, 
  Receipt, 
  Plus, 
  Search, 
  Printer, 
  ArrowUpRight, 
  TrendingUp, 
  Calendar, 
  CheckCircle2, 
  AlertCircle,
  FileSpreadsheet,
  Download,
  CreditCard,
  Building,
  Smartphone
} from 'lucide-react';

export const AccountantDashboard: React.FC = () => {
  const { school, user } = useAuth();
  const now = new Date();
  const reportingMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const reportingDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const [receiptPage, setReceiptPage] = useState(1);
  const dashboardData = useApi(() => Promise.all([
    ApiClient.getStudents(), ApiClient.getFeeReceiptPage(receiptPage, 20), ApiClient.getFeeStructures(),
    ApiClient.getDailyIncome(reportingDate), ApiClient.getArrears(), ApiClient.getMonthlyFinanceSummary(reportingMonth)
  ]), [school?.id, reportingMonth, reportingDate, receiptPage], Boolean(school));
  const [studentRows, paymentRows, structureRows, dailyIncome, arrearsRows, monthlySummary] = dashboardData.data || [[], [], [], null, [], null];
  const students: Student[] = Array.isArray(studentRows) ? studentRows : [];
  const receiptPageData = paymentRows as { items?: FeePayment[]; total?: number; page?: number; pageSize?: number; totalPages?: number } | null;
  const payments: FeePayment[] = Array.isArray(receiptPageData?.items) ? receiptPageData.items : [];
  const feeStructures: FeeStructureItem[] = Array.isArray(structureRows) ? structureRows : [];
  const loading = dashboardData.loading;
  const [search, setSearch] = useState('');
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<FeePayment | null>(null);

  // Quick Cash Payment form
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedFeeStructureId, setSelectedFeeStructureId] = useState('');
  const [selectedFeeType, setSelectedFeeType] = useState<FeeType>('monthly_tuition');
  const [amountDue, setAmountDue] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  const [month, setMonth] = useState('Current Month');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const paymentIdempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    if (students.length > 0 && !selectedStudentId) setSelectedStudentId(students[0].id);
  }, [students, selectedStudentId]);

  useEffect(() => {
    const firstActive = feeStructures.find(structure => structure.isActive);
    if (firstActive && !selectedFeeStructureId) {
      setSelectedFeeStructureId(firstActive.id);
      setSelectedFeeType(firstActive.feeType);
      setAmountDue(String(firstActive.amount));
      setAmountPaid(String(firstActive.amount));
    }
  }, [feeStructures, selectedFeeStructureId]);

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const due = Number(amountDue);
    const paid = Number(amountPaid);
    if (!selectedStudentId) { setMessage('Select a student before recording a payment.'); return; }
    if (!Number.isFinite(due) || due <= 0 || !Number.isFinite(paid) || paid <= 0 || paid > due) {
      setMessage('Enter a valid amount paid greater than zero and no more than the amount due.');
      return;
    }

    try {
      paymentIdempotencyKey.current ||= globalThis.crypto?.randomUUID?.() || `pay-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const payment = await ApiClient.recordCashPayment({
        studentId: selectedStudentId,
        feeType: selectedFeeType,
        feeStructureId: selectedFeeStructureId || undefined,
        month,
        amountDue: due,
        amountPaid: paid,
        notes: notes || undefined,
        idempotencyKey: paymentIdempotencyKey.current
      });

      setMessage(`Payment recorded! Official Receipt Number: ${payment.receiptNumber}`);
      setShowPayModal(false);
      setReceiptPage(1);
      setSelectedReceipt(payment);
      setNotes('');
      setAmountDue('');
      setAmountPaid('');
      setSelectedFeeStructureId('');
      paymentIdempotencyKey.current = null;
      dashboardData.retry();
    } catch (err: any) {
      setMessage(err?.message || 'Payment could not be recorded. Please try again.');
    }
  };

  const handleVoidPayment = async (payment: FeePayment) => {
    const reason = window.prompt(`Why are you voiding receipt ${payment.receiptNumber}?`);
    if (reason === null) return;
    try {
      await ApiClient.voidFeePayment(payment.id, reason);
      setMessage(`Receipt ${payment.receiptNumber} was voided.`);
      await dashboardData.retry();
    } catch (error: any) {
      setMessage(error.message || 'Payment could not be voided.');
    }
  };

  const totalCollected = Number(monthlySummary?.totalIncome) || 0;
  const totalArrears = (Array.isArray(arrearsRows) ? arrearsRows : []).reduce((sum: number, row: any) => sum + Math.max(0, Number(row.totalRemaining) || 0), 0);

  const filteredPayments = payments.filter(p => {
    const student = students.find(s => s.id === p.studentId);
    const stdName = student ? `${student.firstName} ${student.lastName}` : '';
    return (
      String(p.receiptNumber || '').toLowerCase().includes(search.toLowerCase()) ||
      stdName.toLowerCase().includes(search.toLowerCase())
    );
  });

  if (dashboardData.error) return <ErrorState error={dashboardData.error} onRetry={dashboardData.retry} />;
  if (loading) return <div className="p-6 space-y-4" aria-label="Loading finance dashboard"><div className="h-8 w-1/3 animate-pulse rounded bg-slate-200" /><div className="grid gap-4 sm:grid-cols-3">{[1, 2, 3].map(item => <div key={item} className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white" />)}</div></div>;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Printable Receipt Modal */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border border-slate-200">
            <div className="border-b-2 border-dashed border-slate-200 pb-4 text-center">
              <h2 className="text-base font-bold text-slate-900 uppercase tracking-wider">{school?.name}</h2>
              <p className="text-[11px] text-slate-500">Official Student Tuition Receipt</p>
              <div className="mt-2 inline-block px-3 py-1 bg-teal-50 text-[#0F766E] font-mono text-xs font-bold rounded-lg border border-teal-200">
                {selectedReceipt.receiptNumber}
              </div>
            </div>

            <div className="py-4 space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Date Issued:</span>
                <span className="font-semibold text-slate-800">
                  {new Date(selectedReceipt.date).toLocaleDateString()}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Billing Period:</span>
                <span className="font-semibold text-slate-800">{selectedReceipt.month}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Payment Channel:</span>
                <span className="font-semibold text-slate-800 capitalize">Cash Only</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Amount Paid:</span>
                <span className="text-sm font-bold font-mono text-[#0F766E]">
                  {formatMoney(selectedReceipt.amountPaid, school?.currency)}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Remaining Balance:</span>
                <span className="font-bold font-mono text-amber-700">
                  {formatMoney(selectedReceipt.remainingAmount, school?.currency)}
                </span>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
              <button
                onClick={() => setSelectedReceipt(null)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Close
              </button>
              <div className="flex gap-2">
                <button onClick={() => void ApiClient.downloadReceiptPdf(selectedReceipt.id)} className="px-3 py-2 bg-white text-[#0F766E] border border-teal-200 text-xs font-semibold rounded-lg">Download PDF</button>
                <button onClick={() => window.print()} className="px-4 py-2 bg-[#0F766E] hover:bg-[#0D655E] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5">
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Official Receipt</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#132A29]">
            Accountant Finance & Fee Ledger
          </h1>
          <p className="text-xs text-[#64748B]">
            Cash desk, arrears, and instant receipts
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPayModal(true)}
            className="px-4 py-2 bg-[#0F766E] hover:bg-[#0D655E] text-white text-xs font-semibold rounded-lg shadow-sm flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Record Student Payment</span>
          </button>
        </div>
      </div>

      {(!user?.permissions?.includes('payroll_manage') || !user?.permissions?.includes('reports_export')) && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-950">
          <p className="font-bold">Some finance tools need additional access</p>
          <p className="mt-1 text-amber-900/80">
            {!user?.permissions?.includes('payroll_manage') ? 'Payroll is not assigned to this Accountant account. ' : ''}
            {!user?.permissions?.includes('reports_export') ? 'Financial report exports are not assigned. ' : ''}
            Ask the School Admin to enable the required permissions in Staff Access. Your current Fees and Expenses access remains available.
          </p>
        </section>
      )}

      {message && (
        <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg text-xs text-[#0F766E] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">Collected This Month</span>
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-[#0F766E] flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-slate-900">
            {formatMoney(totalCollected, school?.currency)}
          </div>
          <p className="text-[11px] text-teal-700 font-medium mt-1">Recorded cash collections</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">Outstanding Arrears</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-amber-900">
            {formatMoney(totalArrears, school?.currency)}
          </div>
          <p className="text-[11px] text-amber-700 font-medium mt-1">Unpaid tuition balances</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">Receipts Issued</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-blue-900">{Number(monthlySummary?.incomeCount) || 0}</div>
          <p className="text-[11px] text-blue-700 font-medium mt-1">Individual stamped transactions</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">Today's collection</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-slate-900">
            {formatMoney(Number(dailyIncome?.totalCollected) || 0, school?.currency)}
          </div>
          <p className="text-[11px] text-indigo-700 font-medium mt-1">{Number(dailyIncome?.paymentCount) || 0} cash receipts today</p>
        </div>
      </div>

      {/* Fee structure overview */}
      <section className="rounded-2xl border border-[#E2E8F0] bg-white p-4 md:p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-bold text-[#132A29]">Fee structures</h2>
            <p className="text-xs text-slate-500">Configured charges for this school</p>
          </div>
          <span className="w-fit rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
            {feeStructures.filter(item => item.isActive).length} active
          </span>
        </div>
        {feeStructures.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
            <p className="text-sm font-semibold text-slate-700">No fee structures configured</p>
            <p className="mt-1 text-xs text-slate-500">Ask the School Admin to configure the school's fee schedule before collecting recurring fees.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {feeStructures.map(structure => (
              <article key={structure.id} className="rounded-xl border border-slate-200 p-4 transition-colors hover:border-teal-200 hover:bg-teal-50/30">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-slate-900">{structure.name}</h3>
                    <p className="mt-1 text-[11px] capitalize text-slate-500">{structure.feeType.replace(/_/g, ' ')} · {structure.cadence.replace(/_/g, ' ')}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${structure.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {structure.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="mt-4 text-xl font-bold tracking-tight text-[#0F766E]">{formatMoney(structure.amount, school?.currency)}</p>
                {(structure.minGrade || structure.maxGrade) && (
                  <p className="mt-1 text-[11px] text-slate-500">Grades {structure.minGrade ?? '—'}–{structure.maxGrade ?? '—'}</p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Student arrears */}
      <section className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-sm">
        <div className="flex flex-col gap-1 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-bold text-[#132A29]">Students with outstanding balances</h2>
            <p className="text-xs text-slate-500">Balances exclude voided receipts and use the stored remaining amount</p>
          </div>
          <span className="w-fit rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">{Array.isArray(arrearsRows) ? arrearsRows.length : 0} students</span>
        </div>
        {!Array.isArray(arrearsRows) || arrearsRows.length === 0 ? (
          <p className="px-4 py-7 text-center text-sm text-slate-500">No outstanding student balances.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr><th className="p-3">Student</th><th className="p-3">Class</th><th className="p-3 text-right">Due</th><th className="p-3 text-right">Paid</th><th className="p-3 text-right">Remaining</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {arrearsRows.slice(0, 10).map((row: any) => (
                  <tr key={row.student?.id} className="hover:bg-slate-50">
                    <td className="p-3 font-semibold text-slate-800">{[row.student?.firstName, row.student?.middleName, row.student?.lastName].filter(Boolean).join(' ') || row.student?.studentId || 'Student'}</td>
                    <td className="p-3 text-slate-500">{row.className || 'Unassigned'}</td>
                    <td className="p-3 text-right tabular-nums">{formatMoney(Number(row.totalDue) || 0, school?.currency)}</td>
                    <td className="p-3 text-right tabular-nums">{formatMoney(Number(row.totalPaid) || 0, school?.currency)}</td>
                    <td className="p-3 text-right font-bold tabular-nums text-amber-700">{formatMoney(Number(row.totalRemaining) || 0, school?.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {arrearsRows.length > 10 && <p className="border-t border-slate-100 px-4 py-2 text-right text-[11px] text-slate-500">Showing 10 of {arrearsRows.length} students</p>}
          </div>
        )}
      </section>

      {/* Transaction Records */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search receipts on this page..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
            />
          </div>
          <span className="text-xs text-slate-500 font-medium">
            Showing {filteredPayments.length} transactions
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] font-semibold">
              <tr>
                <th className="py-2.5 px-4">Receipt Number</th>
                <th className="py-2.5 px-4">Student</th>
                <th className="py-2.5 px-4">Month</th>
                <th className="py-2.5 px-4">Channel</th>
                <th className="py-2.5 px-4">Amount Paid</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No payment records found. Click &quot;Record Student Payment&quot; to begin.
                  </td>
                </tr>
              ) : (
                filteredPayments.map(p => {
                  const student = students.find(s => s.id === p.studentId);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-slate-800">
                        {p.receiptNumber}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900">
                        {student ? [student.firstName, student.middleName, student.lastName].filter(Boolean).join(' ') : p.studentId}
                      </td>
                      <td className="py-3 px-4 text-slate-600">{p.month}</td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-slate-700 capitalize flex items-center gap-1.5">
                          <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                          Cash
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {formatMoney(p.amountPaid, school?.currency)}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            p.status === 'paid'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setSelectedReceipt(p)}
                          className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded flex items-center gap-1 ml-auto"
                        >
                          <Printer className="w-3 h-3 text-slate-600" />
                          <span>Receipt</span>
                        </button>
                        {p.voidedAt ? <span className="ml-2 text-[10px] font-semibold text-red-700">VOIDED</span> : <button onClick={() => void handleVoidPayment(p)} className="ml-2 px-2.5 py-1 text-xs text-red-700 bg-red-50 hover:bg-red-100 font-semibold rounded">Void</button>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-slate-500">Showing {payments.length ? (receiptPage - 1) * (receiptPageData?.pageSize || 20) + 1 : 0}–{(receiptPage - 1) * (receiptPageData?.pageSize || 20) + payments.length} of {receiptPageData?.total || 0} receipts</p>
          <div className="flex items-center gap-2">
            <button type="button" disabled={receiptPage <= 1 || loading} onClick={() => setReceiptPage(page => Math.max(1, page - 1))} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40">Previous</button>
            <span className="text-[11px] text-slate-500">Page {receiptPageData?.page || receiptPage} of {Math.max(1, receiptPageData?.totalPages || 1)}</span>
            <button type="button" disabled={receiptPage >= (receiptPageData?.totalPages || 1) || loading} onClick={() => setReceiptPage(page => page + 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40">Next</button>
          </div>
        </div>
      </div>

      {/* Record Payment Modal */}
      {showPayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <h3 className="text-sm font-bold text-slate-900 mb-1">Record Fee Collection</h3>
            <p className="text-xs text-slate-500 mb-4">
              Enter payment amount and choose collection method
            </p>

            <form onSubmit={handleRecordPayment} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Select Student</label>
                <select
                  value={selectedStudentId}
                  onChange={e => setSelectedStudentId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none"
                >
                  {students.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.firstName} {s.lastName} ({s.studentId})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Fee structure</label>
                  <select
                    value={selectedFeeStructureId}
                    onChange={event => {
                      const id = event.target.value;
                      const structure = feeStructures.find(item => item.id === id);
                      setSelectedFeeStructureId(id);
                      if (structure) {
                        setSelectedFeeType(structure.feeType);
                        setAmountDue(String(structure.amount));
                        setAmountPaid(String(structure.amount));
                      }
                    }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                  >
                    <option value="">Manual amount</option>
                    {feeStructures.filter(item => item.isActive).map(structure => (
                      <option key={structure.id} value={structure.id}>{structure.name} · {formatMoney(structure.amount, school?.currency)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Fee category</label>
                  <select
                    value={selectedFeeType}
                    onChange={event => { setSelectedFeeStructureId(''); setSelectedFeeType(event.target.value as FeeType); }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                  >
                    <option value="monthly_tuition">Monthly tuition</option>
                    <option value="annual_registration">Annual registration</option>
                    <option value="bus">Transport / bus</option>
                    <option value="custom">Custom fee</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Amount Due ({school?.currency || 'ETB'})</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={amountDue}
                    onChange={e => setAmountDue(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Amount Paid ({school?.currency || 'ETB'})</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={amountPaid}
                    onChange={e => setAmountPaid(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Payment Method</label>
                <div className="px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg font-semibold text-slate-800 flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Cash payment (currently supported)</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Billing Month</label>
                <input
                  type="text"
                  value={month}
                  onChange={e => setMonth(e.target.value)}
                  placeholder="e.g. March 2026"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPayModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#0F766E] hover:bg-[#0D655E] text-white text-xs font-semibold rounded-lg shadow-sm"
                >
                  Confirm & Stamp Receipt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
