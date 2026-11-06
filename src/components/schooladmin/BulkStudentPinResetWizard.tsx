import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { ApiClient } from '../../services/api.ts';
import { CheckCircle2, Download, FileSpreadsheet, LoaderCircle, Printer, Upload, X } from 'lucide-react';

type ResetRow = { studentId: string; pin: string };
type PinSlip = { studentId: string; studentName: string; newPin: string };

export const BulkStudentPinResetWizard: React.FC<{ open: boolean; onClose: () => void; onComplete: () => void }> = ({ open, onClose, onComplete }) => {
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ResetRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pinSlips, setPinSlips] = useState<PinSlip[]>([]);

  if (!open) return null;

  const downloadTemplate = () => {
    const csv = 'studentId,pin\r\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'schoolos-bulk-student-pin-reset-template.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const chooseFile = async (file?: File) => {
    if (!file) return;
    setError('');
    setRows([]);
    setPinSlips([]);
    setFileName('');
    if (file.size > 5 * 1024 * 1024) { setError('File exceeds the 5 MB limit.'); return; }
    if (!/\\.(csv|xlsx)$/i.test(file.name)) { setError('Choose a CSV or XLSX file.'); return; }
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: false });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error('The file has no worksheet.');
      const values = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      if (!values.length || values.length > 500) throw new Error('The file must contain 1–500 student rows.');
      const seenStudents = new Set<string>();
      const seenPins = new Set<string>();
      const parsed = values.map((value, index) => {
        const studentId = String(value.studentId ?? value.student_id ?? value.StudentID ?? '').trim().toUpperCase();
        const pin = String(value.pin ?? value.newPin ?? value.new_pin ?? '').trim();
        if (!studentId) throw new Error(`Row ${index + 2}: Student ID is required.`);
        if (studentId.length > 64) throw new Error(`Row ${index + 2}: Student ID is too long.`);
        if (seenStudents.has(studentId)) throw new Error(`Row ${index + 2}: duplicate Student ID ${studentId}.`);
        if (pin && !/^\d{4}$/.test(pin)) throw new Error(`Row ${index + 2}: PIN must contain exactly four digits.`);
        if (pin && seenPins.has(pin)) throw new Error('Custom PINs must be unique within this file.');
        seenStudents.add(studentId);
        if (pin) seenPins.add(pin);
        return { studentId, pin };
      });
      setRows(parsed);
      setFileName(file.name);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The file could not be read.');
    }
  };

  const submit = async () => {
    if (!rows.length) return;
    setLoading(true);
    setError('');
    try {
      const result = await ApiClient.bulkResetStudentPins(rows);
      setPinSlips(result.pinSlips);
      onComplete();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Bulk PIN reset failed. Check the Student IDs and retry.');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => { setRows([]); setPinSlips([]); setFileName(''); setError(''); };
  const close = () => { reset(); onClose(); };

  return (
    <>
      <style>{`@media print { body * { visibility: hidden !important; } .bulk-pin-print, .bulk-pin-print * { visibility: visible !important; } .bulk-pin-print { position: fixed; inset: 0; overflow: auto; background: white; padding: 24px; } .bulk-pin-dialog { display: none !important; } }`}</style>
      <div className="bulk-pin-dialog fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
        <section role="dialog" aria-modal="true" aria-label="Bulk student PIN reset" className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl sm:p-6">
          <header className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
            <div><h2 className="text-lg font-bold text-slate-900">Bulk student PIN reset</h2><p className="mt-1 text-xs text-slate-500">Upload a CSV/XLSX with Student IDs. Leave PIN blank to generate a unique 4-digit PIN.</p></div>
            <button type="button" onClick={close} aria-label="Close" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5"/></button>
          </header>
          {error && <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
          {!pinSlips.length ? <>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-4">
                <h3 className="text-sm font-semibold text-slate-900">1. Download the template</h3>
                <p className="mt-1 text-xs text-slate-500">Columns: studentId, pin. Use the Student ID shown in the school directory.</p>
                <button type="button" onClick={downloadTemplate} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold"><Download className="h-4 w-4"/>Download CSV template</button>
              </div>
              <div className="rounded-xl border border-slate-200 p-4">
                <h3 className="text-sm font-semibold text-slate-900">2. Upload the completed file</h3>
                <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-400 px-3 py-2 text-xs text-slate-700"><FileSpreadsheet className="h-4 w-4 text-teal-700"/><span className="truncate">{fileName || 'Choose CSV or XLSX file'}</span><input type="file" className="sr-only" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={event => void chooseFile(event.target.files?.[0])}/></label>
                <p className="mt-2 text-[11px] text-slate-500">Maximum 5 MB and 500 students. Each custom PIN must be 4 digits and unique. Parent account PINs are not changed.</p>
              </div>
            </div>
            {rows.length > 0 && <div className="mt-5">
              <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-slate-900">Preview · {rows.length} students</h3><span className="text-xs text-slate-500">{rows.filter(row => !row.pin).length} PINs will be generated</span></div>
              <div className="mt-3 max-h-64 overflow-auto rounded-lg border border-slate-200"><table className="w-full min-w-[420px] text-left text-xs"><thead className="sticky top-0 bg-slate-50"><tr><th className="px-3 py-2">Student ID</th><th className="px-3 py-2">PIN setting</th></tr></thead><tbody>{rows.map(row => <tr key={row.studentId} className="border-t border-slate-100"><td className="px-3 py-2 font-mono">{row.studentId}</td><td className="px-3 py-2">{row.pin ? 'Custom 4-digit PIN' : 'Generate new PIN'}</td></tr>)}</tbody></table></div>
              <div className="mt-4 flex flex-col-reverse justify-between gap-2 border-t border-slate-200 pt-4 sm:flex-row"><button type="button" onClick={reset} className="min-h-10 rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold">Clear file</button><button type="button" onClick={() => void submit()} disabled={loading} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{loading ? <LoaderCircle className="h-4 w-4 animate-spin"/> : <CheckCircle2 className="h-4 w-4"/>}Reset {rows.length} PINs</button></div>
            </div>}
          </> : <>
            <p className="my-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 className="mr-2 inline h-5 w-5"/>{pinSlips.length} student PINs were reset. These PINs are shown once only; print or securely share them now.</p>
            <div className="my-4 flex flex-wrap gap-2"><button type="button" onClick={() => window.print()} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white"><Printer className="h-4 w-4"/>Print PIN slips</button><button type="button" onClick={close} className="min-h-10 rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold">Close</button></div>
            <div className="bulk-pin-print grid grid-cols-1 gap-4 sm:grid-cols-2">{pinSlips.map(slip => <article key={slip.studentId} className="break-inside-avoid rounded-xl border-2 border-teal-700 p-5"><p className="text-xs font-bold uppercase tracking-wide text-teal-700">Student PIN slip</p><h3 className="mt-2 text-lg font-bold text-slate-900">{slip.studentName}</h3><p className="mt-1 text-xs text-slate-500">Student ID: {slip.studentId}</p><p className="mt-4 text-xs text-slate-500">New PIN</p><p className="font-mono text-3xl font-bold tracking-[0.3em] text-slate-900">{slip.newPin}</p></article>)}</div>
          </>}
        </section>
      </div>
    </>
  );
};
