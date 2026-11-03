import React, { useMemo, useState } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, LoaderCircle, Printer, Upload, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

interface PreviewRow { row: number; data: Record<string, string>; status: 'valid' | 'error' | 'skipped'; reasons: string[] }
interface PreviewResult { rows: PreviewRow[]; totals: { total: number; valid: number; errors: number; skipped: number } }
interface PinSlip { type: 'student' | 'parent'; name: string; studentName?: string; phone?: string; studentId?: string; pin: string }

export const BulkImportWizard: React.FC<{ open: boolean; onClose: () => void; onComplete: () => void }> = ({ open, onClose, onComplete }) => {
  const { t } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<{ counts: Record<string, number>; pinSlips: PinSlip[] } | null>(null);
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const visibleRows = useMemo(() => (preview?.rows || []).filter(row => !errorsOnly || row.status === 'error'), [preview, errorsOnly]);
  if (!open) return null;

  const downloadTemplate = async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/import/template', { credentials: 'include' });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Template download failed.');
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'schoolos-student-import-template.csv'; anchor.click(); URL.revokeObjectURL(url);
    } catch (reason: any) { setError(reason.message || 'Template download failed.'); }
    finally { setLoading(false); }
  };

  const runPreview = async () => {
    if (!file) { setError(t('import_choose_file')); return; }
    setLoading(true); setError('');
    try {
      const form = new FormData(); form.append('file', file);
      const response = await fetch('/api/import/preview', { method: 'POST', credentials: 'include', body: form });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Preview failed.');
      setPreview(body); setResult(null); setErrorsOnly(false);
    } catch (reason: any) { setError(reason.message || 'Preview failed.'); }
    finally { setLoading(false); }
  };

  const confirmImport = async () => {
    if (!preview || preview.totals.errors || !preview.totals.valid) return;
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/import/confirm', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: preview.rows.map(row => row.data) }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Import failed.');
      setResult(body); onComplete();
    } catch (reason: any) { setError(reason.message || 'Import failed.'); }
    finally { setLoading(false); }
  };

  const reset = () => { setFile(null); setPreview(null); setResult(null); setError(''); setErrorsOnly(false); };
  const step = result ? t('import_step_result') : preview ? t('import_step_preview') : t('import_step_upload');
  return (
    <>
      <style>{`@media print { body * { visibility: hidden !important; } .bulk-import-print, .bulk-import-print * { visibility: visible !important; } .bulk-import-print { position: fixed; inset: 0; overflow: auto; background: white; padding: 24px; } .bulk-import-dialog { display: none !important; } }`}</style>
      <div className="bulk-import-dialog fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
        <section role="dialog" aria-modal="true" aria-label={t('bulk_import')} className="w-full max-w-5xl max-h-[94vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white p-4 sm:p-6 shadow-xl">
          <header className="flex items-start justify-between gap-4 border-b border-[#E2E8F0] pb-4">
            <div><h2 className="text-lg font-bold text-[#132A29]">{t('bulk_import')}</h2><p className="mt-1 text-xs text-[#64748B]">{step}</p></div>
            <button onClick={onClose} aria-label={t('import_close')} className="rounded-lg p-2 text-[#64748B] hover:bg-slate-100"><X className="h-5 w-5" /></button>
          </header>
          <div className="my-4 flex flex-wrap gap-2 text-[11px]">
            {[t('import_step_template'), t('import_step_upload'), t('import_step_preview'), t('import_step_confirm'), t('import_step_result')].map((label, index) => <span key={label} className={`rounded-full px-3 py-1 ${index <= (result ? 4 : preview ? 2 : 1) ? 'bg-[#F0FDFA] text-[#0F766E]' : 'bg-slate-100 text-slate-500'}`}>{index + 1}. {label}</span>)}
          </div>
          {error && <div role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
          {!result ? <>
            <div className="grid gap-4 md:grid-cols-[1fr_1.3fr]">
              <div className="rounded-xl border border-[#E2E8F0] p-4">
                <p className="text-sm font-semibold text-[#132A29]">{t('import_step_template')}</p>
                <button onClick={downloadTemplate} disabled={loading} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#CBD5E1] px-3 py-2 text-xs font-semibold text-[#334155] disabled:opacity-50"><Download className="h-4 w-4 text-[#0F766E]" />{t('import_download_template')}</button>
              </div>
              <div className="rounded-xl border border-[#E2E8F0] p-4">
                <p className="text-sm font-semibold text-[#132A29]">{t('import_step_upload')}</p>
                <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-[#94A3B8] px-3 py-2 text-xs text-[#334155] hover:bg-slate-50"><FileSpreadsheet className="h-4 w-4 text-[#0F766E]" /><span className="truncate">{file?.name || t('import_choose_file')}</span><input className="sr-only" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={event => { setFile(event.target.files?.[0] || null); setPreview(null); setError(''); }} /></label>
                <p className="mt-2 text-[11px] text-[#64748B]">{t('import_upload_help')}</p>
                <button onClick={runPreview} disabled={loading || !file} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#0F766E] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{t('import_preview_button')}</button>
              </div>
            </div>
            {preview && <div className="mt-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2 text-xs"><span className="rounded bg-emerald-50 px-2 py-1 text-emerald-800">{t('import_valid_count')}: {preview.totals.valid}</span><span className="rounded bg-rose-50 px-2 py-1 text-rose-800">{t('import_error_count')}: {preview.totals.errors}</span><span className="rounded bg-slate-100 px-2 py-1 text-slate-700">{t('import_skipped_count')}: {preview.totals.skipped}</span></div>
                <label className="flex items-center gap-2 text-xs text-[#334155]"><input type="checkbox" checked={errorsOnly} onChange={event => setErrorsOnly(event.target.checked)} />{t('import_error_only')}</label>
              </div>
              <div className="max-h-[40vh] overflow-auto rounded-lg border border-[#E2E8F0]">
                <table className="min-w-[780px] w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-[#475569]"><tr><th className="px-3 py-2">{t('import_row')}</th><th className="px-3 py-2">studentName</th><th className="px-3 py-2">className / section</th><th className="px-3 py-2">parentPhone</th><th className="px-3 py-2">{t('import_status')}</th><th className="px-3 py-2">{t('import_reason')}</th></tr></thead>
                  <tbody>{visibleRows.map(row => <tr key={row.row} className={row.status === 'valid' ? 'bg-emerald-50/70' : row.status === 'error' ? 'bg-rose-50' : 'bg-slate-50'}><td className="border-t border-white px-3 py-2">{row.row}</td><td className="border-t border-white px-3 py-2">{row.data.studentName}</td><td className="border-t border-white px-3 py-2">{row.data.className} / {row.data.section}</td><td className="border-t border-white px-3 py-2">{row.data.parentPhone}</td><td className="border-t border-white px-3 py-2 font-semibold capitalize">{row.status}</td><td className="border-t border-white px-3 py-2">{row.reasons.join(' ') || '—'}</td></tr>)}</tbody>
                </table>
                {!visibleRows.length && <p className="p-5 text-center text-xs text-[#64748B]">{preview.rows.length ? t('import_empty_preview') : t('import_empty_preview')}</p>}
              </div>
              {preview.totals.errors > 0 && <p className="text-xs text-rose-700">{t('import_error_count')}: {preview.totals.errors}. Fix these rows and preview the file again.</p>}
              <div className="flex flex-col-reverse gap-2 border-t border-[#E2E8F0] pt-4 sm:flex-row sm:justify-between">
                <button onClick={reset} className="min-h-10 rounded-lg border border-[#CBD5E1] px-4 py-2 text-xs font-semibold text-[#334155]">{t('import_back')}</button>
                <button onClick={confirmImport} disabled={loading || Boolean(preview.totals.errors) || !preview.totals.valid} className="min-h-10 rounded-lg bg-[#0F766E] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{loading ? t('import_loading') : t('import_confirm_button')}</button>
              </div>
            </div>}
            {!preview && <p className="mt-5 rounded-lg bg-slate-50 p-5 text-center text-xs text-[#64748B]">{t('import_empty_preview')}</p>}
          </> : <>
            <p className="my-4 flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 className="h-5 w-5" />{t('import_result_message')}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{[[t('import_classes_count'), result.counts.classes], [t('import_students_count'), result.counts.students], [t('import_parents_count'), result.counts.parents]].map(([label, count]) => <div key={String(label)} className="rounded-xl border border-[#E2E8F0] p-4"><p className="text-xs text-[#64748B]">{label}</p><p className="mt-1 text-2xl font-bold text-[#132A29]">{count}</p></div>)}</div>
            <div className="my-4 flex flex-wrap gap-2"><button onClick={() => window.print()} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#0F766E] px-4 py-2 text-xs font-semibold text-white"><Printer className="h-4 w-4" />{t('import_print_pin_slips')}</button><button onClick={onClose} className="min-h-10 rounded-lg border border-[#CBD5E1] px-4 py-2 text-xs font-semibold text-[#334155]">{t('import_close')}</button></div>
            <div className="bulk-import-print grid grid-cols-1 gap-4 sm:grid-cols-2">{result.pinSlips.map((slip, index) => <article key={`${slip.type}-${slip.studentId || slip.phone}-${index}`} className="break-inside-avoid rounded-xl border-2 border-[#0F766E] p-5"><p className="text-xs font-bold uppercase tracking-wide text-[#0F766E]">{slip.type} PIN slip</p><h3 className="mt-2 text-lg font-bold text-[#132A29]">{slip.name}</h3>{slip.studentName && <p className="mt-1 text-xs text-[#475569]">Student: {slip.studentName}</p>}{slip.studentId && <p className="mt-1 text-xs text-[#475569]">Student ID: {slip.studentId}</p>}{slip.phone && <p className="mt-1 text-xs text-[#475569]">Phone: {slip.phone}</p>}<p className="mt-4 text-xs text-[#64748B]">PIN</p><p className="font-mono text-3xl font-bold tracking-[0.3em] text-[#132A29]">{slip.pin}</p></article>)}</div>
          </>}
        </section>
      </div>
    </>
  );
};
