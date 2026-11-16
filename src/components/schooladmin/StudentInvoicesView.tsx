import React, { useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useApi } from '../../hooks/useApi.ts';
import { ApiClient } from '../../services/api.ts';
import { formatMoney } from '../../lib/money.ts';
import { ErrorState } from '../common/ErrorState.tsx';
import { Download, FileText, Plus, Search, Wallet, X } from 'lucide-react';

const today = () => new Date().toISOString().slice(0, 10);
const currentPeriod = () => new Date().toISOString().slice(0, 7);
const formatPeriod = (value: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? new Date(value + '-01T00:00:00.000Z').toLocaleDateString('en', { month: 'long', year: 'numeric' }) : value;

export const StudentInvoicesView: React.FC = () => {
  const { school, user, isReadOnly } = useAuth();
  const load = useApi(() => Promise.all([
    ApiClient.getStudentInvoices(),
    ApiClient.getAllStudents(),
    ApiClient.getClasses()
  ]), [school?.id], Boolean(school));
  const [invoices = [], students = [], classes = []] = load.data || [];
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [showGenerate, setShowGenerate] = useState(false);
  const [classId, setClassId] = useState('');
  const [period, setPeriod] = useState(currentPeriod());
  const [dueDate, setDueDate] = useState(today());
  const [includeAnnual, setIncludeAnnual] = useState(false);
  const [includeOneTime, setIncludeOneTime] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [lastReceiptId, setLastReceiptId] = useState<string | null>(null);
  const [paying, setPaying] = useState<any>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'Cash' | 'Bank Transfer' | 'Mobile Money'>('Cash');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [confirmedReceived, setConfirmedReceived] = useState(false);
  const paymentKeyRef = useRef<string | null>(null);

  const studentName = (id: string) => {
    const student = students.find((item: any) => item.id === id);
    return student ? [student.firstName, student.middleName, student.lastName].filter(Boolean).join(' ') : id;
  };
  const money = (value: number, currency?: string) => formatMoney(Number(value) || 0, currency || school?.currency);
  const filtered = useMemo(() => invoices.filter((invoice: any) => {
    const query = search.trim().toLowerCase();
    const due = Number(invoice.balance_due) > 0 && invoice.due_date < today();
    const effectiveStatus = due ? 'overdue' : invoice.status;
    return (!query || [invoice.invoice_number, invoice.billing_period, studentName(invoice.student_id)].join(' ').toLowerCase().includes(query))
      && (status === 'all' || effectiveStatus === status);
  }), [invoices, search, status, students]);

  const generate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!classId || !period.trim() || !dueDate || isReadOnly) return;
    setBusy(true);
    try {
      const result = await ApiClient.generateStudentInvoices({
        classId, billingPeriod: period.trim(), dueDate,
        includeAnnualRegistration: includeAnnual,
        includeOneTimeFees: includeOneTime
      });
      setLastReceiptId(null);
      setNotice(`Created ${result.generatedCount} invoices. ${result.skippedExisting} duplicates and ${result.skippedNoFees} students without configured fees were skipped.`);
      setShowGenerate(false);
      await load.retry();
    } catch (error: any) {
      setNotice(error.message || 'Invoices could not be generated.');
    } finally {
      setBusy(false);
    }
  };

  const submitPayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!paying || isReadOnly || !confirmedReceived) return;
    setBusy(true);
    try {
      paymentKeyRef.current ||= globalThis.crypto?.randomUUID?.() || `invpay-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const result = await ApiClient.payStudentInvoice(paying.id, {
        amount: Number(payAmount), paymentMethod: payMethod, notes: paymentNotes.trim() || undefined,
        confirmedReceived, idempotencyKey: paymentKeyRef.current
      });
      setLastReceiptId(result.payment.id);
      setNotice(`Payment recorded by the school. Receipt ${result.payment.receiptNumber}.`);
      setPaying(null);
      setPayAmount('');
      setPaymentNotes('');
      setConfirmedReceived(false);
      paymentKeyRef.current = null;
      await load.retry();
    } catch (error: any) {
      setNotice(error.message || 'Payment could not be recorded.');
    } finally {
      setBusy(false);
    }
  };

  if (load.error) return <ErrorState error={load.error} onRetry={load.retry} />;

  return <div className="mx-auto w-full max-w-[1600px] space-y-6 p-5 md:p-8">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><FileText className="h-6 w-6 text-teal-700" /> Student Invoices</h1>
        <p className="mt-1 text-sm text-slate-500">Create class invoices, track balances and collect payments.</p>
      </div>
      {['school_admin','accountant','super_admin'].includes(user?.role || '') && <button type="button" disabled={isReadOnly} onClick={() => setShowGenerate(true)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"><Plus size={16}/> Generate invoices</button>}
    </header>

    {notice && <div role="status" className="flex items-center justify-between gap-3 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900"><span>{notice}</span><div className="flex shrink-0 items-center gap-2">{lastReceiptId && <button type="button" onClick={() => void ApiClient.downloadReceiptPdf(lastReceiptId)} className="font-semibold underline">Download receipt</button>}<button onClick={() => {setNotice('');setLastReceiptId(null);}} aria-label="Dismiss"><X size={16}/></button></div></div>}

    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold uppercase text-slate-500">Invoices</p><p className="mt-2 text-2xl font-bold">{invoices.length}</p></div>
      <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold uppercase text-slate-500">Outstanding</p><p className="mt-2 text-2xl font-bold text-amber-700">{money(invoices.reduce((sum: number,row: any)=>sum+Number(row.balance_due||0),0))}</p></div>
      <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold uppercase text-slate-500">Collected against invoices</p><p className="mt-2 text-2xl font-bold text-emerald-700">{money(invoices.reduce((sum: number,row: any)=>sum+Number(row.amount_paid||0),0))}</p></div>
    </div>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400"/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search invoice or student" className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm"/></div>
        <select value={status} onChange={event=>setStatus(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="all">All statuses</option><option value="issued">Unpaid</option><option value="partially_paid">Partially paid</option><option value="paid">Paid</option><option value="overdue">Overdue</option><option value="void">Void</option></select>
      </div>
      {load.loading ? <p className="p-8 text-center text-sm text-slate-500">Loading invoices…</p> : filtered.length===0 ? <p className="p-10 text-center text-sm text-slate-500">No invoices found. Configure fee structures, then generate invoices for a class.</p> :
        <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Invoice</th><th className="p-3">Student</th><th className="p-3">Period</th><th className="p-3">Due date</th><th className="p-3 text-right">Total</th><th className="p-3 text-right">Paid</th><th className="p-3 text-right">Balance</th><th className="p-3">Status</th><th className="p-3 text-right">Actions</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{filtered.map((invoice:any)=>{
            const overdue=Number(invoice.balance_due)>0&&invoice.due_date<today();
            const shownStatus=overdue?'overdue':invoice.status;
            const badge=shownStatus==='paid'?'bg-emerald-100 text-emerald-800':shownStatus==='overdue'?'bg-red-100 text-red-800':shownStatus==='partially_paid'?'bg-amber-100 text-amber-800':'bg-slate-100 text-slate-700';
            return <tr key={invoice.id} className="hover:bg-slate-50">
              <td className="p-3 font-mono text-xs font-semibold">{invoice.invoice_number}</td><td className="p-3 font-medium">{studentName(invoice.student_id)}</td><td className="p-3">{formatPeriod(invoice.billing_period)}</td><td className="p-3">{invoice.due_date}</td>
              <td className="p-3 text-right tabular-nums">{money(invoice.total_amount,invoice.currency)}</td><td className="p-3 text-right tabular-nums">{money(invoice.amount_paid,invoice.currency)}</td><td className="p-3 text-right font-semibold tabular-nums">{money(invoice.balance_due,invoice.currency)}</td>
              <td className="p-3"><span className={`rounded-full px-2 py-1 text-[11px] font-bold ${badge}`}>{shownStatus.replace('_',' ')}</span></td>
              <td className="p-3"><div className="flex justify-end gap-2">
                <button type="button" title="Download PDF" onClick={()=>void ApiClient.downloadStudentInvoicePdf(invoice.id)} className="rounded-md border border-slate-200 p-2 text-slate-600 hover:bg-slate-100"><Download size={15}/></button>
                {Number(invoice.balance_due)>0&&['school_admin','accountant','super_admin'].includes(user?.role||'')&&<button type="button" onClick={()=>{paymentKeyRef.current=null;setPaying(invoice);setPayAmount(String(invoice.balance_due));setPaymentNotes('');setConfirmedReceived(false);}} disabled={isReadOnly} className="inline-flex items-center gap-1 rounded-md bg-teal-700 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"><Wallet size={14}/> Record payment</button>}
              </div></td>
            </tr>;
          })}</tbody>
        </table></div>}
    </section>

    {showGenerate&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><form onSubmit={generate} className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-2xl">
      <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Generate class invoices</h2><button type="button" onClick={()=>setShowGenerate(false)} aria-label="Close"><X size={19}/></button></div>
      <p className="text-sm text-slate-500">One invoice per active student. Existing invoices for the same period are skipped.</p>
      <label className="block text-sm font-medium">Class<select required value={classId} onChange={event=>setClassId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"><option value="">Select class</option>{classes.map((item:any)=><option key={item.id} value={item.id}>{item.name} {item.section||''}</option>)}</select></label>
      <label className="block text-sm font-medium">Billing period<input required type="month" value={period} onChange={event=>setPeriod(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"/></label>
      <label className="block text-sm font-medium">Payment due date<input required type="date" min={today()} value={dueDate} onChange={event=>setDueDate(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"/></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeAnnual} onChange={event=>setIncludeAnnual(event.target.checked)}/> Include annual registration and annual custom fees</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeOneTime} onChange={event=>setIncludeOneTime(event.target.checked)}/> Include one-time custom fees</label>
      <div className="flex justify-end gap-2 border-t pt-4"><button type="button" onClick={()=>setShowGenerate(false)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button><button disabled={busy} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy?'Generating…':'Generate invoices'}</button></div>
    </form></div>}

    {paying&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><form onSubmit={submitPayment} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl">
      <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Confirm payment received</h2><button type="button" onClick={()=>setPaying(null)} aria-label="Close"><X size={19}/></button></div>
      <p className="text-sm text-slate-600">{paying.invoice_number} · Balance due: {money(paying.balance_due,paying.currency)}</p>
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Only use this form after the school has actually received the money or independently verified the transfer. This app does not collect or process online payments.</div>
      <label className="block text-sm font-medium">Amount received<input required type="number" min="0.01" max={paying.balance_due} step="0.01" value={payAmount} onChange={event=>setPayAmount(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"/></label>
      <label className="block text-sm font-medium">Payment method<select value={payMethod} onChange={event=>setPayMethod(event.target.value as any)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"><option>Cash</option><option>Bank Transfer</option><option>Mobile Money</option></select></label>
      <label className="block text-sm font-medium">Reference / notes (optional)<input value={paymentNotes} onChange={event=>setPaymentNotes(event.target.value)} maxLength={1000} placeholder="e.g. bank reference or who confirmed it" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"/></label>
      <label className="flex items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm"><input type="checkbox" checked={confirmedReceived} onChange={event=>setConfirmedReceived(event.target.checked)} className="mt-0.5"/><span>I confirm that the school has received this payment or verified the transfer.</span></label>
      <div className="flex justify-end gap-2 border-t pt-4"><button type="button" onClick={()=>setPaying(null)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button><button disabled={busy} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy?'Saving…':'Confirm received & issue receipt'}</button></div>
    </form></div>}
  </div>;
};
