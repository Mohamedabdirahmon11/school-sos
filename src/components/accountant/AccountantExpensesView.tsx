import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiClient } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { formatMoney } from '../../lib/money.ts';
import type { SchoolExpense } from '../../types/index.ts';

const categories: Array<{ value: SchoolExpense['category']; label: string }> = [
  { value: 'rent', label: 'Rent' }, { value: 'utilities', label: 'Utilities' },
  { value: 'supplies', label: 'School supplies' }, { value: 'transport', label: 'Transport' },
  { value: 'salaries', label: 'Staff and wages' }, { value: 'maintenance', label: 'Maintenance' },
  { value: 'other', label: 'Other' }
];
const methods: Array<{ value: SchoolExpense['paymentMethod']; label: string }> = [
  { value: 'cash', label: 'Cash' }, { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'mobile_money', label: 'Mobile money' }, { value: 'other', label: 'Other' }
];
const today = () => {
  const date = new Date();
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
};

export const AccountantExpensesView: React.FC = () => {
  const { school } = useAuth();
  const [rows, setRows] = useState<SchoolExpense[]>([]);
  const [cashbookRows, setCashbookRows] = useState<Array<{ id: string; date: string; type: 'income' | 'expense'; description: string; category: string; amount: number; method: string; reference: string; status: 'posted' | 'void' }>>([]);
  const [month, setMonth] = useState(today().slice(0, 7));
  const [monthlySummary, setMonthlySummary] = useState<{ totalIncome: number; incomeCount: number; totalExpenses: number; expenseCount: number; payrollExpenseTotal: number; payrollExpenseCount: number; netCashflow: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [category, setCategory] = useState<SchoolExpense['category']>('supplies');
  const [description, setDescription] = useState('');
  const [vendor, setVendor] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(today);
  const [paymentMethod, setPaymentMethod] = useState<SchoolExpense['paymentMethod']>('cash');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');

  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [result, summary, cashbook] = await Promise.all([ApiClient.getSchoolExpenses(), ApiClient.getMonthlyFinanceSummary(month), ApiClient.getMonthlyCashbook(month)]);
      setRows(Array.isArray(result) ? result : []); setMonthlySummary(summary); setCashbookRows(Array.isArray(cashbook) ? cashbook : []);
    }
    catch (reason: any) { setError(reason?.message || 'Expenses could not be loaded.'); }
    finally { setLoading(false); }
  }, [month]);
  useEffect(() => { void reload(); }, [reload]);

  const posted = useMemo(() => rows.filter(row => row.status === 'posted'), [rows]);
  const total = posted.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const monthTotal = posted.filter(row => row.expenseDate.slice(0, 7) === today().slice(0, 7)).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const visible = [...rows].sort((left, right) => right.expenseDate.localeCompare(left.expenseDate) || right.createdAt.localeCompare(left.createdAt)).filter(row => [row.description, row.vendor, row.reference, row.category].some(value => String(value || '').toLowerCase().includes(search.toLowerCase())));
  const cashbookVisible = cashbookRows.filter(row => [row.description, row.reference, row.category, row.method].some(value => String(value || '').toLowerCase().includes(search.toLowerCase())));
  const exportCashbookCsv = () => {
    const fields = ['Date', 'Type', 'Description', 'Category', 'Amount', 'Currency', 'Method', 'Reference', 'Status'];
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const lines = [fields, ...cashbookVisible.map(row => [row.date, row.type, row.description, row.category, row.amount, school?.currency || 'ETB', row.method, row.reference, row.status])];
    const blob = new Blob(['\uFEFF' + lines.map(line => line.map(escape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = `school-cashbook-${month}.csv`; link.click(); URL.revokeObjectURL(url);
  };
  const money = (value: number) => formatMoney(value, school?.currency);
  const exportCsv = () => {
    const fields = ['Date', 'Description', 'Category', 'Vendor', 'Amount', 'Currency', 'Payment method', 'Reference', 'Status', 'Void reason'];
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const lines = [fields, ...visible.map(row => [row.expenseDate, row.description, row.category, row.vendor, row.amount, school?.currency || 'ETB', row.paymentMethod, row.reference, row.status, row.voidReason])];
    const blob = new Blob(['\uFEFF' + lines.map(line => line.map(escape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = `school-expenses-${month}.csv`; link.click(); URL.revokeObjectURL(url);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError(''); setSuccess('');
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) { setError('Enter an amount greater than zero.'); setSaving(false); return; }
    try {
      await ApiClient.createSchoolExpense({ category, description: description.trim(), vendor: vendor.trim() || undefined, amount: numericAmount, expenseDate, paymentMethod, reference: reference.trim() || undefined, notes: notes.trim() || undefined });
      setDescription(''); setVendor(''); setAmount(''); setReference(''); setNotes('');
      setSuccess('Expense recorded successfully.'); await reload();
    } catch (reason: any) { setError(reason?.message || 'Expense could not be saved.'); }
    finally { setSaving(false); }
  };

  const voidExpense = async (row: SchoolExpense) => {
    const reason = window.prompt('Enter the reason for voiding this expense (at least 5 characters):');
    if (reason === null) return;
    if (reason.trim().length < 5) { setError('A void reason of at least 5 characters is required.'); return; }
    setError('');
    try { await ApiClient.voidSchoolExpense(row.id, reason.trim()); setSuccess('Expense voided. It remains in the audit history.'); await reload(); }
    catch (reason: any) { setError(reason?.message || 'Expense could not be voided.'); }
  };

  return <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
    <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-teal-700">Finance workspace</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-[#132A29]">Expenses & cashbook</h1><p className="mt-1 text-sm text-slate-500">Record school spending and review the expense history. Voided records remain available for audit.</p></div>
      <span className="rounded-full bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800">{school?.currency || 'ETB'} · {school?.name || 'School'}</span>
    </header>

    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
    {success && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</div>}

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-bold text-[#132A29]">Income vs expenses</h2><p className="mt-1 text-xs text-slate-500">Monthly cash movement · voided receipts and expenses are excluded</p></div><label className="text-xs font-semibold text-slate-600">Reporting month<input type="month" value={month} onChange={event => setMonth(event.target.value)} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-emerald-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-emerald-800">Fee income</p><p className="mt-1 text-lg font-bold text-emerald-950">{money(Number(monthlySummary?.totalIncome) || 0)}</p><p className="text-[10px] text-emerald-800">{monthlySummary?.incomeCount || 0} receipts</p></div><div className="rounded-xl bg-amber-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-amber-800">Expenses</p><p className="mt-1 text-lg font-bold text-amber-950">{money(Number(monthlySummary?.totalExpenses) || 0)}</p><p className="text-[10px] text-amber-800">{monthlySummary?.expenseCount || 0} entries · payroll {money(Number(monthlySummary?.payrollExpenseTotal) || 0)}</p></div><div className="rounded-xl bg-slate-100 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-600">Net cash movement</p><p className={`mt-1 text-lg font-bold ${(monthlySummary?.netCashflow || 0) >= 0 ? 'text-slate-950' : 'text-rose-700'}`}>{money(Number(monthlySummary?.netCashflow) || 0)}</p><p className="text-[10px] text-slate-500">Income minus expenses</p></div></div>
    </section>

    <section className="grid gap-3 sm:grid-cols-3">
      <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total posted expenses</p><p className="mt-2 text-2xl font-bold text-slate-900">{money(total)}</p><p className="mt-1 text-xs text-slate-500">{posted.length} active records</p></article>
      <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">This month</p><p className="mt-2 text-2xl font-bold text-slate-900">{money(monthTotal)}</p><p className="mt-1 text-xs text-slate-500">Based on expense date</p></article>
      <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Voided entries</p><p className="mt-2 text-2xl font-bold text-slate-900">{rows.length - posted.length}</p><p className="mt-1 text-xs text-slate-500">Excluded from totals</p></article>
    </section>

    <section className="grid gap-5 xl:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.5fr)]">
      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div><h2 className="text-base font-bold text-[#132A29]">Record an expense</h2><p className="mt-1 text-xs text-slate-500">Fields marked required must be completed.</p></div>
        <label className="block text-xs font-semibold text-slate-700">Category<select required value={category} onChange={event => setCategory(event.target.value as SchoolExpense['category'])} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">{categories.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label className="block text-xs font-semibold text-slate-700">Description<input required minLength={2} maxLength={500} value={description} onChange={event => setDescription(event.target.value)} placeholder="e.g. Electricity bill for November" className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold text-slate-700">Amount ({school?.currency || 'ETB'})<input required type="number" min="0.01" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00" className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" /></label>
          <label className="block text-xs font-semibold text-slate-700">Expense date<input required type="date" value={expenseDate} onChange={event => setExpenseDate(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" /></label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold text-slate-700">Payment method<select value={paymentMethod} onChange={event => setPaymentMethod(event.target.value as SchoolExpense['paymentMethod'])} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">{methods.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className="block text-xs font-semibold text-slate-700">Vendor / payee<input maxLength={160} value={vendor} onChange={event => setVendor(event.target.value)} placeholder="Optional" className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" /></label>
        </div>
        <label className="block text-xs font-semibold text-slate-700">Reference / receipt no.<input maxLength={120} value={reference} onChange={event => setReference(event.target.value)} placeholder="Optional reference" className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" /></label>
        <label className="block text-xs font-semibold text-slate-700">Notes<textarea maxLength={1000} rows={2} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Additional details (optional)" className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" /></label>
        <button disabled={saving} className="w-full rounded-xl bg-[#0F766E] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#115E59] disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Saving expense…' : 'Save expense'}</button>
      </form>

      <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-base font-bold text-[#132A29]">Expense history</h2><p className="mt-1 text-xs text-slate-500">School-scoped records · posted and voided</p></div><div className="flex gap-2"><input aria-label="Search expenses" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search expenses…" className="min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-xs"/><button type="button" onClick={exportCsv} disabled={!visible.length} className="rounded-lg border border-teal-200 px-3 py-2 text-xs font-semibold text-teal-800 disabled:opacity-40">Export CSV</button><button type="button" onClick={() => void reload()} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">Refresh</button></div></div>
        {loading ? <p className="p-6 text-sm text-slate-500">Loading expenses…</p> : !visible.length ? <div className="p-8 text-center"><p className="text-sm font-semibold text-slate-700">No expenses recorded</p><p className="mt-1 text-xs text-slate-500">New entries will appear here after they are saved.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="p-3">Date / description</th><th className="p-3">Category</th><th className="p-3">Payee / method</th><th className="p-3 text-right">Amount</th><th className="p-3">Status</th><th className="p-3"></th></tr></thead><tbody className="divide-y divide-slate-100">{visible.map(row => <tr key={row.id} className="hover:bg-slate-50/80"><td className="p-3"><p className="font-semibold text-slate-800">{row.description}</p><p className="mt-1 text-[10px] text-slate-500">{row.expenseDate}{row.reference ? ` · Ref ${row.reference}` : ''}</p></td><td className="p-3 capitalize text-slate-600">{row.category.replace(/_/g, ' ')}</td><td className="p-3 text-slate-600">{row.vendor || '—'}<p className="mt-1 capitalize text-[10px] text-slate-400">{row.paymentMethod.replace(/_/g, ' ')}</p></td><td className="p-3 text-right font-bold tabular-nums text-slate-900">{money(Number(row.amount) || 0)}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${row.status === 'posted' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{row.status}</span></td><td className="p-3 text-right">{row.status === 'posted' && <button type="button" onClick={() => void voidExpense(row)} className="rounded-lg border border-rose-200 px-2 py-1 text-[10px] font-semibold text-rose-700 hover:bg-rose-50">Void</button>}</td></tr>)}</tbody></table></div>}
      </section>
    </section>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-base font-bold text-[#132A29]">Monthly cashbook</h2><p className="mt-1 text-xs text-slate-500">Income and expenses in one chronological ledger for {month}</p></div><button type="button" onClick={exportCashbookCsv} disabled={!cashbookVisible.length} className="w-fit rounded-lg border border-teal-200 px-3 py-2 text-xs font-semibold text-teal-800 disabled:opacity-40">Export cashbook CSV</button></div>
      {loading ? <p className="p-6 text-sm text-slate-500">Loading cashbook…</p> : !cashbookVisible.length ? <p className="p-8 text-center text-sm text-slate-500">No income or expense entries for this month.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="p-3">Date / details</th><th className="p-3">Type</th><th className="p-3">Category / method</th><th className="p-3">Reference</th><th className="p-3 text-right">Amount</th><th className="p-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{cashbookVisible.map(row => <tr key={row.id} className="hover:bg-slate-50/80"><td className="p-3 font-semibold text-slate-800">{row.description}<p className="mt-1 text-[10px] font-normal text-slate-500">{row.date}</p></td><td className="p-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${row.type === 'income' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{row.type}</span></td><td className="p-3 capitalize text-slate-600">{row.category.replace(/_/g, ' ')}<p className="mt-1 text-[10px] text-slate-400">{row.method.replace(/_/g, ' ')}</p></td><td className="p-3 text-slate-500">{row.reference || '—'}</td><td className={`p-3 text-right font-bold tabular-nums ${row.type === 'income' ? 'text-emerald-700' : 'text-amber-800'}`}>{row.type === 'income' ? '+' : '−'}{money(Number(row.amount) || 0)}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${row.status === 'posted' ? 'bg-slate-100 text-slate-700' : 'bg-rose-50 text-rose-700'}`}>{row.status}</span></td></tr>)}</tbody></table></div>}
    </section>
  </div>;
};
