import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiClient } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { formatMoney } from '../../lib/money.ts';
import { formatSchoolMonthPeriod } from '../../lib/ethiopian-calendar.ts';
import { StaffPayrollRecord } from '../../types/index.ts';

type PayrollStaff = { id: string; staffId: string; userId: string; name: string; monthlySalary: number };

export const AccountantPayrollView: React.FC = () => {
  const { school, t } = useAuth();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [staff, setStaff] = useState<PayrollStaff[]>([]);
  const [records, setRecords] = useState<StaffPayrollRecord[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [allowance, setAllowance] = useState(0);
  const [deduction, setDeduction] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [staffRows, payrollRows] = await Promise.all([ApiClient.getPayrollStaff(), ApiClient.getAllPayrollRecords(month)]);
      setStaff(Array.isArray(staffRows) ? staffRows : []);
      setRecords(Array.isArray(payrollRows) ? payrollRows : []);
    } catch {
      setError(t('payroll_error'));
    } finally { setLoading(false); }
  }, [month, t]);
  useEffect(() => { void reload(); }, [reload]);

  const available = useMemo(() => staff.filter(employee => !records.some(record => record.userId === employee.userId)), [staff, records]);
  const summary = useMemo(() => records.reduce((value, record) => {
    value[record.status].count += 1;
    value[record.status].net += Number(record.netSalary) || 0;
    return value;
  }, { draft: { count: 0, net: 0 }, approved: { count: 0, net: 0 }, paid: { count: 0, net: 0 } }), [records]);
  const money = (amount: number) => formatMoney(Number(amount) || 0, school?.currency);
  const calendarType = school?.calendarType || (school?.timezone === 'Africa/Addis_Ababa' ? 'ethiopian' : 'gregorian');
  const payrollPeriodLabel = (monthKey: string) => formatSchoolMonthPeriod(monthKey, calendarType);
  const statusText = (status: StaffPayrollRecord['status']) => status === 'draft' ? t('payroll_draft') : status === 'approved' ? t('payroll_approved') : t('payroll_paid');

  const createDraft = async () => {
    setSaving(true); setError('');
    try {
      const allowances = allowance > 0 ? [{ label: t('payroll_allowance'), amount: allowance }] : [];
      const deductions = deduction > 0 ? [{ label: t('payroll_deduction'), amount: deduction }] : [];
      await ApiClient.createPayrollDraft(month, selected.map(staffId => ({ staffId, allowances, deductions })));
      setSelected([]); await reload();
    } catch (reason: any) { setError(reason?.message || t('payroll_error')); }
    finally { setSaving(false); }
  };

  const transition = async (record: StaffPayrollRecord, action: 'approve' | 'pay') => {
    setError('');
    try {
      if (action === 'approve') await ApiClient.approvePayroll(record.id);
      else await ApiClient.payPayroll(record.id);
      await reload();
    } catch (reason: any) { setError(reason?.message || t('payroll_error')); }
  };

  return <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">
    <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
      <div><h1 className="text-xl md:text-2xl font-bold text-[#132A29]">{t('payroll_management')}</h1></div>
      <label className="text-xs font-semibold text-[#475569]">{t('payroll_month')} (Gregorian accounting month)
        <input type="month" value={month} onChange={event => setMonth(event.target.value)} className="ml-2 px-3 py-2 border border-[#CBD5E1] rounded-lg" />
        <span className="block mt-1 text-[11px] font-normal text-slate-500">School calendar period: {payrollPeriodLabel(month)}</span>
      </label>
    </header>

    {error && <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-800">{error}</div>}

    <section aria-label={t('payroll_summary')} className="grid sm:grid-cols-3 gap-3">
      {(['draft', 'approved', 'paid'] as const).map(status => <div key={status} className="bg-white border border-[#E2E8F0] rounded-xl p-4">
        <p className="text-xs text-slate-500">{statusText(status)} · {t('payroll_summary')}</p><p className="mt-1 font-bold text-[#132A29]">{summary[status].count}</p><p className="text-sm text-slate-600">{money(summary[status].net)}</p>
      </div>)}
    </section>

    <section className="bg-white rounded-xl border border-[#E2E8F0] p-4 md:p-5 space-y-4">
      <h2 className="font-bold text-sm text-[#132A29]">{t('payroll_create')}</h2>
      <div className="grid md:grid-cols-2 gap-4">
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-[#475569] mb-2">{t('payroll_staff_member')}</legend>
          {available.map(employee => <label key={employee.id} className="flex items-center justify-between gap-3 text-sm p-2 rounded-lg hover:bg-slate-50">
            <span className="flex items-center gap-2"><input type="checkbox" checked={selected.includes(employee.id)} onChange={event => setSelected(current => event.target.checked ? [...current, employee.id] : current.filter(id => id !== employee.id))} />{employee.name} · {employee.staffId}</span>
            <span className="text-xs text-slate-600">{money(employee.monthlySalary)}</span>
          </label>)}
          {!available.length && <p className="text-sm text-slate-500">{t('payroll_empty')}</p>}
        </fieldset>
        <div className="grid grid-cols-2 gap-3 content-start">
          <label className="text-xs font-semibold text-[#475569]">{t('payroll_allowance')} ({school?.currency || 'ETB'})<input type="number" min="0" step="0.01" value={allowance} onChange={event => setAllowance(Number(event.target.value))} className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg" /></label>
          <label className="text-xs font-semibold text-[#475569]">{t('payroll_deduction')} ({school?.currency || 'ETB'})<input type="number" min="0" step="0.01" value={deduction} onChange={event => setDeduction(Number(event.target.value))} className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg" /></label>
          <button type="button" disabled={!selected.length || saving} onClick={() => void createDraft()} className="col-span-2 px-4 py-2 bg-[#0F766E] disabled:opacity-50 text-white rounded-lg text-sm font-semibold">{saving ? t('payroll_loading') : t('payroll_create')}</button>
        </div>
      </div>
    </section>

    <section className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
      {loading ? <p className="p-5 text-sm text-slate-500">{t('payroll_loading')}</p> : !records.length ? <p className="p-5 text-sm text-slate-500">{t('payroll_empty')}</p> :
        <div className="overflow-x-auto"><table className="w-full text-left text-xs">
          <thead className="bg-[#F8FAFC] text-[#64748B] uppercase"><tr>
            <th className="p-3">{t('payroll_staff_member')}</th><th className="p-3">{t('payroll_salary')}</th><th className="p-3">{t('payroll_allowance')}</th><th className="p-3">{t('payroll_deduction')}</th><th className="p-3">{t('payroll_net')}</th><th className="p-3">{t('payroll_status')}</th><th className="p-3"></th>
          </tr></thead><tbody className="divide-y divide-slate-100">{records.map(record => <tr key={record.id}>
            <td className="p-3 font-semibold">{record.staffName}<span className="block text-[10px] font-normal text-slate-500">{payrollPeriodLabel(record.payrollMonth)}</span></td><td className="p-3">{money(record.baseSalary)}</td><td className="p-3">{money(record.allowanceTotal)}</td><td className="p-3">{money(record.deductionTotal)}</td><td className="p-3 font-bold">{money(record.netSalary)}</td><td className="p-3">{statusText(record.status)}</td>
            <td className="p-3"><div className="flex justify-end gap-2">{record.status === 'draft' && <button type="button" onClick={() => void transition(record, 'approve')} className="px-2 py-1 text-teal-800 border border-teal-200 rounded">{t('payroll_approve')}</button>}{record.status === 'approved' && <button type="button" onClick={() => void transition(record, 'pay')} className="px-2 py-1 text-teal-800 border border-teal-200 rounded">{t('payroll_mark_paid')}</button>}<button type="button" onClick={() => void ApiClient.downloadPayslipPdf(record.id)} className="px-2 py-1 text-slate-700 border border-slate-200 rounded">{t('payroll_payslip')}</button></div></td>
          </tr>)}</tbody>
        </table></div>}
    </section>
  </div>;
};

export const StaffPayslipsView: React.FC = () => {
  const { school, t } = useAuth();
  const calendarType = school?.calendarType || (school?.timezone === 'Africa/Addis_Ababa' ? 'ethiopian' : 'gregorian');
  const payrollPeriodLabel = (monthKey: string) => formatSchoolMonthPeriod(monthKey, calendarType);
  const [records, setRecords] = useState<StaffPayrollRecord[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { ApiClient.getMyPayslips().then(rows => setRecords(Array.isArray(rows) ? rows : [])).finally(() => setLoading(false)); }, []);
  return <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
    <h1 className="text-xl font-bold text-[#132A29]">{t('payroll_payslip')}</h1>
    {loading ? <p>{t('payroll_loading')}</p> : !records.length ? <p className="text-sm text-slate-500">{t('payroll_empty')}</p> : records.map(record => <div key={record.id} className="flex items-center justify-between gap-3 p-4 bg-white border border-slate-200 rounded-xl"><div><p className="font-semibold">{payrollPeriodLabel(record.payrollMonth)}</p><p className="text-[10px] text-slate-500">Accounting key: {record.payrollMonth}</p><p className="text-sm text-slate-500">{formatMoney(record.netSalary, school?.currency)}</p></div><button type="button" onClick={() => void ApiClient.downloadPayslipPdf(record.id)} className="px-3 py-2 border border-teal-200 text-teal-800 rounded-lg text-sm">{t('payroll_payslip')}</button></div>)}
  </div>;
};
