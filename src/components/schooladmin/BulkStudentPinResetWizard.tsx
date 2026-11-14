import React, { useEffect, useState } from 'react';
import { ApiClient } from '../../services/api.ts';
import { CheckCircle2, Download, LoaderCircle, Printer, X } from 'lucide-react';

type StudentRow = { id: string; studentId: string; firstName: string; middleName?: string; lastName: string };
type PinSlip = { studentId: string; studentName: string; newPin: string };

export const BulkStudentPinResetWizard: React.FC<{ open: boolean; onClose: () => void; onComplete: () => void }> = ({ open, onClose, onComplete }) => {
  const [classes, setClasses] = useState<any[]>([]);
  const [classId, setClassId] = useState('');
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pinSlips, setPinSlips] = useState<PinSlip[]>([]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError('');
    ApiClient.getClasses().then(rows => {
      if (!active) return;
      const available = Array.isArray(rows) ? rows : [];
      setClasses(available);
      setClassId(available[0]?.id || '');
    }).catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : 'Could not load classes.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open]);

  useEffect(() => {
    if (!open || !classId) { setStudents([]); setSelectedIds([]); return; }
    let active = true;
    setLoading(true);
    setError('');
    ApiClient.getAllStudents(classId, undefined, 100).then(rows => {
      if (!active) return;
      setStudents(Array.isArray(rows) ? rows as StudentRow[] : []);
      setSelectedIds([]);
    }).catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : 'Could not load students in this class.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, classId]);

  if (!open) return null;

  const toggleStudent = (studentId: string, checked: boolean) => {
    setSelectedIds(current => checked
      ? [...new Set([...current, studentId])]
      : current.filter(id => id !== studentId));
  };

  const reset = () => {
    setStudents([]); setSelectedIds([]); setPinSlips([]); setClassId('');
    setClasses([]); setError('');
  };
  const close = () => { reset(); onClose(); };

  const submit = async () => {
    if (!selectedIds.length) { setError('Select at least one student.'); return; }
    setLoading(true);
    setError('');
    try {
      const rows = selectedIds.map(id => {
        const student = students.find(item => item.id === id)!;
        return { studentId: student.studentId, pin: '' };
      });
      const result = await ApiClient.bulkResetStudentPins(rows);
      setPinSlips(result.pinSlips);
      onComplete();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Bulk PIN reset failed. Please retry.');
    } finally {
      setLoading(false);
    }
  };

  const downloadPins = () => {
    const escape = (value: string) => '"' + String(value).replace(/"/g, '""') + '"';
    const csv = [
      ['Student ID', 'Student Name', 'New PIN'].map(escape).join(','),
      ...pinSlips.map(item => [item.studentId, item.studentName, item.newPin].map(escape).join(','))
    ].join('\\r\\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'schoolos-student-pins.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <style>{`@media print { body * { visibility: hidden !important; } .bulk-pin-print, .bulk-pin-print * { visibility: visible !important; } .bulk-pin-print { position: fixed; inset: 0; overflow: auto; background: white; padding: 24px; } .bulk-pin-dialog { display: none !important; } }`}</style>
      <div className="bulk-pin-dialog fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
        <section role="dialog" aria-modal="true" aria-label="Bulk student PIN reset" className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl sm:p-6">
          <header className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
            <div><h2 className="text-lg font-bold text-slate-900">Bulk student PIN reset</h2><p className="mt-1 text-xs text-slate-500">Choose a class, select one or more students, then generate a unique four-digit PIN for each.</p></div>
            <button type="button" onClick={close} aria-label="Close" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5"/></button>
          </header>
          {error && <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
          {!pinSlips.length ? <>
            <div className="mt-5">
              <label className="block text-xs font-semibold text-slate-700">1. Select class</label>
              <select value={classId} onChange={event => setClassId(event.target.value)} disabled={loading || !classes.length} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="">Choose a class</option>
                {classes.map(item => <option key={item.id} value={item.id}>{item.name}{item.section ? ' · ' + item.section : ''}</option>)}
              </select>
            </div>
            <div className="mt-5 rounded-xl border border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 p-3">
                <div><h3 className="text-sm font-semibold text-slate-900">2. Select students</h3><p className="text-xs text-slate-500">{students.length} students in the selected class · {selectedIds.length} selected</p></div>
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700"><input type="checkbox" checked={students.length > 0 && selectedIds.length === students.length} onChange={event => setSelectedIds(event.target.checked ? students.map(item => item.id) : [])}/>Select all</label>
              </div>
              {loading ? <p className="p-6 text-center text-sm text-slate-500"><LoaderCircle className="mr-2 inline h-4 w-4 animate-spin"/>Loading…</p> : !classId ? <p className="p-6 text-center text-sm text-slate-500">Choose a class to load its students.</p> : students.length === 0 ? <p className="p-6 text-center text-sm text-slate-500">No students found in this class.</p> : (
                <div className="max-h-72 overflow-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-white text-slate-500"><tr><th className="w-10 px-3 py-2">Select</th><th className="px-3 py-2">Student ID</th><th className="px-3 py-2">Student name</th></tr></thead>
                    <tbody>{students.map(student => <tr key={student.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2"><input type="checkbox" checked={selectedIds.includes(student.id)} onChange={event => toggleStudent(student.id,event.target.checked)} aria-label={'Select ' + student.studentId}/></td>
                      <td className="px-3 py-2 font-mono">{student.studentId}</td>
                      <td className="px-3 py-2 font-medium text-slate-800">{[student.firstName,student.middleName,student.lastName].filter(Boolean).join(' ')}</td>
                    </tr>)}</tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="mt-5 flex justify-end border-t border-slate-200 pt-4">
              <button type="button" onClick={() => void submit()} disabled={loading || selectedIds.length === 0} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{loading ? <LoaderCircle className="h-4 w-4 animate-spin"/> : <CheckCircle2 className="h-4 w-4"/>}Generate PINs for {selectedIds.length} students</button>
            </div>
          </> : <>
            <p className="my-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 className="mr-2 inline h-5 w-5"/>{pinSlips.length} student PINs were reset. These PINs are shown once only; download the CSV or print them securely now.</p>
            <div className="my-4 flex flex-wrap gap-2">
              <button type="button" onClick={downloadPins} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold"><Download className="h-4 w-4"/>Download PIN CSV</button>
              <button type="button" onClick={() => window.print()} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white"><Printer className="h-4 w-4"/>Print PIN slips</button>
              <button type="button" onClick={close} className="min-h-10 rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold">Close</button>
            </div>
            <div className="bulk-pin-print grid grid-cols-1 gap-4 sm:grid-cols-2">{pinSlips.map(slip => <article key={slip.studentId} className="break-inside-avoid rounded-xl border-2 border-teal-700 p-5"><p className="text-xs font-bold uppercase tracking-wide text-teal-700">Student PIN slip</p><h3 className="mt-2 text-lg font-bold text-slate-900">{slip.studentName}</h3><p className="mt-1 text-xs text-slate-500">Student ID: {slip.studentId}</p><p className="mt-4 text-xs text-slate-500">New PIN</p><p className="font-mono text-3xl font-bold tracking-[0.3em] text-slate-900">{slip.newPin}</p></article>)}</div>
          </>}
        </section>
      </div>
    </>
  );
};
