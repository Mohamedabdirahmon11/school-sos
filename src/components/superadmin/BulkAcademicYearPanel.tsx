import React, { useState } from 'react';
import { ApiClient } from '../../services/api.ts';

type PreviewRow = {
  id: string;
  name: string;
  code: string;
  currentAcademicYear: string | null;
  status: 'change' | 'unchanged' | 'warning';
  warning: string;
};

export const BulkAcademicYearPanel: React.FC = () => {
  const [year, setYear] = useState('');
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [includeWarned, setIncludeWarned] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [start, end] = year.trim().split('-').map(Number);
  const yearValid = /^\d{4}-\d{4}$/.test(year.trim()) && end === start + 1;
  const changeCount = rows?.filter(row => row.status === 'change' || (row.status === 'warning' && includeWarned)).length || 0;

  const loadPreview = async () => {
    if (!yearValid || busy) return;
    setBusy(true);
    setMessage(null);
    setConfirm('');
    setIncludeWarned(false);
    try {
      const result = await ApiClient.previewBulkAcademicYear(year.trim());
      setRows(result.schools);
    } catch (error: any) {
      setRows(null);
      setMessage({ type: 'error', text: error?.message || 'Unable to preview school academic years.' });
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (busy || confirm !== 'CONFIRM' || changeCount === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await ApiClient.applyBulkAcademicYear(year.trim(), confirm, includeWarned);
      const successText = `Academic year ${result.academicYear} applied to ${result.applied} school(s). Skipped: ${result.skipped.length}.`;
      setMessage({ type: 'success', text: successText });
      setConfirm('');
      try {
        const refreshed = await ApiClient.previewBulkAcademicYear(year.trim());
        setRows(refreshed.schools);
      } catch {
        setMessage({ type: 'success', text: `${successText} Preview could not refresh; select Preview schools to verify the final state.` });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'Unable to apply the academic year.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-xs space-y-4 text-xs">
      <div>
        <h2 className="text-sm font-bold text-[#132A29]">Apply academic year to schools</h2>
        <p className="mt-1 text-[11px] leading-relaxed text-[#64748B]">
          The platform academic year above is the default for new schools. Existing schools keep their own year until you preview and confirm a bulk update here. Schools moving backwards are skipped unless you explicitly include them.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="space-y-1">
          <span className="block font-medium text-[#334155]">New academic year</span>
          <input
            value={year}
            onChange={event => { setYear(event.target.value); setRows(null); setConfirm(''); }}
            placeholder="2027-2028"
            maxLength={9}
            className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 font-mono sm:w-40"
          />
        </label>
        <button
          type="button"
          onClick={loadPreview}
          disabled={!yearValid || busy}
          className="rounded-lg border border-[#CBD5E1] bg-slate-50 px-4 py-2 font-semibold text-[#334155] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy && !rows ? 'Loading…' : 'Preview schools'}
        </button>
      </div>

      {message && (
        <p role="status" className={message.type === 'success' ? 'rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-800' : 'rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-800'}>
          {message.text}
        </p>
      )}

      {rows && (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-lg border border-[#E2E8F0]">
            <table className="w-full min-w-[560px] text-left">
              <thead className="bg-[#F8FAFC] text-[10px] uppercase tracking-wide text-[#64748B]">
                <tr>
                  <th className="px-3 py-2">School</th>
                  <th className="px-3 py-2">Current year</th>
                  <th className="px-3 py-2">Target year</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {rows.map(row => (
                  <tr key={row.id}>
                    <td className="px-3 py-2">
                      <div className="font-semibold text-[#132A29]">{row.name}</div>
                      <div className="font-mono text-[10px] text-[#64748B]">{row.code}</div>
                    </td>
                    <td className="px-3 py-2 font-mono">{row.currentAcademicYear || 'Not set'}</td>
                    <td className="px-3 py-2 font-mono">{row.status === 'unchanged' ? '—' : year}</td>
                    <td className="px-3 py-2">
                      <span className={row.status === 'warning' ? 'font-semibold text-amber-700' : row.status === 'unchanged' ? 'text-[#64748B]' : 'font-semibold text-emerald-700'}>
                        {row.status === 'warning' ? row.warning : row.status === 'unchanged' ? 'Already set' : 'Will update'}
                      </span>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-[#64748B]">No registered schools found.</td></tr>}
              </tbody>
            </table>
          </div>

          {rows.some(row => row.status === 'warning') && (
            <label className="flex items-start gap-2 text-[11px] text-amber-800">
              <input type="checkbox" checked={includeWarned} onChange={event => { setIncludeWarned(event.target.checked); setConfirm(''); }} className="mt-0.5" />
              <span>Include schools whose current academic year is later than the target year. Review these rows carefully before applying.</span>
            </label>
          )}

          <div className="flex flex-col gap-3 border-t border-[#E2E8F0] pt-3 sm:flex-row sm:items-end sm:justify-between">
            <label className="space-y-1">
              <span className="block font-medium text-[#334155]">Type CONFIRM to update {changeCount} school(s)</span>
              <input value={confirm} onChange={event => setConfirm(event.target.value)} className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 font-mono sm:w-48" />
            </label>
            <button
              type="button"
              onClick={apply}
              disabled={busy || confirm !== 'CONFIRM' || changeCount === 0}
              className="rounded-lg bg-[#0F766E] px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Applying…' : `Apply to ${changeCount} school(s)`}
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
