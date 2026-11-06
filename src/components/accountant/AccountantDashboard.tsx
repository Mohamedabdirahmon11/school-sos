import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { ApiClient } from '../../services/api.ts';
import { useApi } from '../../hooks/useApi.ts';
import { ErrorState } from '../common/ErrorState.tsx';
import { formatMoney } from '../../lib/money.ts';
import { formatSchoolDate } from '../../lib/ethiopian-calendar.ts';
import { Student, FeePayment, PaymentMethod, FeeStructureItem, StaffPayrollRecord } from '../../types/index.ts';
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
  const dashboardData = useApi(() => Promise.all([
    ApiClient.getStudents(), ApiClient.getFeePayments(), ApiClient.getFeeStructures()
  ]), [school?.id], Boolean(school));
  const [studentRows, paymentRows, structureRows] = dashboardData.data || [[], [], []];
  const students: Student[] = Array.isArray(studentRows) ? studentRows : [];
  const payments: FeePayment[] = Array.isArray(paymentRows) ? paymentRows : [];
  const feeStructures: FeeStructureItem[] = Array.isArray(structureRows) ? structureRows : [];
  const loading = dashboardData.loading;
  const [search, setSearch] = useState('');
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<FeePayment | null>(null);

  // Quick Cash Payment form
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [amountDue, setAmountDue] = useState('50');
  const [amountPaid, setAmountPaid] = useState('50');
  const [month, setMonth] = useState('Current Month');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const paymentIdempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    if (students.length > 0 && !selectedStudentId) setSelectedStudentId(students[0].id);
  }, [students, selectedStudentId]);

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId) return;

    try {
      paymentIdempotencyKey.current ||= globalThis.crypto?.randomUUID?.() || `pay-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const payment = await ApiClient.recordCashPayment({
        studentId: selectedStudentId,
        month,
        amountDue: parseFloat(amountDue) || 0,
        amountPaid: parseFloat(amountPaid) || 0,
        notes: notes || undefined,
        idempotencyKey: paymentIdempotencyKey.current
      });

      setMessage(`Payment recorded! Official Receipt Number: ${payment.receiptNumber}`);
      setShowPayModal(false);
      setSelectedReceipt(payment);
      setNotes('');
      paymentIdempotencyKey.current = null;
      dashboardData.retry();
    } catch (err: any) {
      alert(err.message);
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

  const activePayments = payments.filter(payment => !payment.voidedAt);
  const totalCollected = activePayments.reduce((sum, p) => sum + p.amountPaid, 0);
  const totalDue = activePayments.reduce((sum, p) => sum + p.amountDue, 0);
  const totalArrears = Math.max(0, totalDue - totalCollected);

  const filteredPayments = payments.filter(p => {
    const student = students.find(s => s.id === p.studentId);
    const stdName = student ? `${student.firstName} ${student.lastName}` : '';
    return (
      p.receiptNumber.toLowerCase().includes(search.toLowerCase()) ||
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
                  {formatSchoolDate(String(selectedReceipt.date).slice(0, 10), school?.calendarType || (school?.timezone === 'Africa/Addis_Ababa' ? 'ethiopian' : 'gregorian'))}
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

      {message && (
        <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg text-xs text-[#0F766E] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">Total Collected</span>
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-[#0F766E] flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-slate-900">
            {formatMoney(totalCollected, school?.currency)}
          </div>
          <p className="text-[11px] text-teal-700 font-medium mt-1">Verified cash and mobile money</p>
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
          <div className="mt-2 text-2xl font-bold font-mono text-blue-900">{payments.length}</div>
          <p className="text-[11px] text-blue-700 font-medium mt-1">Individual stamped transactions</p>
        </div>
      </div>

      {/* Transaction Records */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search receipt, student name, reference..."
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
                        {student ? `${student.firstName} ${student.middleName} ${student.lastName}` : p.studentId}
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Amount Due ($)</label>
                  <input
                    type="number"
                    value={amountDue}
                    onChange={e => setAmountDue(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Amount Paid ($)</label>
                  <input
                    type="number"
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
                  <span>Cash Payment (Mandatory Policy)</span>
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
