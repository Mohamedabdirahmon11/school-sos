/**
 * Student Fees & Cash Payments Ledger
 * Strictly Cash-Only payments.
 * Supports:
 * 1. Class-range monthly fees (e.g. Grade 1-4, Grade 5-8), bus fee, annual registration fee, custom fees
 * 2. Record Cash Payment with auto remaining balance and Paid/Partial/Unpaid status
 * 3. Printable Cash Receipt with school branding, student details, signatures and stamp
 * 4. Arrears List with balance tracking
 * 5. Daily Cash Income Report
 */

import React, { useState, useEffect, useRef } from 'react';
import { ApiClient } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { PaginationControls, PageInfo } from '../common/PaginationControls.tsx';
import { useApi } from '../../hooks/useApi.ts';
import { ErrorState } from '../common/ErrorState.tsx';
import { formatMoney } from '../../lib/money.ts';
import { FeePayment, FeeStructureItem, Student, SchoolClass, FeeType } from '../../types/index.ts';
import { 
  Banknote, 
  Search, 
  Plus, 
  Printer, 
  DollarSign, 
  Receipt, 
  CheckCircle2, 
  AlertCircle, 
  X,
  Sliders,
  Calendar,
  Layers,
  ArrowRight,
  Trash2,
  Pencil
} from 'lucide-react';

export const FeesLedgerView: React.FC = () => {
  const { school, isReadOnly, t, user } = useAuth();
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [page, setPage] = useState(1);
  const feeLoad = useApi(() => Promise.all([
    ApiClient.getFeePayments(undefined, { page, pageSize: 20 }), ApiClient.getStudents(), ApiClient.getClasses(),
    ApiClient.getFeeStructures(), ApiClient.getArrears(), ApiClient.getDailyIncome(), ApiClient.getBusAssignments()
  ]), [school?.id, page], Boolean(school));
  const [paymentRows, studentRows, classRows, structureRows, arrearsRows, dailyData, busRows] = feeLoad.data || [[], [], [], [], [], null, []];
  const payments: FeePayment[] = Array.isArray(paymentRows) ? paymentRows : [];
  const students: Student[] = Array.isArray(studentRows) ? studentRows : [];
  const classes: SchoolClass[] = Array.isArray(classRows) ? classRows : [];
  const feeStructures: FeeStructureItem[] = Array.isArray(structureRows) ? structureRows : [];
  const busAssignments: any[] = Array.isArray(busRows) ? busRows : [];
  const arrears: any[] = Array.isArray(arrearsRows) ? arrearsRows : [];
  const dailyReport = dailyData;

  const [activeTab, setActiveTab] = useState<'payments' | 'structures' | 'arrears' | 'daily_income'>('payments');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedReceipt, setSelectedReceipt] = useState<FeePayment | null>(null);
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [showStructureModal, setShowStructureModal] = useState(false);
  const [editingStructureId, setEditingStructureId] = useState<string | null>(null);
  const isLoading = feeLoad.loading;
  const [notice, setNotice] = useState<string | null>(null);

  const handleVoidPayment = async (payment: FeePayment) => {
    const reason = window.prompt(`Why are you voiding receipt ${payment.receiptNumber}?`);
    if (reason === null) return;
    try {
      await ApiClient.voidFeePayment(payment.id, reason);
      setNotice(`Receipt ${payment.receiptNumber} was voided.`);
      await feeLoad.retry();
    } catch (error: any) {
      setNotice(error.message || 'Payment could not be voided.');
    }
  };

  // Record Cash Payment Form State
  const [studentId, setStudentId] = useState('');
  const [feeType, setFeeType] = useState<FeeType>('monthly_tuition');
  const [feeStructureId, setFeeStructureId] = useState('');
  const [amountDue, setAmountDue] = useState(30);
  const [amountPaid, setAmountPaid] = useState(30);
  const [month, setMonth] = useState(new Date().toLocaleString('default', { month: 'long', year: 'numeric' }));
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const paymentIdempotencyKey = useRef<string | null>(null);

  // New Structure Form State
  const [newFeeName, setNewFeeName] = useState('');
  const [newFeeType, setNewFeeType] = useState<FeeType>('monthly_tuition');
  const [minGrade, setMinGrade] = useState<number>(1);
  const [maxGrade, setMaxGrade] = useState<number>(4);
  const [structureAmount, setStructureAmount] = useState<number>(25);
  const [structureCadence, setStructureCadence] = useState<'monthly' | 'annual' | 'one_time'>('monthly');

  const fetchData = feeLoad.retry;
  useEffect(() => { setPageInfo((paymentRows as any)?.pagination || null); }, [paymentRows]);
  useEffect(() => { if (students.length > 0 && !studentId) setStudentId(students[0].id); }, [students, studentId]);

  // Record Cash Fee Payment
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId || isReadOnly) return;

    setIsSubmitting(true);
    try {
      paymentIdempotencyKey.current ||= globalThis.crypto?.randomUUID?.() || `pay-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const res = await ApiClient.recordCashPayment({
        studentId,
        feeType,
        feeStructureId: feeType === 'custom' ? feeStructureId : undefined,
        month,
        amountDue: Number(amountDue),
        amountPaid: Number(amountPaid),
        notes,
        idempotencyKey: paymentIdempotencyKey.current
      });

      setShowRecordModal(false);
      setNotes('');
      paymentIdempotencyKey.current = null;
      setNotice(`Cash payment recorded. Receipt #${res.receiptNumber} generated.`);
      setSelectedReceipt(res);
      await fetchData();
      setTimeout(() => setNotice(null), 4000);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Add Fee Structure
  const handleCreateStructure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly || !newFeeName) return;

    try {
      const data = {
        name: newFeeName,
        feeType: newFeeType,
        minGrade: newFeeType === 'monthly_tuition' ? minGrade : undefined,
        maxGrade: newFeeType === 'monthly_tuition' ? maxGrade : undefined,
        amount: structureAmount,
        cadence: structureCadence,
        isActive: true
      };
      if (editingStructureId) await ApiClient.updateFeeStructure(editingStructureId, data);
      else await ApiClient.createFeeStructure(data);
      setShowStructureModal(false);
      setEditingStructureId(null);
      setNewFeeName('');
      setNotice('Fee structure rule created successfully!');
      await fetchData();
      setTimeout(() => setNotice(null), 3000);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleEditStructure = (item: FeeStructureItem) => {
    setEditingStructureId(item.id);
    setNewFeeName(item.name);
    setNewFeeType(item.feeType);
    setMinGrade(item.minGrade || 1);
    setMaxGrade(item.maxGrade || 4);
    setStructureAmount(item.amount);
    setStructureCadence(item.cadence);
    setShowStructureModal(true);
  };

  const handleDeleteStructure = async (item: FeeStructureItem) => {
    if (!window.confirm(`Delete fee structure “${item.name}”?`)) return;
    try {
      await ApiClient.deleteFeeStructure(item.id);
      await fetchData();
    } catch (error: any) {
      setNotice(error.message || 'Fee structure could not be deleted.');
    }
  };

  // Filtered Payments
  const filteredPayments = payments.filter(p => {
    const std = students.find(s => s.id === p.studentId);
    const stdName = std ? `${std.firstName} ${std.lastName} ${std.studentId}` : '';
    const matchSearch = p.receiptNumber.toLowerCase().includes(search.toLowerCase()) ||
      stdName.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const getStudent = (id: string) => students.find(s => s.id === id);
  const getClass = (classId?: string) => classes.find(c => c.id === classId);
  const money = (amount: number) => formatMoney(amount, school?.currency);
  const feeLabel = (payment: FeePayment) => payment.feeStructureId
    ? feeStructures.find(item => item.id === payment.feeStructureId)?.name || t('select_custom_fee')
    : payment.feeType.replace('_', ' ');
  const customFeesFor = (targetStudentId: string) => {
    const targetClassId = getStudent(targetStudentId)?.classId;
    return feeStructures.filter(item => item.isActive && item.feeType === 'custom' && (!item.classId || item.classId === targetClassId));
  };
  const configuredDue = (targetStudentId: string, targetFeeType: FeeType) => {
    if (targetFeeType === 'bus') return busAssignments.find(item => item.studentId === targetStudentId && item.active)?.feeAmount;
    if (targetFeeType === 'custom') return customFeesFor(targetStudentId).find(item => item.id === feeStructureId)?.amount;
    const student = getStudent(targetStudentId);
    const grade = getClass(student?.classId)?.gradeLevel;
    return feeStructures.find(item => item.isActive && item.feeType === targetFeeType && (
      item.classId ? item.classId === student?.classId : item.minGrade !== undefined && item.maxGrade !== undefined && grade !== undefined && grade >= item.minGrade && grade <= item.maxGrade
    ))?.amount;
  };

  if (feeLoad.error) return <ErrorState error={feeLoad.error} onRetry={feeLoad.retry} />;
  return (
    <div className="mx-auto min-w-0 w-full max-w-7xl space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[#132A29] flex items-center gap-2">
            <Banknote className="w-6 h-6 text-[#0F766E]" />
            Student Cash Fees & Billing Ledger
          </h1>
          <p className="text-xs text-[#64748B] mt-1">
            Cash-only collections, class-range fee structures, instant receipts, and daily reconciliation.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowStructureModal(true)}
            disabled={isReadOnly}
            className="px-3 py-2 text-xs font-semibold text-[#0F766E] bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <Sliders className="w-3.5 h-3.5" />
            Class-Range Fees
          </button>
          <button
            type="button"
            onClick={() => setShowRecordModal(true)}
            disabled={isReadOnly || students.length === 0}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#0D655E] rounded-lg transition-colors shadow-sm flex items-center gap-1.5 disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            Record Cash Payment
          </button>
        </div>
      </div>

      {notice && (
        <div className="p-3 bg-teal-50 border border-teal-200 text-teal-800 rounded-lg text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-[#F1F5F9] p-1 rounded-xl text-xs w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('payments')}
          className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
            activeTab === 'payments' ? 'bg-white text-[#132A29] shadow-xs font-semibold' : 'text-[#64748B] hover:text-[#132A29]'
          }`}
        >
          Payment History & Receipts
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('arrears')}
          className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
            activeTab === 'arrears' ? 'bg-white text-[#132A29] shadow-xs font-semibold' : 'text-[#64748B] hover:text-[#132A29]'
          }`}
        >
          Fee Arrears ({arrears.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('daily_income')}
          className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
            activeTab === 'daily_income' ? 'bg-white text-[#132A29] shadow-xs font-semibold' : 'text-[#64748B] hover:text-[#132A29]'
          }`}
        >
          Daily Cash Income Report
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('structures')}
          className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
            activeTab === 'structures' ? 'bg-white text-[#132A29] shadow-xs font-semibold' : 'text-[#64748B] hover:text-[#132A29]'
          }`}
        >
          Fee Structures
        </button>
      </div>

      {/* TAB 1: PAYMENTS & RECEIPTS */}
      {activeTab === 'payments' && (
        <div className="space-y-4">
          {/* Search & Filter */}
          <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#94A3B8]" />
              <input
                type="text"
                placeholder="Search by receipt number, student name or ID..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-[#CBD5E1] rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="text-xs py-2 px-3 border border-[#CBD5E1] rounded-lg bg-white"
              >
                <option value="all">All Payment Statuses</option>
                <option value="paid">Paid in Full</option>
                <option value="partial">Partially Paid</option>
                <option value="unpaid">Unpaid</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
            {isLoading ? (
              <div className="p-8 text-center text-xs text-[#64748B]">Loading payments...</div>
            ) : filteredPayments.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#64748B]">
                No cash payment records found. Click "Record Cash Payment" to record a collection.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[780px] text-left text-xs text-[#132A29]">
                  <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] uppercase font-semibold text-[#64748B]">
                    <tr>
                      <th className="py-3 px-4">Receipt #</th>
                      <th className="py-3 px-4">Student</th>
                      <th className="py-3 px-4">Fee Type</th>
                      <th className="py-3 px-4">Month</th>
                      <th className="py-3 px-4 text-right">Due ({school?.currency || 'ETB'})</th>
                      <th className="py-3 px-4 text-right">Paid (Cash)</th>
                      <th className="py-3 px-4 text-right">Remaining</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9]">
                    {filteredPayments.map(p => {
                      const std = getStudent(p.studentId);
                      const stdClass = getClass(std?.classId);
                      return (
                        <tr key={p.id} className="hover:bg-[#F8FAFC]">
                          <td className="py-3 px-4 font-mono font-medium text-[#0F766E]">{p.receiptNumber}</td>
                          <td className="py-3 px-4">
                            <p className="font-semibold text-[#132A29]">
                              {std ? `${std.firstName} ${std.lastName}` : 'Unknown Student'}
                            </p>
                            <p className="text-[11px] text-[#64748B]">
                              {stdClass?.name || ''} ({std?.studentId || p.studentId})
                            </p>
                          </td>
                          <td className="py-3 px-4 capitalize font-medium text-[#475569]">
                            {feeLabel(p)}
                          </td>
                          <td className="py-3 px-4 font-mono text-[#64748B]">{p.month}</td>
                          <td className="py-3 px-4 text-right font-mono text-[#475569]">{money(p.amountDue)}</td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">{money(p.amountPaid)}</td>
                          <td className="py-3 px-4 text-right font-mono text-[#64748B]">{money(p.remainingAmount)}</td>
                          <td className="py-3 px-4 text-center">
                            <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                              p.status === 'paid'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : p.status === 'partial'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}>
                              {p.voidedAt ? 'voided' : p.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => setSelectedReceipt(p)}
                              className="px-2.5 py-1 text-xs font-semibold text-[#0F766E] bg-teal-50 hover:bg-teal-100 rounded border border-teal-200 transition-colors"
                            >
                              Receipt PDF
                            </button>
                            {user?.role === 'accountant' && (p.voidedAt ? <span className="ml-2 text-[10px] font-semibold text-rose-700">VOIDED</span> : <button type="button" onClick={() => void handleVoidPayment(p)} className="ml-2 px-2.5 py-1 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded border border-rose-200">Void</button>)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <PaginationControls info={pageInfo} onPage={setPage} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: ARREARS LIST */}
      {activeTab === 'arrears' && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
          <div className="p-4 border-b border-[#E2E8F0]">
            <h2 className="text-sm font-bold text-[#132A29]">Fee Arrears & Outstanding Balances</h2>
            <p className="text-xs text-[#64748B]">Students with unpaid tuition or activity balances.</p>
          </div>
          {arrears.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#64748B]">All students are up to date on fee payments!</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[#132A29]">
                <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] uppercase font-semibold text-[#64748B]">
                  <tr>
                    <th className="py-3 px-4">Student</th>
                    <th className="py-3 px-4">Class</th>
                    <th className="py-3 px-4">Parent Contact</th>
                    <th className="py-3 px-4 text-right">Total Billed</th>
                    <th className="py-3 px-4 text-right">Paid</th>
                    <th className="py-3 px-4 text-right font-bold text-rose-700">Remaining Arrears</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {arrears.map((a, i) => (
                    <tr key={i} className="hover:bg-[#F8FAFC]">
                      <td className="py-3 px-4">
                        <p className="font-semibold text-[#132A29]">{a.student.firstName} {a.student.lastName}</p>
                        <p className="text-[11px] font-mono text-[#64748B]">{a.student.studentId}</p>
                      </td>
                      <td className="py-3 px-4 font-medium">{a.className}</td>
                      <td className="py-3 px-4 font-mono text-[#64748B]">{a.student.fatherPhone || 'N/A'}</td>
                      <td className="py-3 px-4 text-right font-mono">{money(a.totalDue)}</td>
                      <td className="py-3 px-4 text-right font-mono text-emerald-700">{money(a.totalPaid)}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-rose-700">{money(a.totalRemaining)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: DAILY CASH INCOME REPORT */}
      {activeTab === 'daily_income' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs text-[#64748B] font-medium">Daily Cash Collection Total</p>
              <p className="text-2xl font-bold font-mono text-[#132A29] mt-1">
                {money(dailyReport?.totalCollected || 0)}
              </p>
              <p className="text-[11px] text-[#64748B] mt-0.5">
                {dailyReport?.paymentCount || 0} Cash receipts recorded today ({dailyReport?.date})
              </p>
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3 py-2 bg-[#0F766E] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              Print Daily Report
            </button>
          </div>

          <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[#132A29]">
                <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] uppercase font-semibold text-[#64748B]">
                  <tr>
                    <th className="py-3 px-4">Receipt #</th>
                    <th className="py-3 px-4">Student</th>
                    <th className="py-3 px-4">Fee Type</th>
                    <th className="py-3 px-4 text-right">Cash Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {(dailyReport?.payments || []).map((p: any) => {
                    const std = getStudent(p.studentId);
                    return (
                      <tr key={p.id}>
                        <td className="py-3 px-4 font-mono font-medium text-[#0F766E]">{p.receiptNumber}</td>
                        <td className="py-3 px-4 font-semibold">{std ? `${std.firstName} ${std.lastName}` : p.studentId}</td>
                        <td className="py-3 px-4 capitalize">{feeLabel(p)}</td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">{money(p.amountPaid)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: FEE STRUCTURES */}
      {activeTab === 'structures' && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
          <div className="p-4 border-b border-[#E2E8F0] flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-[#132A29]">School Fee Structures & Class Ranges</h2>
              <p className="text-xs text-[#64748B]">Define monthly rates per grade range, bus fees, and registration fees.</p>
            </div>
            <button
              type="button"
              onClick={() => { setEditingStructureId(null); setNewFeeName(''); setNewFeeType('monthly_tuition'); setShowStructureModal(true); }}
              className="px-3 py-1.5 bg-[#0F766E] text-white rounded-lg text-xs font-semibold flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Structure
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#132A29]">
              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] uppercase font-semibold text-[#64748B]">
                <tr>
                  <th className="py-3 px-4">Fee Name</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Applicable Range</th>
                  <th className="py-3 px-4 font-mono text-right">Amount ({school?.currency || 'ETB'})</th>
                  <th className="py-3 px-4">Cadence</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {feeStructures.map(fs => (
                  <tr key={fs.id} className="hover:bg-[#F8FAFC]">
                    <td className="py-3 px-4 font-semibold text-[#132A29]">{fs.name}</td>
                    <td className="py-3 px-4 capitalize font-medium text-[#475569]">{fs.feeType.replace('_', ' ')}</td>
                    <td className="py-3 px-4">
                      {fs.minGrade && fs.maxGrade 
                        ? `Grade ${fs.minGrade} to Grade ${fs.maxGrade}`
                        : 'All Students / Opt-in'}
                    </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-[#132A29]">{money(fs.amount)}</td>
                    <td className="py-3 px-4 capitalize">{fs.cadence}</td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button type="button" onClick={() => handleEditStructure(fs)} className="p-1.5 text-[#0F766E]" aria-label={`Edit ${fs.name}`}><Pencil className="w-3.5 h-3.5" /></button>
                      <button type="button" onClick={() => handleDeleteStructure(fs)} className="p-1.5 text-rose-700" aria-label={`Delete ${fs.name}`}><Trash2 className="w-3.5 h-3.5" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* RECORD CASH PAYMENT MODAL */}
      {showRecordModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-[#E2E8F0] max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
              <h2 className="text-base font-bold text-[#132A29] flex items-center gap-2">
                <Banknote className="w-5 h-5 text-[#0F766E]" />
                Record Cash Fee Collection
              </h2>
              <button
                type="button"
                onClick={() => setShowRecordModal(false)}
                className="text-[#94A3B8] hover:text-[#132A29]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Select Student</label>
                <select
                  value={studentId}
                  onChange={e => { const nextStudentId = e.target.value; setStudentId(nextStudentId); if (feeType === 'custom') { const options = customFeesFor(nextStudentId); const selected = options.find(item => item.id === feeStructureId) || options[0]; setFeeStructureId(selected?.id || ''); if (selected) setAmountDue(Number(selected.amount)); } else { const due = configuredDue(nextStudentId, feeType); if (due !== undefined) setAmountDue(Number(due)); } }}
                  className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-lg focus:ring-2 focus:ring-[#0F766E]"
                >
                  {students.map(s => {
                    const c = getClass(s.classId);
                    return (
                      <option key={s.id} value={s.id}>
                        {s.firstName} {s.lastName} ({s.studentId}) - {c?.name || 'Class'}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Fee Category</label>
                <select
                  value={feeType}
                  onChange={e => { const next = e.target.value as FeeType; setFeeType(next); if (next === 'custom') { const first = customFeesFor(studentId)[0]; setFeeStructureId(first?.id || ''); if (first) setAmountDue(Number(first.amount)); } else { const due = configuredDue(studentId, next); if (due !== undefined) setAmountDue(Number(due)); } }}
                  className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-lg focus:ring-2 focus:ring-[#0F766E]"
                >
                  <option value="monthly_tuition">Monthly Tuition Fee</option>
                  <option value="annual_registration">Annual Registration Fee</option>
                  <option value="bus">School Bus Transport Fee</option>
                  <option value="custom">Custom Academic / Activity Fee</option>
                </select>
              </div>

              {feeType === 'custom' && (
                <div>
                  <label className="block text-xs font-semibold text-[#475569] mb-1">{t('select_custom_fee')}</label>
                  <select
                    required
                    value={feeStructureId}
                    onChange={e => { setFeeStructureId(e.target.value); const selected = customFeesFor(studentId).find(item => item.id === e.target.value); if (selected) setAmountDue(Number(selected.amount)); }}
                    className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-lg"
                  >
                    <option value="">{t('select_custom_fee')}</option>
                    {customFeesFor(studentId).map(item => <option key={item.id} value={item.id}>{item.name} — {money(item.amount)}</option>)}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#475569] mb-1">Amount Due ({school?.currency || 'ETB'})</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    required
                    value={amountDue}
                    onChange={e => setAmountDue(Number(e.target.value))}
                    className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#475569] mb-1">Cash Paid ({school?.currency || 'ETB'})</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    required
                    value={amountPaid}
                    onChange={e => setAmountPaid(Number(e.target.value))}
                    className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-lg font-mono font-bold text-emerald-700"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Billing Month / Period</label>
                <input
                  type="text"
                  value={month}
                  onChange={e => setMonth(e.target.value)}
                  placeholder="e.g. October 2026"
                  className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Optional Notes</label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Receipt remark..."
                  className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-lg"
                />
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs flex justify-between items-center">
                <span className="text-[#64748B]">Remaining Balance:</span>
                <span className="font-mono font-bold text-rose-700">
                  {money(Math.max(0, amountDue - amountPaid))}
                </span>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRecordModal(false)}
                  className="px-3 py-2 text-xs font-medium text-[#64748B] hover:text-[#132A29]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-[#0F766E] hover:bg-[#0D655E] text-white text-xs font-semibold rounded-lg shadow-sm"
                >
                  {isSubmitting ? 'Recording...' : 'Generate Cash Receipt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* NEW FEE STRUCTURE MODAL */}
      {showStructureModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-[#E2E8F0] max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
              <h2 className="text-base font-bold text-[#132A29]">{editingStructureId ? 'Edit Fee Structure' : 'Configure Class-Range Fee'}</h2>
              <button type="button" onClick={() => setShowStructureModal(false)} className="text-[#94A3B8]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateStructure} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Fee Rule Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Primary Tuition (Grade 1-4)"
                  value={newFeeName}
                  onChange={e => setNewFeeName(e.target.value)}
                  className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Category</label>
                <select
                  value={newFeeType}
                  onChange={e => setNewFeeType(e.target.value as any)}
                  className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-lg"
                >
                  <option value="monthly_tuition">Monthly Tuition</option>
                  <option value="bus">School Bus Transport</option>
                  <option value="annual_registration">Annual Registration</option>
                  <option value="custom">Custom Academic Fee</option>
                </select>
              </div>

              {newFeeType === 'monthly_tuition' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#475569] mb-1">From Grade</label>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={minGrade}
                      onChange={e => setMinGrade(Number(e.target.value))}
                      className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#475569] mb-1">To Grade</label>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={maxGrade}
                      onChange={e => setMaxGrade(Number(e.target.value))}
                      className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-lg"
                    />
                  </div>
                </div>
              )}

              <div>
                  <label className="block text-xs font-semibold text-[#475569] mb-1">Fee Amount ({school?.currency || 'ETB'})</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={structureAmount}
                  onChange={e => setStructureAmount(Number(e.target.value))}
                  className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-lg font-mono font-bold"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowStructureModal(false)}
                  className="px-3 py-2 text-xs text-[#64748B]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#0F766E] text-white text-xs font-semibold rounded-lg"
                >
                  {editingStructureId ? 'Save Changes' : 'Save Fee Structure'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PRINTABLE CASH RECEIPT MODAL */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-[#E2E8F0] max-w-lg w-full p-6 space-y-5 print:shadow-none print:border-none">
            {/* Top Bar for Screen */}
            <div className="flex items-center justify-between no-print border-b border-[#E2E8F0] pb-3">
              <span className="text-xs font-semibold text-[#64748B]">Official Cash Receipt</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void ApiClient.downloadReceiptPdf(selectedReceipt.id)}
                  className="px-3 py-1.5 bg-white text-[#0F766E] border border-teal-200 rounded text-xs font-semibold"
                >
                  Download PDF
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-[#0F766E] text-white rounded text-xs font-semibold flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print / Save PDF
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedReceipt(null)}
                  className="text-[#94A3B8] hover:text-[#132A29]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Printable Receipt Paper Body */}
            <div className="border border-[#CBD5E1] p-6 rounded-lg bg-white space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between border-b border-[#E2E8F0] pb-4">
                <div>
                  <h3 className="text-base font-bold text-[#132A29] uppercase tracking-wide">
                    {school?.name || 'School Name'}
                  </h3>
                  <p className="text-[11px] text-[#64748B]">{school?.address}, {school?.city}</p>
                  <p className="text-[11px] text-[#64748B]">Tel: {school?.phone}</p>
                </div>
                <div className="text-right">
                  <div className="inline-block px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded font-mono font-bold text-xs uppercase">
                    CASH RECEIPT
                  </div>
                  <p className="text-xs font-mono font-semibold text-[#132A29] mt-1">{selectedReceipt.receiptNumber}</p>
                  <p className="text-[11px] text-[#64748B]">Date: {selectedReceipt.date}</p>
                </div>
              </div>

              {/* Student Details */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                {(() => {
                  const std = getStudent(selectedReceipt.studentId);
                  const stdClass = getClass(std?.classId);
                  return (
                    <>
                      <div>
                        <p className="text-[11px] text-[#64748B]">Student Name:</p>
                        <p className="font-bold text-[#132A29]">{std ? `${std.firstName} ${std.middleName} ${std.lastName}` : selectedReceipt.studentId}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-[#64748B]">Student ID / Class:</p>
                        <p className="font-mono font-bold text-[#132A29]">{std?.studentId || 'N/A'} - {stdClass?.name || 'Class'}</p>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Payment Item Breakdown */}
              <table className="w-full min-w-[640px] text-xs text-left border-t border-b border-[#E2E8F0] my-2">
                <thead>
                  <tr className="border-b border-[#E2E8F0] text-[11px] uppercase text-[#64748B]">
                    <th className="py-2">Description</th>
                    <th className="py-2">Period</th>
                    <th className="py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="py-2 capitalize font-semibold">{feeLabel(selectedReceipt)}</td>
                    <td className="py-2 font-mono">{selectedReceipt.month}</td>
                    <td className="py-2 text-right font-mono font-bold">{money(selectedReceipt.amountDue)}</td>
                  </tr>
                </tbody>
              </table>

              {/* Financial Totals */}
              <div className="space-y-1.5 text-xs text-right">
                <div className="flex justify-between text-[#64748B]">
                  <span>Payment Method:</span>
                  <span className="font-semibold text-[#132A29]">Cash Only</span>
                </div>
                <div className="flex justify-between text-[#64748B]">
                  <span>Total Amount Due:</span>
                    <span className="font-mono font-semibold text-[#132A29]">{money(selectedReceipt.amountDue)}</span>
                </div>
                <div className="flex justify-between font-bold text-sm text-emerald-800">
                  <span>Cash Amount Paid:</span>
                    <span className="font-mono">{money(selectedReceipt.amountPaid)}</span>
                </div>
                <div className="flex justify-between text-[#64748B] border-t border-[#E2E8F0] pt-1">
                  <span>Remaining Balance:</span>
                    <span className="font-mono font-bold text-rose-700">{money(selectedReceipt.remainingAmount)}</span>
                </div>
              </div>

              {/* Signatures & Stamp */}
              <div className="grid grid-cols-2 gap-4 pt-6 text-center text-xs">
                <div>
                  <div className="border-b border-dashed border-[#94A3B8] h-8"></div>
                  <p className="text-[11px] text-[#64748B] mt-1 font-medium">Cashier / Accountant</p>
                </div>
                <div>
                  <div className="border-b border-dashed border-[#94A3B8] h-8"></div>
                  <p className="text-[11px] text-[#64748B] mt-1 font-medium">School Official Stamp</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
