import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiClient } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { formatMoney } from '../../lib/money.ts';
import type { BankStatementEntry, FeePayment, SchoolExpense } from '../../types/index.ts';

type ReconciliationData = { entries: BankStatementEntry[]; unmatchedPayments: FeePayment[]; unmatchedExpenses: SchoolExpense[] };

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const AccountantBankReconciliationView: React.FC = () => {
  const { school } = useAuth();
  const [data, setData] = useState<ReconciliationData>({ entries: [], unmatchedPayments: [], unmatchedExpenses: [] });
  const [statementDate, setStatementDate] = useState(today());
  const [description, setDescription] = useState('');
  const [direction, setDirection] = useState<'credit' | 'debit'>('credit');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [bankAccountLabel, setBankAccountLabel] = useState('');
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setData(await ApiClient.getBankReconciliation()); }
    catch (e: any) { setError(e?.message || 'Unable to load bank reconciliation.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void reload(); }, [reload, school?.id]);

  const unmatched = useMemo(() => data.entries.filter(entry => !entry.matchedAt), [data.entries]);
  const matchedCount = data.entries.length - unmatched.length;
  const money = (value: number) => formatMoney(value, school?.currency);

  const addStatementLine = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true); setError(''); setNotice('');
    try {
      await ApiClient.createBankStatementEntry({
        statementDate, description, direction, amount: Number(amount),
        reference: reference || undefined, bankAccountLabel: bankAccountLabel || undefined
      });
      setDescription(''); setAmount(''); setReference('');
      setNotice('Bank statement line saved. Match it to the corresponding receipt or expense.');
      await reload();
    } catch (e: any) { setError(e?.message || 'Could not save this statement line.'); }
    finally { setSaving(false); }
  };

  const matchLine = async (entry: BankStatementEntry) => {
    const selected = selections[entry.id];
    if (!selected) { setError('Choose the matching receipt or expense first.'); return; }
    setSaving(true); setError(''); setNotice('');
    try {
      await ApiClient.matchBankStatementEntry(entry.id, entry.direction === 'credit' ? { paymentId: selected } : { expenseId: selected });
      setNotice('Statement line reconciled successfully.');
      setSelections(current => { const next = { ...current }; delete next[entry.id]; return next; });
      await reload();
    } catch (e: any) { setError(e?.message || 'Could not reconcile this statement line.'); }
    finally { setSaving(false); }
  };

  return <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
    <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-bold uppercase tracking-[.16em] text-teal-700">Accountant · Controls</p><h1 className="mt-1 text-2xl font-bold text-slate-900">Bank reconciliation</h1><p className="mt-1 text-sm text-slate-500">Compare bank statement lines with recorded bank and mobile-money transactions. Amounts must match exactly.</p></div>
      <button type="button" onClick={() => void reload()} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Refresh</button>
    </header>

    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
    {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}

    <section className="grid gap-3 sm:grid-cols-3">
      <article className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold uppercase text-slate-500">Statement lines</p><p className="mt-2 text-2xl font-bold text-slate-900">{data.entries.length}</p></article>
      <article className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold uppercase text-slate-500">Matched</p><p className="mt-2 text-2xl font-bold text-emerald-700">{matchedCount}</p></article>
      <article className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold uppercase text-slate-500">Awaiting match</p><p className="mt-2 text-2xl font-bold text-amber-700">{unmatched.length}</p></article>
    </section>

    <section className="grid gap-5 xl:grid-cols-[minmax(300px,.8fr)_minmax(0,1.4fr)]">
      <form onSubmit={addStatementLine} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div><h2 className="text-base font-bold text-slate-900">Add bank statement line</h2><p className="mt-1 text-xs text-slate-500">Enter a line from your bank statement. CSV upload can be added later.</p></div>
        <label className="block text-xs font-semibold text-slate-700">Statement date<input required type="date" value={statementDate} onChange={e => setStatementDate(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/></label>
        <label className="block text-xs font-semibold text-slate-700">Description<input required minLength={2} maxLength={500} value={description} onChange={e => setDescription(e.target.value)} placeholder="Bank transaction description" className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold text-slate-700">Direction<select value={direction} onChange={e => setDirection(e.target.value as 'credit' | 'debit')} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="credit">Credit / money in</option><option value="debit">Debit / money out</option></select></label>
          <label className="block text-xs font-semibold text-slate-700">Amount ({school?.currency || 'ETB'})<input required type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/></label>
        </div>
        <label className="block text-xs font-semibold text-slate-700">Bank account label<input maxLength={120} value={bankAccountLabel} onChange={e => setBankAccountLabel(e.target.value)} placeholder="Optional account name" className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/></label>
        <label className="block text-xs font-semibold text-slate-700">Reference<input maxLength={160} value={reference} onChange={e => setReference(e.target.value)} placeholder="Bank reference (optional)" className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/></label>
        <button disabled={saving} className="w-full rounded-xl bg-[#0F766E] px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save statement line'}</button>
      </form>

      <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4"><h2 className="text-base font-bold text-slate-900">Reconciliation queue</h2><p className="mt-1 text-xs text-slate-500">Credits match fee receipts; debits match expenses. Each record can be matched once.</p></div>
        {loading ? <p className="p-6 text-sm text-slate-500">Loading statement lines…</p> : !data.entries.length ? <p className="p-8 text-center text-sm text-slate-500">No bank statement lines yet.</p> : <div className="divide-y divide-slate-100">
          {data.entries.map(entry => {
            const candidates = entry.direction === 'credit'
              ? data.unmatchedPayments.filter(p => Math.abs(Number(p.amountPaid) - Number(entry.amount)) <= .01)
              : data.unmatchedExpenses.filter(e => Math.abs(Number(e.amount) - Number(entry.amount)) <= .01);
            const matchedLabel = entry.matchedPaymentId ? 'Matched to fee receipt' : entry.matchedExpenseId ? 'Matched to expense' : '';
            return <article key={entry.id} className="space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold text-slate-900">{entry.description}</p><p className="mt-1 text-xs text-slate-500">{entry.statementDate}{entry.reference ? ` · Ref ${entry.reference}` : ''}{entry.bankAccountLabel ? ` · ${entry.bankAccountLabel}` : ''}</p></div><div className="text-right"><p className="font-bold tabular-nums text-slate-900">{entry.direction === 'credit' ? '+' : '−'}{money(Number(entry.amount))}</p><span className={`mt-1 inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${entry.matchedAt ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{entry.matchedAt ? matchedLabel : 'Unmatched'}</span></div></div>
              {!entry.matchedAt && <div className="flex flex-col gap-2 sm:flex-row"><select aria-label={`Match transaction for ${entry.description}`} value={selections[entry.id] || ''} onChange={e => setSelections(current => ({ ...current, [entry.id]: e.target.value }))} className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"><option value="">Choose exact-amount match ({candidates.length} found)</option>{entry.direction === 'credit' ? data.unmatchedPayments.filter(p => Math.abs(Number(p.amountPaid) - Number(entry.amount)) <= .01).map(p => <option key={p.id} value={p.id}>{p.receiptNumber} · {p.paymentMethod} · {money(Number(p.amountPaid))}</option>) : data.unmatchedExpenses.filter(e => Math.abs(Number(e.amount) - Number(entry.amount)) <= .01).map(e => <option key={e.id} value={e.id}>{e.description} · {e.paymentMethod} · {money(Number(e.amount))}</option>)}</select><button type="button" disabled={saving || !selections[entry.id]} onClick={() => void matchLine(entry)} className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">Match</button></div>}
            </article>;
          })}
        </div>}
      </section>
    </section>
  </div>;
};
