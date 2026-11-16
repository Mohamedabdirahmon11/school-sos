import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiClient } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { formatMoney } from '../../lib/money.ts';
import { getSchoolLocalDate } from '../../lib/school-local-date.ts';
import { StaffPayrollRecord } from '../../types/index.ts';

type PayrollStaff = { id: string; staffId: string; userId?: string; name: string; monthlySalary: number; roleTitle?: string };
type PaymentMethod = 'cash' | 'bank_transfer' | 'mobile_money' | 'other';

export const AccountantPayrollView: React.FC = () => {
  const { school, t } = useAuth();
  const schoolToday = getSchoolLocalDate(new Date(), school?.timezone);
  const [month, setMonth] = useState(schoolToday.slice(0, 7));
  const [staff, setStaff] = useState<PayrollStaff[]>([]);
  const [records, setRecords] = useState<StaffPayrollRecord[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [salaryOverrides, setSalaryOverrides] = useState<Record<string, number>>({});
  const [allowanceOverrides, setAllowanceOverrides] = useState<Record<string, number>>({});
  const [deductionOverrides, setDeductionOverrides] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [staffSearch, setStaffSearch] = useState('');
  const [transitioningId, setTransitioningId] = useState<string | null>(null);
  const [paymentRecord, setPaymentRecord] = useState<StaffPayrollRecord | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [paymentDate, setPaymentDate] = useState(schoolToday);
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [staffRows, payrollRows] = await Promise.all([ApiClient.getPayrollStaff(), ApiClient.getAllPayrollRecords(month)]);
      setStaff(Array.isArray(staffRows) ? staffRows : []);
      setRecords(Array.isArray(payrollRows) ? payrollRows : []);
    } catch (reason: any) {
      setError(reason?.message || t('payroll_error'));
    } finally { setLoading(false); }
  }, [month, t]);
  useEffect(() => { void reload(); }, [reload]);

  const available = useMemo(() => staff.filter(employee => !records.some(record => record.userId === employee.userId)), [staff, records]);
  const summary = useMemo(() => {
    const statusSummary = (status: StaffPayrollRecord['status']) => {
      const rows = records.filter(record => record.status === status);
      return { count: rows.length, net: rows.reduce((sum, record) => sum + (Number(record.netSalary) || 0), 0) };
    };
    return {
      draft: statusSummary('draft'),
      approved: statusSummary('approved'),
      partially_paid: statusSummary('partially_paid'),
      paid: statusSummary('paid'),
      total: records.reduce((sum, record) => sum + (Number(record.netSalary) || 0), 0),
      paidTotal: records.reduce((sum, record) => sum + (Number(record.paidAmount ?? (record.status === 'paid' ? record.netSalary : 0)) || 0), 0),
      balance: records.reduce((sum, record) => sum + (Number(record.balanceDue ?? (record.netSalary - (record.paidAmount || 0))) || 0), 0)
    };
  }, [records]);
  const visibleAvailable = useMemo(() => available.filter(employee => `${employee.name} ${employee.staffId} ${employee.roleTitle || ''}`.toLowerCase().includes(staffSearch.toLowerCase())), [available, staffSearch]);
  const money = (amount: number) => formatMoney(Number(amount) || 0, school?.currency);
  const statusText = (status: StaffPayrollRecord['status']) => status === 'draft' ? t('payroll_draft') : status === 'approved' ? t('payroll_approved') : status === 'partially_paid' ? 'Partially paid' : t('payroll_paid');

  const createDraft = async () => {
    setSaving(true); setError('');
    try {
      await ApiClient.createPayrollDraft(month, selected.map(staffId => {
        const allowance = allowanceOverrides[staffId] || 0;
        const deduction = deductionOverrides[staffId] || 0;
        return {
          staffId,
          baseSalary: salaryOverrides[staffId] ?? staff.find(employee => employee.id === staffId)?.monthlySalary ?? 0,
          allowances: allowance > 0 ? [{ label: t('payroll_allowance'), amount: allowance }] : [],
          deductions: deduction > 0 ? [{ label: t('payroll_deduction'), amount: deduction }] : []
        };
      }));
      setSelected([]); setSalaryOverrides({}); setAllowanceOverrides({}); setDeductionOverrides({}); await reload();
    } catch (reason: any) { setError(reason?.message || t('payroll_error')); }
    finally { setSaving(false); }
  };

  const transition = async (record: StaffPayrollRecord) => {
    setError(''); setTransitioningId(record.id);
    try { await ApiClient.approvePayroll(record.id); await reload(); }
    catch (reason: any) { setError(reason?.message || t('payroll_error')); }
    finally { setTransitioningId(null); }
  };

  const openPayment = (record: StaffPayrollRecord) => {
    const due = Number(record.balanceDue ?? (record.netSalary - (record.paidAmount || 0)));
    setPaymentRecord(record); setPaymentAmount(String(due)); setPaymentMethod('cash'); setPaymentDate(schoolToday); setPaymentReference(''); setPaymentNotes('');
  };
  const submitPayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!paymentRecord || saving) return;
    setSaving(true); setError('');
    try {
      await ApiClient.payPayroll(paymentRecord.id, {
        amount: Number(paymentAmount), paymentMethod, paymentDate,
        reference: paymentReference.trim() || undefined, notes: paymentNotes.trim() || undefined
      });
      setPaymentRecord(null); await reload();
    } catch (reason: any) { setError(reason?.message || t('payroll_error')); }
    finally { setSaving(false); }
  };

  return <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">
    <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
      <div><h1 className="text-xl md:text-2xl font-bold text-[#132A29]">{t('payroll_management')}</h1><p className="text-sm text-slate-500 mt-1">Teachers, school administrators, accountants and all active staff.</p></div>
      <label className="text-xs font-semibold text-[#475569]">{t('payroll_month')}
        <input type="month" value={month} onChange={event => setMonth(event.target.value)} className="ml-2 px-3 py-2 border border-[#CBD5E1] rounded-lg" />
      </label>
    </header>

    {error && <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-800">{error}</div>}

    <section aria-label={t('payroll_summary')} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {[
        { label: 'Total payroll', value: money(summary.total) },
        { label: 'Paid so far', value: money(summary.paidTotal) },
        { label: 'Still owed', value: money(summary.balance) },
        { label: 'Staff records', value: String(records.length) }
      ].map(item => <div key={item.label} className="bg-white border border-[#E2E8F0] rounded-xl p-4"><p className="text-xs text-slate-500">{item.label}</p><p className="mt-1 font-bold text-lg text-[#132A29]">{item.value}</p></div>)}
    </section>
    <section className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
      {(['draft', 'approved', 'partially_paid', 'paid'] as const).map(status => <div key={status} className="rounded-lg border border-slate-200 bg-white px-3 py-2"><span className="text-slate-500">{statusText(status)}</span><strong className="block mt-1 text-base">{summary[status].count} · {money(summary[status].net)}</strong></div>)}
    </section>

    <section className="bg-white rounded-xl border border-[#E2E8F0] p-4 md:p-5 space-y-4">
      <h2 className="font-bold text-sm text-[#132A29]">{t('payroll_create')}</h2>
      <div className="grid md:grid-cols-2 gap-4">
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-[#475569] mb-2">{t('payroll_staff_member')}</legend>
          <input aria-label="Search payroll staff" value={staffSearch} onChange={event => setStaffSearch(event.target.value)} placeholder="Search name, staff ID or role…" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs" />
          {visibleAvailable.map(employee => <div key={employee.id} className="flex flex-col gap-2 text-sm p-2 rounded-lg hover:bg-slate-50 border-b border-slate-100">
            <label className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2"><input type="checkbox" checked={selected.includes(employee.id)} onChange={event => setSelected(current => event.target.checked ? [...current, employee.id] : current.filter(id => id !== employee.id))} /><span className="truncate">{employee.name} · {employee.staffId}<small className="block text-slate-500">{employee.roleTitle || 'Staff'}</small></span></span>
              <span className="shrink-0 text-xs text-slate-600">{money(salaryOverrides[employee.id] ?? employee.monthlySalary)}</span>
            </label>
            {selected.includes(employee.id) && <div className="grid grid-cols-3 gap-2 pl-6">
              <label className="text-[11px] text-slate-500">Base salary<input type="number" min="0" step="0.01" value={salaryOverrides[employee.id] ?? employee.monthlySalary} onChange={event => setSalaryOverrides(current => ({ ...current, [employee.id]: Number(event.target.value) }))} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2" /></label>
              <label className="text-[11px] text-slate-500">Allowance<input type="number" min="0" step="0.01" value={allowanceOverrides[employee.id] ?? 0} onChange={event => setAllowanceOverrides(current => ({ ...current, [employee.id]: Number(event.target.value) }))} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2" /></label>
              <label className="text-[11px] text-slate-500">Deduction<input type="number" min="0" step="0.01" value={deductionOverrides[employee.id] ?? 0} onChange={event => setDeductionOverrides(current => ({ ...current, [employee.id]: Number(event.target.value) }))} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2" /></label>
            </div>}
          </div>)}
          {!available.length && <p className="text-sm text-slate-500">{t('payroll_empty')}</p>}
          {available.length > 0 && !visibleAvailable.length && <p className="text-xs text-slate-500">No staff match that search.</p>}
        </fieldset>
        <div className="flex flex-col gap-3 content-start">
          <p className="text-xs text-slate-500">For each selected employee, enter their own base salary, allowance and deduction. These amounts are saved separately in that employee's monthly payroll record.</p>
          <button type="button" disabled={!selected.length || saving || loading} onClick={() => void createDraft()} className="px-4 py-2 bg-[#0F766E] disabled:opacity-50 text-white rounded-lg text-sm font-semibold">{saving ? t('payroll_loading') : t('payroll_create')}</button>
        </div>
      </div>
    </section>

    <section className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
      {loading ? <p className="p-5 text-sm text-slate-500">{t('payroll_loading')}</p> : !records.length ? <p className="p-5 text-sm text-slate-500">{t('payroll_empty')}</p> :
        <div className="overflow-x-auto"><table className="w-full text-left text-xs">
          <thead className="bg-[#F8FAFC] text-[#64748B] uppercase"><tr>
            <th className="p-3">{t('payroll_staff_member')}</th><th className="p-3">{t('payroll_salary')}</th><th className="p-3">{t('payroll_allowance')}</th><th className="p-3">{t('payroll_deduction')}</th><th className="p-3">{t('payroll_net')}</th><th className="p-3">Paid</th><th className="p-3">Balance</th><th className="p-3">{t('payroll_status')}</th><th className="p-3"></th>
          </tr></thead><tbody className="divide-y divide-slate-100">{records.map(record => {
            const paid = Number(record.paidAmount ?? (record.status === 'paid' ? record.netSalary : 0));
            const due = Number(record.balanceDue ?? (record.netSalary - paid));
            return <tr key={record.id}>
              <td className="p-3 font-semibold">{record.staffName}</td><td className="p-3">{money(record.baseSalary)}</td><td className="p-3">{money(record.allowanceTotal)}</td><td className="p-3">{money(record.deductionTotal)}</td><td className="p-3 font-bold">{money(record.netSalary)}</td><td className="p-3 text-emerald-700">{money(paid)}</td><td className="p-3 text-amber-700">{money(due)}</td><td className="p-3">{statusText(record.status)}{Array.isArray(record.paymentHistory) && record.paymentHistory.length > 0 && <div className="mt-1 space-y-1">{record.paymentHistory.map(payment => <small key={payment.id} className="block text-slate-500">{payment.paymentDate} · {money(payment.amount)} · {payment.paymentMethod}{payment.reference ? ` · ${payment.reference}` : ''}</small>)}</div>}</td>
              <td className="p-3"><div className="flex justify-end gap-2">{record.status === 'draft' && <button type="button" disabled={transitioningId !== null} onClick={() => void transition(record)} className="px-2 py-1 text-teal-800 border border-teal-200 rounded">{t('payroll_approve')}</button>}{(record.status === 'approved' || record.status === 'partially_paid') && due > 0 && <button type="button" disabled={transitioningId !== null} onClick={() => openPayment(record)} className="px-2 py-1 text-teal-800 border border-teal-200 rounded">Record payment</button>}<button type="button" onClick={() => void ApiClient.downloadPayslipPdf(record.id)} className="px-2 py-1 text-slate-700 border border-slate-200 rounded">{t('payroll_payslip')}</button></div></td>
            </tr>;
          })}</tbody>
        </table></div>}
    </section>

    {paymentRecord && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation">
      <form onSubmit={submitPayment} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl space-y-4" role="dialog" aria-modal="true" aria-labelledby="payroll-payment-title">
        <div><h2 id="payroll-payment-title" className="text-lg font-bold text-slate-900">Record salary payment</h2><p className="text-sm text-slate-500">{paymentRecord.staffName} · {paymentRecord.payrollMonth}</p></div>
        <div className="grid grid-cols-2 gap-3 text-sm"><div className="rounded-lg bg-slate-50 p-3"><span className="text-xs text-slate-500">Total salary</span><strong className="block">{money(paymentRecord.netSalary)}</strong></div><div className="rounded-lg bg-amber-50 p-3"><span className="text-xs text-slate-500">Outstanding</span><strong className="block">{money(Number(paymentRecord.balanceDue ?? paymentRecord.netSalary - (paymentRecord.paidAmount || 0)))}</strong></div></div>
        <label className="block text-xs font-semibold text-slate-600">Amount paid ({school?.currency || 'ETB'})<input required type="number" min="0.01" max={Number(paymentRecord.balanceDue ?? paymentRecord.netSalary - (paymentRecord.paidAmount || 0))} step="0.01" value={paymentAmount} onChange={event => setPaymentAmount(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-semibold text-slate-600">Payment method<select value={paymentMethod} onChange={event => setPaymentMethod(event.target.value as PaymentMethod)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="mobile_money">Mobile money</option><option value="other">Other</option></select></label>
          <label className="text-xs font-semibold text-slate-600">Payment date<input required type="date" value={paymentDate} onChange={event => setPaymentDate(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
        </div>
        <label className="block text-xs font-semibold text-slate-600">Transaction / receipt reference (optional)<input value={paymentReference} onChange={event => setPaymentReference(event.target.value)} maxLength={120} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
        <label className="block text-xs font-semibold text-slate-600">Notes (optional)<textarea value={paymentNotes} onChange={event => setPaymentNotes(event.target.value)} maxLength={500} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
        <p className="text-xs text-amber-700">Only record a payment after the cash or transfer has actually been received/verified.</p>
        <div className="flex justify-end gap-2"><button type="button" onClick={() => setPaymentRecord(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancel</button><button type="submit" disabled={saving || !Number(paymentAmount) || Number(paymentAmount) <= 0} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save payment'}</button></div>
      </form>
    </div>}
  </div>;
};

export const StaffPayslipsView: React.FC = () => {
  const { school, t } = useAuth();
  const [records, setRecords] = useState<StaffPayrollRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    ApiClient.getMyPayslips()
      .then(rows => { if (!cancelled) setRecords(Array.isArray(rows) ? rows : []); })
      .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : t('payroll_error')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reloadKey, t]);

  return (
    <div className="mx-auto max-w-[1680px] space-y-5 p-3 sm:p-5 lg:p-7">
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#102f2d] via-[#164b46] to-[#0f766e] p-5 text-white shadow-lg sm:p-7">
        <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full border-[28px] border-white/5" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-teal-100">Staff workspace · Payroll</p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t('payroll_payslip')}</h1>
            <p className="mt-1 text-sm text-teal-100/90">Your personal monthly pay statements and downloadable records.</p>
          </div>
          <span className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold backdrop-blur">{records.length} statement(s)</span>
        </div>
      </header>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <span>{error}</span>
          <button type="button" onClick={() => setReloadKey(value => value + 1)} className="rounded-xl border border-rose-300 bg-white px-3 py-2 text-xs font-semibold">Retry</button>
        </div>
      )}

      {loading ? (
        <div aria-label={t('payroll_loading')} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map(item => <div key={item} className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white" />)}
        </div>
      ) : error ? null : records.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center shadow-sm">
          <p className="text-base font-bold text-slate-800">{t('payroll_empty')}</p>
          <p className="mt-2 text-sm text-slate-500">When payroll is published for your account, your statement will appear here.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {records.map(record => (
            <article key={record.id} className="flex flex-col justify-between gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Payroll period</p>
                <h2 className="mt-2 text-lg font-bold text-slate-900">{record.payrollMonth}</h2>
                <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Net salary</p>
                <p className="mt-1 text-2xl font-bold tracking-tight text-teal-800">{formatMoney(record.netSalary, school?.currency)}</p>
                <p className="mt-2 text-xs text-slate-500">Paid: {formatMoney(record.paidAmount ?? (record.status === 'paid' ? record.netSalary : 0), school?.currency)} · Remaining: {formatMoney(record.balanceDue ?? (record.netSalary - (record.paidAmount || 0)), school?.currency)}</p>
                <p className="mt-1 text-xs font-semibold text-slate-600">Status: {record.status === 'partially_paid' ? 'Partially paid' : record.status}</p>
              </div>
              <button type="button" onClick={() => void ApiClient.downloadPayslipPdf(record.id)} className="inline-flex w-full items-center justify-center rounded-xl border border-teal-200 bg-teal-50 px-4 py-2.5 text-sm font-semibold text-teal-800 transition hover:bg-teal-100">{t('payroll_payslip')}</button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
