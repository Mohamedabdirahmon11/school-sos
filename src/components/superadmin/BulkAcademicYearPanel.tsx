import React, { useState } from 'react';
import { ApiClient } from '../../services/api.ts';

type PreviewRow = { id: string; name: string; code: string; currentAcademicYear: string | null; status: 'change' | 'unchanged' | 'warning'; warning: string };

export const BulkAcademicYearPanel: React.FC = () => {
  const [year, setYear] = useState('');
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [includeWarned, setIncludeWarned] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const yearValid = /^\d{4}-\d{4}$/.test(year) && Number(year.slice(5)) === Number(year.slice(0, 4)) + 1;

  const loadPreview = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await ApiClient.previewBulkAcademicYear(year.trim());
      setRows(result.schools);
      setConfirm('');
      setIncludeWarned(false);
    } catch (error: any) {
      setRows(null);
      setMessage({ type: 'error', text: error?.message || 'Preview failed.' });
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await ApiClient.applyBulkAcademicYear(year.trim(), confirm, includeWarned);
      setMessage({ type: 'ok', text: `Academic year ${result.academicYear} applied to ${result.applied} school(s). Skipped: ${result.skipped.length}.` });
      const refreshed = await ApiClient.previewBulkAcademicYear(year.trim());
      setRows(refreshed.schools);
      setConfirm('');
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'Apply failed.' });
    } finally {
      setBusy(false);
    }
  };

  const changeCount = rows?.filter(row => row.status === 'change' || (row.status === 'warning' && includeWarned)).length || 0;

  return (
    <section className="bg-white p-5 rounded-xl border border-[#E2E8F0] space-y-4 shadow-xs text-xs">
      <h2 className="text-sm font-bold text-[#132A29]">Apply academic year to all schools</h2>
      <p className="text-[11px] text-[#64748B]">
        The platform value above is only the default for new schools. Each school keeps its own academic year. Use this to move every school to a new year in one step. Review the preview first; schools going backwards are skipped unless you include them.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="block font-medium text-[#334155]">New academic year</span>
          <input value={year} onChange={e => setYear(e.target.value)} placeholder="2027-2028" className="px-3 py-2 border border-[#CBD5E1] rounded-lg font-mono" />
        </label>
        <button type="button" onClick={loadPreview} disabled={!yearValid || busy} className="px-3 py-2 rounded-lg bg-slate-100 border border-[#CBD5E1] disabled:opacity-50">Preview</button>
      </div>
      {message && <p role="status" className={message.type === 'ok' ? 'text-emerald-700' : 'text-red-700'}>{message.text}</p>}
      {rows && (
        <div className="space-y-3">
          <div className="overflow-x-auto border border-[#E2E8F0] rounded-lg">
            <table className="w-full text-left">
              <thead className="bg-[#F8FAFC] text-[#64748B]"><tr><th className="px-3 py-2">School</th><th className="px-3 py-2">Current</th><th className="px-3 py-2">New</th><th className="px-3 py-2">Note</th></tr></thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {rows.map(row => (
                  <tr key={row.id}>
                    <td className="px-3 py-2 font-medium">{row.name}</td>
                    <td className="px-3 py-2 font-mono">{row.currentAcademicYear || 'none'}</td>
                    <td className="px-3 py-2 font-mono">{row.status === 'unchanged' ? 'no change' : year}</td>
                    <td className="px-3 py-2">{row.status === 'warning' ? `⚠ ${row.warning}` : row.status === 'unchanged' ? 'Already on this year' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.some(row => row.status === 'warning') && (
            <label className="flex items-center gap-2"><input type="checkbox" checked={includeWarned} onChange={e => setIncludeWarned(e.target.checked)} /><span>Also change schools with warnings</span></label>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1">
              <span className="block font-medium text-[#334155]">Type CONFIRM to apply to {changeCount} school(s)</span>
              <input value={confirm} onChange={e => setConfirm(e.target.value)} className="px-3 py-2 border border-[#CBD5E1] rounded-lg font-mono" />
            </label>
            <button type="button" onClick={apply} disabled={busy || confirm !== 'CONFIRM' || changeCount === 0} className="px-3 py-2 rounded-lg bg-[#0F766E] text-white disabled:opacity-50">Apply</button>
          </div>
        </div>
      )}
    </section>
  );
};
